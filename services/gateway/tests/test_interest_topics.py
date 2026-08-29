"""Темы переговоров: вопрос по теме — ВЫБОР, а не угадывание.

ЗАЧЕМ. Офлайновое вскрытие требовало попадания в `hidden_interest_keywords`, то
есть игрок обязан был НАЗВАТЬ СОДЕРЖАНИЕ СЕКРЕТА, чтобы секрет открылся. Замер
на столе `supplier`:

    «Что для вас важнее всего в этой сделке — и почему именно это?» → probe_vague
    «Что для вас важно в загрузке производства?»                    → вскрытие

С живым судьёй всё работало — он читает смысл. Без ключа главный тезис продукта
был недостижим, а инвариант 5 обещает полную играбельность без сети.

Тема — ОБЛАСТЬ, в которой интерес лежит («производство»), а не сам интерес
(«стабильная загрузка производства»). Она видна игроку на столе, поэтому вопрос
по ней осмысленное действие, а секрет остаётся секретом.
"""

from __future__ import annotations

import pytest

from app import engine
from app.engine import analyze
from app.engine.engine import _reveal_index_offline, _topic_stems
from app.engine.scenarios import SCENARIOS
from app.engine.techniques import norm

LANGS = ("ru", "en")
#: Общие вопросы об интересах — без единой темы. Ровно те, которыми продукт
#: раньше предлагал играть.
GENERIC = {
    "ru": [
        "Что для вас важнее всего в этой сделке — и почему именно это?",
        "Почему для вас это важно?",
        "Что вас больше всего беспокоит в этой сделке?",
        "Расскажите, что для вас критично.",
    ],
    "en": [
        "What matters most to you in this deal — and why exactly that?",
        "Why is that important to you?",
        "What are you really after here?",
    ],
}


@pytest.mark.parametrize("sc", SCENARIOS, ids=lambda s: s.id)
@pytest.mark.parametrize("lang", LANGS)
def test_every_table_names_a_topic_for_every_hidden_interest(sc, lang):
    topics = sc.interest_topics[lang]
    assert len(topics) == len(sc.hidden_interests[lang]) == 3, sc.id
    assert all(t.strip() for t in topics), sc.id
    # Тема НЕ ЕСТЬ интерес: совпадение слово в слово означало бы, что чип на
    # столе выдал секрет ещё до вопроса.
    for topic, interest in zip(topics, sc.hidden_interests[lang]):
        assert topic.lower() != interest.lower(), f"{sc.id}/{lang}: тема = интерес"


@pytest.mark.parametrize("sc", SCENARIOS, ids=lambda s: s.id)
@pytest.mark.parametrize("lang", LANGS)
def test_naming_a_topic_uncovers_exactly_that_interest(sc, lang):
    """Каждая тема вскрывает СВОЙ интерес и ничей чужой.

    Второе важнее первого: основы тем выводятся из ярлыков, и пересечение
    ярлыков между собой (или с ключевыми словами соседнего интереса) молча
    открывало бы игроку не тот секрет, о котором он спросил."""
    probe = ("Что для вас важно в {}?" if lang == "ru"
             else "What matters to you in {}?")
    for i, topic in enumerate(sc.interest_topics[lang]):
        line = probe.format(topic)
        assert _reveal_index_offline(sc, norm(line), lang, []) == i, \
            f"{sc.id}/{lang}: «{line}»"


@pytest.mark.parametrize("sc", SCENARIOS, ids=lambda s: s.id)
@pytest.mark.parametrize("lang", LANGS)
def test_a_topicless_question_still_uncovers_nothing(sc, lang):
    """СТАРЫЙ ЭКСПЛОЙТ НЕ ВОСКРЕС. Общий вопрос без темы вскрывать не должен —
    иначе три одинаковых «Почему?» снова открывают все три интереса, и выигрывает
    не тот, кто вскрыл интересы, а тот, кто трижды нажал кнопку."""
    for q in GENERIC[lang]:
        assert _reveal_index_offline(sc, norm(q), lang, []) is None, \
            f"{sc.id}/{lang}: «{q}» вскрыл интерес"


@pytest.mark.parametrize("lang", LANGS)
def test_three_generic_why_questions_open_nothing_and_earn_almost_no_info(lang):
    sess = engine.create_session("supplier", lang)
    for q in GENERIC[lang][:3]:
        sess.turn += 1
        engine.apply_move(sess, analyze(q), q)
    assert sess.state.interests_found == []
    # `info` — доля ВСКРЫТОГО, а не число заданных вопросов: общий вопрос несёт
    # крохи (не больше 5 за ход), сколько бы раз его ни задали.
    assert sess.state.info <= 15, sess.state.info


def test_topic_stems_keep_short_words_out():
    """Основа короче четырёх букв совпала бы с чем угодно; хвост в две буквы
    срезается ради морфологии — «оплата» обязана ловить «оплате»."""
    assert _topic_stems("Оплата") == ["опла"]
    assert _topic_stems("Срок контракта") == ["срок", "контрак"]
    # Предлоги и союзы в основы не идут.
    assert _topic_stems("Тишина и порядок") == ["тиши", "поряд"]


@pytest.mark.parametrize("lang", LANGS)
def test_the_state_carries_topics_always_and_interest_texts_only_once_uncovered(lang):
    """Второй принцип на рельсе: тема едет всегда (она не секрет), текст —
    только у вскрытых."""
    sess = engine.create_session("supplier", lang)
    sc = engine.by_id("supplier")
    slots = engine.to_state_view(sess)["interests"]
    assert [s["topic"] for s in slots] == sc.interest_topics[lang]
    assert all(s["text"] is None for s in slots), "текст секрета уехал до вскрытия"

    line = ("Что для вас важно в оплате?" if lang == "ru"
            else "What matters to you in payments?")
    sess.turn += 1
    engine.apply_move(sess, analyze(line), line)
    slots = engine.to_state_view(sess)["interests"]
    assert sess.state.interests_found == [1]
    assert slots[1]["text"] == sc.hidden_interests[lang][1]
    assert slots[0]["text"] is None and slots[2]["text"] is None
