"""Запасной синтез, честные ошибки и отсутствие сетевых вызовов в офлайне."""

from __future__ import annotations

import asyncio
import base64
from unittest.mock import Mock

import numpy as np
import pytest

from app.orchestrator.tts_manager import TTSTaskManager
from app.perception.realtime_voice import RealtimeVoicePipeline
from app.providers.asr.openrouter import OpenRouterASR
from app.providers.tts.base import Voice
from app.providers.tts.edge import EdgeTTS
from app.providers.tts.openai_speech import OpenAISpeechTTS


class _Speech:
    def __init__(self, chunks=(), *, fail=False):
        self.chunks, self.fail, self.calls = chunks, fail, 0

    def available(self):
        return True

    async def stream(self, text, voice):
        self.calls += 1
        for chunk in self.chunks:
            yield chunk
        if self.fail:
            raise ConnectionError("fake speech failure")


@pytest.mark.asyncio
@pytest.mark.parametrize("empty_response", [False, True])
async def test_fallback_speaks_when_primary_fails_before_audio(empty_response):
    primary = _Speech(fail=not empty_response)
    fallback = _Speech([b"fallback audio"])
    events = []
    manager = TTSTaskManager(primary, events.append, Voice("", "ru", True), fallback=fallback)
    manager.speak("Здравствуйте", generation_id="turn-1", turn_id=1)
    await manager.wait_idle()
    assert primary.calls == fallback.calls == 1
    assert [base64.b64decode(e["audio"]) for e in events] == [b"fallback audio"]
    assert all(e["generation_id"] == "turn-1" for e in events)


@pytest.mark.asyncio
@pytest.mark.parametrize("lang", ["ru", "en"])
async def test_partial_audio_is_never_repeated_by_fallback_and_has_an_error(lang):
    primary = _Speech([b"already spoken"], fail=True)
    fallback = _Speech([b"would repeat the phrase"])
    events = []
    manager = TTSTaskManager(primary, events.append, Voice("", lang, True), fallback=fallback)
    manager.speak("Hello", generation_id="turn-3", turn_id=3)
    await manager.wait_idle()
    assert fallback.calls == 0
    assert base64.b64decode(events[0]["audio"]) == b"already spoken"
    assert events[1]["error"]["code"] == "tts_interrupted"
    assert events[1]["generation_id"] == "turn-3" and events[1]["turn_id"] == 3
    assert ("Audio" if lang == "en" else "Озвучка") in events[1]["error"]["message"]


@pytest.mark.asyncio
async def test_both_providers_failing_publish_unavailable_instead_of_silence():
    events = []
    primary, fallback = _Speech(fail=True), _Speech(fail=True)
    manager = TTSTaskManager(primary, events.append, Voice("", "ru", True), fallback=fallback)
    manager.speak("Здравствуйте", generation_id="one", turn_id=1)
    await manager.wait_idle()
    assert primary.calls == fallback.calls == 1
    assert len(events) == 1
    assert events[0]["error"]["code"] == "tts_unavailable"


@pytest.mark.asyncio
async def test_cancelling_speech_does_not_start_fallback_or_report_provider_failure():
    started = asyncio.Event()

    class Slow(_Speech):
        async def stream(self, text, voice):
            started.set()
            await asyncio.Event().wait()
            yield b"unreachable"

    events, fallback = [], _Speech([b"fallback"])
    manager = TTSTaskManager(Slow(), events.append, Voice("", "ru", True), fallback=fallback)
    manager.speak("Здравствуйте", generation_id="one", turn_id=1)
    await asyncio.wait_for(started.wait(), 1)
    manager.clear()
    await asyncio.sleep(0)
    assert fallback.calls == 0
    assert events == []


@pytest.mark.asyncio
async def test_offline_blocks_speech_network_even_with_configured_keys(monkeypatch):
    monkeypatch.setenv("NEGO_AI", " Off ")
    for key in ("OPENAI_REALTIME_KEY", "OPENAI_API_KEY", "OPENROUTER_API_KEY"):
        monkeypatch.setenv(key, "placeholder-never-sent")
    import edge_tts
    import httpx
    import websockets
    forbidden = Mock(side_effect=AssertionError("offline attempted network access"))
    monkeypatch.setattr(edge_tts, "Communicate", forbidden)
    monkeypatch.setattr(httpx, "AsyncClient", forbidden)
    monkeypatch.setattr(websockets, "connect", forbidden)
    for provider in (EdgeTTS(), OpenAISpeechTTS()):
        assert not provider.available()
        assert [chunk async for chunk in provider.stream("Hello", Voice("", "en", True))] == []
    asr = OpenRouterASR()
    assert not asr.available()
    assert (await asr.transcribe(np.ones(1600, dtype=np.float32), 16000, "en")).text == ""
    pipe = RealtimeVoicePipeline("en", forbidden, forbidden, forbidden)
    assert not pipe.available
    pipe.feed(np.ones(1600, dtype=np.int16))
    await pipe._ensure_session()
    assert pipe._outbox is None and pipe._ws is None
    await pipe.close()
    forbidden.assert_not_called()


@pytest.mark.asyncio
async def test_closing_pipeline_cancels_a_pending_provider_connection(monkeypatch):
    monkeypatch.setenv("NEGO_AI", "on")
    monkeypatch.setenv("OPENAI_REALTIME_KEY", "placeholder-never-sent")
    import websockets
    started, cancelled = asyncio.Event(), asyncio.Event()

    async def connect(*args, **kwargs):
        started.set()
        try:
            await asyncio.Event().wait()
        except asyncio.CancelledError:
            cancelled.set()
            raise

    monkeypatch.setattr(websockets, "connect", connect)
    pipe = RealtimeVoicePipeline("en", Mock(), Mock(), Mock())
    pipe.feed(np.ones(1600, dtype=np.int16))
    await asyncio.wait_for(started.wait(), 1)
    await pipe.close()
    assert cancelled.is_set()
    assert pipe._connector.done()
    assert not pipe.available
