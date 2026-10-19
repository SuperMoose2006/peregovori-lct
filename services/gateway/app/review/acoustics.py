"""acoustics.py — голос без модели: паузы, высота, громкость. Только numpy.

ЗАЧЕМ СВОЙ СЧЁТ, ЕСЛИ ЕСТЬ АГЕНТ ГОЛОСА. Агент (Gemini слушает запись) хорош
там, где нужен слух: «э-э», запинка, дрожь. Но время у модели приблизительное, а
число она может и придумать. Паузу, высоту и громкость можно ИЗМЕРИТЬ — и
измерение воспроизводимо, бесплатно и работает без сети. Сводка (`merge.py`)
ставит одно рядом с другим: совпало — уверенность выше.

ЧТО МЕРИТСЯ, по кадрам 20 мс:
  - громкость (дБ к полной шкале) → где речь, где тишина;
  - паузы ВНУТРИ реплики — тишина от `PAUSE_MIN_MS` между двумя кусками речи;
  - высота голоса (основной тон) автокорреляцией по окнам 40 мс;
  - скачки высоты — сглаженный тон выше медианы реплики на `JUMP_ST` полутонов;
  - затухание — конец реплики заметно тише начала.

ЧЕГО ЗДЕСЬ НЕТ И НЕ БУДЕТ: выводов. «Скачок высоты» — это скачок высоты, а не
«волнение». Подписи вида «неуверенность» рождаются только в сводке и только как
совпадение НЕСКОЛЬКИХ признаков, с примерами и уверенностью.
"""

from __future__ import annotations

from typing import Optional

import numpy as np

SAMPLE_RATE = 16_000
FRAME_MS = 20

#: Пауза внутри реплики — от стольких миллисекунд тишины. Меньше — это
#: стыки слов и вдохи, а не «задумался».
PAUSE_MIN_MS = 400

#: Насколько выше шумового пола должна быть речь, дБ.
SPEECH_OVER_FLOOR_DB = 10.0

#: Абсолютный пол речи, дБ к полной шкале: тише — точно не голос.
SPEECH_MIN_DB = -50.0

#: И потолок порога. Кусок без тишины вовсе (человек говорил без передышки)
#: поднял бы «шумовой пол» до уровня самой речи, и половина слов ушла бы в
#: паузы; речь браузера после шумоподавления громче −35 дБ всегда.
SPEECH_MAX_THRESHOLD_DB = -35.0

#: Скачок высоты — на столько полутонов выше медианы реплики. Четыре полутона —
#: большая терция: интонацию вопроса это не ловит (она в пределах двух-трёх), а
#: «голос подскочил» — ловит.
JUMP_ST = 4.0

#: Окно тона и пределы основного тона человеческого голоса, Гц.
_PITCH_WIN = 640
_F0_MIN, _F0_MAX = 70.0, 400.0
#: Порог «окно звонкое»: доля автокорреляции на найденном периоде.
_VOICED = 0.35


def _frames(x: np.ndarray, size: int, hop: int) -> np.ndarray:
    if x.size < size:
        return np.zeros((0, size), dtype=x.dtype)
    n = 1 + (x.size - size) // hop
    idx = np.arange(size)[None, :] + hop * np.arange(n)[:, None]
    return x[idx]


def _loudness(x: np.ndarray) -> np.ndarray:
    hop = SAMPLE_RATE * FRAME_MS // 1000
    fr = _frames(x, hop, hop)
    rms = np.sqrt(np.mean(fr * fr, axis=1)) if fr.size else np.zeros(0)
    return 20.0 * np.log10(rms + 1e-9)


