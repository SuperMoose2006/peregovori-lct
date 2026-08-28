"""Тесты устойчивости: обрыв связи, падение ИИ, отсутствие сети.

Общий принцип, который здесь проверяется: **состояние игры держит движок, а не
соединение и не облако**. Всё, что может отвалиться, отваливается в сторону
шаблонного фолбэка, а партия продолжается.
"""

from __future__ import annotations

import asyncio

import pytest
from fastapi.testclient import TestClient

from app import engine
from app.main import app
from app.orchestrator.negotiation import NegotiationOrchestrator
from app.realtime.session import RealtimeSession
from app.session import SessionStore, store


# ---------------------------------------------------------------------------
# Переподключение
# ---------------------------------------------------------------------------

def test_dropped_socket_keeps_the_game_alive():
    """Обрыв сокета не должен стирать партию.

    Раньше сессия удалялась в `finally`, и человек после переподключения молча
    начинал заново, потеряв всё, что наговорил. Это хуже честной ошибки.
    """
    client = TestClient(app)
    with client.websocket_connect("/v1/realtime?mode=text") as ws:
        ws.receive_json()
        ws.send_json({"type": "session.init",
                      "payload": {"scenarioId": engine.SCENARIOS[0].id, "lang": "ru"}})
        created = ws.receive_json()
        session_id = created["session_id"]

        ws.send_json({"type": "input.append", "input": {"text": "Что для вас здесь важнее всего?"}})
        ws.send_json({"type": "input.commit"})
        for _ in range(12):
            if ws.receive_json()["type"] == "response.done":
                break
    # Сокет закрыт БЕЗ `session.close` — то есть оборвался.

    survived = store.get(session_id)
    assert survived is not None, "партия исчезла вместе с сокетом"
    assert survived.turn == 1, "ход потерян"


def test_resume_continues_the_same_game():
    """Возвращение по `resume` продолжает ту же партию с того же хода."""
    client = TestClient(app)
    with client.websocket_connect("/v1/realtime?mode=text") as ws:
        ws.receive_json()
        ws.send_json({"type": "session.init",
                      "payload": {"scenarioId": engine.SCENARIOS[0].id, "lang": "ru"}})
        created = ws.receive_json()
        session_id = created["session_id"]
        opening_price = created["state"]["offer_opp"]

        # Реплика обязана СДВИНУТЬ цену, иначе тест ниже проверяет не сохранение
        # партии, а совпадение двух нулей: движок больше не двигает предложение
        # без повода, и общий вопрос таким поводом не является.
        ws.send_json({"type": "input.append",
                      "input": {"text": "Почему для вас так важна стабильная загрузка производства?"}})
        ws.send_json({"type": "input.commit"})
        state_after = None
        for _ in range(12):
            event = ws.receive_json()
            if event["type"] == "engine.state":
                state_after = event["state"]
            if event["type"] == "response.done":
                break

    with client.websocket_connect("/v1/realtime?mode=text") as ws:
        ws.receive_json()
        ws.send_json({"type": "session.init", "payload": {
            "scenarioId": engine.SCENARIOS[0].id, "lang": "ru", "resume": session_id}})
        resumed = ws.receive_json()

        assert resumed["session_id"] == session_id, "вернулись не в ту партию"
        assert resumed["resumed"] is True
        assert resumed["state"] == state_after, "шкалы после возвращения разошлись"
        assert resumed["state"]["offer_opp"] != opening_price, "цена откатилась к стартовой"

        ws.send_json({"type": "session.close", "reason": "test"})


def test_resume_of_an_unknown_session_starts_a_fresh_game():
    """Срок ожидания вышел — начинаем новую партию, а не показываем ошибку."""
    client = TestClient(app)
    with client.websocket_connect("/v1/realtime?mode=text") as ws:
        ws.receive_json()
        ws.send_json({"type": "session.init", "payload": {
            "scenarioId": engine.SCENARIOS[0].id, "lang": "ru", "resume": "sess_нет-такой"}})
        created = ws.receive_json()
        assert created["type"] == "session.created"
        assert created["resumed"] is False
        ws.send_json({"type": "session.close", "reason": "test"})


