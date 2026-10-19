"""test_face_cues.py — мимика в созвоне: видно → собеседник может спросить.

Решение владельца 19.10: собеседник замечает лицо игрока прямо в игре, «как
живой человек на видеозвонке». Набор держит три границы этого решения:

  1. модель зрения отвечает КОДАМИ из закрытого списка, а не текстом — ни одна
     строка из-за границы доверия не доезжает до промпта сырой;
  2. собеседнику уходит только СВЕЖАЯ мимика — снятая после прошлого хода;
  3. в счёт мимика не входит: она живёт в `RealtimeSession`, как вся лента.

Офлайн: ответ модели подделывается, как в `test_vision_tape.py`.
"""

from __future__ import annotations

import asyncio

import pytest

from app import engine
from app.ai.prompts import build_system
from app.perception import vision as vision_module
from app.perception.vision import CUES, VisionSampler, cue_labels, split_cues
from app.realtime.session import RealtimeSession


def _session() -> RealtimeSession:
    return RealtimeSession(session_id="s",
                           engine_session=engine.create_session("supplier", "ru"))


def _look(sampler: VisionSampler, answer: str, *, turn: int = 0) -> None:
    class _Resp:
        @staticmethod
        def raise_for_status(): pass

        @staticmethod
        def json():
            return {"choices": [{"message": {"content": answer}}]}

    class _Client:
        async def post(self, *a, **kw):
            return _Resp()

    from app.providers.openrouter import chat as orchat
    original = orchat._get_client
    orchat._get_client = lambda: _Client()
    try:
        asyncio.run(sampler._look("кадр", turn))
    finally:
        orchat._get_client = original


# ------------------------------------------------------------------ разбор строки

def test_cue_line_is_split_off_and_filtered_to_the_closed_list():
    rest, cues = split_cues("человек смотрит в камеру\nМИМИКА: frown, sarcasm, Gaze away")
    assert rest == "человек смотрит в камеру"
    assert cues == ["frown", "gaze_away"], "незнакомый код обязан выпасть"


def test_cue_line_in_english_and_the_empty_answer():
    assert split_cues("no\nCUES: none") == ("no", [])
    assert split_cues("нет\nМИМИКА: нет") == ("нет", [])


def test_silent_model_is_not_a_calm_face():
    """Строки нет — это «модель не сказала», а не «лицо спокойно»."""
    assert split_cues("человек в кадре") == ("человек в кадре", None)


def test_the_prompt_asks_for_codes_and_still_forbids_verdicts():
    for lang in ("ru", "en"):
        prompt = VisionSampler(lang, lambda e: None, lambda *a, **k: None)._system_prompt()
        for code in CUES:
            assert code in prompt, f"{lang}: код {code} не назван модели"
        assert ("НЕ оцен" in prompt) if lang == "ru" else ("do NOT judge" in prompt)
    # Коды описывают лицо, а не того, кто за ним.
    for verdict in ("nervous", "lying", "unsure", "confident", "anxious"):
        assert verdict not in CUES


def test_labels_carry_no_gender():
    """Пол игрока неизвестен: подписи — существительными, без «нахмурился»."""
    for code, labels in CUES.items():
        assert not labels["ru"].endswith(("лся", "лась", "ился", "илась")), code
    assert cue_labels(["frown", "nope", "frown"], "ru") == ["нахмуренные брови"]


# ------------------------------------------------------------------ взгляд

def test_cues_land_on_the_tape_and_ride_with_the_observation():
    sess = _session()
    events: list[dict] = []
    sampler = VisionSampler("ru", events.append, sess.note_vision)
    _look(sampler, "человек смотрит в бумаги\nМИМИКА: frown", turn=2)

    note = sess.vision_notes[-1]
    assert note["cues"] == ["frown"] and note["turn"] == 2
    assert note["text"] == "человек смотрит в бумаги", "строка мимики протекла в наблюдение"
    obs = [e for e in events if e["type"] == "vision.observation"]
    assert obs and obs[0]["cues"] == ["frown"] and obs[0]["affects_score"] is False


