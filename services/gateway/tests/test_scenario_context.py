"""Настройки организатора доходят до сценария, а не остаются декорацией формы."""
import json

import pytest
from pydantic import ValidationError

from app import engine
from app.ai.scenario_gen import generate_scenario
from app.protocol import ScenarioContext


@pytest.mark.parametrize('field,value', [('difficulty', 0), ('difficulty', 6),
    ('difficulty', True), ('style', 'invented'), ('sector', 'x' * 81),
    ('topic', 'x' * 121), ('opponent_role', 'x' * 121), ('opponent_goal', 'x' * 241)])
def test_context_is_bounded_and_typed(field, value):
    with pytest.raises(ValidationError):
        ScenarioContext(**{field: value})


@pytest.mark.asyncio
@pytest.mark.parametrize('lang', ['ru', 'en'])
async def test_settings_override_model_defaults_and_reach_engine(monkeypatch, lang):
    from app.providers.openrouter import chat
    captured = []

    async def complete(system, user, **kwargs):
        captured.append(user)
        return json.dumps({'title': 'Wrong topic', 'style': 'relationship', 'difficulty': 1,
            'counterpart_name': 'Partner', 'counterpart_persona': 'Protects quality',
            'briefing': 'Discuss the contract', 'role': 'Buyer', 'opponent_open': 100,
            'opponent_reservation': 80, 'player_target': 85, 'player_reservation': 95,
            'hidden_interests': ['Continuity', 'Budget', 'Reputation']})

    monkeypatch.setattr(chat, 'complete', complete)
    context = ScenarioContext(sector='Manufacturing', topic='Annual supply',
        opponent_role='Factory director', opponent_goal='Keep the order volume', difficulty=5, style='tough')
    scenario = await generate_scenario('Discuss the terms.', lang, context=context)
    assert scenario is not None
    assert len(captured) == 1
    for text in ('Manufacturing', 'Annual supply', 'Factory director', 'Keep the order volume'):
        assert text in captured[0]
    assert scenario.difficulty == 5
    assert scenario.counterpart.style == 'tough'
    assert scenario.title[lang] == context.topic
    assert context.opponent_role in scenario.counterpart.persona[lang]
    assert context.opponent_goal in scenario.counterpart.persona[lang]
    assert context.sector in scenario.briefing[lang]
    sess = engine.create_session(scenario.id, lang)
    assert engine.by_id(sess.scenario_id).difficulty == 5
    assert engine.by_id(sess.scenario_id).counterpart.style == 'tough'
    for text in ['Добрый день.', 'Что для вас важно?', 'По рынку цена 90.']:
        sess.turn += 1
        engine.apply_move(sess, engine.analyze(text), text)
    assert engine.score_session(sess)['overall'] >= 0


def test_context_travels_over_websocket_and_game_finishes(monkeypatch):
    from fastapi.testclient import TestClient
    from app.main import app
    from app.ai import scenario_gen

    captured = []

    async def generate(situation, lang, **kwargs):
        captured.append((situation, lang, kwargs['context']))
        return engine.by_id('supplier')

    monkeypatch.setattr(scenario_gen, 'generate_scenario', generate)
    context = ScenarioContext(sector='Factory', topic='Supply', difficulty=4, style='tough')
    with TestClient(app).websocket_connect('/v1/realtime?mode=text') as ws:
        ws.receive_json()
        ws.send_json({'type': 'session.init', 'payload': {'scenarioId': 'custom',
                      'situation': 'Negotiate an annual supply contract.', 'lang': 'en', 'gameMode': 'custom',
                      'context': context.model_dump()}})
        created = ws.receive_json()
        assert created['type'] == 'session.created'
        assert captured == [('Negotiate an annual supply contract.', 'en', context)]
        from tests.test_reference_games import PRINCIPLED
        for line in PRINCIPLED['supplier']['en']:
            ws.send_json({'type': 'input.append', 'input': {'text': line}})
            ws.send_json({'type': 'input.commit'})
            events = []
            while not events or events[-1]['type'] != 'response.done':
                events.append(ws.receive_json())
            assert any(e['type'] == 'turn.analysis' for e in events)
            assert any(e['type'] == 'engine.state' for e in events)
        while events[-1]['type'] != 'debrief':
            events.append(ws.receive_json())
        assert events[-1]['debrief']['status'] == 'agreement'
        assert events[-1]['debrief']['grade'] in ('A', 'B')
        ws.send_json({'type': 'session.close', 'reason': 'user_stop'})
        events = []
        while not events or events[-1]['type'] != 'session.closed':
            events.append(ws.receive_json())
