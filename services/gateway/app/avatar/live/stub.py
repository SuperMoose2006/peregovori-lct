"""stub.py — заглушка сервиса живого видео: весь путь без сети и без денег.

ЭТО НЕ ВИДЕО СОБЕСЕДНИКА. Кадр — портрет персонажа с надписью «STUB», меткой
времени и полоской громкости на месте рта. Бегущая метка проходит ширину кадра
за секунду звука: рассинхрон с голосом виден глазом. Клиент получает
`synthetic: true` и подписывает поток как тестовый — иначе заглушка выглядела
бы продуктом (принцип 2).

ЧЕМ ОТЛИЧАЕТСЯ ОТ `testcard`. Тот — `AvatarProvider` целиком и проверяет наш
путь кадров по шине. Эта — ДРАЙВЕР под `adapter.py`, и проверяет то, что
появится с настоящим сервисом: подключение, задержку сервиса (кадры приходят
позже звука, как у сети), буфер звука и кадров, сторожа, обрыв посреди
реплики, возврат портрета и оба входа — `audio` (рисует под наш звук) и
`text` (говорит сам синтетическим голосом `testtone`).

Отказы по заказу — для тестов и для репетиции показа перед жюри:
`NEGO_LIVE_VIDEO_STUB_FAIL_AFTER_S` рвёт связь через N секунд после
подключения, `NEGO_LIVE_VIDEO_STUB_LATENCY_MS` задаёт задержку кадров.
Чем станет: ничем — это прибор, как `testcard`; настоящий сервис встаёт
отдельным драйвером (`vendors/`).
"""

from __future__ import annotations

import asyncio
import io
import time
from typing import Optional

import numpy as np
from PIL import Image, ImageDraw

from app.avatar.live.config import LiveVideoConfig
from app.avatar.live.driver import (SAMPLE_RATE, Closed, DriverError, DriverInfo,
                                    LiveVideoDriver, Persona, VideoFrame, VoiceChunk)

#: Сетка кадров заглушки: 25 к/с, как у большинства сервисов. Адаптер
#: прореживает до `NEGO_LIVE_VIDEO_FPS` — это тоже часть проверяемого пути.
FRAME_MS = 40.0
SIZE = 256
#: Задержка кадров по умолчанию: порядок заявлений сервисов (130–300 мс на
#: генерацию), чтобы буфер звука и кадров работал и на демо заглушки.
DEFAULT_LATENCY_MS = 250
#: Кусок синтетического голоса в режиме `text`.
VOICE_CHUNK_MS = 100


