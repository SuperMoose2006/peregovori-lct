"""test_review_protocol.py — «Глубокий разбор» на проводе: кнопка → прогресс → отчёт.

Сам разбор подменён (его проверяет `test_review_runner.py`); здесь — правила
двери: когда разбор можно, когда нельзя и что говорится в отказе, что готовый
отчёт не пересчитывается за второй счёт и что запись после него выбрасывается.
"""

from __future__ import annotations

import asyncio
import threading

import pytest
from fastapi.testclient import TestClient

import app.realtime.endpoint as endpoint_module
from app.main import app
from app.providers.openrouter import chat as orchat
from app.realtime import limits
from app.review import runner

_BREAKDOWN = ["Ваша цена смешна и некомпетентна.",
              "У вас нет выбора, иначе уходим. Ультиматум.",
              "Требую немедленно снизить, иначе разрываем."]


@pytest.fixture()
def live(monkeypatch):
    built: list = []
    original = endpoint_module._build_session

    async def spy(payload):
        session, problem = await original(payload)
        if session is not None:
            built.append(session)
        return session, problem

    monkeypatch.setattr(endpoint_module, "_build_session", spy)
    return TestClient(app), built


def _open(ws, **payload) -> dict:
    assert ws.receive_json()["type"] == "session.queue_done"
    ws.send_json({"type": "session.init", "payload": {"scenarioId": "supplier", "lang": "ru", **payload}})
    created = ws.receive_json()
    assert created["type"] == "session.created"
    return created


def _finish(ws) -> None:
    """Сорвать партию тремя грубостями и дождаться разбора."""
    for move in _BREAKDOWN:
        ws.send_json({"type": "input.append", "input": {"text": move}})
        ws.send_json({"type": "input.commit"})
        for _ in range(80):
            event = ws.receive_json()
            if event["type"] == "debrief":
                return
            if event["type"] == "response.done":
                break
    for _ in range(20):
        if ws.receive_json()["type"] == "debrief":
            return
    raise AssertionError("партия не закрылась")


def _until(ws, kind: str, limit: int = 40) -> list[dict]:
    seen = []
    for _ in range(limit):
        event = ws.receive_json()
        seen.append(event)
        if event["type"] == kind or (event["type"] == "error" and kind == "error"):
            return seen
    raise AssertionError(f"не дождались {kind}: {[e['type'] for e in seen]}")


def _fake_review(monkeypatch, *, gate: threading.Event | None = None, fail: bool = False,
                 agents_ok: int = 3, content_ok: int | None = None):
    calls = {"n": 0}

    async def fake(facts, tape, *, progress, **kw):
        calls["n"] += 1
        progress({"type": "review.progress", "done": 1, "total": 2, "agent": "confidence"})
        while gate is not None and not gate.is_set():
            await asyncio.sleep(0.01)
        if fail:
            raise RuntimeError("агенты упали")
        progress({"type": "review.progress", "done": 2, "total": 2, "agent": "competency"})
        assert facts["lines"], "разбор получил разговор"
        return {"version": 1, "affects_score": False, "agents_ok": agents_ok, "agents_total": 10,
                "channels": {"content": {"state": "ok" if (content_ok if content_ok is not None else agents_ok) else "failed",
                                         "agents_ok": content_ok if content_ok is not None else agents_ok,
                                         "agents_total": 8}}}

    monkeypatch.setattr(runner, "run_review", fake)
    return calls


def test_offline_the_door_says_why(live):
    client, _ = live
    with client.websocket_connect("/v1/realtime?mode=text") as ws:
        created = _open(ws)
        assert created["capabilities"]["review"] is False
        _finish(ws)
        ws.send_json({"type": "review.request"})
        err = _until(ws, "error")[-1]["error"]
        assert err["code"] == "review_unavailable" and "моделями" in err["message"]


def test_review_runs_once_and_the_media_is_dropped(live, monkeypatch):
    client, built = live
    calls = _fake_review(monkeypatch)
    with client.websocket_connect("/v1/realtime?mode=text") as ws:
        _open(ws)
        monkeypatch.setattr(orchat, "available", lambda: True)
        ws.send_json({"type": "review.request"})
        assert _until(ws, "error")[-1]["error"]["code"] == "review_not_finished"
        monkeypatch.setattr(orchat, "available", lambda: False)
        _finish(ws)
        monkeypatch.setattr(orchat, "available", lambda: True)

        built[0].tape.frame("кадр", turn=1)
        ws.send_json({"type": "review.request"})
        seen = _until(ws, "review.done")
        assert [e["done"] for e in seen if e["type"] == "review.progress"] == [1, 2]
        assert seen[-1]["review"]["affects_score"] is False

        ws.send_json({"type": "review.request"})
        again = _until(ws, "review.done")[-1]
        assert again["cached"] is True and calls["n"] == 1, "второй раз — тот же отчёт, не второй счёт"
        ws.send_json({"type": "session.close", "reason": "test"})
    assert built[0].tape.media_discarded and built[0].tape.frames == []


