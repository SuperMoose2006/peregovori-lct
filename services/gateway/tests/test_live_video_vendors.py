"""test_live_video_vendors.py — драйверы сервисов против подменённого SDK.

ЧТО ДОКАЗЫВАЕТСЯ. Драйвер зовёт SDK так, как SDK написан (сверено с исходником
пакета): правильная персона и режим passthrough, звук нужного формата и длины,
конец реплики, перебивание, закрытие, перевод ошибок SDK в «повторять/не
повторять», обрыв — событием `Closed`. И главное — время кадра: подменённый
сервис возвращает наш звук и видео синхронно, с задержкой и чужими метками
WebRTC, а драйвер обязан поставить кадр на шкалу НАШЕГО звука.

Кадры и звук подменённого сервиса — настоящие кадры PyAV: так проверяется и
разбор форматов (packed stereo s16 48 кГц, как отдаёт WebRTC).

ЧЕГО ЗДЕСЬ НЕТ. Настоящего сервиса: сеть, его задержки и его ответы на
неожиданное. Это первая живая проверка по docs/INTEGRATION_LIVE_VIDEO.md.
"""

from __future__ import annotations

import asyncio
import base64
import contextlib
import enum
import json
import sys
import time
import types

import av
import numpy as np
import pytest

from app.avatar.live.config import LiveVideoConfig
from app.avatar.live.driver import Closed, DriverError, Persona, VideoFrame
from app.avatar.live.vendors import _webrtc
from app.avatar.live.vendors._anchor import SpeechAnchor, first_loud_ms

SR = 24000


def _tone(ms: float, level: float = 0.3, lead_silence_ms: float = 0.0) -> bytes:
    n, lead = int(SR * ms / 1000), int(SR * lead_silence_ms / 1000)
    t = np.arange(n) / SR
    wave = (level * np.sin(2 * np.pi * 180 * t)).astype(np.float32)
    wave[:lead] = 0.0
    return wave.astype("<f4").tobytes()


class FakeVendorStream:
    """Сервис: возвращает наш звук и видео синхронно, через `latency` сек.

    Метки WebRTC — со случайным началом (как у настоящих дорожек); видео
    идёт 25 к/с, кадр j стоит на j·40 мс нашего звука.
    """

    def __init__(self, latency: float = 0.15) -> None:
        self.latency = latency
        self.received = bytearray()        # int16 24 кГц, что прислал драйвер
        self.first_at: float | None = None
        self.closed = False
        self.video_base = 5321.0           # чужое начало меток видео, сек
        self.audio_q: asyncio.Queue = asyncio.Queue()
        self.video_q: asyncio.Queue = asyncio.Queue()
        self._task: asyncio.Task | None = None
        self.sent_video = 0

    def push(self, s16: bytes) -> None:
        if self.first_at is None:
            self.first_at = time.monotonic()
            self._task = asyncio.get_running_loop().create_task(self._play())
        self.received.extend(s16)

    async def _play(self) -> None:
        """Отдаём звук кусками по 20 мс и кадры по 40 мс в реальном времени."""
        start = self.first_at + self.latency
        k = 0
        while not self.closed:
            have_ms = len(self.received) / 2 / SR * 1000
            if k * 20 >= have_ms:
                await asyncio.sleep(0.005)
                if k * 20 >= have_ms and time.monotonic() > start + have_ms / 1000 + 0.3:
                    return
                continue
            due = start + (k + 1) * 0.020
            await asyncio.sleep(max(0.0, due - time.monotonic()))
            lo = int(k * 20 * SR / 1000) * 2
            chunk = np.frombuffer(bytes(self.received[lo: lo + int(0.02 * SR) * 2]), dtype="<i2")
            chunk48 = np.repeat(chunk, 2)                            # 24 → 48 кГц
            stereo = np.stack([chunk48, chunk48], axis=1).reshape(1, -1).astype(np.int16)
            frame = av.AudioFrame.from_ndarray(stereo, format="s16", layout="stereo")
            frame.sample_rate = 48000
            self.audio_q.put_nowait(frame)
            if k % 2 == 0:
                img = np.full((48, 64, 3), 120, dtype=np.uint8)
                video = av.VideoFrame.from_ndarray(img, format="rgb24")
                video.pts = int((self.video_base + k * 0.020) * 90000)
                from fractions import Fraction
                video.time_base = Fraction(1, 90000)
                self.video_q.put_nowait(video)
                self.sent_video += 1
            k += 1

    async def video(self):
        while True:
            frame = await self.video_q.get()
            if frame is None:
                return
            yield frame

    async def audio(self):
        while True:
            frame = await self.audio_q.get()
            if frame is None:
                return
            yield frame

    def end(self) -> None:
        self.closed = True
        self.video_q.put_nowait(None)
        self.audio_q.put_nowait(None)
        if self._task:
            self._task.cancel()


# ---------------------------------------------------------------- подменный Anam

