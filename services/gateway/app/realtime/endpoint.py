"""endpoint.py — WebSocket `/v1/realtime`. Единственная дверь в партию.

ПРОИСХОЖДЕНИЕ ЖИЗНЕННОГО ЦИКЛА: MiniCPM-o-Demo (Apache-2.0, commit 50b0865c),
`gateway.py:1384` + `docs-app/content/docs/en/realtime-api/overview.md`.
Порядок `queue_done → session.init → session.created → input.append → …
→ session.close → session.closed` сохранён дословно, включая событие очереди,
которое мы отправляем сразу: у нас нет пула GPU-воркеров, но клиент (порт их
же `realtime-session.js`) ждёт этого события, и ломать протокол ради одной
сэкономленной строки бессмысленно.

ЧЕМ ЭТО ЛУЧШЕ СТАРОГО `/ws`. Там один цикл делал всё: читал сообщение, звал ИИ,
писал ответ. Пока он звал ИИ, он не читал сокет — то есть перебить оппонента
было физически нельзя, сообщение просто ждало в буфере. Здесь чтение и запись
разведены на две задачи: **читатель никогда не блокируется на ИИ**, поэтому
`response.cancel` доходит мгновенно, а писатель отдаёт то, что накопила шина,
выбрасывая хвосты погашенных поколений.
"""

from __future__ import annotations

import asyncio
import base64
import contextlib
from typing import Optional

import numpy as np
from fastapi import WebSocket, WebSocketDisconnect

from app import engine, views
from app.avatar.base import AvatarProvider
from app.avatar.presence import PresenceAvatar
from app.orchestrator.judge import judge_enabled
from app.orchestrator.negotiation import NegotiationOrchestrator
from app.orchestrator.tts_manager import TTSTaskManager
from app.perception.voice_pipeline import VoicePipeline
from app.providers.asr.openrouter import OpenRouterASR
from app.providers.openrouter import chat as orchat
from app.providers.routing import describe as describe_models
from app.providers.tts.base import Voice
from app.providers.tts.edge import EdgeTTS
from app.realtime.events import SessionInit, error, session_closed
from app.realtime.session import Layers, RealtimeSession
from app.session import store


async def realtime_ws(websocket: WebSocket) -> None:
    await websocket.accept()
    mode = websocket.query_params.get("mode", "text")
    if mode not in ("text", "voice"):
        await websocket.close(code=1008, reason=f"unsupported mode: {mode}")
        return

    # Очередь: у нас её нет, воркер всегда свободен. Событие всё равно шлём —
    # клиент ждёт именно его перед отправкой `session.init`.
    await websocket.send_json({"type": "session.queue_done"})

    session: Optional[RealtimeSession] = None
    orchestrator: Optional[NegotiationOrchestrator] = None
    voice: Optional[VoicePipeline] = None
    writer: Optional[asyncio.Task] = None

    try:
        while True:
            message = await websocket.receive_json()
            kind = message.get("type")

            # ---- session.init ---------------------------------------------
            if kind == "session.init":
                if session is not None:
                    await websocket.send_json(error("already_initialized",
                                                    "session already initialized"))
                    continue
                payload = SessionInit(**(message.get("payload") or {}))
                payload.mode = mode  # URL — истина, а не поле в теле
                session, problem = await _build_session(payload)
                if session is None:
                    await websocket.send_json(error("init_failed", problem or "init failed"))
                    continue

                orchestrator, voice = _wire(session)
                writer = asyncio.create_task(_pump(websocket, session))
                await websocket.send_json(_created_payload(session, voice))
                continue

            if session is None or orchestrator is None:
                await websocket.send_json(error("not_initialized",
                                                "send session.init first"))
                continue

            # ---- input.append ---------------------------------------------
            if kind == "input.append":
                data = message.get("input") or {}
                text = data.get("text")
                if text:
                    session.append_input(text=text)
                frames = data.get("video_frames")
                if frames:
                    session.append_input(frames=frames)
                audio_b64 = data.get("audio")
                if audio_b64 and voice is not None:
                    pcm = np.frombuffer(base64.b64decode(audio_b64), dtype=np.int16)
                    voice.feed(pcm)
                if data.get("force_listen"):
                    await orchestrator.interrupt(reason="force_listen")
                continue

            # ---- input.commit ---------------------------------------------
            if kind == "input.commit":
                text, _frames = session.take_input()
                if not text and voice is not None:
                    # Голосовой режим: клиент нажал «готово», не дожидаясь
                    # детектора конца хода. Уважаем — человек решил сам.
                    await voice.force_commit()
                elif text:
                    await orchestrator.on_player_turn(text)
                continue

            # ---- response.cancel (перебивание с клиента) -------------------
            if kind == "response.cancel":
                await orchestrator.interrupt(reason="client_cancel")
                continue

            # ---- coach.request (кнопка 💡) ---------------------------------
            if kind == "coach.request":
                await _send_hint(session)
                continue

            # ---- session.close ---------------------------------------------
            if kind == "session.close":
                await orchestrator.interrupt(reason="session_close")
                await websocket.send_json(session_closed(session.session_id,
                                                         message.get("reason", "user_stop")))
                break

            await websocket.send_json(error("unknown_event", f"unknown message: {kind}"))

    except WebSocketDisconnect:
        pass
    except Exception as exc:  # сокет не должен падать от кривого сообщения
        with contextlib.suppress(Exception):
            await websocket.send_json(error("server_error", str(exc)))
    finally:
        if orchestrator is not None:
            with contextlib.suppress(Exception):
                await orchestrator.interrupt(reason="disconnect")
        if session is not None:
            session.bus.close()
            store.drop(session.session_id)
        if writer is not None:
            writer.cancel()
            with contextlib.suppress(asyncio.CancelledError, Exception):
                await writer


