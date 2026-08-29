"""Санитайзер защищал экран, а не уши.

Реплику оппонента судит `sanitize()` — она отвергает выход из роли («как
языковая модель, я не могу вести переговоры») и чужой алфавит, и тогда пузырь
чата заменяется шаблоном движка. Это работало.

Но синтез речи получает фразу, КАК ТОЛЬКО ОНА СЛОЖИЛАСЬ, — в этом весь смысл
конвейера: первый звук за 2.5 с вместо ожидания всего текста (docs/latency.md).
Санитайзер к тому моменту ещё не звали: он судит реплику целиком, когда модель
дописала. Значит человек успевал УСЛЫШАТЬ то, что с экрана убирали.

В голосовом режиме — а это режим показа — звук и есть реплика. Здесь
проверяется, что до синтеза отвергнутая фраза не доходит.
"""
from __future__ import annotations

import asyncio
import types

import pytest

from app.orchestrator import negotiation as neg


class _RecordingTTS:
    """Запоминает, что ему велели произнести."""

    def __init__(self) -> None:
        self.said: list[str] = []

    def speak(self, text, generation_id=None, turn_id=None):  # noqa: D102
        self.said.append(text)


class _Bus:
    def __init__(self) -> None:
        self.events: list[dict] = []

    def publish(self, ev) -> None:
        self.events.append(ev)


def _fake_session():
    """Минимум, которого хватает `_stream_opponent`."""
    sess = types.SimpleNamespace()
    sess.bus = _Bus()
    sess.spoken_so_far = ""
    sess.engine_session = types.SimpleNamespace(log=[])
    sess.begin_generation = lambda: "gen-1"
    return sess


def _orchestrator(tts):
    orc = neg.NegotiationOrchestrator.__new__(neg.NegotiationOrchestrator)
    orc.session = _fake_session()
    orc.tts = tts
    orc.avatar = None
    orc._generation_task = None
    orc.on_speaking_change = None
    return orc


def _run(monkeypatch, chunks: list[str], templated: str = "Шаблон движка."):
    """Прогнать поток модели через оркестратор, вернуть (что озвучено, итог)."""
    tts = _RecordingTTS()
    orc = _orchestrator(tts)

    async def fake_stream(system, user, role=None, max_tokens=None, temperature=None):
        for c in chunks:
            yield c

    monkeypatch.setattr(neg.orchat, "stream", fake_stream)
    monkeypatch.setattr(neg, "build_prompts", lambda facts: ("s", "u"))
    monkeypatch.setattr(neg.NegotiationOrchestrator, "_finish_generation", lambda self: None)

    asyncio.run(orc._stream_opponent({}, templated, turn_id=1))
    done = [e for e in orc.session.bus.events
            if (e.get("type") if isinstance(e, dict) else "") == "response.done"]
    final = (done[-1].get("text") if done else None) or orc.session.engine_session.log[-1]["text"]
    return tts.said, final


def test_the_model_breaking_character_is_never_synthesised(monkeypatch):
    said, final = _run(monkeypatch, ["Как языковая модель, я не могу вести переговоры. "])
    assert not any("языковая модель" in s.lower() for s in said), (
        f"выход из роли ушёл в синтез: {said}")
    # Ход не должен пройти в тишине: раз всё отвергнуто — звучит шаблон движка.
    assert said == ["Шаблон движка."], said
    assert final == "Шаблон движка."


def test_foreign_script_is_never_synthesised(monkeypatch):
    said, _ = _run(monkeypatch, ["Для нас — 携手守护, и мы идём навстречу. "])
    assert not any("携" in s for s in said), f"иероглифы ушли в синтез: {said}"


def test_a_good_phrase_still_reaches_the_voice_immediately(monkeypatch):
    """Обратная сторона: защита не должна отобрать у конвейера его смысл.

    Без этой половины предыдущие два теста удовлетворились бы синтезом, который
    молчит всегда.
    """
    said, final = _run(monkeypatch, ["Мы готовы обсудить объём. ", "Но цена пока прежняя. "])
    assert said == ["Мы готовы обсудить объём.", "Но цена пока прежняя."], said
    assert "объём" in final


def test_the_rest_of_a_spoiled_reply_is_silenced_too(monkeypatch):
    """Испорченная фраза глушит и всё, что за ней. Так и задумано.

    Соблазн — выбросить только плохой кусок и договорить остальное. Он ломается
    о то, как устроен делитель: он режет поток на КУСКИ, торопясь отдать первый
    звук, и рвёт по запятой тоже. «Как языковая модель, я не могу вести
    переговоры.» распадается надвое, маркер остаётся в первой половине, а
    вторая — «чистая» — и есть тот самый отказ, который слышит человек.

    Поэтому испорченность запоминается: раз в реплике встретился признак,
    отвергающий её целиком, то целиком она и не звучит. Вместо неё звучит
    шаблон движка — тот же текст, что заменит пузырь на экране.
    """
    said, final = _run(monkeypatch, ["Мы готовы обсудить объём. ",
                                     "Как ассистент, я поясню. ",
                                     "Цена пока прежняя. "])
    assert not any("поясню" in s for s in said), said
    assert not any("прежняя" in s for s in said), (
        f"после испорченной фразы синтез продолжил говорить: {said}")
    assert said[-1] == "Шаблон движка.", said
    assert final == "Шаблон движка."


def test_markdown_never_reaches_the_voice(monkeypatch):
    """Синтез не должен произносить звёздочки — их слышно как заминку."""
    said, _ = _run(monkeypatch, ["**Хорошо**, давайте обсудим. "])
    assert said == ["Хорошо,", "давайте обсудим."], said
