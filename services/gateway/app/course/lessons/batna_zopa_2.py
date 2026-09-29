"""BATNA и ZOPA · урок 2 — «BATNA ≠ красная линия»."""

from app.course.lessons._model import (Dialog, LessonMaterial, Limit, Mistake,
                                       Phrase, T, them, you)

MATERIAL = LessonMaterial(
    block="batna-zopa",
    lesson=2,
    scenario_id="investor",
    technique=T("Вывести красную линию из альтернативы",
                "Derive your red line from your alternative"),
    why=T(
        "Красную линию обычно ставят на глаз: «второй фонд даёт 20% — значит, больше 20 не "
        "отдам». Но цифра альтернативы — ещё не её цена. Второй фонд закроется на два "
        "месяца позже и не принесёт экспертизы в отрасли. Если этого не посчитать, можно "
        "отказаться от сделки, которая лучше вашей альтернативы, — или согласиться на ту, "
        "что хуже. Приём заставляет посчитать границу до разговора, чтобы за столом не "
        "выяснять её под давлением.",
        "People usually set their red line by eye: “the second fund offers 20%, so I will "
        "not give more than 20.” But the alternative's headline number is not its real "
        "price. The second fund will close two months later and brings no industry "
        "expertise. Leave that uncounted and you may turn down a deal that beats your "
        "alternative — or accept one that is worse. This technique makes you work out the "
        "limit before the conversation, so you are not discovering it under pressure at "
        "the table.",
    ),
    core=T(
        "BATNA — ваш лучший вариант, если здесь не договоритесь. Красная линия — худшее "
        "условие, на которое вы согласитесь здесь. Это разные вещи, и связывает их простая "
        "формула: красная линия = ценность альтернативы плюс или минус цена перехода к ней.\n\n"
        "Считают так. Запишите альтернативу с её цифрой: второй фонд, 20% доли. Выпишите, "
        "чего она стоит сверх цифры: два месяца задержки — это два месяца расходов без новых "
        "денег и отложенный найм; без отраслевой экспертизы связи и опыт придётся искать "
        "самим. Переведите это в единицы сделки: сколько процентов доли вы отдали бы, чтобы "
        "закрыться на два месяца раньше с фондом, который знает рынок? Скажем, четыре пункта. "
        "Красная линия — 24%: всё, что лучше, выгоднее альтернативы, всё, что хуже, — нет.\n\n"
        "Знак зависит от того, что прячет альтернатива. Есть у неё скрытые издержки, как "
        "здесь, — граница мягче её цифры. Рискованнее текущая сделка — строже. Пример из "
        "найма: второй оффер на 210 тысяч, но проект скучнее, и кандидат спокойно "
        "соглашается на 195 там, где ему интересно.\n\n"
        "За столом красная линия не двигается. Хочется её подвинуть — возьмите паузу и "
        "пересчитайте с новыми фактами. А вслух держите её без угроз: «это хуже нашей "
        "альтернативы» говорит то же, что «иначе уходим», но оставляет собеседнику место "
        "для движения.",
        "Your BATNA is your best option if you do not agree here. Your red line is the worst "
        "term you will accept here. They are different things, linked by a simple formula: "
        "red line = the value of the alternative, plus or minus the cost of switching to "
        "it.\n\n"
        "Here is how to work it out. Write down the alternative with its number: a second "
        "fund, 20% equity. List what it costs on top of that number: two months of delay "
        "means two months of spending with no new money and hiring put on hold; with no "
        "industry expertise you will have to find the contacts and experience yourselves. "
        "Convert that into the deal's own units: how many points of equity would you give "
        "to close two months sooner with a fund that knows the market? Say four. Your red "
        "line is 24%: anything better beats the alternative, anything worse does not.\n\n"
        "The direction depends on what the alternative hides. If it carries hidden costs, as "
        "here, the limit is looser than its number. If the current deal is the riskier one, "
        "it is stricter. A hiring example: a second offer at 210k, but on a duller project — "
        "so the candidate is content to accept 195 where the work is interesting.\n\n"
        "At the table the red line does not move. If you feel like moving it, take a break "
        "and recalculate with the new facts. And hold it out loud without threats: “that is "
        "worse than our alternative” says the same as “or we walk”, but leaves the other "
        "side room to move.",
    ),
    phrases=(
        Phrase(
            T("Это предложение хуже нашей альтернативы, поэтому принять его я не могу. "
              "Давайте искать, что поменять в условиях, а не в моей границе.",
              "This offer is worse than our alternative, so I cannot accept it. Let us look "
              "for what to change in the terms rather than in my limit."),
            moves=("batna",),
            when=T("Когда предложение перешло вашу красную линию.",
                   "When an offer has crossed your red line."),
        ),
        Phrase(
            T("Мне нужно время посчитать. Я сверю этот вариант со своими расчётами и "
              "вернусь к вам завтра.",
              "I need time to run the numbers. I will check this option against my own "
              "calculations and come back to you tomorrow."),
            when=T("Когда вас торопят принять условие, которого нет в вашем расчёте.",
                   "When you are rushed into a term your calculation does not cover."),
        ),
        Phrase(
            T("Что вы можете дать, кроме денег: экспертизу в отрасли, скорость закрытия? "
              "Для нас это часть цены сделки.",
              "What can you bring besides money: industry expertise, closing speed? For us "
              "that is part of the price of the deal."),
            moves=("open_question",),
            when=T("Чтобы сравнивать с альтернативой не одну цифру, а всё предложение.",
                   "To compare the whole offer with your alternative, not just one number."),
        ),
        Phrase(
            T("Давай посчитаем, во что нам обойдутся два месяца задержки со вторым фондом, — "
              "это и есть наша граница, а не его 20%.",
              "Let us work out what two months of delay with the second fund would cost us — "
              "that is our real limit, not its 20%."),
            when=T("Партнёру по команде до встречи.",
                   "To your co-founder, before the meeting."),
        ),
    ),
    dialog=Dialog(
        setup=T("Раунд. Второй фонд обсуждает с вами 20%, но закроется на два месяца позже и "
                "без отраслевой экспертизы. После нескольких встреч Марина предлагает 22%.",
                "A funding round. A second fund is discussing 20% with you, but it will "
                "close two months later and brings no industry expertise. After several "
                "meetings Marina offers 22%."),
        opening=(
            them("Наше предложение — 22%. Лучше мы не дадим.",
                 "Our offer is 22%. We will not do better than that."),
        ),
        bad=(
            you("Второй фонд даёт 20%. Либо 20, либо мы уходим к ним.",
                "The second fund offers 20%. Either 20, or we walk away to them.",
                moves=("threat",)),
            them("Тогда вам к ним. Под угрозой фонд условия не пересматривает.",
                 "Then go to them. The fund does not revisit terms under threat."),
        ),
        bad_why=T(
            "Красная линия стояла на цифре альтернативы, а не на её цене. 22% лучше того, что "
            "на самом деле даёт второй фонд: там 20, плюс два месяца без денег и без "
            "экспертизы. Вы уходите от сделки, которая выгоднее запасного варианта, — и "
            "уходите угрозой, после которой Марине сдвинуться уже нельзя.",
            "The red line sat on the alternative's number, not its real price. 22% beats what "
            "the second fund actually offers: 20, plus two months without money or "
            "expertise. You are walking away from a deal better than your fallback — and "
            "doing it with a threat, after which Marina cannot move at all.",
        ),
        good=(
            you("Понимаю вашу позицию, и это предмет для разговора. Наша альтернатива — "
                "второй фонд, но он закрывается позже, и это мы тоже учитываем.",
                "I understand your position, and it is worth discussing. Our alternative is a "
                "second fund, but it closes later, and we take that into account too.",
                moves=("acknowledge", "batna")),
            them("Позже — это насколько? Нам как раз важно не затягивать.",
                 "Later by how much? Not dragging this out matters to us."),
            you("Что для вас важнее в сроках закрытия — успеть в этом квартале?",
                "What matters most to you on the closing timeline — getting it done this "
                "quarter?",
                moves=("interests_probe",), reveals=True),
            them("Да. Если закроем до конца квартала, я могу вернуться к комитету с 20%.",
                 "Yes. If we close before quarter end, I can go back to my committee with 20%."),
        ),
        good_why=T(
            "По вашему расчёту 22 лучше альтернативы, поэтому вы не ушли, но и не приняли "
            "сразу. Альтернативу назвали как факт, который учитываете, а не как угрозу. А "
            "потом спросили о том, что для Марины ценно, — о сроках. Быстрое закрытие стоит "
            "вам немного, а ей даёт повод вернуться к комитету с меньшей долей.",
            "By your own calculation 22 beats the alternative, so you neither walked away nor "
            "accepted on the spot. You named the alternative as a fact you are weighing, not "
            "as a threat. Then you asked about what Marina values — timing. A fast close costs "
            "you little and gives her a reason to go back to her committee with a smaller "
            "stake.",
        ),
    ),
    mistakes=(
        Mistake(
            T("Приравнять красную линию к цифре альтернативы",
              "Setting the red line at the alternative's headline number"),
            T("Цифра — только часть цены альтернативы. Не посчитав задержку, риск и потерю "
              "экспертизы, вы откажетесь от сделки, которая лучше, или вцепитесь в ту, что "
              "хуже.",
              "The number is only part of the alternative's price. Leave out delay, risk and "
              "lost expertise, and you will refuse a deal that is better or cling to one that "
              "is worse."),
        ),
        Mistake(
            T("Считать границу прямо за столом", "Working out the limit at the table"),
            T("Под давлением граница плывёт: каждая следующая уступка кажется маленькой. "
              "Посчитанная заранее, она держится сама, и решать её заново на каждой реплике "
              "не нужно.",
              "Under pressure the limit drifts: each next concession looks small. Worked out "
              "in advance, it holds on its own, and you do not have to re-decide it with "
              "every line."),
        ),
        Mistake(
            T("Держать границу угрозой", "Holding the limit with a threat"),
            T("«Больше не дадим, иначе уходим» сообщает не о вашей границе, а о раздражении. "
              "Спокойное «это хуже нашей альтернативы» говорит то же и оставляет собеседнику "
              "место для движения.",
              "“Not a point more, or we walk” signals irritation, not a limit. A calm “that "
              "is worse than our alternative” says the same thing and leaves the other side "
              "room to move."),
        ),
    ),
    limits=(
        Limit(
            T("Альтернативы нет или она совсем слабая.",
              "There is no alternative, or it is very weak."),
            T("Тогда границу задаёт не альтернатива, а жизнь без сделки: сколько месяцев вы "
              "протянете без денег, что потеряете, если не договоритесь. Посчитайте это так "
              "же честно — и займитесь альтернативой до следующей встречи.",
              "Then the limit is set not by an alternative but by life without the deal: how "
              "many months you can last without money, what you lose if you do not agree. "
              "Work that out just as honestly — and build an alternative before the next "
              "meeting."),
        ),
        Limit(
            T("Плюсы альтернативы не переводятся в цифру — например, «там интереснее».",
              "The alternative's upside does not convert into a number — “the work there is "
              "more interesting”, say."),
            T("Сравните варианты попарно: «22% здесь или 20% через два месяца там — что я "
              "выберу?» Двигайте цифру, пока ответ не поменяется. Точка, где он меняется, и "
              "есть граница.",
              "Compare the options in pairs: “22% here or 20% there in two months — which "
              "would I take?” Move the number until your answer flips. The point where it "
              "flips is your limit."),
        ),
    ),
)
