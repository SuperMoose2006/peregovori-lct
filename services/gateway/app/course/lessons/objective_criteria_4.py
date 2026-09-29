"""Объективные критерии · урок 4 — «Шкала „Рычаг“»."""

from app.course.lessons._model import (Dialog, LessonMaterial, Limit, Mistake,
                                       Phrase, T, them, you)

MATERIAL = LessonMaterial(
    block="objective-criteria",
    lesson=4,
    scenario_id="salary",
    technique=T("Сила без давления: сделать так, чтобы вам было трудно возразить",
                "Strength without pressure: make yourself hard to argue with"),
    why=T(
        "Когда позиция кажется слабой, хочется говорить громче: повторять требование, "
        "намекать на уход, ставить сроки. Но нажим поднимает напряжение, а человек под "
        "напряжением не уступает — он защищается. Громкость не делает вас сильнее, она "
        "делает собеседника упрямее. Приём: собирать силу из того, с чем трудно спорить, — "
        "из данных, спокойно названной альтернативы и того, что нужно самому собеседнику.",
        "When your position feels weak, the urge is to get louder: repeat the demand, hint "
        "that you might leave, set deadlines. But pressure raises tension, and a person under "
        "tension does not give way — they defend themselves. Volume does not make you "
        "stronger; it makes the other side more stubborn. The technique: build your strength "
        "from things that are hard to argue with — data, a calmly named alternative, and what "
        "the other side needs for themselves.",
    ),
    core=T(
        "Рычаг — всё, что делает для собеседника несогласие с вами дороже согласия. Три "
        "источника рычага, которые не требуют давления:\n\n"
        "Данные. Внешний критерий с цифрой: спорить приходится не с вами, а с рынком.\n\n"
        "Альтернатива. BATNA — лучший вариант, который у вас останется, если сделка не "
        "состоится: второй оффер, другой поставщик, другой подрядчик. Названная один раз, "
        "спокойно и как факт, она показывает, что вы не блефуете. Названная как угроза, "
        "она превращается в ультиматум и отнимает у собеседника возможность уступить без "
        "проигрыша.\n\n"
        "Интерес собеседника. Сделка решает его задачу: Дмитрию нужно быстро закрыть "
        "позицию и обосновать вилку перед финансами.\n\n"
        "Сильная реплика собирает их вместе: критерий, спокойный факт об альтернативе, то, "
        "что нужно ему. Сверху ничего не добавляйте — ни повторов, ни сроков, ни «или… "
        "или…». Проверка простая: если после вашей реплики человек спорит с вами — это был "
        "нажим. Если он спорит с данными или обсуждает условия — это рычаг.\n\n"
        "Так же звучит резидент ОЭЗ в разговоре с поставщиком металлоконструкций: «Ваша "
        "цена выше отраслевого прайса, и у нас есть второе предложение. Но ваши сроки нам "
        "важнее — давайте найдём цену, которую я смогу обосновать».",
        "Leverage is anything that makes disagreeing with you costlier for the other side "
        "than agreeing. Three sources of leverage that need no pressure:\n\n"
        "Data. An external criterion with a number: they have to argue with the market, not "
        "with you.\n\n"
        "The alternative. Your BATNA is the best option you are left with if this deal falls "
        "through: another offer, another supplier, another contractor. Named once, calmly and "
        "as a fact, it shows you are not bluffing. Named as a threat, it becomes an ultimatum "
        "and takes away the other side's chance to give way without losing.\n\n"
        "Their interest. The deal solves their problem: Dmitry needs to fill the role quickly "
        "and justify the band to finance.\n\n"
        "A strong line puts them together: the criterion, a calm fact about your alternative, "
        "and what they need. Add nothing on top — no repetition, no deadlines, no “either… "
        "or…”. The test is simple: if after your line the person argues with you, it was "
        "pressure. If they argue with the data or discuss terms, it was leverage.\n\n"
        "A resident of a special economic zone talking to a steel-frame supplier sounds the "
        "same: “Your price is above the industry price list, and we have a second offer. But "
        "your lead times matter more to us — let us find a price I can justify.”",
    ),
    phrases=(
        Phrase(
            T("Моя цифра — 230, и она опирается на три независимых обзора зарплат. Если у вас "
              "есть данные другого порядка, давайте положим их рядом.",
              "My figure is 230, and it rests on three independent salary surveys. If you have "
              "data that says otherwise, let us put it side by side."),
            moves=("objective_criteria",),
        ),
        Phrase(
            T("Скажу прямо: у меня есть второй оффер, но проект у вас интереснее, поэтому я "
              "хочу договориться здесь. А 230 — не моя прихоть, это рыночная медиана по "
              "независимым обзорам.",
              "To be straight with you: I have another offer, but your project is more "
              "interesting, which is why I want to agree here. And 230 is not my whim — it is "
              "the market rate according to independent surveys."),
            moves=("batna", "objective_criteria"),
            when=T("Один раз за разговор, и только вместе с данными.",
                   "Once per conversation, and only together with the data."),
        ),
        Phrase(
            T("Вам нужно быстро закрыть позицию — я могу выйти через две недели. Давайте найдём "
              "цифру, которую вы сможете обосновать финансам.",
              "You need to fill the role quickly, and I can start in two weeks. Let us find a "
              "figure you can justify to finance."),
        ),
        Phrase(
            T("Я не буду повторять цифру. Давайте лучше разберёмся, с чем именно вы не "
              "согласны: с источником или с тем, как я его применяю?",
              "I will not repeat my number. Let us work out instead what exactly you disagree "
              "with: the source, or how I am applying it?"),
            when=T("Вместо того чтобы сказать то же самое громче.",
                   "Instead of saying the same thing louder."),
        ),
    ),
    dialog=Dialog(
        setup=T("Найм. Дмитрий держит 200, вы хотите 230. У вас есть второй оффер на 210, но "
                "проект там скучнее.",
                "Hiring. Dmitry is holding at 200 and you want 230. You have another offer at "
                "210, but the project there is duller."),
        opening=(
            them("200 — потолок. Выше не могу.", "200 is the ceiling. I cannot go higher."),
        ),
        bad=(
            you("Тогда так: или 230, или я ухожу туда, где мне уже предложили. Решайте "
                "немедленно.",
                "Then here it is: 230, or I go elsewhere — I already have an offer. Decide now.",
                moves=("threat",)),
            them("Не надо меня пугать. Раз так — не задерживаю.",
                 "There is no need to threaten me. In that case, I will not keep you."),
        ),
        bad_why=T(
            "Факт был сильный — второй оффер у вас правда есть. Но поданный ультиматумом, он "
            "превратил разговор в проверку, кто первый моргнёт. Уступить теперь для Дмитрия — "
            "проиграть у всех на виду, и он выбирает не уступать. Громкость выросла, а сила — "
            "нет: у него не осталось ни одного довода, чтобы согласиться.",
            "The fact was strong — you really do have another offer. But served as an "
            "ultimatum, it turned the talk into a test of who blinks first. For Dmitry, giving "
            "way now means losing in plain sight, so he chooses not to. The volume went up, the "
            "strength did not: he has no argument left for saying yes.",
        ),
        good=(
            you("Скажу прямо: у меня есть второй оффер, но проект у вас интереснее, поэтому "
                "я хочу договориться здесь. А 230 — не моя прихоть, это рыночная "
                "медиана по трём независимым обзорам, и её можно показать финансам.",
                "To be straight with you: I have another offer, but your project is more "
                "interesting, which is why I want to agree here. And 230 is not my whim — it is "
                "the market rate according to three independent surveys, and you can show them "
                "to finance.",
                moves=("batna", "objective_criteria")),
            them("Данные у вас свежие, спорить с ними трудно. Хорошо, давайте смотреть, как "
                 "дойти до этих цифр.",
                 "Your data is fresh, and it is hard to argue with. All right, let us see how "
                 "we get to those numbers."),
        ),
        good_why=T(
            "Та же информация — но как факт, а не как угроза, и рядом с данными. Альтернатива "
            "объяснила, почему вы не блефуете, а «хочу договориться здесь» — почему вы не "
            "уходите. Цифру альтернативы вы не назвали — 210 ниже вашей цели и стала бы его "
            "якорем. Дмитрию не нужно проигрывать вам: он соглашается с рынком и несёт "
            "финансам обзоры, а не вашу угрозу.",
            "The same information — but as a fact, not a threat, and next to the data. The "
            "alternative explained why you are not bluffing, and “I want to agree here” "
            "explained why you are not leaving. You did not name the alternative's number — "
            "210 is below your target and would have become his anchor. Dmitry does not have "
            "to lose to you: he agrees with the market and takes surveys to finance, not your "
            "threat.",
        ),
    ),
    mistakes=(
        Mistake(
            T("Путать рычаг с громкостью", "Confusing leverage with volume"),
            T("Повторять требование, ставить сроки, говорить «или… или…». Напряжение растёт, "
              "а человек под напряжением защищается и не двигается. Рычаг — это доводы, а не "
              "интонация.",
              "Repeating the demand, setting deadlines, saying “either… or…”. Tension rises, and "
              "a person under tension defends and does not move. Leverage is arguments, not "
              "tone of voice."),
        ),
        Mistake(
            T("Размахивать альтернативой", "Waving your alternative around"),
            T("Упоминать второй оффер в каждой реплике: один раз — информация, третий раз — "
              "угроза. И не называйте его цифру, если она ниже того, что вы просите: «у меня "
              "есть 210» сообщает собеседнику, что 211 вас уже устроит, и становится якорем "
              "против вас. Назовите альтернативу один раз, с опорой на данные, и говорите о "
              "деле.",
              "Mentioning the other offer in every line: once is information, the third time "
              "is a threat. And do not name its number if it is below what you are asking: “I "
              "have 210 elsewhere” tells them 211 will do, and becomes an anchor against you. "
              "Name the alternative once, backed by data, and then talk business."),
        ),
        Mistake(
            T("Блефовать", "Bluffing"),
            T("Придумать оффер или обзор, которых нет. Аналитик попросит показать — и вы "
              "потеряете не одну цифру, а доверие ко всем следующим.",
              "Inventing an offer or a survey that does not exist. An analyst will ask to see "
              "it — and you will lose not one number but the credibility of every number after "
              "it."),
        ),
    ),
    limits=(
        Limit(
            T("У вас правда нет ни данных, ни альтернативы.",
              "You genuinely have neither data nor an alternative."),
            T("Не изображайте силу. Опирайтесь на интерес собеседника: что ему важно и что вы "
              "можете дать дёшево для себя. А альтернативу усиливайте заранее, к следующему "
              "разговору, — это урок «BATNA работает до стола».",
              "Do not fake strength. Lean on the other side's interest: what matters to them and "
              "what you can give cheaply. And strengthen your alternative in advance, for the "
              "next conversation — that is the lesson “Your BATNA works before the table”."),
        ),
        Limit(
            T("Жёсткий собеседник принимает спокойствие за слабость и давит сильнее.",
              "A tough counterpart takes calm for weakness and pushes harder."),
            T("Не отвечайте угрозой на угрозу. Назовите его нажим вслух и верните разговор к "
              "источнику: «Я слышу, что это ваше последнее слово. Давайте вернёмся к цифрам». "
              "Спокойный человек с данными выдерживает нажим дольше, чем громкий без них.",
              "Do not answer a threat with a threat. Name the pressure out loud and bring the "
              "talk back to the source: “I hear that this is your final word. Let us go back to "
              "the numbers.” A calm person with data outlasts a loud one without it."),
        ),
    ),
)
