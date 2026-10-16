import asyncio

import pytest

from app.realtime import bus as bus_module, endpoint
from app.realtime.events import SessionInit


@pytest.mark.asyncio
async def test_overflow_reports_loss_instead_of_silently_losing_response_done(monkeypatch):
    monkeypatch.setattr(bus_module, "_MAX_QUEUE", 2)
    bus = bus_module.EventBus()
    bus.publish({"type": "response.output.delta", "text": "a"})
    bus.publish({"type": "response.output.delta", "text": "b"})
    bus.publish({"type": "response.done"})
    event = await anext(bus.drain())
    assert event["type"] == "error", "overflow silently discarded response.done"
    assert event["error"]["code"] == "output_overflow"


@pytest.mark.asyncio
async def test_overflow_closes_socket_with_retryable_code(monkeypatch):
    monkeypatch.setattr(bus_module, "_MAX_QUEUE", 2)
    session, problem = await endpoint._build_session(SessionInit(scenarioId="supplier"))
    assert problem is None
    for _ in range(3):
        session.bus.publish({"type": "response.output.delta"})

    class Socket:
        closed = None
        events = []
        async def send_json(self, event): self.events.append(event)
        async def close(self, code=1000, reason=""): self.closed = code

    socket = Socket()
    task = asyncio.create_task(endpoint._pump(socket, session))
    try:
        done, _ = await asyncio.wait({task}, timeout=0.2)
        assert task in done, "overflow left the game connected with missing events"
        await task
        assert socket.closed == 1013
        assert socket.events[0]["error"]["code"] == "output_overflow"
    finally:
        task.cancel()
        await asyncio.gather(task, return_exceptions=True)
