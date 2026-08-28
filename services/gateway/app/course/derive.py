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


DERIVERS = {
    "zopa_low": zopa_low,
    "zopa_high": zopa_high,
    "zopa_width": zopa_width,
    "anchor_gap": anchor_gap,
    "target_slack": target_slack,
}


def derive(name: str, scenario_id: str) -> float:
    return DERIVERS[name](scenario_id)
