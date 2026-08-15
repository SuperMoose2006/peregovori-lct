"""Black-box WebSocket integration test over the turn protocol.

Exercises the full stack (main.py → views → engine → ai fallback) through the
public protocol only — independent of engine internals. Uses FastAPI's
TestClient (Starlette) which supports websocket_connect.

AI backend stays 'off' here so opponent lines are the deterministic templated
fallback → fully offline and reproducible.
"""

import os
os.environ.setdefault("NEGO_AI", "off")

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health():
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json()["ok"] is True


def test_scenarios_bilingual():
    for lang in ("ru", "en"):
        r = client.get(f"/api/scenarios?lang={lang}")
        assert r.status_code == 200
        scen = r.json()["scenarios"]
        assert len(scen) >= 4
        assert all(s["title"] and s["headline_unit"] is not None for s in scen)


def test_full_principled_game_reaches_agreement():
    with client.websocket_connect("/ws") as ws:
        ws.send_json({"type": "start", "scenarioId": "supplier", "lang": "ru", "mode": "practice"})
        greet = ws.receive_json()
        assert greet["type"] == "greeting"
        assert greet["state"]["status"] == "active"
        assert greet["state"]["offer_opp"] == 100

        moves = [
            "Здравствуйте! Расскажите, с какими сложностями по загрузке вы сталкиваетесь?",
            "Понимаю вас. А что для вас важнее всего в этой сделке и почему?",
            "Чем грозит нестабильная загрузка, сколько теряете, если так продолжится?",
            "По рыночным данным справедливая цена ниже, потому что это отраслевой стандарт.",
            "Если дадим годовой контракт и предоплату, сможете подвинуться до 86?",
            "Договорились на 86.",
        ]
        debrief = None
        for m in moves:
            ws.send_json({"type": "turn", "text": m})
            opp = ws.receive_json()
            assert opp["type"] == "opponent"
            assert "state" in opp and "analysis" in opp and "deltas" in opp
            if opp["state"]["status"] != "active":
                debrief = ws.receive_json()
                break
        assert debrief is not None and debrief["type"] == "debrief"
        assert debrief["debrief"]["grade"] in ("A", "B")


def test_hint_returns_text():
    with client.websocket_connect("/ws") as ws:
        ws.send_json({"type": "start", "scenarioId": "salary", "lang": "en", "mode": "practice"})
        ws.receive_json()
        ws.send_json({"type": "hint"})
        hint = ws.receive_json()
        assert hint["type"] == "hint"
        assert isinstance(hint["text"], str) and len(hint["text"]) > 0


def test_aggressive_game_breaks_down():
    with client.websocket_connect("/ws") as ws:
        ws.send_json({"type": "start", "scenarioId": "supplier", "lang": "ru", "mode": "practice"})
        ws.receive_json()
        got_debrief = None
        for m in ["Ваша цена смешна и некомпетентна.",
                  "У вас нет выбора, иначе уходим. Ультиматум.",
                  "Требую немедленно снизить, иначе разрываем."]:
            ws.send_json({"type": "turn", "text": m})
            opp = ws.receive_json()
            if opp["state"]["status"] != "active":
                got_debrief = ws.receive_json()
                break
        assert got_debrief is not None
        assert got_debrief["debrief"]["status"] == "breakdown"
