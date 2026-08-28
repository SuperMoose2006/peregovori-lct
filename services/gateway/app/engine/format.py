"""format.py — цифра сделки так, как её читают на языке сессии.

ЗАЧЕМ. На столе цена рисуется фронтом через `Intl` («96,43» по-русски), а в
разборе приходила строка с сервера, собранная по-джаваскриптовому — «85.76», с
точкой. Два соседних экрана одной партии спорили о том, что такое десятичный
разделитель. Здесь сервер печатает ровно то же, что `Intl` на клиенте:
запятая и неразрывный пробел разрядов в RU, точка и запятая в EN.

Второе: единица приклеивалась к числу вплотную, и «100₽/шт» сливало рубль с
нулём в один глиф. Перед единицей, которая НАЧИНАЕТСЯ со знака валюты, ставим
узкий неразрывный пробел U+202F. Перед «%», «k», «дн» — не ставим: там пробел
не нужен и он ломает вёрстку.

Зеркало — `frontend/src/lib/format.ts`; расходиться им нельзя (инвариант 8).
"""

from __future__ import annotations

import math

#: Узкий неразрывный пробел. Неразрывный — чтобы цена не переносилась в вёрстке.
NARROW_NBSP = " "

#: Разделитель разрядов и дробной части, как их печатает Intl для этих локалей.
_GROUP = {"ru": " ", "en": ","}
_DECIMAL = {"ru": ",", "en": "."}

#: Единица, начинающаяся с одного из этих знаков, отделяется от числа.
_CURRENCY_HEAD = ("₽", "$", "€", "£", "¥")


def format_number(value: float, lang: str) -> str:
    """Число с точностью до сотых, как `Intl.NumberFormat(locale)`.

    Хвостовые нули дробной части Intl не печатает, поэтому и мы не печатаем:
    86.0 это «86», а не «86,00».
    """
    group = _GROUP.get(lang, _GROUP["en"])
    decimal = _DECIMAL.get(lang, _DECIMAL["en"])
    negative = value < 0
    scaled = math.floor(abs(value) * 100 + 0.5)  # Intl округляет от нуля
    whole, frac = divmod(scaled, 100)
    digits = str(whole)
    parts = []
    while len(digits) > 3:
        parts.insert(0, digits[-3:])
        digits = digits[:-3]
    parts.insert(0, digits)
    out = group.join(parts)
    tail = f"{frac:02d}".rstrip("0")
    if tail:
        out += decimal + tail
    return ("-" + out) if negative else out


def format_deal(value: float, unit: str, lang: str) -> str:
    """Число сделки со своей единицей."""
    space = NARROW_NBSP if unit[:1] in _CURRENCY_HEAD else ""
    return format_number(value, lang) + space + unit