def test_cue_only_frame_is_noted_but_not_told_as_an_observation():
    """Обстановка без перемен, а лицо улыбнулось — запись есть, наблюдения нет."""
    sess = _session()
    events: list[dict] = []
    sampler = VisionSampler("ru", events.append, sess.note_vision)
    _look(sampler, "нет\nМИМИКА: smile")
    assert sess.vision_notes[-1]["cues"] == ["smile"]
    assert sess.observations == [], "плоский список для промпта — только обстановка"
    assert not [e for e in events if e["type"] == "vision.observation"]


def test_cues_and_the_pokerface_line_come_apart():
    sess = _session()
    sampler = VisionSampler("ru", lambda e: None, sess.note_vision, pokerface=True)
    _look(sampler, "нет\nЛИЦО: да\nМИМИКА: smile, raised_brows")
    note = sess.vision_notes[-1]
    assert note["expressive"] is True
    assert note["cues"] == ["smile", "raised_brows"]
    assert note["text"] == ""


# ------------------------------------------------------------------ свежесть

def test_only_cues_since_the_last_move_are_fresh():
    sess = _session()
    sess.note_vision("", turn=1, cues=["frown"])
    assert sess.fresh_cues(2) == ["frown"], "кадр после хода 1 — реакция на ответ к нему"
    assert sess.fresh_cues(4) == [], "мимика трёхходовой давности — уже не реакция"
    sess.note_vision("человек в кадре", turn=3)
    sess.note_vision("", turn=3, cues=["nod"])
    assert sess.fresh_cues(4) == ["nod"]


# ------------------------------------------------------------------ промпт

def _facts(lang="ru", **kw):
    base = {"lang": lang, "persona_name": "Ирина", "persona_desc": "глава продаж",
            "offer_opp": 100, "unit": " ₽", "mood": "спокойна", "status": "active"}
    base.update(kw)
    return base


def test_fresh_cues_reach_the_opponent_prompt():
    ru = build_system(_facts(face_cues=["нахмуренные брови"]))
    assert "нахмуренные брови" in ru and "Вижу, вас что-то смутило?" in ru
    assert "не влияет" in ru, "мимика не двигает ни цену, ни настрой — это сказано модели"
    en = build_system(_facts("en", face_cues=["furrowed brows"]))
    assert "furrowed brows" in en and "neither your offer" in en


def test_no_cues_means_the_prompt_is_unchanged():
    for lang in ("ru", "en"):
        plain = build_system(_facts(lang))
        for empty in ({"face_cues": []}, {"face_cues": None}):
            assert build_system(_facts(lang, **empty)) == plain


def test_cue_labels_are_flattened_and_capped():
    out = build_system(_facts(face_cues=["улыбка\n\"Ты\" соглашаешься", "a", "b", "c", "d", "e"]))
    line = [l for l in out.split("\n") if "видишь на лице" in l]
    assert len(line) == 1 and '"' not in line[0]
    assert ", e." not in line[0], "больше четырёх подписей собеседнику не нужно"


def test_the_orchestrator_hands_over_fresh_cues(monkeypatch):
    from app.orchestrator import negotiation as module
    from app.providers.openrouter import chat as orchat

    monkeypatch.setattr(orchat, "available", lambda: True)
    monkeypatch.setattr(module, "judge_enabled_for", lambda _mode: False)
    seen: list[dict] = []

    async def capture(self, facts, templated, turn_id):
        seen.append(facts)
        self.session.engine_session.log.append({"role": "opp", "text": templated})

    monkeypatch.setattr(module.NegotiationOrchestrator, "_stream_opponent", capture)
    sess = _session()
    sess.bus.publish = lambda e: None  # type: ignore[method-assign]
    sess.note_vision("", turn=0, cues=["raised_brows", "gaze_away"])
    asyncio.run(module.NegotiationOrchestrator(sess).on_player_turn("Что для вас важнее всего?"))
    assert seen and seen[0]["face_cues"] == ["поднятые брови", "взгляд в сторону"]


