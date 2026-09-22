import asyncio
import json
import sqlite3
from concurrent.futures import ThreadPoolExecutor

import pytest
from fastapi.testclient import TestClient

from app import attestation, engine
from app.main import app
from app.realtime.endpoint import _build_session, SessionInit
from app.session import store
from tests.test_reference_games import PRINCIPLED
from tests.test_realtime_integration import _open, _turn


@pytest.fixture
def registry(monkeypatch, tmp_path):
    path = tmp_path / "attestations.sqlite"
    monkeypatch.setenv("NEGO_ATTESTATION_KEY", "ab" * 32)
    monkeypatch.setenv("NEGO_ATTESTATION_DB", str(path))
    return path


def finished(mode="exam", **kwargs):
    session, error = asyncio.run(_build_session(SessionInit(scenarioId="supplier", gameMode=mode, **kwargs)))
    assert error is None
    for move in PRINCIPLED["supplier"]["ru"]:
        session.engine_session.turn += 1
        engine.apply_move(session.engine_session, engine.analyze(move), move)
        if session.engine_session.state.status != "active":
            break
    return session


def test_registry_signs_server_score_is_durable_and_idempotent(registry):
    session = finished()
    signed = attestation.issue(session)
    assert signed and signed["record"]["grade"] in ("A", "B")
    assert signed["record"]["overall"] == engine.to_debrief(session.engine_session)["overall"]
    assert attestation.issue(session) == signed
    assert session.session_id not in json.dumps(signed)
    store.drop(session.session_id)
    assert attestation.lookup(signed["record"]["id"]) == signed
    client = TestClient(app)
    url = "/api/attestations/" + signed["record"]["id"]
    assert client.get(url).json() == {"valid": True, **signed}
    page = client.get(url + "/document")
    assert page.status_code == 200
    assert signed["record"]["id"] in page.text
    assert "Личность не удостоверена" in page.text
    assert client.post(url, json={"grade": "A", "overall": 100}).status_code == 405
    assert client.get("/api/attestations/att_" + "0" * 32).status_code == 404


def test_concurrent_delivery_keeps_one_identifier(registry):
    session = finished()
    with ThreadPoolExecutor(max_workers=2) as pool:
        first, second = list(pool.map(lambda _: attestation.issue(session), range(2)))
    assert first == second
    with sqlite3.connect(registry) as db:
        assert db.execute("SELECT count(*) FROM attestations").fetchone()[0] == 1


@pytest.mark.parametrize("field,value", [("overall", 100), ("grade", "F"), ("id", "att_" + "0" * 32)])
def test_modified_registry_record_is_never_verified(registry, field, value):
    signed = attestation.issue(finished())
    record = {**signed["record"], field: value}
    # Ensure even the 100 mutation differs from the earned result.
    assert record != signed["record"]
    with sqlite3.connect(registry) as db:
        db.execute("UPDATE attestations SET record=?", (attestation._canonical(record),))
    response = TestClient(app).get("/api/attestations/" + signed["record"]["id"])
    assert response.status_code == 503
    assert "valid" not in response.json()


def test_wrong_key_and_disabled_config_fail_closed(registry, monkeypatch):
    signed = attestation.issue(finished())
    monkeypatch.setenv("NEGO_ATTESTATION_KEY", "cd" * 32)
    assert TestClient(app).get("/api/attestations/" + signed["record"]["id"]).status_code == 503
    monkeypatch.delenv("NEGO_ATTESTATION_KEY")
    assert attestation.issue(finished()) is None


@pytest.mark.parametrize("mode,kwargs", [("practice", {}), ("drill", {}), ("exam", {"reputation": 100})])
def test_ineligible_run_cannot_issue(registry, mode, kwargs):
    assert attestation.issue(finished(mode, **kwargs)) is None


def test_active_and_failed_exam_cannot_issue(registry):
    session, _ = asyncio.run(_build_session(SessionInit(scenarioId="supplier", gameMode="exam")))
    assert attestation.issue(session) is None
    for move in ["Ваша цена смешна и некомпетентна.", "У вас нет выбора, иначе уходим. Ультиматум.", "Требую немедленно снизить, иначе разрываем."]:
        session.engine_session.turn += 1
        engine.apply_move(session.engine_session, engine.analyze(move), move)
    assert attestation.issue(session) is None


def test_resume_cannot_promote_practice_or_demote_exam(registry):
    for mode, requested in [("practice", "exam"), ("exam", "practice")]:
        session = finished(mode)
        resumed, _ = asyncio.run(_build_session(SessionInit(resume=session.session_id, gameMode=requested)))
        assert resumed.game_mode == mode
        signed = attestation.issue(resumed)
        assert bool(signed) == (mode == "exam")
        if mode == "exam":
            assert not any(vars(resumed.layers).values())


def test_completed_exam_resume_recovers_same_document(registry):
    session = finished()
    signed = attestation.issue(session)
    with ThreadPoolExecutor(max_workers=1) as pool, TestClient(app).websocket_connect("/v1/realtime?mode=text") as ws:
        _open(ws, mode="practice", resume=session.session_id)
        def receive():
            for _ in range(20):
                event = ws.receive_json()
                if event["type"] == "debrief":
                    return event
            raise AssertionError("No restored debrief")
        event = pool.submit(receive).result(timeout=2)
        assert event["type"] == "debrief"
        assert event["debrief"]["attestation"] == signed


@pytest.mark.parametrize("broken_registry", [False, True])
def test_full_websocket_exam_delivers_evidence_or_safe_failure(registry, monkeypatch, broken_registry):
    if broken_registry:
        monkeypatch.setenv("NEGO_ATTESTATION_DB", str(registry / "missing" / "file.sqlite"))
    with TestClient(app).websocket_connect("/v1/realtime?mode=text") as ws:
        _open(ws, mode="exam")
        for move in PRINCIPLED["supplier"]["ru"]:
            events = _turn(ws, move)
            if events["engine.state"]["state"]["status"] != "active":
                break
        for _ in range(20):
            event = ws.receive_json()
            if event["type"] == "debrief":
                break
        assert event["type"] == "debrief"
        deb = event["debrief"]
        assert deb["grade"] in ("A", "B")
        if broken_registry:
            assert deb["attestation"] is None
        else:
            signed = deb["attestation"]
            assert signed["record"]["overall"] == deb["overall"]
            assert attestation.lookup(signed["record"]["id"]) == signed