def _fake_anam(monkeypatch, *, fail: str | None = None, ready: bool = True):
    mod = types.ModuleType("anam")
    calls: dict = {"events": [], "chunks": [], "ends": 0, "interrupts": 0, "closed": 0}
    vendor = FakeVendorStream()
    calls["vendor"] = vendor

    class ErrorCode(str, enum.Enum):
        AUTHENTICATION_ERROR = "authentication_error"
        SERVICE_BUSY = "service_busy"

    class AnamError(Exception):
        def __init__(self, message, code=ErrorCode.SERVICE_BUSY):
            super().__init__(message)
            self.code = code

    class AnamEvent(str, enum.Enum):
        SESSION_READY = "session_ready"
        CONNECTION_CLOSED = "connection_closed"

    class PersonaConfig:
        def __init__(self, **kw):
            calls["persona"] = kw

    class SessionOptions:
        def __init__(self, **kw):
            calls["options"] = kw

    class AgentAudioInputConfig:
        def __init__(self, **kw):
            calls["audio_config"] = kw

    class Stream:
        async def send_audio_chunk(self, data):
            calls["chunks"].append(bytes(data))
            vendor.push(bytes(data))

        async def end_sequence(self):
            calls["ends"] += 1

    class Session:
        def create_agent_audio_input_stream(self, cfg):
            return Stream()

        async def interrupt(self):
            calls["interrupts"] += 1

        async def close(self):
            calls["closed"] += 1
            vendor.end()

        def video_frames(self):
            return vendor.video()

        def audio_frames(self):
            return vendor.audio()

    class AnamClient:
        def __init__(self, api_key=None, persona_config=None, **kw):
            calls["api_key"] = api_key
            self.listeners: dict = {}
            calls["client"] = self

        def add_listener(self, event, cb):
            self.listeners.setdefault(event, []).append(cb)

        async def connect_async(self, options=None):
            if fail == "auth":
                raise AnamError("Invalid API key", ErrorCode.AUTHENTICATION_ERROR)
            if fail == "busy":
                raise AnamError("busy", ErrorCode.SERVICE_BUSY)
            if ready:
                for cb in self.listeners.get(AnamEvent.SESSION_READY, []):
                    await cb()
            return Session()

        async def fire_closed(self, code, reason):
            for cb in self.listeners.get(AnamEvent.CONNECTION_CLOSED, []):
                await cb(code, reason)

        async def close(self):
            calls["closed"] += 1

    for name, obj in dict(AnamClient=AnamClient, PersonaConfig=PersonaConfig, SessionOptions=SessionOptions,
                          AgentAudioInputConfig=AgentAudioInputConfig, AnamEvent=AnamEvent,
                          AnamError=AnamError).items():
        setattr(mod, name, obj)
    monkeypatch.setitem(sys.modules, "anam", mod)
    return calls


def _anam_cfg(**kw) -> LiveVideoConfig:
    base = dict(vendor="anam", key="an_0123456789abcdef0123", avatar="av-stock-1", fps=25.0, size=64)
    base.update(kw)
    return LiveVideoConfig(**base)


async def _collect(driver, until_closed: bool = False, timeout: float = 3.0) -> list:
    events = []

    async def run():
        async for event in driver.events():
            events.append(event)

    task = asyncio.get_running_loop().create_task(run())
    await asyncio.sleep(timeout)
    if not until_closed:
        task.cancel()
    else:
        await asyncio.wait_for(task, timeout=2)
    return events


@pytest.mark.asyncio
async def test_anam_driver_calls_the_sdk_as_written_and_frames_land_on_our_audio_clock(monkeypatch):
    from app.avatar.live.vendors.anam import AnamDriver
    calls = _fake_anam(monkeypatch)
    driver = AnamDriver(_anam_cfg(), Persona("supplier"))
    await driver.connect()
    assert calls["api_key"] == "an_0123456789abcdef0123"
    assert calls["persona"] == {"avatar_id": "av-stock-1", "enable_audio_passthrough": True}
    assert calls["options"] == {"enable_session_replay": False}, "запись сессии у сервиса выключена"
    assert calls["audio_config"] == {"encoding": "pcm_s16le", "sample_rate": 24000, "channels": 1}

    events: list = []

    async def collect():
        async for event in driver.events():
            events.append(event)

    reader = asyncio.get_running_loop().create_task(collect())
    # Реплика: 120 мс тишины в начале (как у синтеза), дальше речь; 0.8 с.
    pcm = _tone(800, lead_silence_ms=120)
    for i in range(0, len(pcm), 4 * 2400):
        await driver.send_audio(pcm[i:i + 4 * 2400], "g1")
    await driver.end_of_speech("g1")
    await asyncio.sleep(1.3)
    reader.cancel()

    sent = b"".join(calls["chunks"])
    assert len(sent) == len(pcm) // 2, "сервис получил int16 той же длительности"
    assert calls["ends"] == 1, "конец реплики передан сервису (без него аватар замирает)"
    frames = [e for e in events if isinstance(e, VideoFrame)]
    assert frames, "кадры сервиса дошли"
    assert {f.generation_id for f in frames} == {"g1"}
    pts = [f.pts_ms for f in frames]
    assert pts == sorted(pts)
    # Кадр j у сервиса стоит на j·40 мс нашего звука: время обязано совпасть с
    # сеткой с точностью до шага кадра, несмотря на 150 мс задержки и чужие метки.
    for p in pts:
        assert abs(p - round(p / 40) * 40) < 20, pts
    assert pts[0] < 200, f"первый кадр речи стоит на {pts[0]} мс — сдвинут на задержку сервиса"
    assert all(f.jpeg.startswith(b"\xff\xd8") for f in frames)
    await driver.close()
    assert calls["closed"] >= 1


@pytest.mark.asyncio
async def test_anam_interrupt_sends_interrupt_and_end_sequence(monkeypatch):
    from app.avatar.live.vendors.anam import AnamDriver
    calls = _fake_anam(monkeypatch)
    driver = AnamDriver(_anam_cfg(), Persona("supplier"))
    await driver.connect()
    await driver.send_audio(_tone(100), "g1")
    await driver.interrupt()
    assert calls["interrupts"] == 1 and calls["ends"] == 1
    await driver.close()


