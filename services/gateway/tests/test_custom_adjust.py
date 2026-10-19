"""Своя сделка: числа стола — на подтверждение перед первым ходом (CE-01).

Генератор выводит числа стола из описания, и модель может ошибиться: в
описании цель 450 000, а на столе 470 000 (аудит 17.10, CE-01). Решение
владельца 19.10: перед стартом игрок видит стартовую цену собеседника, свою
цель и красную линию и может их поправить. Правка — событие `session.adjust`,
только в своей сделке и только до первого хода; ответ — тот же
`session.created` с новым столом. Скрытое дно собеседника сдвигается
пропорционально, чтобы он по-прежнему не переходил его (инвариант 1).
"""
from __future__ import annotations

from dataclasses import replace

import pytest
from fastapi.testclient import TestClient

from app import engine
from app.ai import scenario_gen
from app.engine.scenarios import register_runtime_scenario
from app.main import app

client = TestClient(app)


@pytest.fixture
def generated(monkeypatch):
    base = engine.by_id("supplier")
    sc = replace(base, id="custom_adjust_test", opponent_open=100.0, opponent_reservation=88.0,
                 player_target=86.0, player_reservation=92.0,
                 briefing={"ru": "Поставщик просит 100. Цель — 86, красная линия — 92. Начните с вопросов.",
                           "en": "The supplier asks 100. Target 86, red line 92. Start with questions."})
    register_runtime_scenario(sc)

    async def fake(situation, lang, context=None):
        return sc

    monkeypatch.setattr(scenario_gen, "generate_scenario", fake)
    return sc


def _open(ws, game_mode="custom"):
    ws.receive_json()                                  # session.queue_done
    ws.send_json({"type": "session.init", "payload": {
        "scenarioId": "" if game_mode == "custom" else "supplier", "lang": "ru",
        "gameMode": game_mode, "situation": "Поставщик поднимает цену, я закупщик.",
        "layers": {}}})
    return ws.receive_json()


def test_numbers_can_be_corrected_before_the_first_move(generated):
    with client.websocket_connect("/v1/realtime?mode=text") as ws:
        created = _open(ws)
        assert created["scenario"]["target"] == 86
        ws.send_json({"type": "session.adjust", "open": 110, "target": 80, "redline": 95})
        again = ws.receive_json()
        assert again["type"] == "session.created" and again["session_id"] == created["session_id"]
        assert again.get("adjusted") is True
        assert again["scenario"]["target"] == 80 and again["scenario"]["reservation"] == 95
        assert again["state"]["offer_opp"] == 110
        assert "80" in again["scenario"]["briefing"] and "95" in again["scenario"]["briefing"]
        assert "86" not in again["scenario"]["briefing"], "вводная спорит с поправленными числами"
        assert "просит 110" in again["scenario"]["briefing"], again["scenario"]["briefing"]
        sc = engine.by_id(again["scenario"]["id"])
        # Дно — на той же доле пути «старт → цель»: (88−100)/(86−100) от 110 к 80.
        assert sc.opponent_reservation == pytest.approx(110 + (12 / 14) * (80 - 110), abs=0.01)
        assert 80 < sc.opponent_reservation < 110


@pytest.mark.parametrize("numbers", [
    {"open": 110, "target": 95, "redline": 90},     # цель хуже красной линии
    {"open": 70, "target": 80, "redline": 95},      # старт уже лучше цели
    {"open": 110, "target": -5, "redline": 95},     # не число стола
])
def test_impossible_numbers_are_refused(generated, numbers):
    with client.websocket_connect("/v1/realtime?mode=text") as ws:
        _open(ws)
        ws.send_json({"type": "session.adjust", **numbers})
        reply = ws.receive_json()
        assert reply["type"] == "error" and reply["error"]["code"] == "bad_numbers", reply


def test_adjusting_after_the_first_move_or_outside_a_custom_deal_is_refused(generated):
    with client.websocket_connect("/v1/realtime?mode=text") as ws:
        _open(ws, game_mode="practice")
        ws.send_json({"type": "session.adjust", "open": 110, "target": 80, "redline": 95})
        reply = ws.receive_json()
        assert reply["type"] == "error" and reply["error"]["code"] == "adjust_closed"


def test_adjusting_after_the_first_move_is_refused(generated):
    with client.websocket_connect("/v1/realtime?mode=text") as ws:
        _open(ws)
        ws.send_json({"type": "input.append", "input": {"text": "Что для вас важнее всего в этой сделке?"}})
        ws.send_json({"type": "input.commit"})
        for _ in range(60):
            if ws.receive_json().get("type") == "response.done":
                break
        ws.send_json({"type": "session.adjust", "open": 110, "target": 80, "redline": 95})
        reply = ws.receive_json()
        while reply.get("type") != "error":
            reply = ws.receive_json()
        assert reply["error"]["code"] == "adjust_closed"


def test_the_briefing_follows_the_numbers_in_any_spacing():
    """Вводная пишет числа как придётся: «470 000», «470\u00a0000», «470 тыс».
    Не нашлось — честная поправка в начале, а не молчание."""
    from app.ai.scenario_gen import _retarget
    text = "Цель — 470 000, красная линия — 520\u00a0000 ₽."
    out = _retarget(text, [(470000, 450000, "target"), (520000, 500000, "redline")], "ru")
    assert "470" not in out and "520" not in out, out
    assert "450" in out and "500" in out, out
    missing = _retarget("Начните с вопросов.", [(470000, 450000, "target")], "ru")
    assert missing.startswith("Вы уточнили числа: цель — 450"), missing
