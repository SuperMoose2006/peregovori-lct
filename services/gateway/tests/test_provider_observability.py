import asyncio
import json
import logging

import httpx
import numpy as np
import pytest

from app.providers.openrouter import chat
from app.providers.asr import parakeet
from app.orchestrator import tts_manager
from app.providers.tts.base import Voice


def records(caplog):
    result = []
    for record in caplog.records:
        if record.name == "dialog.providers":
            result = json.loads(record.getMessage())
            assert result["event"] == "provider_call"
    assert result, "provider produced no structured timing/error record"
    assert result["duration_ms"] >= 0
    return result


@pytest.mark.asyncio
@pytest.mark.parametrize("failure", [False, True])
async def test_llm_logs_latency_status_and_cumulative_errors(monkeypatch, caplog, failure):
    caplog.set_level(logging.INFO, logger="dialog.providers")
    monkeypatch.setattr(chat, "available", lambda: True)
    def reply(request):
        if failure: return httpx.Response(429, text="private provider response")
        return httpx.Response(200, json={"choices": [{"message": {"content": "Готовы обсудить условия."}}]})
    async with httpx.AsyncClient(transport=httpx.MockTransport(reply), base_url="https://example.invalid") as client:
        monkeypatch.setattr(chat, "_get_client", lambda: client)
        previous = None
        for _ in range(2):
            await chat.complete("private prompt", "private user", role="judge")
            event = records(caplog)
            assert event["operation"] == "llm.complete"
            assert event["role"] == "judge"
            assert event["outcome"] == ("error" if failure else "success")
            if failure:
                assert event["error_kind"] == "http_429"
                assert event["error_count"] >= 1
            if previous is not None:
                assert event["call_count"] == previous["call_count"] + 1
                assert event["error_count"] == previous["error_count"] + int(failure)
            previous = event
            caplog.clear()
    assert "private" not in json.dumps(event)


@pytest.mark.asyncio
async def test_llm_stream_records_first_chunk_and_external_cancellation(monkeypatch, caplog):
    caplog.set_level(logging.INFO, logger="dialog.providers")
    monkeypatch.setattr(chat, "available", lambda: True)
    class Body(httpx.AsyncByteStream):
        async def __aiter__(self):
            yield b'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n'
            await asyncio.sleep(60)
    async with httpx.AsyncClient(transport=httpx.MockTransport(lambda r: httpx.Response(200, stream=Body())), base_url="https://example.invalid") as client:
        monkeypatch.setattr(chat, "_get_client", lambda: client)
        async def read():
            async for _ in chat.stream("secret", "secret"): pass
        with pytest.raises(TimeoutError):
            await asyncio.wait_for(read(), timeout=0.02)
        event = records(caplog)
        assert event["first_chunk_ms"] is not None
        assert event["outcome"] == "cancelled"


@pytest.mark.asyncio
@pytest.mark.parametrize("failure", [False, True])
async def test_local_asr_logs_latency_and_transport_failure(monkeypatch, caplog, failure):
    caplog.set_level(logging.INFO, logger="dialog.providers")
    real_client = httpx.AsyncClient
    def response(request):
        if failure: raise httpx.ConnectError("private address")
        return httpx.Response(200, json={"text": "private transcript"})
    monkeypatch.setattr(parakeet.httpx, "AsyncClient", lambda **kwargs: real_client(transport=httpx.MockTransport(response), **kwargs))
    provider = parakeet.ParakeetASR()
    if failure:
        with pytest.raises(httpx.ConnectError):
            await provider.transcribe(np.zeros(10, dtype=np.float32), 16000, "ru")
    else:
        await provider.transcribe(np.zeros(10, dtype=np.float32), 16000, "ru")
    event = records(caplog)
    assert event["operation"] == "asr.transcribe"
    assert event["outcome"] == ("error" if failure else "success")
    assert "private" not in json.dumps(event)


@pytest.mark.asyncio
@pytest.mark.parametrize("failure", ["success", "error", "timeout"])
async def test_tts_logs_first_chunk_failures_and_timeout(monkeypatch, caplog, failure):
    caplog.set_level(logging.INFO, logger="dialog.providers")
    monkeypatch.setattr(tts_manager, "SYNTHESIS_TIMEOUT_S", 0.01)
    class Provider:
        async def stream(self, *args, **kwargs):
            if failure == "error": raise RuntimeError("private text")
            if failure == "timeout": await asyncio.sleep(60)
            yield b"pcm"
    manager = tts_manager.TTSTaskManager(Provider(), lambda e: None, Voice("", "ru", True))
    await manager._synth("private input", asyncio.Queue(), "generation")
    event = records(caplog)
    assert event["operation"] == "tts.synthesize"
    assert event["outcome"] == ("success" if failure == "success" else "error")
    assert (event["first_chunk_ms"] is not None) == (failure == "success")
    if failure == "timeout": assert event["error_kind"] == "timeout"
    assert "private" not in json.dumps(event)


@pytest.mark.asyncio
@pytest.mark.parametrize("status", [200, 503])
async def test_cloud_asr_logs_swallowed_errors(monkeypatch, caplog, status):
    from app.providers.asr.openrouter import OpenRouterASR
    caplog.set_level(logging.INFO, logger="dialog.providers")
    monkeypatch.setattr(chat, "available", lambda: True)
    def response(request):
        return httpx.Response(status, json={"choices": [{"message": {"content": "private transcript"}}]})
    async with httpx.AsyncClient(transport=httpx.MockTransport(response), base_url="https://example.invalid") as client:
        monkeypatch.setattr(chat, "_get_client", lambda: client)
        await OpenRouterASR().transcribe(np.zeros(10, dtype=np.float32), 16000, "ru")
    event = records(caplog)
    assert event["operation"] == "asr.transcribe"
    assert event["provider"] == "openrouter"
    assert event["outcome"] == ("success" if status == 200 else "error")
    if status == 503: assert event["error_kind"] == "http_5xx"
    assert "private" not in json.dumps(event)
