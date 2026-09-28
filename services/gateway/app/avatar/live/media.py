"""media.py — перевод звука и кадров между форматом продукта и форматом сервиса.

Продукт внутри говорит float32 LE 24 кГц моно (`providers/tts/base.py`) и JPEG
до 128 000 байт (`avatar/frames.py`). Сервисы хотят int16 16 или 24 кГц, отдают
RGB-кадры 16:9 и стерео 48 кГц. Перевод — здесь, один раз, чтобы драйвер
сервиса состоял из протокола, а не из арифметики сэмплов.
"""

from __future__ import annotations

import io
from typing import Optional

import numpy as np

#: Потолок кадра на проводе — тот же, что проверяет `avatar_frame`.
MAX_JPEG_BYTES = 128000


def _resample(samples: np.ndarray, src_rate: int, dst_rate: int) -> np.ndarray:
    if src_rate == dst_rate or samples.size == 0:
        return samples
    n = max(1, int(round(samples.size * dst_rate / src_rate)))
    x_old = np.arange(samples.size, dtype=np.float64)
    x_new = np.linspace(0, samples.size - 1, n)
    return np.interp(x_new, x_old, samples).astype(np.float32)


def f32_to_s16(pcm: bytes, *, src_rate: int = 24000, dst_rate: int = 24000) -> bytes:
    """Наш PCM → int16 LE моно на частоте сервиса."""
    samples = np.frombuffer(pcm[: len(pcm) - len(pcm) % 4], dtype="<f4")
    samples = _resample(samples, src_rate, dst_rate)
    return (np.clip(samples, -1.0, 1.0) * 32767.0).astype("<i2").tobytes()


def s16_to_f32(pcm: bytes, *, src_rate: int, channels: int = 1, dst_rate: int = 24000) -> bytes:
    """Звук сервиса (int16, любые частота и каналы) → наш формат."""
    samples = np.frombuffer(pcm[: len(pcm) - len(pcm) % (2 * channels)], dtype="<i2").astype(np.float32)
    if channels > 1:
        samples = samples.reshape(-1, channels).mean(axis=1)
    samples = _resample(samples / 32768.0, src_rate, dst_rate)
    return samples.astype("<f4").tobytes()


def rms(pcm_f32: bytes) -> float:
    samples = np.frombuffer(pcm_f32[: len(pcm_f32) - len(pcm_f32) % 4], dtype="<f4")
    return float(np.sqrt(np.mean(samples ** 2))) if samples.size else 0.0


def encode_jpeg(image, *, size: int, quality: int = 80) -> Optional[bytes]:
    """RGB-кадр сервиса → квадратный JPEG ≤128 000 байт. None — не уложился.

    Квадрат вырезается из центра: сервисы отдают 16:9 с лицом посередине, а
    место под лицо в интерфейсе квадратное — растянутое лицо хуже обрезанных
    плеч. Качество снижается ступенями, пока кадр не влезет в потолок провода.
    """
    from PIL import Image

    if isinstance(image, np.ndarray):
        image = Image.fromarray(image.astype(np.uint8), "RGB")
    elif image.mode != "RGB":
        image = image.convert("RGB")
    w, h = image.size
    side = min(w, h)
    if w != h:
        left, top = (w - side) // 2, (h - side) // 2
        image = image.crop((left, top, left + side, top + side))
    if side != size:
        image = image.resize((size, size))
    for q in (quality, 70, 60, 50, 40):
        out = io.BytesIO()
        image.save(out, "JPEG", quality=q)
        data = out.getvalue()
        if len(data) <= MAX_JPEG_BYTES:
            return data
    return None
