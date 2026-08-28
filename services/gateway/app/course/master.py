"""master.py — экзамен мастера: три настоящие партии подряд без подсказок.

ЗАЧЕМ ОН ОТДЕЛЬНО ОТ БЛОКОВ. Экзамен блока проверяет ОДИН приём. Реальные
переговоры не сообщают, какой приём сейчас нужен, — поэтому финальная проверка
курса это не задания, а три настоящие партии подряд, каждая со своим условием
прохода.

СТОЛЫ ВЫБРАНЫ ПО НАГРУЗКЕ, А НЕ ПО НОВИЗНЕ. Свободных столов на три партии
нет: блоки стоят на восьми сценариях из девяти (`rent`, `supplier`, `conflict`,
`salary`, `investor`, `used_car`, `sla_renewal`, `candidate_offer`), и вне их
остаётся ровно один — `freelance_rate`, единственное направление «выше — лучше»
в курсе. Он и открывает экзамен. Дальше `investor` (сложность 5, самая узкая
доля) и `used_car` (разрыв якоря и дна 160 из 1200 — самый большой в абсолютных
числах). Знакомый стол здесь проверяет не память: в блоке рядом с партией стоял
урок и капстоун называл нужный приём, а тут не подсказывают ничего.

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
            "Самый трудный стол курса: дно Марины 18% не двигается ни от какого давления. Работает "
            "только то, что вы отрабатывали в блоках: вопросы, критерии, размен вторичных условий.",
            "The hardest table in the course: Marina's floor of 18% does not move under any pressure. "
            "Only what the blocks trained works: questions, criteria, trading secondary terms."),
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
