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

import os
import re
import httpx
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, Response, StreamingResponse

from app import engine, views

router = APIRouter(tags=["opentalking"])

DEFAULT_SCENARIO = "supplier"
DEFAULT_LANG = "ru"

OPENROUTER = "https://openrouter.ai/api/v1"
_DATA_URL = re.compile(r"^data:[^;]+;base64,", re.I)
TRANSCRIBE_PROMPT = (
    "Транскрибируй речь дословно. Верни ТОЛЬКО текст сказанного, без пояснений, "
    "без кавычек, без ответа собеседнику. Если речи нет — верни пустую строку."
)


def _is_audio(messages: list[dict[str, Any]]) -> bool:
    for m in messages or []:
        c = m.get("content")
        if isinstance(c, list) and any(
            isinstance(p, dict) and p.get("type") == "input_audio" for p in c
        ):
            return True
    return False


async def _proxy_transcription(body: dict[str, Any]) -> Any:
    """Распознавание речи: переупаковать запрос OpenTalking под OpenRouter.

    ЗАЧЕМ ЭТОТ ШОВ ВООБЩЕ НУЖЕН. STT-адаптер OpenTalking умеет протокол
    `chat_completions` — ровно тот, которым работает распознавание у OpenRouter,
    отдельного `/audio/transcriptions` там нет. Но аудио он кладёт как `data:`
    URL, а OpenRouter принимает только СЫРОЙ base64. Проверено вживую: сырой —
    200 и верная расшифровка, data-URL — 400 от провайдера.

    Разница ровно в префиксе. Патчить ради неё чужой репозиторий нельзя: по
    правилу «если изменение переносится в адаптер — перенеси». Поэтому префикс
    срезается здесь, а `.upstream/opentalking` остаётся нетронутым.
    """
    key = os.environ.get("OPENAI_API_KEY", "")
    msgs = []
    for m in body.get("messages") or []:
        c = m.get("content")
        if isinstance(c, list):
            parts = []
            for p in c:
                if isinstance(p, dict) and p.get("type") == "input_audio":
                    ia = dict(p.get("input_audio") or {})
                    ia["data"] = _DATA_URL.sub("", str(ia.get("data", "")))
                    parts.append({"type": "input_audio", "input_audio": ia})
                else:
                    parts.append(p)
            msgs.append({**m, "content": parts})
        else:
            msgs.append(m)
    # Вторая несовместимость, тоньше первой. STT-адаптер OpenTalking кладёт в
    # сообщение ТОЛЬКО аудио, без текстовой инструкции: он рассчитан на модель,
    # которая по определению транскрибирует. Гемини — обычная чат-модель: получив
    # голос без задания, она ОТВЕЧАЕТ собеседнику вместо расшифровки. Проверено:
    # на «Наше предложение — сто рублей» вернулось «Приятно познакомиться,
    # спасибо за предложение…». Для распознавания это мусор.
    # Инструкцию добавляем здесь же, а не в их коде.
    for m in msgs:
        c = m.get("content")
        if isinstance(c, list) and any(
            isinstance(p, dict) and p.get("type") == "input_audio" for p in c
        ):
            c.insert(0, {"type": "text", "text": TRANSCRIBE_PROMPT})
            break
    payload = {"model": body.get("model") or "google/gemini-3.7-flash", "messages": msgs}
    async with httpx.AsyncClient(timeout=httpx.Timeout(120.0)) as client:
        r = await client.post(
            f"{OPENROUTER}/chat/completions",
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
            json=payload,
        )
    return JSONResponse(status_code=r.status_code, content=r.json())


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
        return {"line": views.greeting_line(sess, lang), "facts": None,
                "state": views.state_view(sess).model_dump(), "closed": False}
    line = engine.render_line(sess, result.reaction, result.closed)
    # facts — то же, что видит оппонент в нашем оркестраторе: реакция движка,
    # цена, вскрытые интересы. Модель формулирует, но не решает.
    facts = views.build_facts(sess, result)
    facts["fallback"] = line
    return {"line": line, "facts": facts,
            "state": views.state_view(sess).model_dump(), "closed": result.closed}


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


async def _stream_ai(cid: str, model: str, facts: dict, templated: str) -> AsyncIterator[str]:
    """Реплику формулирует модель, но озвучивается только то, что прошло санитайзер.

    РАЗНИЦА С НАШИМ ПРОТОКОЛОМ, И ПОЧЕМУ ОНА ЗДЕСЬ ВАЖНА. У себя мы стримим сырые
    токены, а судит реплику целиком `response.done` — клиент заменяет пузырь, и
    цена ошибки нулевая. У OpenTalking такого шва нет: каждая законченная фраза
    уходит в синтез сразу, и сказанное вслух уже не отозвать. Поэтому санитайзер
    работает пофразно и ДО отправки. Отвергнутая фраза просто не звучит; если не
    уцелело ничего — остаётся шаблон движка, который есть всегда.
    """
    from app.ai.prompts import build_prompts
    from app.ai.sanitize import sanitize
    from app.providers.openrouter import chat as orchat
    from app.vendor.olv.sentence_divider import SentenceDivider

    yield _chunk(cid, model, None)
    system, user = build_prompts(facts)
    divider = SentenceDivider(faster_first_response=True)
    spoken = False

    async def tokens():
        async for chunk in orchat.stream(system, user, role="opponent",
                                         max_tokens=220, temperature=0.8):
            yield chunk

    try:
        async for sentence in divider.process_stream(tokens()):
            phrase = sanitize((sentence.text or "").strip())
            if not phrase:
                continue
            spoken = True
            yield _chunk(cid, model, phrase + " ")
    except Exception:
        pass  # сеть отвалилась — ниже уйдёт шаблон, партия не ломается

    if not spoken:
        yield _chunk(cid, model, templated)
    yield _chunk(cid, model, None, finish="stop")
    yield "data: [DONE]\n\n"


