"""Tests for campaign mode: catalog endpoint + reputation carry."""

import os
os.environ.setdefault("NEGO_AI", "off")

from fastapi.testclient import TestClient
from app.main import app
from app import engine, views

client = TestClient(app)


def test_campaigns_endpoint_bilingual():
    for lang in ("ru", "en"):
        r = client.get(f"/api/campaigns?lang={lang}")
        assert r.status_code == 200
        camps = r.json()["campaigns"]
        assert len(camps) >= 1
        c = camps[0]
        assert c["stages"] and len(c["stages"]) == 4
        # every stage references a real scenario, with narrative
        for st in c["stages"]:
            assert engine.by_id(st["scenario_id"]) is not None
            assert st["act"] and st["intro"] and st["title"]


def test_reputation_nudges_initial_trust():
    base = engine.create_session("supplier", "ru").state.trust
    up = engine.create_session("supplier", "ru")
    views.apply_reputation(up, 100)   # stellar prior result
    down = engine.create_session("supplier", "ru")
    views.apply_reputation(down, -100)  # poor prior result
    assert up.state.trust > base > down.state.trust
    # clamped to ±15
    assert abs(up.state.trust - base) <= 15.001
    assert abs(down.state.trust - base) <= 15.001


def test_campaign_start_over_ws_applies_reputation():
    with client.websocket_connect("/ws") as ws:
        ws.send_json({"type": "start", "scenarioId": "conflict", "lang": "ru",
                      "mode": "campaign", "reputation": 100})
        greet = ws.receive_json()
        assert greet["type"] == "greeting"
        # conflict base trust is 40; +100 reputation → +12 → ~52
        assert greet["state"]["trust"] > 45