def _pitch(x: np.ndarray) -> np.ndarray:
    """Основной тон по окнам 40 мс с шагом 20 мс; NaN — окно глухое."""
    hop = SAMPLE_RATE * FRAME_MS // 1000
    fr = _frames(x, _PITCH_WIN, hop)
    if not fr.size:
        return np.zeros(0)
    fr = fr - fr.mean(axis=1, keepdims=True)
    spec = np.fft.rfft(fr * np.hanning(_PITCH_WIN), n=2 * _PITCH_WIN, axis=1)
    ac = np.fft.irfft(np.abs(spec) ** 2, axis=1)[:, :_PITCH_WIN]
    lo, hi = int(SAMPLE_RATE / _F0_MAX), int(SAMPLE_RATE / _F0_MIN)
    seg = ac[:, lo:hi]
    lag = np.argmax(seg, axis=1) + lo
    peak = seg[np.arange(seg.shape[0]), lag - lo]
    energy = ac[:, 0] + 1e-12
    f0 = SAMPLE_RATE / lag.astype(float)
    f0[(peak / energy) < _VOICED] = np.nan
    return f0


def _runs(mask: np.ndarray) -> list[tuple[int, int]]:
    """Отрезки подряд идущих True: [(начало, длина)] в кадрах."""
    out: list[tuple[int, int]] = []
    start = None
    for i, v in enumerate(mask):
        if v and start is None:
            start = i
        elif not v and start is not None:
            out.append((start, i - start))
            start = None
    if start is not None:
        out.append((start, len(mask) - start))
    return out


def analyze(pcm: np.ndarray) -> dict:
    """Один кусок речи (PCM16 16 кГц) → измеренные признаки. Времена — от начала куска."""
    x = np.asarray(pcm, dtype=np.float32) / 32768.0
    db = _loudness(x)
    out: dict = {"dur_ms": int(x.size * 1000 // SAMPLE_RATE), "voiced_ms": 0, "pauses": [],
                 "f0_hz": None, "f0_range_st": None, "loudness_db": None,
                 "pitch_jumps": [], "fading": False}
    if not db.size:
        return out
    floor = float(np.percentile(db, 10))
    threshold = min(max(floor + SPEECH_OVER_FLOOR_DB, SPEECH_MIN_DB), SPEECH_MAX_THRESHOLD_DB)
    speech = db > threshold
    if not speech.any():
        return out
    out["voiced_ms"] = int(speech.sum()) * FRAME_MS
    out["loudness_db"] = round(float(np.median(db[speech])), 1)

    first, last = int(np.argmax(speech)), len(speech) - 1 - int(np.argmax(speech[::-1]))
    inner = ~speech[first:last + 1]
    for start, length in _runs(inner):
        if length * FRAME_MS >= PAUSE_MIN_MS:
            out["pauses"].append({"at_ms": (first + start) * FRAME_MS,
                                  "dur_ms": length * FRAME_MS})

    voiced_idx = np.flatnonzero(speech)
    if voiced_idx.size >= 8:
        head = db[voiced_idx[: voiced_idx.size // 2]]
        tail = db[voiced_idx[-max(1, voiced_idx.size // 4):]]
        out["fading"] = bool(np.median(head) - np.median(tail) >= 6.0)

    f0 = _pitch(x)
    n = min(f0.size, speech.size)
    f0 = np.where(speech[:n], f0[:n], np.nan)
    good = f0[~np.isnan(f0)]
    if good.size >= 5:
        median = float(np.median(good))
        out["f0_hz"] = round(median, 1)
        st = 12.0 * np.log2(good / median)
        out["f0_range_st"] = round(float(np.percentile(st, 90) - np.percentile(st, 10)), 1)
        # Сглаживание медианой по пяти окнам (100 мс): одиночный октавный
        # промах автокорреляции — не скачок голоса.
        track = 12.0 * np.log2(f0 / median)
        smooth = np.full_like(track, np.nan)
        for i in range(track.size):
            win = track[max(0, i - 2): i + 3]
            win = win[~np.isnan(win)]
            if win.size >= 3:
                smooth[i] = float(np.median(win))
        high = np.nan_to_num(smooth, nan=-99.0) >= JUMP_ST
        last_at: Optional[int] = None
        for start, length in _runs(high):
            if length < 3:
                continue
            at = start * FRAME_MS
            if last_at is not None and at - last_at < 1000:
                continue
            peak = float(np.nanmax(smooth[start:start + length]))
            out["pitch_jumps"].append({"at_ms": at, "st": round(peak, 1)})
            last_at = at
    return out
