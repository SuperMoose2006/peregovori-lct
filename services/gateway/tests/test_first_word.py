"""Право первого слова: приём, которому учит курс, исполним за столом.

ЧТО БЫЛО СЛОМАНО. Блок «Якорь» учит ставить свой первый номер: упражнение
`an-07` начинается словами «Вы приехали первым и говорите первым», а `an-10`
требует произнести якорь своими словами. В партии этой ситуации не было НИ
РАЗУ: `views.greeting_line` открывал торг цифрой оппонента на всех девяти
столах, и игроку оставалось только защищаться. Приём был доказан против движка
как реплика — и невозможен как ХОД. Инвариант 9 требует обратного.

Здесь проверяется вся дуга: приветствие молчит о цифре, эталонный ответ
упражнения ставит рамку, рамку двигает только обоснованный якорь, право первого
слова тратится один раз, и никакой якорь не проводит оппонента за его дно
(инвариант 1). Тест офлайновый, как и весь курс: `conftest.py` ставит
`NEGO_AI=off`, судья в этом не участвует.
"""

from __future__ import annotations

import pytest

from app import engine, views
from app.course.bank import BANK
from app.engine import analyze, by_id

LANGS = ("ru", "en")
ITEMS = {item["id"]: item for item in BANK}

#: Обоснованный якорь на любом столе: приём «якорение» + внешний критерий +
#: число. Формулировки — те же, что курс предлагает игроку в `an-07`/`an-10`,
#: только цифра подставляется под шкалу конкретного стола.
GROUNDED = {
    "ru": "Мы предлагаем {n}: по рыночным данным медиана независимых оценок именно такая, потому что это отраслевой стандарт.",
    "en": "We propose {n}: independent market data puts the median exactly there, because that is the industry standard.",
}


def _fresh(scenario_id: str, lang: str) -> engine.Session:
    sess = engine.create_session(scenario_id, lang)
    sess.turn += 1
    return sess


def _play_line(sess: engine.Session, line: str):
    return engine.apply_move(sess, analyze(line), line)


def _correct_option(item: dict, lang: str) -> str:
    return item["options"][item["answer"]][lang]


def _reference(item: dict, lang: str) -> str:
    """Эталонный ответ пункта — свободный текст или верный вариант выбора."""
    if item["type"] == "freeform":
        return item["reference"][lang]
    return _correct_option(item, lang)


# ---- 1. Первое слово вообще существует --------------------------------------

@pytest.mark.parametrize("lang", LANGS)
@pytest.mark.parametrize("sc", engine.SCENARIOS, ids=lambda s: s.id)
def test_the_greeting_does_not_open_the_bargaining_with_a_number(sc, lang: str) -> None:
    """Оппонент здоровается — и отдаёт первое слово игроку.

    Цифры в приветствии быть не должно вовсе: не только его собственной, но и
    никакой другой, иначе «кто назвал первым» снова решает не игрок.
    """
    sess = engine.create_session(sc.id, lang)
    greeting = views.greeting_line(sess, lang)
    assert greeting.startswith("Здравствуйте" if lang == "ru" else "Hello"), greeting
    assert not any(ch.isdigit() for ch in greeting), (
        f"{sc.id}/{lang}: приветствие открывает торг цифрой — {greeting}"
    )


# ---- 2. Эталонный ответ упражнения работает КАК ХОД --------------------------

@pytest.mark.parametrize("lang", LANGS)
@pytest.mark.parametrize("item_id", ["an-07", "an-10"])
def test_the_course_anchor_is_playable_as_a_first_move(item_id: str, lang: str) -> None:
    """Ответ упражнения про якорь, сыгранный ПЕРВЫМ ходом, ставит рамку."""
    item = ITEMS[item_id]
    line = _reference(item, lang)
    a = analyze(line)
    assert "anchor" in a.moves and "objective_criteria" in a.moves, (item_id, lang, a.moves)

    sess = _fresh(item["scenario_id"], lang)
    sc = by_id(item["scenario_id"])
    opened = sess.state.offer_opp
    result = _play_line(sess, line)

    assert sess.state.offer_player is not None, "якорь игрока не попал на стол"
    assert sess.metrics.opening_anchor, "приём «первое слово» не засчитан"
    assert result.reaction == "persuaded", result.reaction
    # Рамка уехала к игроку и там осталась: дальше торг считается от неё.
    moved = ((opened - sess.state.frame_open) if sess.lower_better
             else (sess.state.frame_open - opened))
    assert moved > 0, f"{item_id}/{lang}: рамка не сдвинулась ({sess.state.frame_open})"
    assert sess.state.offer_opp != opened
    if sess.lower_better:
        assert sess.state.offer_opp >= sc.opponent_reservation - 1e-9
    else:
        assert sess.state.offer_opp <= sc.opponent_reservation + 1e-9


@pytest.mark.parametrize("lang", LANGS)
def test_the_first_word_beats_the_same_line_played_second(lang: str) -> None:
    """Та же реплика вторым ходом стоит дешевле — первое слово тратится один раз."""
    line = _reference(ITEMS["an-10"], lang)
    first = _fresh("used_car", lang)
    _play_line(first, line)

    second = _fresh("used_car", lang)
    warmup = {"ru": "Здравствуйте, рад встрече.", "en": "Hello, nice to meet you."}[lang]
    _play_line(second, warmup)
    second.turn += 1
    _play_line(second, line)

    assert second.metrics.opening_anchor is False, "право первого слова потрачено дважды"
    assert first.state.offer_opp < second.state.offer_opp, (
        f"первое слово не дало ничего: {first.state.offer_opp} против {second.state.offer_opp}"
    )


