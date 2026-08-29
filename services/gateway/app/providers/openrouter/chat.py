"""chat.py — асинхронный клиент OpenRouter: стриминг и обычный ответ.

ЗАМЕНЯЕТ `ai/chat_models.py::OpenAIBackend`. Причина замены — не вкус, а модель
исполнения. Старый бэкенд синхронный (langchain-openai поверх requests), и
поэтому каждый вызов ИИ в асинхронном хендлере приходилось заворачивать в
`asyncio.to_thread`. В дуплексе одновременно живут судья, мозг оппонента, ASR и
зрение; гонять четыре потока ради четырёх сетевых запросов — это лишние
переключения контекста ровно там, где мы боремся за сотни миллисекунд.

ЧТО ПЕРЕНЕСЕНО ИЗ UPSTREAM. Настройки httpx-клиента взяты из TEN
(Apache-2.0 + дополнительные условия Agora (неконкуренция; разбор — docs/upstream-code-map.md §5), commit 2e56d965), `ai_agents/agents/ten_packages/extension/
ten_turn_detection/turn_detector.py:39-51`: http2, 100 соединений, 20
keep-alive, срок жизни 10 минут. Это не косметика — на холодном соединении
TLS-рукопожатие к OpenRouter стоит сотни миллисекунд, и в критическом пути
судьи они видны напрямую.

ЧТО СОХРАНЕНО ИЗ СТАРОГО КОДА. `sanitize()` из `ai/chat_models.py` — защита,
оплаченная живым бейк-оффом (docs/model-bakeoff.md): дешёвые модели отвечают
чужим алфавитом, ломают четвёртую стену и оборачивают реплику в markdown.
Переписывать её заново было бы ровно тем, чего задание велит избегать.
"""

from __future__ import annotations

import json
import os
from typing import AsyncIterator, Optional

import httpx

from app.ai.sanitize import sanitize  # проверенная санитизация — переиспользуем
from app.providers.routing import Role, model_for

_BASE_URL = "https://openrouter.ai/api/v1"

#: Один клиент на процесс. Пул соединений имеет смысл только если он общий:
#: клиент на вызов — это клиент без keep-alive, то есть TLS на каждый ход.
_client: Optional[httpx.AsyncClient] = None


def _api_key() -> str:
    return (os.getenv("OPENROUTER_API_KEY") or os.getenv("OPENAI_API_KEY") or "").strip()


def available() -> bool:
    """Есть ли облачный инференс. Ложь → вызывающий берёт шаблонный фолбэк.

    Игра обязана оставаться играбельной без сети, поэтому «недоступно» — это
    штатное состояние, а не ошибка.
    """
    return bool(_api_key()) and os.getenv("NEGO_AI", "").strip().lower() != "off"


def _get_client() -> httpx.AsyncClient:
    global _client
    if _client is None or _client.is_closed:
        _client = httpx.AsyncClient(
            base_url=_BASE_URL,
            timeout=httpx.Timeout(connect=5.0, read=60.0, write=10.0, pool=5.0),
            limits=httpx.Limits(max_connections=100, max_keepalive_connections=20,
                                keepalive_expiry=600.0),
            http2=True,
            follow_redirects=True,
            headers={
                "Authorization": f"Bearer {_api_key()}",
                # OpenRouter просит эти два заголовка для атрибуции трафика.
                # ТОЛЬКО ASCII: httpx кодирует заголовки в latin-1, и одно тире
                # «—» в названии роняет каждый запрос UnicodeEncodeError'ом.
                "HTTP-Referer": "https://github.com/lct/dialog",
                "X-Title": "Dialog Negotiation Trainer",
            },
        )
    return _client


async def aclose() -> None:
    """Закрыть пул (вызывается на shutdown FastAPI)."""
    global _client
    if _client is not None and not _client.is_closed:
        await _client.aclose()
    _client = None


def _payload(system: str, user: str, *, role: Role, stream: bool,
             max_tokens: int, temperature: float, model: str | None) -> dict:
    return {
        "model": model or model_for(role),
        "messages": [{"role": "system", "content": system},
                     {"role": "user", "content": user}],
        "max_tokens": max_tokens,
        "temperature": temperature,
        "stream": stream,
    }


async def complete(system: str, user: str, *, role: Role = "opponent",
                   max_tokens: int = 220, temperature: float = 0.8,
                   model: str | None = None, raw: bool = False) -> Optional[str]:
    """Обычный (нестриминговый) ответ. None — если ИИ недоступен или ответ мусорный.

    `raw=True` отключает санитизацию: она заточена под реплику персонажа и
    съела бы JSON, который возвращают судья и генератор сценариев.
    """
    if not available():
        return None
    try:
        r = await _get_client().post(
            "/chat/completions",
            json=_payload(system, user, role=role, stream=False,
                          max_tokens=max_tokens, temperature=temperature, model=model),
        )
        r.raise_for_status()
        text = (r.json()["choices"][0]["message"]["content"] or "").strip()
    except Exception:
        # Сеть, лимиты, кривой ответ — всё это штатные исходы. Игра продолжается
        # на шаблонном фолбэке движка, а не падает.
        return None
    return text or None if raw else sanitize(text)


async def stream(system: str, user: str, *, role: Role = "opponent",
                 max_tokens: int = 220, temperature: float = 0.8,
                 model: str | None = None) -> AsyncIterator[str]:
    """Токены по мере генерации.

    Чанки СЫРЫЕ: `sanitize()` судит реплику целиком и может её отвергнуть.
    Поэтому за стримом всегда идёт авторитетный `response.done` — клиент
    заменяет им накопленный пузырь. Правило унаследовано от текущего протокола
    и остаётся в силе (см. `realtime/events.py::response_done`).
    """
    if not available():
        return
    try:
        async with _get_client().stream(
            "POST", "/chat/completions",
            json=_payload(system, user, role=role, stream=True,
                          max_tokens=max_tokens, temperature=temperature, model=model),
        ) as r:
            r.raise_for_status()
            async for line in r.aiter_lines():
                if not line.startswith("data: "):
                    continue
                data = line[6:].strip()
                if data == "[DONE]":
                    break
                try:
                    delta = json.loads(data)["choices"][0].get("delta", {})
                except (json.JSONDecodeError, KeyError, IndexError):
                    # OpenRouter вставляет служебные комментарии в поток;
                    # пропустить кадр правильнее, чем оборвать реплику.
                    continue
                chunk = delta.get("content")
                if chunk:
                    yield chunk
    except Exception:
        # Обрыв на середине — не катастрофа: оркестратор увидит короткий текст
        # и достроит его шаблонным фолбэком.
        return
