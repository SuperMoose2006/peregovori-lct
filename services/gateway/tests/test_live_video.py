"""test_live_video.py — живое видео собеседника: адаптер сервиса, заглушка, флаг.

Путь проверяется ЦЕЛИКОМ заглушкой (`avatar/live/stub.py`): подключение,
задержка сервиса, удержание звука под кадры, сторож, обрыв посреди реплики,
возврат рисованного портрета и оба входа — наш звук и текст с голосом
сервиса. Сети и денег здесь нет: заглушка рисует кадры локально, а время в
ней настоящее — кадры приходят позже звука, как у сети.

Чего здесь нет и быть не может: настоящей задержки, разброса и качества губ
платного сервиса — это проверяется с ключом по docs/INTEGRATION_LIVE_VIDEO.md.
"""

from __future__ import annotations

import asyncio
import base64
import logging
import time

import numpy as np
import pytest

from app import engine
from app.avatar import factory
from app.avatar.amplitude import AmplitudeAvatar
from app.avatar.live import adapter as adapter_mod
from app.avatar.live import config as live_config
from app.avatar.live.adapter import LiveVideoAvatar
from app.avatar.live.clock import PlaybackClock
from app.avatar.live.config import LiveVideoConfig, VendorSpec
from app.avatar.live.driver import (Closed, DriverError, DriverInfo, LiveVideoDriver, Persona,
                                    VideoFrame)
from app.avatar.live.stub import StubDriver
from app.avatar.presence import PresenceAvatar
from app.orchestrator.negotiation import NegotiationOrchestrator
from app.orchestrator.tts_manager import TTSTaskManager
from app.providers.tts.base import TTSProvider, Voice
from app.realtime.session import Layers, RealtimeSession

SR = 24000
JPEG = b"\xff\xd8" + b"\x00" * 64 + b"\xff\xd9"


# --------------------------------------------------------------------- помощники

def _pcm(ms: float, level: float = 0.2) -> bytes:
    n = int(SR * ms / 1000)
    t = np.arange(n) / SR
    return (level * np.sin(2 * np.pi * 220 * t)).astype("<f4").tobytes()


class ShortTTS(TTSProvider):
    """Синтез без сети: шесть кусков по 100 мс на фразу, сразу."""

    def __init__(self, chunks: int = 6, marker: float = 0.2) -> None:
        self.chunks, self.marker = chunks, marker
        self.texts: list[str] = []

    def available(self) -> bool:
        return True

    async def stream(self, text, voice):
        self.texts.append(text)
        for i in range(self.chunks):
            # Громкость растёт на каждом куске — по ней видно порядок на выходе.
            yield _pcm(100, self.marker + 0.01 * i)

    def describe(self) -> str:
        return "short test tts"


class Recorder:
    """Публикация с отметкой времени — и в шину сессии, если она есть."""

    def __init__(self, bus=None) -> None:
        self.bus = bus
        self.log: list[tuple[float, dict]] = []

    def __call__(self, event: dict) -> None:
        self.log.append((time.monotonic(), event))
        if self.bus is not None:
            self.bus.publish(event)

    def events(self, kind: str | None = None) -> list[dict]:
        return [e for _, e in self.log if kind is None or e["type"] == kind]

    def audio(self) -> list[dict]:
        return [e for e in self.events("response.output.delta") if e.get("kind") == "audio"]

    def frames(self) -> list[dict]:
        return self.events("avatar.frame")

    def states(self) -> list[dict]:
        return self.events("avatar.state")


def _cfg(**kw) -> LiveVideoConfig:
    base = dict(vendor="stub", input="audio", stall_ms=600, fps=25.0, max_failures=3,
                connect_timeout_s=2.0)
    base.update(kw)
    return LiveVideoConfig(**base)


def _avatar(publish, *, cfg: LiveVideoConfig | None = None, drivers: list | None = None,
            **stub) -> LiveVideoAvatar:
    cfg = cfg or _cfg()
    persona = Persona("supplier")
    made = drivers if drivers is not None else []

    def make():
        driver = StubDriver(cfg, persona, **stub)
        made.append(driver)
        return driver

    return LiveVideoAvatar(persona, publish, make, cfg)


async def _until(predicate, timeout: float = 3.0) -> bool:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if predicate():
            return True
        await asyncio.sleep(0.01)
    return predicate()


async def _connected(avatar: LiveVideoAvatar) -> None:
    avatar.start()
    assert await _until(lambda: avatar.link == "ready"), avatar.link


async def _speak(avatar: LiveVideoAvatar, rec: Recorder, tts: TTSProvider, *, gen: str = "g1",
                 phrases: int = 1) -> TTSTaskManager:
    """Одна реплика через настоящий менеджер синтеза, как в партии."""
    manager = TTSTaskManager(tts, rec, Voice("", "ru", True))
    manager.on_audio = avatar.speak
    manager.audio_out = avatar.audio_out
    manager.on_audio_end = avatar.end_of_speech
    for i in range(phrases):
        manager.speak(f"фраза {i}", generation_id=gen, turn_id=1)
    manager.finish(gen)
    return manager


async def _played_out(avatar: LiveVideoAvatar, manager: TTSTaskManager, timeout: float = 6.0) -> None:
    await manager.wait_idle()

    def done() -> bool:
        finished = avatar.clock.finished_at()
        return (not avatar._held and not avatar._utterances
                and (finished is None or time.monotonic() > finished + 0.3))

    assert await _until(done, timeout)