@pytest.mark.parametrize("lang", LANGS)
def test_the_first_word_shows_up_in_the_technique_score(lang: str) -> None:
    """Приём, который ничего не стоит в счёте, курс объявлять не вправе."""
    anchored = _fresh("used_car", lang)
    _play_line(anchored, _reference(ITEMS["an-10"], lang))
    # Тот же критерий и то же число, но БЕЗ заявления позиции: `an-03` — это
    # защита от чужого якоря, приёма «якорение» в нём нет.
    plain = _fresh("used_car", lang)
    _play_line(plain, _reference(ITEMS["an-03"], lang))

    assert anchored.metrics.opening_anchor and not plain.metrics.opening_anchor
    assert (engine.score_session(anchored)["technique"]
            > engine.score_session(plain)["technique"])


# ---- 3. Рамку двигает обоснование, а не наглость ----------------------------

@pytest.mark.parametrize("lang", LANGS)
def test_the_wrong_options_of_the_exercise_do_not_move_the_frame(lang: str) -> None:
    """Дистракторы `an-07` — ультиматум и две попытки отдать первое слово."""
    item = ITEMS["an-07"]
    for idx, option in enumerate(item["options"]):
        if idx == item["answer"]:
            continue
        sess = _fresh(item["scenario_id"], lang)
        _play_line(sess, option[lang])
        assert not sess.metrics.opening_anchor, (idx, option[lang])
        assert sess.state.frame_open == by_id(item["scenario_id"]).opponent_open


def test_a_bare_anchor_moves_nothing() -> None:
    """«Наша цена 86.» — приём есть, критерия нет: рамка стоит.

    Это первая реплика партии `haggling` из `games.json`. Урок 2 блока «Якорь»
    держится ровно на этой разнице, и здесь она замерена, а не заявлена.
    """
    sess = _fresh("supplier", "ru")
    _play_line(sess, "Наша цена 86.")
    assert not sess.metrics.opening_anchor
    assert sess.state.offer_opp == by_id("supplier").opponent_open


@pytest.mark.parametrize("lang", LANGS)
@pytest.mark.parametrize("sc", engine.SCENARIOS, ids=lambda s: s.id)
def test_no_first_anchor_walks_the_opponent_past_their_floor(sc, lang: str) -> None:
    """ИНВАРИАНТ 1 старше любой рамки — на всех столах и обоих языках.

    Якорь ставится заведомо ЗА дном оппонента: половина размаха дальше, чем он
    вообще способен пойти. Рамка обязана остановиться на дне.
    """
    span = abs(sc.opponent_open - sc.opponent_reservation)
    lower = sc.headline.dir == "lower_is_better"
    beyond = sc.opponent_reservation + (-0.5 * span if lower else 0.5 * span)
    line = GROUNDED[lang].format(n=round(beyond, 2))

    sess = _fresh(sc.id, lang)
    _play_line(sess, line)
    if lower:
        assert sess.state.offer_opp >= sc.opponent_reservation - 1e-9, (
            f"{sc.id}/{lang}: рамка провела оппонента под дно {sc.opponent_reservation}"
        )
    else:
        assert sess.state.offer_opp <= sc.opponent_reservation + 1e-9, (
            f"{sc.id}/{lang}: рамка провела оппонента за дно {sc.opponent_reservation}"
        )


#: Тот же якорь ОТ ПЕРВОГО ЛИЦА. Упражнение `an-10` просит произнести приём
#: своими словами, а словарь знал только «мы»: «я предлагаю 1080, потому что по
#: рынку столько» приёма не получала вовсе — то есть правильный ответ курса,
#: сказанный чуть иначе, в игре не работал.
FIRST_PERSON = {
    "ru": [
        "Я предлагаю 1080, потому что по рыночным данным медиана независимых объявлений именно такая.",
        "Моя цена 1080: по рыночным данным медиана независимых объявлений именно такая.",
    ],
    "en": [
        "I propose 1080, because independent market listings put the median exactly there.",
        "My price is 1080: independent market data puts the median exactly there.",
    ],
}


@pytest.mark.parametrize("lang", LANGS)
def test_the_same_anchor_in_the_first_person_also_counts(lang: str) -> None:
    for line in FIRST_PERSON[lang]:
        a = analyze(line)
        assert "anchor" in a.moves, (lang, line, a.moves)
        sess = _fresh("used_car", lang)
        _play_line(sess, line)
        assert sess.metrics.opening_anchor, (lang, line)


@pytest.mark.parametrize("lang", LANGS)
def test_an_outrageous_anchor_drags_the_frame_no_further_than_a_grounded_one(lang: str) -> None:
    """Наглость не выигрывает у обоснованности: потолок сдвига один на двоих.

    Без потолка «мы предлагаем 700» тянуло бы рамку впятеро сильнее, чем
    обоснованные 1080, и урок «цифра стоит на критерии» читался бы как
    «называй меньше».
    """
    frames = []
    for number in (1080, 700):
        sess = _fresh("used_car", lang)
        _play_line(sess, GROUNDED[lang].format(n=number))
        assert sess.metrics.opening_anchor, number
        frames.append(sess.state.frame_open)
    assert frames[0] == frames[1], frames
