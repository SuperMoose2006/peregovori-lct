"""Блок «Подготовка к столу» доказан прогоном, а не замыслом автора.

ЗАЧЕМ ОТДЕЛЬНЫЙ ФАЙЛ. `test_course_bank.py` доказывает форму: верный вариант
даёт заявленные приёмы, эталон проходит свой предикат, капстоун проходится
принципиальной игрой. Но блок про подготовку держится на УТВЕРЖДЕНИЯХ О ЧИСЛАХ,
которых в банке нет ни одного: «красная линия — это ноль экономики», «вы
садитесь за стол с рычагом 24», «первое слово стоит здесь пять тысяч»,
«подготовленная фишка приносит 6.0 техники против 2.8». Такое утверждение
нельзя проверить сверкой строк — только прогоном движка.

Именно на этом курс уже подводил дважды: обещанное право первого слова за
столом не существовало, а образцовый вопрос первого блока давал 5 вместо 24.
Оба раза текст был двуязычный, приёмы верные и тест зелёный — потому что тест
проверял замысел, а не поведение. Здесь проверяется поведение: каждое число
нового блока пересчитывается настоящими `create_session` / `apply_move` /
`score_session`, и правка баланса обязана валить сборку, а не тихо превращать
урок в ложь.
"""

from __future__ import annotations

import pytest

from app import engine
from app.course.bank import BY_ID
from app.course.blocks import BY_ID as BLOCK_BY_ID
from app.course.derive import derive
from app.course.simulate import run
from app.engine.scenarios import by_id
from app.engine.techniques import analyze

LANGS = ("ru", "en")
TABLE = "salary"


def _scored(deal: float, lang: str = "ru") -> dict:
    """Разбор партии, закрытой на заданной цифре. Всё остальное — по нулям.

    Экономика в `score_session` зависит только от `deal`, красной линии и
    лучшего доступного, поэтому чистая сессия с проставленным исходом — самый
    честный способ спросить у движка «сколько стоит эта цифра».
    """
    sess = engine.create_session(TABLE, lang)
    sess.state.status = "agreement"
    sess.state.deal = float(deal)
    return engine.score_session(sess)


def test_block_stands_where_the_course_says_it_does() -> None:
    """Блок последний и стоит на своём столе — на нём же его капстоун."""
    block = BLOCK_BY_ID["preparation"]
    assert block.scenario_id == TABLE
    assert BY_ID["pr-11"]["scenario_id"] == TABLE
    assert len(block.lessons) == 5


# ---- урок 1: красная линия это ноль ---------------------------------------

def test_the_red_line_is_zero_and_the_target_is_a_hundred() -> None:
    """«Красная линия — не „ещё приемлемо“, это НОЛЬ» — считает движок.

    Утверждение урока 1 и разбора `pr-02`. Проверяется тем же `score_session`,
    который выдаёт грейд за настоящую партию.
    """
    sc = by_id(TABLE)
    assert _scored(sc.player_reservation)["economic"] == 0
    assert _scored(sc.player_target)["economic"] == 100
    # И шкала между ними линейна: середина отрезка даёт половину очков.
    middle = (sc.player_reservation + sc.player_target) / 2
    assert _scored(middle)["economic"] == 50


def test_room_is_exactly_the_scale_the_lesson_promises() -> None:
    """`pr-01` — не арифметика автора: 35 выводится из сценария.

    И «каждая тысяча стоит около трёх очков» — тоже не оборот речи: сто очков
    на 35 тысяч, значит одна тысяча выше красной линии обязана дать 3.
    """
    sc = by_id(TABLE)
    room = derive("room", TABLE)
    assert room == abs(sc.player_target - sc.player_reservation) == 35
    assert BY_ID["pr-01"]["answer"]["value"] == room
    assert _scored(sc.player_reservation + 1)["economic"] == 3


@pytest.mark.parametrize("lang", LANGS)
def test_offering_the_red_line_costs_a_turn_and_buys_nothing(lang: str) -> None:
    """Плохая реплика `pr-02` обязана быть плохой ДО того, как счёт увидит цифру."""
    line = BY_ID["pr-02"]["bad_line"][lang]
    out = run(TABLE, lang, line)
    assert out["reaction"] == "neutral"
    assert all(delta == 0 for delta in out["deltas"].values()), out["deltas"]
    # А сама цифра — ноль экономики из ста.
    assert _scored(by_id(TABLE).player_reservation, lang)["economic"] == 0


