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


def test_campaign_start_applies_reputation():
    """Репутация из прошлых актов приезжает в стартовое доверие оппонента.

    Через realtime-протокол: старая ручка `/ws` удалена, а инвариант — нет.
    """
    with client.websocket_connect("/v1/realtime?mode=text") as ws:
        assert ws.receive_json()["type"] == "session.queue_done"
        ws.send_json({"type": "session.init", "payload": {
            "scenarioId": "conflict", "lang": "ru",
            "gameMode": "campaign", "reputation": 100}})
        created = ws.receive_json()
        assert created["type"] == "session.created"
        # базовое доверие в «конфликте» — 40; +100 репутации → +12 → ~52
        assert created["state"]["trust"] > 45