@pytest.mark.asyncio
@pytest.mark.parametrize("fail,fatal", [("auth", True), ("busy", False)])
async def test_anam_errors_become_retry_or_give_up(monkeypatch, fail, fatal):
    from app.avatar.live.vendors.anam import AnamDriver
    _fake_anam(monkeypatch, fail=fail)
    driver = AnamDriver(_anam_cfg(), Persona("supplier"))
    with pytest.raises(DriverError) as err:
        await driver.connect()
    assert err.value.fatal is fatal


@pytest.mark.asyncio
async def test_anam_server_closing_the_session_is_a_closed_event(monkeypatch):
    from app.avatar.live.vendors.anam import AnamDriver
    calls = _fake_anam(monkeypatch)
    driver = AnamDriver(_anam_cfg(), Persona("supplier"))
    await driver.connect()
    await calls["client"].fire_closed("server_closed", "max session length")
    event = await asyncio.wait_for(anext(driver.events()), timeout=1)
    assert isinstance(event, Closed) and "server_closed" in event.reason and not event.fatal
    await driver.close()


@pytest.mark.asyncio
async def test_vendor_media_stream_ending_is_a_closed_event(monkeypatch):
    """Поток кадров кончился без слова сервиса — это обрыв, а не тишина."""
    from app.avatar.live.vendors.anam import AnamDriver
    calls = _fake_anam(monkeypatch)
    driver = AnamDriver(_anam_cfg(), Persona("supplier"))
    await driver.connect()
    calls["vendor"].end()
    event = await asyncio.wait_for(anext(driver.events()), timeout=1)
    assert isinstance(event, Closed) and "ended" in event.reason
    await driver.close()


@pytest.mark.asyncio
async def test_anam_picks_a_stock_face_when_none_is_configured(monkeypatch):
    from app.avatar.live.vendors import anam as anam_mod
    calls = _fake_anam(monkeypatch)

    async def catalogue(key, **kw):
        return [{"id": "own-1", "createdByOrganizationId": "org"},
                {"id": "stock-7", "displayName": "Liv", "createdByOrganizationId": None}]

    monkeypatch.setattr(anam_mod, "_list_avatars", catalogue)
    driver = anam_mod.AnamDriver(_anam_cfg(avatar=""), Persona("supplier"))
    await driver.connect()
    assert calls["persona"]["avatar_id"] == "stock-7"
    assert "stock-7" in await anam_mod.AnamDriver.check_key(_anam_cfg(avatar=""))
    await driver.close()


@pytest.mark.asyncio
@pytest.mark.parametrize("status,fatal", [(401, True), (403, True), (402, True), (500, False)])
async def test_anam_key_check_reads_http_answers(monkeypatch, status, fatal):
    from app.avatar.live.vendors import anam as anam_mod

    class Response:
        status_code = status
        text = "nope"

        def json(self):
            return {}

    class Client:
        def __init__(self, **kw):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def get(self, url, params=None, headers=None):
            assert url == "https://api.anam.ai/v1/avatars"
            assert headers == {"Authorization": "Bearer an_0123456789abcdef0123"}
            return Response()

    import httpx
    monkeypatch.setattr(httpx, "AsyncClient", Client)
    with pytest.raises(DriverError) as err:
        await anam_mod.AnamDriver.check_key(_anam_cfg())
    assert err.value.fatal is fatal


# ---------------------------------------------------------------- подменный Simli

def _fake_simli(monkeypatch, *, fail: str | None = None):
    mod = types.ModuleType("simli")
    calls: dict = {"sent": [], "skips": 0, "stopped": 0}
    vendor = FakeVendorStream()

    class SimliConfig:
        def __init__(self, **kw):
            calls["config"] = kw

    class SimliClient:
        def __init__(self, api_key, config, **kw):
            calls["api_key"] = api_key

        async def start(self):
            if fail:
                raise Exception(fail)
            return self

        async def send(self, data):
            calls["sent"].append(bytes(data))
            # Simli берёт 16 кГц: подменный сервис играет его как 24 кГц —
            # для проверки времени пересчитываем обратно.
            s16 = np.frombuffer(bytes(data), dtype="<i2").astype(np.float32)
            n = int(round(s16.size * 24000 / 16000))
            up = np.interp(np.linspace(0, s16.size - 1, n), np.arange(s16.size), s16).astype("<i2")
            vendor.push(up.tobytes())

        async def clearBuffer(self):
            calls["skips"] += 1

        def getVideoStreamIterator(self, fmt):
            assert fmt == "rgb24"
            return vendor.video()

        def getAudioStreamIterator(self):
            return vendor.audio()

        async def stop(self):
            calls["stopped"] += 1
            vendor.end()

    mod.SimliClient, mod.SimliConfig = SimliClient, SimliConfig
    monkeypatch.setitem(sys.modules, "simli", mod)
    return calls


@pytest.mark.asyncio
async def test_simli_driver_sends_16khz_audio_keeps_the_session_through_long_thinking(monkeypatch):
    from app.avatar.live.vendors.simli import SimliDriver
    calls = _fake_simli(monkeypatch)
    cfg = LiveVideoConfig(vendor="simli", key="si_0123456789abcdef01", avatar="face-1", fps=25.0, size=64)
    driver = SimliDriver(cfg, Persona("supplier"))
    await driver.connect()
    assert calls["config"]["faceId"] == "face-1"
    assert calls["config"]["maxIdleTime"] >= 300, "человек думает над ходом дольше 30 с"
    pcm = _tone(600)
    await driver.send_audio(pcm, "g1")
    assert len(calls["sent"][0]) == int(600 * 16) * 2, "600 мс int16 при 16 кГц"
    events: list = []

    async def collect():
        async for event in driver.events():
            events.append(event)

    reader = asyncio.get_running_loop().create_task(collect())
    await asyncio.sleep(1.0)
    reader.cancel()
    frames = [e for e in events if isinstance(e, VideoFrame)]
    assert frames and all(abs(f.pts_ms - round(f.pts_ms / 40) * 40) < 20 for f in frames)
    await driver.interrupt()
    assert calls["skips"] == 1
    await driver.close()
    assert calls["stopped"] == 1


