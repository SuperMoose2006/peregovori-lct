"""main.py — FastAPI app: WebSocket turn protocol (+ REST fallback).

Wires together the three isolated layers behind the protocol contract:
  engine (deterministic state + scoring)  →  source of truth
  ai.graph.run_opponent (LangGraph)        →  in-character line, or None
  protocol (Pydantic schemas)              →  wire format

Engine↔protocol adaptation lives in app.views (the ONLY place coupled to engine
internals), so this file stays stable as the engine evolves.
"""

from __future__ import annotations

import asyncio
import logging
import os
import sys
from contextlib import asynccontextmanager
from pathlib import Path


def _load_dotenv() -> None:
    """Load backend/.env (gitignored) so secrets like OPENAI_API_KEY stay out of
    shell history and command lines. Existing env vars always win."""
    env_path = Path(__file__).resolve().parents[1] / ".env"
    if not env_path.is_file():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, val = line.split("=", 1)
        os.environ.setdefault(key.strip(), val.strip().strip('"').strip("'"))


_load_dotenv()

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app import engine
from app.session import store
from app import views
from app.protocol import CourseCoachMsg, ScenarioView, StateView, WhatIfMsg

@asynccontextmanager
async def _lifespan(_app: FastAPI):
    """Пул соединений к OpenRouter живёт столько же, сколько процесс.

    Держать его открытым — не микрооптимизация: холодное TLS-рукопожатие к
    OpenRouter стоит сотни миллисекунд, и они видны напрямую в критическом пути
    судьи. Закрываем на shutdown, иначе `uvicorn --reload` течёт сокетами.
    """
    yield
    from app.providers.openrouter import chat as orchat
    await orchat.aclose()


def _voice_describe() -> str:
    """Кто РЕАЛЬНО распознаёт речь в голосовом режиме.

    В `models.asr` лежит модель запасного пути (chat-completions через
    OpenRouter). После перевода голоса на realtime-сессию OpenAI это поле стало
    ложным: health называл gemini, а слушал gpt-4o-mini-transcribe. Слой,
    который «выглядит настоящим, а внутри другой», — ровно то состояние,
    которого в продукте не бывает; на демо должно быть видно, кто слушает.
    """
    import os

    from app.perception.realtime_voice import MODEL as RT_MODEL, VAD_SILENCE_MS
    from app.providers.routing import model_for

    if os.getenv("NEGO_VOICE", "").strip().lower() == "classic":
        return f"classic (ASR {model_for('asr')} файлом, VAD свой)"
    if os.getenv("OPENAI_REALTIME_KEY", "").strip():
        return f"openai-realtime ({RT_MODEL}, VAD {VAD_SILENCE_MS} мс, потоком)"
    return f"classic (ASR {model_for('asr')} файлом, VAD свой) — ключа realtime нет"


def _tts_describe() -> str | None:
    """Кто сейчас говорит. Тот же порядок, что в endpoint.py — иначе health
    рассказывал бы про одного провайдера, а звучал бы другой."""
    from app.providers.tts.edge import EdgeTTS
    from app.providers.tts.openai_speech import OpenAISpeechTTS
    for provider in (OpenAISpeechTTS(), EdgeTTS()):
        if provider.available():
            return provider.describe()
    return None


app = FastAPI(title="Диалог — Negotiation Simulator API", lifespan=_lifespan)

# --------------------------------------------------------------------- доступ
#
# ПОЧЕМУ ЗАМОК ВООБЩЕ ЕСТЬ. На localhost гейтвей открыт — и это правильно: так
# он и разрабатывается. Но у машины публичный адрес, и как только он выставлен
# наружу по HTTPS, любой прохожий может жечь ключ OpenRouter, который лежит в
# .env рядом. Поэтому: пароль задан переменной → внешние запросы просят его,
# переменная пуста → поведение ровно прежнее, ничего не ломается.
#
# Локальные обращения НЕ проверяются: через них ходят OpenTalking (:8210),
# скриншотные прогоны и сам фронтенд при разработке. Замок стоит на входе с
# улицы, а не между комнатами.
_HTTP_PASSWORD = os.getenv("NEGO_HTTP_PASSWORD", "").strip()
_LOCAL_HOSTS = {"127.0.0.1", "::1", "localhost"}


