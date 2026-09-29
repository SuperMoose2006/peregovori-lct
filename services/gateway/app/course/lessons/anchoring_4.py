"""Якорь и защита от него · урок 4 — «Цена оскорбительного контр-якоря»."""

from app.course.lessons._model import (Dialog, LessonMaterial, Limit, Mistake,
                                       Phrase, T, them, you)

MATERIAL = LessonMaterial(
    block="anchoring",
    lesson=4,
    scenario_id="used_car",
    technique=T("Спорить с цифрой, а не с вещью и не с человеком",
                "Argue with the number, not with the thing or the person"),
    why=T(
        "Чтобы сбить цену, покупатели ругают вещь: «да она столько не стоит», «развалюха», "
        "«это смешно». Кажется, что так вы показываете слабость позиции продавца. Но "
        "продавец слышит, что ругают его самого — его выбор, его уход за машиной, его "
        "честность. Он обижается, защищается и держит цифру уже из принципа, а не ради "
        "денег. Приём: о недостатках говорить фактами и уважительно, отделяя человека от "
        "проблемы.",
        "To knock the price down, buyers run the item down: “it is not worth that”, “a wreck”, "
        "“this is a joke”. It feels like exposing the weakness of the seller's position. But "
        "the seller hears an attack on himself — his choices, the way he looked after the car, "
        "his honesty. He takes offence, gets defensive, and holds the number on principle "
        "rather than for the money. The technique: talk about flaws in facts and with "
        "respect, separating the person from the problem.",
    ),
    core=T(
        "Отделить человека от проблемы — один из принципов Гарвардского метода. Проблема "
        "здесь — цена, а не продавец и не его машина. Три правила.\n\n"
        "Сначала признайте то, что ему дорого, — если это правда: «Видно, что машину "
        "берегли». Это не лесть, а честное наблюдение, и оно снимает оборону.\n\n"
        "Недостаток называйте фактом, а не оценкой. Не «развалюха», а «пробег выше среднего "
        "для этого года». Не «она столько не стоит», а «сопоставимые машины с таким пробегом "
        "стоят дешевле». Оценку можно только оспорить, факт можно только учесть.\n\n"
        "Спорьте с цифрой, а не с человеком: «1200 выше рынка», а не «вы задрали цену».\n\n"
        "Проверка перед тем, как сказать: смогли бы вы спокойно выслушать эту фразу про свою "
        "вещь? Если нет — переформулируйте.\n\n"
        "В закупках то же самое: не «у вас брак», а «в прошлой партии вернули 3% при допуске "
        "1% — давайте разберёмся, как учесть это в цене».",
        "Separating the person from the problem is one of the principles of the Harvard "
        "method. The problem here is the price, not the seller and not his car. Three rules.\n\n"
        "First acknowledge what he cares about — if it is true: “You can tell the car has been "
        "looked after.” That is not flattery but an honest observation, and it lowers his "
        "guard.\n\n"
        "Name a flaw as a fact, not a verdict. Not “a wreck”, but “the mileage is above average "
        "for the year”. Not “it is not worth that”, but “comparable cars with that mileage go "
        "for less”. A verdict can only be disputed; a fact can only be taken into account.\n\n"
        "Argue with the number, not with the person: “1200 is above the market”, not “you have "
        "inflated the price”.\n\n"
        "A check before you speak: could you listen calmly to that sentence about something "
        "you own? If not, rephrase it.\n\n"
        "Procurement is no different: not “your goods are defective”, but “3% of the last "
        "batch came back against a 1% tolerance — let us work out how to reflect that in the "
        "price”.",
    ),
    phrases=(
        Phrase(
            T("Видно, что машину берегли, — это ценю. Давайте теперь посмотрим на цену по "
              "сопоставимым объявлениям.",
              "I can see that the car has been looked after, and I appreciate it. Now let us "
              "look at the price against comparable listings."),
            moves=("acknowledge", "objective_criteria"),
            when=T("В начале разговора о цене.", "When the price talk begins."),
        ),
        Phrase(
            T("Пробег у неё выше среднего для этого года, а с таким пробегом рыночная цена "
              "обычно на 50 тысяч ниже.",
              "The mileage is above average for the year, and at that mileage the market price "
              "is usually about 50k lower."),
            moves=("objective_criteria",),
            when=T("Когда нужно назвать недостаток.", "When you need to name a flaw."),
        ),
        Phrase(
            T("Дело не в машине — машина хорошая. Дело в цифре: 1200 выше, чем стоят "
              "сопоставимые машины.",
              "It is not the car — the car is good. It is the number: 1200 is above what "
              "comparable cars go for."),
            moves=("objective_criteria",),
        ),
        Phrase(
            T("Что для вас важно в продаже — быстро продать или отдать машину в надёжные руки?",
              "What matters most to you in this sale — selling quickly, or the car going to "
              "good hands?"),
            moves=("interests_probe",), reveals=True,
            when=T("Вместо критики — вопрос о нём, а не о машине.",
                   "Instead of criticism — a question about him, not the car."),
        ),
        Phrase(
            T("Я резко выразился про машину — забираю эти слова. Давайте вернёмся к цифрам.",
              "That was a harsh thing to say about the car — I take it back. Let us get back to "
              "the numbers."),
            when=T("Если всё-таки сорвалось.", "If it slipped out anyway."),
        ),
    ),
    dialog=Dialog(
        setup=T("Покупка машины с рук. Сергей просит 1200 тысяч. Пробег у машины выше "
                "среднего, и вы хотите учесть это в цене.",
                "Buying a used car. Sergey is asking 1200. The mileage is above average, and "
                "you want that reflected in the price."),
        opening=(
            them("1200. Машина в отличном состоянии, я за ней сам ухаживал.",
                 "1200. The car is in excellent condition — I looked after it myself."),
        ),
        bad=(
            you("Да она столько не стоит, это смешно. Пробег огромный, всё на ладан дышит.",
                "It is not worth that, this is a joke. The mileage is huge and the whole thing "
                "is falling apart.",
                moves=("hostile",)),
            them("Не нравится — не покупайте. Цена та же. Я ещё подумаю, не поднять ли.",
                 "If you do not like it, do not buy it. The price stands. I might even raise "
                 "it."),
        ),
        bad_why=T(
            "Вы хотели сказать про пробег, а сказали, что Сергей продаёт хлам и выдумывает "
            "цену. Он привязан к машине — критику вещи он слышит как критику себя. Теперь он "
            "держит цифру не ради денег, а чтобы не проиграть вам, и даже грозит её поднять. "
            "Факт про пробег утонул в обиде: вы потеряли и довод, и собеседника.",
            "You meant to talk about the mileage, but what you said was that Sergey is selling "
            "junk and making up the price. He is attached to the car — criticism of it lands as "
            "criticism of him. Now he is holding the number not for the money but so as not to "
            "lose to you, and even threatening to raise it. The mileage fact drowned in the "
            "offence: you lost both the argument and the person.",
        ),
        good=(
            you("Видно, что машину берегли, и это ценю. Честно скажу, что меня останавливает: "
                "пробег выше среднего для этого года, а по сопоставимым объявлениям такие "
                "машины стоят около 1080.",
                "I can see that the car has been looked after, and I appreciate it. To be honest "
                "about what holds me back: the mileage is above average for the year, and "
                "comparable listings put cars like this at around 1080.",
                moves=("acknowledge", "objective_criteria")),
            them("Пробег трассовый, не городской, машина не убита. Но ладно, давайте считать "
                 "от объявлений.",
                 "It is motorway mileage, not city driving — the car is not worn out. But all "
                 "right, let us count from the listings."),
        ),
        good_why=T(
            "Сначала вы признали то, что Сергею дорого, — и это правда: машину действительно "
            "берегли. Недостаток вы назвали фактом, а не приговором, и сразу привязали к "
            "рынку. Сергей не обиделся, а начал обсуждать: пробег трассовый. Это уже разговор "
            "о цене, а не о том, кто прав, и считать вы будете от объявлений.",
            "First you acknowledged what Sergey cares about — and it is true: the car really "
            "has been looked after. You named the flaw as a fact, not a verdict, and tied it to "
            "the market straight away. Sergey did not take offence; he started discussing it: "
            "motorway mileage. That is a conversation about the price, not about who is right, "
            "and you will count from the listings.",
        ),
    ),
    mistakes=(
        Mistake(
            T("Оценка вместо факта", "A verdict instead of a fact"),
            T("«Развалюха», «убитая», «переоценённая» — это оценки, с ними можно только спорить. "
              "«Пробег 180 тысяч километров» — факт, его можно только учесть. Спор об оценке "
              "уводит от цены к самолюбию.",
              "“A wreck”, “worn out”, “overpriced” are verdicts; all anyone can do with them is "
              "argue. “180,000 km on the clock” is a fact; all anyone can do is take it into "
              "account. Arguing about a verdict pulls the talk away from price and toward pride."),
        ),
        Mistake(
            T("Комплимент как разбег перед ударом", "A compliment as a run-up to a punch"),
            T("«Машина хорошая, но по такой цене это хлам» — если после признания идёт "
              "оскорбление, признание звучит как издёвка. Признавайте только то, что правда, и "
              "не ставьте рядом грубость.",
              "“Nice car, but at that price it is junk” — when an insult follows the "
              "acknowledgement, the acknowledgement sounds like mockery. Acknowledge only what "
              "is true, and do not put rudeness next to it."),
        ),
        Mistake(
            T("Не исправить сорвавшееся слово", "Not repairing a word that slipped out"),
            T("Резко говорят все. Ошибка — сделать вид, что ничего не было. Короткое «я резко "
              "сказал, забираю эти слова» стоит дешевле, чем весь остаток разговора с "
              "обиженным человеком.",
              "Everyone says something harsh sometimes. The mistake is to act as if nothing "
              "happened. A short “that was harsh, I take it back” costs far less than the rest "
              "of the conversation with an offended person."),
        ),
    ),
    limits=(
        Limit(
            T("Недостаток серьёзный, и продавец его скрыл: битый кузов, скрученный пробег.",
              "The flaw is serious and the seller hid it: accident damage, a wound-back "
              "odometer."),
            T("Уважительный тон не значит молчание. Назовите факт прямо и спокойно, с "
              "документом — диагностикой или отчётом по истории, — и спросите, как он "
              "предлагает это учесть. Если он отрицает очевидное, это повод пересмотреть саму "
              "сделку, а не повод оскорблять.",
              "A respectful tone does not mean silence. State the fact plainly and calmly, with "
              "a document — a diagnostic or a history report — and ask how he proposes to "
              "reflect it. If he denies the obvious, that is a reason to reconsider the deal "
              "itself, not a reason to insult him."),
        ),
        Limit(
            T("Собеседник сам переходит на личности.",
              "The other side gets personal first."),
            T("Не отвечайте тем же. Назовите это и верните разговор к делу: «Давайте без оценок "
              "друг друга — вернёмся к пробегу и объявлениям». Кто первым вернулся к фактам, "
              "тот и ведёт разговор.",
              "Do not answer in kind. Name it and bring the talk back to business: “Let us leave "
              "judgements of each other aside and go back to the mileage and the listings.” "
              "Whoever returns to the facts first leads the conversation."),
        ),
    ),
)
