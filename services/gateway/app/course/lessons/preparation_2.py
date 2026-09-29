"""Подготовка к столу · урок 2 — «BATNA работает до стола»."""

from app.course.lessons._model import (Dialog, LessonMaterial, Limit, Mistake,
                                       Phrase, T, them, you)

MATERIAL = LessonMaterial(
    block="preparation",
    lesson=2,
    scenario_id="salary",
    technique=T("Усилить альтернативу до разговора",
                "Strengthen your alternative before the talk"),
    why=T(
        "Силу обычно пытаются создать прямо за столом: говорят твёрже, повторяют «у меня "
        "есть другие варианты», намекают на то, чего нет. Одного вопроса — «какие?» — "
        "хватает, чтобы это рассыпалось. Настоящая сила появляется раньше, у того, кто до "
        "встречи довёл второй вариант до оффера с цифрой и сроком. Приём учит работать с "
        "альтернативой тогда, когда это ещё можно, — до разговора, а за столом назвать её "
        "один раз и спокойно.",
        "People usually try to create strength at the table itself: they sound firmer, keep "
        "repeating “I have other options”, hint at things that do not exist. One question — "
        "“such as?” — is enough to make it collapse. Real strength comes earlier, to whoever "
        "turned their second option into an offer with a figure and a deadline before the "
        "meeting. This technique teaches you to work on your alternative while you still "
        "can — before the conversation — and at the table to name it once, calmly.",
    ),
    core=T(
        "Альтернатива — ваш лучший вариант, если здесь не договоритесь, по-английски BATNA. "
        "Её сила определяется до разговора: за столом вы её уже не поменяете, только "
        "назовёте. Работа с ней — три шага.\n\n"
        "Сделать настоящей. Не «наверное, возьмут в другую компанию», а оффер письмом: "
        "сумма, дата выхода, срок ответа. Не «найдём другого поставщика», а коммерческое "
        "предложение с ценой и сроками поставки.\n\n"
        "Улучшить. Ускорить финальный этап во второй компании, попросить второго "
        "поставщика о лучшей цене, продумать запасной план на случай, если не выйдет ни там, "
        "ни здесь. Чем лучше альтернатива, тем выше ваша красная линия.\n\n"
        "Знать её слабости. «Проект скучнее», «поставщик дальше и с риском качества». "
        "Слабости не повод прятать альтернативу от себя — это причина, по которой ваша "
        "граница здесь ниже её цифры.\n\n"
        "За столом альтернативу достаточно назвать один раз, спокойно и с опорой — рядом с "
        "внешним критерием или доводом. После этого вернитесь к интересам собеседника. "
        "Названная альтернатива почти всегда воспринимается как лёгкое давление, даже если "
        "вы были предельно вежливы. Эту цену платят один раз, а не на каждой реплике. И "
        "цифру альтернативы называть не обязательно: если она ниже того, что вы просите, "
        "«у меня есть 210» сообщает, что 211 вас уже устроит.",
        "Your alternative is your best option if you do not agree here — your BATNA. Its "
        "strength is decided before the conversation: at the table you cannot change it, "
        "only name it. Working on it takes three steps.\n\n"
        "Make it real. Not “the other company will probably hire me” but an offer in "
        "writing: the amount, the start date, the deadline to reply. Not “we will find "
        "another supplier” but a written quote with a price and delivery terms.\n\n"
        "Improve it. Speed up the final stage at the other company, ask the second supplier "
        "for a better price, work out a fallback in case neither option comes through. The "
        "better your alternative, the higher your red line.\n\n"
        "Know its weaknesses. “A duller project”, “a supplier further away with quality "
        "risk”. Weaknesses are no reason to hide the alternative from yourself — they are "
        "why your limit here sits below its headline number.\n\n"
        "At the table it is enough to name the alternative once, calmly and with backing — "
        "next to an outside criterion or a reason. Then go back to the other side's "
        "interests. A named alternative nearly always lands as mild pressure, however "
        "politely you put it. That price is paid once, not with every line. And you do "
        "not have to name the alternative's figure: if it is below what you are asking, "
        "“I have 210 elsewhere” tells them 211 will do.",
    ),
    phrases=(
        Phrase(
            T("Мне поступило предложение, и ответ нужно дать до пятницы. Можно ли ускорить ваш "
              "финальный этап?",
              "I have received an offer and need to reply by Friday. Could we speed up your "
              "final stage?"),
            when=T("Второй компании, до разговора с первой, — чтобы альтернатива успела стать "
                   "оффером.",
                   "To the other company, before your main conversation — so the alternative "
                   "has time to become an offer."),
        ),
        Phrase(
            T("Пришлите, пожалуйста, оффер письмом: сумма, дата выхода и срок, до которого он "
              "действует.",
              "Could you send the offer in writing, please: the amount, the start date and "
              "how long it stays open."),
            when=T("Альтернатива без письма — слух, а не альтернатива.",
                   "An alternative that is not in writing is a rumour, not an alternative."),
        ),
        Phrase(
            T("Скажу один раз, чтобы вы видели картину: у меня есть второй оффер, а по "
              "медиане независимых обзоров роль стоит 230. Выбрать я хочу вас — давайте "
              "искать цифру здесь.",
              "Let me say this once so you see the full picture: I have an alternative — a "
              "second offer — and the median of independent surveys for this role is 230. I "
              "want to choose you, so let us find the figure here."),
            moves=("batna", "objective_criteria"),
            when=T("За столом — один раз и вместе с критерием.",
                   "At the table — once, and together with a criterion."),
        ),
        Phrase(
            T("На этом про другие варианты всё. Мне интереснее понять, что для вас важно в "
              "бюджете отдела.",
              "That is all I will say about other options. What I would really like to "
              "understand is what matters to you in the team budget."),
            moves=("interests_probe",), reveals=True,
            when=T("Сразу после того, как альтернатива названа.",
                   "Straight after the alternative has been named."),
        ),
    ),
    dialog=Dialog(
        setup=T("Найм. Дмитрий предложил 200 тысяч. В первом варианте у вас нет ничего, кроме "
                "надежды на другую компанию. Во втором вы до встречи довели её до письменного "
                "оффера на 210.",
                "Hiring. Dmitry has offered 200k. In the first version you have nothing but "
                "hope that another company will come through. In the second, before the "
                "meeting, you turned that into a written offer at 210."),
        opening=(
            them("Могу предложить 200 тысяч. Это хорошая цифра.",
                 "I can offer 200k. That is a good number."),
        ),
        bad=(
            you("У меня есть другое предложение, так что думайте быстрее.",
                "I have another offer, so you had better think fast.",
                moves=("batna",)),
            them("Какое? На какую сумму?", "What offer? For how much?"),
            you("Ну... хорошее. Или 230, или я ухожу туда.",
                "Well... a good one. 230, or I walk.",
                moves=("threat",)),
            them("Тогда, наверное, вам стоит его принять.",
                 "Then perhaps you should take it."),
        ),
        bad_why=T(
            "Альтернативы не было — была надежда. Её назвали как нажим, и на первом же "
            "уточняющем вопросе она рассыпалась. Дальше прозвучала угроза, которую нечем "
            "подкрепить, и Дмитрий спокойно предложил вам уйти: он понял, что уходить "
            "некуда.",
            "There was no alternative — only hope. It was used as pressure, and it collapsed "
            "at the first follow-up question. Then came a threat with nothing behind it, and "
            "Dmitry calmly invited you to leave: he could tell there was nowhere to go.",
        ),
        good=(
            you("Скажу один раз, чтобы вы видели картину: у меня есть второй оффер, а по "
                "медиане независимых обзоров роль стоит 230. Выбрать я хочу вас — давайте "
                "искать цифру здесь.",
                "Let me say this once so you see the full picture: I have an alternative — a "
                "second offer — and the median of independent surveys for this role is 230. "
                "I want to choose you, so let us find the figure here.",
                moves=("batna", "objective_criteria")),
            them("Второй оффер — понятно. Но 230 выше, чем мы планировали.",
                 "A second offer — understood. But 230 is more than we planned for."),
            you("На этом про другие варианты всё. Мне интереснее понять, что для вас важно в "
                "бюджете отдела.",
                "That is all I will say about other options. What I would really like to "
                "understand is what matters to you in the team budget.",
                moves=("interests_probe",), reveals=True),
            them("Бюджет утверждён на год, и перерасход мне придётся объяснять.",
                 "The budget is set for the year, and I would have to explain any overrun."),
        ),
        good_why=T(
            "Альтернатива была настоящей — письменный оффер с цифрой, — поэтому хватило "
            "назвать её один раз и спокойно. Рядом стоял внешний критерий, и 230 держалось не "
            "на вашем желании. Сразу после этого вы ушли от альтернативы к интересам Дмитрия и "
            "узнали главное: его ограничение — годовой бюджет. С этим уже можно работать, "
            "например пересмотром через полгода.",
            "The alternative was real — a written offer with a figure — so naming it once, "
            "calmly, was enough. An outside criterion stood next to it, so 230 rested on more "
            "than your wish. Straight after that you left the alternative and turned to "
            "Dmitry's interests, and learned the key thing: his constraint is the annual "
            "budget. That is something you can work with — a review in six months, for "
            "example.",
        ),
    ),
    mistakes=(
        Mistake(
            T("Называть альтернативу, которой нет", "Naming an alternative you do not have"),
            T("«Есть другие варианты» без цифры и письма рассыпается на вопросе «какие?». "
              "После этого не верят и настоящим вашим доводам.",
              "“I have other options” with no figure and nothing in writing collapses at "
              "“such as?”. After that, even your genuine arguments stop being believed."),
        ),
        Mistake(
            T("Повторять альтернативу на каждой реплике",
              "Repeating the alternative in every line"),
            T("Первый раз это информация, дальше — давление, и напряжение растёт без всякой "
              "пользы. Назовите один раз и вернитесь к интересам собеседника.",
              "The first time it is information; after that it is pressure, and tension rises "
              "for no benefit. Name it once and go back to the other side's interests."),
        ),
        Mistake(
            T("Прятать от себя слабости альтернативы",
              "Hiding the alternative's weaknesses from yourself"),
            T("«Проект скучнее» — не мелочь. Забудете её — поставите красную линию на 210 и "
              "уйдёте от 205 здесь, хотя для вас они выгоднее второго оффера.",
              "“A duller project” is not a detail. Forget it and you will set your red line "
              "at 210 and walk away from 205 here — even though 205 here beats the second "
              "offer for you."),
        ),
    ),
    limits=(
        Limit(
            T("Альтернативу усилить нельзя: рынок узкий, второго работодателя или "
              "поставщика нет.",
              "The alternative cannot be strengthened: the market is narrow, there is no "
              "second employer or supplier."),
            T("Усиливайте то, что будет без сделки: запасной план — остаться на текущем "
              "месте, продлить старый договор, сделать своими силами — и знайте его цену. И "
              "больше опирайтесь на объективные критерии: они дают вес и без альтернативы.",
              "Strengthen what happens without the deal: a fallback — staying in your current "
              "job, extending the old contract, doing it in-house — and know what it costs. "
              "And lean harder on objective criteria: they carry weight even without an "
              "alternative."),
        ),
        Limit(
            T("Собеседник держится за отношения и любое упоминание другого варианта читает "
              "как угрозу.",
              "The other side values the relationship and hears any mention of another option "
              "as a threat."),
            T("Пусть альтернатива работает молча: она задаёт вашу красную линию и ваше "
              "спокойствие. Вслух — критерии и размен условий.",
              "Let the alternative work in silence: it sets your red line and your composure. "
              "Out loud, use criteria and trades."),
        ),
    ),
)
