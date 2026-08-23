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


app = FastAPI(title="Диалог — Negotiation Simulator API", lifespan=_lifespan)

# Dev CORS: the Vite dev server runs on another origin.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

MAX_TURNS = 12


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
        "cloud_ai": orchat.available(),
        "judge": judge_enabled(),
        "models": describe_models(),
        "tts": EdgeTTS().describe() if EdgeTTS().available() else None,
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


# ---- "А что если…" deterministic what-if replay -----------------------------
# The engine is a pure function of (scenario, ordered moves): identical inputs
# give byte-identical state. So we can re-run one pivotal turn with a BETTER line
# and show exactly how the future diverges. No LLM here — the templated
# render_line keeps it instant and reproducible (NEGO_AI=off style), regardless
# of the configured AI backend.

MAX_WHATIF_MOVES = 24     # cap replay length (a game is <= 12 turns anyway)
MAX_WHATIF_TEXT = 800     # mirror the WS turn cap on player text


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