@app.middleware("http")
async def _gate(request, call_next):
    if _HTTP_PASSWORD and (request.client.host if request.client else "") not in _LOCAL_HOSTS:
        import base64 as _b64
        import hmac as _hmac
        header = request.headers.get("authorization", "")
        ok = False
        if header.startswith("Basic "):
            try:
                _, _, given = _b64.b64decode(header[6:]).decode().partition(":")
                ok = _hmac.compare_digest(given, _HTTP_PASSWORD)
            except Exception:
                ok = False
        if not ok:
            from starlette.responses import Response as _Resp
            return _Resp(status_code=401, headers={"WWW-Authenticate": 'Basic realm="Dialog"'})
        # HTTP-middleware НЕ ВИДИТ веб-сокет: у него другой scope, и `/v1/realtime`
        # остался бы открытым настежь — а это самый дорогой вход, он ходит в
        # модели. Браузер не умеет слать заголовок Authorization при рукопожатии
        # сокета, зато шлёт куки того же origin. Поэтому успешная проверка
        # оставляет метку, а сокет проверяет её.
        response = await call_next(request)
        response.set_cookie("dlg_ok", _ws_ticket(), httponly=True, samesite="lax", max_age=86400)
        return response
    return await call_next(request)


def _ws_ticket() -> str:
    """Метка «этот браузер уже назвал пароль». Производная от пароля, а не он сам."""
    import hashlib
    return hashlib.sha256(("dlg|" + _HTTP_PASSWORD).encode()).hexdigest()[:32]


def ws_allowed(websocket: "WebSocket") -> bool:
    """Пускать ли соединение. Локальные — всегда: через них ходит OpenTalking."""
    if not _HTTP_PASSWORD:
        return True
    host = websocket.client.host if websocket.client else ""
    if host in _LOCAL_HOSTS:
        return True
    import hmac as _hmac
    return _hmac.compare_digest(websocket.cookies.get("dlg_ok", ""), _ws_ticket())


