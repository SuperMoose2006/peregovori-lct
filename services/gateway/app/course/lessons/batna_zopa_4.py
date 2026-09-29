"""BATNA и ZOPA · урок 4 — «Цена жёсткой BATNA»."""

from app.course.lessons._model import (Dialog, LessonMaterial, Limit, Mistake,
                                       Phrase, T, them, you)

MATERIAL = LessonMaterial(
    block="batna-zopa",
    lesson=4,
    scenario_id="investor",
    technique=T("Построить собеседнику золотой мост",
                "Build the other side a golden bridge"),
    why=T(
        "Когда позиция сильная, хочется дожать: «второй фонд даёт 20 — опускайтесь до 20». "
        "Даже если собеседник готов сдвинуться, после такой фразы сдвинуться для него "
        "значит проиграть. А человеку, который отчитывается перед комитетом или "
        "начальником, проигрывать нельзя: он будет держаться за своё просто чтобы не "
        "капитулировать. Приём меняет задачу: не заставить его уступить, а помочь ему "
        "прийти к вашему варианту так, чтобы это выглядело решением, а не поражением.",
        "When your position is strong, the urge is to press home: “the second fund offers "
        "20, so come down to 20.” Even if the other side is ready to move, after a line like "
        "that moving means losing. And someone who answers to a committee or a boss cannot "
        "afford to lose: they will hold their ground just to avoid surrendering. This "
        "technique changes the task: not forcing them to give way, but helping them reach "
        "your option in a way that looks like a decision rather than a defeat.",
    ),
    core=T(
        "Золотой мост — дорога, по которой собеседник может отойти от своей позиции, не "
        "потеряв лицо. Строится он из трёх частей.\n\n"
        "Повод — причина сдвинуться, которая не сводится к вашему нажиму: внешний критерий, "
        "новый факт, изменённое условие. «Посмотрим на данные по сопоставимым раундам» — "
        "повод. «Потому что у меня есть другой фонд» — нет.\n\n"
        "Приобретение — то, что он получает взамен и может показать своим. Для Марины это, "
        "например, место в совете директоров: фонду оно даёт влияние на решения, а вам "
        "стоит немного.\n\n"
        "Слова — как он объяснит решение наверх. Помогите их сформулировать: «20% при месте "
        "в совете — рыночные условия плюс контроль для фонда». С такой фразой не стыдно "
        "прийти к комитету.\n\n"
        "Сильная альтернатива при этом никуда не девается. Она работает молча: благодаря ей "
        "вы спокойно держите свою цифру и не размахиваете ею.\n\n"
        "Пример из найма: кандидат с сильным вторым оффером не требует «платите как там», а "
        "говорит: «Помогите мне объяснить руководству, почему я выбираю вас: мне важен "
        "пересмотр через полгода по результатам». У нанимающего появляются и повод, и слова.",
        "A golden bridge is a path along which the other side can step away from their "
        "position without losing face. It has three parts.\n\n"
        "A reason — a cause to move that is not just your pressure: an outside criterion, a "
        "new fact, a changed term. “Let us look at the data on comparable rounds” is a "
        "reason. “Because I have another fund” is not.\n\n"
        "A gain — something they get in return and can show their own side. For Marina it "
        "might be a board seat: it gives the fund a say in decisions and costs you "
        "little.\n\n"
        "The words — how they will explain the decision upstairs. Help them find them: “20% "
        "with a board seat — market terms plus control for the fund.” That is a line she can "
        "take to her committee without embarrassment.\n\n"
        "Your strong alternative does not disappear. It works in silence: it is why you can "
        "calmly hold your number instead of brandishing it.\n\n"
        "A hiring example: a candidate with a strong second offer does not demand “pay what "
        "they pay”, but says: “Help me explain to my future boss why I am choosing you: a "
        "review in six months based on results matters to me.” The hiring manager now has "
        "both a reason and the words.",
    ),
    phrases=(
        Phrase(
            T("Что вам нужно для контроля над компанией, чтобы меньшая доля не выглядела для "
              "комитета уступкой?",
              "What do you need in terms of board control so that a smaller stake does not "
              "look like a concession to your committee?"),
            moves=("interests_probe",), reveals=True,
            when=T("Чтобы узнать, из чего строить мост.",
                   "To find out what the bridge should be built from."),
        ),
        Phrase(
            T("Давайте опираться на рыночные данные, а не на то, кто кого пересидит: по "
              "сопоставимым раундам на нашей стадии доля около 20%. Такую цифру легко "
              "объяснить комитету.",
              "Let us rely on comparable rounds rather than on who outlasts whom: at our "
              "stage they put the stake at around 20%. That is a figure your committee will "
              "understand."),
            moves=("objective_criteria",),
        ),
        Phrase(
            T("Спасибо, что пошли навстречу по доле. Предлагаю так объяснить это комитету: "
              "20% при месте в совете директоров — рыночные условия плюс контроль для фонда.",
              "I appreciate you moving on the stake. Here is how I would put it to the "
              "committee: 20% with a board seat — in line with comparable rounds, plus "
              "control for the fund."),
            moves=("acknowledge", "objective_criteria"),
            when=T("Когда собеседник сдвинулся: благодарите за решение и сразу дайте слова для "
                   "его стороны.",
                   "Once they have moved: thank them for the decision and hand them the words "
                   "for their side straight away."),
        ),
        Phrase(
            T("Мне не нужно, чтобы вы проиграли. Мне нужна сделка, которую вы сможете "
              "защитить у себя.",
              "I do not need you to lose. I need a deal you can defend on your side."),
            when=T("Когда разговор начал превращаться в выяснение, кто сильнее.",
                   "When the conversation starts turning into a contest of strength."),
        ),
    ),
    dialog=Dialog(
        setup=T("Раунд. Альтернатива у вас сильная: второй фонд обсуждает 20%. Марина "
                "держится за 25%.",
                "A funding round. Your alternative is strong: a second fund is discussing "
                "20%. Marina is holding at 25%."),
        opening=(
            them("Ниже 25% я не пойду. Комитет этого не поймёт.",
                 "I will not go below 25%. My committee would not understand it."),
        ),
        bad=(
            you("Второй фонд даёт 20%. Опускайтесь до 20, иначе мы уходим.",
                "The second fund offers 20%. Come down to 20, otherwise we walk.",
                moves=("threat",)),
            them("Под угрозой фонд условия не меняет. Если вам лучше там — идите.",
                 "The fund does not change terms under threat. If you are better off there, "
                 "go."),
        ),
        bad_why=T(
            "Альтернатива настоящая, и Марина это понимает. Но сдвинуться после такой фразы "
            "для неё — значит прийти к комитету со словами «нас продавили». Этого она не "
            "сделает даже в ущерб сделке. Сила, которую нельзя применить, не даёт ничего.",
            "The alternative is real, and Marina knows it. But moving after a line like that "
            "means going to her committee and saying “we got pushed around”. She will not do "
            "that, even at the cost of the deal. Power you cannot use gets you nothing.",
        ),
        good=(
            you("Понимаю: решение вам защищать перед комитетом. Что вам нужно для контроля "
                "над компанией, чтобы меньшая доля не выглядела уступкой?",
                "I understand: you are the one who has to defend this to your committee. What "
                "do you need in terms of board control so that a smaller stake does not look "
                "like a concession?",
                moves=("acknowledge", "interests_probe"), reveals=True),
            them("Место в совете директоров. С ним я могу объяснить меньшую долю.",
                 "A board seat. With that I can explain a smaller stake."),
            you("Тогда предлагаю опираться на рыночные данные: по сопоставимым раундам на "
                "нашей стадии доля около 20%. 20% при месте в совете — рыночные условия плюс "
                "контроль для фонда. С такой формулировкой вам будет что показать комитету.",
                "Then let us rely on comparable rounds: at our stage they put the stake at "
                "around 20%. 20% with a board seat is in line with the market plus control "
                "for the fund. That is something you can show your committee.",
                moves=("objective_criteria",)),
            them("Это комитету я объяснить могу. Давайте смотреть детали.",
                 "That I can explain to my committee. Let us look at the details."),
        ),
        good_why=T(
            "Вы не спорили с её «комитет не поймёт», а сделали комитет своей задачей. Марина "
            "сама назвала, что ей нужно, — место в совете. Дальше вы дали повод (рыночные "
            "данные), приобретение (место в совете) и готовые слова. Сдвинуться на 20% теперь "
            "не проигрыш, а решение, которое она может защитить. Альтернативу вы ни разу не "
            "назвали: она работала тем, что вы спокойно держали свою цифру.",
            "You did not argue with her “the committee would not understand”; you made the "
            "committee your problem to solve. Marina named what she needs herself — a board "
            "seat. Then you supplied a reason (market data), a gain (the seat) and ready-made "
            "words. Moving to 20% is now not a loss but a decision she can defend. You never "
            "mentioned the alternative: it did its work by letting you hold your number "
            "calmly.",
        ),
    ),
    mistakes=(
        Mistake(
            T("Дожимать, когда собеседник уже готов сдвинуться",
              "Pushing harder when they are already ready to move"),
            T("Последний нажим превращает его движение в капитуляцию, и он откатывается, "
              "чтобы не проиграть. Видите готовность — дайте повод и слова, а не ещё одно "
              "требование.",
              "One more push turns their move into a surrender, and they pull back rather "
              "than lose. When you see they are ready, give them a reason and the words, not "
              "another demand."),
        ),
        Mistake(
            T("Праздновать победу вслух", "Celebrating out loud"),
            T("«Ну вот, я же говорил» — и следующая встреча начнётся с его реванша. "
              "Благодарите за решение, а не за уступку.",
              "“See, I told you so” — and the next meeting starts with them getting even. "
              "Thank them for the decision, not for the concession."),
        ),
        Mistake(
            T("Строить мост из того, что дорого вам",
              "Building the bridge from what is costly to you"),
            T("Золотой мост не значит заплатить за чужое лицо своей долей. Ищите то, что ценно "
              "ему и дёшево вам: место в совете, быстрое закрытие, удачную формулировку.",
              "A golden bridge does not mean paying for their face with your equity. Look for "
              "what is valuable to them and cheap for you: a board seat, a fast close, the "
              "right wording."),
        ),
    ),
    limits=(
        Limit(
            T("Собеседник не хочет договариваться: тянет время, чтобы выторговать больше у "
              "кого-то ещё.",
              "The other side does not want a deal: they are stalling to squeeze more out of "
              "someone else."),
            T("Мост не поможет — ему нужен не выход, а пауза. Поставьте срок ответа, спокойно "
              "назовите альтернативу один раз и будьте готовы к ней уйти.",
              "A bridge will not help — they need a pause, not a way out. Set a deadline for "
              "an answer, name your alternative calmly once, and be ready to take it."),
        ),
        Limit(
            T("Разрыв лежит за вашей красной линией, и любое «лицо» для собеседника стоит вам "
              "больше, чем альтернатива.",
              "The gap lies beyond your red line, and any face-saver for them costs you more "
              "than your alternative."),
            T("Не стройте мост за свой счёт. Скажите, что на этих условиях вы не сходитесь, "
              "поблагодарите за работу и оставьте дверь открытой: «Если у фонда поменяются "
              "рамки — мы на связи».",
              "Do not build the bridge at your own expense. Say that on these terms you do not "
              "meet, thank them for the work, and leave the door open: “If the fund's frame "
              "changes, we are here.”"),
        ),
    ),
)
