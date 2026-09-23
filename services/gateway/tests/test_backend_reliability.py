"""Репродукции потери/гонки ходов и смены экзамена при resume, без сети."""

from __future__ import annotations

import asyncio
import contextlib
from dataclasses import asdict
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

from app import engine
from app.main import app
from app.orchestrator import negotiation
from app.perception import realtime_voice as rv
from app.realtime import endpoint
from app.realtime.events import SessionInit
from app.realtime.session import Layers, RealtimeSession
from app.session import SessionConfig, SessionStore, store


def _session() -> RealtimeSession:
    return RealtimeSession("reliability-test", engine.create_session("supplier", "ru"))


@pytest.mark.asyncio
async def test_next_speech_cannot_cancel_an_already_accepted_move(monkeypatch):
    session = _session()
    orch = negotiation.NegotiationOrchestrator(session)
    started, release = asyncio.Event(), asyncio.Event()

    async def judge(*args, **kwargs):
        started.set()
        await release.wait()

    monkeypatch.setattr(negotiation, "judge_enabled_for", lambda _: True)
    monkeypatch.setattr(negotiation, "judge_turn", judge)
    monkeypatch.setattr(rv, "_QUIET_MS", 0)
    pipe = rv.RealtimeVoicePipeline("ru", orch.on_player_turn,
                                    lambda: orch.interrupt("barge_in"), session.bus.publish)
    pipe._loop = asyncio.get_running_loop()
    pipe._parts = ["Почему для вас важен срок поставки?"]
    pipe._arm_quiet()
    timer = pipe._quiet
    try:
        await asyncio.wait_for(started.wait(), 1)
        await pipe._on_event({"type": "input_audio_buffer.speech_started"})
        release.set()
        with contextlib.suppress(asyncio.CancelledError):
            await timer
        await asyncio.gather(*list(pipe._turn_tasks))
        assert session.engine_session.turn == 1
        assert len(session.engine_session.move_history) == 1
        assert [x["turn"] for x in session.engine_session.log if x["role"] == "player"] == [1]
    finally:
        release.set()
        await pipe.close()


@pytest.mark.asyncio
@pytest.mark.parametrize("use_socket_work", [False, True])
async def test_voice_and_keyboard_apply_moves_in_acceptance_order(monkeypatch, use_socket_work):
    session = _session()
    session.mode, session.layers = "voice", Layers(voice=True)
    started, release = asyncio.Event(), asyncio.Event()
    judges = []

    class Voice:
        available = True
        def __init__(self, **kwargs):
            self.on_turn = kwargs["on_turn"]
        def set_opponent_speaking(self, _value):
            pass

    async def judge(context, text, *args, **kwargs):
        judges.append(text)
        if len(judges) == 1:
            started.set()
            await release.wait()

    monkeypatch.setattr(endpoint, "RealtimeVoicePipeline", Voice)
    monkeypatch.setattr(negotiation, "judge_enabled_for", lambda _: True)
    monkeypatch.setattr(negotiation, "judge_turn", judge)
    work = endpoint._Work()
    orch, voice, _ = endpoint._wire(session, work=work if use_socket_work else None)
    first = "Почему для вас важен срок поставки?"
    second = "Давайте рассмотрим ваши условия."
    work.start_turn(orch, session, first)
    await asyncio.wait_for(started.wait(), 1)
    voice_task = asyncio.create_task(voice.on_turn(second))
    await asyncio.sleep(0)
    assert judges == [first], "голос обогнал первый ход, пока тот ждал судью"
    release.set()
    await voice_task
    await asyncio.gather(*list(work._turns))
    await work.aclose()
    assert judges == [first, second]
    player = [x for x in session.engine_session.log if x["role"] == "player"]
    assert [x["turn"] for x in player] == [1, 2]
    assert [x["text"] for x in player] == [first, second]
    assert len(session.engine_session.move_history) == 2


@pytest.mark.asyncio
async def test_disconnect_while_judging_leaves_no_half_applied_move(monkeypatch):
    session = _session()
    before = asdict(session.engine_session)
    started = asyncio.Event()

    async def judge(*args, **kwargs):
        started.set()
        await asyncio.Event().wait()

    monkeypatch.setattr(negotiation, "judge_enabled_for", lambda _: True)
    monkeypatch.setattr(negotiation, "judge_turn", judge)
    work = endpoint._Work()
    orch = negotiation.NegotiationOrchestrator(session)
    work.start_turn(orch, session, "Почему для вас важен срок поставки?")
    await asyncio.wait_for(started.wait(), 1)
    await work.aclose()
    assert asdict(session.engine_session) == before
    assert not work.start_turn(orch, session, "Опоздавший голосовой callback")


