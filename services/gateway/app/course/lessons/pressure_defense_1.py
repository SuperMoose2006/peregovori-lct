"""Давление и возражения · урок 1 — «Три ответа на ультиматум»."""

from app.course.lessons._model import (Dialog, LessonMaterial, Limit, Mistake,
                                       Phrase, T, them, you)

MATERIAL = LessonMaterial(
    block="pressure-defense",
    lesson=1,
    scenario_id="sla_renewal",
    technique=T("Ответить на ультиматум без встречного ультиматума",
                "Answer an ultimatum without one of your own"),
    why=T(
        "«99.5 — наш потолок, это не обсуждается». На такое обычно отвечают одним из "
        "двух способов: сдаются («хорошо, пусть 99.5») или бьют в ответ («тогда мы уходим "
        "к конкуренту»). Первое отдаёт сделку. Второе загоняет обоих в угол, из которого "
        "нельзя выйти, не потеряв лицо. Приём: у ультиматума есть три спокойных ответа, "
        "и ни один не требует ни уступать, ни угрожать.",
        "“99.5 is our ceiling, and that is not up for discussion.” People usually answer "
        "in one of two ways: they give in (“fine, 99.5 then”) or they hit back (“then we "
        "are moving to your competitor”). The first gives the deal away. The second backs "
        "both of you into a corner neither can leave without losing face. The technique: "
        "an ultimatum has three calm answers, and none of them requires you to concede or "
        "to threaten.",
    ),
    core=T(
        "Ультиматум — требование в форме «либо так, либо никак». Чаще всего это не "
        "последнее слово, а проверка: отступите ли вы.\n\n"
        "Назвать. Сказать, что вы услышали, — без согласия: «Я вас слышу: для вас 99.5 — "
        "потолок». Позицию приняли к сведению, и повторять её громче ему больше незачем.\n\n"
        "Проигнорировать. Продолжить разговор так, будто ультиматума не было: задать "
        "вопрос о деле. Так вы оставляете ему возможность потом отступить незаметно — "
        "«последнее слово» тихо перестаёт быть последним.\n\n"
        "Вернуть к критерию. Перевести спор с чьей-то воли на цифры. Объективный "
        "критерий — внешний проверяемый ориентир: отраслевой стандарт, цена вашего "
        "простоя. Спорить тогда приходится не с вами, а с рынком.\n\n"
        "Четвёртого ответа — своего ультиматума — нет.\n\n"
        "Какой выбирать: ультиматум сказан сгоряча — проигнорируйте; спокойно и всерьёз "
        "— назовите и спросите о деле; у вас есть цифры — верните к ним. Часто все три "
        "идут подряд, как в примере ниже.\n\n"
        "В закупках то же: поставщик говорит «цена действует до пятницы». Назвать: "
        "«Слышу, что срок — пятница». Вернуть к критерию: «Давайте сверим с тремя "
        "последними тендерами».",
        "An ultimatum is a demand shaped as “this way or no way”. Most of the time it is "
        "not the final word but a test: will you back off?\n\n"
        "Name it. Say what you heard — without agreeing: “I hear you: 99.5 is your "
        "ceiling.” The position has been noted, and there is no longer any need for him "
        "to repeat it louder.\n\n"
        "Ignore it. Carry on as if the ultimatum had not been said: ask a question about "
        "the substance. That leaves him a way to step back quietly later — the “final "
        "word” simply stops being final.\n\n"
        "Return to the criterion. Move the argument from someone's will to numbers. An "
        "objective criterion is an outside, checkable yardstick: an industry standard, "
        "what your downtime costs. Then he is arguing with the market, not with you.\n\n"
        "There is no fourth answer — an ultimatum of your own is not one.\n\n"
        "Which to choose: if it was said in the heat of the moment, ignore it; if it was "
        "said calmly and meant, name it and ask about the substance; if you have numbers, "
        "bring the talk back to them. Often all three come in a row, as in the example "
        "below.\n\n"
        "Procurement is no different: a supplier says “this price holds until Friday”. "
        "Name it: “I hear that Friday is the deadline.” Return to the criterion: “Let us "
        "check it against the last three tenders.”",
    ),
    phrases=(
        Phrase(
            T("Я вас слышу: для вас 99.5 — это потолок.",
              "I hear you: 99.5 is your ceiling."),
            moves=("acknowledge",),
            when=T("Назвать: ультиматум сказан спокойно и всерьёз.",
                   "Name it: the ultimatum was said calmly and meant."),
        ),
        Phrase(
            T("Расскажите, как сейчас устроено ночное дежурство: сколько людей у вашей "
              "эксплуатации ночью?",
              "Tell me about your night on-call — how many people does your operations "
              "team have?"),
            moves=("spin_situation",), reveals=True,
            when=T("Проигнорировать: продолжить вопросом о деле.",
                   "Ignore it: carry on with a question about the substance."),
        ),
        Phrase(
            T("Давайте вернёмся к цифрам: отраслевой стандарт для критичных систем — "
              "99.9%, и час нашего простоя стоит 2.4 млн.",
              "Let us go back to the numbers: the industry standard for critical systems is "
              "99.9%, and an hour of our downtime costs 2.4m."),
            moves=("objective_criteria",),
            when=T("Вернуть к критерию: у вас есть внешние цифры.",
                   "Return to the criterion: you have outside numbers."),
        ),
        Phrase(
            T("Я вас слышу. Если 99.9 невозможно в этом году, давайте посмотрим, что "
              "возможно поэтапно.",
              "I hear you. If 99.9 is out of reach this year, let us look at what is "
              "possible in stages."),
            moves=("acknowledge",),
            when=T("Оставить ему дорогу назад, не отступая самому.",
                   "To leave him a way back without retreating yourself."),
        ),
    ),
    dialog=Dialog(
        setup=T("Продление контракта с облачным вендором. Вам нужен аптайм — доля "
                "времени, когда сервис работает, — не ниже 99.8%; 99.4% — ваш предел. "
                "Виктор начал с 99.0.",
                "Renewing a contract with a cloud vendor. You need uptime — the share of "
                "time the service is running — of at least 99.8%; 99.4% is your limit. "
                "Viktor opened at 99.0."),
        opening=(
            them("99.5 — наш потолок. Это не обсуждается.",
                 "99.5 is our ceiling. That is not up for discussion."),
        ),
        bad=(
            you("Тогда либо 99.9, либо мы уходим к конкуренту. Это наше последнее слово.",
                "Then it is 99.9 or we walk to your competitor. That is our final offer.",
                moves=("threat",)),
            them("Уходите. Посмотрим, как быстро вы переедете.",
                 "Go ahead. Let us see how fast you manage to migrate."),
        ),
        bad_why=T(
            "На ультиматум вы ответили ультиматумом — и теперь в углу оба. Виктор не может "
            "уступить, не потеряв лицо перед своим руководством, вы не можете остаться, не "
            "потеряв своё. И он знает, что переезд к конкуренту для вас — риск и время. "
            "Угроза, которую дорого исполнить, слабеет в тот момент, когда её произносят.",
            "You answered an ultimatum with an ultimatum — and now you are both in the "
            "corner. Viktor cannot give way without losing face with his leadership; you "
            "cannot stay without losing yours. And he knows that migrating to a competitor "
            "means risk and time for you. A threat that is expensive to carry out gets "
            "weaker the moment you say it.",
        ),
        good=(
            you("Я вас слышу: для вас 99.5 — потолок. Расскажите, как сейчас устроено "
                "ночное дежурство: сколько людей у вашей эксплуатации ночью?",
                "I hear you: 99.5 is your ceiling. Tell me about your night on-call — how "
                "many people does your operations team have?",
                moves=("acknowledge", "spin_situation"), reveals=True),
            them("Два инженера на всю ночь. Любой крупный инцидент — и мы платим штрафы.",
                 "Two engineers for the whole night. Any major incident and we are paying "
                 "penalties."),
            you("Понятно. Давайте вернёмся к цифрам: отраслевой стандарт для критичных "
                "систем — 99.9%, и час нашего простоя стоит 2.4 млн. Нам нужно решение, "
                "которое выдержат обе стороны.",
                "Clear. Let us go back to the numbers: the industry standard for critical "
                "systems is 99.9%, and an hour of our downtime costs 2.4m. We need a "
                "solution both sides can live with day to day.",
                moves=("objective_criteria",)),
            them("Про стандарт я знаю. Давайте думать, как к нему подойти, не угробив мою "
                 "эксплуатацию.",
                 "I know the standard. Let us think about how to get close to it without "
                 "wrecking my ops team."),
        ),
        good_why=T(
            "Вы назвали ультиматум, не соглашаясь с ним, и тут же продолжили вопросом о "
            "деле — как будто «не обсуждается» не прозвучало. Ответ дал настоящую "
            "причину: штрафы, которые не выдержит его ночная смена. Потом вы вернули спор "
            "к внешним цифрам. Виктор отступил от «потолка» сам и не потерял лицо: он "
            "уступает стандарту, а не вам.",
            "You named the ultimatum without agreeing to it, and carried straight on with a "
            "question about the substance — as if “not up for discussion” had never been "
            "said. The answer gave you the real reason: penalties his night shift cannot "
            "handle. Then you moved the argument to outside numbers. Viktor stepped back "
            "from his “ceiling” himself, and without losing face: he is yielding to a "
            "standard, not to you.",
        ),
    ),
    mistakes=(
        Mistake(
            T("Принять ультиматум за конец разговора", "Taking the ultimatum as the end of "
              "the conversation"),
            T("«Не обсуждается» чаще значит «проверяю, отступите ли вы». Сразу сдаться — "
              "«ладно, пусть 99.5» — значит подтвердить, что так с вами можно и дальше.",
              "“Not up for discussion” usually means “let us see if you back off”. Giving "
              "in straight away — “all right, 99.5” — confirms that this works on you, now "
              "and next time."),
        ),
        Mistake(
            T("Спорить с самим ультиматумом", "Arguing with the ultimatum itself"),
            T("«Всё обсуждается, не начинайте» — вы доказываете, что он неправ, и ему "
              "приходится защищать своё слово. Спорьте с цифрами, а не с его "
              "решимостью.",
              "“Everything is negotiable, come on” — you are proving him wrong, so he has to "
              "defend his word. Argue with the numbers, not with his resolve."),
        ),
        Mistake(
            T("Назвать и тут же уступить", "Naming it and caving in the same breath"),
            T("«Слышу, что потолок 99.5. Ладно, давайте 99.6». Названный ультиматум без "
              "вопроса или критерия следом — это капитуляция в вежливой форме.",
              "“I hear 99.5 is the ceiling. Fine, let us say 99.6.” A named ultimatum with "
              "no question or criterion after it is surrender, politely phrased."),
        ),
    ),
    limits=(
        Limit(
            T("Ультиматум настоящий: у собеседника правда нет пространства — решение "
              "совета директоров, регламент, закон.",
              "The ultimatum is real: the other side genuinely has no room — a board "
              "decision, a regulation, the law."),
            T("Проверьте это вопросом: «Кто может принять решение выше 99.5?» Если потолок "
              "настоящий, двигайте другие условия — штрафы, срок договора, ступенчатый "
              "рост аптайма — или считайте свою альтернативу.",
              "Test it with a question: “Who can sign off on anything above 99.5?” If the "
              "ceiling is real, move other terms — penalties, contract length, uptime that "
              "rises in steps — or work out your alternative."),
        ),
        Limit(
            T("Ультиматум повторяют в третий раз теми же словами.",
              "The ultimatum is repeated a third time, word for word."),
            T("Три ответа уже прозвучали. Скажите спокойно, что вы будете делать без "
              "соглашения, — как факт, без «либо — либо»: «Если остановимся на 99.5, нам "
              "придётся считать переезд к другому провайдеру. Мне бы этого не хотелось». "
              "Это ваша альтернатива, а не угроза (блок «BATNA и ZOPA»).",
              "All three answers have been given. Calmly say what you will do without an "
              "agreement — as a fact, with no “either — or”: “If we stop at 99.5, we will "
              "have to cost out a move to another provider. I would rather not.” That is "
              "your alternative, not a threat (the “BATNA & ZOPA” block)."),
        ),
    ),
)