@pytest.mark.asyncio
async def test_simli_invalid_key_is_final(monkeypatch):
    from app.avatar.live.vendors.simli import SimliDriver
    _fake_simli(monkeypatch, fail="INVALID_API_KEY")
    cfg = LiveVideoConfig(vendor="simli", key="si_0123456789abcdef01", avatar="face-1")
    with pytest.raises(DriverError) as err:
        await SimliDriver(cfg, Persona("supplier")).connect()
    assert err.value.fatal


def test_simli_without_a_face_is_a_config_error_not_a_silent_failure(monkeypatch):
    from app.avatar.live import config
    monkeypatch.setenv("NEGO_AI", "on")
    cfg = config.load({"NEGO_LIVE_VIDEO": "simli", "NEGO_LIVE_VIDEO_KEY": "si_0123456789abcdef01",
                       "NEGO_AI": "on"})
    assert not cfg.enabled and "NEGO_LIVE_VIDEO_AVATAR" in cfg.errors[0]


# ------------------------------------------------------------------ якорь и звук

def test_anchor_ignores_frames_before_our_speech_and_after_interrupt():
    anchor = SpeechAnchor()
    anchor.sent("g", _tone(300, lead_silence_ms=100))
    assert anchor.video_pts(10.0, 1.0) is None, "до начала речи у сервиса кадр не наш"
    loud = np.full(480, 0.3, dtype=np.float32)
    anchor.returned_audio(np.zeros(480, dtype=np.float32), 48000, 10.00)
    anchor.returned_audio(loud, 48000, 10.02)      # 10 мс громко, пришло к 10.02 → речь с 10.01
    assert anchor.video_pts(10.005, 7.0) is None, "кадр раньше начала речи у сервиса"
    # Наша речь начинается на 100 мс; кадр через 20 мс после начала речи у сервиса.
    assert anchor.video_pts(10.03, 7.02) == pytest.approx(120.0, abs=1)
    # Следующий кадр пришёл с дрожанием (через 170 мс), а метка видео — +40 мс.
    assert anchor.video_pts(10.20, 7.06) == pytest.approx(160.0, abs=1), \
        "время кадра — по меткам видео, а не по дрожащему приходу"
    anchor.reset("")
    assert anchor.video_pts(10.3, 7.1) is None


