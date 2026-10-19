"""test_review_runner.py — «Глубокий разбор» от записи до отчёта, офлайн.

Модель подделана: каждый агент получает заготовленный ответ по своему
системному промпту. Проверяется не модель, а то, что вокруг неё обязано быть
честным:
  - придуманная цитата выбрасывается, а не попадает в отчёт;
  - незнакомые коды (компетенция, звук, мимика) выпадают;
  - пауза, «э-э» и нахмуренные брови на одном ходу с «наверное» дают совпадение;
  - упавший или не успевший агент НАЗВАН, а его вывод — «недоступно», не ноль;
  - отчёт не трогает счёт движка.
"""

from __future__ import annotations

import asyncio
import json

import numpy as np
import pytest

from app import engine
from app.providers.openrouter import chat as orchat
from app.review import runner
from app.review.tape import SAMPLE_RATE, Tape

ANSWERS = {
    "уверенности речи": {"markers": [
        {"turn": 2, "quote": "наверное, можно обсудить", "kind": "hedge"},
        {"turn": 1, "quote": "этого игрок не говорил", "kind": "hedge"},
        {"turn": 2, "quote": "ну", "kind": "unknown_kind"}]},
    "компетенций": {"competencies": [
        {"id": "interests", "score": 0.8, "pro": [{"turn": 1, "quote": "Что для вас важнее всего"}], "con": []},
        {"id": "arguments", "score": 0.9, "pro": [{"turn": 3, "quote": "Рынок даёт 90"}],
         "con": [{"turn": 3, "quote": "выдуманная цитата про скидку", "why": "—"}]},
        {"id": "bogus", "score": 1.0, "pro": [], "con": []}]},
    "проговаривания": {"declared": [{"turn": 3, "quote": "Рынок даёт 90", "kind": "reasoning"}],
                       "unspoken": [{"turn": 2, "note": "предложил ниже, не сказав почему"}],
                       "questions": [{"turn": 1, "quote": "Что для вас важнее всего"}], "shifts": []},
    "конкретики": {"specific": [{"turn": 3, "quote": "Рынок даёт 90", "kind": "number"}],
                   "generic": [{"turn": 2, "quote": "можно обсудить цену"}]},
    "понимания вопросов": {"questions": [{"turn": 0, "question": "с чего начнём?", "answer_turn": 1,
                                          "answered": "partial", "quote": "Что для вас важнее всего"}]},
    "реакции на уточнения": "это не JSON",
    "последовательности": {"contradictions": []},
    "сверки фактов": {"claims": [{"turn": 3, "quote": "Рынок даёт 90", "verdict": "unsupported",
                                  "brief": "рыночных данных во вводной нет"}]},
}

VOICE = {"events": [{"t": 0.6, "kind": "filler", "text": "э-э"},
                    {"t": 99, "kind": "filler", "text": "за краем записи"},
                    {"t": 0.2, "kind": "nervous", "text": "вывод, а не звук"}]}
FACE = {"frames": [{"i": 1, "cues": ["frown"]}, {"i": 2, "cues": ["smile", "anxious"]}]}


def _facts() -> dict:
    sess = engine.create_session("supplier", "ru")
    return {
        "lang": "ru",
        "brief": {"role": "закупщик", "counterpart": "Ирина — глава продаж", "briefing": "…",
                  "batna": "другой поставщик", "target": 85, "reservation": 100,
                  "opponent_open": 120, "unit": "₽", "issues": []},
        "greeting": "Здравствуйте. С чего начнём?",
        "lines": [
            {"role": "player", "turn": 1, "text": "Что для вас важнее всего в этой сделке?", "interrupted": False},
            {"role": "opp", "turn": 1, "text": "Сроки.", "interrupted": False},
            {"role": "player", "turn": 2, "text": "Ну, наверное, можно обсудить цену чуть ниже", "interrupted": False},
            {"role": "opp", "turn": 2, "text": "Сколько?", "interrupted": False},
            {"role": "player", "turn": 3, "text": "Рынок даёт 90, давайте от этого", "interrupted": False},
        ],
        "scorecard": {"interests_found": 2, "interests_total": 3, "objective_criteria": 0,
                      "tradeoffs": 0, "relationship": 60, "economic": 50},
        "_engine": sess,
    }


