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


# ---------------------------------------------------------------- хромакей

#: Порог «это фон» по превышению зелёного над красным и синим (0…255): ниже
#: `KEY_LO` — точно человек, выше `KEY_HI` — точно зелёный экран, между —
#: полупрозрачный край (волосы, плечи), который смешивается с новым фоном.
KEY_LO = 40.0
KEY_HI = 110.0
#: Доля зелёных пикселей в боковых полосах кадра, начиная с которой кадр
#: считается снятым на хромакее. У лиц с обстановкой — ноль.
GREEN_SCREEN_SHARE = 0.35
#: Зелёный отсвет гасится только в полосе у вырезанного фона — доля стороны
#: кадра (6 px на 480). Отсвет ложится на край волос и плеч; дальше зелёный —
#: это сам человек (галстук, блузка, глаза), и серым его делать нельзя. Замер
#: на кадрах Katya: 99.7 % погашенных пикселей человека лежат в этой полосе.
DESPILL_REACH = 6 / 480


def stage_background(size: int) -> np.ndarray:
    """Фон «сцена»: тот же сланцевый градиент, что у сцены встречи в
    интерфейсе (`.mt-stage` в styles.css: #3b4b53 → #1b262b), чуть светлее за
    головой, чтобы тёмные волосы не терялись."""
    y, x = np.mgrid[0:size, 0:size].astype(np.float32) / max(size - 1, 1)
    top, bottom = np.array([0x3b, 0x4b, 0x53], np.float32), np.array([0x22, 0x2e, 0x34], np.float32)
    base = top[None, None, :] * (1 - y[..., None]) + bottom[None, None, :] * y[..., None]
    glow = np.exp(-(((x - 0.5) / 0.45) ** 2 + ((y - 0.3) / 0.5) ** 2))[..., None]
    return np.clip(base + glow * 14.0, 0, 255).astype(np.float32)


def parse_background(spec: str, size: int) -> Optional[np.ndarray]:
    """`stage` · `#rrggbb` · путь к картинке · `off` (не вырезать). None — выключено."""
    spec = (spec or "stage").strip()
    if spec.lower() in ("off", "none", "0", "no"):
        return None
    if spec.lower() == "stage":
        return stage_background(size)
    if spec.startswith("#") and len(spec) == 7:
        rgb = [int(spec[i:i + 2], 16) for i in (1, 3, 5)]
        return np.tile(np.array(rgb, np.float32), (size, size, 1))
    from PIL import Image
    with Image.open(spec) as img:
        img = img.convert("RGB")
        w, h = img.size
        side = min(w, h)
        img = img.crop(((w - side) // 2, (h - side) // 2, (w - side) // 2 + side, (h - side) // 2 + side))
        return np.asarray(img.resize((size, size)), dtype=np.float32)


def is_green_screen(rgb: np.ndarray) -> bool:
    """Снят ли кадр на хромакее: смотрим боковые полосы, где у лица фон."""
    h, w = rgb.shape[:2]
    strip = max(4, w // 12)
    sides = np.concatenate([rgb[:, :strip].reshape(-1, 3), rgb[:, -strip:].reshape(-1, 3)]).astype(np.int32)
    excess = sides[:, 1] - np.maximum(sides[:, 0], sides[:, 2])
    return float(np.mean(excess > KEY_HI)) >= GREEN_SCREEN_SHARE


def _grow(mask: np.ndarray, k: int) -> np.ndarray:
    """Расширить маску на `k` px во все стороны (квадратом) — без SciPy."""
    out = mask.copy()
    for s in range(1, k + 1):
        out[s:] |= mask[:-s]
        out[:-s] |= mask[s:]
    rows = out.copy()
    for s in range(1, k + 1):
        out[:, s:] |= rows[:, :-s]
        out[:, :-s] |= rows[:, s:]
    return out


def chroma_key(rgb: np.ndarray, background: np.ndarray) -> np.ndarray:
    """Заменить зелёный экран фоном. Кадр и фон — одной стороны (квадрат).

    Три шага: вес фона по превышению зелёного (плавный край, а не ступенька),
    подавление зелёного отсвета у края (волосы и плечи на зелёном ловят
    зелёную кайму; зелёное дальше от края — сам человек), смешивание с фоном. Вес чуть сглажен 3×3: края
    после H.264 и JPEG «ступенчатые», и без сглаживания они мерцают.
    """
    img = rgb.astype(np.float32)
    r, g, b = img[..., 0], img[..., 1], img[..., 2]
    excess = g - np.maximum(r, b)
    alpha = np.clip((excess - KEY_LO) / (KEY_HI - KEY_LO), 0.0, 1.0)
    pad = np.pad(alpha, 1, mode="edge")
    alpha = sum(pad[dy:dy + alpha.shape[0], dx:dx + alpha.shape[1]] for dy in range(3) for dx in range(3)) / 9.0
    # Отсвет: зелёный не выше большего из красного и синего — у края фона.
    near = _grow(alpha > 0.0, max(2, round(DESPILL_REACH * img.shape[0])))
    img[..., 1] = np.where(near, np.minimum(g, np.maximum(r, b) + 4.0), g)
    if background.shape[:2] != img.shape[:2]:
        from PIL import Image
        background = np.asarray(Image.fromarray(background.astype(np.uint8)).resize(
            (img.shape[1], img.shape[0])), dtype=np.float32)
    out = img * (1.0 - alpha[..., None]) + background * alpha[..., None]
    return np.clip(out, 0, 255).astype(np.uint8)


class FramePainter:
    """Кадр сервиса → JPEG провода: при зелёном экране — с заменой фона.

    Решение «зелёный ли это экран» принимается по каждому кадру (дёшево —
    боковые полосы), поэтому лица с обстановкой проходят нетронутыми, а
    смена лица посреди партии не требует настройки.
    """

    def __init__(self, background: str = "stage", size: int = 320, quality: int = 80) -> None:
        self.size = size
        self.quality = quality
        self._spec = background
        self._background: Optional[np.ndarray] = None
        self._background_side = 0
        self.keyed = 0

    def _bg(self, side: int) -> Optional[np.ndarray]:
        if self._background is None or self._background_side != side:
            self._background = parse_background(self._spec, side)
            self._background_side = side
        return self._background

    def __call__(self, rgb: np.ndarray) -> Optional[bytes]:
        h, w = rgb.shape[:2]
        side = min(h, w)
        if w != h:
            left, top = (w - side) // 2, (h - side) // 2
            rgb = rgb[top:top + side, left:left + side]
        if self._spec.lower() not in ("off", "none", "0", "no") and is_green_screen(rgb):
            background = self._bg(side)
            if background is not None:
                rgb = chroma_key(rgb, background)
                self.keyed += 1
        return encode_jpeg(np.ascontiguousarray(rgb), size=self.size, quality=self.quality)