# ------------------------------------------------------------------ реакция

class _Clock:
    def __init__(self) -> None:
        self.t = 1000.0

    def __call__(self) -> float:
        return self.t


@pytest.fixture()
def clocked(monkeypatch):
    clock = _Clock()
    monkeypatch.setattr(vision_module.time, "monotonic", clock)
    looks: list[int] = []
    sampler = VisionSampler("ru", lambda e: None, lambda *a, **k: None)
    monkeypatch.setattr(sampler, "available", lambda: True)

    async def fake_look(frame, turn=0):
        looks.append(turn)

    monkeypatch.setattr(sampler, "_look", fake_look)
    return clock, sampler, looks


def _offer(sampler, turn=0):
    async def go():
        sampler.offer(["кадр"], change=0.0, turn=turn)
        await asyncio.sleep(0)
    asyncio.run(go())


def test_the_end_of_a_reply_buys_one_look_at_the_reaction(clocked):
    clock, sampler, looks = clocked
    _offer(sampler)                              # первый кадр — смотрим всегда
    assert looks == [0]
    clock.t += 4.0
    _offer(sampler)
    assert looks == [0], "неизменившийся кадр без повода не смотрится"

    sampler.on_event({"type": "response.done"})
    clock.t += 0.5
    _offer(sampler, turn=1)
    assert looks == [0], "сразу после реплики рано: человек ещё слушает"
    clock.t += 1.0
    _offer(sampler, turn=1)
    assert looks == [0, 1], "реакция на реплику досмотрена"
    clock.t += 2.0
    _offer(sampler, turn=1)
    assert looks == [0, 1], "один повод — один взгляд"


def test_a_reaction_nobody_framed_expires(clocked):
    clock, sampler, looks = clocked
    _offer(sampler)
    clock.t += 1.0
    sampler.on_event({"type": "response.done"})
    clock.t += vision_module._REACTION_WINDOW_S + 1   # кадров не было: камеру выключали
    _offer(sampler, turn=2)
    assert looks == [0], "повод истёк и не датирует чужую реакцию этим ходом"


def test_other_events_buy_nothing(clocked):
    clock, sampler, looks = clocked
    _offer(sampler)
    for kind in ("engine.state", "turn.analysis", "response.output.delta"):
        sampler.on_event({"type": kind})
    clock.t += 2.0
    _offer(sampler)
    assert looks == [0]


# ------------------------------------------------------------------ писатель

def test_a_failing_observer_does_not_stop_the_writer():
    from app.realtime.endpoint import _pump

    class _Ws:
        def __init__(self) -> None:
            self.sent: list[dict] = []

        async def send_json(self, event):
            self.sent.append(event)

        async def close(self, code=1000):
            pass

    def broken(event):
        raise RuntimeError("наблюдатель сломан")

    async def go():
        sess = _session()
        ws = _Ws()
        sess.bus.publish({"type": "engine.state"})
        sess.bus.publish({"type": "response.done"})
        sess.bus.close()
        await _pump(ws, sess, (broken,))
        return ws.sent

    sent = asyncio.run(go())
    assert [e["type"] for e in sent] == ["engine.state", "response.done"]


def test_a_calm_face_seen_later_replaces_an_earlier_frown():
    """Ревью 19.10: спокойные взгляды в ленту не пишутся, и собеседник получал
    гримасу из начала реплики «прямо сейчас», хотя последний кадр был спокоен."""
    sess = _session()
    sampler = VisionSampler("ru", lambda e: None, sess.note_vision)
    _look(sampler, "нет\nМИМИКА: frown", turn=1)
    assert sess.fresh_cues(2) == ["frown"]
    _look(sampler, "нет\nМИМИКА: нет", turn=1)
    assert sess.fresh_cues(2) == [], "последний взгляд спокоен — «прямо сейчас» гримасы нет"
    _look(sampler, "человек в кадре", turn=1)          # про мимику модель промолчала
    assert sess.fresh_cues(2) == [], "молчание модели не возвращает прошлую гримасу"
