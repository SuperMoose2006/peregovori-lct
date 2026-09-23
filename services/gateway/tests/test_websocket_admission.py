"""Public socket resource bounds, with no provider calls or listening servers."""

from __future__ import annotations

import asyncio
import contextlib

import pytest
from fastapi import WebSocketDisconnect
from fastapi.testclient import TestClient

from app import main
from app.realtime import admission, endpoint, limits
from app.session import store
from .test_takeover_and_limits import _FakeWS, _until

INIT = {"type": "session.init", "payload": {
    "scenarioId": "supplier", "lang": "en", "gameMode": "practice"}}


@pytest.fixture(autouse=True)
def clean():
    assert admission.live_websockets() == 0
    limits.reset()
    yield
    assert admission.live_websockets() == 0
    limits.reset()


class Socket(_FakeWS):
    def __init__(self, *args, failure=None, **kwargs):
        super().__init__(*args, **kwargs)
        self.accepted = False
        self.failure = failure

    async def accept(self):
        if self.failure == "accept":
            raise RuntimeError("accept failed")
        self.accepted = True

    async def send_json(self, data):
        if self.failure == "queue" and data["type"] == "session.queue_done":
            raise RuntimeError("queue send failed")
        await super().send_json(data)

    async def receive_json(self):
        value = await super().receive_json()
        if isinstance(value, Exception):
            raise value
        return value


async def launch(socket):
    task = asyncio.create_task(main.realtime(socket))
    await _until(lambda: socket.last("session.queue_done"))
    return task


async def stop(socket, task):
    socket.drop()
    await asyncio.wait_for(task, 1)


def test_global_cap_covers_preinit_and_initialized_sockets_on_the_actual_route(monkeypatch):
    monkeypatch.setattr(admission, "MAX_WEBSOCKETS", 1)
    client = TestClient(main.app)
    with client.websocket_connect("/v1/realtime") as first:
        assert first.receive_json()["type"] == "session.queue_done"
        for initialized in (False, True):
            if initialized:
                first.send_json(INIT)
                assert first.receive_json()["type"] == "session.created"
            assert admission.live_websockets() == 1
            with pytest.raises(WebSocketDisconnect) as rejected:
                with client.websocket_connect("/v1/realtime"):
                    pytest.fail("over-cap socket was accepted")
            assert rejected.value.code == 4429
        first.send_json({"type": "session.close"})
        assert first.receive_json()["type"] == "session.closed"
    # The released slot is reusable, not a lifetime connection quota.
    with client.websocket_connect("/v1/realtime") as next_socket:
        assert next_socket.receive_json()["type"] == "session.queue_done"


def test_public_local_and_unknown_addresses_share_one_budget(monkeypatch):
    monkeypatch.setattr(admission, "MAX_WEBSOCKETS", 1)

    async def scenario():
        first = Socket(host="203.0.113.7")
        task = await launch(first)
        try:
            for host in ("198.51.100.8", "127.0.0.1", ""):
                rejected = Socket(host=host)
                await main.realtime(rejected)
                assert not rejected.accepted
                assert rejected.close_code == 4429
                assert admission.live_websockets() == 1
        finally:
            await stop(first, task)

    asyncio.run(scenario())


@pytest.mark.parametrize("failure", ["accept", "queue", "unsupported_mode"])
def test_slot_is_released_on_early_failure(monkeypatch, failure):
    monkeypatch.setattr(admission, "MAX_WEBSOCKETS", 1)

    async def scenario():
        socket = Socket(failure=failure, mode="bad" if failure == "unsupported_mode" else "text")
        if failure == "unsupported_mode":
            await main.realtime(socket)
            assert socket.close_code == 1008
        else:
            with pytest.raises(RuntimeError):
                await main.realtime(socket)
        assert admission.live_websockets() == 0
        replacement = Socket()
        task = await launch(replacement)
        await stop(replacement, task)

    asyncio.run(scenario())


def test_task_cancellation_releases_socket_slot():
    async def scenario():
        socket = Socket()
        task = await launch(socket)
        assert admission.live_websockets() == 1
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task

    asyncio.run(scenario())


@pytest.mark.parametrize("lang, phrase", [("ru", "Подключитесь"), ("en", "Reconnect")])
def test_idle_before_init_times_out_and_releases_slot(monkeypatch, lang, phrase):
    monkeypatch.setattr(admission, "INIT_TIMEOUT_S", .04)

    async def scenario():
        socket = Socket()
        socket.query_params["lang"] = lang
        task = await launch(socket)
        await asyncio.wait_for(task, 1)
        assert socket.last("error")["error"]["code"] == "init_timeout"
        assert phrase in socket.last("error")["error"]["message"]
        assert socket.close_code == 1008
        assert admission.live_websockets() == 0
        assert limits.live_sessions(socket.client.host) == 0

    asyncio.run(scenario())


