import json
import logging

import pytest

from app.avatar.live.config import LiveVideoConfig
from app.avatar.live.driver import Persona
from app.avatar.live.vendors.liveavatar import LiveAvatarDriver


@pytest.mark.asyncio
async def test_starvation_warning_reports_audio_supply_without_payloads(caplog):
    caplog.set_level(logging.INFO, logger="dialog.live_video")
    driver = LiveAvatarDriver(LiveVideoConfig(vendor="liveavatar"), Persona("supplier"))
    now = [100.0]
    driver._now = lambda: now[0]
    sent = []

    class Socket:
        async def send(self, message): sent.append(json.loads(message))
        async def __aiter__(self):
            yield json.dumps({"type": "warning", "warning": {"type": "video_starvation", "message": "video buffer starvation: 4 frames missed (160ms gap) private provider detail"}})

    driver._ws = Socket()
    driver._buffer.extend(b"\0" * 19200)  # 400 ms of 24 kHz PCM16
    await driver._flush()
    now[0] = 100.16
    await driver._read_ws()
    events = []
    for record in caplog.records:
        try: value = json.loads(record.getMessage())
        except json.JSONDecodeError: continue
        if value.get("event") == "live_video_warning":
            assert record.levelno == logging.WARNING
            events.append(value)
    assert len(events) == 1, "starvation has no structured audio-supply diagnostics"
    event = events[0]
    assert event["warning_kind"] == "video_starvation"
    assert event["since_audio_send_ms"] == pytest.approx(160)
    assert event["last_chunk_audio_ms"] == 400
    assert event["audio_chunks_sent"] == 1
    assert event["warning_count"] == 1
    assert event["frames_missed"] == 4
    assert event["service_gap_ms"] == 160
    assert "private" not in json.dumps(event)
