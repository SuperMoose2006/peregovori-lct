import asyncio

import pytest

from app.realtime import endpoint
from app.realtime.events import SessionInit


@pytest.mark.asyncio
async def test_stalled_hint_returns_offline_advice_within_budget(monkeypatch):
    session, problem = await endpoint._build_session(SessionInit(scenarioId="supplier"))
    assert problem is None
    monkeypatch.setattr(endpoint, "HINT_BUDGET_S", 0.01, raising=False)
    monkeypatch.setattr(endpoint.orchat, "available", lambda: True)
    cancelled = asyncio.Event()

    async def stalled(*args, **kwargs):
        try:
            await asyncio.sleep(60)
        finally:
            cancelled.set()

    monkeypatch.setattr(endpoint.orchat, "complete", stalled)
    task = asyncio.create_task(endpoint._send_hint(session))
    try:
        done, _ = await asyncio.wait({task}, timeout=0.2)
        assert task in done, "coach.request never returned its offline fallback"
        await task
        assert cancelled.is_set()
        event = await anext(session.bus.drain())
        assert event["type"] == "turn.coach"
        assert event["text"] == endpoint.views.compute_hint(session.engine_session, session.lang)
    finally:
        task.cancel()
        await asyncio.gather(task, return_exceptions=True)
