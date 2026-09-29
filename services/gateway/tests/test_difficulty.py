"""Сложность стола обязана что-то ЗНАЧИТЬ.

ЗАЧЕМ ЭТОТ ФАЙЛ. `difficulty` (2..5) рисовалась точками на всех восьми
карточках выбора — и не читалась движком нигде: `views.py` прокидывал её
наружу, а `apply_move`/`flexibility`/`score_session` про неё не знали. Инвестор
«5 из 5» уступал по ровно той же формуле, что поставщик «2 из 5». Это ровно то
четвёртое состояние, которого второй принцип CLAUDE.md не разрешает:
интерфейс заявляет свойство, которого в игре нет.

Здесь проверяется, что свойство появилось — и что оно СКРОМНОЕ: сложность
меняет ПОВЕДЕНИЕ оппонента (скорость уступки, порог открытости), а не формулу
`overall = 0.4·economic + 0.25·relationship + 0.35·technique` и не грейд как
таковой. Инвариант 2 (принципиальная игра → A/B на всех восьми столах)
проверяет test_reference_games.py, инвариант 9 — test_course_bank.py.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app import engine
from app.engine import analyze, by_id

FIXTURE = (Path(__file__).resolve().parents[3]
           / "frontend" / "test" / "fixtures" / "games.json")
GAMES = json.loads(FIXTURE.read_text(encoding="utf-8"))
PRINCIPLED = {k: v for k, v in GAMES["principled"].items() if k != "note"}


def play(scenario_id: str, msgs: list[str], lang: str = "ru",
         difficulty: int | None = None):
    """Партия тем же циклом, что в test_reference_games.play.

    `difficulty` подменяет сложность СЕССИИ, не сценария: так стол остаётся тем
    же самым — та же ZOPA, тот же персонаж, те же ключевые слова интересов, — и
    единственной изменившейся величиной остаётся сложность.
    """
    sess = engine.create_session(scenario_id, lang)
    if difficulty is not None:
        sess.difficulty = difficulty
    for text in msgs:
        if sess.state.status != "active":
            break
        sess.turn += 1
        engine.apply_move(sess, analyze(text), text)
        if sess.state.status == "active" and sess.turn >= sess.max_turns:
            sess.state.status = "breakdown"
    return sess, engine.score_session(sess)


def test_session_carries_the_scenario_difficulty() -> None:
    """Сложность обязана доехать от каталога до партии, иначе читать нечего."""
    for sid in ("supplier", "salary", "conflict", "investor"):
        assert engine.create_session(sid, "ru").difficulty == by_id(sid).difficulty


#: Голое согласие: «беру то, что лежит на столе». Закрытие БЕЗ своей цифры —
#: единственный способ измерить, докуда оппонента довели: когда игрок называет
#: собственную цель, сделка фиксируется на ней, и `economic` меряет уже не
#: уступчивость оппонента, а смелость запроса.
BARE_CLOSE = {"ru": "Договорились.", "en": "Deal, agreed."}


def truncated(scenario_id: str, lang: str = "ru", turns: int = 4) -> list[str]:
    """Принципиальная партия, оборванная на `turns`-м ходу и закрытая по столу.

    Полная эталонная стенограмма закрывается на ЦЕЛИ игрока (86 у поставщика,
    18 % у инвестора), а к шестому ходу оппонент успевает уйти ниже неё при любой
    сложности — `economic` упирается в потолок и перестаёт что-либо различать.
    Обрыв на четвёртом ходу оставляет цену там, куда её довели, и голое
    согласие фиксирует именно её.
    """
    return PRINCIPLED[scenario_id][lang][:turns] + [BARE_CLOSE[lang]]


def test_difficulty_is_read_by_the_engine_at_all() -> None:
    """Главный замер этой правки: подмена сложности МЕНЯЕТ исход партии.

    До правки этот тест был красным: одна и та же стенограмма на одном и том же
    столе давала одинаковый результат при любой difficulty, потому что движок
    её не читал вовсе. Сравниваются цена на столе и итоговый балл — если
    сложность не влияет ни на то, ни на другое, она не влияет ни на что.
    """
    lines = truncated("investor")
    easy_sess, easy = play("investor", lines, "ru", difficulty=2)
    hard_sess, hard = play("investor", lines, "ru", difficulty=5)
    assert easy_sess.state.offer_opp != hard_sess.state.offer_opp, (
        "цена на столе одинакова при difficulty 2 и 5 — сложность не читается"
    )
    assert easy["overall"] > hard["overall"], (
        f"итог одинаков или выше у трудного стола ({easy['overall']} против "
        f"{hard['overall']}) — точки на карточке по-прежнему ничего не значат"
    )


#: Столы для замера монотонности. Оба — `lower_is_better`, и это условие
#: честности сравнения: `economic` считается как доля пути от красной линии к
#: цели, и у стола с обратным направлением та же уступка оппонента двигает эту
#: долю в другую сторону. Внутри каждого стола сравниваются партии одной и той
#: же стенограммой при разной сложности — сравнивать ДВА РАЗНЫХ стола между
#: собой было бы нечестно: у них разная ширина ZOPA, разный персонаж и разные
#: ключевые слова интересов, и разница в баллах измеряла бы их, а не сложность.
MONOTONE_TABLES = ("supplier", "investor")
DIFFICULTIES = (2, 3, 4, 5)


@pytest.mark.parametrize("scenario_id", MONOTONE_TABLES)
def test_harder_table_never_scores_higher_on_the_same_transcript(scenario_id: str) -> None:
    lines = truncated(scenario_id)
    scores = {d: play(scenario_id, lines, "ru", difficulty=d)[1]["overall"]
              for d in DIFFICULTIES}
    for lo, hi in zip(DIFFICULTIES, DIFFICULTIES[1:]):
        assert scores[lo] >= scores[hi], (
            f"{scenario_id}: сложность {hi} ({scores[hi]}) оценена выше, "
            f"чем {lo} ({scores[lo]}) — монотонность перевернулась: {scores}"
        )
    assert scores[5] < scores[2], (
        f"{scenario_id}: самый трудный стол ({scores[5]}) не строго ниже "
        f"самого лёгкого ({scores[2]}) — разница не различима: {scores}"
    )


@pytest.mark.parametrize("scenario_id", MONOTONE_TABLES)
def test_harder_table_concedes_less_ground(scenario_id: str) -> None:
    """Точка приложения №1 видна в ЦИФРЕ НА СТОЛЕ, а не только в балле."""
    sc = by_id(scenario_id)
    span = abs(sc.opponent_open - sc.opponent_reservation)
    walked = {}
    for d in DIFFICULTIES:
        sess, _ = play(scenario_id, PRINCIPLED[scenario_id]["ru"], "ru", difficulty=d)
        walked[d] = abs(sess.state.offer_opp - sc.opponent_open) / span
    for lo, hi in zip(DIFFICULTIES, DIFFICULTIES[1:]):
        assert walked[lo] >= walked[hi], (
            f"{scenario_id}: трудный стол прошёл больше пути к своему дну: {walked}"
        )


def test_difficulty_never_lets_the_opponent_cross_the_floor() -> None:
    """Инвариант 1 не отменяется ни на каком коэффициенте сложности.

    Лёгкий стол уступает щедрее — значит множитель сложности обязан оставаться
    множителем к ДОЛЕ пути до дна, а не прибавкой к цене.
    """
    for sid in sorted(PRINCIPLED):
        sc = by_id(sid)
        for d in (1, 2, 3, 4, 5):
            sess, _ = play(sid, PRINCIPLED[sid]["ru"], "ru", difficulty=d)
            if sc.headline.dir == "lower_is_better":
                assert sess.state.offer_opp >= sc.opponent_reservation - 0.001, (sid, d)
            else:
                assert sess.state.offer_opp <= sc.opponent_reservation + 0.001, (sid, d)


@pytest.mark.parametrize("scenario_id,opening_quote", [("salary", 205.0),
                                                       ("candidate_offer", 235.0)])
def test_finer_price_grid_never_turns_a_concession_into_a_retraction(
        scenario_id: str, opening_quote: float) -> None:
    """Крупная сетка 5 оставляет нечётную цену, мелкая сетка 2 её не содержит.

    Раньше маленькая положительная уступка при смене сетки округлялась НАЗАД:
    зарплата 205 → 204, цена кандидата 235 → 236. Продолжение торга не должно
    отзывать предложение; большой заработанный шаг при этом обязан работать.
    """
    from app.engine import engine as core

    sess = engine.create_session(scenario_id, "ru")
    sess.turn = 1
    greeting = "Здравствуйте."
    engine.apply_move(sess, analyze(greeting), greeting)
    assert sess.ledger  # Следующая уступка использует сетку продолжения торга.
    sess.state.offer_opp = opening_quote
    sc = by_id(scenario_id)
    assert core.price_step(sc, opening=True) == 5
    assert core.price_step(sc) == 2

    core._concede(sess, 0.02)
    assert sess.state.offer_opp == opening_quote, (
        f"{scenario_id}: маленькая уступка отозвала предложение "
        f"{opening_quote} → {sess.state.offer_opp}")

    core._concede(sess, 0.20)
    if sess.lower_better:
        assert sc.opponent_reservation <= sess.state.offer_opp < opening_quote
    else:
        assert opening_quote < sess.state.offer_opp <= sc.opponent_reservation


# ---- Точка приложения №2: порог доверия для вскрытия интереса ---------------

#: Вопрос, попадающий в первый скрытый интерес поставщика (объёмы/загрузка).
THEMATIC_PROBE_RU = PRINCIPLED["supplier"]["ru"][0]


@pytest.mark.parametrize("difficulty,gate", [(1, 26), (2, 34), (3, 34), (4, 34), (5, 39)])
def test_reveal_trust_gate_rises_with_difficulty(difficulty: int, gate: float) -> None:
    """У трудного собеседника открыться должно быть труднее.

    Порог был жёстким `trust > 30` для всех. Замер прямой: сажаем доверие на
    полбалла ВЫШЕ порога — интерес вскрывается; на полбалла НИЖЕ — нет, и
    оппонент честно переспрашивает (реакция probe_vague), а не выдаёт секрет
    за спиной у счётчика.
    """
    above = engine.create_session("supplier", "ru")
    above.difficulty = difficulty
    above.state.trust = gate + 0.5
    above.turn = 1
    engine.apply_move(above, analyze(THEMATIC_PROBE_RU), THEMATIC_PROBE_RU)
    assert above.state.interests_found == [0], (difficulty, above.state.interests_found)

    below = engine.create_session("supplier", "ru")
    below.difficulty = difficulty
    below.state.trust = gate - 0.5
    below.turn = 1
    res = engine.apply_move(below, analyze(THEMATIC_PROBE_RU), THEMATIC_PROBE_RU)
    assert below.state.interests_found == [], (difficulty, below.state.interests_found)
    assert res.reaction == "probe_vague", res.reaction


def test_scoring_formula_is_untouched_by_difficulty() -> None:
    """Инвариант 3 и экзамен: сложность меняет ПОВЕДЕНИЕ, а не формулу.

    Веса 0.4/0.25/0.35 обязаны сойтись при любой сложности — иначе сертификат
    экзамена перестал бы значить одно и то же на разных столах.
    """
    for d in DIFFICULTIES:
        sess, deb = play("investor", PRINCIPLED["investor"]["ru"], "ru", difficulty=d)
        expected = round(0.4 * deb["economic"] + 0.25 * deb["relationship"]
                         + 0.35 * deb["technique"] + 1e-9)
        assert abs(deb["overall"] - expected) <= 1, (d, deb)
