"""Tests for the deterministic "А что если…" what-if replay endpoint.

The engine is a pure function of (scenario, ordered moves), so re-running one
pivotal turn with a better line reveals exactly how the future diverges. These
tests pin: (1) replaying the SAME text reproduces the real play bit-for-bit,
(2) a strong interest-probe alternative beats a hostile original at the same
turn, and (3) input guards return 400.

AI stays 'off' → templated opponent lines, fully offline and reproducible.
"""

import os
os.environ.setdefault("NEGO_AI", "off")

from fastapi.testclient import TestClient

from app import engine
from app.main import app

client = TestClient(app)


def _manual_replay_branch(scenario_id: str, lang: str, moves: list[str], turn_index: int) -> dict:
    """Independent reference replay through the raw engine (mirrors the WS loop),
    so we compare the endpoint against the engine itself, not against itself."""
    sess = engine.create_session(scenario_id, lang)
    result = None
    analysis = None
    for t in moves[: turn_index + 1]:
        sess.turn += 1
        analysis = engine.analyze(t)
        result = engine.apply_move(sess, analysis, t)
    line = engine.render_line(sess, result.reaction, result.closed)
    return {
        "deltas": {
            "trust": result.deltas["trust"],
            "tension": result.deltas["tension"],
            "info": result.deltas["info"],
            "leverage": result.deltas["leverage"],
        },
        "offer_opp": sess.state.offer_opp,
        "opponent_line": line,
    }


SUPPLIER_MOVES = [
    "Здравствуйте! Расскажите, с какими сложностями по загрузке вы сталкиваетесь?",
    "Понимаю вас. А что для вас важнее всего в этой сделке?",
    "Снижайте цену немедленно, иначе мы уходим к другому поставщику. Ультиматум.",
    "По рыночным данным справедливая цена ниже.",
]


def test_replaying_same_text_matches_real_play():
    """The 'original' branch (re-running moves[turnIndex]) must equal a direct
    engine replay of the same prefix+move — the deterministic guarantee."""
    body = {
        "scenarioId": "supplier", "lang": "ru", "moves": SUPPLIER_MOVES,
        "turnIndex": 2, "altText": "любой альтернативный текст",
    }
    r = client.post("/api/whatif", json=body)
    assert r.status_code == 200
    orig = r.json()["original"]

    ref = _manual_replay_branch("supplier", "ru", SUPPLIER_MOVES, 2)
    assert orig["deltas"] == ref["deltas"]
    assert orig["state"]["offer_opp"] == ref["offer_opp"]
    assert orig["opponent_line"] == ref["opponent_line"]


def test_alt_equal_to_original_text_is_identical():
    """altText == moves[turnIndex] → the two branches are byte-identical."""
    body = {
        "scenarioId": "supplier", "lang": "ru", "moves": SUPPLIER_MOVES,
        "turnIndex": 2, "altText": SUPPLIER_MOVES[2],
    }
    j = client.post("/api/whatif", json=body).json()
    assert j["original"] == j["alternative"]


def test_endpoint_is_deterministic():
    body = {
        "scenarioId": "supplier", "lang": "ru", "moves": SUPPLIER_MOVES,
        "turnIndex": 2, "altText": "А что для вас важнее всего и почему?",
    }
    a = client.post("/api/whatif", json=body).json()
    b = client.post("/api/whatif", json=body).json()
    assert a == b


def test_strong_alternative_beats_hostile_original():
    """At turn 2 (a threat in the original), a Harvard-style interest probe must
    yield a strictly better trajectory: it uncovers an interest, lowers tension,
    builds trust, and moves the offer at least as far."""
    body = {
        "scenarioId": "supplier", "lang": "ru", "moves": SUPPLIER_MOVES,
        "turnIndex": 2,
        "altText": "А что для вас важнее всего в долгосрочном сотрудничестве и почему?",
    }
    j = client.post("/api/whatif", json=body).json()
    orig, alt = j["original"], j["alternative"]

    # Original is a threat: tension jumps, trust drops, no interest uncovered.
    assert orig["deltas"]["tension"] > 0
    assert orig["deltas"]["trust"] < 0
    assert orig["deltas"]["info"] == 0

    # Alternative uncovers an interest and cools the room.
    assert alt["deltas"]["info"] > 0
    assert alt["state"]["interests_found"] > orig["state"]["interests_found"]
    assert alt["deltas"]["tension"] < orig["deltas"]["tension"]
    assert alt["deltas"]["trust"] > orig["deltas"]["trust"]
    # Lower-is-better scenario: the alternative pushes the price at least as low.
    assert alt["state"]["offer_opp"] <= orig["state"]["offer_opp"]


def test_bad_turnindex_returns_400():
    for bad in (-1, 4, 99):
        r = client.post("/api/whatif", json={
            "scenarioId": "supplier", "lang": "ru", "moves": SUPPLIER_MOVES,
            "turnIndex": bad, "altText": "x",
        })
        assert r.status_code == 400


def test_empty_moves_returns_400():
    r = client.post("/api/whatif", json={
        "scenarioId": "supplier", "lang": "ru", "moves": [], "turnIndex": 0, "altText": "x",
    })
    assert r.status_code == 400


def test_unknown_scenario_returns_400():
    r = client.post("/api/whatif", json={
        "scenarioId": "does-not-exist", "lang": "ru", "moves": SUPPLIER_MOVES,
        "turnIndex": 2, "altText": "x",
    })
    assert r.status_code == 400
