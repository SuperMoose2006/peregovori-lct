"""Перебивание — остановка звука, не отмена хода (CLAUDE.md, «Три правила
протокола»).

Найдено после аудита 17.10: `interrupt()` гасит задачу реплики, а ход эту
задачу ЖДЁТ — и отмена приходила в сам ход. Закрывший стол ход, перебитый на
«Отлично, по рукам…» (кнопка «Перебить» или голос поверх), так и не отправлял
разбор: клиент висел на «Готовим итоговый разбор», без опыта и свидетельства.
"""
import asyncio

import pytest

from app import engine
from app.orchestrator import negotiation
from app.providers.openrouter import chat
from app.realtime.session import RealtimeSession

CLOSING = "Согласен на вашу цену. Договорились."


def _table(monkeypatch, sid: str):
    monkeypatch.setattr(negotiation, "judge_enabled_for", lambda mode: False)
    session = RealtimeSession(session_id=sid, lang="ru",
                              engine_session=engine.create_session("supplier", "ru"))
    events: list[dict] = []
    monkeypatch.setattr(session.bus, "publish", events.append)
    started = asyncio.Event()

    async def stream(*args, **kwargs):
        yield "Отлично, "
        started.set()
        await asyncio.Event().wait()  # модель «думает» дальше, пока не перебьют

    monkeypatch.setattr(chat, "available", lambda: True)
    monkeypatch.setattr(chat, "stream", stream)
    orch = negotiation.NegotiationOrchestrator(session)

    async def no_note(*args):
        return None

    monkeypatch.setattr(orch, "_debrief_note", no_note)
    return session, events, orch, started


@pytest.mark.asyncio
@pytest.mark.parametrize("reason", ["client_cancel", "barge_in"])
async def test_interrupting_the_closing_reply_still_sends_the_debrief(monkeypatch, reason):
    session, events, orch, started = _table(monkeypatch, f"keep_{reason}")
    turn = asyncio.create_task(orch.on_player_turn(CLOSING))
    await asyncio.wait_for(started.wait(), 1)
    await orch.interrupt(reason=reason)
    await asyncio.wait_for(turn, 1)
    assert session.engine_session.state.status == "agreement"
    types = [e["type"] for e in events]
    assert types.count("debrief") == 1, types
    assert "generation.cancelled" in types


@pytest.mark.asyncio
async def test_cancelling_the_turn_itself_still_cancels_it(monkeypatch):
    """Обрыв и вытеснение гасят САМ ход (`_Work.aclose`) — это отмена, и она
    обязана дойти: платить за ход ушедшего сокета не за что."""
    session, events, orch, started = _table(monkeypatch, "keep_disconnect")
    turn = asyncio.create_task(orch.on_player_turn(CLOSING))
    await asyncio.wait_for(started.wait(), 1)
    turn.cancel()
    with pytest.raises(asyncio.CancelledError):
        await turn
    assert "debrief" not in [e["type"] for e in events]
