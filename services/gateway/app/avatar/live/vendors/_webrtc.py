"""_webrtc.py — общее у сервисов, которые отдают лицо потоком WebRTC на сервер.

Anam и Simli устроены одинаково: SDK на нашем сервере открывает сессию,
принимает наш PCM, отдаёт итераторы видео- и аудиокадров PyAV (видео лица и
наш же звук, синхронный с видео). Разное у них — только открытие сессии,
формат входного звука и имена команд. Общее живёт здесь:

* прореживание кадров ДО кодирования — JPEG дороже всего остального;
* кадр → квадратный JPEG нужного размера в потоке, не в цикле событий;
* время кадра на шкале нашего звука (`_anchor.py`);
* конец итератора или исключение в нём — событие `Closed`, а не тишина.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
import time
from typing import AsyncIterator, Optional

import numpy as np

from app.avatar.live.clock import frame_slot
from app.avatar.live.config import LiveVideoConfig
from app.avatar.live.driver import Closed, DriverError, IdleFrame, LiveVideoDriver, Persona, VideoFrame
from app.avatar.live.media import FramePainter
from app.avatar.live.vendors._anchor import SpeechAnchor

_log = logging.getLogger("dialog.live_video")


def audio_frame_to_mono(frame) -> tuple[np.ndarray, int]:
    """PyAV AudioFrame (s16/flt, packed или planar) → моно float −1…1 и частота."""
    arr = frame.to_ndarray()
    channels = frame.layout.nb_channels if hasattr(frame.layout, "nb_channels") else len(frame.layout.channels)
    fmt = frame.format.name
    if arr.ndim == 2 and arr.shape[0] == channels and channels > 1 and fmt.endswith("p"):
        mono = arr.astype(np.float64).mean(axis=0)
    else:
        flat = arr.reshape(-1)
        mono = flat.reshape(-1, channels).astype(np.float64).mean(axis=1) if channels > 1 else flat.astype(np.float64)
    if fmt.startswith("s16"):
        mono = mono / 32768.0
    elif fmt.startswith("s32"):
        mono = mono / 2147483648.0
    return mono.astype(np.float32), int(frame.sample_rate)


class WebRtcDriver(LiveVideoDriver):
    """Основа драйвера сервиса с серверным WebRTC. Подклассу — четыре действия."""

    vendor = "webrtc"

    def __init__(self, cfg: LiveVideoConfig, persona: Persona, *, now=time.monotonic) -> None:
        super().__init__()
        self._cfg = cfg
        self._persona = persona
        self._now = now
        self._anchor = SpeechAnchor()
        self._tasks: list[asyncio.Task] = []
        self._closing = False
        self._last_pts: Optional[float] = None
        self._fps = cfg.fps
        self._generation = ""
        #: Кадр → JPEG, с заменой зелёного экрана, если лицо снято на нём.
        self._paint = FramePainter(cfg.background, size=cfg.size)
        self._idle_gap_s = 1.0 / cfg.idle_fps if cfg.idle_fps > 0 else None
        self._last_idle: Optional[float] = None

    # -- что делает подкласс ------------------------------------------------------

    async def _open(self) -> tuple[AsyncIterator, AsyncIterator]:
        """Открыть сессию сервиса; вернуть итераторы видео и аудио."""
        raise NotImplementedError

    async def _push(self, pcm_f32: bytes) -> None:
        raise NotImplementedError

    async def _end(self) -> None:
        return None

    async def _stop_speaking(self) -> None:
        raise NotImplementedError

    async def _shutdown(self) -> None:
        raise NotImplementedError

    # Кадры SDK: по умолчанию PyAV (Anam, Simli); у LiveKit свои типы.
    def _video_time(self, frame) -> Optional[float]:
        return getattr(frame, "time", None)

    def _video_rgb(self, frame) -> np.ndarray:
        return frame.to_ndarray(format="rgb24")

    def _audio_mono(self, frame) -> tuple[np.ndarray, int]:
        return audio_frame_to_mono(frame)

    # -- глаголы драйвера ----------------------------------------------------------

    async def connect(self) -> None:
        video, audio = await self._open()
        loop = asyncio.get_running_loop()
        self._tasks.append(loop.create_task(self._video_loop(video)))
        self._tasks.append(loop.create_task(self._audio_loop(audio)))

    async def send_audio(self, pcm: bytes, generation_id: str) -> None:
        if generation_id != self._generation:
            self._generation = generation_id
            self._last_pts = None
        self._anchor.sent(generation_id, pcm)
        await self._push(pcm)

    async def end_of_speech(self, generation_id: str) -> None:
        if generation_id == self._generation:
            await self._end()

    async def interrupt(self) -> None:
        self._anchor.reset("")
        self._generation = ""
        await self._stop_speaking()

    async def close(self) -> None:
        if self._closing:
            return
        self._closing = True
        for task in self._tasks:
            task.cancel()
        for task in self._tasks:
            with contextlib.suppress(asyncio.CancelledError, Exception):
                await task
        with contextlib.suppress(Exception):
            await asyncio.wait_for(self._shutdown(), timeout=0.8)
        self.emit(Closed("closed"))

    # -- приём -----------------------------------------------------------------------

    async def _video_loop(self, frames: AsyncIterator) -> None:
        reason = "video_stream_ended"
        try:
            async for frame in frames:
                arrival = self._now()
                pts = self._anchor.video_pts(arrival, self._video_time(frame))
                if pts is None or not self._anchor.generation:
                    # Не наша речь — лицо слушает. Реже, чем речь: это фон
                    # между репликами, а не губы под звук.
                    if self._idle_gap_s is not None and (
                            self._last_idle is None or arrival - self._last_idle >= self._idle_gap_s * 0.999):
                        self._last_idle = arrival
                        jpeg = await asyncio.to_thread(self._paint, self._video_rgb(frame))
                        if jpeg is not None:
                            self.emit(IdleFrame(jpeg))
                    continue
                if self._last_pts is not None and frame_slot(pts, self._fps) <= frame_slot(self._last_pts, self._fps):
                    continue
                self._last_pts = pts
                gen = self._anchor.generation
                rgb = self._video_rgb(frame)
                jpeg = await asyncio.to_thread(self._paint, rgb)
                if jpeg is not None and gen == self._anchor.generation:
                    self.emit(VideoFrame(gen, pts, jpeg))
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            reason = f"video_error: {type(exc).__name__}"
        if not self._closing:
            self.emit(Closed(reason))

    async def _audio_loop(self, frames: AsyncIterator) -> None:
        try:
            async for frame in frames:
                arrival = self._now()
                mono, rate = self._audio_mono(frame)
                self._anchor.returned_audio(mono, rate, arrival)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            _log.warning("живое видео: %s — звук сервиса оборвался: %r", self.vendor, exc)


def http_verdict(vendor: str, status: int, body: str = "") -> Optional[DriverError]:
    """Ответ бесплатного запроса проверки ключа → отказ словами или None."""
    if status in (401, 403):
        return DriverError(f"{vendor}: ключ не принят ({status})", reason="auth", fatal=True)
    if status == 402:
        return DriverError(f"{vendor}: нет активного тарифа или кончились минуты (402)",
                           reason="quota", fatal=True)
    if status >= 400:
        return DriverError(f"{vendor}: проверка ключа ответила {status} {body[:120]}", reason="http")
    return None