# ------------------------------------------------------------- флаг: креды

def test_without_credentials_the_face_is_exactly_the_old_one(monkeypatch):
    """Нет ключа — рисованный портрет, как до этого пакета, и ни шагу в сеть."""
    touched = []
    monkeypatch.setattr(live_config, "driver_class", lambda spec: touched.append(spec) or StubDriver)
    for env in ({}, {"NEGO_LIVE_VIDEO": "off"}, {"NEGO_LIVE_VIDEO": "anam"},
                {"NEGO_LIVE_VIDEO": "anam", "NEGO_LIVE_VIDEO_KEY": "   "}):
        monkeypatch.delenv("NEGO_LIVE_VIDEO", raising=False)
        monkeypatch.delenv("NEGO_LIVE_VIDEO_KEY", raising=False)
        for k, v in env.items():
            monkeypatch.setenv(k, v)
        voice = factory.create_avatar("supplier", lambda e: None, voice=True)
        text = factory.create_avatar("supplier", lambda e: None, voice=False)
        assert type(voice) is AmplitudeAvatar, env
        assert type(text) is PresenceAvatar, env
        assert voice.capabilities().lipsync_mode == "amplitude"
    assert touched == [], "без кредов драйвер сервиса даже не загружался"


def test_named_service_without_key_is_off_quietly_and_says_why(monkeypatch, caplog):
    monkeypatch.setenv("NEGO_LIVE_VIDEO", "anam")
    monkeypatch.setenv("NEGO_LIVE_VIDEO_KEY", "")
    cfg = live_config.load()
    assert cfg.missing_key and not cfg.enabled and not cfg.errors
    assert "нет ключа" in live_config.describe(cfg)
    with caplog.at_level(logging.INFO, logger="dialog.live_video"):
        asyncio.run(live_config.startup_check(cfg))
    assert not [r for r in caplog.records if r.levelno >= logging.WARNING], \
        "сдача идёт без ключа — это не ошибка и не предупреждение"


@pytest.mark.parametrize("key,words", [
    (" abcdefghijklmnopqrstuvwxyz", "пробел"),
    ('"abcdefghijklmnopqrstuvwxyz"', "кавычк"),
    ("abcdefgh ijklmnopqrstuvwxyz", "пробел"),
    ("...", "заглушка"),
    ("<your-api-key>", "заглушка"),
    ("sk-or-v1-0123456789abcdef0123", "OpenRouter"),
    ("ключключключключключключ", "не-ASCII"),
    ("short", "короткий"),
])
def test_broken_key_is_named_in_words_and_keeps_video_off(monkeypatch, key, words):
    monkeypatch.setenv("NEGO_AI", "on")
    cfg = live_config.load({"NEGO_LIVE_VIDEO": "anam", "NEGO_LIVE_VIDEO_KEY": key, "NEGO_AI": "on"})
    assert not cfg.enabled
    assert cfg.errors and words in cfg.errors[0], cfg.errors
    assert live_config.describe(cfg).startswith("off:")


def test_a_plausible_key_enables_the_named_service(monkeypatch):
    monkeypatch.setenv("NEGO_AI", "on")
    cfg = live_config.load({"NEGO_LIVE_VIDEO": "anam",
                            "NEGO_LIVE_VIDEO_KEY": "an_0123456789abcdefABCDEF.xyz"})
    assert cfg.enabled and not cfg.errors, cfg.errors
    assert cfg.input == "audio", "по умолчанию голос остаётся нашим"


def test_offline_mode_keeps_a_network_service_off(monkeypatch):
    monkeypatch.setenv("NEGO_AI", "off")
    cfg = live_config.load({"NEGO_LIVE_VIDEO": "anam", "NEGO_LIVE_VIDEO_KEY": "a" * 32})
    assert not cfg.enabled and any("NEGO_AI=off" in e for e in cfg.errors)
    # Заглушке сеть не нужна — она поднимается и офлайн, но только по имени.
    assert live_config.load({"NEGO_LIVE_VIDEO": "stub"}).enabled


def test_unknown_service_and_wrong_input_are_errors_not_guesses():
    cfg = live_config.load({"NEGO_LIVE_VIDEO": "heygen-v9"})
    assert not cfg.enabled and "известны" in cfg.errors[0]
    cfg = live_config.load({"NEGO_LIVE_VIDEO": "stub", "NEGO_LIVE_VIDEO_INPUT": "video"})
    assert not cfg.enabled


def test_bad_tuning_numbers_fall_back_to_defaults_with_a_warning():
    cfg = live_config.load({"NEGO_LIVE_VIDEO": "stub", "NEGO_LIVE_VIDEO_STALL_MS": "полторы",
                            "NEGO_LIVE_VIDEO_FPS": "900"})
    assert cfg.enabled, "неверная настройка чисел не выключает видео"
    assert cfg.stall_ms == live_config.DEFAULT_STALL_MS and cfg.fps == live_config.DEFAULT_FPS
    assert len(cfg.warnings) == 2


class _RejectingDriver(StubDriver):
    @staticmethod
    async def check_key(cfg):
        raise DriverError("401 Unauthorized", reason="auth", fatal=True)


class _AcceptingDriver(StubDriver):
    @staticmethod
    async def check_key(cfg):
        return "3 лица доступно"


