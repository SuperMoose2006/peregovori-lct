"""test_review_acoustics.py — голос, измеренный без модели.

Сигналы синтетические: синус с заданной высотой, тишина заданной длины. Прибор
обязан найти то, что в сигнал положено, и не найти того, чего там нет, — иначе
«пауза 1,2 с» в разборе была бы такой же выдумкой, как цитата, которой не было.
"""

from __future__ import annotations

import numpy as np

from app.review.acoustics import JUMP_ST, PAUSE_MIN_MS, SAMPLE_RATE, analyze


def _tone(hz: float, ms: int, amp: float = 0.3) -> np.ndarray:
    t = np.arange(SAMPLE_RATE * ms // 1000) / SAMPLE_RATE
    # Два обертона — у голоса они есть, и автокорреляция на чистом синусе
    # слишком лёгкая задача.
    wave = np.sin(2 * np.pi * hz * t) + 0.5 * np.sin(4 * np.pi * hz * t) + 0.25 * np.sin(6 * np.pi * hz * t)
    return wave * amp / 1.75


def _silence(ms: int) -> np.ndarray:
    rng = np.random.default_rng(0)
    return rng.normal(0, 0.001, SAMPLE_RATE * ms // 1000)


def _pcm(*parts: np.ndarray) -> np.ndarray:
    return (np.concatenate(parts) * 32767).astype(np.int16)


def test_a_pause_inside_the_line_is_found_where_it_is():
    out = analyze(_pcm(_silence(300), _tone(140, 1000), _silence(900), _tone(140, 800), _silence(300)))
    assert len(out["pauses"]) == 1
    pause = out["pauses"][0]
    assert abs(pause["at_ms"] - 1300) <= 60 and abs(pause["dur_ms"] - 900) <= 60
    assert abs(out["voiced_ms"] - 1800) <= 80
    assert abs(out["speech_from_ms"] - 300) <= 40 and abs(out["speech_to_ms"] - 3000) <= 40


def test_short_gaps_and_edge_silence_are_not_pauses():
    out = analyze(_pcm(_silence(800), _tone(140, 600), _silence(PAUSE_MIN_MS - 120),
                       _tone(140, 600), _silence(800)))
    assert out["pauses"] == [], "стык слов и тишина по краям — не «задумался»"


def test_pitch_is_measured():
    out = analyze(_pcm(_silence(200), _tone(150, 1500), _silence(200)))
    assert out["f0_hz"] is not None and abs(out["f0_hz"] - 150) <= 8
    assert out["pitch_jumps"] == []
    assert out["f0_range_st"] is not None and out["f0_range_st"] < 1.5


def test_a_pitch_jump_is_found_and_a_steady_voice_has_none():
    out = analyze(_pcm(_silence(200), _tone(140, 1600), _tone(250, 500), _tone(140, 600), _silence(200)))
    assert out["pitch_jumps"], "голос подскочил почти на октаву — прибор обязан это видеть"
    jump = out["pitch_jumps"][0]
    assert 1700 <= jump["at_ms"] <= 1900 and jump["st"] >= JUMP_ST


def test_a_fading_voice_is_marked():
    fading = analyze(_pcm(_silence(300), _tone(140, 1200, 0.4), _tone(140, 600, 0.06), _silence(300)))
    steady = analyze(_pcm(_silence(300), _tone(140, 1800, 0.3), _silence(300)))
    assert fading["fading"] is True and steady["fading"] is False


def test_a_line_without_a_breath_is_still_speech():
    """Кусок без тишины поднял бы «шумовой пол» до речи — порог ограничен сверху."""
    out = analyze(_pcm(_tone(140, 1500, 0.2)))
    assert out["voiced_ms"] >= 1400 and out["pauses"] == []


def test_silence_says_nothing():
    out = analyze(_pcm(_silence(1500)))
    assert out["voiced_ms"] == 0 and out["f0_hz"] is None and out["pauses"] == []
    assert analyze(np.zeros(0, dtype=np.int16))["dur_ms"] == 0


def test_a_long_clip_is_measured_in_bounded_memory():
    """Ревью 19.10: окна тона считались одной матрицей — около 60 МБ временной
    памяти на тридцатисекундный кусок, мимо общего потолка записей. Гейтвей
    живёт в юните с MemoryMax=2G рядом с чужими партиями."""
    import tracemalloc
    pcm = _pcm(_silence(200), _tone(140, 29_600), _silence(200))
    tracemalloc.start()
    try:
        analyze(pcm)
        _, peak = tracemalloc.get_traced_memory()
    finally:
        tracemalloc.stop()
    assert peak < 16 * 1024 * 1024, f"пик {peak / 1e6:.0f} МБ на один кусок речи"