# ---- урок 2: BATNA отрабатывает до стола ----------------------------------

def test_starting_leverage_is_the_only_place_batna_strength_shows_up() -> None:
    """«Вы садитесь за стол с рычагом 24» — берётся у `create_session`.

    Это единственный след силы альтернативы в счёте: за столом её произнесение
    стоит одинаково на любом столе, что проверяет тест ниже.
    """
    sc = by_id(TABLE)
    leverage = derive("batna_leverage", TABLE)
    assert leverage == engine.create_session(TABLE).state.leverage
    assert leverage == round(sc.player_batna.strength * 0.4, 4) == 24
    assert BY_ID["pr-03"]["answer"]["value"] == leverage


@pytest.mark.parametrize("lang", LANGS)
def test_naming_the_alternative_costs_tension_first(lang: str) -> None:
    """`pr-04`: вежливо названная альтернатива двигает НАПРЯЖЕНИЕ сильнее рычага.

    Ответ упражнения вычисляет движок (`test_generated_answer_matches_engine`),
    здесь проверяются числа, которые называет разбор, — и то, что реакция
    «под давлением» приходит независимо от тона.
    """
    out = run(TABLE, lang, BY_ID["pr-04"]["player_line"][lang])
    assert out["deltas"]["leverage"] == 10
    assert out["deltas"]["tension"] == 14
    assert out["reaction"] == "pressured"


@pytest.mark.parametrize("lang", LANGS)
def test_a_backed_alternative_swaps_tension_for_leverage(lang: str) -> None:
    """Вторая половина урока 2: с опорой — рычаг +18 и напряжение всего +4.

    Опора здесь — объективный критерий, поэтому рычага набегает 40: свои +16 за
    критерий, +6 за то, что собеседник аналитик, и +18 за саму альтернативу.
    Ровно так урок и написан.
    """
    backed = {
        "ru": "У меня есть альтернативное предложение на 210k, и по медиане независимых "
              "обзоров зарплат для этой роли это рынок, а не мой каприз.",
        "en": "I have an alternative offer at 210k, and independent salary surveys put the "
              "median for this role exactly there — that is the market, not my wish.",
    }[lang]
    assert {"batna", "objective_criteria"} <= set(analyze(backed).moves)
    out = run(TABLE, lang, backed)
    assert out["deltas"]["tension"] == 4
    assert out["deltas"]["leverage"] == 16 + 6 + 18


# ---- урок 3: гипотеза проверяется попаданием в тему ------------------------

@pytest.mark.parametrize("lang", LANGS)
def test_a_hypothesis_pays_twentyfour_only_when_it_hits_its_topic(lang: str) -> None:
    """«Попал — +24, не попал — переспрос и +5». Обе половины прогоном.

    Второй случай — та самая `probe_vague`, о которой говорит урок: реакция не
    со шкалы теплоты, а просьба уточнить.
    """
    on_topic = BY_ID["pr-05"]["options"][BY_ID["pr-05"]["answer"]][lang]
    hit = run(TABLE, lang, on_topic)
    assert hit["deltas"]["info"] == 24
    assert hit["reaction"] == "opened_up"

    vague = {"ru": "Что для вас важнее всего в этом разговоре?",
             "en": "What matters most to you in this conversation?"}[lang]
    # Форма та же — приём тот же; не хватает только слов темы.
    assert "interests_probe" in analyze(vague).moves
    miss = run(TABLE, lang, vague)
    assert miss["deltas"]["info"] == 5
    assert miss["reaction"] == "probe_vague"


# ---- урок 4: право первого слова ------------------------------------------