# ---------------------------------------------------------------------------
# Сборка сессии
# ---------------------------------------------------------------------------

async def _build_session(payload: SessionInit) -> tuple[Optional[RealtimeSession], Optional[str]]:
    """Создать партию. Возвращает (сессия, причина отказа)."""
    scenario_id = payload.scenarioId

    if payload.gameMode == "custom":
        from app.ai.scenario_gen import generate_scenario
        generated = await asyncio.to_thread(generate_scenario, payload.situation or "", payload.lang)
        if generated is None:
            return None, ("Не удалось сгенерировать сценарий. Попробуйте переформулировать ситуацию."
                          if payload.lang == "ru" else
                          "Couldn't generate a scenario. Try rephrasing the situation.")
        scenario_id = generated.id

    try:
        engine_session = engine.create_session(scenario_id, payload.lang)
    except ValueError:
        return None, f"unknown scenario: {scenario_id}"

    if payload.reputation is not None:
        views.apply_reputation(engine_session, payload.reputation)

    session_id = store.new_id()
    store.put(session_id, engine_session)
    return RealtimeSession(
        session_id=session_id,
        engine_session=engine_session,
        lang=payload.lang,
        mode=payload.mode,
        game_mode=payload.gameMode,
        layers=Layers.from_dict(payload.layers),
    ), None


def _wire(session: RealtimeSession) -> tuple[NegotiationOrchestrator, Optional[VoicePipeline]]:
    """Собрать подсистемы вокруг сессии по включённым слоям.

    Слои включают КАНАЛЫ, а не правила игры: выключенный голос означает, что
    синтез не поднимается, но ход, шкалы и грейд считаются ровно так же.
    """
    scenario = engine.by_id(session.engine_session.scenario_id)

    avatar: Optional[AvatarProvider] = None
    if session.layers.avatar:
        avatar = PresenceAvatar(session.engine_session.scenario_id, session.bus.publish)

    tts: Optional[TTSTaskManager] = None
    if session.layers.voice:
        provider = EdgeTTS()
        if provider.available():
            tts = TTSTaskManager(provider, session.bus.publish,
                                 Voice(id="", lang=session.lang,
                                       female=_persona_is_female(scenario)))

    orchestrator = NegotiationOrchestrator(session, tts=tts, avatar=avatar)

    voice: Optional[VoicePipeline] = None
    if session.mode == "voice" and session.layers.voice:
        pipeline = VoicePipeline(
            asr=OpenRouterASR(), lang=session.lang,
            on_turn=orchestrator.on_player_turn,
            on_interrupt=lambda: orchestrator.interrupt(reason="barge_in"),
            publish=session.bus.publish,
        )
        if pipeline.available:
            voice = pipeline
            # Замыкаем петлю: оркестратор знает, когда оппонент звучит, и
            # пайплайн поднимает планку перебивания на это время.
            orchestrator.on_speaking_change = pipeline.set_opponent_speaking

    return orchestrator, voice


