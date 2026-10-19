"""Ход читается целиком — до того же предела, что у сокета и композера.

Найдено после аудита 17.10: оркестратор резал ход до 800 знаков при вводе до
2000 (`MAX_TURN_CHARS`, frontend `MAX_INPUT`). Пузырь показывал ход целиком, а
движок и судья видели обрезок: цена в хвосте длинной реплики на стол не
попадала, а офлайн-ядро читало всё (инвариант 8).
"""
import pytest

from app import engine
from app.orchestrator import negotiation
from app.providers.openrouter import chat
from app.realtime.session import MAX_TURN_CHARS, RealtimeSession


@pytest.mark.asyncio
async def test_the_offer_at_the_end_of_a_long_turn_reaches_the_table(monkeypatch):
    monkeypatch.setattr(chat, "available", lambda: False)
    monkeypatch.setattr(negotiation, "judge_enabled_for", lambda mode: False)
    session = RealtimeSession(session_id="long_turn", lang="ru",
                              engine_session=engine.create_session("supplier", "ru"))
    monkeypatch.setattr(session.bus, "publish", lambda e: None)
    text = "Давайте разберёмся спокойно. " * 30 + "Предлагаю 90 рублей за штуку."
    assert 800 < len(text) <= MAX_TURN_CHARS
    await negotiation.NegotiationOrchestrator(session).on_player_turn(text)

    offline = engine.create_session("supplier", "ru")
    offline.turn = 1
    engine.apply_move(offline, engine.analyze(text), text)
    assert session.engine_session.state.offer_player == 90
    assert session.engine_session.state.offer_player == offline.state.offer_player
    assert session.engine_session.log[0]["text"] == text