def test_a_review_with_no_agent_alive_is_not_kept(live, monkeypatch):
    client, built = live
    calls = _fake_review(monkeypatch, agents_ok=0)
    with client.websocket_connect("/v1/realtime?mode=text") as ws:
        _open(ws)
        _finish(ws)
        monkeypatch.setattr(orchat, "available", lambda: True)
        built[0].tape.frame("кадр", turn=1)
        ws.send_json({"type": "review.request"})
        _until(ws, "review.done")
        ws.send_json({"type": "review.request"})
        _until(ws, "review.done")
        ws.send_json({"type": "session.close", "reason": "test"})
    assert calls["n"] == 2, "сбой — не разбор: просьбу повторить исполняют"
    assert not built[0].tape.media_discarded and built[0].tape.frames


def test_a_review_where_only_the_face_answered_is_not_kept(live, monkeypatch):
    """Ревью 19.10: модель смысла лежит, зрение отвечает — `agents_ok` = 1, и
    отчёт без единой компетенции запоминался навсегда, а запись стиралась:
    повторить было нечем. Разбор — это смысл; без него это сбой."""
    client, built = live
    calls = _fake_review(monkeypatch, agents_ok=1, content_ok=0)
    with client.websocket_connect("/v1/realtime?mode=text") as ws:
        _open(ws)
        _finish(ws)
        monkeypatch.setattr(orchat, "available", lambda: True)
        built[0].tape.frame("кадр", turn=1)
        ws.send_json({"type": "review.request"})
        _until(ws, "review.done")
        ws.send_json({"type": "review.request"})
        again = _until(ws, "review.done")[-1]
        assert not again.get("cached")
        ws.send_json({"type": "session.close", "reason": "test"})
    assert calls["n"] == 2 and not built[0].tape.media_discarded


def test_a_second_press_while_running_is_busy_and_a_crash_is_said(live, monkeypatch):
    client, built = live
    gate = threading.Event()
    _fake_review(monkeypatch, gate=gate, fail=True)
    with client.websocket_connect("/v1/realtime?mode=text") as ws:
        _open(ws)
        _finish(ws)
        monkeypatch.setattr(orchat, "available", lambda: True)
        ws.send_json({"type": "review.request"})
        assert _until(ws, "review.progress")[-1]["done"] == 1
        ws.send_json({"type": "review.request"})
        assert _until(ws, "error")[-1]["error"]["code"] == "review_busy"
        gate.set()
        err = _until(ws, "error")[-1]["error"]
        assert err["code"] == "review_failed" and err["type"] == "review"
        ws.send_json({"type": "session.close", "reason": "test"})
    assert built[0].tape.report is None


def test_the_wallet_is_asked_first(live, monkeypatch):
    client, _ = live
    calls = _fake_review(monkeypatch)
    with client.websocket_connect("/v1/realtime?mode=text") as ws:
        _open(ws)
        _finish(ws)
        monkeypatch.setattr(orchat, "available", lambda: True)
        monkeypatch.setattr(limits, "paid_slot", lambda host: False)
        ws.send_json({"type": "review.request"})
        err = _until(ws, "error")[-1]["error"]
        assert err["code"] == "review_rate_limited" and err["type"] == "rate_limited"
    assert calls["n"] == 0


@pytest.mark.parametrize("mode", ["exam", "drill"])
def test_graded_games_have_no_review(live, monkeypatch, mode):
    client, built = live
    monkeypatch.setattr(orchat, "available", lambda: True)
    monkeypatch.setattr(endpoint_module, "_wire", _offline_wire(endpoint_module._wire, monkeypatch))
    with client.websocket_connect("/v1/realtime?mode=text") as ws:
        created = _open(ws, gameMode=mode)
        assert created["capabilities"]["review"] is False
        ws.send_json({"type": "review.request"})
        err = _until(ws, "error")[-1]["error"]
        assert err["code"] == "review_unavailable" and "зачёт" in err["message"]
        ws.send_json({"type": "session.close", "reason": "test"})
    assert built[0].tape is None


def _offline_wire(original, monkeypatch):
    """Сборка партии без сети, даже когда `available` подменён на «да»."""
    def wire(session, **kw):
        monkeypatch.setattr(orchat, "available", lambda: False)
        try:
            return original(session, **kw)
        finally:
            monkeypatch.setattr(orchat, "available", lambda: True)
    return wire


def test_capabilities_offer_the_review_when_models_are_there(live, monkeypatch):
    client, _ = live
    monkeypatch.setattr(orchat, "available", lambda: True)
    monkeypatch.setattr(endpoint_module, "_wire", _offline_wire(endpoint_module._wire, monkeypatch))
    with client.websocket_connect("/v1/realtime?mode=text") as ws:
        created = _open(ws)
        assert created["capabilities"]["review"] is True
        ws.send_json({"type": "session.close", "reason": "test"})
