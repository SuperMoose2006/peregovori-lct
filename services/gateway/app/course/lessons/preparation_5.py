"""Подготовка к столу · урок 5 — «Размен готовят заранее»."""

from app.course.lessons._model import (Dialog, LessonMaterial, Limit, Mistake,
                                       Phrase, T, them, you)

MATERIAL = LessonMaterial(
    block="preparation",
    lesson=5,
    scenario_id="salary",
    technique=T("Список фишек с двумя ценами",
                "A list of trade chips with two prices each"),
    why=T(
        "Уступки на переговорах чаще всего делают экспромтом. Под нажимом человек отдаёт то, "
        "что дорого ему самому, или говорит «хорошо, пойдём навстречу» и соглашается на "
        "меньшую цифру, ничего не получив взамен. Вся доброжелательность уходит бесплатно. "
        "Приём превращает уступки в заранее посчитанный размен: вы знаете, что можете "
        "отдать, во что это обойдётся вам, чего это стоит собеседнику — и что вы попросите "
        "взамен.",
        "Most concessions in a negotiation are improvised. Under pressure people give away "
        "what is expensive for them, or say “all right, I will meet you halfway” and accept "
        "a lower figure with nothing in return. All that goodwill goes for free. This "
        "technique turns concessions into a trade worked out in advance: you know what you "
        "can give, what it costs you, what it is worth to the other side — and what you will "
        "ask for in return.",
    ),
    core=T(
        "Фишка — дополнительное условие помимо главной цифры, которое можно дать или взять: "
        "срок пересмотра, бонус, график, объём, срок договора. У каждой две цены: во что она "
        "обходится вам и насколько она ценна собеседнику. Точность не нужна, хватит оценки "
        "«мало, средне, много».\n\n"
        "Для разговора о зарплате с Дмитрием лист выглядит так.\n\n"
        "Пересмотр через полгода по KPI. Вам стоит мало: в своих результатах вы уверены. Ему "
        "ценно: прибавка уходит с сегодняшнего бюджета, а финансам проще объяснить рост за "
        "выполненный план.\n\n"
        "Подписной бонус вместо части оклада. Вам — средне: разовые деньги вместо "
        "постоянных. Ему — средне: бонус не раздувает вилку.\n\n"
        "Дальше три правила. Порядок: первой идёт фишка с самым широким разрывом «дёшево "
        "мне, ценно им» — здесь пересмотр по KPI. Цена: для каждой фишки заранее решите, что "
        "попросите взамен. Название: фишку произносят конкретно — «пересмотр через полгода "
        "по KPI», а не «я готов пойти навстречу». Безымянная доброжелательность — это "
        "уступка, за которую ничего не платят.\n\n"
        "В закупках то же самое: годовой контракт с гарантией объёма поставщику очень ценен, "
        "а вам почти ничего не стоит, если объём вам и так нужен; предоплата ему ценна, но "
        "вам обходится оборотными деньгами.",
        "A chip is an extra term beyond the headline number that you can give or take: when "
        "the salary is reviewed, a bonus, a schedule, volume, contract length. Each has two "
        "prices: what it costs you and how much it is worth to the other side. Precision is "
        "not needed — “low, medium, high” will do.\n\n"
        "For the salary talk with Dmitry the sheet looks like this.\n\n"
        "A six-month review tied to KPIs. Low cost to you: you are confident in your results. "
        "Valuable to him: the raise moves off today's budget, and a raise for hitting the "
        "plan is easier to justify to finance.\n\n"
        "A signing bonus instead of part of the base. Medium for you: one-off money instead "
        "of recurring pay. Medium for him: a bonus does not inflate the band.\n\n"
        "Then three rules. Order: the chip with the widest cheap-to-me, dear-to-them gap goes "
        "first — here, the KPI review. Price: for each chip, decide in advance what you will "
        "ask in return. Name: say the chip concretely — “a six-month review tied to KPIs”, "
        "not “I am willing to be flexible”. Nameless goodwill is a concession, and nobody "
        "pays for it.\n\n"
        "Procurement works the same way: an annual contract with a volume guarantee is worth "
        "a great deal to a supplier and costs you almost nothing if you need the volume "
        "anyway; prepayment is worth something to them but costs you working capital.",
    ),
    phrases=(
        Phrase(
            T("Фишка первая — пересмотр через полгода по KPI: мне стоит мало, ему ценно. Прошу "
              "за неё оклад от 220.",
              "Chip one: a six-month KPI review. Cheap for me, valuable to him. What I ask in "
              "return: a base of 220 or more."),
            when=T("Строка листа: фишка, две цены и что просить взамен.",
                   "A line on the sheet: the chip, its two prices, and what to ask in return."),
        ),
        Phrase(
            T("Что для вас важнее, чтобы уложиться в бюджет отдела: пересмотр через полгода по "
              "KPI или разовый бонус вместо части оклада?",
              "What matters more to you for staying within the team budget: a six-month KPI "
              "review, or a one-time bonus instead of part of the base?"),
            moves=("interests_probe",), reveals=True,
            when=T("Чтобы проверить вашу оценку «ценно им» до размена.",
                   "To test your “valuable to them” estimate before you trade."),
        ),
        Phrase(
            T("Понимаю, бюджет утверждён на год. Готов на пересмотр через полгода по KPI при "
              "условии, что стартуем с 220.",
              "I understand the budget is set for the year. I am open to a six-month review "
              "tied to KPIs, provided that we start at 220."),
            moves=("acknowledge", "tradeoff"),
            when=T("Первая фишка — названа конкретно и сразу с ценой.",
                   "The first chip — named concretely, with its price attached."),
        ),
        Phrase(
            T("Если пересмотра по KPI мало, добавлю второе: подписной бонус вместо части "
              "оклада — при условии, что оклад не ниже 215.",
              "If the KPI review is not enough, I can add a second term: a signing bonus "
              "instead of part of the base, provided that the base stays at 215 or more."),
            moves=("tradeoff",),
            when=T("Вторая фишка — только если первой не хватило.",
                   "The second chip — only if the first was not enough."),
        ),
    ),
    dialog=Dialog(
        setup=T("Найм. Дмитрий говорит, что 230 не укладывается в бюджет. В первом варианте "
                "фишек у вас нет, во втором — лист с двумя фишками и их ценами.",
                "Hiring. Dmitry says 230 does not fit the budget. In the first version you "
                "have no chips; in the second you have a sheet with two chips and their "
                "prices."),
        opening=(
            them("230 я не потяну: бюджет отдела на этот год уже утверждён.",
                 "I cannot stretch to 230: the team budget for this year is already set."),
        ),
        bad=(
            you("Хорошо, пойдём навстречу: я согласен на 210.",
                "All right, I will meet you halfway: I can live with 210.",
                moves=("concession",)),
            them("Спасибо. Тогда 210, так и запишем.", "Thank you. 210 it is, then."),
        ),
        bad_why=T(
            "Вы проявили доброжелательность и заплатили за неё двадцатью тысячами. Дмитрий "
            "ничего не дал взамен — вы ничего и не попросили. Трудность у него была "
            "конкретная — годовой бюджет, — и под неё могло быть конкретное решение, но его "
            "никто не приготовил.",
            "You showed goodwill and paid twenty thousand for it. Dmitry gave nothing in "
            "return — you did not ask for anything. His difficulty was specific — the annual "
            "budget — and it could have had a specific solution, but nobody had prepared one.",
        ),
        good=(
            you("Понимаю, бюджет утверждён на год. Готов на пересмотр через полгода по KPI при "
                "условии, что стартуем с 220.",
                "I understand the budget is set for the year. I am open to a six-month review "
                "tied to KPIs, provided that we start at 220.",
                moves=("acknowledge", "tradeoff")),
            them("Пересмотр по результатам финансам объяснить проще. 220 со старта — давайте "
                 "обсуждать.",
                 "A review based on results is easier to justify to finance. 220 from the "
                 "start — let us discuss it."),
        ),
        good_why=T(
            "Под его трудность — годовой бюджет — лежала заранее приготовленная фишка: "
            "пересмотр через полгода по KPI. Вам она стоит мало, ему решает проблему: прибавка "
            "уходит в следующий бюджетный период и объясняется результатом. Вы назвали фишку "
            "конкретно и сразу сказали, чего хотите взамен. Уступка стала разменом.",
            "His difficulty — the annual budget — met a chip prepared in advance: a six-month "
            "KPI review. It costs you little and solves his problem: the raise moves into the "
            "next budget period and is justified by results. You named the chip concretely "
            "and said at once what you wanted in return. A concession became a trade.",
        ),
    ),
    mistakes=(
        Mistake(
            T("Раздавать фишки без цены", "Giving chips away without a price"),
            T("Отдать пересмотр по KPI и ничего не попросить — подарок, а не размен. У каждой "
              "фишки в листе должна стоять строка «прошу взамен».",
              "Giving the KPI review and asking for nothing is a gift, not a trade. Every chip "
              "on your sheet needs an “in return I ask for” line."),
        ),
        Mistake(
            T("Начинать с дорогой для себя фишки", "Starting with the chip that costs you most"),
            T("Бонус вместо части оклада стоит вам заметно больше пересмотра. Отдав его "
              "первым, вы израсходуете запас на полдороге, и на следующем шаге платить будет "
              "нечем.",
              "A bonus instead of part of the base costs you noticeably more than the review. "
              "Give it first and you will run out of room halfway, with nothing left to pay "
              "for the next step."),
        ),
        Mistake(
            T("Говорить «пойдём навстречу» вместо названия",
              "Saying “I will be flexible” instead of naming the chip"),
            T("Безымянная готовность уступить не решает ни одной проблемы собеседника и "
              "звучит как приглашение давить дальше. Называйте фишку: «пересмотр через полгода "
              "по KPI».",
              "A nameless willingness to give way solves none of the other side's problems and "
              "sounds like an invitation to push harder. Name the chip: “a six-month review "
              "tied to KPIs”."),
        ),
    ),
    limits=(
        Limit(
            T("Собеседнику не нужно ничего, кроме цифры: разовая сделка, жёсткий бюджет без "
              "гибкости по условиям.",
              "The other side cares about nothing but the number: a one-off deal, a rigid "
              "budget with no flexibility on terms."),
            T("Фишки не сработают — опирайтесь на объективные критерии и на альтернативу. "
              "Лист всё равно полезен: вы заранее знаете, чего точно не отдадите.",
              "Chips will not work — rely on objective criteria and your alternative. The "
              "sheet still helps: you know in advance what you will not give up."),
        ),
        Limit(
            T("Вы не знаете, что ценно собеседнику, и оценка «ценно им» — чистая догадка.",
              "You do not know what the other side values, and “valuable to them” is pure "
              "guesswork."),
            T("Проверьте её вопросом до размена: спросите, какая из двух фишек ему важнее. "
              "Ответ поставит их в правильный порядок.",
              "Test it with a question before you trade: ask which of the two chips matters "
              "more to them. The answer puts them in the right order."),
        ),
    ),
)
