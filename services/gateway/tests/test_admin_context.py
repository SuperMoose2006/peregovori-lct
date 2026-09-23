"""Administrator configuration is a real input to the ordinary offline game."""
from dataclasses import asdict, replace
import json

import pytest
from fastapi.testclient import TestClient

from app import admin_context, engine
from app.admin_context import AdminContext, build_scenario, preview
from app.engine import scenarios as registry
from app.main import app
from app.session import store

BASE = dict(domain='procurement', topic='Поставка на год', difficulty=3,
            tone='analytical', opponentRole='Руководитель продаж', opponentGoals=['price'])
CRITERIA = 'По рыночным данным медиана независимых прайсов 87, потому что это отраслевой стандарт.'
SCHEDULE = 'Если мы дадим подтвержденный график, сможете подвинуться?'
COMMITMENT = 'Я предлагаю долгосрочный контракт в обмен на снижение цены.'
EN_MOVES = ['Market data shows a median price of 87, because this is the industry standard.',
            'I offer a confirmed schedule in exchange for a better price.',
            'I offer a long-term commitment in exchange for a lower price.']


@pytest.fixture(autouse=True)
def isolated_registry(monkeypatch):
    monkeypatch.setattr(registry, '_RUNTIME', {})
    monkeypatch.setattr(registry, '_RUNTIME_USED', {})
    monkeypatch.setattr(admin_context, '_recent', admin_context.OrderedDict())


def configured(**changes):
    sc, _ = build_scenario(AdminContext(**{**BASE, **changes}))
    registry.register_runtime_scenario(sc)
    return sc, engine.create_session(sc.id, changes.get('lang', 'ru'))


def move(session, text):
    session.turn += 1
    engine.apply_move(session, engine.analyze(text), text)
    return session.state


def test_same_configuration_is_deterministic_without_mutating_catalog():
    before = [asdict(s) for s in engine.SCENARIOS]
    first, _ = configured()
    second, _ = configured()
    assert asdict(first) == asdict(second)
    assert [asdict(s) for s in engine.SCENARIOS] == before
    assert first.id.startswith('admin_')
    assert len(registry._RUNTIME) == 1


@pytest.mark.parametrize('domain', list(admin_context._BASE))
@pytest.mark.parametrize('lang', ['ru', 'en'])
def test_every_domain_produces_a_playable_reachable_scenario(domain, lang):
    sc, session = configured(domain=domain, lang=lang)
    assert engine.engine.target_reachable(sc)
    assert session.difficulty == 3
    assert len(sc.hidden_interests[lang]) == 3
    for n in range(12):
        if session.state.status != 'active':
            break
        move(session, ([CRITERIA, SCHEDULE, COMMITMENT] if lang == 'ru' else EN_MOVES)[n % 3])
        if session.lower_better:
            assert session.state.offer_opp >= sc.opponent_reservation
        else:
            assert session.state.offer_opp <= sc.opponent_reservation
    assert 0 <= engine.score_session(session)['overall'] <= 100


def test_difficulty_changes_actual_concessions_and_reveal_threshold():
    _, easy = configured(difficulty=1)
    _, hard = configured(difficulty=5)
    assert move(easy, CRITERIA).offer_opp < move(hard, CRITERIA).offer_opp
    assert engine.engine.reveal_trust_gate(easy) < engine.engine.reveal_trust_gate(hard)


def test_tone_changes_actual_response_to_objective_criteria():
    _, cooperative = configured(tone='collaborative')
    _, analytical = configured(tone='analytical')
    assert move(analytical, CRITERIA).leverage > move(cooperative, CRITERIA).leverage


def test_price_priority_limits_the_bargaining_room():
    price, _ = configured(opponentGoals=['price'])
    flexible, _ = configured(opponentGoals=['timing'])
    assert price.opponent_reservation > flexible.opponent_reservation


@pytest.mark.parametrize(('goal', 'text'), [('timing', SCHEDULE), ('certainty', COMMITMENT)])
def test_a_prioritized_concession_moves_the_actual_offer_more(goal, text):
    other = 'certainty' if goal == 'timing' else 'timing'
    _, valued = configured(opponentGoals=[goal])
    _, less_valued = configured(opponentGoals=[other])
    move(valued, CRITERIA)
    move(less_valued, CRITERIA)
    assert move(valued, text).offer_opp < move(less_valued, text).offer_opp


@pytest.mark.parametrize('domain', list(admin_context._BASE))
@pytest.mark.parametrize(('lang', 'text'), [
    ('ru', 'Я предлагаю долгосрочный контракт в обмен на снижение цены.'),
    ('en', 'I offer a long-term commitment in exchange for a lower price.'),
    ('ru', 'Если мы дадим подтвержденный график, сможете подвинуться?'),
    ('en', 'I offer a confirmed schedule in exchange for a better price.'),
])
def test_one_promise_never_counts_as_two_concessions(domain, lang, text):
    sc, _ = configured(domain=domain, lang=lang)
    from app.engine.engine import _match_secondary_issues
    matched = _match_secondary_issues(sc, text.lower().replace('ё', 'е'), lang, None)
    assert len(matched) == 1


