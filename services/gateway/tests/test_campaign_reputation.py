"""test_campaign_reputation.py — репутация кампании должна быть ВИДНА, а не только
сдвигать число.

Кампания обещает: репутация переносится между актами. Механика сдвига доверия
работала, но `views.reputation_intro` — готовая, двуязычная строка «наслышан о
вас» — не вызывалась НИОТКУДА. Игрок видел безымянный сдвиг доверия и не мог
понять, откуда он взялся; обещание существовало только в описании режима.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _greeting(reputation: float | None, game_mode: str = "campaign") -> str:
    with client.websocket_connect("/v1/realtime?mode=text") as ws:
        ws.receive_json()                      # session.queue_done
        ws.send_json({"type": "session.init", "payload": {
            "scenarioId": "supplier", "lang": "ru",
            "gameMode": game_mode, "reputation": reputation, "layers": {},
        }})
        return ws.receive_json().get("greeting") or ""


def test_good_reputation_precedes_the_player():
    assert "наслышан" in _greeting(60).lower(), "высокая репутация должна звучать в приветствии"


def test_bad_reputation_precedes_the_player():
    low = _greeting(-60).lower()
    assert "наслышан" in low or "непросто" in low, "низкая репутация тоже должна звучать"


def test_neutral_reputation_says_nothing():
    """Нейтральная и первая партия — без вступления: иначе оппонент «наслышан»
    о том, чего ещё не было."""
    assert _greeting(0).startswith("Здравствуйте")


def test_reputation_is_silent_outside_campaign():
    """В тренировке актов не было, значит и репутации взяться неоткуда."""
    assert _greeting(60, game_mode="practice").startswith("Здравствуйте")


def test_reputation_still_moves_trust():
    """Строка — добавление к сдвигу доверия, а не замена ему."""
    import json
    with client.websocket_connect("/v1/realtime?mode=text") as ws:
        ws.receive_json()
        ws.send_json({"type": "session.init", "payload": {
            "scenarioId": "supplier", "lang": "ru",
            "gameMode": "campaign", "reputation": 60, "layers": {},
        }})
        high = ws.receive_json()["state"]["trust"]
    with client.websocket_connect("/v1/realtime?mode=text") as ws:
        ws.receive_json()
        ws.send_json({"type": "session.init", "payload": {
            "scenarioId": "supplier", "lang": "ru",
            "gameMode": "campaign", "reputation": -60, "layers": {},
        }})
        low = ws.receive_json()["state"]["trust"]
    assert high > low, "репутация обязана двигать стартовое доверие"
