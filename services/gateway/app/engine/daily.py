"""daily.py — «Стол дня»: один и тот же стол у всех, каждый день новый.

ЗАЧЕМ. Механика удержания в продукте собрана (серии, заморозки, цель дня,
ранги), но возвращаться было не за чем: все восемь столов открыты сразу, а
курс проходится за вечер. «Завтра будет другой стол» — самая дешёвая причина
вернуться из существующих, потому что новых сценариев она не требует.

ЧТО ЭТО НЕ ТАКОЕ. Не новая механика и не отдельный движок. Стол дня — это
ВЫБОР сценария плюс ОДНО начальное условие, и оба считаются от даты чистой
арифметикой. Условие накладывается снаружи движка, ровно как репутация
кампании в `views.apply_reputation`: `max_turns` и стартовые шкалы — это вход
партии, а не правило подсчёта. `score_session` не знает, что стол был
сегодняшним.

ПОЧЕМУ АРИФМЕТИКА, А НЕ ХЕШ. Число выбирается из «дней с 1970-01-01» —
единственная величина, которую браузер и сервер считают одинаково без
договорённостей о кодировке и без библиотек. Офлайн-ядро обязано выдать тот же
стол, что сервер (инвариант 8); с sha256 это стоило бы реализации хеша на
клиенте ради одного числа.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from app.engine.scenarios import SCENARIOS

_EPOCH = date(1970, 1, 1)


@dataclass(frozen=True)
class Modifier:
    """Одно начальное условие. Накладывается ПОСЛЕ create_session, снаружи."""
    id: str
    label: dict[str, str]
    note: dict[str, str]
    max_turns: int | None = None
    trust: float = 0.0
    tension: float = 0.0


#: Порядок фиксирован: он входит в выбор по дате, и перестановка сдвинула бы
#: расписание у всех, кто уже видел завтрашний стол.
MODIFIERS: tuple[Modifier, ...] = (
    Modifier(
        id="plain",
        label={"ru": "Как обычно", "en": "As usual"},
        note={"ru": "Обычный стол, двенадцать ходов.",
              "en": "An ordinary table, twelve turns."},
    ),
    Modifier(
        id="short",
        label={"ru": "Короткий стол", "en": "Short table"},
        note={"ru": "Восемь ходов вместо двенадцати. Разминаться некогда.",
              "en": "Eight turns instead of twelve. No time to warm up."},
        max_turns=8,
    ),
    Modifier(
        id="cold",
        label={"ru": "Холодный старт", "en": "Cold open"},
        note={"ru": "Вас здесь не ждали: доверие ниже обычного. "
                    "Интерес не вскроется, пока не потеплеет.",
              "en": "You were not expected: trust starts lower. "
                    "No interest opens up until it warms."},
        trust=-15.0,
    ),
    Modifier(
        id="tense",
        label={"ru": "Напряжённый стол", "en": "Tense table"},
        note={"ru": "Разговор начинается уже на нервах. Давить дороже обычного.",
              "en": "The conversation starts on edge. Pushing costs more than usual."},
        tension=+15.0,
    ),
)


@dataclass(frozen=True)
class DailyTable:
    day: str            # ISO-дата, по которой всё и посчитано
    scenario_id: str
    modifier: Modifier


def day_number(d: date) -> int:
    """Дней с 1970-01-01. То же число, что `Math.floor(t / 86400000)` в UTC."""
    return (d - _EPOCH).days


def daily_table(d: date) -> DailyTable:
    """Стол дня. Чистая функция от даты — одинаковая на сервере и в браузере."""
    n = day_number(d)
    scenario = SCENARIOS[n % len(SCENARIOS)]
    # Условие считается не только от дня, но и от НОМЕРА КРУГА по столам
    # (`n // len(SCENARIOS)`). Иначе пара «стол + условие» повторялась бы через
    # восемь дней — четыре условия делят восемь столов нацело, и любой
    # множитель это не спасает. С кругом пара повторяется через 8 × 4 = 32 дня,
    # и один и тот же стол приходит с разным условием каждый раз.
    modifier = MODIFIERS[(n + n // len(SCENARIOS)) % len(MODIFIERS)]
    return DailyTable(day=d.isoformat(), scenario_id=scenario.id, modifier=modifier)


def apply_modifier(sess, mod: Modifier) -> None:
    """Наложить условие дня на свежую сессию.

    Снаружи движка и по той же схеме, что `views.apply_reputation`: это вход
    партии, а не правило подсчёта. `score_session` об этом не узнаёт.
    """
    if mod.max_turns is not None:
        sess.max_turns = mod.max_turns
    if mod.trust:
        sess.state.trust = max(0.0, min(100.0, sess.state.trust + mod.trust))
    if mod.tension:
        sess.state.tension = max(0.0, min(100.0, sess.state.tension + mod.tension))
