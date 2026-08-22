"""Тесты голосового пути: обрезка тишины, порядок фраз, отмена синтеза.

Синтез здесь поддельный (`_FakeTTS`) — набор тестов офлайновый по контракту
(`conftest.py`). Проверяется не качество голоса, а механика: порядок, отмена и
то, что параллельность не переставляет фразы местами.
"""

from __future__ import annotations

import asyncio

import numpy as np
import pytest

from app.providers.tts.base import OUTPUT_SAMPLE_RATE, TTSProvider, Voice
from app.providers.tts.edge import _SilenceTrimmer
from app.orchestrator.tts_manager import TTSTaskManager


# ---------------------------------------------------------------------------
# Обрезка тишины
# ---------------------------------------------------------------------------

def _pcm(*, lead_s: float, speech_s: float, tail_s: float) -> bytes:
    lead = np.zeros(int(lead_s * OUTPUT_SAMPLE_RATE), dtype=np.float32)
    speech = (np.sin(np.linspace(0, 400, int(speech_s * OUTPUT_SAMPLE_RATE))) * 0.4).astype(np.float32)
    tail = np.zeros(int(tail_s * OUTPUT_SAMPLE_RATE), dtype=np.float32)
    return np.concatenate([lead, speech, tail]).tobytes()


def test_trimmer_removes_padding_around_a_phrase():
    """Паддинг edge-tts (0.25 с спереди, 0.9 с сзади) не должен доезжать до колонок.

    Иначе при разбиении реплики на фразы он умножается на их число, и оппонент
    делает секундную паузу между придаточными — самый заметный признак робота.
    """
    trimmer = _SilenceTrimmer()
    out = trimmer.feed(_pcm(lead_s=0.25, speech_s=1.0, tail_s=0.9))
    out += trimmer.flush()

    seconds = len(np.frombuffer(out, dtype=np.float32)) / OUTPUT_SAMPLE_RATE
    assert 0.95 < seconds < 1.2, f"осталось {seconds:.2f} с вместо ~1.08 (речь + хвостовой запас)"


def test_trimmer_keeps_internal_pauses():
    """Пауза ВНУТРИ фразы — часть интонации, её резать нельзя."""
    speech = (np.sin(np.linspace(0, 400, OUTPUT_SAMPLE_RATE // 2)) * 0.4).astype(np.float32)
    gap = np.zeros(OUTPUT_SAMPLE_RATE // 4, dtype=np.float32)
    trimmer = _SilenceTrimmer()
    out = trimmer.feed(np.concatenate([speech, gap, speech]).tobytes()) + trimmer.flush()

    seconds = len(np.frombuffer(out, dtype=np.float32)) / OUTPUT_SAMPLE_RATE
    assert seconds > 1.2, "внутренняя пауза съедена — интонация сломана"


def test_trimmer_survives_all_silence():
    trimmer = _SilenceTrimmer()
    assert trimmer.feed(np.zeros(2400, dtype=np.float32).tobytes()) == b""
    assert trimmer.flush() == b""


# ---------------------------------------------------------------------------
# Порядок и отмена
# ---------------------------------------------------------------------------

class _FakeTTS(TTSProvider):
    """Синтез с управляемой задержкой — чтобы порядок нельзя было получить случайно."""

    def __init__(self, delays: dict[str, float]):
        self.delays = delays
        self.started: list[str] = []
        self.cancelled: list[str] = []

    def available(self) -> bool:
        return True

    def describe(self) -> str:
        return "fake"

    async def stream(self, text: str, voice: Voice):
        self.started.append(text)
        try:
            await asyncio.sleep(self.delays.get(text, 0.0))
            yield text.encode("utf-8")
        except asyncio.CancelledError:
            self.cancelled.append(text)
            raise


@pytest.mark.asyncio
async def test_phrases_play_in_order_even_when_the_slow_one_is_first():
    """Порядок выдачи строгий, хотя синтез параллельный.

    Первая фраза нарочно синтезируется дольше третьей. Если бы отправка шла по
    готовности, реплика собралась бы задом наперёд — а это невозможно услышать
    как речь человека.
    """
    tts = _FakeTTS({"раз": 0.20, "два": 0.05, "три": 0.01})
    events: list[dict] = []
    manager = TTSTaskManager(tts, events.append, Voice("", "ru", True))

    for phrase in ("раз", "два", "три"):
        manager.speak(phrase, generation_id="g1", turn_id=1)
    await manager.wait_idle()

    import base64
    spoken = [base64.b64decode(e["audio"]).decode("utf-8")
              for e in events if e.get("kind") == "audio"]
    assert spoken == ["раз", "два", "три"], f"порядок нарушен: {spoken}"
    # И параллельность действительно была: все три стартовали сразу.
    assert tts.started == ["раз", "два", "три"]


@pytest.mark.asyncio
async def test_clear_cancels_pending_synthesis():
    """Перебивание: незаконченный синтез гасится, лишний звук не рождается."""
    tts = _FakeTTS({"раз": 0.5, "два": 0.5})
    events: list[dict] = []
    manager = TTSTaskManager(tts, events.append, Voice("", "ru", True))

    manager.speak("раз", generation_id="g1", turn_id=1)
    manager.speak("два", generation_id="g1", turn_id=1)
    await asyncio.sleep(0.05)
    manager.clear()
    await asyncio.sleep(0.05)

    assert not [e for e in events if e.get("kind") == "audio"], "звук просочился после отмены"
    assert set(tts.cancelled) == {"раз", "два"}


@pytest.mark.asyncio
async def test_new_generation_drops_the_previous_one():
    """Смена поколения = новая реплика: хвост прошлой не должен озвучиться."""
    tts = _FakeTTS({"старое": 0.5, "новое": 0.01})
    events: list[dict] = []
    manager = TTSTaskManager(tts, events.append, Voice("", "ru", True))

    manager.speak("старое", generation_id="g1", turn_id=1)
    await asyncio.sleep(0.02)
    manager.speak("новое", generation_id="g2", turn_id=2)
    await manager.wait_idle()

    import base64
    spoken = [base64.b64decode(e["audio"]).decode("utf-8")
              for e in events if e.get("kind") == "audio"]
    assert spoken == ["новое"]
    assert "старое" in tts.cancelled


@pytest.mark.asyncio
async def test_empty_phrase_is_ignored():
    tts = _FakeTTS({})
    events: list[dict] = []
    manager = TTSTaskManager(tts, events.append, Voice("", "ru", True))
    manager.speak("   ", generation_id="g1", turn_id=1)
    await asyncio.sleep(0.02)
    assert tts.started == []
    assert events == []