def _speech_with_a_pause() -> np.ndarray:
    # Больше трёх секунд голоса: короче темп «на минуту речи» не считается.
    t = np.arange(SAMPLE_RATE * 16 // 10) / SAMPLE_RATE
    tone = (np.sin(2 * np.pi * 140 * t) * 0.3 * 32767).astype(np.int16)
    quiet = np.zeros(SAMPLE_RATE * 9 // 10, dtype=np.int16)
    lead = np.zeros(SAMPLE_RATE * 3 // 10, dtype=np.int16)
    return np.concatenate([lead, tone, quiet, tone, lead])


def _tape() -> Tape:
    clock = {"ms": 0}
    tape = Tape(lambda: clock["ms"])
    clock["ms"] = 5_000
    tape.mark_source("text")
    tape.observe({"type": "turn.analysis", "turn_id": 1}, turn=0)
    clock["ms"] = 7_000
    tape.observe({"type": "response.done", "turn_id": 1}, turn=1)
    clock["ms"] = 14_000
    tape.speech_started(turn=1)
    tape.audio(_speech_with_a_pause())
    tape.speech_stopped()
    tape.audio(np.zeros(SAMPLE_RATE, dtype=np.int16))
    clock["ms"] = 15_000
    tape.frame("кадр-1", turn=1)
    clock["ms"] = 17_000
    tape.frame("кадр-2", turn=1)
    clock["ms"] = 18_000
    tape.mark_source("voice")
    tape.observe({"type": "turn.analysis", "turn_id": 2}, turn=1)
    clock["ms"] = 30_000
    tape.mark_source("text")
    tape.observe({"type": "turn.analysis", "turn_id": 3}, turn=2)
    return tape


@pytest.fixture()
def fake_model(monkeypatch):
    calls: list[str] = []
    monkeypatch.setattr(orchat, "available", lambda: True)

    def answer(system: str) -> str:
        for key, value in ANSWERS.items():
            if key in system:
                calls.append(key)
                return value if isinstance(value, str) else json.dumps(value, ensure_ascii=False)
        raise AssertionError(f"незнакомый агент: {system[:60]}")

    async def complete(system, user, **kw):
        return answer(system)

    async def complete_parts(system, parts, **kw):
        if "агент голоса" in system:
            calls.append("голос")
            assert any(p.get("type") == "input_audio" for p in parts)
            return json.dumps(VOICE, ensure_ascii=False)
        if "агент мимики" in system:
            calls.append("мимика")
            assert sum(p.get("type") == "image_url" for p in parts) == 2
            return json.dumps(FACE)
        raise AssertionError("незнакомый агент")

    monkeypatch.setattr(orchat, "complete", complete)
    monkeypatch.setattr(orchat, "complete_parts", complete_parts)
    return calls


def _run(facts, tape, **kw):
    events: list[dict] = []
    report = asyncio.run(runner.run_review(facts, tape, progress=events.append, **kw))
    return report, events


def test_the_whole_review_comes_together(fake_model):
    report, events = _run(_facts(), _tape())

    assert report["affects_score"] is False
    assert report["agents_total"] == 10 and report["agents_ok"] == 9
    assert [e["done"] for e in events] == list(range(1, 11))
    assert all(e["total"] == 10 for e in events)
    assert events[0]["groups"][-2:] == ["voice", "face"] and len(events[0]["groups"]) == 10

    comps = {c["id"]: c for c in report["competencies"]}
    assert set(comps) == {"interests", "arguments"}, "незнакомая компетенция выпала"
    assert comps["arguments"]["con"] == [], "выдуманная цитата не доехала до человека"
    assert comps["interests"]["engine"] == pytest.approx(2 / 3, abs=0.01)
    assert comps["interests"]["engine_agrees"] is True
    assert comps["interests"]["engine_basis"] == {"n": 2, "of": 3}, "человек видит «2 из 3», а не «67%»"
    assert comps["arguments"]["engine_agrees"] is False, "модель 0.9, движок — ни одного критерия"
    assert comps["arguments"]["confidence"] < comps["interests"]["confidence"]
    assert report["dropped_quotes"] >= 2

    soft = {s["id"]: s for s in report["soft"]}
    assert soft["followups"]["unavailable"] is True, "агент вернул мусор — вывода нет, а не ноль"
    assert soft["specificity"]["value"] == 0.5
    assert soft["facts"]["examples"][0]["kind"] == "claim_unsupported"
    assert soft["facts"]["value"] is None and soft["facts"]["unchecked"] == 1, \
        "«во вводной этого нет» — не ошибка: блеф и довод из жизни выглядят так же"
    kinds = {e["kind"] for e in report["timeline"]}
    assert "pro" not in kinds and "number" not in kinds, "лента — сигналы, а не все цитаты подряд"
    assert set(soft["assurance"]["channels"]) == {"content", "voice", "video"}


def test_signals_from_three_channels_meet_on_one_turn(fake_model):
    report, _ = _run(_facts(), _tape())
    conv = [c for c in report["convergences"] if c["turn"] == 2]
    assert conv, "«наверное» + пауза + нахмуренные брови на одном ходу — это совпадение"
    assert conv[0]["channels"] == ["content", "video", "voice"]
    assert conv[0]["tight"] is True
    kinds = {s["kind"] for s in conv[0]["signals"]}
    assert {"hedge", "frown"} <= kinds and ({"pause", "filler"} & kinds)


def test_voice_and_face_codes_are_filtered(fake_model):
    report, _ = _run(_facts(), _tape())
    voice = [e for e in report["timeline"] if e["channel"] == "voice"]
    assert {"filler", "pause"} <= {e["kind"] for e in voice}
    assert "nervous" not in {e["kind"] for e in voice}, "вывод о чувствах — не звук"
    assert not [e for e in voice if e.get("text") == "за краем записи"]
    assert report["face"]["cues"] == {"frown": 1, "smile": 1}
    assert report["voice"]["turns"][0]["turn"] == 2
    assert report["voice"]["turns"][0]["pauses"] == 1


def test_a_chat_game_names_why_voice_and_face_are_absent(fake_model):
    clock = {"ms": 1000}
    tape = Tape(lambda: clock["ms"])
    for turn in (1, 2, 3):
        tape.mark_source("text")
        tape.observe({"type": "turn.analysis", "turn_id": turn}, turn=turn - 1)
    report, events = _run(_facts(), tape)
    assert report["channels"]["voice"] == {"state": "absent", "reason": "chat"}
    assert report["channels"]["video"] == {"state": "absent", "reason": "camera_off"}
    assert report["voice"] is None and report["face"] is None
    assert events[-1]["total"] == 8
    assert "voice" not in events[-1]["groups"] and "face" not in events[-1]["groups"], \
        "в партии из чата голос и мимика не ждут — их нет"
    assert "голос" not in fake_model and "мимика" not in fake_model


def test_a_slow_agent_is_named_not_awaited(fake_model, monkeypatch):
    async def slow(system, user, **kw):
        if "компетенций" in system:
            await asyncio.sleep(5)
        return json.dumps({"markers": []} if "уверенности" in system else {})

    monkeypatch.setattr(orchat, "complete", slow)
    report, _ = _run(_facts(), None, deadline_s=1.5)
    status = {a["id"]: a for a in report["agents"]}
    assert status["competency"]["ok"] is False and status["competency"]["reason"] == "timeout"
    assert report["competencies"] == []


def test_without_a_model_the_measured_voice_still_speaks(monkeypatch):
    monkeypatch.setattr(orchat, "available", lambda: False)
    report, _ = _run(_facts(), _tape())
    assert report["agents_ok"] == 0
    assert report["channels"]["content"]["state"] == "failed"
    assert report["voice"]["turns"][0]["pauses"] == 1, "паузу мерил numpy, а не модель"
    lex = [e for e in report["timeline"] if e.get("lexicon")]
    assert lex and lex[0]["text"] == "наверное", "словарь подхватил смягчение за молчащего агента"


def test_the_review_does_not_touch_the_engine(fake_model):
    facts = _facts()
    sess = facts.pop("_engine")
    before = engine.score_session(sess)
    _run(facts, _tape())
    assert engine.score_session(sess) == before
