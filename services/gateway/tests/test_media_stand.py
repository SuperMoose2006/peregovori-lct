"""test_media_stand.py — стенд видеоконтура: testcard и синтетический звук.

Стенд проверяет ПУТЬ, по которому пойдёт настоящая модель видео: кадр несёт
`pts_ms` от первого сэмпла своего поколения, идёт по той же шине, что звук,
гасится перебиванием и не оживает после отмены. Сам стенд — не продукт:
включается только явной переменной и называет себя синтетическим.

Чего здесь НЕТ и быть не может: сетевой задержки внешней модели, её разброса,
50-миллисекундного бюджета `speak` под нагрузкой сети. Стенд рисует кадры
локально за миллисекунды — эти свойства проверит только настоящий адаптер.
"""

from __future__ import annotations

import asyncio

import numpy as np
import pytest

from app import engine
from app.avatar import factory
from app.avatar.amplitude import AmplitudeAvatar
from app.avatar.testcard import FRAME_MS, QUEUE_MAX, SAMPLE_RATE, TestcardAvatar
from app.orchestrator.negotiation import NegotiationOrchestrator
from app.orchestrator.tts_manager import TTSTaskManager
from app.providers.tts.base import Voice
from app.providers.tts.choose import make_tts
from app.providers.tts.testtone import ToneTTS
from app.realtime.session import Layers, RealtimeSession


def _pcm(ms: float, level: float = 0.2) -> bytes:
    n = int(SAMPLE_RATE * ms / 1000)
    return (np.full(n, level, dtype="<f4")).tobytes()


class _Sink:
    def __init__(self) -> None:
        self.events: list[dict] = []

    def __call__(self, event: dict) -> None:
        self.events.append(event)

    def frames(self, gen: str | None = None) -> list[dict]:
        return [e for e in self.events if e["type"] == "avatar.frame"
                and (gen is None or e["generation_id"] == gen)]


async def _settle(avatar: TestcardAvatar) -> None:
    for _ in range(200):
        await asyncio.sleep(0)
        if avatar._queue.empty():
            break
    await asyncio.sleep(0.01)


# ---------------------------------------------------------------------------
# Кадры на часах звука
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_frames_sit_on_the_audio_clock_of_their_generation():
    sink = _Sink()
    avatar = TestcardAvatar("supplier", sink)
    for _ in range(5):                       # 5 × 100 мс звука
        await avatar.speak(_pcm(100), generation_id="g1")
    await _settle(avatar)
    pts = [f["pts_ms"] for f in sink.frames("g1")]
    assert pts == [i * FRAME_MS for i in range(len(pts))]
    assert pts[-1] < 500 <= pts[-1] + FRAME_MS, "кадры обязаны покрыть звук и не уйти дальше него"
    await avatar.close()


@pytest.mark.asyncio
async def test_a_new_generation_starts_its_own_clock():
    sink = _Sink()
    avatar = TestcardAvatar("supplier", sink)
    await avatar.speak(_pcm(200), generation_id="g1")
    await avatar.speak(_pcm(200), generation_id="g2")
    await _settle(avatar)
    assert [f["pts_ms"] for f in sink.frames("g2")][:1] == [0.0]
    await avatar.close()


@pytest.mark.asyncio
async def test_overflow_drops_audio_without_shifting_the_clock():
    sink = _Sink()
    avatar = TestcardAvatar("supplier", sink)
    # Всё поставлено без единого `await` между вызовами отрисовки: очередь
    # переполняется, и старые чанки выбрасываются.
    chunks = QUEUE_MAX + 10
    for _ in range(chunks):
        await avatar.speak(_pcm(40), generation_id="g1")
    await _settle(avatar)
    assert avatar.chunks_dropped > 0
    total_ms = chunks * 40
    for f in sink.frames("g1"):
        assert f["pts_ms"] % FRAME_MS == 0, "кадр слетел с сетки"
        assert f["pts_ms"] < total_ms
    kept_from_ms = avatar.chunks_dropped * 40
    assert min(f["pts_ms"] for f in sink.frames("g1")) >= kept_from_ms - FRAME_MS, \
        "выброшенный звук сдвинул часы: кадр получил метку чужого отрезка"
    await avatar.close()


@pytest.mark.asyncio
async def test_interrupt_stops_frames_of_the_silenced_generation():
    sink = _Sink()
    avatar = TestcardAvatar("supplier", sink)
    for _ in range(30):
        await avatar.speak(_pcm(100), generation_id="g1")
    await avatar.interrupt()
    before = len(sink.frames("g1"))
    await _settle(avatar)
    assert len(sink.frames("g1")) == before, "после перебивания пришли кадры погашенной речи"
    assert any(e["type"] == "avatar.state" and e["state"] == "listening" for e in sink.events)
    await avatar.close()


# ---------------------------------------------------------------------------
# Стенд включается только явно и называет себя стендом
# ---------------------------------------------------------------------------