@pytest.mark.parametrize("message", [
    ValueError("bad JSON"), [], {"type": "coach.request"},
    {"type": "session.init", "payload": {"lang": ["en"]}},
    {"type": "session.init", "payload": {"scenarioId": "missing"}},
])
def test_repeated_invalid_messages_do_not_extend_init_deadline(monkeypatch, message):
    monkeypatch.setattr(admission, "INIT_TIMEOUT_S", .06)

    async def scenario():
        socket = Socket()
        task = await launch(socket)
        async def spam():
            while not task.done():
                socket.feed(message)
                await asyncio.sleep(.005)
        sender = asyncio.create_task(spam())
        try:
            await asyncio.wait_for(task, .5)
        finally:
            sender.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await sender
        assert socket.last("error")["error"]["code"] == "init_timeout"
        assert socket.close_code == 1008
        assert limits.live_sessions(socket.client.host) == 0

    asyncio.run(scenario())


def test_valid_init_can_retry_before_deadline_and_stays_live_after_it(monkeypatch):
    monkeypatch.setattr(admission, "INIT_TIMEOUT_S", .1)

    async def scenario():
        socket = Socket()
        task = await launch(socket)
        try:
            socket.feed({"type": "session.init", "payload": {"scenarioId": "missing"}})
            await _until(lambda: socket.last("error"))
            socket.feed(INIT)
            await _until(lambda: socket.last("session.created"))
            await asyncio.sleep(.15)
            assert not task.done()
            socket.feed({"type": "coach.request"})
            await _until(lambda: socket.last("turn.coach"))
            socket.feed({"type": "session.close"})
            await asyncio.wait_for(task, 1)
        finally:
            if not task.done():
                await stop(socket, task)

    asyncio.run(scenario())


def test_valid_slow_generation_has_its_own_budget(monkeypatch):
    monkeypatch.setattr(admission, "INIT_TIMEOUT_S", .06)
    original = endpoint._build_session
    async def slow(payload):
        await asyncio.sleep(.1)
        return await original(payload)
    monkeypatch.setattr(endpoint, "_build_session", slow)

    async def scenario():
        socket = Socket()
        task = await launch(socket)
        socket.feed(INIT)
        try:
            await _until(lambda: socket.last("session.created"))
            assert socket.close_code is None
            assert admission.live_websockets() == 1
        finally:
            await stop(socket, task)

    asyncio.run(scenario())


def test_exception_during_initialization_releases_game_and_socket_leases(monkeypatch):
    async def broken(_payload):
        raise RuntimeError("failed to build")
    monkeypatch.setattr(endpoint, "_build_session", broken)

    async def scenario():
        socket = Socket()
        task = await launch(socket)
        socket.feed(INIT)
        await asyncio.wait_for(task, 1)
        assert socket.close_code == 1011
        assert limits.live_sessions(socket.client.host) == 0
        assert admission.live_websockets() == 0

    asyncio.run(scenario())


def test_takeover_does_not_release_the_old_socket_slot_early(monkeypatch):
    monkeypatch.setattr(admission, "MAX_WEBSOCKETS", 2)

    async def scenario():
        old = Socket()
        old_task = await launch(old)
        old.feed(INIT)
        created = await _until(lambda: old.last("session.created"))
        new = Socket()
        new_task = await launch(new)
        new.feed({"type": "session.init", "payload": {**INIT["payload"], "resume": created["session_id"]}})
        try:
            await _until(lambda: new.last("session.created"))
            assert old.close_code == endpoint.WS_TAKEN_OVER
            assert admission.live_websockets() == 2
            third = Socket()
            await main.realtime(third)
            assert third.close_code == 4429
            await stop(old, old_task)
            assert admission.live_websockets() == 1
            new.feed({"type": "session.close"})
            await asyncio.wait_for(new_task, 1)
            assert store.get(created["session_id"]) is None
        finally:
            if not old_task.done():
                await stop(old, old_task)
            if not new_task.done():
                await stop(new, new_task)

    asyncio.run(scenario())


def test_socket_lease_release_is_idempotent():
    lease = admission.acquire()
    assert lease is not None
    assert admission.live_websockets() == 1
    lease.release()
    lease.release()
    assert admission.live_websockets() == 0


@pytest.mark.parametrize("raw", ["0", "-1", "NaN", "inf", "garbage"])
def test_invalid_resource_configuration_fails_closed(monkeypatch, raw):
    monkeypatch.setenv("TEST_RESOURCE_LIMIT", raw)
    with pytest.raises(ValueError):
        admission._positive_number("TEST_RESOURCE_LIMIT", "10")