@pytest.mark.parametrize("lang", LANGS)
def test_the_first_word_is_worth_five_thousand_at_this_table(lang: str) -> None:
    """«Со 180 сразу на 205 против 200 вторым ходом» — прогоном, а не на слово.

    Курс уже обещал право первого слова, которого в игре не было. Поэтому здесь
    играются ОБА хода одной и той же репликой: разница между ними и есть цена
    первого слова, названная в уроке 4 и в разборе `pr-07`.
    """
    line = BY_ID["pr-08"]["reference"][lang]

    first = engine.create_session(TABLE, lang)
    first.turn = 1
    engine.apply_move(first, analyze(line), line)

    second = engine.create_session(TABLE, lang)
    second.turn = 2
    engine.apply_move(second, analyze(line), line)

    assert first.metrics.opening_anchor is True
    assert second.metrics.opening_anchor is False
    assert first.state.offer_opp == 205
    assert second.state.offer_opp == 200
    assert first.state.offer_opp - second.state.offer_opp == 5


def test_a_bare_number_moves_no_frame() -> None:
    """Дистрактор `pr-07` — не «слабее», а не работает: без критерия рамки нет."""
    bare = BY_ID["pr-07"]["options"][0]["ru"]
    moves = set(analyze(bare).moves)
    assert "anchor" in moves and "objective_criteria" not in moves
    sess = engine.create_session(TABLE, "ru")
    sess.turn = 1
    engine.apply_move(sess, analyze(bare), bare)
    assert sess.metrics.opening_anchor is False
    assert sess.state.offer_opp == sess.state.frame_open == 180


def test_the_first_word_is_worth_six_points_of_technique() -> None:
    """+6 к «Приёмам» — то самое слагаемое, ради которого приём вообще считается."""
    line = BY_ID["pr-08"]["reference"]["ru"]
    scores = []
    for turn in (1, 2):
        sess = engine.create_session(TABLE, "ru")
        sess.turn = turn
        engine.apply_move(sess, analyze(line), line)
        # Исход одинаковый у обеих партий: сравниваем ТОЛЬКО технику.
        sess.state.status = "agreement"
        sess.state.deal = 230.0
        scores.append(engine.score_session(sess)["technique"])
    assert scores[0] - scores[1] == 6


# ---- урок 5: размен готовят заранее ---------------------------------------

def test_the_prepared_chip_pays_six_and_the_other_one_pays_less() -> None:
    """`pr-09`: 6.0 против 2.8 — разница считается движком, а не формулой урока.

    Две партии, различающиеся ТОЛЬКО названной фишкой: всё остальное состояние
    выставлено одинаково, поэтому вся разница техники — это слагаемое `package`.
    """
    # Ход с критерием — чтобы техника меряла разницу НЕ У НУЛЯ: на нуле её
    # нижняя граница совпала бы с зажимом `clamp`, и тест доказывал бы зажим.
    opener = BY_ID["pr-08"]["reference"]["ru"]

    def technique(*terms: str) -> int:
        sess = engine.create_session(TABLE, "ru")
        sess.turn = 1
        engine.apply_move(sess, analyze(opener), opener)
        sess.state.status = "agreement"
        sess.state.deal = 230.0
        sess.state.terms_conceded = list(terms)
        return engine.score_session(sess)["technique"]

    base = technique()
    assert base > 0, "нижняя точка сравнения обязана быть не на зажиме"
    assert technique("kpi_review") - base == 6
    assert technique("signing_bonus") - base == 3  # 2.8, округление движка
    assert derive("best_chip_package", TABLE) == 6.0
    assert BY_ID["pr-09"]["answer"]["value"] == derive("best_chip_package", TABLE)


@pytest.mark.parametrize("lang", LANGS)
def test_naming_the_chip_is_what_moves_trust_and_price(lang: str) -> None:
    """Разбор `pr-10`: названная фишка даёт +6 доверия СВЕРХ +6 за сам размен.

    И это же отличает размен от уступки: у безымянной доброжелательности нет ни
    доверия сверху, ни движения цены.
    """
    named = BY_ID["pr-10"]["reference"][lang]
    out = run(TABLE, lang, named)
    assert out["deltas"]["trust"] == 6 + (3 + 4 * 0.75)
    assert out["reaction"] == "collaborated"

    sess = engine.create_session(TABLE, lang)
    sess.turn = 1
    engine.apply_move(sess, analyze(named), named)
    assert sess.state.terms_conceded == ["kpi_review"]
