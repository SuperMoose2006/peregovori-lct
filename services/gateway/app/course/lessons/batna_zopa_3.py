"""BATNA и ZOPA · урок 3 — «Назвать альтернативу, не пригрозив»."""

from app.course.lessons._model import (Dialog, LessonMaterial, Limit, Mistake,
                                       Phrase, T, them, you)

MATERIAL = LessonMaterial(
    block="batna-zopa",
    lesson=3,
    scenario_id="investor",
    technique=T("Назвать альтернативу как факт, а не угрозу",
                "Name your alternative as a fact, not a threat"),
    why=T(
        "Когда есть запасной вариант, его тянет применить как дубину: «или 20%, или мы "
        "уходим». Кажется, что это сила. На деле собеседник получает выбор из двух — "
        "сдаться или защищаться — и почти всегда выбирает второе. Альтернатива, названная "
        "угрозой, поднимает напряжение и замораживает разговор. Приём учит говорить о ней "
        "так, чтобы она добавляла вам веса, а собеседнику оставляла место для движения.",
        "When you have a fallback, it is tempting to swing it like a club: “20%, or we "
        "walk.” It feels like strength. In practice the other side gets two choices — give "
        "in or dig in — and nearly always picks the second. An alternative delivered as a "
        "threat raises tension and freezes the conversation. This technique shows you how "
        "to mention it so that it adds weight to your position and still leaves the other "
        "side room to move.",
    ),
    core=T(
        "Формула: факт плюс намерение договориться здесь. Факт — что у вас есть, с цифрой и "
        "без преувеличения. Намерение — почему вы всё-таки хотите договориться именно с "
        "этим человеком. Лучше всего — с опорой: внешним критерием или доводом, который "
        "объясняет вашу цифру.\n\n"
        "«У нас есть альтернатива — второй фонд обсуждает 20%. Но нам интереснее с вами, "
        "потому что у вас есть экспертиза в отрасли. Давайте искать решение здесь». В этой "
        "фразе нет «или — или». Собеседник слышит, что выбор у вас есть и что вы выбираете "
        "его, если условия сойдутся.\n\n"
        "Ультиматум сообщает тот же факт, но оставляет два ответа: уступить или встать из-за "
        "стола. Партнёру фонда, который потом защищает сделку перед своим инвестиционным "
        "комитетом, уступить под угрозой нельзя — это будет выглядеть как поражение.\n\n"
        "Называйте альтернативу один раз: первый раз — это информация, второй — нажим. И не "
        "выдумывайте её: вскрытый блеф стоит дороже, чем отсутствие альтернативы.\n\n"
        "Пример из закупок: «У нас есть предложение другого поставщика на 95, но с вами мы "
        "работаем давно и хотим продолжить. Давайте посмотрим, что можно сделать с ценой».",
        "The formula: a fact plus an intention to agree here. The fact is what you have, "
        "with a number and without exaggeration. The intention is why you still want to "
        "reach a deal with this particular person. Best of all, with backing: an outside "
        "criterion or a reason that explains your number.\n\n"
        "“We do have an alternative — a second fund is discussing 20%. But we would rather "
        "work with you, because you bring industry expertise. Let us find a solution here.” "
        "There is no “either/or” in that. The other side hears that you have a choice and "
        "that you are choosing them, if the terms come together.\n\n"
        "An ultimatum conveys the same fact but leaves only two answers: give in or leave "
        "the table. A fund partner who has to defend the deal to an investment committee "
        "cannot give in to a threat — it would look like a defeat.\n\n"
        "Mention the alternative once: the first time it is information, the second time "
        "it is pressure. And never invent one: a bluff that gets called costs more than "
        "having no alternative at all.\n\n"
        "A procurement example: “We have a quote from another supplier at 95, but we have "
        "worked with you for years and want to carry on. Let us see what can be done on "
        "price.”",
    ),
    phrases=(
        Phrase(
            T("Понимаю вашу позицию. Скажу открыто: у нас есть альтернатива — второй фонд "
              "обсуждает 20%. Но нам интереснее с вами, потому что у вас есть экспертиза в "
              "отрасли. Давайте искать решение здесь.",
              "I understand your position. To be open with you, we have an alternative: a "
              "second fund is discussing 20%. But we would rather work with you, because you "
              "bring industry expertise. Let us find a solution here."),
            moves=("acknowledge", "batna"),
        ),
        Phrase(
            T("По рыночным данным о сопоставимых раундах доля на нашей стадии — около 20%, и "
              "наша альтернатива это подтверждает: второй фонд готов войти на тех же "
              "условиях. Выбрать мы хотим вас.",
              "Market data on comparable rounds puts the stake at our stage at around 20%, "
              "and our alternative confirms it: a second fund is ready to come in on those "
              "terms. We would like to choose you."),
            moves=("objective_criteria", "batna"),
            when=T("Когда собеседник верит данным больше, чем словам.",
                   "When the other side trusts data more than words."),
        ),
        Phrase(
            T("Помогите мне выбрать вас: чем ваше предложение может быть лучше альтернативы, "
              "кроме доли?",
              "Help me choose you: apart from the stake, how could your offer beat our "
              "alternative?"),
            moves=("batna",),
            when=T("Когда альтернатива уже названа и разговор пора вернуть к условиям.",
                   "Once the alternative is on the table and it is time to get back to terms."),
        ),
        Phrase(
            T("Альтернатива настоящая, её условия у нас письменно. Я называю её не чтобы "
              "давить, а чтобы вы видели, от чего мы считаем.",
              "The alternative is real, and we have its terms in writing. I mention it not to "
              "push you, but so you can see what we are counting from."),
            moves=("batna",),
            when=T("Если собеседник спрашивает, не блефуете ли вы.",
                   "If the other side asks whether you are bluffing."),
        ),
    ),
    dialog=Dialog(
        setup=T("Раунд. Марина держит 30% доли. У вас есть второй фонд, который обсуждает 20%.",
                "A funding round. Marina is holding at 30% equity. You have a second fund "
                "discussing 20%."),
        opening=(
            them("30% — обычная доля для фонда на вашей стадии.",
                 "30% is a normal stake for a fund at your stage."),
        ),
        bad=(
            you("Или 20%, или мы уходим во второй фонд.",
                "20%, or we walk away to the other fund.",
                moves=("threat",)),
            them("Тогда не буду вас задерживать. Под давлением фонд условия не меняет.",
                 "Then I will not keep you. The fund does not change terms under pressure."),
        ),
        bad_why=T(
            "Факт тот же, что и в хорошем варианте, но упакован в ультиматум. У Марины два "
            "ответа — уступить или отказать, — а уступить партнёру фонда нельзя: ей потом "
            "объяснять сделку комитету. Вы получили не движение, а закрытую дверь.",
            "The fact is the same as in the good version, but wrapped in an ultimatum. Marina "
            "has two answers — give in or refuse — and a fund partner cannot give in: she has "
            "to explain the deal to her committee afterwards. You got a closed door, not "
            "movement.",
        ),
        good=(
            you("Понимаю. Скажу открыто: по рыночным данным о сопоставимых раундах доля на "
                "нашей стадии — около 20%, и наша альтернатива это подтверждает: второй фонд "
                "обсуждает с нами именно 20. Выбрать мы хотим вас — у вас экспертиза в "
                "отрасли.",
                "I understand. To be open: market data on comparable rounds puts the stake at "
                "our stage at around 20%, and our alternative confirms it: a second fund is "
                "discussing exactly 20 with us. We would like to choose you — you bring "
                "industry expertise.",
                moves=("acknowledge", "objective_criteria", "batna")),
            them("Данные посмотрю. Если при меньшей доле фонд сохранит влияние на решения — "
                 "есть о чём говорить.",
                 "I will look at the data. If the fund keeps a say in decisions with a "
                 "smaller stake, we have something to talk about."),
            you("Что для вас важнее в контроле над компанией: место в совете директоров или "
                "право вето на ключевые решения?",
                "What matters more to you on control and governance: a board seat or a veto "
                "on key decisions?",
                moves=("interests_probe",), reveals=True),
            them("Место в совете.", "The board seat."),
        ),
        good_why=T(
            "Вы назвали тот же факт, но с внешней опорой и с намерением договориться здесь. "
            "Марине есть на что сослаться перед комитетом — на рыночные данные, а не на ваш "
            "нажим, — и она сама говорит, при каком условии готова двигаться. Следующим ходом "
            "вы уже не размахиваете альтернативой, а выясняете, что для неё ценно.",
            "You stated the same fact, but with outside backing and an intention to agree "
            "here. Marina has something to point to in front of her committee — market data, "
            "not your pressure — and she herself names the condition on which she will move. "
            "With your next line you are no longer waving the alternative about; you are "
            "finding out what she values.",
        ),
    ),
    mistakes=(
        Mistake(
            T("Превратить факт в ультиматум", "Turning the fact into an ultimatum"),
            T("«Или — или» оставляет собеседнику только уступить или отказать. Скажите тот же "
              "факт без «или» и добавьте, почему хотите договориться именно с ним.",
              "“Either/or” leaves the other side only two options: give in or refuse. State "
              "the same fact without the “or”, and add why you want to agree with them in "
              "particular."),
        ),
        Mistake(
            T("Называть альтернативу снова и снова", "Bringing up the alternative again and again"),
            T("Повтор не добавляет информации, только давления. Не сработало с первого раза — "
              "меняйте тип хода: вопрос об интересе, критерий, размен.",
              "Repeating it adds no information, only pressure. If it did not work the first "
              "time, change the kind of move: a question about their interests, a criterion, "
              "a trade."),
        ),
        Mistake(
            T("Блефовать", "Bluffing"),
            T("Выдуманный второй фонд проверяется одним вопросом: «покажите условия». "
              "Вскрытый блеф обесценивает всё, что вы скажете дальше, включая правду.",
              "An invented second fund falls apart at one question: “show me the terms.” A "
              "bluff that gets called devalues everything you say afterwards, the truth "
              "included."),
        ),
    ),
    limits=(
        Limit(
            T("Альтернатива слабая — хуже того, что уже лежит на столе.",
              "Your alternative is weak — worse than what is already on the table."),
            T("Не называйте её вовсе: слабая альтернатива, произнесённая вслух, показывает "
              "вашу слабость. Опирайтесь на объективные критерии и на интересы собеседника.",
              "Do not mention it at all: a weak alternative said out loud exposes your "
              "weakness. Lean on objective criteria and on the other side's interests."),
        ),
        Limit(
            T("Собеседник держится за отношения и любое упоминание другого варианта читает "
              "как разрыв.",
              "The other side values the relationship and hears any mention of another "
              "option as a breach."),
            T("Отложите альтернативу, пока не собран пакет условий, или не называйте её "
              "совсем: на тёплом столе цена двигается от размена и так. Альтернатива при этом "
              "работает молча — она держит вашу границу и ваше спокойствие.",
              "Hold the alternative back until the package is built, or leave it unsaid: at a "
              "warm table the price moves from trades anyway. The alternative still works in "
              "silence — it holds your limit and your composure."),
        ),
    ),
)
