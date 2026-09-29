"""BATNA и ZOPA · урок 1 — «ZOPA: где она есть»."""

from app.course.lessons._model import (Dialog, LessonMaterial, Limit, Mistake,
                                       Phrase, T, them, you)

MATERIAL = LessonMaterial(
    block="batna-zopa",
    lesson=1,
    scenario_id="investor",
    technique=T("Оценить зону сделки до торга",
                "Map the deal zone before you haggle"),
    why=T(
        "Торговаться начинают, не понимая, возможна ли сделка вообще. Одни принимают "
        "стартовую цифру собеседника за его предел и уходят там, где договориться было "
        "можно. Другие неделями уговаривают сторону, чьи границы с их собственными не "
        "пересекаются, и в конце соглашаются на условие хуже своего запасного варианта — "
        "просто потому, что жалко потраченного времени. Приём лечит обе ошибки: свою "
        "границу вы знаете заранее, чужую оцениваете вопросами и вовремя видите, есть ли "
        "между ними место для сделки.",
        "People start haggling without knowing whether a deal is possible at all. Some take "
        "the other side's opening number for their limit and walk away where agreement was "
        "within reach. Others spend weeks courting a party whose limits never overlap with "
        "their own, and end up accepting terms worse than their fallback — simply because "
        "they cannot bear to waste the time already spent. This technique cures both: you "
        "know your own limit in advance, you estimate theirs with questions, and you see "
        "early whether there is room for a deal between the two.",
    ),
    core=T(
        "Красная линия — худшее условие, на которое вы ещё согласитесь. За ней выгоднее "
        "уйти к своему лучшему запасному варианту; его называют BATNA — от английского "
        "best alternative to a negotiated agreement, «лучшая альтернатива соглашению». "
        "Зона возможного соглашения, ZOPA (zone of possible agreement), — отрезок между "
        "вашей красной линией и красной линией собеседника. Всё, о чём вы торгуетесь, — "
        "как разделить этот отрезок. Нет отрезка — нет сделки, как бы хорошо вы ни "
        "торговались.\n\n"
        "Свою границу вы знаете. Чужую приходится оценивать, и тут три шага. Первый — не "
        "путать стартовую цифру с пределом: 30% доли, которые просит Марина, — заявка с "
        "запасом, а не граница. Второй — спросить о рамках: какой диапазон для фонда "
        "обычен, от чего он зависит, что для фонда важнее самой цифры. Третий — сверить "
        "ответы со своей границей: зона есть, её нет или она появляется только в пакете "
        "условий.\n\n"
        "Пример из закупок: вы готовы платить не больше 92 за штуку, поставщик открылся "
        "на 100. О зоне это ещё ничего не говорит — его предел может оказаться и на 84, и "
        "на 95. Спросите, из чего складывается цена и что ему важно, кроме неё, и только "
        "потом решайте, торговаться или искать другого поставщика.",
        "Your red line is the worst term you would still accept. Beyond it you are better "
        "off taking your best fallback, known as your BATNA — the best alternative to a "
        "negotiated agreement. The zone of possible agreement, or ZOPA, is the stretch "
        "between your red line and theirs. Everything you haggle over is how to split that "
        "stretch. No stretch, no deal — however well you negotiate.\n\n"
        "You know your own limit. Theirs you have to estimate, in three steps. First, do "
        "not mistake the opening number for the limit: the 30% equity Marina asks for is a "
        "bid with room built in, not a boundary. Second, ask about their frame: what range "
        "is normal for the fund, what it depends on, what matters to the fund beyond the "
        "number itself. Third, check the answers against your own limit: there is a zone, "
        "there is none, or one appears only once other terms are in the package.\n\n"
        "A procurement example: you will pay at most 92 a unit, and the supplier opens at "
        "100. That tells you nothing about the zone yet — their limit could be 84 or 95. "
        "Ask what the price is built from and what matters to them besides it, and only "
        "then decide whether to haggle or find another supplier.",
    ),
    phrases=(
        Phrase(
            T("30% — это ваша стартовая позиция или граница, ниже которой фонд не пойдёт "
              "ни при каких условиях?",
              "Is 30% your opening position, or a line the fund will not go below on any "
              "terms?"),
            moves=("open_question",),
            when=T("Сразу после первой цифры собеседника.",
                   "Straight after the other side's first number."),
        ),
        Phrase(
            T("Какой у вас обычный диапазон доли в сделках на нашей стадии — от и до?",
              "What is your current range for the stake in deals at our stage — from what "
              "to what?"),
            moves=("spin_situation",),
        ),
        Phrase(
            T("Что важнее для фонда, кроме самой цифры: место в совете или скорость "
              "закрытия?",
              "What matters more to the fund besides the number itself: a board seat or "
              "closing speed?"),
            moves=("interests_probe",), reveals=True,
            when=T("Чтобы узнать, чем ещё, кроме доли, можно двигать зону.",
                   "To find out what else, apart from the stake, can move the zone."),
        ),
        Phrase(
            T("Похоже, мы сейчас далеко друг от друга. Прежде чем двигаться, давайте поймём, "
              "есть ли вообще точка, где сделка выгодна обоим.",
              "It looks like we are far apart right now. Before either of us moves, let us "
              "see whether there is any point where the deal works for both sides."),
            when=T("Когда разрыв большой и торг грозит стать перетягиванием каната.",
                   "When the gap is wide and haggling threatens to turn into a tug of war."),
        ),
    ),
    dialog=Dialog(
        setup=T("Раунд. Марина, партнёр фонда, предлагает деньги за 30% доли. Вы для себя "
                "решили: больше 24% не отдаёте, цель — 15%.",
                "A funding round. Marina, a fund partner, offers money for 30% equity. You "
                "have decided for yourself: no more than 24%, and 15% is the goal."),
        opening=(
            them("Мы готовы войти в раунд. Наши условия — 30% доли.",
                 "We are ready to join the round. Our terms are 30% equity."),
        ),
        bad=(
            you("30% — это слишком. Мы рассчитывали на 15.",
                "30% is too much. We were counting on 15."),
            them("15 — это не разговор. Для фонда нашего профиля это слишком мало.",
                 "15 is not a conversation. For a fund like ours that is far too little."),
            you("Хорошо, давайте 25 — и закрываем вопрос.",
                "All right, let us say 25 and settle it."),
            them("25 я готова обсуждать.", "25 I am willing to discuss."),
        ),
        bad_why=T(
            "Вы начали с цифры, не узнав, где у Марины граница, и через две реплики сами "
            "перешли свою: 25% хуже тех 24, на которых вы собирались остановиться. Марина "
            "не сказала ни слова о своём пределе — вы торговались с её стартовой заявкой, а "
            "не с зоной.",
            "You opened with a number before finding out where Marina's limit is, and two "
            "lines later you crossed your own: 25% is worse than the 24 you meant to stop at. "
            "Marina said nothing about her limit — you were haggling with her opening bid, "
            "not with the zone.",
        ),
        good=(
            you("30% — это ваша стартовая позиция или граница, ниже которой фонд не пойдёт "
                "ни при каких условиях?",
                "Is 30% your opening position, or a line the fund will not go below on any "
                "terms?",
                moves=("open_question",)),
            them("Стартовая. Но на этой стадии мы редко опускаемся ниже 20.",
                 "Opening. But at this stage we rarely go below 20."),
            you("Понимаю. Значит, нам есть о чём говорить. Что важнее для фонда, кроме самой "
                "цифры: место в совете или скорость закрытия?",
                "I understand. Then we have something to talk about. What matters more to "
                "the fund besides the number itself: a board seat or closing speed?",
                moves=("acknowledge", "interests_probe"), reveals=True),
            them("Место в совете. Без него мне будет сложно защитить сделку перед комитетом.",
                 "The board seat. Without it I will struggle to defend the deal to my "
                 "committee."),
        ),
        good_why=T(
            "Первым вопросом вы отделили заявку от границы и узнали главное: зона, скорее "
            "всего, есть — где-то между её «редко ниже 20» и вашими 24. Своей границы вы при "
            "этом не назвали. Вторым вопросом узнали, чем зону можно двигать дальше: место в "
            "совете для Марины ценно, а вам стоит немного.",
            "Your first question separated the bid from the limit and told you the key thing: "
            "a zone most likely exists — somewhere between her “rarely below 20” and your 24. "
            "And you did not reveal your own limit. Your second question showed what else can "
            "move the zone: a board seat is valuable to Marina and cheap for you.",
        ),
    ),
    mistakes=(
        Mistake(
            T("Принять стартовую цифру за предел", "Taking the opening number for the limit"),
            T("30% — заявка, её выбирают с запасом. Если считать зону от неё, вы решите, что "
              "сделки нет, там, где она есть.",
              "30% is a bid, and bids come with room built in. Measure the zone from it and "
              "you will conclude there is no deal where there is one."),
        ),
        Mistake(
            T("Перейти свою красную линию «раз уж зашли так далеко»",
              "Crossing your red line “since we have come this far”"),
            T("Потраченное время — не довод. Условие хуже красной линии хуже вашей "
              "альтернативы, сколько бы встреч ни было позади.",
              "Time already spent is not an argument. A term worse than your red line is "
              "worse than your alternative, however many meetings lie behind you."),
        ),
        Mistake(
            T("Назвать собеседнику свою красную линию",
              "Telling the other side your red line"),
            T("«Больше 24% не отдадим» превращает вашу границу в его цель — ровно 24 вы и "
              "получите. Границу держат при себе, а вслух называют предложение и его "
              "основание.",
              "“We will not give more than 24%” turns your limit into their target — and 24 "
              "is exactly what you will get. Keep the limit to yourself; say your offer and "
              "what it rests on."),
        ),
    ),
    limits=(
        Limit(
            T("Собеседник не раскрывает рамок и на любой вопрос повторяет стартовую цифру.",
              "The other side will not reveal their frame and answers every question with "
              "their opening number."),
            T("Оцените зону по внешним данным: условия сопоставимых сделок, отраслевые "
              "обзоры, опыт коллег, которые проходили такой же раунд. Зона, посчитанная по "
              "рынку, грубее, но это лучше, чем никакой.",
              "Estimate the zone from outside data: terms of comparable deals, industry "
              "surveys, colleagues who went through a similar round. A zone built from the "
              "market is rougher, but far better than none."),
        ),
        Limit(
            T("Зоны по одной цифре нет: минимум собеседника выше вашей красной линии.",
              "There is no zone on the single number: their minimum is beyond your red line."),
            T("Скажите это прямо и спокойно, без дожима. Потом проверьте пакет: другие "
              "условия — место в совете, транши по метрикам — могут создать зону там, где "
              "одна цифра не сходится. Нет её и в пакете — уходите к альтернативе, сохранив "
              "отношения.",
              "Say so plainly and calmly, without pushing. Then test the package: other "
              "terms — a board seat, tranches tied to milestones — can create a zone where "
              "the single number does not meet. If there is none in the package either, "
              "take your alternative and keep the relationship intact."),
        ),
    ),
)
