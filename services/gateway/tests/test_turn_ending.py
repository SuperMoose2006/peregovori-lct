"""test_turn_ending.py — игрок договорил: ход уходит вовремя, экран сразу
знает, что собеседник думает.

Жалоба владельца 19.10: после реплики секунды тишины — распознавание, судья,
мысль, синтез, — и кажется, что всё зависло. Сначала эти секунды заполнял звук
(«угу…», «секунду…»); 20.10 владелец его снял: думает — значит видно, а не
слышно. Набор держит сигнал конца реплики и окно тишины вокруг него.
"""

from __future__ import annotations

import asyncio
import time

from app.orchestrator.tts_manager import TTSTaskManager
from app.providers.tts.base import Voice


def test_the_turn_ending_signal_fires_once_the_quiet_window_passes(monkeypatch):
    from app.perception import realtime_voice as rv
    monkeypatch.setattr(rv, "_QUIET_MS", 10)
    monkeypatch.setattr(rv, "_QUIET_LONG_MS", 20)
    monkeypatch.setattr(rv, "_ASR_GRACE_MS", 10)
    published: list[dict] = []
    turns: list[str] = []

    async def on_turn(text):
        turns.append(text)

    async def on_interrupt():
        pass

    async def go():
        p = rv.RealtimeVoicePipeline("ru", on_turn, on_interrupt, published.append)
        p._loop = asyncio.get_running_loop()
        p._parts = ["Давайте девяносто"]
        await p._quiet_timer()
        await asyncio.sleep(0.05)
    asyncio.run(go())
    assert {"type": "user.turn.ending"} in published
    assert turns == ["Давайте девяносто"]
    assert not [e for e in published if e.get("kind") == "audio"], \
        "конец реплики не озвучивается — только сигнал экрану (владелец 20.10)"


def test_an_unfinished_thought_waits_longer_and_a_new_phrase_keeps_the_turn(monkeypatch):
    """Владелец 19.10: на паузе посреди мысли («Смотрите, я…») ход уходил
    обрывком — собеседник отвечал невпопад, субтитры гасли."""
    from app.perception import realtime_voice as rv
    assert rv.looks_finished("Давайте девяносто.")
    assert rv.looks_finished("Добрый день!")
    assert not rv.looks_finished("Смотрите, я...")
    assert not rv.looks_finished("Цена высокая,")
    assert not rv.looks_finished("Мы готовы, если")
    monkeypatch.setattr(rv, "_QUIET_MS", 10)
    monkeypatch.setattr(rv, "_QUIET_LONG_MS", 200)
    monkeypatch.setattr(rv, "_ASR_GRACE_MS", 10)
    turns: list[str] = []

    async def on_turn(text):
        turns.append(text)

    async def on_interrupt():
        pass

    async def go():
        p = rv.RealtimeVoicePipeline("ru", on_turn, on_interrupt, lambda e: None)
        p._loop = asyncio.get_running_loop()
        p._parts = ["Смотрите, я думаю, что"]
        timer = asyncio.ensure_future(p._quiet_timer())
        await asyncio.sleep(0.05)
        assert not turns, "обрывок мысли ушёл ходом через короткое окно"
        p._speaking = True          # заговорил дальше — ход продолжается
        await timer
        assert not turns
    asyncio.run(go())


def test_a_transcript_does_not_restart_the_quiet_window(monkeypatch):
    """Замер 19.10: расшифровка заново заводила окно тишины, и ход уходил через
    900 мс после неё, а не после конца речи."""
    from app.perception import realtime_voice as rv
    published: list[dict] = []

    async def on_turn(text):
        pass

    async def on_interrupt():
        pass

    async def go():
        p = rv.RealtimeVoicePipeline("ru", on_turn, on_interrupt, published.append)
        p._loop = asyncio.get_running_loop()
        await p._on_event({"type": "input_audio_buffer.speech_stopped", "item_id": "a"})
        first = p._quiet
        await p._on_event({"type": "conversation.item.input_audio_transcription.completed",
                           "item_id": "a", "transcript": "Давайте девяносто."})
        assert p._quiet is first, "окно тишины перезапущено расшифровкой"
        first.cancel()
    asyncio.run(go())


def test_a_slow_synthesis_is_hedged_by_a_second_request(monkeypatch):
    """Замер 19.10: каждый четвёртый синтез отвечал через 3,3 с вместо 0,5.
    Молчит дольше секунды — тот же текст идёт вторым запросом, звучит первый."""
    from app.orchestrator import tts_manager as module
    monkeypatch.setattr(module, "HEDGE_AFTER_S", 0.05)

    class Slow:
        def __init__(self):
            self.calls = 0

        def available(self):
            return True

        async def stream(self, text, voice, **kw):
            self.calls += 1
            if self.calls == 1:
                await asyncio.sleep(1.0)
                yield b"slow"
            else:
                yield b"fast"

    async def go():
        events: list[dict] = []
        provider = Slow()
        tts = TTSTaskManager(provider, events.append, Voice(id="", lang="ru", female=True))
        t0 = time.monotonic()
        tts.speak("Шестьсот десять?", generation_id="g", turn_id=1)
        await tts.wait_idle()
        took = time.monotonic() - t0
        audio = [e["audio"] for e in events if e.get("kind") == "audio"]
        import base64
        assert [base64.b64decode(a) for a in audio] == [b"fast"], "звучит ответивший первым, один раз"
        assert took < 0.5 and provider.calls == 2
    asyncio.run(go())