def test_explicit_close_removes_the_session_immediately():
    """Человек сказал «закончил» — ждать возвращения незачем."""
    client = TestClient(app)
    with client.websocket_connect("/v1/realtime?mode=text") as ws:
        ws.receive_json()
        ws.send_json({"type": "session.init",
                      "payload": {"scenarioId": engine.SCENARIOS[0].id, "lang": "ru"}})
        session_id = ws.receive_json()["session_id"]
        ws.send_json({"type": "session.close", "reason": "user_stop"})
        ws.receive_json()
    assert store.get(session_id) is None


def test_released_session_expires():
    """Брошенная сессия не живёт вечно: иначе память течёт с каждой вкладкой."""
    local = SessionStore()
    local.put("sess_x", object())
    local.release("sess_x")
    assert local.claim("sess_x") is not None, "до истечения срока сессия должна возвращаться"

    local.release("sess_x")
    local._expiry["sess_x"] = 0.0   # срок вышел
    assert local.claim("sess_x") is None
    assert local.get("sess_x") is None


# ---------------------------------------------------------------------------
# Падение ИИ
# ---------------------------------------------------------------------------

def _session():
    eng = engine.create_session(engine.SCENARIOS[0].id, "ru")
    return RealtimeSession(session_id="sess_fail", engine_session=eng, lang="ru")


def test_ai_failure_does_not_break_the_game(monkeypatch):
    """Мозг оппонента упал — движок всё равно посчитал ход, а оппонент ответил.

    Шаблонная реплика движка здесь не «запасной план на случай беды», а базовая
    линия, на которой продукт играется целиком.
    """
    from app.providers.openrouter import chat as orchat

    monkeypatch.setattr(orchat, "available", lambda: True)

    async def explode(*args, **kwargs):
        raise RuntimeError("облако отвалилось")

    monkeypatch.setattr(orchat, "complete", explode)

    def explode_stream(*args, **kwargs):
        raise RuntimeError("облако отвалилось")

    monkeypatch.setattr(orchat, "stream", explode_stream)

    session = _session()
    events: list[dict] = []
    monkeypatch.setattr(session.bus, "publish", events.append)
    orchestrator = NegotiationOrchestrator(session)

    asyncio.run(orchestrator.on_player_turn("Что для вас важнее всего в этой сделке?"))

    assert session.engine_session.turn == 1, "движок не посчитал ход"
    states = [e for e in events if e["type"] == "engine.state"]
    assert states, "истина движка не доехала"
    done = [e for e in events if e["type"] == "response.done"]
    assert done and done[0]["text"], "оппонент промолчал вместо шаблонной реплики"


def test_judge_failure_falls_back_to_the_keyword_score(monkeypatch):
    """Судья не ответил — ход считается по детерминированному keyword-баллу."""
    from app.orchestrator import negotiation as module

    monkeypatch.setattr(module, "judge_enabled", lambda: True)

    async def explode(*args, **kwargs):
        raise RuntimeError("судья недоступен")

    monkeypatch.setattr(module, "judge_turn", explode)

    session = _session()
    events: list[dict] = []
    monkeypatch.setattr(session.bus, "publish", events.append)

    asyncio.run(NegotiationOrchestrator(session).on_player_turn(
        "Давайте опираться на объективные рыночные данные."))

    assert session.engine_session.turn == 1
    completed = [e for e in events if e["type"] == "judge.completed"]
    assert completed and completed[0]["semantic"] is False, \
        "падение судьи должно быть видно клиенту, а не спрятано"
    assert [e for e in events if e["type"] == "engine.state"], "ход не посчитан"


def test_offline_game_is_fully_playable():
    """Без облака партия играется от приветствия до разбора.

    `conftest.py` держит `NEGO_AI=off`, так что это и есть офлайн-путь.
    """
    session = _session()
    events: list[dict] = []
    session.bus.publish = events.append  # type: ignore[method-assign]
    orchestrator = NegotiationOrchestrator(session)

    lines = [
        "Что для вас важнее всего в этой сделке?",
        "Если возьмём монтаж на себя, вы подвинетесь по цене?",
        "По рынку аналоги идут дешевле — давайте опираться на них.",
    ]
    for line in lines:
        asyncio.run(orchestrator.on_player_turn(line))

    assert session.engine_session.turn == len(lines)
    replies = [e for e in events if e["type"] == "response.done"]
    assert len(replies) == len(lines)
    assert all(r["text"] for r in replies), "офлайн оппонент обязан говорить"

    score = engine.score_session(session.engine_session)
    assert 0 <= score["overall"] <= 100
    assert score["grade"] in ("A", "B", "C", "D", "F")