@router.post("/v1/chat/completions")
async def chat_completions(request: Request) -> Any:
    body = await request.json()
    messages = body.get("messages") or []
    # Один эндпоинт обслуживает две роли OpenTalking: LLM и распознавание речи.
    # Различаются по содержимому — аудио в сообщении означает транскрипцию.
    if _is_audio(messages):
        return await _proxy_transcription(body)

    model = body.get("model") or f"negotiation/{DEFAULT_SCENARIO}"
    scenario_id, lang = _parse_model(model)
    moves = _player_moves(body.get("messages") or [])

    turn = play(scenario_id, lang, moves)
    text = turn["line"]
    cid = f"chatcmpl-{uuid.uuid4().hex[:24]}"

    if body.get("stream"):
        from app.providers.openrouter import chat as orchat
        # Без сети и без ключа игра идёт целиком на шаблонах движка — это не
        # деградация, а базовый режим продукта (инвариант 5 в CLAUDE.md).
        gen = (_stream_ai(cid, model, turn["facts"], text)
               if turn.get("facts") and orchat.available()
               else _stream(cid, model, text))
        return StreamingResponse(
            gen,
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )
    return JSONResponse({
        "id": cid, "object": "chat.completion", "created": int(time.time()), "model": model,
        "choices": [{"index": 0, "message": {"role": "assistant", "content": text},
                     "finish_reason": "stop"}],
        "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0},
    })


@router.post("/v1/audio/speech")
async def audio_speech(request: Request) -> Any:
    """Синтез речи: третья роль на том же шве, что реплики и распознавание.

    ПОЧЕМУ НЕ EDGE-TTS, КОТОРЫЙ СТОИТ У OPENTALKING ПО УМОЛЧАНИЮ. Бесплатный
    эндпоинт Microsoft кэширует уже произнесённый текст: повтор той же строки
    отдаёт первый звук за ~570 мс, НОВАЯ строка — за 2.0–4.6 с (12 замеров,
    медиана 1.4 с, половина хуже двух секунд). В тренажёре каждая реплика новая
    всегда, поэтому «быстрая» цифра из повторных замеров — самообман: живой путь
    видит только холодную ветку. Плюс срывы `NoAudioReceived` с повтором внутри
    их адаптера — один такой стоил 38 с.

    OpenRouter на тех же фразах даёт 1.4 с до первого байта и 1.9 с целиком,
    ровно, без хвостов. Предсказуемые 1.4 с лучше медианы 1.4 с с хвостом в 38.

    ЧТО ЗДЕСЬ КОНВЕРТИРУЕТСЯ. OpenTalking просит `response_format=pcm` и читает
    ответ как PCM16 моно на своей частоте. MiniMax отдаёт только mp3. Поэтому
    mp3 просим всегда, а декодирование и передискретизацию делаем тут — это
    ровно та работа, ради которой адаптер и существует.
    """
    body = await request.json()
    fmt = str(body.get("response_format") or "mp3").strip().lower()
    payload = {
        "model": body.get("model") or "minimax/speech-2.8-turbo",
        "input": body.get("input") or "",
        "voice": body.get("voice") or "female-shaonv",
        "response_format": "mp3",
    }
    key = os.getenv("OPENAI_API_KEY", "").strip()
    async with httpx.AsyncClient(timeout=httpx.Timeout(120.0)) as client:
        r = await client.post(f"{OPENROUTER}/audio/speech", json=payload,
                              headers={"Authorization": f"Bearer {key}"})
    if r.status_code >= 400:
        return JSONResponse({"error": {"message": r.text[:400], "code": r.status_code}},
                            status_code=r.status_code)
    if fmt != "pcm":
        return Response(content=r.content, media_type="audio/mpeg")

    rate = int(os.getenv("NEGO_TTS_PCM_RATE", "16000"))
    return Response(content=_mp3_to_pcm16(r.content, rate),
                    media_type=f"audio/pcm;rate={rate};channels=1")


def _mp3_to_pcm16(data: bytes, rate: int) -> bytes:
    """mp3 → сырой PCM16 моно. Системного ffmpeg на машине нет, поэтому PyAV,
    который несёт свои библиотеки (см. CLAUDE.md, заметки окружения)."""
    import io
    import av

    out = bytearray()
    with av.open(io.BytesIO(data)) as container:
        resampler = av.AudioResampler(format="s16", layout="mono", rate=rate)
        for frame in container.decode(audio=0):
            for res in resampler.resample(frame):
                out += bytes(res.planes[0])[: res.samples * 2]
    return bytes(out)


@router.get("/v1/models")
async def list_models() -> dict:
    """OpenTalking сюда не ходит, но клиенты OpenAI-совместимых API ходят —
    пусть список сценариев будет видно как список моделей."""
    return {"object": "list", "data": [
        {"id": f"negotiation/{sc.id}", "object": "model", "owned_by": "dialog"}
        for sc in engine.SCENARIOS
    ]}