def test_testcard_is_never_chosen_by_default(monkeypatch):
    monkeypatch.delenv("NEGO_AVATAR_PROVIDER", raising=False)
    assert isinstance(factory.create_avatar("supplier", lambda e: None, voice=True), AmplitudeAvatar)
    monkeypatch.setenv("NEGO_AVATAR_PROVIDER", "testcard")
    chosen = factory.create_avatar("supplier", lambda e: None, voice=True)
    assert isinstance(chosen, TestcardAvatar)
    caps = chosen.capabilities()
    assert caps.synthetic is True and caps.lipsync_mode == "video" and caps.transport == "jpeg"
    # Без голоса кадрам не на чем держаться — стенд не поднимается.
    assert not isinstance(factory.create_avatar("supplier", lambda e: None, voice=False), TestcardAvatar)
    with pytest.raises(ValueError):
        factory.register_provider("testcard", TestcardAvatar)


def test_synthetic_voice_only_on_explicit_request(monkeypatch):
    monkeypatch.delenv("NEGO_TTS", raising=False)
    assert not isinstance(make_tts(), ToneTTS)
    monkeypatch.setenv("NEGO_TTS", "testtone")
    tts = make_tts()
    assert isinstance(tts, ToneTTS)
    assert "не речь" in tts.describe()


@pytest.mark.asyncio
async def test_session_capabilities_mark_the_stand_as_synthetic(monkeypatch):
    from app.realtime import endpoint
    from app.realtime.events import SessionInit
    monkeypatch.setenv("NEGO_AVATAR_PROVIDER", "testcard")
    monkeypatch.setenv("NEGO_TTS", "testtone")
    session, err = await endpoint._build_session(SessionInit(
        scenarioId="supplier", mode="voice", layers={"voice": True, "avatar": True}))
    assert err is None
    payload = endpoint._created_payload(session, None)
    avatar = payload["capabilities"]["avatar"]
    assert avatar["synthetic"] is True
    assert avatar["interruptible"] is True
    assert avatar["lipsync_mode"] == "video"


# ---------------------------------------------------------------------------
# Сквозной ход: звук и кадры одного поколения, перебивание гасит оба
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_a_turn_on_the_stand_sends_audio_and_frames_of_one_generation():
    session = RealtimeSession("stand", engine.create_session("supplier", "ru"),
                              layers=Layers(voice=True, avatar=True))
    avatar = TestcardAvatar("supplier", session.bus.publish)
    tts = TTSTaskManager(ToneTTS(), session.bus.publish, Voice(id="", lang="ru", female=True))
    orch = NegotiationOrchestrator(session, tts=tts, avatar=avatar)
    await orch.on_player_turn("Что для вас важнее всего, кроме цены?")
    for _ in range(300):                     # синтез идёт фоном после response.done
        await asyncio.sleep(0.01)
        if avatar.frames_sent and avatar._queue.empty() and not tts_busy(tts):
            break
    await _settle(avatar)
    session.bus.close()
    events = [e async for e in session.bus.drain()]
    audio = [e for e in events if e["type"] == "response.output.delta" and e["kind"] == "audio"]
    frames = [e for e in events if e["type"] == "avatar.frame"]
    assert audio and frames
    gens = {e["generation_id"] for e in audio}
    assert len(gens) == 1 and {f["generation_id"] for f in frames} == gens
    audio_ms = sum(len(__import__("base64").b64decode(e["audio"])) // 4 for e in audio) * 1000 / SAMPLE_RATE
    assert max(f["pts_ms"] for f in frames) < audio_ms, "кадр ушёл дальше звука"
    await avatar.close()


def tts_busy(tts: TTSTaskManager) -> bool:
    return bool(tts._sender and not tts._sender.done())


@pytest.mark.asyncio
async def test_frames_of_an_interrupted_reply_never_leave_the_bus():
    session = RealtimeSession("stand-cut", engine.create_session("supplier", "ru"),
                              layers=Layers(voice=True, avatar=True))
    avatar = TestcardAvatar("supplier", session.bus.publish)
    tts = TTSTaskManager(ToneTTS(), session.bus.publish, Voice(id="", lang="ru", female=True))
    orch = NegotiationOrchestrator(session, tts=tts, avatar=avatar)
    await orch.on_player_turn("Что для вас важнее всего, кроме цены?")
    for _ in range(100):
        await asyncio.sleep(0.01)
        if avatar.frames_sent:
            break
    cut = session.generation_id
    await orch.interrupt(reason="barge_in")
    await asyncio.sleep(0.2)
    session.bus.close()
    events = [e async for e in session.bus.drain()]
    idx = next(i for i, e in enumerate(events) if e["type"] == "generation.cancelled")
    late = [e for e in events[idx + 1:] if e.get("generation_id") == cut
            and e["type"] in ("avatar.frame", "response.output.delta")]
    assert late == [], "хвост погашенной речи прошёл через шину после отмены"
    await avatar.close()