@pytest.fixture
def fake_vendor(monkeypatch):
    """Сервис `fake`: драйвер — заглушка, ключ — обязателен."""
    monkeypatch.setattr(live_config, "STATUS", live_config._Status())

    def install(driver_cls, requires=()):
        spec = VendorSpec(name="fake", target="unused", inputs=("audio", "text"), requires=requires)
        monkeypatch.setitem(live_config.VENDORS, "fake", spec)
        monkeypatch.setattr(live_config, "driver_class", lambda s: driver_cls)
        monkeypatch.setenv("NEGO_AI", "on")
        monkeypatch.setenv("NEGO_LIVE_VIDEO", "fake")
        monkeypatch.setenv("NEGO_LIVE_VIDEO_KEY", "k_0123456789abcdef0123456789")
        return spec

    return install


def test_key_rejected_at_startup_turns_video_off_with_words(fake_vendor, caplog):
    fake_vendor(_RejectingDriver)
    with caplog.at_level(logging.ERROR, logger="dialog.live_video"):
        asyncio.run(live_config.startup_check())
    assert live_config.STATUS.rejected and "401" in live_config.STATUS.rejected
    assert any("NEGO_LIVE_VIDEO_KEY" in r.getMessage() for r in caplog.records), \
        "в логе должно быть сказано, какую строку чинить"
    assert live_config.active() is None
    assert "отверг ключ" in live_config.describe()
    assert type(factory.create_avatar("supplier", lambda e: None, voice=True)) is AmplitudeAvatar


def test_key_accepted_at_startup_keeps_video_on(fake_vendor):
    fake_vendor(_AcceptingDriver)
    verdict = asyncio.run(live_config.startup_check())
    assert "ключ принят" in verdict and live_config.active() is not None
    assert isinstance(factory.create_avatar("supplier", lambda e: None, voice=True), LiveVideoAvatar)


def test_missing_service_modules_are_named_at_startup(fake_vendor):
    fake_vendor(_AcceptingDriver, requires=("definitely_not_installed_module_xyz",))
    asyncio.run(live_config.startup_check())
    assert "definitely_not_installed_module_xyz" in (live_config.STATUS.rejected or "")
    assert "requirements-live-video.txt" in live_config.STATUS.rejected
    assert live_config.active() is None


def test_explicit_provider_name_wins_over_credentials(monkeypatch):
    monkeypatch.setenv("NEGO_LIVE_VIDEO", "stub")
    monkeypatch.setenv("NEGO_AVATAR_PROVIDER", "presence")
    assert type(factory.create_avatar("supplier", lambda e: None, voice=True)) is PresenceAvatar
    monkeypatch.setenv("NEGO_AVATAR_PROVIDER", "testcard")
    from app.avatar.testcard import TestcardAvatar
    assert type(factory.create_avatar("supplier", lambda e: None, voice=True)) is TestcardAvatar


# -------------------------------------------------------------- часы клиента