def test_first_loud_ms_finds_speech_start():
    samples = np.frombuffer(_tone(200, lead_silence_ms=50), dtype="<f4")
    assert first_loud_ms(samples, SR) == pytest.approx(50.0, abs=10)
    assert first_loud_ms(np.zeros(SR // 10, dtype=np.float32), SR) is None


def test_webrtc_audio_frames_of_any_layout_become_mono():
    stereo = np.stack([np.full(960, 16384, np.int16), np.full(960, -16384, np.int16)], axis=1)
    packed = av.AudioFrame.from_ndarray(stereo.reshape(1, -1), format="s16", layout="stereo")
    packed.sample_rate = 48000
    mono, rate = _webrtc.audio_frame_to_mono(packed)
    assert rate == 48000 and mono.size == 960 and abs(float(mono.mean())) < 1e-6
    same = np.stack([np.full(960, 16384, np.int16)] * 2, axis=1)
    loud = av.AudioFrame.from_ndarray(same.reshape(1, -1), format="s16", layout="stereo")
    loud.sample_rate = 48000
    mono, _ = _webrtc.audio_frame_to_mono(loud)
    assert float(mono.mean()) == pytest.approx(0.5, abs=1e-3), "int16 переведён в −1…1"
    planar = av.AudioFrame.from_ndarray(np.full((2, 960), 0.5, np.float32), format="fltp", layout="stereo")
    planar.sample_rate = 48000
    mono, _ = _webrtc.audio_frame_to_mono(planar)
    assert mono.size == 960 and float(mono.mean()) == pytest.approx(0.5)


# ------------------------------------------------ настоящий SDK, если установлен

def test_our_calls_exist_in_the_real_anam_sdk():
    """Настройки сессии драйвера — через НАСТОЯЩИЕ классы пакета, если он стоит."""
    anam = pytest.importorskip("anam")
    from app.avatar.live.vendors import anam as driver
    cfg = driver.persona_config(anam.PersonaConfig, "x").to_dict()
    assert cfg == {"avatarId": "x", "enableAudioPassthrough": True}, "passthrough и ничего лишнего"
    assert driver.session_options(anam.SessionOptions).enable_session_replay is False
    audio = driver.audio_config(anam.AgentAudioInputConfig)
    assert (audio.encoding, audio.sample_rate, audio.channels) == ("pcm_s16le", 24000, 1)
    for name in ("create_agent_audio_input_stream", "interrupt", "close", "video_frames", "audio_frames"):
        assert hasattr(anam.Session, name), name
    for name in ("send_audio_chunk", "end_sequence"):
        assert hasattr(anam.AgentAudioInputStream, name), name
    assert {"SESSION_READY", "CONNECTION_CLOSED"} <= set(anam.AnamEvent.__members__)


def test_our_calls_exist_in_the_real_simli_sdk():
    simli = pytest.importorskip("simli")
    from app.avatar.live.vendors import simli as driver
    config = driver.simli_config(simli.SimliConfig, "face-1")
    assert (config.faceId, config.handleSilence) == ("face-1", True)
    assert config.maxIdleTime >= 300 and config.maxSessionLength >= 900
    for name in ("start", "send", "clearBuffer", "getVideoStreamIterator", "getAudioStreamIterator", "stop"):
        assert hasattr(simli.SimliClient, name), name


# ---------------------------------------------------------- подменный LiveAvatar

class _LkVideoEvent:
    def __init__(self, img: np.ndarray, t: float) -> None:
        self.frame = types.SimpleNamespace(width=img.shape[1], height=img.shape[0], data=img.tobytes())
        self.timestamp_us = int(t * 1e6)


class _LkAudioEvent:
    def __init__(self, mono48: np.ndarray) -> None:
        self.frame = types.SimpleNamespace(data=mono48.astype("<i2").tobytes(), sample_rate=48000,
                                           num_channels=1, samples_per_channel=mono48.size)


def _fake_liveavatar(monkeypatch, *, credits="12.5", status_token=200):
    import httpx

    calls: dict = {"http": [], "ws": [], "room": [], "stopped": []}
    vendor = FakeVendorStream(latency=0.12)
    calls["vendor"] = vendor

    class Response:
        def __init__(self, status, data):
            self.status_code, self._data = status, data
            self.text = json.dumps(data)

        def json(self):
            return {"code": 1000, "data": self._data, "message": "ok"}

    class Client:
        def __init__(self, **kw):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def get(self, url, params=None, headers=None):
            calls["http"].append(("GET", url, headers))
            if url.endswith("/v1/users/credits"):
                if headers.get("X-API-KEY") != "la_0123456789abcdef0123":
                    return Response(401, {})
                return Response(200, {"credits_left": credits})
            if url.endswith("/v1/avatars/public"):
                return Response(200, {"results": [{"id": "img-1", "status": "ACTIVE", "type": "IMAGE"},
                                                  {"id": "vid-9", "status": "ACTIVE", "type": "VIDEO"}]})
            return Response(404, {})

        async def post(self, url, headers=None, json=None):
            calls["http"].append(("POST", url, headers, json))
            if url.endswith("/v1/sessions/token"):
                return Response(status_token, {"session_id": "sess-1", "session_token": "jwt-1"})
            if url.endswith("/v1/sessions/start"):
                assert headers == {"Authorization": "Bearer jwt-1"}
                return Response(201, {"session_id": "sess-1", "livekit_url": "wss://lk", "ws_url": "wss://cmd",
                                      "livekit_agent_token": "agent-jwt", "livekit_client_token": "client-jwt"})
            if url.endswith("/v1/sessions/stop"):
                calls["stopped"].append(json)
                return Response(200, {})
            return Response(404, {})

    monkeypatch.setattr(httpx, "AsyncClient", Client)

    class Socket:
        def __init__(self):
            self.inbox: asyncio.Queue = asyncio.Queue()
            self.inbox.put_nowait(json.dumps({"type": "session.state_updated", "state": "connected"}))

        async def send(self, text):
            message = json.loads(text)
            calls["ws"].append(message)
            if message["type"] == "agent.speak":
                vendor.push(base64.b64decode(message["audio"]))

        def __aiter__(self):
            return self

        async def __anext__(self):
            item = await self.inbox.get()
            if item is None:
                raise StopAsyncIteration
            return item

        async def close(self):
            self.inbox.put_nowait(None)

    ws_mod = types.ModuleType("websockets")

    async def connect(url, **kw):
        calls["ws_url"] = url
        sock = Socket()
        calls["socket"] = sock
        return sock

    ws_mod.connect = connect
    monkeypatch.setitem(sys.modules, "websockets", ws_mod)

    class TrackKind:
        KIND_AUDIO, KIND_VIDEO = 1, 2

    class Room:
        def __init__(self):
            self.handlers = {}

        def on(self, event, cb):
            self.handlers[event] = cb

        async def connect(self, url, token, options=None):
            calls["room"].append((url, token))
            who = types.SimpleNamespace(identity="heygen")
            self.handlers["track_subscribed"](types.SimpleNamespace(kind=TrackKind.KIND_VIDEO), None, who)
            self.handlers["track_subscribed"](types.SimpleNamespace(kind=TrackKind.KIND_AUDIO), None, who)

        async def disconnect(self):
            calls["room"].append("disconnected")
            vendor.end()

    class VideoStream:
        def __init__(self, track, format=None):
            assert format == "rgb24"

        def __aiter__(self):
            return self._gen()

        async def _gen(self):
            async for frame in vendor.video():
                yield _LkVideoEvent(frame.to_ndarray(format="rgb24"), float(frame.time))

    class AudioStream:
        def __init__(self, track, sample_rate=48000, num_channels=1):
            assert (sample_rate, num_channels) == (48000, 1)

        def __aiter__(self):
            return self._gen()

        async def _gen(self):
            async for frame in vendor.audio():
                stereo = frame.to_ndarray().reshape(-1, 2)
                yield _LkAudioEvent(stereo[:, 0])

    rtc = types.SimpleNamespace(Room=Room, RoomOptions=lambda **kw: kw, TrackKind=TrackKind,
                                VideoStream=VideoStream, AudioStream=AudioStream,
                                VideoBufferType=types.SimpleNamespace(RGB24="rgb24"))
    lk = types.ModuleType("livekit")
    lk.rtc = rtc
    monkeypatch.setitem(sys.modules, "livekit", lk)
    monkeypatch.setitem(sys.modules, "livekit.rtc", rtc)
    return calls


def _la_cfg(**kw) -> LiveVideoConfig:
    base = dict(vendor="liveavatar", key="la_0123456789abcdef0123", avatar="", fps=25.0, size=64)
    base.update(kw)
    return LiveVideoConfig(**base)


@pytest.mark.asyncio
async def test_liveavatar_driver_follows_the_documented_lite_flow(monkeypatch):
    from app.avatar.live.vendors import liveavatar
    monkeypatch.setattr(liveavatar, "FLUSH_IDLE_S", 0.05)
    calls = _fake_liveavatar(monkeypatch)
    driver = liveavatar.LiveAvatarDriver(_la_cfg(), Persona("supplier"))
    await driver.connect()
    token = next(c for c in calls["http"] if c[1].endswith("/v1/sessions/token"))
    assert token[2] == {"X-API-KEY": "la_0123456789abcdef0123"}
    assert token[3]["mode"] == "LITE" and token[3]["avatar_id"] == "vid-9", "стоковое лицо — видео, активное"
    assert token[3]["is_sandbox"] is False
    assert calls["ws_url"] == "wss://cmd" and calls["room"] == [("wss://lk", "agent-jwt")]

    events: list = []

    async def collect():
        async for event in driver.events():
            events.append(event)

    reader = asyncio.get_running_loop().create_task(collect())
    pcm = _tone(1600, lead_silence_ms=80)
    for i in range(0, len(pcm), 4 * 2400):              # куски по 100 мс
        await driver.send_audio(pcm[i:i + 4 * 2400], "g1")
    await driver.end_of_speech("g1")
    await asyncio.sleep(2.0)
    reader.cancel()

    speaks = [m for m in calls["ws"] if m["type"] == "agent.speak"]
    sizes = [len(base64.b64decode(m["audio"])) // 2 * 1000 // 24000 for m in speaks]
    assert sizes[0] == 400 and sizes[1] == 1000, f"первый кусок 400 мс, дальше по секунде: {sizes}"
    assert sum(sizes) == 1600, "ни одного миллисекунды звука не потеряно"
    assert calls["ws"][-1]["type"] == "agent.speak_end", "конец реплики — после всего звука"
    frames = [e for e in events if isinstance(e, VideoFrame)]
    assert frames and all(abs(f.pts_ms - round(f.pts_ms / 40) * 40) < 20 for f in frames)
    assert frames[0].pts_ms < 200

    await driver.interrupt()
    assert calls["ws"][-1] == {"type": "agent.interrupt"}
    await driver.close()
    await asyncio.sleep(0.05)
    assert calls["stopped"] == [{"session_id": "sess-1", "reason": "USER_CLOSED"}], \
        "сессию у сервиса останавливают явно — иначе минуты идут до таймаута простоя"
    assert "disconnected" in calls["room"]


@pytest.mark.asyncio
async def test_liveavatar_stop_is_requested_before_anything_can_interrupt_closing(monkeypatch):
    """Запрос остановки уходит ПЕРВЫМ шагом `close()`, даже если само закрытие
    тут же отменят (партия закрывается с потолком в секунду)."""
    from app.avatar.live.vendors import liveavatar
    calls = _fake_liveavatar(monkeypatch)
    driver = liveavatar.LiveAvatarDriver(_la_cfg(), Persona("supplier"))
    await driver.connect()
    closing = asyncio.get_running_loop().create_task(driver.close())
    await asyncio.sleep(0)                    # закрытие успело сделать первый шаг
    from app.avatar.live.driver import PENDING_STOPS, finish_stops
    assert driver.closed_session_id == "sess-1" and PENDING_STOPS, \
        "остановка сессии не запрошена первым шагом закрытия"
    closing.cancel()
    with contextlib.suppress(asyncio.CancelledError):
        await closing
    assert await finish_stops() == 0
    assert calls["stopped"] == [{"session_id": "sess-1", "reason": "USER_CLOSED"}]
    assert driver.closed_session_id == "sess-1"


@pytest.mark.asyncio
async def test_liveavatar_session_length_cap_goes_to_the_service(monkeypatch):
    from app.avatar.live.vendors import liveavatar
    calls = _fake_liveavatar(monkeypatch)
    driver = liveavatar.LiveAvatarDriver(_la_cfg(), Persona("supplier"))
    driver.max_session_s = 90
    await driver.connect()
    token = next(c for c in calls["http"] if c[1].endswith("/v1/sessions/token"))
    assert token[3]["max_session_duration"] == 90
    assert {"token_request", "token", "started", "ws_connected", "room", "tracks"} <= set(driver.marks)
    await driver.close()


@pytest.mark.asyncio
async def test_liveavatar_rotates_the_session_before_its_length_limit(monkeypatch):
    """У предела сервис молча перестаёт говорить (замер 29.09) — драйвер сам
    объявляет плановую смену сессии заранее, по пределу из ответа на start."""
    from app.avatar.live.vendors import liveavatar
    monkeypatch.setattr(liveavatar, "ROTATE_MARGIN_S", 0.0)
    calls = _fake_liveavatar(monkeypatch)
    import httpx
    fake_post = httpx.AsyncClient.post

    async def post(self, url, headers=None, json=None):
        response = await fake_post(self, url, headers=headers, json=json)
        if url.endswith("/v1/sessions/start"):
            response._data = {**response._data, "max_session_duration": 0.2}
        return response

    monkeypatch.setattr(httpx.AsyncClient, "post", post)
    monkeypatch.setattr(liveavatar.asyncio, "sleep", _fast_sleep(liveavatar.asyncio.sleep))
    driver = liveavatar.LiveAvatarDriver(_la_cfg(), Persona("supplier"))
    await driver.connect()
    assert driver.session_limit_s == 0.2

    async def first_closed():
        async for event in driver.events():
            if isinstance(event, Closed):
                return event

    event = await asyncio.wait_for(first_closed(), timeout=8)
    assert event.planned and not event.fatal and "предел" in event.reason
    await driver.close()
    assert calls["stopped"], "старая сессия остановлена"


def _fast_sleep(real_sleep):
    """Пауза смены сессии не короче 5 с по коду; в тесте — укорачиваем."""
    async def sleep(seconds, *a, **kw):
        return await real_sleep(min(seconds, 0.05), *a, **kw)
    return sleep


@pytest.mark.asyncio
async def test_liveavatar_sandbox_uses_the_free_face(monkeypatch):
    from app.avatar.live.vendors import liveavatar
    calls = _fake_liveavatar(monkeypatch)
    driver = liveavatar.LiveAvatarDriver(_la_cfg(sandbox=True), Persona("supplier"))
    await driver.connect()
    token = next(c for c in calls["http"] if c[1].endswith("/v1/sessions/token"))
    assert token[3]["is_sandbox"] is True and token[3]["avatar_id"] == liveavatar.SANDBOX_AVATAR
    await driver.close()


@pytest.mark.asyncio
async def test_liveavatar_key_check_reports_credits_and_rejects_bad_keys(monkeypatch):
    from app.avatar.live.vendors import liveavatar
    _fake_liveavatar(monkeypatch)
    assert "12.5" in await liveavatar.LiveAvatarDriver.check_key(_la_cfg())
    with pytest.raises(DriverError) as err:
        await liveavatar.LiveAvatarDriver.check_key(_la_cfg(key="la_wrongwrongwrongwrong"))
    assert err.value.fatal and err.value.reason == "auth"
    _fake_liveavatar(monkeypatch, credits="0")
    with pytest.raises(DriverError) as err:
        await liveavatar.LiveAvatarDriver.check_key(_la_cfg())
    assert err.value.reason == "quota"


@pytest.mark.asyncio
async def test_liveavatar_service_disconnect_is_a_closed_event(monkeypatch):
    from app.avatar.live.vendors import liveavatar
    calls = _fake_liveavatar(monkeypatch)
    driver = liveavatar.LiveAvatarDriver(_la_cfg(), Persona("supplier"))
    await driver.connect()
    calls["socket"].inbox.put_nowait(json.dumps({"type": "session.state_updated", "state": "disconnected"}))

    async def first_closed():
        async for event in driver.events():
            if isinstance(event, Closed):
                return event

    event = await asyncio.wait_for(first_closed(), timeout=2)
    assert isinstance(event, Closed) and "отключена" in event.reason
    await driver.close()


@pytest.mark.asyncio
async def test_liveavatar_failed_start_still_stops_the_billed_session(monkeypatch):
    """Сессия выдана, а сокет команд не поднялся — остановить её всё равно надо."""
    from app.avatar.live.vendors import liveavatar
    monkeypatch.setattr(liveavatar, "CONNECT_WAIT_S", 0.1)
    calls = _fake_liveavatar(monkeypatch)
    ws_mod = sys.modules["websockets"]
    original = ws_mod.connect

    async def silent(url, **kw):
        sock = await original(url, **kw)
        sock.inbox = asyncio.Queue()                  # «connected» не придёт
        return sock

    ws_mod.connect = silent
    driver = liveavatar.LiveAvatarDriver(_la_cfg(), Persona("supplier"))
    with pytest.raises(DriverError):
        await driver.connect()
    await driver.close()
    await asyncio.sleep(0.05)
    assert calls["stopped"] == [{"session_id": "sess-1", "reason": "USER_CLOSED"}]


def test_our_calls_exist_in_the_real_livekit_sdk():
    """Имена, на которые опирается драйвер LiveAvatar, — в установленном SDK LiveKit."""
    pytest.importorskip("livekit")
    from livekit import rtc
    import inspect
    from app.avatar.live.vendors import liveavatar as driver
    assert {driver.LK_TRACK_EVENT, driver.LK_GONE_EVENT} <= set(rtc.room.EventTypes.__args__)
    assert hasattr(rtc.VideoBufferType, driver.LK_VIDEO_FORMAT)
    assert "auto_subscribe" in {f for f in rtc.RoomOptions.__dataclass_fields__}
    assert "format" in inspect.signature(rtc.VideoStream).parameters
    assert {"sample_rate", "num_channels"} <= set(inspect.signature(rtc.AudioStream).parameters)
    assert hasattr(rtc.TrackKind, "KIND_VIDEO") and hasattr(rtc.TrackKind, "KIND_AUDIO")
    assert "timestamp_us" in rtc.VideoFrameEvent.__dataclass_fields__


def test_service_frames_become_square_jpegs_within_the_wire_limit():
    """16:9 кадр сервиса → квадрат из центра нужной стороны, ≤128 000 байт."""
    import io
    from PIL import Image
    from app.avatar.live.media import MAX_JPEG_BYTES, encode_jpeg
    rng = np.random.default_rng(1)
    wide = rng.integers(0, 255, size=(720, 1280, 3), dtype=np.uint8)      # шум — худшее для JPEG
    wide[:, 280:1000] = 90                                               # центральный квадрат 720 px
    wide[:, :280] = 250                                                  # поля по краям — светлые
    wide[:, 1000:] = 250
    data = encode_jpeg(wide, size=320)
    assert data is not None and data.startswith(b"\xff\xd8") and len(data) <= MAX_JPEG_BYTES
    img = np.asarray(Image.open(io.BytesIO(data)).convert("RGB")).astype(int)
    assert img.shape[:2] == (320, 320)
    assert abs(img[100:220, 100:220].mean() - 90) < 12, "квадрат вырезан из середины"
    assert img[:, :24].mean() < 150 and img[:, -24:].mean() < 150, \
        "поля 16:9 не отрезаны — кадр сжат в квадрат, лицо сплющено"


def test_our_audio_reaches_the_service_as_int16_at_its_rate():
    from app.avatar.live.media import f32_to_s16
    pcm = np.full(2400, 0.5, dtype="<f4").tobytes()                       # 100 мс, 24 кГц
    same = np.frombuffer(f32_to_s16(pcm), dtype="<i2")
    assert same.size == 2400 and abs(int(same[1200]) - 16383) <= 1
    down = np.frombuffer(f32_to_s16(pcm, dst_rate=16000), dtype="<i2")
    assert down.size == 1600


@pytest.mark.asyncio
async def test_driver_keeps_a_jittery_stream_at_its_own_rate_before_encoding():
    """Прореживание до JPEG: метки LiveAvatar при 25 к/с дрожат (40–44 мс,
    изредка 39). Строгое «не чаще 40 мс» выбрасывало такие кадры — 13 % губ."""
    from app.avatar.live.driver import Persona, VideoFrame
    from app.avatar.live.vendors._webrtc import WebRtcDriver

    cfg = LiveVideoConfig(vendor="anam", key="an_0123456789abcdef0123", fps=25.0, size=64, idle_fps=0.0)
    clock = [10.0]
    drv = WebRtcDriver(cfg, Persona("supplier"), now=lambda: clock[0])
    drv._generation = "g"
    drv._anchor.sent("g", np.full(2400, 0.3, dtype="<f4").tobytes())
    drv._anchor.returned_audio(np.full(480, 0.3, dtype=np.float32), 48000, 10.0)
    times = [0.0, 0.0392, 0.0804, 0.1191, 0.161, 0.1996, 0.24]

    class Frame:
        def __init__(self, t):
            self.time = t

        def to_ndarray(self, format):
            return np.zeros((64, 64, 3), dtype=np.uint8)

    async def frames():
        for t in times:
            clock[0] = 10.01 + t
            yield Frame(t)

    drv._closing = True                     # конец потока здесь — не обрыв
    await drv._video_loop(frames())
    got = []
    while not drv._events.empty():
        event = drv._events.get_nowait()
        if isinstance(event, VideoFrame):
            got.append(event)
    assert len(got) == len(times), [round(f.pts_ms, 1) for f in got]


@pytest.mark.asyncio
async def test_driver_sends_the_listening_face_between_replies_at_the_idle_rate():
    """Между репликами лицо сервиса — кадры простоя, реже кадров речи."""
    from app.avatar.live.driver import IdleFrame, Persona, VideoFrame
    from app.avatar.live.vendors._webrtc import WebRtcDriver

    cfg = LiveVideoConfig(vendor="anam", key="an_0123456789abcdef0123", fps=25.0, size=64, idle_fps=5.0)
    clock = [10.0]
    drv = WebRtcDriver(cfg, Persona("supplier"), now=lambda: clock[0])

    class Frame:
        def __init__(self, t):
            self.time = t

        def to_ndarray(self, format):
            return np.zeros((64, 64, 3), dtype=np.uint8)

    async def frames():
        for i in range(25):                  # секунда простоя при 25 к/с
            clock[0] = 10.0 + i * 0.04
            yield Frame(i * 0.04)

    drv._closing = True
    await drv._video_loop(frames())
    events = []
    while not drv._events.empty():
        events.append(drv._events.get_nowait())
    assert not [e for e in events if isinstance(e, VideoFrame)], "без реплики кадров речи нет"
    idle = [e for e in events if isinstance(e, IdleFrame)]
    assert 4 <= len(idle) <= 6, f"простой — около 5 в секунду, а не {len(idle)}"


def test_liveavatar_session_is_stopped_only_if_the_exiting_process_waits_for_it(monkeypatch):
    """Прибор закрывает лицо и сразу выходит. Запрос остановки — фоновая
    задача; без ожидания он отменялся вместе с циклом событий, и 29.09 сервис
    сам закрыл две такие сессии через 194 и 210 с (`ZOMBIE_SESSION_REAP`)."""
    import httpx
    from app.avatar.live.driver import finish_stops
    from app.avatar.live.vendors import liveavatar
    calls = _fake_liveavatar(monkeypatch)
    fast = httpx.AsyncClient

    class SlowStop(fast):
        async def post(self, url, headers=None, json=None):
            if url.endswith("/v1/sessions/stop"):
                await asyncio.sleep(0.2)          # настоящий API отвечает сотни миллисекунд
            return await super().post(url, headers=headers, json=json)

    monkeypatch.setattr(httpx, "AsyncClient", SlowStop)

    async def run(wait: bool) -> None:
        driver = liveavatar.LiveAvatarDriver(_la_cfg(), Persona("supplier"))
        await driver.connect()
        await driver.close()
        if wait:
            assert await finish_stops() == 0

    asyncio.run(run(False))
    assert calls["stopped"] == [], "без ожидания остановка отменяется с выходом процесса"
    asyncio.run(run(True))
    assert calls["stopped"] == [{"session_id": "sess-1", "reason": "USER_CLOSED"}]
