"""derive.py — числа упражнений, выведенные из сценариев, а не переписанные.

Если баланс сценария поправят, а в банке останется старая цифра, упражнение
станет ложью. Поэтому `numeric` с полем `derive` хранит значение только как
ожидание для теста: настоящее берётся отсюда.
"""

from __future__ import annotations

from app.engine.scenarios import by_id


def zopa_low(scenario_id: str) -> float:
    sc = by_id(scenario_id)
    return min(sc.opponent_reservation, sc.player_reservation)


def zopa_high(scenario_id: str) -> float:
    sc = by_id(scenario_id)
    return max(sc.opponent_reservation, sc.player_reservation)


def zopa_width(scenario_id: str) -> float:
    return round(zopa_high(scenario_id) - zopa_low(scenario_id), 4)


def anchor_gap(scenario_id: str) -> float:
    """Насколько стартовый якорь оппонента далёк от его настоящего дна."""
    sc = by_id(scenario_id)
    return round(abs(sc.opponent_open - sc.opponent_reservation), 4)


def target_slack(scenario_id: str) -> float:
    """Насколько дно оппонента лежит ДАЛЬШЕ вашей цели.

    Обычно ноль или около того: дно оппонента упирается в цель игрока, и торг
    идёт за каждый пункт. У «Оффера сильному кандидату» это 20 — запас, который
    можно выжать и за который не начисляют ничего: экономика считается от цели и
    на ней уже равна 100. Число обязано быть выведенным: подвинут баланс стола —
    подвинется и урок, а не останется в нём старая цифра.
    """
    sc = by_id(scenario_id)
    return round(abs(sc.player_target - sc.opponent_reservation), 4)


def room(scenario_id: str) -> float:
    """Место между целью игрока и его красной линией — вся шкала экономики.

    Экономика считается как доля пути `(сделка − красная линия) / (цель −
    красная линия)`, поэтому этот отрезок и есть 100 очков: сделка на красной
    линии стоит 0, на цели — 100. Число выводится, а не пишется: подвинут цель
    или красную линию — подвинется и упражнение блока «Подготовка».
    """
    sc = by_id(scenario_id)
    return round(abs(sc.player_target - sc.player_reservation), 4)


def batna_leverage(scenario_id: str) -> float:
    """Рычаг, с которым партия НАЧИНАЕТСЯ, — единственный след силы BATNA.

    Берётся из настоящей `create_session`, а не пересчитывается формулой:
    урок утверждает «вы садитесь за стол с рычагом 24», и доказывать это обязан
    тот же код, который раздаёт стартовое состояние живой партии.
    """
    from app.engine.engine import create_session

    return round(create_session(scenario_id).state.leverage, 4)


def best_chip_package(scenario_id: str) -> float:
    """Вклад лучшей вторичной фишки в шкалу «Приёмы»: 10·ценность − 6·стоимость.

    Формула — движковая (`engine.score_session`, слагаемое `package`), и то,
    что она здесь повторена, стережёт отдельный тест: он сравнивает это число
    с РАЗНИЦЕЙ техники двух настоящих партий, отличающихся только названной
    фишкой (`tests/test_course_preparation.py`).
    """
    sc = by_id(scenario_id)
    return round(max(10 * i.opp_value - 6 * i.player_cost
                     for i in sc.secondary_issues), 4)


DERIVERS = {
    "zopa_low": zopa_low,
    "zopa_high": zopa_high,
    "zopa_width": zopa_width,
    "anchor_gap": anchor_gap,
    "target_slack": target_slack,
    "room": room,
    "batna_leverage": batna_leverage,
    "best_chip_package": best_chip_package,
}


def derive(name: str, scenario_id: str) -> float:
    return DERIVERS[name](scenario_id)
