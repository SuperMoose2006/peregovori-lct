import asyncio

import pytest

from app.realtime import endpoint
from app.realtime.events import SessionInit


@pytest.mark.asyncio
@pytest.mark.parametrize("failure", ["hang", "error"])
async def test_failed_writer_closes_for_resume_without_dropping_game(monkeypatch, failure):
    monkeypatch.setattr(endpoint, "WS_SEND_TIMEOUT_S", 0.01, raising=False)
    session, problem = await endpoint._build_session(SessionInit(scenarioId="supplier"))
    assert problem is None
    original = session.engine_session
    session.bus.publish({"type": "engine.state"})

    class Socket:
        closed = None
        cancelled = False
        async def send_json(self, event):
            try:
                if failure == "error":
                    raise OSError("private network detail")
                await asyncio.sleep(60)
            finally:
                self.cancelled = True
        async def close(self, code=1000): self.closed = code

    socket = Socket()
    task = asyncio.create_task(endpoint._pump(socket, session))
    try:
        done, _ = await asyncio.wait({task}, timeout=0.2)
        assert task in done, "blocked send kept the writer alive"
        await task
        assert socket.closed == 1013, "failed writer left the reader connected"
        assert socket.cancelled
        assert session.engine_session is original
    finally:
        task.cancel()
        await asyncio.gather(task, return_exceptions=True)


@pytest.mark.asyncio
async def test_slow_close_is_also_bounded(monkeypatch):
    monkeypatch.setattr(endpoint, "WS_SEND_TIMEOUT_S", 0.01, raising=False)
    monkeypatch.setattr(endpoint, "WS_CLOSE_TIMEOUT_S", 0.01, raising=False)
    session, _ = await endpoint._build_session(SessionInit(scenarioId="supplier"))
    session.bus.publish({"type": "engine.state"})
    closing = asyncio.Event()

    class Socket:
        async def send_json(self, event): raise OSError()
        async def close(self, code=1000):
            closing.set()
            await asyncio.sleep(60)

    await asyncio.wait_for(endpoint._pump(Socket(), session), timeout=0.2)
    assert closing.is_set()
