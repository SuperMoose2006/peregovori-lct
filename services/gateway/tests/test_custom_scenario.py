"""Tests for the 'Своя сделка' custom-scenario generator.

The ZOPA normalization is deterministic and always tested; live LLM generation
is guarded so the suite stays green without an AI backend.
"""

import os
import pytest

from app.ai.scenario_gen import _normalize_zopa, generate_scenario
from app.engine.scenarios import Scenario
from app import engine


def test_normalize_lower_is_better_orders_zopa():
    # player wants LOW: floor < target < reservation < open
    o, r, t, pr = _normalize_zopa({
        "dir": "lower_is_better",
        "opponent_open": 100, "opponent_reservation": 84,
        "player_target": 86, "player_reservation": 92,
    })
    assert r < t < pr < o  # opp_reservation < target < player_reservation < open
    assert r <= t  # target is reachable above the opponent floor


def test_normalize_higher_is_better_orders_zopa():
    # player wants HIGH: opp_open < player_reservation < target < opp_reservation
    o, r, t, pr = _normalize_zopa({
        "dir": "higher_is_better",
        "opponent_open": 180, "opponent_reservation": 240,
        "player_target": 230, "player_reservation": 195,
    })
    assert o < pr < t < r


def test_normalize_handles_degenerate_equal_numbers():
    o, r, t, pr = _normalize_zopa({
        "dir": "lower_is_better",
        "opponent_open": 50, "opponent_reservation": 50,
        "player_target": 50, "player_reservation": 50,
    })
    # strictly increasing → a real bargaining zone even from garbage input
    assert len({o, r, t, pr}) == 4


def test_generate_returns_none_without_ai(monkeypatch):
    """Без облака «своя сделка» честно недоступна, а не выдаёт пустышку.

    Генератор перешёл на асинхронного провайдера OpenRouter (роль `reasoning`):
    это происходит один раз за партию и вне realtime-петли, поэтому там можно
    позволить модели думать дольше.
    """
    import asyncio

    monkeypatch.setenv("NEGO_AI", "off")
    assert asyncio.run(generate_scenario("Договориться об аренде офиса", "ru")) is None


@pytest.mark.skipif(os.environ.get("NEGO_AI") == "off",
                    reason="живая генерация требует облачного ключа")
def test_generate_and_play_custom_scenario():
    import asyncio

    sc = asyncio.run(generate_scenario(
        "Я арендатор, хочу снизить арендную ставку за офис, не съезжая.", "ru"))
    assert isinstance(sc, Scenario)
    assert sc.id.startswith("custom_")
    # plugs into the real engine and produces a valid opening state
    sess = engine.create_session(sc.id, "ru")
    sv = engine.to_state_view(sess)
    assert sv["status"] == "active"
    assert sv["interests_total"] == 3
