"""judge.py — семантический судья на асинхронном пути.

Тот же судья, что и в `app/ai/judge.py`, но через асинхронного провайдера
OpenRouter. Промпт и — что важнее — **валидация** переиспользуются оттуда
целиком (`build_prompts`, `parse_judgement`): закрытый словарь приёмов,
зажим балла в 0..100 и проверка индекса интереса оплачены живым бейк-оффом
(docs/model-bakeoff.md). Переписывать их под новый транспорт означало бы
выбросить эту работу и заново собрать те же грабли.

ПОЧЕМУ СУДЬЯ КРИТИЧЕН ДЛЯ ЗАДЕРЖКИ. Он стоит в критическом пути: движок не
может посчитать ход, пока не получил балл, а оппонент не может отвечать, пока
движок не посчитал ход. Каждая секунда здесь — секунда тишины в разговоре.
Отсюда два решения: (1) отдельная быстрая модель через `role="judge"`,
(2) жёсткий бюджет времени — не дождались, идём по детерминированному
keyword-пути движка, как в офлайне.

ВТОРАЯ ПОПЫТКА. Синхронная версия при неудачном разборе JSON пробует ещё раз.
Здесь ретрай тоже есть, но только если остался бюджет: лучше отдать ход по
keyword-баллу, чем задержать ответ оппонента ещё на секунду.
"""

from __future__ import annotations

import asyncio
import os
import time
from typing import Optional

from app.ai.judge import build_prompts, parse_judgement
from app.providers.openrouter import chat as orchat


def judge_enabled() -> bool:
    """Живой ли судья. По умолчанию — да, если есть облачный инференс.

    Отличие от синхронной версии: там дефолт зависел от того, какой бэкенд
    выбран (`cli`/`tmux` слишком медленные для пер-ходового вызова). Здесь
    бэкенд всегда сетевой и быстрый, поэтому семантика по умолчанию включена —
    это и есть рекомендованный профиль.
    """
    v = os.environ.get("NEGO_JUDGE", "").strip().lower()
    if v in ("1", "on", "true", "yes"):
        return True
    if v in ("0", "off", "false", "no"):
        return False
    return orchat.available()


#: Бюджет судьи. Подобран как компромисс: медленнее — и пауза между репликами
#: перестаёт быть похожей на человеческую заминку.
JUDGE_BUDGET_S = float(os.getenv("NEGO_JUDGE_BUDGET_S", "6.0"))


async def judge_turn(context: str, player_text: str, lang: str = "ru",
                     interests: Optional[list] = None,
                     secondary: Optional[list] = None,
                     task: Optional[dict] = None) -> Optional[dict]:
    """Оценить реплику по смыслу. None → движок берёт keyword-балл."""
    if not (player_text or "").strip() or not judge_enabled():
        return None

    system, user = build_prompts(context, player_text, lang, interests, secondary, task)
    deadline = time.perf_counter() + JUDGE_BUDGET_S

    for attempt in (1, 2):
        remaining = deadline - time.perf_counter()
        if remaining <= 0.2:
            return None
        try:
            raw = await asyncio.wait_for(
                orchat.complete(system, user, role="judge", max_tokens=300,
                                temperature=0.2, raw=True),
                timeout=remaining,
            )
        except (asyncio.TimeoutError, asyncio.CancelledError):
            return None
        except Exception:
            return None

        parsed = parse_judgement(raw or "", lang, interests, secondary)
        if parsed is not None:
            return parsed
        if attempt == 2:
            return None
    return None