class StubDriver(LiveVideoDriver):
    """Синтетический сервис. Время — настоящее: кадры идут в темпе звука."""

    def __init__(self, cfg: LiveVideoConfig, persona: Persona, *,
                 latency_ms: Optional[int] = None,
                 connect_delay_s: float = 0.05,
                 fail_connect: Optional[DriverError] = None,
                 fail_after_s: Optional[float] = None,
                 silent_after_s: Optional[float] = None,
                 now=time.monotonic) -> None:
        super().__init__()
        latency = cfg.stub_latency_ms if latency_ms is None else latency_ms
        if latency_ms is None and not cfg.stub_latency_ms:
            latency = DEFAULT_LATENCY_MS
        self.latency_s = latency / 1000.0
        self.info = DriverInfo(
            vendor="stub", input=cfg.input, synthetic=True,
            # На входе `audio` кадр отстаёт от нашего звука на задержку
            # сервиса — звук придерживается на неё плюс джиттер цикла. На
            # входе `text` голос и кадры рождаются вместе, нужен лишь джиттер.
            av_delay_ms=int(latency) + 100 if cfg.input == "audio" else 100)
        self._persona = persona
        self._connect_delay_s = connect_delay_s
        self._fail_connect = fail_connect
        self._fail_after_s = cfg.stub_fail_after_s if fail_after_s is None else fail_after_s
        self._silent_after_s = silent_after_s
        self._now = now
        self._connected_at: Optional[float] = None
        self._tasks: list[asyncio.Task] = []
        self._base: Optional[Image.Image] = None
        # режим audio
        self._gen = ""
        self._gen_start: Optional[float] = None
        self._samples: list[np.ndarray] = []
        self._fed = 0
        self._next_pts = 0.0
        self._wake = asyncio.Event()
        # режим text
        self._texts: asyncio.Queue = asyncio.Queue()
        #: Счётчики для тестов.
        self.audio_received = 0
        self.texts_received: list[str] = []
        self.interrupts = 0
        self.ended: list[str] = []
        self.closed = False

    # -- глаголы -----------------------------------------------------------------

    async def connect(self) -> None:
        await asyncio.sleep(self._connect_delay_s)
        if self._fail_connect is not None:
            raise self._fail_connect
        self._base = _portrait(self._persona)
        self._connected_at = self._now()
        loop = asyncio.get_running_loop()
        self._tasks.append(loop.create_task(self._render_loop()))
        if self.info.input == "text":
            self._tasks.append(loop.create_task(self._speak_loop()))
        if self._fail_after_s is not None:
            self._tasks.append(loop.create_task(self._fail_later(self._fail_after_s)))

    async def send_audio(self, pcm: bytes, generation_id: str) -> None:
        if self.info.input != "audio":
            raise DriverError("stub: вход text, звук не принимается", reason="unsupported")
        samples = np.frombuffer(pcm[: len(pcm) - len(pcm) % 4], dtype="<f4")
        if generation_id != self._gen:
            self._gen, self._samples, self._fed, self._next_pts = generation_id, [], 0, 0.0
            self._gen_start = self._now()
        self._samples.append(samples)
        self._fed += samples.size
        self.audio_received += samples.size
        self._wake.set()

    async def send_text(self, text: str, generation_id: str, utterance: int) -> None:
        if self.info.input != "text":
            raise DriverError("stub: вход audio, текст не принимается", reason="unsupported")
        self.texts_received.append(text)
        self._texts.put_nowait((generation_id, utterance, text))

    async def end_of_speech(self, generation_id: str) -> None:
        self.ended.append(generation_id)

    async def interrupt(self) -> None:
        self.interrupts += 1
        self._gen, self._samples, self._fed, self._next_pts = "", [], 0, 0.0
        self._gen_start = None
        while not self._texts.empty():
            self._texts.get_nowait()

    async def close(self) -> None:
        if self.closed:
            return
        self.closed = True
        for task in self._tasks:
            task.cancel()
        for task in self._tasks:
            try:
                await task
            except (asyncio.CancelledError, Exception):
                pass
        self.emit(Closed("closed"))

    # -- кадры ----------------------------------------------------------------------

    def _silent(self) -> bool:
        return (self._silent_after_s is not None and self._connected_at is not None
                and self._now() - self._connected_at >= self._silent_after_s)

    async def _render_loop(self) -> None:
        """Кадр pts рисуется, когда сервис «проиграл» свой звук до pts, плюс задержка."""
        while True:
            if not self._gen or self._gen_start is None:
                self._wake.clear()
                await self._wake.wait()
                continue
            fed_ms = self._fed * 1000.0 / SAMPLE_RATE
            if self._next_pts >= fed_ms:
                self._wake.clear()
                try:
                    await asyncio.wait_for(self._wake.wait(), timeout=0.05)
                except asyncio.TimeoutError:
                    pass
                continue
            due = self._gen_start + self.latency_s + self._next_pts / 1000.0
            delay = due - self._now()
            if delay > 0:
                await asyncio.sleep(delay)
                continue
            gen, pts = self._gen, self._next_pts
            self._next_pts += FRAME_MS
            if self._silent():
                continue
            level = self._level(pts)
            self.emit(VideoFrame(gen, pts, self._render(pts, level)))

    def _level(self, pts: float) -> float:
        if not self._samples:
            return 0.0
        audio = np.concatenate(self._samples) if len(self._samples) > 1 else self._samples[0]
        self._samples = [audio]
        lo = int(pts * SAMPLE_RATE / 1000)
        window = audio[lo: lo + int(FRAME_MS * SAMPLE_RATE / 1000)]
        return float(np.sqrt(np.mean(window ** 2))) if window.size else 0.0

    def _render(self, pts: float, level: float) -> bytes:
        img = (self._base or Image.new("RGB", (SIZE, SIZE), (46, 62, 70))).copy()
        draw = ImageDraw.Draw(img, "RGBA")
        x = int((pts % 1000.0) / 1000.0 * SIZE)
        draw.rectangle((x - 2, 0, x + 2, 10), fill=(0, 200, 255, 255))
        h = int(min(level * 4.0, 1.0) * 28)
        draw.rectangle((SIZE // 2 - 22, 176 - h // 2, SIZE // 2 + 22, 176 + h // 2), fill=(255, 75, 75, 180))
        draw.rectangle((0, SIZE - 22, SIZE, SIZE), fill=(0, 0, 0, 160))
        draw.text((6, SIZE - 18), f"STUB live video  pts {int(pts):>6} ms", fill=(255, 255, 255, 255))
        out = io.BytesIO()
        img.save(out, "JPEG", quality=70)
        return out.getvalue()

    # -- голос (режим text) ----------------------------------------------------------

    async def _speak_loop(self) -> None:
        """Фразы по очереди, голос в реальном времени, кадры под свой голос."""
        from app.providers.tts.testtone import _phrase

        while True:
            gen, utt, text = await self._texts.get()
            audio = _phrase(text, self._persona.female)
            if gen != self._gen:
                self._gen, self._samples, self._fed, self._next_pts = gen, [], 0, 0.0
                self._gen_start = self._now()
            elif self._gen_start is not None:
                # Фраза пришла после паузы: часы поколения сдвигаются вперёд,
                # чтобы голос и кадры оставались на одной шкале звука.
                behind = self._now() - (self._gen_start + self.latency_s + self._fed / SAMPLE_RATE)
                if behind > 0:
                    self._gen_start += behind
            step = int(SAMPLE_RATE * VOICE_CHUNK_MS / 1000)
            for i in range(0, max(len(audio), 1), step):
                if gen != self._gen:
                    break           # перебили
                if self._silent():
                    await asyncio.sleep(3600)
                piece = audio[i:i + step]
                last = i + step >= len(audio)
                # Сервис говорит в реальном времени: кусок — когда он звучит.
                due = self._gen_start + self.latency_s + self._fed / SAMPLE_RATE
                delay = due - self._now()
                if delay > 0:
                    await asyncio.sleep(delay)
                if gen != self._gen:
                    break
                self._samples.append(piece)
                self._fed += piece.size
                self._wake.set()
                self.emit(VoiceChunk(gen, utt, piece.astype("<f4").tobytes(), last=last))

    async def _fail_later(self, after_s: float) -> None:
        await asyncio.sleep(after_s)
        for task in self._tasks:
            if task is not asyncio.current_task():
                task.cancel()
        self.emit(Closed("stub: обрыв связи по заказу (NEGO_LIVE_VIDEO_STUB_FAIL_AFTER_S)"))


def _portrait(persona: Persona) -> Image.Image:
    from app.avatar.testcard import TestcardAvatar, _portrait_path

    if persona.portrait is not None and persona.portrait.is_file():
        try:
            with Image.open(persona.portrait) as img:
                return img.convert("RGB").resize((SIZE, SIZE))
        except Exception:
            pass
    if _portrait_path(persona.scenario_id) is not None:
        return TestcardAvatar._load_base(persona.scenario_id)
    return Image.new("RGB", (SIZE, SIZE), (46, 62, 70))
