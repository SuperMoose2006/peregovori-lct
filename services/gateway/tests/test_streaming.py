"""Поток реплики оппонента: сырые дельты, санитизированный итог.

Контракт, который здесь защищается, один и он важный:

    дельты СЫРЫЕ, а `response.done` — АВТОРИТЕТНЫЙ.

Санитайзер судит реплику целиком: он может отвергнуть её за чужой алфавит, за
выход из роли или за markdown — уже после того, как её текст улетел клиенту
кусками. Поэтому за потоком всегда идёт итоговое событие, и клиент заменяет им
накопленный пузырь. Без этого правила отвергнутая реплика оставалась бы на
экране.

Раньше этот контракт проверялся против `app.ai.graph.stream_opponent_sync`.
Граф удалён вместе со старой ручкой; проверка переехала на оркестратор, потому
что контракт принадлежит протоколу, а не транспорту.
"""

from __future__ import annotations

import asyncio

import pytest

from app import engine
from app.orchestrator.negotiation import NegotiationOrchestrator
from app.realtime.session import RealtimeSession


def _session():
    eng = engine.create_session("supplier", "ru")
    return RealtimeSession(session_id="sess_stream", engine_session=eng, lang="ru")


def _run(chunks: list[str], monkeypatch) -> tuple[list[dict], RealtimeSession]:
    """Прогнать заданный поток токенов через оркестратор."""
    from app.providers.openrouter import chat as orchat

    monkeypatch.setattr(orchat, "available", lambda: True)

    async def fake_stream(*args, **kwargs):
        for chunk in chunks:
            yield chunk

    monkeypatch.setattr(orchat, "stream", fake_stream)

    session = _session()
    events: list[dict] = []
    monkeypatch.setattr(session.bus, "publish", events.append)
    orchestrator = NegotiationOrchestrator(session)
    asyncio.run(orchestrator.on_player_turn("А что для вас важнее всего в этой сделке?"))
    return events, session


def _deltas(events: list[dict]) -> list[str]:
    return [e["text"] for e in events
            if e["type"] == "response.output.delta" and e.get("kind") == "text"]


def _final(events: list[dict]) -> str:
    done = [e for e in events if e["type"] == "response.done"]
    assert done, "авторитетное завершение реплики не пришло"
    return done[0]["text"]


def test_chunks_arrive_in_order_and_join_into_the_line(monkeypatch):
    events, _session = _run(["Хорошо,", " давайте", " обсудим."], monkeypatch)
    assert _deltas(events) == ["Хорошо,", " давайте", " обсудим."]
    assert _final(events) == "Хорошо, давайте обсудим."


def test_a_line_that_fails_the_guards_is_rejected_after_streaming(monkeypatch):
    """Реплика на чужом алфавите отвергается — уже после того, как улетела.

    Это и есть причина, по которой `response.done` авторитетен: запретить
    отправку дельт нельзя (тогда реплика не печаталась бы), а оставить мусор на
    экране — тем более.
    """
    events, _session = _run(["你好", "，这是中文"], monkeypatch)
    assert _deltas(events), "дельты обязаны были уйти — иначе печать не работает"
    final = _final(events)
    assert "你好" not in final, "санитайзер пропустил чужой алфавит"
    assert final, "вместо отвергнутой реплики обязан встать шаблон движка"


def test_a_stream_that_breaks_midway_falls_back(monkeypatch):
    """Обрыв на середине — не катастрофа: остаётся шаблонная реплика движка."""
    from app.providers.openrouter import chat as orchat

    monkeypatch.setattr(orchat, "available", lambda: True)

    async def broken_stream(*args, **kwargs):
        yield "Начал говорить"
        raise RuntimeError("сеть отвалилась")

    monkeypatch.setattr(orchat, "stream", broken_stream)

    session = _session()
    events: list[dict] = []
    monkeypatch.setattr(session.bus, "publish", events.append)
    asyncio.run(NegotiationOrchestrator(session).on_player_turn("Что для вас важно?"))

    assert _final(events), "оппонент обязан что-то сказать даже после обрыва"
    assert session.engine_session.turn == 1, "ход всё равно посчитан"


def test_offline_backend_delivers_the_templated_line_whole(monkeypatch):
    """Без облака реплика приходит целиком, одной дельтой и итогом.

    `conftest.py` держит `NEGO_AI=off`, поэтому это путь по умолчанию в тестах.
    """
    session = _session()
    events: list[dict] = []
    monkeypatch.setattr(session.bus, "publish", events.append)
    asyncio.run(NegotiationOrchestrator(session).on_player_turn(
        "А что для вас важнее всего в этой сделке?"))

    deltas = _deltas(events)
    assert len(deltas) == 1, "офлайн реплика не стримится по токенам"
    assert deltas[0] == _final(events)


def test_every_delta_carries_its_generation(monkeypatch):
    """Без `generation_id` в каждом куске перебивание протекает."""
    events, _session = _run(["Раз", " два"], monkeypatch)
    streamed = [e for e in events if e["type"] == "response.output.delta"]
    assert streamed
    generations = {e.get("generation_id") for e in streamed}
    assert len(generations) == 1 and None not in generations
    assert _final(events) is not None
    done = [e for e in events if e["type"] == "response.done"][0]
    assert done["generation_id"] in generations, "итог принадлежит другому поколению"
