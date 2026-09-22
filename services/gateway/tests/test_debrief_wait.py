"""A stalled optional mentor must not hide an earned engine result."""
import asyncio
import pytest
from app import engine
from app.orchestrator import negotiation
from app.realtime.session import RealtimeSession
from app.providers.openrouter import chat

@pytest.mark.asyncio
async def test_hanging_mentor_still_publishes_completed_review(monkeypatch):
    monkeypatch.setattr(chat, "available", lambda: False)
    monkeypatch.setattr(negotiation, "judge_enabled_for", lambda mode: False)
    session = RealtimeSession(session_id="wait_test", engine_session=engine.create_session("supplier", "ru"), lang="ru")
    events = []
    monkeypatch.setattr(session.bus, "publish", events.append)
    orchestrator = negotiation.NegotiationOrchestrator(session)
    await orchestrator.on_player_turn("Согласен на вашу цену. Договорились.")
    original = next(e["debrief"] for e in events if e["type"] == "debrief")
    assert original["status"] == "agreement"
    events.clear()
    cancelled = False
    async def stalled(*args):
        nonlocal cancelled
        try:
            await asyncio.Event().wait()
        finally:
            cancelled = True
    monkeypatch.setattr(chat, "available", lambda: True)
    monkeypatch.setattr(orchestrator, "_debrief_note", stalled)
    monkeypatch.setattr(negotiation, "DEBRIEF_NOTE_BUDGET_S", .02)
    await asyncio.wait_for(orchestrator._send_debrief(), .5)
    assert cancelled
    reviews = [e["debrief"] for e in events if e["type"] == "debrief"]
    assert len(reviews) == 1
    assert reviews[0]["grade"] == original["grade"]
    assert reviews[0]["status"] == original["status"]
