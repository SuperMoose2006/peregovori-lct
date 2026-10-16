"""Public socket admission is enforced before a game exists; no network calls."""
import asyncio

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from app.main import app
from app.realtime import admission, endpoint


@pytest.mark.asyncio
async def test_idle_socket_expires_without_session_init(monkeypatch):
    monkeypatch.setattr(admission, "INIT_TIMEOUT_S", 0.01)

    class IdleSocket:
        query_params = {}
        client = None
        closed = None
        events = []
        async def accept(self): pass
        async def send_json(self, event): self.events.append(event)
        async def receive_json(self): await asyncio.sleep(60)
        async def close(self, code=1000, reason=""): self.closed = code

    socket = IdleSocket()
    before = admission.live_websockets()
    task = asyncio.create_task(endpoint.realtime_ws(socket))
    try:
        done, _ = await asyncio.wait({task}, timeout=0.2)
        assert task in done, "socket without session.init remained open"
        await task
        assert socket.closed == 4408
        assert socket.events[-1]["error"]["code"] == "init_timeout"
        assert admission.live_websockets() == before
    finally:
        task.cancel()
        await asyncio.gather(task, return_exceptions=True)


def test_uninitialized_sockets_count_towards_global_cap(monkeypatch):
    monkeypatch.setattr(admission, "MAX_WEBSOCKETS", 1)
    before = admission.live_websockets()
    with TestClient(app) as client:
        with client.websocket_connect("/v1/realtime") as first:
            assert first.receive_json()["type"] == "session.queue_done"
            with pytest.raises(WebSocketDisconnect):
                with client.websocket_connect("/v1/realtime") as second:
                    second.receive_json()
            assert admission.live_websockets() == before + 1
    assert admission.live_websockets() == before


@pytest.mark.asyncio
async def test_invalid_frames_do_not_extend_init_deadline(monkeypatch):
    monkeypatch.setattr(admission, "INIT_TIMEOUT_S", 0.01)

    class NoisySocket:
        query_params = {}
        client = None
        closed = None
        async def accept(self): pass
        async def send_json(self, event): pass
        async def receive_json(self):
            await asyncio.sleep(0.001)
            return {"type": "unknown"}
        async def close(self, code=1000, reason=""): self.closed = code

    socket = NoisySocket()
    await asyncio.wait_for(endpoint.realtime_ws(socket), timeout=0.2)
    assert socket.closed == 4408


def test_initialized_game_outlives_init_deadline(monkeypatch):
    import time
    monkeypatch.setattr(admission, "INIT_TIMEOUT_S", 0.1)
    with TestClient(app) as client:
        with client.websocket_connect("/v1/realtime") as ws:
            ws.receive_json()
            ws.send_json({"type": "session.init", "payload": {"scenarioId": "supplier"}})
            assert ws.receive_json()["type"] == "session.created"
            time.sleep(0.15)
            ws.send_json({"type": "coach.request"})
            assert ws.receive_json()["type"] == "turn.coach"
