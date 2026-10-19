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


def _greeting(average: float | None, game_mode: str = "campaign", total: float | None = None) -> str:
    """`average` — средний акт (средний балл минус 50), по нему приветствие;
    `total` — накопленная сумма, она только сдвигает доверие."""
    with client.websocket_connect("/v1/realtime?mode=text") as ws:
        ws.receive_json()                      # session.queue_done
        ws.send_json({"type": "session.init", "payload": {
            "scenarioId": "supplier", "lang": "ru", "gameMode": game_mode,
            "reputation": total if total is not None else average,
            "reputationAvg": average, "layers": {},
        }})
        return ws.receive_json().get("greeting") or ""


def test_good_reputation_precedes_the_player():
    assert "рассказывали" in _greeting(40).lower(), "высокая репутация должна звучать в приветствии"


def test_bad_reputation_precedes_the_player():
    low = _greeting(-30).lower()
    assert "рассказывали" in low or "непросто" in low, "низкая репутация тоже должна звучать"


def test_neutral_reputation_says_nothing():
    """Первая партия и ровная игра (средний акт C) — без вступления: иначе
    оппонент «наслышан» о том, чего ещё не было."""
    assert _greeting(None).startswith("Здравствуйте")
    assert _greeting(10).startswith("Здравствуйте")


def test_the_greeting_reads_the_average_act_not_the_sum():
    """Найдено после аудита 17.10, решение владельца 19.10: пороги рассчитаны на
    один акт, а читалась СУММА — ровное C на трёх актах (+12 × 3 = 36)
    здоровалось «триумфом». Сумма только сдвигает доверие."""
    assert _greeting(12, total=36).startswith("Здравствуйте")
    assert "рассказывали" in _greeting(40, total=100).lower()


def test_reputation_is_silent_outside_campaign():
    """В тренировке актов не было, значит и репутации взяться неоткуда."""
    assert _greeting(40, game_mode="practice").startswith("Здравствуйте")


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