def _persona_is_female(scenario) -> bool:
    """Пол голоса берём из сценария, а не угадываем синтезом.

    STUB(persona-gender): в сценариях пока нет поля пола — читаем по окончанию
      имени, что для русского работает, но не для всех имён.
      Настоящим станет: поле `counterpart.female` в `engine/scenarios.py`,
      заполненное вместе с персоной. См. docs/upstream-code-map.md.
    """
    try:
        name = scenario.counterpart.name.get("ru", "")
    except Exception:
        return True
    return bool(name) and name.rstrip().endswith(("а", "я"))


def _created_payload(session: RealtimeSession, voice: Optional[VoicePipeline]) -> dict:
    """`session.created` — единственное место, где клиент узнаёт правду о возможностях.

    Здесь нет обещаний: каждое поле отражает то, что действительно поднялось.
    Слой, который не поднялся, приезжает как `false` с причиной, и интерфейс
    рисует «недоступно» вместо того, чтобы имитировать работу.
    """
    engine_session = session.engine_session
    scenario = engine.by_id(engine_session.scenario_id)
    greeting = views.greeting_line(engine_session, session.lang)

    capabilities = {
        "voice": bool(session.layers.voice),
        "microphone": voice is not None,
        "camera": bool(session.layers.camera),
        "judge": judge_enabled(),
        "cloud_ai": orchat.available(),
        "models": describe_models(),
        "avatar": {"available": False, "lipsync": False, "transport": "none"},
    }
    if session.layers.avatar:
        provider = PresenceAvatar(engine_session.scenario_id, session.bus.publish)
        caps = provider.capabilities()
        capabilities["avatar"] = {
            "available": caps.available, "lipsync": caps.lipsync,
            "transport": caps.transport, "states": list(caps.states),
        }

    return {
        "type": "session.created",
        "session_id": session.session_id,
        "mode": session.mode,
        "scenario": views.scenario_view(scenario, session.lang).model_dump(),
        "state": views.state_view(engine_session).model_dump(),
        "greeting": greeting,
        "capabilities": capabilities,
    }


async def _pump(websocket: WebSocket, session: RealtimeSession) -> None:
    """Писатель: шина → сокет. Хвосты погашенных поколений отсеивает `drain()`."""
    try:
        async for event in session.bus.drain():
            await websocket.send_json(event)
    except (WebSocketDisconnect, RuntimeError, asyncio.CancelledError):
        return
    except Exception:
        return


async def _send_hint(session: RealtimeSession) -> None:
    """Подсказка тренера. Никогда не выдаёт ещё не вскрытые интересы."""
    engine_session, lang = session.engine_session, session.lang
    base = views.compute_hint(engine_session, lang)
    payload = {"type": "turn.coach", "kind": "hint", "text": base}

    if orchat.available():
        from app.ai.coach import build_prompts as coach_prompts, parse as coach_parse
        facts = views.coach_facts(engine_session, lang)
        facts["fallback_hint"] = base
        try:
            system, user = coach_prompts(facts, lang)
            raw = await orchat.complete(system, user, role="opponent",
                                        max_tokens=300, temperature=0.6, raw=True)
            tip = coach_parse(raw or "", lang)
            if tip:
                payload["text"] = tip.get("why") or base
                payload["line"] = tip.get("line")
        except Exception:
            pass
    session.bus.publish(payload)
