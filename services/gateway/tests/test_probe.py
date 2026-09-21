"""Серверный вопрос должен совпадать с офлайн-реакцией и переживать resume."""
import json
from pathlib import Path

import pytest

from app import engine
from app.probe import ProbeMemory, build_probe, next_probe
from app.realtime.session import RealtimeSession, keep_for_resume, restore_from_resume

FIXTURE = Path(__file__).resolve().parents[3] / 'frontend/test/fixtures/probes.json'


@pytest.mark.parametrize('case', json.loads(FIXTURE.read_text()),
                         ids=lambda c: f"{c['reaction']}@{c['turn']}")
def test_offline_parity(case):
    actual = build_probe(case['reaction'], case['turn'])
    assert (actual.model_dump() if actual else None) == case['probe']
    if actual:
        assert actual.options[actual.answer] == case['reaction']
        assert len(set(actual.options)) == 4


def test_cadence_and_bounded_repeat_delay():
    memory = ProbeMemory()
    assert next_probe('neutral', 2, False, memory) is None
    assert next_probe('neutral', 3, True, memory) is None
    assert next_probe('neutral', 3, False, memory) is not None
    memory = ProbeMemory(3, 'neutral')
    assert next_probe('warmed', 5, False, memory) is None
    assert next_probe('neutral', 6, False, memory) is None
    assert next_probe('neutral', 7, False, memory) is not None
    assert next_probe('warmed', 6, False, memory) is not None


def test_probe_memory_survives_resume_without_camera():
    original = RealtimeSession('probe-resume', engine.create_session('supplier', 'ru'))
    original.probe_memory = ProbeMemory(3, 'neutral')
    keep_for_resume(original)
    resumed = RealtimeSession('probe-resume', original.engine_session)
    restore_from_resume(resumed, original.session_id)
    assert resumed.probe_memory == ProbeMemory(3, 'neutral')
    assert next_probe('neutral', 6, False, resumed.probe_memory) is None
    other = RealtimeSession('probe-other', engine.create_session('supplier', 'ru'))
    assert other.probe_memory == ProbeMemory()


@pytest.mark.asyncio
async def test_cancelled_reply_does_not_consume_the_question(monkeypatch):
    import asyncio
    from app.orchestrator import negotiation
    from app.realtime.session import Layers

    entered = asyncio.Event()

    async def stream(*args, **kwargs):
        entered.set()
        await asyncio.Event().wait()
        yield 'unreachable'

    monkeypatch.setattr(negotiation.orchat, 'available', lambda: True)
    monkeypatch.setattr(negotiation.orchat, 'stream', stream)
    monkeypatch.setattr(negotiation, 'judge_enabled_for', lambda mode: False)
    sess = RealtimeSession('probe-cancel', engine.create_session('supplier', 'ru'),
                           layers=Layers(probe=True))
    sess.engine_session.turn = 2
    orchestrator = negotiation.NegotiationOrchestrator(sess)
    task = asyncio.create_task(orchestrator.on_player_turn('Добрый день.'))
    try:
        await asyncio.wait_for(entered.wait(), timeout=2)
        await orchestrator.interrupt(reason='user_interrupt')
        with pytest.raises(asyncio.CancelledError):
            await task
        assert sess.engine_session.turn == 3, 'the settled engine move remains applied'
        assert sess.probe_memory == ProbeMemory()
        sess.bus.close()
        events = [e async for e in sess.bus.drain()]
        assert not any(e['type'] == 'probe' for e in events)
    finally:
        if not task.done():
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)


@pytest.mark.asyncio
@pytest.mark.parametrize('enabled,closed', [(True, False), (False, False), (True, True)])
async def test_orchestrator_uses_settled_judged_reaction(monkeypatch, enabled, closed):
    from app.orchestrator import negotiation
    from app.realtime.session import Layers

    async def judge(*args):
        return {'arg_score': 5, 'interest_targeted': None, 'criteria_legitimate': False,
                'tradeoff_real': False, 'batna_real': False, 'note': '', 'techniques': []}

    monkeypatch.setattr(negotiation, 'judge_enabled_for', lambda mode: True)
    monkeypatch.setattr(negotiation, 'judge_turn', judge)
    sess = RealtimeSession('probe-judge', engine.create_session('supplier', 'ru'),
                           layers=Layers(probe=enabled))
    sess.engine_session.turn = 2
    if closed:
        sess.engine_session.max_turns = 3
    line = 'По рыночным данным цена 88, по трём независимым прайсам.'
    plain = engine.create_session('supplier', 'ru')
    assert engine.apply_move(plain, engine.analyze(line), line).reaction == 'persuaded'
    await negotiation.NegotiationOrchestrator(sess).on_player_turn(line)
    sess.bus.close()
    events = [e async for e in sess.bus.drain()]
    state = next(e for e in events if e['type'] == 'engine.state')
    assert state['reaction'] == 'neutral'
    assert state['closed'] is closed
    probes = [e for e in events if e['type'] == 'probe']
    if enabled and not closed:
        assert len(probes) == 1
        probe = probes[0]
        assert probe['turn'] == 3
        assert probe['options'][probe['answer']] == state['reaction']
        done = next(e for e in events if e['type'] == 'response.done')
        assert events.index(probe) > events.index(done) > events.index(state)
        assert 'generation_id' not in probe
        assert sess.probe_memory == ProbeMemory(3, state['reaction'])
    else:
        assert probes == []
        assert sess.probe_memory == ProbeMemory()


@pytest.mark.parametrize('mode', ['practice', 'exam', 'drill'])
def test_probe_over_real_websocket(mode):
    from fastapi.testclient import TestClient
    from app.main import app

    with TestClient(app).websocket_connect('/v1/realtime?mode=text') as ws:
        ws.receive_json()
        ws.send_json({'type': 'session.init', 'payload': {'scenarioId': 'supplier',
                      'lang': 'ru', 'gameMode': mode, 'layers': {'probe': True}}})
        ws.receive_json()
        events = []
        for _ in range(3):
            ws.send_json({'type': 'input.append', 'input': {'text': 'Добрый день.'}})
            ws.send_json({'type': 'input.commit'})
            while True:
                event = ws.receive_json()
                events.append(event)
                if event['type'] == 'response.done':
                    break
        # Закрытие — барьер: до session.closed доставляются и сообщения,
        # поставленные в очередь после response.done последнего хода.
        ws.send_json({'type': 'session.close', 'reason': 'user_stop'})
        while True:
            event = ws.receive_json()
            events.append(event)
            if event['type'] == 'session.closed':
                break
    probes = [e for e in events if e['type'] == 'probe']
    assert len(probes) == (1 if mode == 'practice' else 0)
    if probes:
        state = [e for e in events if e['type'] == 'engine.state'][-1]
        assert probes[0]['options'][probes[0]['answer']] == state['reaction']
