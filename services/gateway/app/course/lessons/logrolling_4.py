"""Размен и создание ценности · урок 4 — «Связывать, а не раздавать»."""

from app.course.lessons._model import (Dialog, LessonMaterial, Limit, Mistake,
                                       Phrase, T, them, you)

MATERIAL = LessonMaterial(
    block="logrolling",
    lesson=4,
    scenario_id="supplier",
    technique=T("Уступать только в обмен: «если…, то…»",
                "Concede only in exchange: “if…, then…”"),
    why=T(
        "Самая частая потеря в переговорах — уступка «для атмосферы». «Ладно, годовой "
        "контракт мы дадим», — говорит закупщик, поставщик благодарит, записывает и "
        "переходит к следующему пункту. Фишка отдана, на неё не куплено ничего, и "
        "вернуть её уже нельзя. Приём простой: любую уступку произносите только вместе "
        "с тем, что просите взамен, в одной фразе.",
        "The most common loss in a negotiation is a concession made “for the mood”. "
        "“All right, we will give you the annual contract,” says the buyer; the supplier "
        "says thank you, writes it down and moves on to the next item. The chip is gone, it "
        "bought nothing, and there is no taking it back. The technique is simple: "
        "whatever you concede, say it only together with what you want in return, in the "
        "same sentence.",
    ),
    core=T(
        "Размен — уступка, связанная со встречной уступкой. Формула: условие плюс "
        "просьба. «Если мы дадим годовой контракт с гарантией объёма, сможете ли вы "
        "подвинуться до 88?» Условие — то, что вы готовы отдать; просьба — конкретная "
        "цифра или условие, а не «пойдите навстречу». Пока просьбы нет, условие не "
        "отдано: оно на столе, но в кармане у вас.\n\n"
        "Работают и короткие формы: «…в обмен на 89», «…при условии, что цена будет "
        "87», «давайте свяжем: годовой контракт и цена 88». Смысл один — две вещи "
        "звучат вместе и вместе принимаются.\n\n"
        "Обратная сторона приёма: когда просят вас, не отвечайте «да» сразу. «Это можно "
        "обсудить. А что вы готовы дать взамен?» — и просьба собеседника становится "
        "началом обмена, а не подарком.\n\n"
        "Порядок фишек — из прошлого урока: сначала то, что вам дёшево и им ценно. "
        "Дорогую для вас предоплату — только за ощутимое движение и только последней.\n\n"
        "В найме так же: «Если выйдете на две недели раньше, мы добавим подъёмные» — "
        "а не «подъёмные мы добавим» и потом надежда на ранний выход.",
        "A trade is a concession tied to a concession in return. The formula: a condition "
        "plus a request. “If we give you an annual volume commitment, can you move to 88?” "
        "The condition is what you are ready to give; the request is a concrete number or "
        "term, not “meet us halfway”. Until the request is there, the condition is not "
        "given: it is on the table, but still in your pocket.\n\n"
        "Short forms work too: “…in exchange for 89”, “…provided that the price is 87”, "
        "“let us link the two: the annual contract and 88”. The point is the same — two "
        "things are said together and accepted together.\n\n"
        "The flip side of the technique: when you are the one being asked, do not say yes "
        "straight away. “We can discuss that. What can you offer in return?” — and their "
        "request becomes the start of an exchange, not a gift.\n\n"
        "The order of chips comes from the previous lesson: first what is cheap for you "
        "and valuable to them. The prepayment that is expensive for you goes only for a "
        "real move, and only last.\n\n"
        "Hiring works the same way: “If you can start two weeks earlier, we will add a "
        "relocation allowance” — not “we will add a relocation allowance” and then a hope "
        "for an early start.",
    ),
    phrases=(
        Phrase(
            T("Если мы дадим годовой контракт с гарантией объёма, сможете ли вы "
              "подвинуться до 88?",
              "If we give you an annual volume commitment, can you move to 88?"),
            moves=("tradeoff",),
            when=T("Главная форма: ваша фишка и конкретная цифра взамен.",
                   "The main form: your chip and a concrete number in return."),
        ),
        Phrase(
            T("Годовой объём — это ваша загрузка на весь год. Давайте свяжем: годовой "
              "контракт и цена 89 — вместе.",
              "An annual volume keeps your line loaded all year. Let us link the two: the "
              "annual contract and 89 go together."),
            moves=("tradeoff",),
            when=T("Когда она торгуется о цене, а фишку уже хочет.",
                   "When she is haggling over price but already wants the chip."),
        ),
        Phrase(
            T("Это мы можем обсудить. А что вы готовы дать взамен?",
              "We can discuss that. What can you offer in return?"),
            moves=("tradeoff",),
            when=T("Когда просят вас — вместо быстрого «да».",
                   "When you are the one being asked — instead of a quick yes."),
        ),
        Phrase(
            T("Цена 87 — при условии предоплаты 30%.",
              "A price of 87 — provided that we pay 30% upfront."),
            moves=("tradeoff",),
            when=T("Дорогая для вас фишка, последней и только за заметный шаг.",
                   "A chip that is expensive for you, last, and only for a real step."),
        ),
        Phrase(
            T("Годовой контракт был частью предложения вместе с ценой 88. Отдельно от цены "
              "он не обсуждается.",
              "The annual contract was part of an offer together with 88. On its own, it "
              "is not on the table."),
            when=T("Если фишку пытаются забрать, а цену оставить прежней.",
                   "If they try to take the chip and keep the price where it was."),
        ),
    ),
    dialog=Dialog(
        setup=T("Закупки. Ирина держит 94 ₽ за штуку и сама заводит разговор о годовом "
                "контракте.",
                "Procurement. Irina is holding at 94 per unit and raises the annual contract "
                "herself."),
        opening=(
            them("Если бы вы взяли годовой контракт, мне было бы спокойнее за загрузку.",
                 "If you took an annual contract, I would feel easier about keeping the line "
                 "loaded."),
        ),
        bad=(
            you("Конечно, годовой контракт мы можем добавить, без вопросов.",
                "Sure, we can throw in the annual contract, no problem.",
                moves=("concession",)),
            them("Отлично, спасибо! Записываю. Итак, цена — 94.",
                 "Great, thank you! Noted. So, the price is 94."),
            you("А годовой контракт разве не снижает цену?",
                "But does the annual contract not bring the price down?"),
            them("Так вы же сами его предложили. Цена та же — 94.",
                 "You offered it yourself. The price stays at 94."),
        ),
        bad_why=T(
            "Годовой контракт — лучшая фишка стола: вам почти ничего не стоит, для Ирины "
            "это загрузка на год. Вы отдали его за «спасибо». Просьба о цене, прозвучавшая "
            "после, выглядит как попытка переиграть уже сказанное — и Ирина вправе "
            "отказать.",
            "The annual contract is the best chip at this table: it costs you almost nothing "
            "and gives Irina a year of work for her line. You gave it away for a “thank "
            "you”. The price request that came afterwards looks like an attempt to reopen "
            "what was already said — and Irina is entitled to refuse.",
        ),
        good=(
            you("Годовой контракт возможен. Если мы дадим годовой контракт с гарантией "
                "объёма, сможете ли вы подвинуться до 88?",
                "An annual contract is possible. If we give you an annual volume commitment, "
                "can you move to 88?",
                moves=("tradeoff",)),
            them("88 — очень низко. Могу 91.", "88 is very low. I can do 91."),
            you("Годовой объём — это ваша загрузка на весь год. Давайте свяжем: годовой "
                "контракт и цена 89 — вместе.",
                "An annual volume keeps your line loaded all year. Let us link the two: the "
                "annual contract and 89 go together.",
                moves=("tradeoff",)),
            them("89 при годовом объёме… Хорошо, так можно работать.",
                 "89 with an annual volume… All right, we can work with that."),
        ),
        good_why=T(
            "Фишка ни разу не прозвучала отдельно от цены. Когда Ирина ответила 91, вы не "
            "добавили ничего нового, а напомнили, чего стоит для неё годовой объём, и снова "
            "связали его с цифрой. Цена сдвинулась с 94 до 89 за условие, которое вам почти "
            "ничего не стоит.",
            "The chip was never mentioned apart from the price. When Irina answered 91, you "
            "added nothing new: you reminded her what an annual volume is worth to her and "
            "tied it to a number again. The price moved from 94 to 89 for a term that costs "
            "you almost nothing.",
        ),
    ),
    mistakes=(
        Mistake(
            T("Уступка «для атмосферы»",
              "A concession “for the mood”"),
            T("Кажется, что щедрость вызовет ответную щедрость. На деле отданное без "
              "условия записывают как данность, а ваша следующая просьба звучит как новое "
              "требование.",
              "It feels as if generosity will be answered with generosity. In practice, "
              "what you give without a condition is recorded as a given, and your next "
              "request sounds like a new demand."),
        ),
        Mistake(
            T("Размытая просьба взамен",
              "A vague request in return"),
            T("«Тогда и вы пойдите нам навстречу» — встречная просьба без цифры. Ирина "
              "уступит рубль и будет права: навстречу она пошла. Просите конкретное: цену, "
              "срок, условие.",
              "“Then you meet us halfway too” — a request with no number. Irina will give "
              "one rouble and be right: she did meet you. Ask for something concrete: a "
              "price, a date, a term."),
        ),
        Mistake(
            T("Отдать в одной фразе, попросить в другой",
              "Giving in one sentence, asking in the next"),
            T("«Годовой контракт дадим. И ещё хотелось бы цену пониже». Первую фразу уже "
              "записали, вторая звучит как отдельная просьба. Условие и просьба — в одном "
              "предложении.",
              "“We will give you the annual contract. And we would also like a lower "
              "price.” The first sentence is already written down; the second sounds like "
              "a separate request. Condition and request go in one sentence."),
        ),
    ),
    limits=(
        Limit(
            T("Мелкая просьба в долгих отношениях: перенести созвон, прислать образец, "
              "поменять формат отчёта.",
              "A small request in a long relationship: move a call, send a sample, change "
              "a report format."),
            T("Торг за каждую мелочь портит отношения сильнее, чем стоит мелочь. Такое "
              "отдавайте без условий, но называйте вслух: «это сделаем, без вопросов». "
              "Связывайте то, у чего есть цена.",
              "Haggling over every trifle damages the relationship more than the trifle is "
              "worth. Give those without conditions, but say so out loud: “we will do "
              "that, no question”. Link only what has a price."),
        ),
        Limit(
            T("Собеседнику нечего дать взамен: цена не в его полномочиях.",
              "The other side has nothing to give in return: the price is outside their "
              "authority."),
            T("Просите то, что в его власти: срок отгрузки, график поставок, приоритет в "
              "очереди на производство. Или спросите, кто решает про цену, и предложите "
              "размен ему.",
              "Ask for what is within their power: shipping date, delivery schedule, "
              "priority in the production queue. Or ask who decides on price and offer the "
              "trade to that person."),
        ),
    ),
)
