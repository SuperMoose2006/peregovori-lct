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
    client = TestClient(app)
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
    client = TestClient(app)
    with client.websocket_connect("/v1/realtime") as ws:
        ws.receive_json()
        ws.send_json({"type": "session.init", "payload": {"scenarioId": "supplier"}})
        assert ws.receive_json()["type"] == "session.created"
        time.sleep(0.15)
        ws.send_json({"type": "coach.request"})
        assert ws.receive_json()["type"] == "turn.coach"


def test_one_address_cannot_hold_every_socket(monkeypatch):
    """Найдено после аудита 17.10: общий потолок сокетов (128) занимался ДО
    `session.init`, без доли на адрес — один адрес, открывающий сокеты и не
    начинающий партий, держал всех остальных снаружи."""
    monkeypatch.setattr(admission, "MAX_WEBSOCKETS", 100)
    monkeypatch.setattr(admission, "MAX_WEBSOCKETS_PER_HOST", 2)
    a = [admission.acquire("203.0.113.7") for _ in range(2)]
    assert all(a)
    assert admission.acquire("203.0.113.7") is None, "третий сокет того же адреса"
    other = admission.acquire("198.51.100.9")
    assert other is not None, "чужой адрес обязан пройти"
    a[0].release()
    again = admission.acquire("203.0.113.7")
    assert again is not None, "освобождённое место возвращается адресу"
    local = [admission.acquire("127.0.0.1") for _ in range(5)]
    assert all(local), "локальные клиенты (стенд, нагрузочный прибор) не делятся по адресу"
    for lease in [a[1], other, again, *local]:
        lease.release()
    assert admission._per_host == {}


def test_the_socket_gate_reads_the_peer_address():
    import inspect
    src = inspect.getsource(endpoint._admitted)
    assert "admission.acquire(websocket.client.host if websocket.client else \"\")" in src
