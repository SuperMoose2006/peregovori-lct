"""Якорь и защита от него · урок 3 — «Защита: не контр-цифра»."""

from app.course.lessons._model import (Dialog, LessonMaterial, Limit, Mistake,
                                       Phrase, T, them, you)

MATERIAL = LessonMaterial(
    block="anchoring",
    lesson=3,
    scenario_id="used_car",
    technique=T("Разминировать чужой якорь: назвать, спросить, сверить, и только потом цифра",
                "Defuse their anchor: name it, ask, check it, and only then your number"),
    why=T(
        "Услышав завышенную цифру, хочется ответить такой же заниженной: «1200? Даю 900». "
        "Кажется, что так вы уравновешиваете. На деле вы соглашаетесь на перетягивание "
        "каната: итог окажется где-то посередине между двумя крайностями, и выиграет не "
        "правый, а тот, кто упрётся сильнее. Приём — четыре шага, в которых ваша цифра "
        "звучит последней, когда у стола уже есть общая мерка.",
        "When you hear an inflated number, the urge is to answer with an equally deflated "
        "one: “1200? I will give you 900.” It feels like balancing things out. In fact you "
        "are agreeing to a tug of war: the outcome lands somewhere between two extremes, and "
        "it goes not to whoever is right but to whoever digs in harder. The technique is four "
        "steps in which your number comes last, once the table has a shared yardstick.",
    ),
    core=T(
        "Шаг 1. Назвать якорь якорем — спокойно, без оценки: «Понимаю, 1200 — ваша стартовая "
        "цифра». Так вы показываете, что не приняли её за факт, и никого не обижаете.\n\n"
        "Шаг 2. Спросить, на чём она основана. Иногда за цифрой есть настоящая причина — "
        "новая резина, свежее обслуживание, — и её лучше узнать сейчас, чем услышать потом "
        "как повод не уступать. Иногда за цифрой нет ничего, и это становится видно обоим.\n\n"
        "Шаг 3. Предложить внешнюю мерку: сопоставимые объявления, прайсы, обзоры.\n\n"
        "Шаг 4. Назвать свою цифру ВНУТРИ этой мерки, учтя то, что узнали на шаге 2: «по "
        "объявлениям 1050–1100, с новой резиной — 1090».\n\n"
        "Каждый шаг делает следующий естественным. Пропустите третий — и ваша цифра станет "
        "просто второй крайностью.\n\n"
        "Со сроками то же самое. Подрядчик говорит резиденту ОЭЗ: «Монтаж цеха — шесть "
        "месяцев». Не отвечайте «три!». Спросите, из чего складываются шесть, предложите "
        "нормативный срок на такой объём работ и уже внутри него ищите реальную дату.",
        "Step 1. Name the anchor as an anchor — calmly, without judgement: “I understand 1200 "
        "is your starting figure.” That shows you have not taken it as fact, and it offends "
        "no one.\n\n"
        "Step 2. Ask what it rests on. Sometimes there is a real reason behind the number — "
        "new tyres, a recent service — and you would rather learn it now than hear it later "
        "as a reason not to budge. Sometimes there is nothing behind it, and both of you can "
        "see that.\n\n"
        "Step 3. Offer an external yardstick: comparable listings, price lists, surveys.\n\n"
        "Step 4. Put your number INSIDE that yardstick, allowing for what you learned in "
        "step 2: “the listings say 1050 to 1100; with the new tyres, 1090”.\n\n"
        "Each step makes the next one natural. Skip the third and your number becomes just "
        "the second extreme.\n\n"
        "Deadlines work the same way. A contractor tells a resident of a special economic "
        "zone: “Fitting out the workshop takes six months.” Do not answer “three!”. Ask what "
        "the six are made of, propose the standard duration for that scope of work, and look "
        "for the real date inside it.",
    ),
    phrases=(
        Phrase(
            T("Понимаю, 1200 — ваша стартовая цифра. Давайте посмотрим, на чём она основана.",
              "I understand 1200 is where you are starting. Let us look at what it is based on."),
            moves=("acknowledge",),
            when=T("Шаг 1 — сразу после чужой цифры.",
                   "Step 1 — right after their number."),
        ),
        Phrase(
            T("Что входит в эти 1200? Если у машины есть что-то, чего нет у других, я хочу это "
              "знать.",
              "What goes into that 1200? If the car has something others do not, I want to "
              "know."),
            when=T("Шаг 2 — чтобы довод всплыл сейчас, а не в конце.",
                   "Step 2 — so the argument surfaces now, not at the end."),
        ),
        Phrase(
            T("Давайте сверимся с рынком: вот три сопоставимых объявления с похожим пробегом.",
              "Let us check against the market: here are three comparable listings with similar "
              "mileage."),
            moves=("objective_criteria",),
            when=T("Шаг 3.", "Step 3."),
        ),
        Phrase(
            T("Я предлагаю 1090: это внутри диапазона сопоставимых объявлений, от 1050 до 1100, "
              "с учётом новой резины.",
              "I propose 1090: that sits inside the range of comparable listings, 1050 to 1100, "
              "allowing for the new tyres."),
            moves=("anchor", "objective_criteria"),
            when=T("Шаг 4 — своя цифра внутри мерки.",
                   "Step 4 — your number inside the yardstick."),
        ),
        Phrase(
            T("Цену вы назвали, я её услышал. Но спорить цифрой против цифры невыгодно нам "
              "обоим — давайте держаться объективных данных.",
              "You have named your price and I have heard it. But trading number for number "
              "helps neither of us — let us stick to objective data."),
            moves=("objective_criteria",),
            when=T("Когда вас тянут в перетягивание каната.",
                   "When you are being pulled into a tug of war."),
        ),
    ),
    dialog=Dialog(
        setup=T("Покупка машины с рук. Сергей первым назвал 1200 тысяч. По объявлениям такие "
                "машины стоят 1050–1100.",
                "Buying a used car. Sergey named 1200 first. Listings put cars like this at "
                "1050 to 1100."),
        opening=(
            them("1200. И я уже уступил — изначально хотел 1250.",
                 "1200. And I have already come down — I wanted 1250 at first."),
        ),
        bad=(
            you("1200? Даю 900.", "1200? I will give you 900."),
            them("Тогда разговаривать не о чем. 1180 — и то много уступаю.",
                 "Then there is nothing to talk about. 1180, and that is already a lot."),
            you("Ладно, 1000.", "Fine, 1000."),
            them("1170.", "1170."),
        ),
        bad_why=T(
            "Крайность в ответ на крайность. Середина между 900 и 1200 — 1050, и кажется, что "
            "это честно. Но середина зависит не от рынка, а от того, чья цифра наглее. Сергей "
            "свою защищает, а вы свою бросили через одну реплику: теперь вы уступаете сотнями, "
            "а он — десятками.",
            "An extreme in answer to an extreme. The midpoint of 900 and 1200 is 1050, and that "
            "looks fair. But the midpoint depends not on the market but on whose number was "
            "bolder. Sergey is defending his, and you dropped yours after one line: now you "
            "give ground in hundreds and he gives it in tens.",
        ),
        good=(
            you("Понимаю, 1200 — ваша стартовая цифра. Что в неё входит? Если у машины есть "
                "что-то, чего нет у других, я хочу это знать.",
                "I understand 1200 is your starting figure. What goes into it? If the car has "
                "something others do not, I want to know.",
                moves=("acknowledge",)),
            them("Резина новая, в прошлом месяце ставил. И обслуживание всё по книжке.",
                 "The tyres are new, fitted last month. And it has been serviced by the book."),
            you("Это справедливо учесть. Давайте сверимся с рынком: вот три сопоставимых "
                "объявления с похожим пробегом, такие машины продаются за 1050–1100.",
                "That makes sense, and it is worth taking into account. Let us check against the "
                "market: here are three comparable listings with similar mileage — cars like "
                "this sell for 1050 to 1100.",
                moves=("acknowledge", "objective_criteria")),
            them("С объявлениями спорить не буду. А вы сколько предлагаете?",
                 "I will not argue with the listings. So what are you offering?"),
            you("Я предлагаю 1090: это внутри диапазона сопоставимых объявлений, с учётом новой "
                "резины.",
                "I propose 1090: that sits inside the range of comparable listings, allowing for "
                "the new tyres.",
                moves=("anchor", "objective_criteria")),
            them("1090 мало — давайте 1110, и обсуждаем.",
                 "1090 is low — let us say 1110 and talk."),
        ),
        good_why=T(
            "Цифра Сергея не стала точкой отсчёта: вы признали её как его позицию, спросили, "
            "что за ней, — и получили настоящий довод, новую резину. Потом положили на стол "
            "рынок и поставили свою цифру внутри него, учтя его довод. Теперь Сергей спорит с "
            "объявлениями, а не с вами, и торг идёт в коридоре 1090–1110, а не 900–1200.",
            "Sergey's number did not become the reference point: you acknowledged it as his "
            "position, asked what sat behind it — and got a real argument, the new tyres. Then "
            "you put the market on the table and placed your number inside it, allowing for his "
            "point. Now Sergey is arguing with the listings, not with you, and the haggling "
            "runs between 1090 and 1110, not between 900 and 1200.",
        ),
    ),
    mistakes=(
        Mistake(
            T("Контр-цифра вместо вопроса", "A counter-number instead of a question"),
            T("«А я даю 900» — вы признали его 1200 одной из двух законных крайностей и "
              "согласились делить разницу. Мерку для такого деления никто не назвал, значит, "
              "делить будет упрямство.",
              "“And I offer 900” — you have accepted his 1200 as one of two legitimate extremes "
              "and agreed to split the difference. Nobody has named a yardstick for the split, "
              "so stubbornness will do the splitting."),
        ),
        Mistake(
            T("Пропустить вопрос «на чём основано»", "Skipping “what is it based on?”"),
            T("Сразу выложить свои объявления, не выслушав его. Он услышит «ваша цифра ничего не "
              "стоит» и начнёт защищаться. А настоящий довод — новая резина — всплывёт в конце "
              "как причина не уступать.",
              "Laying out your listings straight away without hearing him out. He will hear "
              "“your number is worthless” and dig in. And his real argument — the new tyres — "
              "will surface at the end as a reason not to budge."),
        ),
        Mistake(
            T("Назвать свою цифру вне мерки", "Naming your number outside the yardstick"),
            T("Предложить рынок, а потом сказать 950. Вы сами показали, что мерка вам не указ, — "
              "и держаться её он тоже не станет.",
              "Proposing the market and then saying 950. You have shown that the yardstick does "
              "not bind you — so it will not bind him either."),
        ),
    ),
    limits=(
        Limit(
            T("На вопрос «на чём основано» собеседник отвечает «ни на чём, это моя цена» и не "
              "двигается.",
              "Asked what it is based on, the other side says “on nothing, that is my price” and "
              "will not move."),
            T("Не доказывайте. Назовите свою цифру с критерием и спокойно скажите о своей "
              "альтернативе — такой же машине за 1150, пусть и с большим пробегом. Если зоны "
              "сделки нет, её не создаст никакая защита от якоря: идите к альтернативе.",
              "Do not argue the point. Name your number with its criterion and calmly mention "
              "your alternative — the same model at 1150, albeit with higher mileage. If there "
              "is no deal zone, no anchor defence will create one: go with your alternative."),
        ),
        Limit(
            T("Его цифра не завышена, а честна: она совпала с вашей мерой.",
              "Their number is not inflated but fair: it matches your yardstick."),
            T("Не устраивайте защиту ради защиты. Скажите «цифра близка к рынку» и переходите к "
              "условиям: оплата, срок передачи, оформление. Торг ради торга портит отношения за "
              "копейки.",
              "Do not stage a defence for its own sake. Say “that is close to the market” and "
              "move on to terms: payment, handover date, paperwork. Haggling for its own sake "
              "damages the relationship for pennies."),
        ),
    ),
)