# CORS РАЗНЫЙ ДЛЯ СТЕНДА И ДЛЯ РАЗРАБОТКИ, и это не перестраховка.
#
# `allow_origins=["*"]` заводили ради vite на другом порту — и он же уезжал на
# стенд, смотрящий в интернет. Куки там `samesite=lax`, а `allow_credentials` не
# включён, поэтому браузер чужого сайта аутентифицированный запрос и так не
# отправит; но разрешение «любому origin читать наши ответы» на стенде не нужно
# НИКОМУ, а объяснять, почему оно безопасно, придётся каждому, кто посмотрит.
#
# Пароль задан → стенд: пускаем только свои origin. Пароль пуст → разработка:
# как было.
_DEV_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173",
                "http://localhost:5199", "http://127.0.0.1:5199",
                "http://localhost:8010", "http://127.0.0.1:8010"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_DEV_ORIGINS if _HTTP_PASSWORD else ["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

MAX_TURNS = 12


def _build_fingerprint() -> dict:
    """Отпечаток кода, который отвечает ПРЯМО СЕЙЧАС, а не лежит на диске."""
    from app.course.bank import BANK
    from app.engine.scenarios import SCENARIOS
    from app.engine.campaigns import CAMPAIGNS
    return {
        "exercises": len(BANK),
        "scenarios": len(SCENARIOS),
        "campaigns": len(CAMPAIGNS),
    }


@app.get("/api/health")
def health() -> dict:
    """Проба живости. Фронтенд по ней решает: realtime или офлайн-ядро.

    Раскладка моделей по ролям здесь не для красоты: на демо всегда должно быть
    видно, какой моделью сейчас говорит оппонент. Молчаливая подмена — самый
    неприятный способ узнать, что реплики стали хуже.
    """
    from app.orchestrator.judge import judge_enabled
    from app.providers.openrouter import chat as orchat
    from app.providers.routing import describe as describe_models
    from app.providers.tts.edge import EdgeTTS

    return {
        "ok": True,
        # ЧЕМ ЭТО ОКУПАЕТСЯ. Шлюз — долгоживущий процесс: тот, что раздавал
        # демо, крутился двое с половиной суток и отвечал кодом позавчерашнего
        # дня. Обходчик исправно ходил по нему и рапортовал про сборку, которой
        # уже не существовало. Отпечаток курса — самая быстрая улика: банк
        # растёт почти каждый день, и число упражнений мгновенно показывает,
        # свежий ли процесс. Сверять его — работа прибора, а не человека.
        "build": _build_fingerprint(),
        "cloud_ai": orchat.available(),
        "judge": judge_enabled(),
        "models": describe_models(),
        # Правда о синтезе: на демо должно быть видно, чей это голос.
        "tts": _tts_describe(),
        # Кто слушает: realtime-сессия или запасной путь файлом.
        "voice": _voice_describe(),
    }


@app.get("/api/scenarios")
def scenarios(lang: str = "ru") -> dict:
    lang = "en" if lang == "en" else "ru"
    return {"scenarios": [views.scenario_view(s, lang).model_dump() for s in engine.SCENARIOS]}


@app.get("/api/campaigns")
def campaigns(lang: str = "ru") -> dict:
    from app.engine.campaigns import CAMPAIGNS
    lang = "en" if lang == "en" else "ru"
    return {"campaigns": [views.campaign_view(c, lang).model_dump() for c in CAMPAIGNS]}


@app.get("/api/daily")
def daily(lang: str = "ru", day: str = "") -> dict:
    """Стол дня — один и тот же у всех, каждый день новый.

    `day` (ISO-дата) принимается ЧУЖИМ: часовой пояс знает браузер, а не
    сервер. Без него сервер отвечает по своему UTC-сегодня, и это осознанно
    хуже: игрок в Владивостоке получил бы вчерашний стол. Дату из запроса не
    проверяем на «сегодняшность» — стол дня чистая функция от даты, поэтому
    запрос про прошлый вторник законен и полезен (так его смотрит тест).
    """
    from datetime import date as _date
    from app.engine.daily import daily_table

    lang = "en" if lang == "en" else "ru"
    try:
        d = _date.fromisoformat(day) if day else _date.today()
    except ValueError:
        d = _date.today()

    table = daily_table(d)
    sc = engine.by_id(table.scenario_id)
    return {
        "day": table.day,
        "scenario": views.scenario_view(sc, lang).model_dump(),
        "modifier": {
            "id": table.modifier.id,
            "label": table.modifier.label[lang],
            "note": table.modifier.note[lang],
            "max_turns": table.modifier.max_turns,
            "trust": table.modifier.trust,
            "tension": table.modifier.tension,
        },
    }


# ---- "А что если…" deterministic what-if replay -----------------------------
# The engine is a pure function of (scenario, ordered moves): identical inputs
# give byte-identical state. So we can re-run one pivotal turn with a BETTER line
# and show exactly how the future diverges. No LLM here — the templated
# render_line keeps it instant and reproducible (NEGO_AI=off style), regardless
# of the configured AI backend.

MAX_WHATIF_MOVES = 24     # cap replay length (a game is <= 12 turns anyway)
# Предел реплики в «что если». Меньше, чем предел хода по сокету
# (realtime.session.MAX_TURN_CHARS): там накапливается целый ход, здесь приходит
# одна переписанная реплика.
MAX_WHATIF_TEXT = 800


def _whatif_branch(scenario_id: str, lang: str, prefix: list[str], branch_text: str) -> dict:
    """Replay `prefix` on a FRESH session, then apply one `branch_text` move and
    capture the outcome. Replaying from scratch per branch guarantees the two
    branches share no state — determinism by construction.

    The per-turn sequence mirrors the WS loop exactly (increment turn → analyze →
    apply_move) so a branch that re-uses the original text reproduces the real
    play bit-for-bit, including render_line's turn-seeded line pick."""
    sess = engine.create_session(scenario_id, lang)
    for t in prefix:
        sess.turn += 1
        engine.apply_move(sess, engine.analyze(t), t)
    sess.turn += 1
    analysis = engine.analyze(branch_text)
    result = engine.apply_move(sess, analysis, branch_text)
    line = engine.render_line(sess, result.reaction, result.closed)
    return {
        "text": branch_text,
        "analysis": views.analysis_view(analysis).model_dump(),
        "deltas": views.deltas_view(result).model_dump(),
        "state": views.state_view(sess).model_dump(),
        "opponent_line": line,
    }


@app.post("/api/course/coach")
async def course_coach(body: CourseCoachMsg) -> dict:
    """Комментарий тренера к свободному ответу упражнения.

    ЧТО ЭТО НЕ ДЕЛАЕТ: не решает, зачтено ли упражнение. Зачёт — детерминированный
    предикат над `analyze()`, он уже отработал на клиенте. Здесь ИИ добавляет одну
    подсказку по смыслу — то же самое, что судья делает в партии, и через тот же
    промпт, оплаченный живым бейк-оффом.

    Судья выключен, ключа нет, сеть легла, модель ответила мусором → `note: null`,
    и экран просто не показывает карточку тренера. Курс от этого не ломается.
    """
    from app.course.bank import BY_ID as COURSE_BY_ID
    from app.orchestrator.judge import judge_turn

    item = COURSE_BY_ID.get(body.exerciseId)
    if item is None or item.get("type") != "freeform":
        raise HTTPException(status_code=400, detail="unknown exercise")

    lang = "en" if body.lang == "en" else "ru"
    text = (body.text or "")[:MAX_WHATIF_TEXT]
    if not text.strip():
        return {"note": None, "techniques": []}

    sc = engine.by_id(item.get("scenario_id") or "") if item.get("scenario_id") else None
    context = item["prompt"][lang]
    if sc is not None:
        context = f"{sc.briefing[lang]} — {context}"
    interests = sc.hidden_interests[lang] if sc is not None else None
    secondary = ([(s.id, s.label[lang]) for s in sc.secondary_issues]
                 if sc is not None and sc.secondary_issues else None)

    judgement = await judge_turn(context, text, lang, interests, secondary)
    if not judgement:
        return {"note": None, "techniques": []}
    return {"note": judgement.get("note") or None,
            "techniques": judgement.get("techniques") or []}


@app.post("/api/whatif")
def whatif(body: WhatIfMsg) -> dict:
    lang = "en" if body.lang == "en" else "ru"
    if engine.by_id(body.scenarioId) is None:
        raise HTTPException(status_code=400, detail="unknown scenario")

    # Truncate player text like the live turn loop does (defensive, deterministic).
    moves = [(m or "")[:MAX_WHATIF_TEXT] for m in body.moves][:MAX_WHATIF_MOVES]
    alt_text = (body.altText or "")[:MAX_WHATIF_TEXT]

    if not (0 <= body.turnIndex < len(moves)):
        raise HTTPException(status_code=400, detail="turnIndex out of range")

    prefix = moves[: body.turnIndex]          # moves 0..turnIndex-1 (shared pre-turn state)
    original = _whatif_branch(body.scenarioId, lang, prefix, moves[body.turnIndex])
    alternative = _whatif_branch(body.scenarioId, lang, prefix, alt_text)
    return {"turnIndex": body.turnIndex, "original": original, "alternative": alternative}




# ---------------------------------------------------------------------------
# Единственная дверь в партию. Прежняя ручка `/ws` («запрос-ответ») удалена
# вместе с графом LangGraph, который её обслуживал: её покрытие переехало в
# tests/test_realtime_integration.py, а сам протокол — в realtime/events.py.
# ---------------------------------------------------------------------------

# ---- OpenTalking: движок как OpenAI-совместимая модель -----------------------
# Тонкий шов к upstream-стеку (.upstream/opentalking). Он берёт ответы у
# OpenAI-совместимого LLM — значит достаточно им прикинуться, и весь его
# realtime (STT, TTS, WebRTC, перебивание, аватар) работает поверх нашего
# движка БЕЗ единой правки в его коде. См. adapters/opentalking_negotiation.py
# и docs/upstream-patches.md.
_ADAPTERS = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
if _ADAPTERS not in sys.path:
    sys.path.insert(0, _ADAPTERS)
try:
    from adapters.opentalking_negotiation import router as _opentalking_router
    app.include_router(_opentalking_router)
except Exception as _exc:  # адаптер опционален: без него продукт работает как раньше
    logging.getLogger(__name__).warning("OpenTalking adapter not mounted: %s", _exc)


@app.websocket("/v1/realtime")
async def realtime(websocket: WebSocket) -> None:
    if not ws_allowed(websocket):
        await websocket.close(code=4401)   # 4401: «назовите пароль на странице»
        return
    from app.realtime.endpoint import realtime_ws
    await realtime_ws(websocket)


# ---- Production: serve the built SPA (single-process deploy) -----------------
# In dev the Vite server serves the frontend and proxies /ws here, so this mount
# is a no-op until `frontend/dist` exists. API/WS routes above always win.
# Корень монорепо: app/ → services/gateway/ → services/ → LCT/.
# Считаем от файла, а не от cwd: uvicorn запускают из разных мест, а
# после переезда backend/ → services/gateway/ путь стал на уровень глубже.
_REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
_DIST = os.path.join(_REPO_ROOT, "frontend", "dist")
if os.path.isdir(_DIST):
    app.mount("/assets", StaticFiles(directory=os.path.join(_DIST, "assets")), name="assets")

    @app.get("/{full_path:path}")
    def spa(full_path: str):  # SPA fallback for client-side routes
        candidate = os.path.join(_DIST, full_path)
        if full_path and os.path.isfile(candidate):
            return FileResponse(candidate)
        return FileResponse(os.path.join(_DIST, "index.html"))
