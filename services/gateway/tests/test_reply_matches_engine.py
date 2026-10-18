"""Реплика оппонента не обещает того, чего движок не дал.

Аудит 17.10, F05. Ежедневный стол SLA: движок сдвинулся 99 → 99,2, а модель
ответила «Дам 99,7% … по рукам» — эхом числа игрока. Игрок соглашался на 99,7,
движок честно отказывал (закрытие сравнивается с ЕГО числом), напряжение росло.
Текст и состояние партии расходились, а прав по первому принципу всегда движок.

Промпт это теперь запрещает, но промпт — не гарантия. Гарантия — проверка
`sanitize.contradicts` до показа и до синтеза: реплика, спорящая со столом,
заменяется шаблоном движка, и в голосе её не слышно.
"""
from __future__ import annotations

import asyncio
import types

import pytest

from app.ai.prompts import build_system
from app.ai.sanitize import contradicts
from app.orchestrator import negotiation as neg

SLA = {"scenario_id": "sla_renewal", "status": "active", "offer_opp": 99.2, "deal": None,
       "offer_history": [99.0, 99.2], "player_text": "Предлагаю 99,7% аптайма. Что для вас важно?"}
SUPPLIER = {"scenario_id": "supplier", "status": "active", "offer_opp": 95.0, "deal": None,
            "offer_history": [97.0, 95.0, 100.0], "player_text": "Готовы на 86 рублей за штуку"}


@pytest.mark.parametrize("facts,line", [
    (SLA, "Дам 99,7% аптайма, и по рукам."),          # реплика аудита
    (SLA, "Дам 99,7% аптайма."),                       # обещание без закрытия
    (SLA, "Договорились. Что скажете?"),               # вопрос в ДРУГОМ предложении
    (SUPPLIER, "Ладно, 90 рублей."),
    (SUPPLIER, "Ваши 86 — нереально."),                # число игрока без своего
    ({**SUPPLIER, "status": "agreement", "deal": 92.0}, "По рукам, 88 за штуку."),
])
def test_a_line_promising_what_the_engine_did_not_give_is_rejected(facts, line):
    assert contradicts(line, facts)


@pytest.mark.parametrize("facts,line", [
    (SLA, "Пока стоим на 99,2%, цифры есть цифры."),
    (SLA, "Ну что, 99,2% — по рукам?"),                # предложение сделки вопросом
    (SLA, "99,7% — это вы загнули, могу 99,2%."),      # число игрока рядом со своим
    (SUPPLIER, "Ваши 86 — нереально, могу 95."),
    (SUPPLIER, "Я начинал со 100, сейчас 95."),
    (SUPPLIER, "Предоплата 50% нам интересна, но 95 пока держу."),  # процент — не цена
    (SUPPLIER, "Рынок 88-92, а у меня 95."),           # диапазон — ориентир
    (SUPPLIER, "Сто рублей — это моя цена была на старте."),         # хуже для игрока
    ({**SUPPLIER, "status": "agreement", "deal": 92.0}, "По рукам, 92 за штуку."),
])
def test_a_line_that_agrees_with_the_table_passes(facts, line):
    assert not contradicts(line, facts)


def test_without_table_facts_nothing_is_judged():
    """Вызов без стола (старые пути, тесты) не отвергает ничего — проверка
    не придумывает фактов, которых ей не дали."""
    assert not contradicts("Дам 99,7% и по рукам.", {})


# ---- Поток: экран и уши -----------------------------------------------------

class _RecordingTTS:
    def __init__(self) -> None:
        self.said: list[str] = []

    def speak(self, text, generation_id=None, turn_id=None):  # noqa: D102
        self.said.append(text)


class _Bus:
    def __init__(self) -> None:
        self.events: list[dict] = []

    def publish(self, ev) -> None:
        self.events.append(ev)