@pytest.mark.asyncio
async def test_cancelled_opponent_response_still_delivers_the_final_score(monkeypatch):
    session = _session()
    # Завершим сделкой, а не лимитом ходов: лимит использует шаблон без стрима.
    started = asyncio.Event()

    async def slow_response(self, facts, templated, turn_id):
        self.session.begin_generation()
        started.set()
        await asyncio.Event().wait()

    monkeypatch.setattr(negotiation.orchat, "available", lambda: True)
    monkeypatch.setattr(negotiation, "judge_enabled_for", lambda _: False)
    monkeypatch.setattr(negotiation.NegotiationOrchestrator, "_stream_opponent", slow_response)
    monkeypatch.setattr(negotiation.NegotiationOrchestrator, "_debrief_note", AsyncMock(return_value=None))
    orch = negotiation.NegotiationOrchestrator(session)
    offer = session.engine_session.state.offer_opp
    task = asyncio.create_task(orch.on_player_turn(f"Договорились, {offer}"))
    await asyncio.wait_for(started.wait(), 1)
    await orch.interrupt("client_cancel")
    await task
    session.bus.close()
    events = [event async for event in session.bus.drain()]
    assert session.engine_session.state.status == "agreement"
    assert len(session.engine_session.move_history) == 1
    assert any(event["type"] == "debrief" for event in events)


@pytest.mark.asyncio
@pytest.mark.parametrize("original_mode", ["exam", "drill", "practice", "campaign"])
async def test_resume_restores_server_owned_conditions(monkeypatch, original_mode):
    original, problem = await endpoint._build_session(SessionInit(
        scenarioId="supplier", lang="en", mode="text", gameMode=original_mode,
        layers={"voice": True, "camera": True}, reputation=50,
    ))
    assert problem is None
    expected = (original.game_mode, original.lang, original.mode, asdict(original.layers), original.reputation)
    # И клиентский payload, и изменяемый объект текущего сокета не являются
    # хранилищем настроек для следующего подключения.
    original.layers.voice = not original.layers.voice
    try:
        restored, problem = await endpoint._build_session(SessionInit(
            resume=original.session_id, scenarioId="salary", lang="ru", mode="voice",
            gameMode="practice" if original_mode in ("exam", "drill") else "exam",
            layers={"voice": False, "camera": False, "avatar": True}, reputation=-100,
        ))
        assert problem is None
        actual = (restored.game_mode, restored.lang, restored.mode, asdict(restored.layers), restored.reputation)
        assert actual == expected
        assert restored.engine_session is original.engine_session
        assert restored.engine_session.scenario_id == "supplier"
        assert restored.engine_session.lang == restored.lang
        if original_mode in ("exam", "drill"):
            assert not any(asdict(restored.layers).values())
            assert restored.reputation is None
    finally:
        store.drop(original.session_id)


@pytest.mark.asyncio
async def test_daily_condition_survives_resume():
    from datetime import date
    from app.engine.daily import daily_table
    day = date(2026, 9, 16)
    table = daily_table(day)
    original, _ = await endpoint._build_session(SessionInit(
        scenarioId=table.scenario_id, daily=day.isoformat(),
    ))
    try:
        restored, _ = await endpoint._build_session(SessionInit(resume=original.session_id))
        assert restored.daily == table.modifier.id
        assert restored.engine_session.max_turns == original.engine_session.max_turns
    finally:
        store.drop(original.session_id)


def test_session_metadata_and_runtime_references_expire_together():
    local = SessionStore()
    config = SessionConfig("ru", "text", "exam", ())
    local.put("test", engine.create_session("supplier", "ru"), config=config)
    local.release("test")
    assert local.active_scenario_ids() == {"supplier"}
    assert local.config("test") == config
    local._expiry["test"] = 0
    assert local.active_scenario_ids() == set()
    assert local.config("test") is None
    local.put("again", object(), config=config)
    local.drop("again")
    assert local.config("again") is None


def test_finished_session_resends_debrief_after_reconnect(monkeypatch):
    client = TestClient(app)
    with client.websocket_connect("/v1/realtime") as ws:
        assert ws.receive_json()["type"] == "session.queue_done"
        ws.send_json({"type": "session.init", "payload": {"scenarioId": "supplier"}})
        sid = ws.receive_json()["session_id"]
        store.get(sid).max_turns = 1
        ws.send_json({"type": "input.append", "input": {"text": "Давайте обсудим ваши условия"}})
        ws.send_json({"type": "input.commit"})
        while True:
            event = ws.receive_json()
            if event["type"] == "debrief":
                original = event["debrief"]
                break
    note = AsyncMock(side_effect=AssertionError("resume must not call a paid model"))
    monkeypatch.setattr(negotiation.NegotiationOrchestrator, "_debrief_note", note)
    with client.websocket_connect("/v1/realtime") as ws:
        ws.receive_json()
        ws.send_json({"type": "session.init", "payload": {"resume": sid}})
        created = ws.receive_json()
        assert created["resumed"] is True
        assert created["state"]["status"] != "active"
        assert ws.receive_json() == {"type": "debrief", "debrief": original}
        ws.send_json({"type": "session.close"})
        ws.receive_json()
    note.assert_not_awaited()