def test_clock_mirrors_the_player_jitter_buffer_and_back_to_back_chunks():
    clock = PlaybackClock()
    clock.published("g", SR // 10, at=10.0)            # 100 мс в тишину
    clock.published("g", SR // 10, at=10.05)           # встык
    assert clock.play_time("g", 0) == pytest.approx(10.16)
    assert clock.play_time("g", 150) == pytest.approx(10.31)
    assert clock.playing_pts("g", 10.20) == pytest.approx(40.0)
    assert clock.playing_pts("g", 10.40) is None       # отзвучало
    clock.published("g", SR // 10, at=11.0)            # после паузы — снова буфер
    assert clock.play_time("g", 200) == pytest.approx(11.16)
    assert clock.play_time("other", 0) is None


# ---------------------------------------------------- кадры: время и порог 250 мс

def _manual(now_box: list[float], **cfg_kw) -> tuple[LiveVideoAvatar, Recorder]:
    """Адаптер с ручными часами: кадры и звук подаются руками, без сети и задач."""
    rec = Recorder()
    cfg = _cfg(**cfg_kw)
    avatar = LiveVideoAvatar(Persona("supplier"), rec, lambda: StubDriver(cfg, Persona("supplier")),
                             cfg, now=lambda: now_box[0])
    avatar.link = "ready"
    return avatar, rec


def _audio_event(gen: str, ms: float) -> dict:
    return {"type": "response.output.delta", "kind": "audio", "generation_id": gen,
            "turn_id": 1, "audio": base64.b64encode(_pcm(ms)).decode("ascii")}


def test_frame_older_than_250ms_by_the_audio_clock_is_not_sent():
    now = [100.0]
    avatar, rec = _manual(now)
    avatar.audio_out(_audio_event("g", 1000))      # без выпускающего — сразу клиенту
    play0 = avatar.clock.play_time("g", 0)
    assert play0 == pytest.approx(100.16)
    avatar._on_frame(VideoFrame("g", 0.0, JPEG))
    avatar._on_frame(VideoFrame("g", 40.0, JPEG))
    # Кадр pts=0 пришёл через 260 мс после своего звука — клиент его не покажет.
    now[0] = play0 + 0.260
    avatar._release_frames(now[0])
    assert avatar.stats.frames_late == 1
    # Кадр pts=40 звучит в play0+0.04: ему 220 мс — ещё в окне, уходит.
    assert [f["pts_ms"] for f in rec.frames()] == [40.0]


def test_frame_is_not_sent_before_its_audio_nor_far_ahead_of_it():
    now = [100.0]
    avatar, rec = _manual(now)
    avatar._begin("g")
    avatar._on_frame(VideoFrame("g", 0.0, JPEG))
    avatar._release_frames(now[0])
    assert rec.frames() == [], "звук под кадр ещё не отдан клиенту — кадр ждёт"
    avatar.audio_out(_audio_event("g", 3000))
    avatar._on_frame(VideoFrame("g", 2000.0, JPEG))
    avatar._release_frames(now[0])
    assert [f["pts_ms"] for f in rec.frames()] == [0.0]
    now[0] = avatar.clock.play_time("g", 2000.0) - adapter_mod.LOOKAHEAD_MS / 1000 + 0.001
    avatar._release_frames(now[0])
    assert [f["pts_ms"] for f in rec.frames()] == [0.0, 2000.0]


def test_frames_of_other_generations_and_bad_times_are_dropped():
    now = [100.0]
    avatar, rec = _manual(now)
    avatar.audio_out(_audio_event("g2", 1000))
    for frame in (VideoFrame("g1", 0.0, JPEG), VideoFrame("", 0.0, JPEG),
                  VideoFrame("g2", float("nan"), JPEG), VideoFrame("g2", -5.0, JPEG)):
        avatar._on_frame(frame)
    avatar._on_frame(VideoFrame("g2", 80.0, JPEG))
    avatar._on_frame(VideoFrame("g2", 40.0, JPEG))       # назад во времени
    avatar._release_frames(now[0] + 0.2)
    assert [f["pts_ms"] for f in rec.frames()] == [80.0]
    assert avatar.stats.frames_foreign == 2 and avatar.stats.frames_invalid == 3


def test_frames_are_thinned_to_the_configured_rate():
    now = [100.0]
    avatar, rec = _manual(now, fps=12.5)
    avatar.audio_out(_audio_event("g", 1000))
    for i in range(10):
        avatar._on_frame(VideoFrame("g", i * 40.0, JPEG))
    assert [f.pts_ms for f in avatar._pending] == [0.0, 80.0, 160.0, 240.0, 320.0]


def test_pts_offset_calibration_shifts_every_frame():
    now = [100.0]
    avatar, _ = _manual(now, pts_offset_ms=-40)
    avatar.audio_out(_audio_event("g", 1000))
    avatar._on_frame(VideoFrame("g", 20.0, JPEG))     # 20 − 40 < 0 — выброшен
    avatar._on_frame(VideoFrame("g", 100.0, JPEG))
    assert [f.pts_ms for f in avatar._pending] == [60.0]


# ------------------------------------------------------ сквозной путь заглушкой

@pytest.mark.asyncio
async def test_audio_path_frames_ride_the_audio_clock_and_voice_is_held_for_them():
    rec = Recorder()
    drivers: list[StubDriver] = []
    avatar = _avatar(rec, drivers=drivers, latency_ms=120)
    await _connected(avatar)
    spoken_at = time.monotonic()
    manager = await _speak(avatar, rec, ShortTTS())
    await _played_out(avatar, manager)

    audio, frames = rec.audio(), rec.frames()
    assert len(audio) == 6, "звук реплики дошёл целиком"
    assert frames, "кадры сервиса дошли до шины"
    assert {f["generation_id"] for f in frames} == {"g1"}
    assert max(f["pts_ms"] for f in frames) < 600
    assert drivers[0].audio_received == 6 * SR // 10, "сервис получил ровно наш PCM"
    # Звук придержан: сервису нужна задержка на кадр, и клиенту звук уходит позже.
    assert avatar.stats.audio_held == 6
    first_audio_t = next(t for t, e in rec.log if e.get("kind") == "audio")
    assert first_audio_t - spoken_at >= 0.22 - 0.03, "звук ушёл клиенту без удержания под кадры"
    # Ни один кадр не ушёл клиенту позже чем через 250 мс после своего звука.
    assert avatar.stats.degrades == [] and avatar.mode == "video"
    # Сигнал конца звука (R2) дошёл до сервиса.
    assert await _until(lambda: drivers[0].ended == ["g1"])
    await avatar.close()


@pytest.mark.asyncio
async def test_connection_drop_mid_reply_returns_the_drawn_portrait_and_voice_goes_on():
    rec = Recorder()
    drivers: list[StubDriver] = []
    avatar = _avatar(rec, drivers=drivers, latency_ms=80, fail_after_s=0.35)
    await _connected(avatar)
    manager = await _speak(avatar, rec, ShortTTS(chunks=12))     # 1.2 с речи
    await _played_out(avatar, manager)

    failed = [s for s in rec.states() if s.get("reason") == "provider_failed"]
    assert failed, "обрыв сервиса не вернул портрет"
    assert failed[0]["lipsync_mode"] == "amplitude" and failed[0]["transport"] == "local"
    assert "closed" in failed[0]["detail"]
    assert len(rec.audio()) == 12, "обрыв лица потерял голос"
    cut = next(i for i, (_, e) in enumerate(rec.log) if e.get("reason") == "provider_failed")
    assert not [e for _, e in rec.log[cut:] if e["type"] == "avatar.frame"], \
        "после возврата портрета пришёл кадр"
    # Партия продолжается: следующее состояние лица — в режиме портрета.
    await avatar.set_state("warm", reaction="warmed")
    assert rec.states()[-1]["lipsync_mode"] == "amplitude"
    assert avatar.capabilities().lipsync_mode == "amplitude"
    await avatar.close()


@pytest.mark.asyncio
async def test_provider_silent_longer_than_the_threshold_falls_back_to_the_portrait():
    rec = Recorder()
    avatar = _avatar(rec, cfg=_cfg(stall_ms=300), latency_ms=50, silent_after_s=0.0)
    await _connected(avatar)
    manager = await _speak(avatar, rec, ShortTTS(chunks=10))
    await _played_out(avatar, manager)
    assert avatar.stats.degrades == ["no_frames"], avatar.stats.degrades
    assert rec.frames() == []
    assert len(rec.audio()) == 10
    # Портрет вернулся, пока голос ещё звучал, а не после конца реплики.
    degrade_t = next(t for t, e in rec.log if e.get("reason") == "provider_failed")
    assert degrade_t < avatar.clock.finished_at()
    await avatar.close()


@pytest.mark.asyncio
async def test_provider_slower_than_the_threshold_is_not_a_failure():
    """Сервис с задержкой в пределах окна — не отказ: иначе сторож ложно рвал бы видео.

    Без удержания звука окно — стартовый запас проигрывателя плюс порог
    клиента: 160 + 250 мс. Кадр с задержкой 250 мс в него укладывается.
    """
    rec = Recorder()
    avatar = _avatar(rec, cfg=_cfg(stall_ms=600, av_delay_ms=0), latency_ms=250)
    await _connected(avatar)
    manager = await _speak(avatar, rec, ShortTTS(chunks=10))
    await _played_out(avatar, manager)
    assert avatar.stats.degrades == []
    assert avatar.stats.frames_sent > 0 and avatar.stats.frames_late == 0
    await avatar.close()


@pytest.mark.asyncio
@pytest.mark.parametrize("hold_ms,shown", [(0, False), (900, True)])
async def test_late_service_frames_are_dropped_and_holding_the_voice_rescues_them(hold_ms, shown):
    """Сервис на 700 мс: без удержания каждый кадр старше 250 мс к своему звуку.

    Такие кадры клиенту не уходят вовсе, лицо не догоняет голос, и сторож
    возвращает портрет. Удержание звука на 900 мс (R1) даёт кадрам успеть.
    """
    rec = Recorder()
    avatar = _avatar(rec, cfg=_cfg(stall_ms=600, av_delay_ms=hold_ms), latency_ms=700)
    await _connected(avatar)
    manager = await _speak(avatar, rec, ShortTTS(chunks=12))
    await _played_out(avatar, manager)
    if shown:
        assert avatar.stats.degrades == [] and avatar.stats.frames_late == 0
        assert avatar.stats.frames_sent >= 25
    else:
        assert avatar.stats.frames_sent == 0 and avatar.stats.frames_late > 0
        assert avatar.stats.degrades == ["no_frames"]
    assert len(rec.audio()) == 12
    await avatar.close()


@pytest.mark.asyncio
async def test_after_a_stall_the_next_reply_tries_video_again_until_the_limit():
    rec = Recorder()
    avatar = _avatar(rec, cfg=_cfg(stall_ms=300, max_failures=2), latency_ms=50)
    await _connected(avatar)
    avatar._degrade("frames_stalled")                  # первый отказ, связь жива
    assert avatar.mode == "amplitude"
    await avatar.set_state("thinking")
    assert avatar.mode == "video"
    assert rec.states()[-1]["reason"] == "provider_recovered"
    assert rec.states()[-1]["lipsync_mode"] == "video"
    avatar._degrade("frames_stalled")                  # второй — предел
    await avatar.set_state("thinking")
    assert avatar.mode == "amplitude", "после предела отказов видео не возвращается"
    assert await _until(lambda: avatar._driver is None), "исчерпав попытки, сессию сервиса закрывают"
    await avatar.close()


@pytest.mark.asyncio
async def test_fatal_connect_error_is_final_and_does_not_retry():
    rec = Recorder()
    drivers: list[StubDriver] = []
    avatar = _avatar(rec, drivers=drivers,
                     fail_connect=DriverError("лицо не найдено", reason="avatar", fatal=True))
    avatar.start()
    assert await _until(lambda: avatar.link == "dead")
    await asyncio.sleep(0.1)
    assert len(drivers) == 1, "ключ или лицо отвергнуты — повторять незачем"
    assert avatar.mode == "amplitude"
    assert rec.states()[-1]["reason"] == "provider_failed"
    await avatar.close()


@pytest.mark.asyncio
async def test_transient_drop_reconnects_and_video_returns_between_replies(monkeypatch):
    monkeypatch.setattr(adapter_mod, "RECONNECT_BACKOFF_S", (0.05, 0.05, 0.05))
    rec = Recorder()
    drivers: list[StubDriver] = []
    cfg = _cfg()
    persona = Persona("supplier")

    def make():
        # Первая сессия рвётся сразу, вторая живёт.
        driver = StubDriver(cfg, persona, fail_after_s=0.05 if not drivers else None)
        drivers.append(driver)
        return driver

    avatar = LiveVideoAvatar(persona, rec, make, cfg)
    avatar.start()
    assert await _until(lambda: len(drivers) >= 2 and avatar.link == "ready")
    assert avatar.mode == "amplitude"
    await avatar.set_state("listening")
    assert avatar.mode == "video", "связь восстановилась — лицо вернулось между репликами"
    assert drivers[0].closed, "оборванная сессия закрыта"
    await avatar.close()


@pytest.mark.asyncio
async def test_planned_session_rotation_is_not_a_failure_and_video_returns(monkeypatch):
    """Смена сессии у предела длины — не отказ: предел отказов партии не тратится."""
    monkeypatch.setattr(adapter_mod, "RECONNECT_BACKOFF_S", (0.05, 0.05, 0.05))
    rec = Recorder()
    drivers: list[StubDriver] = []
    avatar = _avatar(rec, cfg=_cfg(max_failures=1), drivers=drivers)
    await _connected(avatar)
    drivers[0].emit(Closed("session limit", planned=True))
    assert await _until(lambda: len(drivers) >= 2 and avatar.link == "ready")
    assert avatar.failures == 0 and avatar.link == "ready", "плановая смена сожгла отказ"
    await avatar.set_state("listening")
    assert avatar.mode == "video"
    await avatar.close()


@pytest.mark.asyncio
async def test_reply_starting_before_the_service_is_up_uses_the_portrait_without_a_strike():
    rec = Recorder()
    avatar = _avatar(rec, connect_delay_s=5.0)
    avatar.start()
    manager = await _speak(avatar, rec, ShortTTS(chunks=3))
    await manager.wait_idle()
    assert avatar.mode == "amplitude" and avatar.failures == 0
    assert len(rec.audio()) == 3
    await avatar.close()


@pytest.mark.asyncio
async def test_interrupt_drops_held_audio_and_silences_the_service():
    rec = Recorder()
    drivers: list[StubDriver] = []
    avatar = _avatar(rec, drivers=drivers, latency_ms=300)      # звук держится 400 мс
    await _connected(avatar)
    manager = await _speak(avatar, rec, ShortTTS(chunks=6))
    await manager.wait_idle()
    assert avatar._held, "звук ещё придержан"
    manager.clear()
    await avatar.interrupt()
    await asyncio.sleep(0.6)
    assert rec.audio() == [] and rec.frames() == []
    assert await _until(lambda: drivers[0].interrupts == 1)
    assert rec.states()[-1]["state"] == "listening"
    await avatar.close()


@pytest.mark.asyncio
async def test_closing_the_party_right_after_giving_up_still_finishes_closing_the_service():
    """Отказ закрывает сессию сервиса в фоне; закрытие партии сразу следом не
    вправе оборвать это закрытие — иначе платная сессия живёт до таймаута."""
    finished = []

    class SlowClose(StubDriver):
        async def close(self):
            await asyncio.sleep(0.3)
            finished.append(True)
            await super().close()

    rec = Recorder()
    cfg = _cfg()
    avatar = LiveVideoAvatar(Persona("supplier"), rec, lambda: SlowClose(cfg, Persona("supplier")), cfg)
    await _connected(avatar)
    avatar._degrade("quota", fatal=True)          # предел: закрыть сессию сервиса
    await asyncio.sleep(0)
    await avatar.close()                          # партия закрывается тут же
    assert finished == [True], "закрытие сессии сервиса оборвано закрытием партии"


@pytest.mark.asyncio
async def test_close_and_fallback_never_lose_held_audio():
    rec = Recorder()
    avatar = _avatar(rec, latency_ms=300)
    await _connected(avatar)
    manager = await _speak(avatar, rec, ShortTTS(chunks=4))
    await manager.wait_idle()
    assert avatar._held and rec.audio() == []
    await avatar.close()
    assert len(rec.audio()) == 4, "закрытие лица потеряло придержанный голос"


@pytest.mark.asyncio
async def test_drop_while_voice_is_held_releases_it_at_once_and_in_order():
    """Обрыв, пока звук придержан под кадры: голос уходит человеку сразу, по порядку."""
    rec = Recorder()
    drivers: list[StubDriver] = []
    avatar = _avatar(rec, drivers=drivers, latency_ms=900)     # держим звук ~1 с
    await _connected(avatar)
    tts = ShortTTS(chunks=5)
    manager = await _speak(avatar, rec, tts)
    await manager.wait_idle()
    assert len(avatar._held) == 5 and rec.audio() == []
    dropped_at = time.monotonic()
    drivers[0].emit(Closed("network"))
    assert await _until(lambda: len(rec.audio()) == 5, 0.5), "голос остался в очереди за мёртвым лицом"
    released = [t for t, e in rec.log if e.get("kind") == "audio"]
    assert released[-1] - dropped_at < 0.3, "придержанный звук ждал своего срока после отказа"
    peaks = [float(np.abs(np.frombuffer(base64.b64decode(e["audio"]), dtype="<f4")).max())
             for e in rec.audio()]
    assert peaks == sorted(peaks) and len(set(round(p, 3) for p in peaks)) == 5, "порядок звука нарушен"
    await avatar.close()


def test_health_names_the_live_video_state(monkeypatch):
    from fastapi.testclient import TestClient
    from app import main
    monkeypatch.setenv("NEGO_LIVE_VIDEO", "off")
    assert TestClient(main.app).get("/api/health").json()["live_video"] == "off"
    monkeypatch.setenv("NEGO_LIVE_VIDEO", "stub")
    assert TestClient(main.app).get("/api/health").json()["live_video"].startswith("stub (синтетические")


@pytest.mark.asyncio
async def test_audio_is_never_held_without_a_running_releaser():
    """Связь есть, а выпускающего цикла нет (не запущен или упал) — звук сразу."""
    now = [100.0]
    avatar, rec = _manual(now)                      # связь «ready», start() не звали
    assert avatar.mode == "video" and avatar._av_delay_s > 0
    avatar.audio_out(_audio_event("g", 100))
    assert len(rec.audio()) == 1, "звук остался бы в очереди, которую некому отпустить"

    async def crashed():
        raise RuntimeError("ticker died")

    task = asyncio.get_running_loop().create_task(crashed())
    with pytest.raises(RuntimeError):
        await task
    avatar._ticker = task
    avatar.audio_out(_audio_event("g", 100))
    assert len(rec.audio()) == 2, "упавший выпускающий — тоже никого"


# -------------------------------------------------------------- вход text

@pytest.mark.asyncio
async def test_text_mode_service_speaks_the_same_sanitized_phrases_with_its_own_voice():
    session = RealtimeSession("live-text", engine.create_session("supplier", "ru"),
                              layers=Layers(voice=True, avatar=True))
    rec = Recorder(session.bus)
    drivers: list[StubDriver] = []
    avatar = _avatar(rec, cfg=_cfg(input="text"), drivers=drivers, latency_ms=50)
    backup = ShortTTS(marker=0.9)
    provider = avatar.voice_for(backup)
    assert provider is not backup
    tts = TTSTaskManager(provider, rec, Voice("", "ru", True))
    orch = NegotiationOrchestrator(session, tts=tts, avatar=avatar)
    await _connected(avatar)
    await orch.on_player_turn("Что для вас важнее всего, кроме цены?")
    await tts.wait_idle()
    assert await _until(lambda: not avatar._utterances and not avatar._held, 10)
    session.bus.close()
    everything = [e async for e in session.bus.drain()]

    done = [e for e in everything if e["type"] == "response.done"]
    assert done and done[0]["text"]
    assert drivers[0].texts_received == [done[0]["text"]], \
        "сервис получил ровно ту реплику, что ушла бы в наш синтез"
    assert backup.texts == [], "запасной синтез не звучал"
    audio = rec.audio()
    assert audio and {a["generation_id"] for a in audio} == {done[0]["generation_id"]}
    assert rec.frames() and {f["generation_id"] for f in rec.frames()} == {done[0]["generation_id"]}
    assert avatar.mode == "video"
    await avatar.close()


@pytest.mark.asyncio
async def test_text_mode_failure_repeats_the_phrase_with_our_voice_and_keeps_it():
    rec = Recorder()
    drivers: list[StubDriver] = []
    avatar = _avatar(rec, cfg=_cfg(input="text"), drivers=drivers, latency_ms=50,
                     fail_after_s=0.3)
    backup = ShortTTS(chunks=2, marker=0.9)
    provider = avatar.voice_for(backup)
    await _connected(avatar)
    manager = TTSTaskManager(provider, rec, Voice("", "ru", True))
    manager.on_audio = avatar.speak
    manager.audio_out = avatar.audio_out
    long = "слово " * 30
    manager.speak(long, generation_id="g1", turn_id=1)
    manager.speak("вторая фраза", generation_id="g1", turn_id=1)
    await manager.wait_idle()
    assert await _until(lambda: not avatar._held)
    assert backup.texts == [long.strip() if False else long, "вторая фраза"], backup.texts
    assert avatar.mode == "amplitude" and avatar.link == "dead"
    assert any(s.get("reason") == "provider_failed" for s in rec.states())
    # Следующая реплика — нашим голосом сразу, без попытки вернуть сервис.
    manager.speak("третья", generation_id="g2", turn_id=2)
    await manager.wait_idle()
    assert backup.texts[-1] == "третья"
    await avatar.set_state("listening")
    assert avatar.mode == "amplitude"
    await avatar.close()


@pytest.mark.asyncio
async def test_text_mode_silent_service_falls_back_to_our_voice(monkeypatch):
    monkeypatch.setattr(adapter_mod, "TEXT_FIRST_AUDIO_MS", 300)
    rec = Recorder()
    avatar = _avatar(rec, cfg=_cfg(input="text", stall_ms=300), silent_after_s=0.0)
    backup = ShortTTS(chunks=2, marker=0.9)
    provider = avatar.voice_for(backup)
    await _connected(avatar)
    manager = TTSTaskManager(provider, rec, Voice("", "ru", True))
    manager.audio_out = avatar.audio_out
    manager.speak("молчание", generation_id="g1", turn_id=1)
    await asyncio.wait_for(manager.wait_idle(), 5)
    assert backup.texts == ["молчание"]
    assert avatar.stats.degrades == ["voice_stalled"]
    assert len(rec.audio()) == 2
    await avatar.close()


# ---------------------------------------------------------- проводка партии

@pytest.mark.asyncio
async def test_session_advertises_video_only_with_credentials_and_wires_the_adapter(monkeypatch):
    from app.realtime import endpoint
    from app.realtime.events import SessionInit
    monkeypatch.setenv("NEGO_TTS", "testtone")

    monkeypatch.setenv("NEGO_LIVE_VIDEO", "off")
    session, _ = await endpoint._build_session(SessionInit(
        scenarioId="supplier", mode="voice", layers={"voice": True, "avatar": True}))
    assert endpoint._created_payload(session, None)["capabilities"]["avatar"]["lipsync_mode"] == "amplitude"

    monkeypatch.setenv("NEGO_LIVE_VIDEO", "stub")
    session, _ = await endpoint._build_session(SessionInit(
        scenarioId="supplier", mode="voice", layers={"voice": True, "avatar": True}))
    orch, _, _ = endpoint._wire(session)
    caps = endpoint._created_payload(session, None)["capabilities"]
    assert caps["avatar"]["lipsync_mode"] == "video" and caps["avatar"]["transport"] == "jpeg"
    assert caps["avatar"]["synthetic"] is True, "заглушка обязана называть себя тестовой"
    assert caps["speech"] is True
    assert isinstance(orch.avatar, LiveVideoAvatar)
    assert orch.tts.audio_out == orch.avatar.audio_out, "звук человеку идёт через удержание лица"
    assert orch.tts.on_audio_end == orch.avatar.end_of_speech, "сигнал конца звука (R2) проведён"
    assert await _until(lambda: orch.avatar.link == "ready"), "подключение началось при сборке партии"
    await orch.avatar.close()


@pytest.mark.asyncio
async def test_text_input_session_speaks_with_the_service_voice_and_keeps_ours_in_reserve(monkeypatch):
    from app.avatar.live.voice import LiveVideoVoice
    from app.providers.tts.testtone import ToneTTS
    from app.realtime import endpoint
    from app.realtime.events import SessionInit
    monkeypatch.setenv("NEGO_TTS", "testtone")
    monkeypatch.setenv("NEGO_LIVE_VIDEO", "stub")
    monkeypatch.setenv("NEGO_LIVE_VIDEO_INPUT", "text")
    session, _ = await endpoint._build_session(SessionInit(
        scenarioId="supplier", mode="voice", layers={"voice": True, "avatar": True}))
    orch, _, _ = endpoint._wire(session)
    assert isinstance(orch.tts._provider, LiveVideoVoice), "голос партии — голос сервиса"
    assert isinstance(orch.tts._provider._backup, ToneTTS), "наш синтез — в запасе"
    await orch.avatar.close()


@pytest.mark.asyncio
async def test_text_mode_queued_phrases_are_not_cut_by_the_per_phrase_timeout(monkeypatch):
    """Сервис говорит фразы по очереди в реальном времени: третья ждёт первые две.

    Обычный потолок синтеза на фразу (15 с) рассчитан на синтез быстрее
    реального времени; здесь он обрезал бы хвост длинной реплики.
    """
    from app.orchestrator import tts_manager
    monkeypatch.setattr(tts_manager, "SYNTHESIS_TIMEOUT_S", 0.5)
    rec = Recorder()
    avatar = _avatar(rec, cfg=_cfg(input="text"), latency_ms=20)
    provider = avatar.voice_for(ShortTTS(marker=0.9))
    await _connected(avatar)
    manager = TTSTaskManager(provider, rec, Voice("", "ru", True))
    manager.audio_out = avatar.audio_out
    for phrase in ("первая фраза подлиннее", "вторая фраза подлиннее", "третья"):
        manager.speak(phrase, generation_id="g1", turn_id=1)
    await asyncio.wait_for(manager.wait_idle(), 10)
    assert not [e for e in rec.events("error")], rec.events("error")
    assert avatar.mode == "video" and avatar.stats.degrades == []
    await avatar.close()


@pytest.mark.asyncio
@pytest.mark.parametrize("mode", ["exam", "drill"])
async def test_reproducible_modes_never_get_live_video(monkeypatch, mode):
    from app.realtime import endpoint
    from app.realtime.events import SessionInit
    monkeypatch.setenv("NEGO_LIVE_VIDEO", "stub")
    monkeypatch.setenv("NEGO_TTS", "testtone")
    session, _ = await endpoint._build_session(SessionInit(
        scenarioId="supplier", mode="voice", gameMode=mode, layers={"voice": True, "avatar": True}))
    orch, _, _ = endpoint._wire(session)
    assert not isinstance(orch.avatar, LiveVideoAvatar)


@pytest.mark.asyncio
async def test_live_video_changes_nothing_in_the_grade(monkeypatch):
    """Инвариант 6: ни один слой не входит в `score_session` — и видео тоже."""
    async def play(live: bool) -> tuple:
        session = RealtimeSession("grade", engine.create_session("supplier", "ru"),
                                  layers=Layers(voice=True, avatar=True))
        rec = Recorder(session.bus)
        avatar = _avatar(rec, latency_ms=20) if live else AmplitudeAvatar("supplier", rec)
        tts = TTSTaskManager(ShortTTS(chunks=1), rec, Voice("", "ru", True))
        orch = NegotiationOrchestrator(session, tts=tts, avatar=avatar)
        avatar.start()
        for line in ("Добрый день. Что для вас важнее всего?",
                     "По рыночным данным медиана 87, это отраслевой стандарт.",
                     "Давайте 85 и годовой контракт?"):
            await orch.on_player_turn(line)
            await tts.wait_idle()
        await avatar.close()
        result = engine.score_session(session.engine_session)
        return result["overall"], result["grade"], session.engine_session.turn

    assert await play(True) == await play(False)
