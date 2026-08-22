"""master.py — экзамен мастера: три партии подряд на неизученных столах.

ЗАЧЕМ ОН ОТДЕЛЬНО ОТ БЛОКОВ. Экзамен блока проверяет ОДИН приём. Реальные
переговоры не сообщают, какой приём сейчас нужен, — поэтому финальная проверка
курса это не задания, а три настоящие партии подряд, каждая со своим условием
прохода.

СЦЕНАРИИ ВЫБРАНЫ ТЕ, НА КОТОРЫХ БЛОКИ НЕ ТРЕНИРУЮТСЯ. Блоки стоят на `rent`,
`supplier`, `conflict`, `salary`, `investor`, `used_car`, `sla_renewal`; здесь —
`freelance_rate` (единственное направление «выше — лучше» вне блоков),
`investor` (самая сильная альтернатива в игре) и `used_car` (самый большой
разрыв якоря и дна). Знакомый стол проверял бы память, а не навык.

Условия прохода — предикаты над ПОЛЯМИ ДВИЖКА, как и у капстоуна блока: ни один
сигнал слоёв сюда не входит, поэтому результат сравним с любым другим.
"""

from __future__ import annotations

from app.course.blocks import T

MASTER: list[dict] = [
    {
        "id": "ms-01", "type": "drill", "scenario_id": "freelance_rate", "max_turns": 8, "xp": 60,
        "prompt": T("Поднимите ставку до 17k в день, не подняв напряжение выше 50.",
                    "Raise your rate to 17k a day without pushing tension above 50."),
        "goal": T("Сделка ≥ 17k · напряжение ≤ 50",
                  "Deal ≥ 17k · tension ≤ 50"),
        "pass": [
            {"field": "status", "op": "==", "value": "agreement"},
            {"field": "deal", "op": ">=", "value": 17},
            {"field": "tension", "op": "<=", "value": 50},
        ],
        "explain": T(
            "Направление здесь обратное: выше — лучше. Тот же метод работает и в эту сторону — "
            "критерий вместо «я стою больше», размен вместо давления.",
            "The direction is reversed here: higher is better. The same method works this way too — "
            "a criterion instead of “I am worth more”, a trade instead of pressure."),
    },
    {
        "id": "ms-02", "type": "drill", "scenario_id": "investor", "max_turns": 10, "xp": 60,
        "prompt": T("Закройтесь на доле не выше 22%, вскрыв минимум два интереса инвестора.",
                    "Close at 22% equity or less, having uncovered at least two of the investor's interests."),
        "goal": T("Доля ≤ 22% · два интереса",
                  "Equity ≤ 22% · two interests"),
        "pass": [
            {"field": "status", "op": "==", "value": "agreement"},
            {"field": "deal", "op": "<=", "value": 22},
            {"field": "interests_found", "op": ">=", "value": 2},
        ],
        "explain": T(
            "У инвестора самая сильная альтернатива в игре, и давить бесполезно. Работает только "
            "то, что вы отрабатывали в блоках: вопросы, критерии, размен вторичных условий.",
            "The investor holds the strongest alternative in the game, so pressure goes nowhere. Only "
            "what the blocks trained works: questions, criteria, trading secondary terms."),
    },
    {
        "id": "ms-03", "type": "drill", "scenario_id": "used_car", "max_turns": 8, "xp": 60,
        "prompt": T("Купите не дороже 1100k, ни разу не подняв напряжение выше 45.",
                    "Buy at 1100k or less, never pushing tension above 45."),
        "goal": T("Сделка ≤ 1100k · напряжение ≤ 45",
                  "Deal ≤ 1100k · tension ≤ 45"),
        "pass": [
            {"field": "status", "op": "==", "value": "agreement"},
            {"field": "deal", "op": "<=", "value": 1100},
            {"field": "tension", "op": "<=", "value": 45},
        ],
        "explain": T(
            "Продавец привязан к машине: любая критика вещи читается как критика его самого. "
            "Якорь сбивается критерием, а не встречной цифрой.",
            "The seller is attached to the car: criticising the object reads as criticising him. "
            "An anchor is defused by a criterion, not by a counter-number."),
    },
]

PASS_MARK = 2  #: сдать нужно минимум две партии из трёх
