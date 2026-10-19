"""test_review_tape.py — запись партии для «Глубокого разбора».

Что держит набор:
  - речь пишется кусками от «заговорил» до «замолчал» с секундой ДО и хвостом;
  - у записи три потолка, и упёршаяся запись говорит об этом флагом, а не молчит;
  - кадры — по такту, длинная партия прореживается, а не обрезается хвостом;
  - время ходов и их источник (`text` | `voice`) пишет край, не движок;
  - запись переживает смену режима (resume) и не заводится в партии на зачёт;
  - в счёт запись не попадает — она живёт в `RealtimeSession`.
"""

from __future__ import annotations

import gc

import numpy as np
import pytest

from app import engine
from app.realtime.session import RealtimeSession, keep_for_resume, restore_from_resume
from app.review import tape as tape_module
from app.review.tape import SAMPLE_RATE, Tape


class _Clock:
    def __init__(self) -> None:
        self.ms = 0

    def __call__(self) -> int:
        return self.ms


def _chunk(ms: int = 120, value: int = 0) -> np.ndarray:
    return np.full(SAMPLE_RATE * ms // 1000, value, dtype=np.int16)


def _feed(tape: Tape, clock: _Clock, ms: int, value: int = 0) -> None:
    for _ in range(ms // 120):
        clock.ms += 120
        tape.audio(_chunk(120, value))


# ------------------------------------------------------------------ речь

def test_a_clip_holds_a_second_before_the_speech_and_a_short_tail():
    clock = _Clock()
    tape = Tape(clock)
    _feed(tape, clock, 2400)                 # тишина до речи
    tape.speech_started(turn=0)
    start = clock.ms
    _feed(tape, clock, 1200, value=500)      # речь
    tape.speech_stopped()
    _feed(tape, clock, 1200)                 # тишина после

    assert len(tape.clips) == 1
    clip = tape.clips[0]
    assert clip.closed
    assert 950 <= start - clip.at_ms <= 1000, "предзапись — секунда до «заговорил»"
    assert 2400 <= clip.dur_ms <= 2700, f"секунда + речь + хвост, а не {clip.dur_ms} мс"
    assert clip.turn == 0


def test_speaking_again_inside_the_tail_continues_the_same_clip():
    clock = _Clock()
    tape = Tape(clock)
    tape.speech_started(turn=1)
    _feed(tape, clock, 480, value=300)
    tape.speech_stopped()
    _feed(tape, clock, 120)
    tape.speech_started(turn=1)              # «…но при одном условии»
    _feed(tape, clock, 480, value=300)
    tape.speech_stopped()
    _feed(tape, clock, 600)
    assert len(tape.clips) == 1, "пауза внутри реплики — это пауза, а не вторая реплика"


def test_a_clip_and_the_game_have_ceilings(monkeypatch):
    monkeypatch.setattr(tape_module, "MAX_CLIP_S", 1.0)
    monkeypatch.setattr(tape_module, "MAX_SPEECH_S", 1.5)
    clock = _Clock()
    tape = Tape(clock)
    tape.speech_started(turn=0)
    _feed(tape, clock, 2400, value=200)
    assert tape.clips[0].closed and tape.clips[0].dur_ms == 1000, "кусок закрылся на потолке"
    tape.speech_started(turn=1)
    _feed(tape, clock, 2400, value=200)
    assert tape.speech_ms == 1500
    assert tape.audio_truncated, "упёршаяся запись обязана сказать об этом"
    tape.speech_started(turn=2)
    assert len(tape.clips) == 2, "сверх потолка партии новые куски не заводятся"


def test_all_tapes_share_one_memory_ceiling(monkeypatch):
    gc.collect()
    base = tape_module.held_bytes()
    monkeypatch.setattr(tape_module, "GLOBAL_MAX_BYTES", base + 40_000)
    clock = _Clock()
    first = Tape(clock)
    first.speech_started(turn=0)
    _feed(first, clock, 960, value=100)      # 30 720 байт
    first.speech_stopped()
    second = Tape(clock)
    second.speech_started(turn=0)
    _feed(second, clock, 960, value=100)
    assert second.starved, "общая память кончилась — запись это знает"
    assert tape_module.held_bytes() <= base + 40_000

    del first, second
    gc.collect()
    assert tape_module.held_bytes() == base, "ушедшая запись возвращает память"


def test_discarding_media_frees_the_memory_and_keeps_the_timing():
    gc.collect()
    base = tape_module.held_bytes()
    clock = _Clock()
    tape = Tape(clock)
    tape.speech_started(turn=0)
    _feed(tape, clock, 480, value=100)
    tape.frame("кадр" * 100, turn=0)
    tape.observe({"type": "turn.analysis", "turn_id": 1}, turn=0)
    assert tape_module.held_bytes() > base
    tape.discard_media()
    assert tape_module.held_bytes() == base
    assert tape.frames == [] and tape.clips[0].pcm == bytearray()
    assert tape.turn_at == {1: clock.ms}
    tape.frame("кадр", turn=1)
    tape.speech_started(turn=1)
    assert tape.frames == [] and len(tape.clips) == 1, "после отчёта запись больше не пишет"


# ------------------------------------------------------------------ кадры

def test_frames_follow_the_beat_and_skip_oversized_ones():
    clock = _Clock()
    tape = Tape(clock)
    for _ in range(10):
        clock.ms += 1000
        tape.frame("jpeg", turn=0)
    assert [f.at_ms for f in tape.frames] == [1000, 3000, 5000, 7000, 9000]
    clock.ms += 5000
    tape.frame("x" * (tape_module.MAX_FRAME_CHARS + 1), turn=0)
    assert len(tape.frames) == 5


def test_a_long_game_is_thinned_not_cut(monkeypatch):
    monkeypatch.setattr(tape_module, "MAX_FRAMES", 10)
    clock = _Clock()
    tape = Tape(clock)
    for _ in range(40):
        clock.ms += 2000
        tape.frame("jpeg", turn=0)
    assert len(tape.frames) <= 10 and tape.frames_thinned
    assert tape.frames[0].at_ms == 2000, "начало партии осталось в записи"
    assert tape.frames[-1].at_ms >= 70_000, "и конец тоже"


# ------------------------------------------------------------------ ходы

def test_turn_time_and_source_come_from_the_edge():
    clock = _Clock()
    tape = Tape(clock)
    clock.ms = 4000
    tape.mark_source("text")
    tape.observe({"type": "turn.analysis", "turn_id": 1}, turn=0)
    clock.ms = 6500
    tape.observe({"type": "response.done", "turn_id": 1}, turn=1)
    clock.ms = 9000
    tape.observe({"type": "turn.analysis", "turn_id": 2}, turn=1)   # источник неизвестен
    assert tape.turn_at == {1: 4000, 2: 9000}
    assert tape.turn_source == {1: "text"}, "незнакомый источник не выдумывается"
    assert tape.reply_at == {1: 6500}


def test_speech_events_open_and_close_clips():
    clock = _Clock()
    tape = Tape(clock)
    tape.observe({"type": "user.speech.started"}, turn=3)
    _feed(tape, clock, 240, value=100)
    tape.observe({"type": "user.speech.stopped"}, turn=3)
    _feed(tape, clock, 480)
    assert len(tape.clips) == 1 and tape.clips[0].turn == 3 and tape.clips[0].closed


# ------------------------------------------------------------------ сессия

def _session(mode: str = "practice", sid: str = "s") -> RealtimeSession:
    return RealtimeSession(session_id=sid, game_mode=mode,
                           engine_session=engine.create_session("supplier", "ru"))


def test_graded_games_keep_no_tape():
    for mode in ("exam", "drill"):
        assert _session(mode).tape is None, f"{mode}: запись на зачёте не ведётся"
    assert _session("practice").tape is not None


def test_the_tape_survives_a_mode_switch_and_keeps_its_clock():
    first = _session(sid="tape-resume")
    first.tape.mark_source("text")
    first.tape.observe({"type": "turn.analysis", "turn_id": 1}, turn=0)
    first.tape.frame("jpeg", turn=1)
    original = first.tape
    keep_for_resume(first)

    second = _session(sid="tape-resume")
    restore_from_resume(second, "tape-resume")
    assert second.tape is original, "смена режима не начинает запись с нуля"
    second.tape.frame("jpeg-2", turn=1)
    assert second.tape.frames[-1].at_ms >= second.tape.frames[0].at_ms


def test_the_tape_cannot_reach_the_score():
    fields = set(vars(engine.create_session("supplier", "ru")))
    assert not {"tape", "clips", "frames", "turn_source"} & fields


# ------------------------------------------------------------------ провод

def test_a_typed_move_lands_on_the_tape_with_its_source(monkeypatch):
    from fastapi.testclient import TestClient
    import app.realtime.endpoint as endpoint_module
    from app.main import app

    built: list = []
    original = endpoint_module._build_session

    async def spy(payload):
        session, problem = await original(payload)
        if session is not None:
            built.append(session)
        return session, problem

    monkeypatch.setattr(endpoint_module, "_build_session", spy)
    client = TestClient(app)
    with client.websocket_connect("/v1/realtime?mode=text") as ws:
        assert ws.receive_json()["type"] == "session.queue_done"
        ws.send_json({"type": "session.init", "payload": {
            "scenarioId": "supplier", "lang": "ru", "layers": {"camera": True}}})
        assert ws.receive_json()["type"] == "session.created"
        ws.send_json({"type": "input.append", "input": {"video_frames": ["jpeg-кадр"]}})
        ws.send_json({"type": "input.append", "input": {"text": "Что для вас важнее всего?"}})
        ws.send_json({"type": "input.commit"})
        for _ in range(30):
            if ws.receive_json()["type"] == "response.done":
                break
        ws.send_json({"type": "session.close", "reason": "test"})

    tape = built[0].tape
    assert set(tape.turn_at) == {1} and tape.turn_source == {1: "text"}
    assert 1 in tape.reply_at
    assert [f.jpeg_b64 for f in tape.frames] == ["jpeg-кадр"], "кадр записан и без модели зрения"


@pytest.mark.parametrize("layers", [{}, {"camera": False}])
def test_no_camera_layer_means_no_frames_on_the_tape(monkeypatch, layers):
    from fastapi.testclient import TestClient
    import app.realtime.endpoint as endpoint_module
    from app.main import app

    built: list = []
    original = endpoint_module._build_session

    async def spy(payload):
        session, problem = await original(payload)
        if session is not None:
            built.append(session)
        return session, problem

    monkeypatch.setattr(endpoint_module, "_build_session", spy)
    with TestClient(app).websocket_connect("/v1/realtime?mode=text") as ws:
        ws.receive_json()
        ws.send_json({"type": "session.init", "payload": {
            "scenarioId": "supplier", "lang": "ru", "layers": layers}})
        ws.receive_json()
        ws.send_json({"type": "input.append", "input": {"video_frames": ["jpeg"]}})
        ws.send_json({"type": "session.close", "reason": "test"})
        ws.receive_json()
    assert built[0].tape.frames == []