def test_preview_exposes_player_information_only():
    result = preview(AdminContext(**BASE))
    sc = engine.by_id(result['scenario']['id'])
    rendered = json.dumps(result, ensure_ascii=False)
    for name in ['hidden_interests', 'opponent_reservation', 'hidden_interest_keywords', 'opp_value']:
        assert name not in rendered
    for secret in sc.hidden_interests['ru']:
        assert secret not in rendered
    assert result['scenario']['defending'] == []


@pytest.mark.parametrize('patch', [
    {'domain': 'any'}, {'topic': 'x'}, {'topic': 'x' * 121}, {'topic': 'line\nbreak'},
    {'difficulty': 0}, {'difficulty': 6}, {'difficulty': True}, {'difficulty': 1.5},
    {'tone': 'hostile'}, {'opponentRole': 'x' * 81}, {'opponentGoals': []},
    {'opponentGoals': ['price', 'price']}, {'opponentGoals': ['invented']}, {'unexpected': 'secret'},
])
def test_bad_configuration_is_rejected_without_echo(patch):
    with TestClient(app) as client:
        response = client.post('/api/admin/scenarios/preview', json={**BASE, **patch})
        assert response.status_code == 422
        assert 'secret' not in response.text
        assert len(response.content) < 400


def test_endpoint_bounds_raw_body_and_preview_burst():
    with TestClient(app) as client:
        assert client.post('/api/admin/scenarios/preview', content=b'x' * 4097).status_code == 413
        assert client.post('/api/admin/scenarios/preview', content=b'{broken').status_code == 422
        for _ in range(10):
            assert client.post('/api/admin/scenarios/preview', json=BASE).status_code == 200
        assert client.post('/api/admin/scenarios/preview', json=BASE).status_code == 429


def test_admin_uses_existing_access_gate(monkeypatch):
    import app.main as main
    monkeypatch.setattr(main, '_HTTP_PASSWORD', 'admin-test-password')
    with TestClient(app) as client:
        assert client.post('/api/admin/scenarios/preview', json=BASE).status_code == 401
        assert client.post('/api/admin/scenarios/preview', json=BASE,
                           auth=('dialog', 'admin-test-password')).status_code == 200


def test_health_does_not_claim_voice_when_network_is_disabled(monkeypatch):
    import app.main as main
    monkeypatch.setenv('NEGO_AI', 'off')
    monkeypatch.setenv('OPENAI_REALTIME_KEY', 'a-configured-key')
    assert main._voice_describe() == 'unavailable (NEGO_AI=off)'


def test_runtime_registry_is_bounded_and_keeps_active_and_resumable_games(monkeypatch):
    monkeypatch.setattr(registry, 'RUNTIME_MAX', 2)
    first, session = configured(topic='Первый кейс')
    store.put('admin-test-active', session)
    try:
        store.release('admin-test-active')
        configured(topic='Второй кейс')
        third, _ = configured(topic='Третий кейс')
        assert len(registry._RUNTIME) == 2
        assert registry.by_id(first.id) is first
        assert registry.by_id(third.id)
        move(session, CRITERIA)
    finally:
        store.drop('admin-test-active')


def test_runtime_expiry_and_all_active_capacity(monkeypatch):
    monkeypatch.setattr(registry, 'RUNTIME_MAX', 1)
    first, session = configured()
    registry._RUNTIME_USED[first.id] -= registry.RUNTIME_TTL_S + 1
    assert registry.by_id(first.id) is None
    first, session = configured()
    store.put('admin-test-capacity', session)
    try:
        with pytest.raises(registry.RuntimeRegistryFull):
            configured(topic='Другой кейс')
        assert registry.by_id(first.id)
        changed = replace(first, difficulty=5)
        registry.register_runtime_scenario(changed)
        assert registry.by_id(first.id).difficulty == 3
    finally:
        store.drop('admin-test-capacity')


@pytest.mark.parametrize('lang', ['ru', 'en'])
def test_admin_preview_to_full_game_and_debrief_over_real_websocket(monkeypatch, lang):
    from app.providers.openrouter import chat
    async def forbidden(*args, **kwargs):
        raise AssertionError('admin practice called a cloud provider')
    monkeypatch.setattr(chat, 'complete', forbidden)
    with TestClient(app) as client:
        response = client.post('/api/admin/scenarios/preview', json={**BASE, 'lang': lang})
        assert response.status_code == 200
        scenario_id = response.json()['scenario']['id']
        with client.websocket_connect('/v1/realtime') as ws:
            assert ws.receive_json()['type'] == 'session.queue_done'
            ws.send_json({'type': 'session.init', 'payload': {
                'scenarioId': scenario_id, 'lang': lang, 'gameMode': 'practice',
                'layers': {'voice': False, 'camera': False, 'avatar': False, 'probe': False},
            }})
            created = ws.receive_json()
            assert created['type'] == 'session.created'
            assert created['scenario']['id'] == scenario_id
            debrief = None
            for turn in range(12):
                text = ([CRITERIA, SCHEDULE, COMMITMENT] if lang == 'ru' else EN_MOVES)[turn % 3]
                ws.send_json({'type': 'input.append', 'input': {'text': text}})
                ws.send_json({'type': 'input.commit'})
                for _ in range(30):
                    event = ws.receive_json()
                    assert event['type'] != 'error', event
                    if event['type'] == 'debrief':
                        debrief = event
                        break
                    if event['type'] == 'engine.state' and event['state']['status'] == 'active':
                        break
                if debrief:
                    break
            assert debrief is not None
            ws.send_json({'type': 'session.close'})
