"""Стенд видеоконтура: синтетический видеопоток для проверки, не продукт.

ЭТО НЕ ВИДЕО СОБЕСЕДНИКА. Кадр — портрет персонажа с надписью «TEST STREAM»,
таймкодом и полоской громкости. Он нужен, чтобы проверить путь, по которому
пойдёт настоящая модель: кадры привязаны к часам звука (`pts_ms` от первого
сэмпла поколения, `frames.py`), идут по той же шине, гасятся перебиванием и
не оживают после отмены. Бегущая метка по ширине кадра проходит его за
секунду звука — рассинхрон с голосом виден глазом.

Включается только явно: `NEGO_AVATAR_PROVIDER=testcard`. Интерфейс получает
`synthetic: true` и обязан подписать поток как тестовый.

Чего стенд НЕ проверяет — и настоящей модели это ещё предстоит: сетевую
задержку первого кадра, её разброс, 50-миллисекундный бюджет `speak` на
каждый чанк и политику «после первой ошибки провайдер заменяется навсегда»
(`negotiation.py::_fallback_avatar`). Кадры здесь рисуются локально за
миллисекунды, поэтому ни то, ни другое не сработает. Чем станет: ничем — это
прибор стенда; внешняя модель встаёт отдельным адаптером.
"""
from __future__ import annotations

import asyncio
import io
import os
from pathlib import Path
from typing import Callable, Optional

import numpy as np
from PIL import Image, ImageDraw

from app.avatar.base import AVATAR_STATES, AvatarCapabilities
from app.avatar.frames import avatar_frame
from app.avatar.presence import PresenceAvatar

SAMPLE_RATE = 24000
#: Шаг кадров по часам звука: 12.5 кадра в секунду — как у типичной модели.
FRAME_MS = 80.0
SIZE = 256
#: Очередь звука ограничена: провайдер, отставший на секунды, обязан терять
#: старое, а не копить — иначе лицо уедет от голоса навсегда.
QUEUE_MAX = 64

_ROOT = Path(__file__).resolve().parents[4]


def _portrait_path(persona: str) -> Optional[Path]:
    roots = [os.getenv("NEGO_FRONTEND_DIST"), _ROOT / "frontend" / "public", _ROOT / "frontend" / "dist"]
    for root in roots:
        if not root:
            continue
        path = Path(root) / "avatars" / persona / "listening.webp"
        if path.is_file():
            return path
    return None


