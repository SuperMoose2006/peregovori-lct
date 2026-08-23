"""Адаптер: движок переговоров как OpenAI-совместимая модель для OpenTalking.

ЗАЧЕМ ИМЕННО ТАК. OpenTalking — готовый realtime-стек: STT, TTS, WebRTC,
перебивание, сессии, семь рендереров аватара. Единственное, чего он не знает, —
что отвечать. Он берёт ответ у OpenAI-совместимого LLM:

    POST {base_url}/chat/completions   {"model", "messages", "stream": true}
    ← SSE: data: {"choices":[{"delta":{"content": "…"}}]}
    (opentalking/providers/llm/openai_compatible/adapter.py)

Значит самый тонкий возможный шов — выставить НАШ движок этим самым эндпоинтом.
OpenTalking не меняется НИ НА СТРОКУ: меняется только `OPENTALKING_LLM_BASE_URL`.

    OpenTalking ──chat/completions──► этот адаптер ──► движок переговоров
                                                       (детерминированный)
                                          │
                                          └──► ИИ формулирует реплику

ПОЧЕМУ БЕЗ СЕССИЙ. OpenTalking присылает только `messages` — своего id сессии в
теле запроса нет. Городить сопоставление не нужно: наш движок это чистая функция
от (сценарий, порядок ходов), и реплей уже используется в «а что если».
Поэтому состояние восстанавливается проигрыванием всех реплик игрока из истории.
Тот же приём, та же гарантия: одинаковый ввод — одинаковый результат.

КАК ВЫБИРАЕТСЯ СЦЕНАРИЙ. Через имя модели: `negotiation/supplier`. Это штатный
параметр OpenTalking (`OPENTALKING_LLM_MODEL`), настраивается на сессию и не
требует ни нового поля в протоколе, ни патча upstream.
"""

from __future__ import annotations

import json
import time
import uuid
from typing import Any, AsyncIterator

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, StreamingResponse

from app import engine, views

router = APIRouter(tags=["opentalking"])

DEFAULT_SCENARIO = "supplier"
DEFAULT_LANG = "ru"


def _parse_model(model: str) -> tuple[str, str]:
    """`negotiation/supplier` или `negotiation/supplier:en` → (сценарий, язык)."""
    raw = (model or "").split("/", 1)[-1]
    sid, _, lang = raw.partition(":")
    sid = sid.strip() or DEFAULT_SCENARIO
    if engine.by_id(sid) is None:
        sid = DEFAULT_SCENARIO
    return sid, (lang.strip() or DEFAULT_LANG)


def _player_moves(messages: list[dict[str, Any]]) -> list[str]:
    """Реплики игрока по порядку. `system` игнорируем: персона и правила живут в
    сценарии движка, а не в промпте OpenTalking."""
    out: list[str] = []
    for m in messages or []:
        if m.get("role") != "user":
            continue
        c = m.get("content")
        if isinstance(c, str):
            t = c.strip()
        elif isinstance(c, list):  # мультимодальная форма OpenAI
            t = " ".join(p.get("text", "") for p in c if isinstance(p, dict)).strip()
        else:
            t = ""
        if t:
            out.append(t[:800])
    return out


def play(scenario_id: str, lang: str, moves: list[str]) -> dict:
    """Проиграть всю историю с нуля и вернуть реплику оппонента на последний ход.

    Проигрывание с чистой сессии каждый раз — не расточительность, а гарантия:
    никакого общего состояния между запросами, а значит и никакой рассинхронизации,
    если OpenTalking повторит запрос или откроет вторую сессию.
    """
    sess = engine.create_session(scenario_id, lang)
    result = None
    for t in moves:
        sess.turn += 1
        result = engine.apply_move(sess, engine.analyze(t), t)
    if result is None:  # ходов ещё не было — это приветствие
        return {"line": views.greeting_line(sess, lang), "state": views.state_view(sess).model_dump(),
                "closed": False}
    line = engine.render_line(sess, result.reaction, result.closed)
    return {"line": line, "state": views.state_view(sess).model_dump(), "closed": result.closed}


def _chunk(cid: str, model: str, content: str | None, finish: str | None = None) -> str:
    delta: dict[str, Any] = {} if content is None else {"content": content}
    payload = {
        "id": cid, "object": "chat.completion.chunk", "created": int(time.time()),
        "model": model,
        "choices": [{"index": 0, "delta": delta, "finish_reason": finish}],
    }
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


async def _stream(cid: str, model: str, text: str) -> AsyncIterator[str]:
    # Режем на слова: OpenTalking нарезает поток на фразы для синтеза, и ему
    # нужен именно поток, а не один кусок. Разделитель приклеиваем к слову,
    # иначе на стыке чанков теряются пробелы.
    yield _chunk(cid, model, None)          # первый чанк — открывающий, без текста
    buf = ""
    for word in text.split(" "):
        buf += word + " "
        if len(buf) >= 12:
            yield _chunk(cid, model, buf)
            buf = ""
    if buf:
        yield _chunk(cid, model, buf)
    yield _chunk(cid, model, None, finish="stop")
    yield "data: [DONE]\n\n"


@router.post("/v1/chat/completions")
async def chat_completions(request: Request) -> Any:
    body = await request.json()
    model = body.get("model") or f"negotiation/{DEFAULT_SCENARIO}"
    scenario_id, lang = _parse_model(model)
    moves = _player_moves(body.get("messages") or [])

    turn = play(scenario_id, lang, moves)
    text = turn["line"]
    cid = f"chatcmpl-{uuid.uuid4().hex[:24]}"

    if body.get("stream"):
        return StreamingResponse(
            _stream(cid, model, text),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )
    return JSONResponse({
        "id": cid, "object": "chat.completion", "created": int(time.time()), "model": model,
        "choices": [{"index": 0, "message": {"role": "assistant", "content": text},
                     "finish_reason": "stop"}],
        "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0},
    })


@router.get("/v1/models")
async def list_models() -> dict:
    """OpenTalking сюда не ходит, но клиенты OpenAI-совместимых API ходят —
    пусть список сценариев будет видно как список моделей."""
    return {"object": "list", "data": [
        {"id": f"negotiation/{sc.id}", "object": "model", "owned_by": "dialog"}
        for sc in engine.SCENARIOS
    ]}
