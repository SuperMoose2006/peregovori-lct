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

ФИНАЛ НЕ БЫВАЕТ ЛЕГЧЕ ДОРОГИ К НЕМУ. Экзамен стоял на тех же столах, что и два
капстоуна, и просил меньше: `investor` — доля ≤ 22% за десять ходов против ≤ 20%
за семь у `bz-09`, `used_car` — ≤ 1100k за восемь против ≤ 1080k за шесть у
`an-08`, и ни одного требования к напряжению там, где капстоун его требовал.
Сертификат мастера тогда стоил дешевле зачёта по блоку, который к нему ведёт.
Теперь по КАЖДОЙ шкале, которую трогает капстоун того же стола, экзамен требует
не меньше — и лимит хода не длиннее. Это проверяется тестом
`test_master_exam_is_never_softer_than_its_block_capstone`, а не обещанием:
правка баланса в одну сторону обязана валить сборку, а не тихо разъезжаться.

У `freelance_rate` капстоуна нет — сравнивать не с чем, и его условие остаётся
таким, каким было: восемь ходов на единственном столе, где «выше — лучше».
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
        "id": "ms-02", "type": "drill", "scenario_id": "investor", "max_turns": 7, "xp": 60,
        "prompt": T("Закройтесь на доле не выше 19%, вскрыв все три интереса инвестора "
                    "и не подняв напряжение выше 50.",
                    "Close at 19% equity or less, having uncovered all three of the investor's "
                    "interests, without pushing tension above 50."),
        "goal": T("Доля ≤ 19% · три интереса · напряжение ≤ 50",
                  "Equity ≤ 19% · three interests · tension ≤ 50"),
        "pass": [
            {"field": "status", "op": "==", "value": "agreement"},
            {"field": "deal", "op": "<=", "value": 19},
            {"field": "interests_found", "op": ">=", "value": 3},
            {"field": "tension", "op": "<=", "value": 50},
        ],
        "explain": T(
            "Самый трудный стол курса: дно Марины 18% не двигается ни от какого давления. Работает "
            "только то, что вы отрабатывали в блоках: вопросы, критерии, размен вторичных условий.",
            "The hardest table in the course: Marina's floor of 18% does not move under any pressure. "
            "Only what the blocks trained works: questions, criteria, trading secondary terms."),
    },
    {
        "id": "ms-03", "type": "drill", "scenario_id": "used_car", "max_turns": 6, "xp": 60,
        "prompt": T("Купите не дороже 1070k, ни разу не подняв напряжение выше 40.",
                    "Buy at 1070k or less, never pushing tension above 40."),
        "goal": T("Сделка ≤ 1070k · напряжение ≤ 40",
                  "Deal ≤ 1070k · tension ≤ 40"),
        "pass": [
            {"field": "status", "op": "==", "value": "agreement"},
            {"field": "deal", "op": "<=", "value": 1070},
            {"field": "tension", "op": "<=", "value": 40},
        ],
        "explain": T(
            "Продавец привязан к машине: любая критика вещи читается как критика его самого. "
            "Якорь сбивается критерием, а не встречной цифрой.",
            "The seller is attached to the car: criticising the object reads as criticising him. "
            "An anchor is defused by a criterion, not by a counter-number."),
    },
]

PASS_MARK = 2  #: сдать нужно минимум две партии из трёх
