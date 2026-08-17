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


def test_no_judge_omits_coach_metadata():
    """With NEGO_AI=off no judge runs → the opponent payload must NOT carry the
    judge-cam keys (frontend then renders nothing)."""
    with client.websocket_connect("/ws") as ws:
        ws.send_json({"type": "start", "scenarioId": "supplier", "lang": "ru", "mode": "practice"})
        ws.receive_json()
        ws.send_json({"type": "turn", "text": "А что для вас важнее всего в этой сделке?"})
        opp = ws.receive_json()
        assert opp["type"] == "opponent"
        assert "coach_techniques" not in opp
        assert "coach_reject" not in opp
        assert "coach" not in opp


def test_judge_cam_surfaces_techniques_and_reject(monkeypatch):
    """With a judge running, a strong line surfaces recognized techniques and
    coach_reject=False; a low-meaning line surfaces coach_reject=True."""
    import app.main as main

    monkeypatch.setattr(main, "judge_enabled", lambda: True)

    def fake_judge(ctx, text, lang, interests, secondary):
        if "важнее" in text:  # strong, genuine interest probe
            return {"arg_score": 82, "interest_targeted": None, "secondary_conceded": None,
                    "criteria_legitimate": True, "note": "Хороший вопрос.",
                    "techniques": ["вскрытие интереса", "объективный критерий"]}
        # buzzword-spam: trips lexicons but low meaning
        return {"arg_score": 18, "interest_targeted": None, "secondary_conceded": None,
                "criteria_legitimate": False, "note": "Похоже на заученную фразу.",
                "techniques": []}

    monkeypatch.setattr(main, "judge_turn", fake_judge)

    with client.websocket_connect("/ws") as ws:
        ws.send_json({"type": "start", "scenarioId": "supplier", "lang": "ru", "mode": "practice"})
        ws.receive_json()

        ws.send_json({"type": "turn", "text": "А что для вас важнее всего в этой сделке?"})
        good = ws.receive_json()
        assert good["coach_techniques"] == ["вскрытие интереса", "объективный критерий"]
        assert good["coach_reject"] is False

        ws.send_json({"type": "turn", "text": "Гарвардский метод BATNA SPIN win-win."})
        spam = ws.receive_json()
        assert spam["coach_techniques"] == []
        assert spam["coach_reject"] is True


def test_turning_points_include_recognized_techniques():
    """views.turning_points surfaces per-turn recognized technique labels when the
    stored player-log entry carries a judge dict with techniques."""
    from app import engine, views
    sess = engine.create_session("supplier", "ru")
    sess.log.append({
        "role": "player", "text": "А что для вас важнее всего?", "turn": 1,
        "deltas": {"trust": 8, "tension": 0, "info": 12, "leverage": 0},
        "judge": {"note": "Хороший вопрос.", "techniques": ["вскрытие интереса"]},
    })
    sess.log.append({
        "role": "player", "text": "Ну ок.", "turn": 2,
        "deltas": {"trust": 1, "tension": 0, "info": 0, "leverage": 0},
        "judge": None,
    })
    tps = views.turning_points(sess, k=2)
    tp1 = next(t for t in tps if t["turn"] == 1)
    assert tp1["coach_techniques"] == ["вскрытие интереса"]
    assert tp1["coach"] == "Хороший вопрос."
    tp2 = next((t for t in tps if t["turn"] == 2), None)
    if tp2 is not None:
        assert "coach_techniques" not in tp2


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
