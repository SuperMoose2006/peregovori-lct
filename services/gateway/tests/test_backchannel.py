"""test_backchannel.py — собеседник отзывается сразу, как человек договорил.

Жалоба владельца 19.10: после реплики секунды тишины — распознавание, судья,
мысль, синтез, — и кажется, что всё зависло. Живой человек на созвоне в эту
секунду говорит «угу…». Набор держит границы этой реакции: заранее готовый
звук, одна на ход, не поверх собственной речи и не в журнал разговора.
"""

from __future__ import annotations

import asyncio
import time

from app import engine
from app.orchestrator.negotiation import NegotiationOrchestrator, backchannel_phrases
from app.orchestrator.tts_manager import TTSTaskManager
from app.providers.tts.base import Voice
from app.realtime.session import RealtimeSession


class _Provider:
    def __init__(self):
        self.calls: list[str] = []

    def available(self) -> bool:
        return True

    async def stream(self, text, voice, **kw):
        self.calls.append(text)
        yield b"\0" * 9600          # 0,1 с float32 24 кГц


def _setup():
    events: list[dict] = []
    sess = RealtimeSession(session_id="s", engine_session=engine.create_session("supplier", "ru"))
    sess.bus.publish = events.append  # type: ignore[method-assign]
    provider = _Provider()
    tts = TTSTaskManager(provider, events.append, Voice(id="", lang="ru", female=True))
    return sess, tts, provider, events, NegotiationOrchestrator(sess, tts=tts)


def test_reactions_are_prepared_in_the_persona_s_voice_and_played_without_synthesis():
    async def go():
        sess, tts, provider, events, orch = _setup()
        await orch.prepare_backchannel()
        assert provider.calls == backchannel_phrases("ru", "relationship"), "готовятся заранее"
        provider.calls.clear()
        assert orch.backchannel() is True
        await asyncio.sleep(0.05)
        audio = [e for e in events if e.get("type") == "response.output.delta" and e.get("kind") == "audio"]
        assert audio and provider.calls == [], "реакция звучит сразу, без живого синтеза"
        assert not [e for e in events if e.get("kind") == "text"], "у реакции нет текста"
        assert not sess.engine_session.log, "в журнал разговора реакция не пишется"
    asyncio.run(go())


def test_one_reaction_per_turn_and_never_over_its_own_voice():
    async def go():
        sess, tts, provider, events, orch = _setup()
        await orch.prepare_backchannel()
        assert orch.backchannel() is True
        assert orch.backchannel() is False, "на этом ходу реакция уже была"
        sess.engine_session.turn += 1
        tts.playing_until = time.monotonic() + 5
        assert orch.backchannel() is False, "собеседник ещё звучит — себя не перебивают"
        tts.playing_until = 0
        assert orch.backchannel() is True
    asyncio.run(go())


def test_a_closed_table_and_a_silent_voice_give_no_reaction():
    async def go():
        sess, tts, provider, events, orch = _setup()
        assert orch.backchannel() is False, "звук не готов — молчим, а не синтезируем на ходу"
        await orch.prepare_backchannel()
        sess.engine_session.state.status = "agreement"
        assert orch.backchannel() is False
        assert NegotiationOrchestrator(sess).backchannel() is False, "без синтеза реакции нет"
    asyncio.run(go())


def test_the_turn_ending_signal_fires_once_the_quiet_window_passes(monkeypatch):
    from app.perception import realtime_voice as rv
    monkeypatch.setattr(rv, "_QUIET_MS", 10)
    monkeypatch.setattr(rv, "_ASR_GRACE_MS", 10)
    published: list[dict] = []
    fired: list[int] = []

    async def on_turn(text):
        pass

    async def on_interrupt():
        pass

    async def go():
        p = rv.RealtimeVoicePipeline("ru", on_turn, on_interrupt, published.append,
                                     on_turn_ending=lambda: fired.append(1))
        p._loop = asyncio.get_running_loop()
        p._parts = ["Давайте девяносто"]
        await p._quiet_timer()
    asyncio.run(go())
    assert fired == [1] and {"type": "user.turn.ending"} in published


def test_the_turn_itself_does_not_cut_the_reaction(monkeypatch):
    """Реакция звучит ровно пока ход считается — начало хода её не гасит;
    гасит начало настоящего ответа (новое поколение)."""
    from app.orchestrator import negotiation as module
    monkeypatch.setattr(module, "judge_enabled_for", lambda _mode: False)

    async def go():
        sess, tts, provider, events, orch = _setup()
        await orch.prepare_backchannel()
        orch.backchannel()
        gen = sess.generation_id
        await orch.on_player_turn("Что для вас важнее всего?")
        cancelled = [e for e in events if e.get("type") == "generation.cancelled"]
        assert not [e for e in cancelled if e.get("generation_id") == gen], \
            "начало хода погасило «угу…» — реакция не успевала прозвучать"
        assert sess.engine_session.turn == 1
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
