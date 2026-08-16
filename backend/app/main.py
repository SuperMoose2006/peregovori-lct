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
import os
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app import engine
from app.session import store
from app.ai.graph import run_opponent_sync
from app.ai.chat_models import describe_mode
from app import views
from app.protocol import (
    StartMsg, TurnMsg, ScenarioView, StateView,
)

app = FastAPI(title="Диалог — Negotiation Simulator API")

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
    return {"ok": True, "ai": describe_mode()}


@app.get("/api/scenarios")
def scenarios(lang: str = "ru") -> dict:
    lang = "en" if lang == "en" else "ru"
    return {"scenarios": [views.scenario_view(s, lang).model_dump() for s in engine.SCENARIOS]}


@app.get("/api/campaigns")
def campaigns(lang: str = "ru") -> dict:
    from app.engine.campaigns import CAMPAIGNS
    lang = "en" if lang == "en" else "ru"
    return {"campaigns": [views.campaign_view(c, lang).model_dump() for c in CAMPAIGNS]}


async def _opponent_line(sess, result, templated: str) -> str:
    """Try the AI backend; fall back to the deterministic templated line.

    The AI call is a blocking subprocess (CLI) / network call (API); run it off
    the event loop so the WebSocket stays responsive (keepalive) during it.
    """
    try:
        facts = views.build_facts(sess, result)
        facts["fallback"] = templated
        out = await asyncio.to_thread(run_opponent_sync, facts)
        if out:
            return out
    except Exception:
        pass
    return templated


@app.websocket("/ws")
async def ws(websocket: WebSocket) -> None:
    await websocket.accept()
    session_id: str | None = None
    lang = "ru"
    try:
        while True:
            msg = await websocket.receive_json()
            mtype = msg.get("type")

            # ---- start ----------------------------------------------------
            if mtype == "start":
                data = StartMsg(**msg)
                lang = data.lang

                # "Своя сделка": generate an ephemeral scenario from the user's situation.
                if data.mode == "custom":
                    from app.ai.scenario_gen import generate_scenario
                    # Off the event loop: generation is a ~40s blocking CLI call.
                    gen = await asyncio.to_thread(generate_scenario, data.situation or "", lang)
                    if gen is None:
                        ai_off = describe_mode().startswith("off")
                        if ai_off:
                            msg = ("Режим «Своя сделка» требует включённого ИИ (NEGO_AI=cli или api)."
                                   if lang == "ru" else
                                   "Custom mode requires an AI backend (NEGO_AI=cli or api).")
                        else:
                            msg = ("Не удалось сгенерировать сценарий. Попробуйте переформулировать ситуацию."
                                   if lang == "ru" else
                                   "Couldn't generate a scenario. Try rephrasing the situation.")
                        await websocket.send_json({"type": "error", "message": msg})
                        continue
                    scenario_id = gen.id
                else:
                    scenario_id = data.scenarioId

                sess = engine.create_session(scenario_id, lang)
                # Campaign reputation carries into the next stage as a trust nudge.
                if data.reputation is not None:
                    views.apply_reputation(sess, data.reputation)
                session_id = store.new_id()
                store.put(session_id, sess)
                sc = engine.by_id(scenario_id)
                await websocket.send_json({
                    "type": "greeting",
                    "sessionId": session_id,
                    "scenario": views.scenario_view(sc, lang).model_dump(),
                    "state": views.state_view(sess).model_dump(),
                    "text": views.greeting_line(sess, lang),
                })

            # ---- turn -----------------------------------------------------
            elif mtype == "turn":
                data = TurnMsg(**msg)
                sess = store.get(session_id) if session_id else None
                if sess is None or sess.state.status != "active":
                    await websocket.send_json({"type": "error", "message": "no active session"})
                    continue
                text = (data.text or "")[:800]
                analysis = engine.analyze(text)
                sess.turn += 1
                result = engine.apply_move(sess, analysis)

                timeout = False
                if sess.state.status == "active" and sess.turn >= sess.max_turns:
                    sess.state.status = "breakdown"
                    result.closed = True
                    timeout = True

                sess.log.append({"role": "player", "text": text})
                templated = engine.render_line(sess, result.reaction, result.closed)
                reply = views.timeout_line(lang) if timeout else await _opponent_line(sess, result, templated)
                sess.log.append({"role": "opp", "text": reply})

                await websocket.send_json({
                    "type": "opponent",
                    "text": reply,
                    "analysis": views.analysis_view(analysis).model_dump(),
                    "deltas": views.deltas_view(result).model_dump(),
                    "state": views.state_view(sess).model_dump(),
                })
                if result.closed:
                    await websocket.send_json({
                        "type": "debrief",
                        "debrief": views.debrief_view(sess).model_dump(),
                    })

            # ---- hint -----------------------------------------------------
            elif mtype == "hint":
                sess = store.get(session_id) if session_id else None
                if sess is None:
                    await websocket.send_json({"type": "error", "message": "no active session"})
                    continue
                await websocket.send_json({"type": "hint", "text": views.compute_hint(sess, lang)})

            else:
                await websocket.send_json({"type": "error", "message": f"unknown message: {mtype}"})

    except WebSocketDisconnect:
        pass
    except Exception as exc:  # never crash the socket on a bad message
        try:
            await websocket.send_json({"type": "error", "message": str(exc)})
        except Exception:
            pass


# ---- Production: serve the built SPA (single-process deploy) -----------------
# In dev the Vite server serves the frontend and proxies /ws here, so this mount
# is a no-op until `frontend/dist` exists. API/WS routes above always win.
_DIST = os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "dist")
if os.path.isdir(_DIST):
    app.mount("/assets", StaticFiles(directory=os.path.join(_DIST, "assets")), name="assets")

    @app.get("/{full_path:path}")
    def spa(full_path: str):  # SPA fallback for client-side routes
        candidate = os.path.join(_DIST, full_path)
        if full_path and os.path.isfile(candidate):
            return FileResponse(candidate)
        return FileResponse(os.path.join(_DIST, "index.html"))
