"""Закрытие и фиксация · урок 3 — «Закрывать с цифрой»."""

from app.course.lessons._model import (Dialog, LessonMaterial, Limit, Mistake,
                                       Phrase, T, them, you)

MATERIAL = LessonMaterial(
    block="closing",
    lesson=3,
    scenario_id="supplier",
    technique=T("Закрывать полной фразой: число, условия, вопрос",
                "Close with a complete line: number, terms, question"),
    why=T(
        "Разговор шёл хорошо, собеседник потеплел, и человек на радостях говорит: "
        "«Отлично, договорились!» О чём — не сказано. Сделка встаёт на последнюю цифру, "
        "которую назвала другая сторона, а всё, что вы выторговали словами, так и "
        "остаётся словами. Приём: закрывающая реплика короткая, но полная — в ней есть "
        "число, условия, на которых оно держится, и вопрос-подтверждение.",
        "The conversation went well, the other side warmed up, and in the moment you say: "
        "“Great, we have a deal!” A deal on what — nobody said. It settles at the last "
        "number the other side named, and everything you negotiated in words stays just "
        "words. The technique: the closing line is short but complete — it holds the "
        "number, the terms the number rests on, and a confirming question.",
    ),
    core=T(
        "Три части закрывающей реплики.\n\n"
        "Число — ваше и в единицах сделки: «88 рублей за штуку», а не «как обсуждали».\n\n"
        "Условия — всё, на чём держится это число: «при годовом контракте с гарантией "
        "объёма, оплата в течение 15 дней». Цифра без условий завтра станет цифрой с "
        "другими условиями.\n\n"
        "Вопрос-подтверждение — «по рукам?», «вас устраивает?». Без него это объявление, "
        "а не договорённость: собеседнику нужно сказать «да» самому.\n\n"
        "Не хватает хоть одной части — закрытие неполное. Без числа сделка встаёт на "
        "последнюю цифру собеседника. Без условий через неделю выяснится, что годовой "
        "контракт «не обсуждали». Без вопроса вы не знаете, согласились ли с вами.\n\n"
        "И закрывайте только ту цифру, которую уже заработали: за ней должны стоять "
        "вскрытые интересы, внешние данные или размен. Иначе закрывающая фраза — это "
        "просто новый торг, и в ответ прозвучит «пока нет».\n\n"
        "В найме это звучит так: «Итак: 230 тысяч, выход первого числа, пересмотр через "
        "полгода по KPI. Принимаете?»",
        "A closing line has three parts.\n\n"
        "The number — yours, in the units of the deal: “88 per unit”, not “as we "
        "discussed”.\n\n"
        "The terms — everything the number rests on: “with an annual volume commitment, "
        "payment within 15 days”. A number without its terms becomes, by tomorrow, a "
        "number with different terms.\n\n"
        "The confirming question — “deal?”, “does that work for you?”. Without it the "
        "line is an announcement, not an agreement: the other side has to say yes "
        "themselves.\n\n"
        "Miss any one part and the close is incomplete. Without the number, the deal "
        "settles at their last figure. Without the terms, a week later it turns out the "
        "annual contract “was never discussed”. Without the question, you do not know "
        "whether they agreed.\n\n"
        "And only close on a number you have already earned: it needs uncovered "
        "interests, outside data or a trade behind it. Otherwise the closing line is just "
        "another round of haggling, and the answer will be “not yet”.\n\n"
        "In hiring it sounds like this: “So: 230k, starting on the first, a KPI review in "
        "six months. Do you accept?”",
    ),
    phrases=(
        Phrase(
            T("Фиксируем: 88 рублей за штуку при годовом контракте с гарантией объёма. "
              "По рукам?",
              "Let us lock it in: 88 per unit with an annual volume commitment. Do we have "
              "a deal?"),
            moves=("accept",),
            when=T("Главная форма, когда за цифрой уже стоит размен.",
                   "The main form, once a trade stands behind the number."),
        ),
        Phrase(
            T("Итак, пакет целиком: 88 рублей, годовой контракт, оплата в течение 15 дней "
              "после поставки. Меня устраивает — вас?",
              "So, the whole package: 88 per unit, an annual contract, payment within 15 "
              "days of delivery. That works for us — does it work for you?"),
            moves=("accept", "tradeoff"),
            when=T("Когда условий несколько и важно назвать их все.",
                   "When there are several terms and all of them must be named."),
        ),
        Phrase(
            T("Давайте проговорим, на чём сходимся, чтобы не было разночтений: цена 88, "
              "годовой объём, первая поставка через две недели. Всё верно?",
              "Let me go over what we are settling on, so nothing gets misread: price 88, "
              "annual volume, first delivery in two weeks. Is that right?"),
            when=T("Сверка перед рукопожатием, если разговор был длинным.",
                   "A check before the handshake, if the conversation was long."),
        ),
        Phrase(
            T("Прежде чем пожать руки — давайте назовём цифру, на которой сходимся. Я "
              "правильно понимаю, что это 88?",
              "Before we shake hands, let us name the number we are settling on. Let me "
              "make sure: it is 88?"),
            moves=("acknowledge",),
            when=T("Если собеседник закрывает сам и без числа.",
                   "If the other side closes on their own and without a number."),
        ),
        Phrase(
            T("Тогда договорились: 88 при годовом контракте. Сегодня пришлю письмо с "
              "резюме.",
              "Then we have a deal: 88 with an annual contract. I will send a summary email "
              "today."),
            moves=("accept",),
            when=T("После её «да» — и сразу про письменное резюме.",
                   "After her yes — and straight on to the written summary."),
        ),
    ),
    dialog=Dialog(
        setup=T("Закупки. Ваша цель — 86 ₽ за штуку. Ирина пока держит 97.",
                "Procurement. Your target is 86 per unit. Irina is holding at 97 for now."),
        opening=(
            you("Ирина, что для вас важнее всего, кроме цены: загрузка производства, график "
                "оплаты или срок контракта?",
                "Irina, apart from the price, what matters more to you: keeping the factory "
                "loaded, the payment schedule, or the contract term?",
                moves=("interests_probe",), reveals=True),
            them("Загрузка. Годовой объём был бы для нас спасением. Но пока цена — 97.",
                 "Keeping it loaded. An annual volume would be a lifesaver for us. But for now "
                 "the price is 97."),
        ),
        bad=(
            you("Отлично, договорились!", "Great, we have a deal!", moves=("accept",)),
            them("Прекрасно! Оформляю на 97, как я и говорила.",
                 "Lovely! I will put it through at 97, as I said."),
        ),
        bad_why=T(
            "«Договорились» без числа — это согласие на то, что лежит на столе, то есть на "
            "97. Вы узнали самое ценное — что годовой объём для Ирины спасение, — и не "
            "обменяли это ни на рубль. Годовой контракт, если вы его потом предложите, уже "
            "будет подарком.",
            "“We have a deal” without a number is agreement to whatever is on the table — "
            "that is, 97. You learned the most valuable thing — that an annual volume would "
            "be a lifesaver for Irina — and did not trade it for a single rouble. If you "
            "offer the annual contract later, it will be a gift.",
        ),
        good=(
            you("Давайте зафиксируем пакет: 88 рублей за штуку при годовом контракте с "
                "гарантией объёма. Меня устраивает — вас?",
                "Let us lock in the package: 88 per unit with an annual volume commitment. "
                "That works for us — does it work for you?",
                moves=("accept", "tradeoff")),
            them("88 с годовым объёмом… Да, меня устраивает. Готовлю договор.",
                 "88 with an annual volume… Yes, that works for me. I will draw up the "
                 "contract."),
        ),
        good_why=T(
            "В одной реплике — число, условие, на котором оно держится, и вопрос. Цифра 88 "
            "заработана: Ирина только что назвала загрузку своей главной заботой, и "
            "годовой объём отвечает именно на неё. Разница между двумя ветками — девять "
            "рублей за штуку, и вся она сделана одной фразой на финише.",
            "One line holds the number, the term it rests on, and a question. The 88 is "
            "earned: Irina has just named a loaded line as her main concern, and the annual "
            "volume answers exactly that. The gap between the two branches is nine roubles "
            "a unit, and all of it comes down to one line at the finish.",
        ),
    ),
    mistakes=(
        Mistake(
            T("«Договорились!» без числа",
              "“We have a deal!” with no number"),
            T("Голое согласие закрывает сделку на последней цифре собеседника. Всё, что "
              "вы наработали, но не назвали в закрывающей фразе, остаётся у него.",
              "A bare yes closes the deal at the other side's last figure. Everything you "
              "worked for but did not name in the closing line stays with them."),
        ),
        Mistake(
            T("Число без условий",
              "A number without its terms"),
            T("«88, по рукам» — а годовой контракт? Через неделю придёт договор на 88 без "
              "гарантии объёма или с ней, но по 91. Условия, на которых держится цифра, "
              "звучат в той же фразе.",
              "“88, deal” — and the annual contract? A week later a contract arrives at 88 "
              "with no volume guarantee, or with one but at 91. The terms the number rests "
              "on belong in the same line."),
        ),
        Mistake(
            T("Закрывать цифрой, которую не заработали",
              "Closing on a number you have not earned"),
            T("Назвать 86 в закрывающей реплике, когда собеседник на 94 и ничего не "
              "произошло, — это не закрытие, а новый торг. Ответом будет «пока нет» и "
              "лишнее напряжение.",
              "Naming 86 in the closing line when the other side is at 94 and nothing has "
              "happened is not a close but another round of haggling. The answer will be "
              "“not yet” and extra tension."),
        ),
    ),
    limits=(
        Limit(
            T("Решение принимает комиссия или совет директоров: устное «по рукам» ничего "
              "не закрывает.",
              "A committee or a board decides: a spoken “deal” closes nothing."),
            T("Закрывайте следующий шаг, а не сделку: «Фиксируем 88 при годовом контракте "
              "как наше общее предложение на вашу комиссию. Когда будет решение?»",
              "Close the next step, not the deal: “Let us record 88 with an annual contract "
              "as our joint proposal to your committee. When will there be a decision?”"),
        ),
        Limit(
            T("Собеседник закрывает сам и называет свою цифру: «Ну что, 91 — и по рукам?»",
              "The other side closes first with their own number: “So, 91 and it is a "
              "deal?”"),
            T("Не отвечайте «договорились». Ответьте своим полным закрытием — число, "
              "условия, вопрос — или пробным закрытием из урока 1 этого блока.",
              "Do not answer “deal”. Answer with your own complete close — number, terms, "
              "question — or with a trial close from lesson 1 of this block."),
        ),
    ),
)
