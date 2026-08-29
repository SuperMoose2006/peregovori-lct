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


@pytest.mark.parametrize("sc", SCENARIOS, ids=lambda s: s.id)
@pytest.mark.parametrize("lang", LANGS)
def test_every_keyword_uncovers_its_own_interest(sc, lang):
    """Не только ярлык темы, но и КАЖДОЕ ключевое слово ведёт к своему секрету.

    Тест выше проверял темы — по одной на интерес, три сравнения на стол. Этого
    мало: вскрытие идёт по списку сверху вниз и останавливается на первом
    совпадении — своя тема ИЛИ своё слово. Значит ярлык, стоящий выше, способен
    молча съесть слово соседнего интереса, и три сравнения этого не увидят.

    Так и было на `rent`/en: тема «Finding tenants» давала основу «tenan» и
    забирала себе «quiet tenant», «tidy tenant», «reliable tenant», «decent
    tenant» — четыре слова из семи у ВТОРОГО интереса. Спросив по-английски про
    тихого жильца, игрок получал секрет про простой, о котором не спрашивал, а
    чип «Peace and quiet» при этом не работал. По-русски «жильцов» и «жилец»
    расходятся морфологией, поэтому дефект жил на одном языке и был невидим.
    Прибор — `tools/scenario_audit.py`.
    """
    probe = ("Почему для вас важно {}?" if lang == "ru"
             else "Why does {} matter to you?")
    for i, words in enumerate(sc.hidden_interest_keywords[lang]):
        for word in words:
            line = probe.format(word)
            assert _reveal_index_offline(sc, norm(line), lang, []) == i, \
                f"{sc.id}/{lang}: слово «{word}» ведёт не к интересу {i}"


@pytest.mark.parametrize("sc", SCENARIOS, ids=lambda s: s.id)
@pytest.mark.parametrize("lang", LANGS)
def test_keywords_survive_normalisation(sc, lang):
    """Слово из словаря обязано совпадать с `norm` самого себя.

    Совпадение ищется подстрокой в УЖЕ нормализованной реплике, а слово из
    словаря не нормализуется ничем. Значит апостроф или лишний пробел делают
    запись мёртвой навсегда — и мёртвой молча: список выглядит богатым, а
    работает наполовину. Так лежало `can't sustain`: `norm` меняет апостроф на
    пробел, и строка не совпадала ни с чем никогда.
    """
    for i, words in enumerate(sc.hidden_interest_keywords[lang]):
        for word in words:
            assert norm(word) == word, f"{sc.id}/{lang}/интерес {i}: «{word}»"
    for iss in sc.secondary_issues:
        for word in iss.keywords[lang]:
            assert norm(word) == word, f"{sc.id}/{lang}/{iss.id}: «{word}»"
