"""Якорь и защита от него · урок 1 — «Эффект якоря»."""

from app.course.lessons._model import (Dialog, LessonMaterial, Limit, Mistake,
                                       Phrase, T, them, you)

MATERIAL = LessonMaterial(
    block="anchoring",
    lesson=1,
    scenario_id="used_car",
    technique=T("Не считать от чужой цифры", "Do not count from their number"),
    why=T(
        "Продавец называет 1200 тысяч, и вы невольно начинаете думать: «Скинет до 1100 — "
        "уже хорошо». Первая названная цифра тянет исход к себе, даже когда обе стороны "
        "знают, что она завышена. Это и есть якорь — цифра, от которой начинают считать. "
        "Ошибка в том, чтобы принять её за точку отсчёта и торговаться «от неё вниз»: "
        "каждая скинутая тысяча кажется победой, хотя вы всё ещё платите сверх рынка. "
        "Приём: не считать от чужой цифры, а вернуть разговор к внешней мерке.",
        "The seller says 1200, and without meaning to you start thinking: “If he comes down "
        "to 1100, that is a win.” The first number named pulls the outcome toward itself, even "
        "when both sides know it is inflated. That is an anchor — the number everyone starts "
        "counting from. The mistake is to take it as your reference point and haggle “down "
        "from it”: every thousand knocked off feels like a win while you are still paying "
        "above the market. The technique: do not count from their number; bring the "
        "conversation back to an external yardstick.",
    ),
    core=T(
        "Якорь работает не потому, что его цифра верна, а потому, что она прозвучала первой: "
        "голове нужно, от чего считать, и она хватается за то, что услышала. Защита — "
        "иметь свою точку отсчёта и не менять её на чужую.\n\n"
        "До разговора. Выясните мерку: цены сопоставимых объявлений, свою альтернативу "
        "(такая же модель за 1150, но с большим пробегом), свою красную линию — цену, выше "
        "которой вы не покупаете. Тогда чужая цифра упадёт не на пустое место.\n\n"
        "В разговоре. Услышав якорь, не отвечайте на него сразу цифрой — ни «а за 1150?», ни "
        "встречной крайностью. Отметьте цифру как его позицию, спросите, откуда она, и "
        "предложите считать от внешней мерки. Сравнивайте любое предложение с рынком, а не с "
        "первой цифрой: вопрос не «сколько он скинул», а «насколько это выше рыночной "
        "цены».\n\n"
        "В закупках якорь выглядит как «прайс 100 рублей за штуку, для вас 95». Эти 95 — не "
        "скидка, а якорь: сравнивайте их с прайсами других поставщиков на ту же позицию, а "
        "не со 100.",
        "An anchor works not because its number is right but because it came first: the mind "
        "needs something to count from and grabs whatever it heard. The defence is to have "
        "your own reference point and not swap it for theirs.\n\n"
        "Before the talk. Find your yardstick: prices in comparable listings, your "
        "alternative (the same model at 1150, but with higher mileage), your red line — the "
        "price above which you will not buy. Then their number does not land on empty "
        "ground.\n\n"
        "During the talk. When you hear the anchor, do not answer it with a number straight "
        "away — neither “how about 1150?” nor an extreme counter. Mark the figure as their "
        "position, ask where it comes from, and propose counting from an external yardstick. "
        "Compare every offer with the market, not with the first number: the question is not "
        "“how much has he come down” but “how far above the market price is this”.\n\n"
        "In procurement an anchor looks like “the list price is 100 per unit, for you 95”. "
        "That 95 is not a discount, it is an anchor: compare it with other suppliers' prices "
        "for the same part, not with 100.",
    ),
    phrases=(
        Phrase(
            T("Вашу цифру я услышал. Давайте пока отложим цифры и посмотрим сопоставимые "
              "объявления — от них и будем считать.",
              "I have heard your number. Let us put numbers aside for a moment and look at "
              "comparable listings — that is what we will count from."),
            moves=("objective_criteria",),
            when=T("Сразу после того, как прозвучала первая цифра.",
                   "Right after the first number has been named."),
        ),
        Phrase(
            T("Давайте считать не от вашей цифры и не от моей, а от рыночных цен: такая модель "
              "с похожим пробегом сейчас стоит от 1050 до 1150.",
              "Let us count neither from your number nor from mine but from market prices: this "
              "model with similar mileage goes for 1050 to 1150 right now."),
            moves=("objective_criteria",),
        ),
        Phrase(
            T("Мне важнее не то, сколько вы уже скинули, а сколько такая машина стоит по "
              "рыночным ценам.",
              "What matters to me is not how far you have already come down, but what a car "
              "like this is worth at market price."),
            moves=("objective_criteria",),
            when=T("Когда продавец говорит «я и так скинул с 1250».",
                   "When the seller says “I have already come down from 1250”."),
        ),
        Phrase(
            T("Дайте мне пять минут — сверю вашу цену с объявлениями, и продолжим.",
              "Give me five minutes to check your price against the listings, and then we will "
              "carry on."),
            when=T("Когда вы не знаете рынка и цифра застала вас врасплох.",
                   "When you do not know the market and the number caught you off guard."),
        ),
    ),
    dialog=Dialog(
        setup=T("Покупка машины с рук. Сергей просит 1200 тысяч. Вы знаете, что такие машины с "
                "похожим пробегом продаются примерно за 1050–1100.",
                "Buying a used car. Sergey is asking 1200. You know that cars like this with "
                "similar mileage sell for roughly 1050 to 1100."),
        opening=(
            them("Машина в отличном состоянии. 1200 — и это я ещё по-божески.",
                 "The car is in excellent shape. 1200, and that is me being generous."),
        ),
        bad=(
            you("1200 многовато. Может, 1150?", "1200 is a bit much. Maybe 1150?"),
            them("1150 — нет. 1180 могу.", "Not 1150. I can do 1180."),
            you("Ну, 1170 — и закончим.", "Well, 1170 and we are done."),
            them("Ладно, 1170. Забирайте.", "All right, 1170. It is yours."),
        ),
        bad_why=T(
            "Вы считали от 1200 вниз и радовались каждой скинутой тысяче. Итог — 1170, на 70–120 "
            "тысяч выше рынка. Сергей не сделал вам скидку: он продал по цене, которую сам и "
            "задал первой цифрой, а вы ни разу не спросили, откуда она.",
            "You counted down from 1200 and celebrated every thousand knocked off. The result "
            "is 1170 — 70 to 120 above the market. Sergey did not give you a discount: he sold "
            "at the price he set with his first number, and you never once asked where it "
            "came from.",
        ),
        good=(
            you("Вашу цифру я услышал. Давайте сначала посмотрим на рыночные цены: по "
                "объявлениям такая модель с похожим пробегом стоит от 1050 до 1100. От этого я "
                "и предлагаю считать.",
                "I have heard your number. Let us first look at market prices: in the listings "
                "this model with similar mileage goes for 1050 to 1100. That is what I suggest "
                "we count from.",
                moves=("objective_criteria",)),
            them("Объявления разные бывают. У меня пробег честный и обслуживание по книжке.",
                 "Listings vary. My mileage is genuine and it has been serviced by the book."),
            you("Это ценю, и это можно учесть: честный пробег по сопоставимым объявлениям "
                "добавляет к цене, но не 150 тысяч. Давайте прикинем, сколько "
                "именно.",
                "I appreciate that, and it can be taken into account: genuine mileage adds to "
                "the price in comparable listings, but not 150k. Let us work out how much "
                "exactly.",
                moves=("acknowledge", "objective_criteria")),
            them("Ладно. Показывайте, что вы там нашли.",
                 "Fine. Show me what you have found."),
        ),
        good_why=T(
            "Вы не ответили на 1200 цифрой и не стали торговаться вниз от неё. Точкой отсчёта "
            "стали рыночные цены, и спорить Сергею теперь приходится с объявлениями, а не с "
            "вами. Его довод про честный пробег вы не отвергли, а вписали в ту же мерку: он "
            "получил уважение к своей машине, а вы — разговор от 1050, а не от 1200.",
            "You did not answer 1200 with a number, and you did not haggle down from it. Market "
            "prices became the reference point, so Sergey now has to argue with the listings, "
            "not with you. You did not dismiss his point about genuine mileage; you fitted it "
            "into the same yardstick: he got respect for his car, and you got a conversation "
            "that starts at 1050, not 1200.",
        ),
    ),
    mistakes=(
        Mistake(
            T("Радоваться «скидке»", "Celebrating the “discount”"),
            T("«Скинул с 1200 до 1150» кажется победой, но скидка считается от его цифры, а не "
              "от рынка. Считайте, насколько цена выше рыночной, а не насколько она ниже первой.",
              "“He came down from 1200 to 1150” feels like a win, but that discount is measured "
              "from his number, not from the market. Count how far the price is above the "
              "market, not how far it is below the first figure."),
        ),
        Mistake(
            T("Сразу ответить встречной крайностью", "Answering with an extreme counter at once"),
            T("«1200? Даю 900» — и вы согласились на перетягивание каната, где итог окажется "
              "где-то посередине, а середина зависит от того, чья цифра наглее. Как защищаться "
              "без контр-цифры, разбирает урок 3.",
              "“1200? I will give you 900” — and you have agreed to a tug of war where the "
              "outcome lands somewhere in the middle, and the middle depends on whose number was "
              "bolder. Lesson 3 covers how to defend without a counter-number."),
        ),
        Mistake(
            T("Прийти без своей мерки", "Showing up without a yardstick of your own"),
            T("Если вы не знаете рыночной цены до разговора, чужая цифра оказывается "
              "единственной на столе. Якорь сильнее всего действует на того, кому не с чем "
              "сравнить.",
              "If you do not know the market price before the talk, their number is the only "
              "one on the table. An anchor works hardest on the person who has nothing to "
              "compare it with."),
        ),
    ),
    limits=(
        Limit(
            T("Внешней мерки нет: вещь редкая, рынок пустой, сравнить не с чем.",
              "There is no external yardstick: the item is rare, the market is empty, there is "
              "nothing to compare with."),
            T("Считайте от своей альтернативы и своей красной линии, назначенной до разговора. "
              "Это ваша личная мерка, и её хватает, чтобы не считать от чужой цифры.",
              "Count from your alternative and from the red line you set before the talk. That "
              "is your personal yardstick, and it is enough to stop you counting from their "
              "number."),
        ),
        Limit(
            T("Первая цифра собеседника оказалась ниже, чем вы ждали, — якорь в вашу пользу.",
              "Their first number is lower than you expected — the anchor works in your favour."),
            T("Не торгуйтесь по инерции и не спешите хватать: проверьте по той же мерке, нет ли "
              "подвоха — пробег, история, документы. Если цена честная, фиксируйте её, а не "
              "выжимайте ещё: лишние десять тысяч не стоят сорванной сделки.",
              "Do not haggle out of habit and do not rush to grab it: check against the same "
              "yardstick for a catch — mileage, history, papers. If the price is honest, lock it "
              "in rather than squeezing further: an extra ten thousand is not worth a lost "
              "deal."),
        ),
    ),
)
