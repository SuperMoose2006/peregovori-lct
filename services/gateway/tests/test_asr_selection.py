"""Audio recipient must not depend on availability or a stray cloud key."""
import asyncio
from unittest.mock import AsyncMock

import httpx
import numpy as np
import pytest

from app.providers.asr import make_asr, voice_mode, describe_voice, DisabledASR
from app.providers.asr.parakeet import ParakeetASR
from app.providers.asr.openrouter import OpenRouterASR
from app.perception.voice_pipeline import VoicePipeline
from app.realtime import endpoint
from app.realtime.events import SessionInit


@pytest.mark.parametrize("choice", [None, "", "auto", "parakeet"])
def test_local_default_even_with_cloud_keys(monkeypatch, choice):
    monkeypatch.delenv("NEGO_VOICE", raising=False)
    monkeypatch.setenv("OPENAI_REALTIME_KEY", "present-but-not-consent")
    monkeypatch.setenv("OPENROUTER_API_KEY", "present-but-not-consent")
    if choice is None:
        monkeypatch.delenv("NEGO_ASR", raising=False)
    else:
        monkeypatch.setenv("NEGO_ASR", choice)
    assert voice_mode() == "classic"
    assert isinstance(make_asr(), ParakeetASR)
    assert "parakeet" in describe_voice()


def test_cloud_requires_explicit_selection(monkeypatch):
    monkeypatch.setenv("NEGO_ASR", "openrouter")
    assert isinstance(make_asr(), OpenRouterASR)
    monkeypatch.setenv("NEGO_ASR", "typo")
    assert isinstance(make_asr(), DisabledASR)
    assert not make_asr().available()


@pytest.mark.asyncio
async def test_wire_and_health_agree_on_demo_provider(monkeypatch):
    from app.main import _voice_describe
    monkeypatch.setenv("NEGO_VOICE", "classic")
    monkeypatch.setenv("NEGO_ASR", "parakeet")
    monkeypatch.setattr(endpoint.OpenAISpeechTTS, "available", lambda self: False)
    monkeypatch.setattr(endpoint.EdgeTTS, "available", lambda self: False)
    session, error = await endpoint._build_session(SessionInit(
        scenarioId="supplier", mode="voice", layers={"voice": True}))
    assert error is None
    _, voice, _ = endpoint._wire(session)
    assert isinstance(voice._asr, ParakeetASR)
    assert voice._asr.describe() in _voice_describe()
    await voice.close()


@pytest.mark.asyncio
@pytest.mark.parametrize("mode", ["realtime", "typo"])
async def test_unavailable_explicit_mode_cannot_silently_switch(monkeypatch, mode):
    monkeypatch.setenv("NEGO_VOICE", mode)
    monkeypatch.setattr(endpoint.RealtimeVoicePipeline, "available", property(lambda self: False))
    monkeypatch.setattr(endpoint, "make_asr", lambda: pytest.fail("implicit ASR fallback"))
    monkeypatch.setattr(endpoint.OpenAISpeechTTS, "available", lambda self: False)
    monkeypatch.setattr(endpoint.EdgeTTS, "available", lambda self: False)
    session, error = await endpoint._build_session(SessionInit(
        scenarioId="supplier", mode="voice", layers={"voice": True}))
    assert error is None
    _, voice, _ = endpoint._wire(session)
    assert voice is None


@pytest.mark.asyncio
async def test_pcm_protocol_and_transcript(monkeypatch):
    seen = []
    def respond(request):
        seen.append(request)
        return httpx.Response(200, json={"text": "  Что важно?  "})
    client = httpx.AsyncClient(transport=httpx.MockTransport(respond))
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kwargs: client)
    monkeypatch.setenv("NEGO_ASR_URL", "http://127.0.0.1:18220")
    pcm = np.array([.25, -.5], dtype=np.float32)
    result = await make_asr().transcribe(pcm, 16000, "ru")
    assert result.text == "Что важно?"
    assert str(seen[0].url) == "http://127.0.0.1:18220/transcribe"
    assert seen[0].headers["X-Sample-Rate"] == "16000"
    assert seen[0].content == pcm.astype("<f4").tobytes()


@pytest.mark.asyncio
@pytest.mark.parametrize("lang", ["ru", "en"])
async def test_outage_is_visible_no_cloud_no_stale_turn(monkeypatch, lang):
    cloud = AsyncMock(side_effect=AssertionError("audio leaked to cloud"))
    monkeypatch.setattr(OpenRouterASR, "transcribe", cloud)
    def fail(request):
        raise httpx.ConnectError("local service down", request=request)
    client = httpx.AsyncClient(transport=httpx.MockTransport(fail))
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kwargs: client)
    monkeypatch.setenv("NEGO_ASR", "parakeet")
    turns, events = AsyncMock(), []
    pipe = VoicePipeline(asr=make_asr(), lang=lang, on_turn=turns,
                         on_interrupt=AsyncMock(), publish=events.append)
    pipe._audio = [np.ones(16000, dtype=np.int16)]
    pipe._transcript = "old partial must never become a turn"
    await pipe._settle_turn()
    await pipe.force_commit()
    turns.assert_not_called()
    cloud.assert_not_called()
    assert not pipe._audio and not pipe._transcript
    assert events[-1]["error"]["code"] == "asr_unavailable"
    assert ("введите текст" if lang == "ru" else "type your message") in events[-1]["error"]["message"]
    assert isinstance(make_asr(), ParakeetASR), "outage must not alter selection"
    await pipe.close()