class TestcardAvatar(PresenceAvatar):
    """Кадры по часам звука из портрета персонажа. Только для стенда."""

    __test__ = False  # имя начинается с Test — pytest не должен искать в нём тесты

    def __init__(self, persona_id: str, publish: Callable[[dict], None]) -> None:
        super().__init__(persona_id, publish)
        self._queue: asyncio.Queue = asyncio.Queue(maxsize=QUEUE_MAX)
        self._worker: Optional[asyncio.Task] = None
        self._epoch = 0
        # Часы звука считает ПОСТАНОВКА в очередь, а не отрисовка: чанк несёт
        # номер своего первого сэмпла. Иначе выброшенный при переполнении чанк
        # выпадал бы из счёта, и все следующие кадры получали бы метку раньше
        # своего звука — ровно тот рассинхрон, который стенд должен ловить.
        self._enq_generation = ""
        self._enq_samples = 0
        self._generation = ""
        self._next_pts = 0.0
        self._base = self._load_base(persona_id)
        #: Счётчики для прибора: сколько кадров ушло и сколько звука выброшено.
        self.frames_sent = 0
        self.chunks_dropped = 0

    @staticmethod
    def _load_base(persona: str) -> Image.Image:
        path = _portrait_path(persona)
        if path is not None:
            try:
                with Image.open(path) as img:
                    return img.convert("RGB").resize((SIZE, SIZE))
            except Exception:
                pass
        return Image.new("RGB", (SIZE, SIZE), (46, 62, 70))

    def capabilities(self) -> AvatarCapabilities:
        return AvatarCapabilities(
            available=True, lipsync=True, lipsync_mode="video", interruptible=True,
            transport="jpeg", states=AVATAR_STATES, synthetic=True,
        )

    def describe(self) -> str:
        return "testcard: синтетические кадры стенда по часам звука, не видео собеседника"

    # -- вход ------------------------------------------------------------------

    async def speak(self, pcm: bytes, *, generation_id: str) -> None:
        # Только постановка в очередь: бюджет вызова — 50 мс (`tts_manager.py`).
        if generation_id != self._enq_generation:
            self._enq_generation, self._enq_samples = generation_id, 0
        first = self._enq_samples
        self._enq_samples += len(pcm) // 4
        if self._queue.full():
            self._queue.get_nowait()
            self.chunks_dropped += 1
        self._queue.put_nowait((self._epoch, generation_id, pcm, first))
        if self._worker is None or self._worker.done():
            self._worker = asyncio.create_task(self._run())

    async def interrupt(self) -> None:
        self._epoch += 1
        while not self._queue.empty():
            self._queue.get_nowait()
        self._generation = ""
        self._enq_generation = ""
        await super().interrupt()

    async def close(self) -> None:
        self._epoch += 1
        if self._worker is not None and not self._worker.done():
            self._worker.cancel()
            try:
                await self._worker
            except (asyncio.CancelledError, Exception):
                pass
        self._worker = None

    # -- кадры -----------------------------------------------------------------

    async def _run(self) -> None:
        while True:
            epoch, generation, pcm, first = await self._queue.get()
            if epoch != self._epoch:
                continue
            if generation != self._generation:
                self._generation, self._next_pts = generation, 0.0
            samples = np.frombuffer(pcm[: len(pcm) - len(pcm) % 4], dtype="<f4")
            start_ms = first * 1000.0 / SAMPLE_RATE
            end_ms = (first + len(samples)) * 1000.0 / SAMPLE_RATE
            if self._next_pts < start_ms:
                # Перед этим чанком что-то выброшено: кадры за пропуск не
                # рисуем, сетку догоняем, метки остаются на часах звука.
                steps = -(-(start_ms - self._next_pts) // FRAME_MS)
                self._next_pts += steps * FRAME_MS
            while self._next_pts < end_ms:
                if epoch != self._epoch:
                    break
                lo = int((self._next_pts - start_ms) * SAMPLE_RATE / 1000)
                window = samples[max(lo, 0): max(lo, 0) + int(FRAME_MS * SAMPLE_RATE / 1000)]
                level = float(np.sqrt(np.mean(window ** 2))) if window.size else 0.0
                jpeg = self._render(self._next_pts, level)
                self._publish(avatar_frame(jpeg, generation_id=generation, pts_ms=self._next_pts))
                self.frames_sent += 1
                self._next_pts += FRAME_MS
                await asyncio.sleep(0)

    def _render(self, pts_ms: float, level: float) -> bytes:
        img = self._base.copy()
        draw = ImageDraw.Draw(img, "RGBA")
        # Бегущая метка: секунда звука = полный проход по ширине кадра.
        x = int((pts_ms % 1000.0) / 1000.0 * SIZE)
        draw.rectangle((x - 2, 0, x + 2, 10), fill=(255, 200, 0, 255))
        # Полоска громкости там, где у лица рот, — грубо, но видно.
        h = int(min(level * 4.0, 1.0) * 28)
        draw.rectangle((SIZE // 2 - 22, 176 - h // 2, SIZE // 2 + 22, 176 + h // 2), fill=(255, 75, 75, 180))
        draw.rectangle((0, SIZE - 22, SIZE, SIZE), fill=(0, 0, 0, 160))
        draw.text((6, SIZE - 18), f"TEST STREAM  pts {int(pts_ms):>6} ms", fill=(255, 255, 255, 255))
        out = io.BytesIO()
        img.save(out, "JPEG", quality=70)
        return out.getvalue()
