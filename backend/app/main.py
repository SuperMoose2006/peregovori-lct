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
from app.ai.graph import run_opponent_sync, stream_opponent_sync, backend_streams
from app.ai.chat_models import describe_mode, ai_enabled
from app.ai.judge import judge_turn, judge_enabled
from app.ai.coach import suggest_line as coach_suggest
from app.ai.debriefer import summarize as debrief_summarize
from app import views
from app.protocol import (
    StartMsg, TurnMsg, ScenarioView, StateView, WhatIfMsg,
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


# Per-call ceilings on the AI layer, in seconds. The chat client's own timeout
# (NEGO_AI_TIMEOUT, 30s) applies to ONE call, and a turn makes two of them in
# series — judge, then opponent — so a bad minute could freeze the table for a
# full 60s with no way out. These caps bound what the PLAYER waits: past them we
# stop waiting and take the deterministic path, which always exists. The worker
# thread is left to finish and be discarded (a thread cannot be cancelled); the
# client timeout still ends it.
JUDGE_BUDGET = float(os.environ.get("NEGO_JUDGE_BUDGET", "12"))
OPPONENT_BUDGET = float(os.environ.get("NEGO_OPPONENT_BUDGET", "16"))
DEBRIEF_BUDGET = float(os.environ.get("NEGO_DEBRIEF_BUDGET", "18"))


async def _bounded(fn, *args, budget: float):
    """Run a blocking AI call off the loop, giving up after `budget` seconds."""
    try:
        return await asyncio.wait_for(asyncio.to_thread(fn, *args), timeout=budget)
    except Exception:  # TimeoutError included; CancelledError is a BaseException
        return None


async def _stream_opponent(facts: dict, send_chunk, budget: float) -> str | None:
    """Run the blocking token stream on a worker thread and hand each chunk to
    `send_chunk` on the event loop. Returns the finished (sanitized) line, or
    None to fall back.

    A thread cannot be cancelled, so the deadline is enforced on the WAIT: past
    it we stop consuming and answer with the templated line. Whatever partial
    text the player already saw is replaced by the authoritative `opponent`
    message that always follows.
    """
    loop = asyncio.get_running_loop()
    queue: asyncio.Queue = asyncio.Queue()
    END = object()  # a chunk is always a non-empty str, so this can't collide

    def on_chunk(chunk: str) -> None:
        loop.call_soon_threadsafe(queue.put_nowait, chunk)

    def work() -> str | None:
        try:
            return stream_opponent_sync(facts, on_chunk)
        finally:
            loop.call_soon_threadsafe(queue.put_nowait, END)

    worker = asyncio.ensure_future(asyncio.to_thread(work))
    deadline = loop.time() + budget
    try:
        while True:
            left = deadline - loop.time()
            if left <= 0:
                raise asyncio.TimeoutError
            item = await asyncio.wait_for(queue.get(), timeout=left)
            if item is END:
                break
            await send_chunk(item)
        return await asyncio.wait_for(worker, timeout=max(0.5, deadline - loop.time()))
    except Exception:
        worker.cancel()
        return None


async def _opponent_line(sess, result, templated: str, send_chunk=None) -> str:
    """Try the AI backend; fall back to the deterministic templated line.

    The AI call is a blocking subprocess (CLI) / network call (API); run it off
    the event loop so the WebSocket stays responsive (keepalive) during it.

    With `send_chunk` and a backend that can stream, the line arrives token by
    token instead of appearing as a block after several silent seconds. Backends
    that cannot stream (off / cli / tmux / sdk) take the same path as before.
    """
    try:
        facts = views.build_facts(sess, result)
        facts["fallback"] = templated
        if send_chunk is not None and backend_streams():
            out = await _stream_opponent(facts, send_chunk, OPPONENT_BUDGET)
        else:
            out = await _bounded(run_opponent_sync, facts, budget=OPPONENT_BUDGET)
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
                greet = views.greeting_line(sess, lang)
                # Campaign: the opponent references your reputation from prior stages.
                if data.mode == "campaign" and data.reputation is not None:
                    intro = views.reputation_intro(data.reputation, lang)
                    if intro:
                        greet = intro + " " + greet
                await websocket.send_json({
                    "type": "greeting",
                    "sessionId": session_id,
                    "scenario": views.scenario_view(sc, lang).model_dump(),
                    "state": views.state_view(sess).model_dump(),
                    "text": greet,
                    # so the client can badge coaching as semantic ("судит ИИ по смыслу")
                    "judge_active": judge_enabled(),
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

                # Semantic judge (option C): score the line by MEANING and match
                # the interest it targets. Off by default; engine still owns state.
                judge = None
                announced_phase = False
                if judge_enabled():
                    # Name the wait honestly. The judge runs BEFORE the opponent
                    # can say anything (the engine cannot score the move without
                    # it), so for these seconds the opponent is not "typing" —
                    # the judge is reading. Saying so turns dead time into the
                    # one moment that shows the product's differentiator.
                    await websocket.send_json({"type": "phase", "phase": "judging"})
                    announced_phase = True
                    try:
                        ctx, interests = views.judge_context(sess)
                        secondary = views.judge_secondary(sess)
                        judge = await _bounded(judge_turn, ctx, text, lang, interests, secondary,
                                               budget=JUDGE_BUDGET)
                    except Exception:
                        judge = None

                result = engine.apply_move(sess, analysis, text, judge=judge)

                timeout = False
                if sess.state.status == "active" and sess.turn >= sess.max_turns:
                    sess.state.status = "breakdown"
                    result.closed = True
                    timeout = True

                sess.log.append({"role": "player", "text": text, "judge": judge,
                                 "turn": sess.turn, "deltas": result.deltas})
                templated = engine.render_line(sess, result.reaction, result.closed)
                # The judge is done; from here the opponent really is composing.
                # Only worth saying if we announced the judging half — otherwise
                # there was no wait to re-label and this is pure noise.
                if announced_phase:
                    await websocket.send_json({"type": "phase", "phase": "replying"})

                async def send_chunk(chunk: str) -> None:
                    await websocket.send_json({"type": "opponent_delta", "chunk": chunk})

                reply = (views.timeout_line(lang) if timeout
                         else await _opponent_line(sess, result, templated, send_chunk))
                sess.log.append({"role": "opp", "text": reply})

                opp_payload = {
                    "type": "opponent",
                    "text": reply,
                    "analysis": views.analysis_view(analysis).model_dump(),
                    "deltas": views.deltas_view(result).model_dump(),
                    "state": views.state_view(sess).model_dump(),
                }
                if judge:  # semantic-judge presentation metadata (judge-cam)
                    if judge.get("note"):  # live per-turn coaching
                        opp_payload["coach"] = judge["note"]
                    # Techniques the judge RECOGNIZED in this line (localized labels).
                    opp_payload["coach_techniques"] = list(judge.get("techniques") or [])
                    # True when the line reads as low-meaning parroting / buzzword-spam
                    # (low semantic score) despite possibly tripping keyword lexicons →
                    # drives the struck-through "recognized a pattern, not meaning" chip.
                    opp_payload["coach_reject"] = int(judge.get("arg_score", 100)) < 35
                await websocket.send_json(opp_payload)
                if result.closed:
                    deb = views.debrief_view(sess).model_dump()
                    deb["turning_points"] = views.turning_points(sess)  # transcript-grounded
                    # The mentor's closing word narrates the scorecard above; it
                    # never changes it. Threaded like every other blocking AI call.
                    if ai_enabled():
                        dfacts = views.debrief_facts(sess, deb, lang)
                        note = await _bounded(debrief_summarize, dfacts, lang, budget=DEBRIEF_BUDGET)
                        if note:
                            deb["ai_verdict"] = note.get("verdict")
                            deb["ai_strength"] = note.get("strength")
                            deb["ai_growth"] = note.get("growth")
                    await websocket.send_json({"type": "debrief", "debrief": deb})

            # ---- hint -----------------------------------------------------
            elif mtype == "hint":
                sess = store.get(session_id) if session_id else None
                if sess is None:
                    await websocket.send_json({"type": "error", "message": "no active session"})
                    continue
                base_hint = views.compute_hint(sess, lang)
                payload = {"type": "hint", "text": base_hint}
                # With a live backend the coach turns that direction into a line
                # the player can actually send. Blocking call -> thread, same as
                # the opponent's turn, or a slow hint would stall the socket.
                if ai_enabled():
                    facts = views.coach_facts(sess, lang)
                    facts["fallback_hint"] = base_hint
                    tip = await _bounded(coach_suggest, facts, lang, budget=OPPONENT_BUDGET)
                    if tip:
                        payload["text"] = tip.get("why") or base_hint
                        payload["line"] = tip.get("line")
                await websocket.send_json(payload)

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