def _run(monkeypatch, chunks: list[str], facts: dict, templated: str = "Шаблон движка."):
    orc = neg.NegotiationOrchestrator.__new__(neg.NegotiationOrchestrator)
    sess = types.SimpleNamespace(bus=_Bus(), spoken_so_far="",
                                 engine_session=types.SimpleNamespace(log=[]))
    sess.begin_generation = lambda: "gen-1"
    orc.session = sess
    orc.tts = _RecordingTTS()
    orc.avatar = None
    orc._generation_task = None
    orc.on_speaking_change = None

    async def fake_stream(system, user, role=None, max_tokens=None, temperature=None):
        for c in chunks:
            yield c

    monkeypatch.setattr(neg.orchat, "stream", fake_stream)
    monkeypatch.setattr(neg, "build_prompts", lambda facts: ("s", "u"))
    monkeypatch.setattr(neg.NegotiationOrchestrator, "_finish_generation", lambda self: None)
    asyncio.run(orc._stream_opponent(facts, templated, turn_id=1))
    done = [e for e in sess.bus.events if isinstance(e, dict) and e.get("type") == "response.done"]
    return orc.tts.said, done[-1]["text"]


def test_the_audit_reply_is_neither_shown_nor_spoken(monkeypatch):
    said, final = _run(monkeypatch, ["Дам 99,7% аптайма,", " и по рукам."], SLA)
    assert final == "Шаблон движка."
    assert not any("99,7" in s for s in said), f"обещание ушло в синтез: {said}"
    assert said == ["Шаблон движка."], said


def test_a_reply_true_to_the_table_streams_as_is(monkeypatch):
    said, final = _run(monkeypatch, ["Пока стою на 99,2%,", " цифры есть цифры."], SLA)
    assert final == "Пока стою на 99,2%, цифры есть цифры."
    assert "Шаблон движка." not in said


# ---- Промпт -----------------------------------------------------------------

def _tough(lang: str, status: str = "active") -> str:
    return build_system({"lang": lang, "persona_name": "Вера", "persona_desc": "x", "style": "tough",
                         "offer_opp": 99.2, "unit": "% аптайм", "mood": "m", "status": status})


def test_the_tough_persona_is_no_longer_taught_to_say_deal():
    assert "по рукам»." not in _tough("ru").split("Факты")[0]
    assert "shake on it\"." not in _tough("en").split("Hard facts")[0]


def test_the_prompt_forbids_other_terms_and_a_deal_that_is_not_there():
    ru, en = _tough("ru"), _tough("en")
    assert "ТОЛЬКО 99.2% аптайм" in ru and "НЕ заключена" in ru
    assert "ONLY terms you state as yours are 99.2% аптайм" in en and "NO deal yet" in en
    assert "НЕ заключена" not in _tough("ru", "agreement")


def test_facts_carry_the_table_for_the_check():
    from app import engine, views

    sess = engine.create_session("supplier", "ru")
    line = "Добрый день! Что для вас важно в этом контракте?"
    result = engine.apply_move(sess, engine.analyze(line), line)
    facts = views.build_facts(sess, result)
    assert facts["scenario_id"] == "supplier"
    assert facts["deal"] is None
    assert 100 in facts["offer_history"]


# ---- Делитель потока не режет число -------------------------------------------

@pytest.mark.parametrize("chunks,want", [
    (["Дам 99,7% аптайма,", " и по рукам."], ["Дам 99,7% аптайма,", "и по рукам."]),
    (["Дам 99", ",", "7% аптайма, и по рукам."], ["Дам 99,7% аптайма,", "и по рукам."]),
    (["I can give 99", ".", "7% uptime. That's final."], ["I can give 99.7% uptime.", "That's final."]),
    (["Да, 99, и всё."], ["Да,", "99, и всё."]),
    (["Цена 89."], ["Цена 89."]),
])
def test_the_divider_keeps_decimal_numbers_whole(chunks, want):
    """Первая фраза резалась по ЛЮБОЙ запятой: «Дам 99,7%» звучало как «Дам
    99,» и «7%», а итог склеивался в «99, 7%». То же с точкой, когда модель
    отдаёт «99», «.», «7» отдельными лексемами."""
    from app.vendor.olv.sentence_divider import SentenceDivider

    async def gen():
        for c in chunks:
            yield c

    async def run():
        d = SentenceDivider(faster_first_response=True)
        return [s.text async for s in d.process_stream(gen())]

    assert asyncio.run(run()) == want
