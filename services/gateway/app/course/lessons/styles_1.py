"""Стиль собеседника · урок 1 — «Три стиля за столом»."""

from app.course.lessons._model import (Dialog, LessonMaterial, Limit, Mistake,
                                       Phrase, T, them, you)

MATERIAL = LessonMaterial(
    block="styles",
    lesson=1,
    scenario_id="candidate_offer",
    technique=T("Опознать стиль собеседника по первым репликам",
                "Read the other side's style from their first lines"),
    why=T(
        "Человек готовится к переговорам один раз и потом говорит со всеми одинаково: "
        "с финансистом, которому нужны цифры, с кандидатом, который думает о семье, и с "
        "подрядчиком, который с порога ставит условия. Одна и та же реплика у одного "
        "вызывает уважение, у другого — обиду, у третьего — ответный нажим. Приём "
        "лечит это просто: в первые две минуты вы не продвигаете своё, а слушаете, как "
        "человек говорит, и решаете, на каком языке с ним разговаривать.",
        "People prepare once and then talk to everyone the same way: to a finance "
        "director who wants numbers, to a candidate who is thinking about his family, "
        "and to a contractor who sets terms before he sits down. The same line earns "
        "respect from one, hurts the second and draws pushback from the third. The fix "
        "is simple: for the first two minutes you do not push your case — you listen to "
        "how the person talks and decide which language to speak with them.",
    ),
    core=T(
        "Стилей удобно различать три. Стиль — это привычная манера вести разговор, и за "
        "одну встречу она не меняется; настроение меняется, стиль нет.\n\n"
        "Аналитик просит обоснования: «из чего складывается цифра?», «какие у вас "
        "данные?». С ним работают источники и расчёт, а голое «я считаю» он пропускает "
        "мимо ушей.\n\n"
        "Человек отношений говорит о людях и доверии: «мне важно, как мы будем "
        "работать», «я думаю о семье». Нажим он читает как разрыв, и упоминание вашей "
        "запасной кандидатуры для него звучит как угроза.\n\n"
        "Жёсткий сразу ставит рамку: «у меня 280, ниже не пойду». Он уважает "
        "спокойную силу и данные, но ультиматум в ответ превращает разговор в драку.\n\n"
        "Как опознать: задайте открытый вопрос и слушайте, ЧЕМ человек отвечает — "
        "цифрами, людьми или условиями. Первые две реплики почти всегда это "
        "показывают.",
        "It helps to tell three styles apart. A style is someone's habitual way of "
        "running a conversation, and it does not change within one meeting; mood "
        "changes, style does not.\n\n"
        "The analytical one asks for grounds: “what is that number made of?”, “what "
        "data do you have?”. Sources and calculations work with them; a bare “I think "
        "so” slides right past.\n\n"
        "The relationship one talks about people and trust: “it matters to me how we "
        "will work together”, “I am thinking about my family”. They read pressure as a "
        "breach, and a mention of your backup candidate sounds like a threat.\n\n"
        "The tough one sets a frame straight away: “I am at 280 and I will not go "
        "lower”. They respect calm strength and data, but an ultimatum in reply turns "
        "the talk into a fight.\n\n"
        "How to tell: ask an open question and listen to WHAT the person answers with — "
        "numbers, people or terms. The first two lines nearly always show it.",
    ),
    phrases=(
        Phrase(
            T("Прежде чем перейдём к цифрам: что для вас важно в переезде и в новой работе?",
              "Before we get to numbers: what matters most to you in relocating and in "
              "the new job?"),
            moves=("interests_probe",), reveals=True,
            when=T("Первая реплика. Ответ покажет стиль: цифры, люди или условия.",
                   "Your opening line. The answer shows the style: numbers, people or "
                   "terms."),
        ),
        Phrase(
            T("Вам удобнее, чтобы я сначала показал расчёт, или сначала обсудим, что для "
              "вас важно?",
              "Would you rather I walk you through the numbers first, or talk first about "
              "what matters to you?"),
            moves=("interests_probe",),
            when=T("Если по первым словам стиль не ясен — спросите прямо.",
                   "If the first lines leave the style unclear, ask directly."),
        ),
        Phrase(
            T("Наше предложение — 235, потому что это медиана по трём независимым обзорам "
              "зарплат для этой роли.",
              "Our offer is 235, because that is the median of three independent salary "
              "surveys for this role."),
            moves=("anchor", "objective_criteria"),
            when=T("Аналитику: цифра сразу с источником.",
                   "For the analytical one: the number comes with its source."),
        ),
        Phrase(
            T("Понимаю, переезд с семьёй — это главное. Что для вас сейчас самое сложное в "
              "переезде?",
              "I understand, moving the family comes first. What is the most difficult "
              "part of the move for you right now?"),
            moves=("acknowledge", "spin_problem"), reveals=True,
            when=T("Человеку отношений: сначала о нём, потом о деньгах.",
                   "For the relationship one: them first, money later."),
        ),
        Phrase(
            T("Я слышу вашу цифру. Давайте сверим её с рынком: по независимым обзорам "
              "медиана для этой роли — 235.",
              "I hear your number. Let us check it against the market: independent "
              "surveys put the median for this role at 235."),
            moves=("acknowledge", "objective_criteria"),
            when=T("Жёсткому: спокойно признать рамку и перевести разговор на данные.",
                   "For the tough one: acknowledge the frame calmly and move to data."),
        ),
    ),
    dialog=Dialog(
        setup=T("Найм. Вы — нанимающий руководитель, Тимур — сильный инженер, переезжает с "
                "семьёй. Бюджет позволяет до 260 тысяч, ваша цель — 230.",
                "Hiring. You are the hiring manager; Timur is a strong engineer relocating "
                "with his family. The budget allows up to 260k; your target is 230k."),
        opening=(
            them("Если честно, я сейчас больше думаю о том, как перевезти семью, чем о "
                 "цифрах.",
                 "To be honest, right now I am thinking more about how to move my family "
                 "than about numbers."),
        ),
        bad=(
            you("Давайте сразу к делу. Наше предложение — 230, это хорошая цифра для "
                "рынка.",
                "Let us get straight to business. Our offer is 230, that is a good number "
                "for the market.",
                moves=("anchor",)),
            them("Понятно. Мне надо подумать.", "I see. I need to think it over."),
        ),
        bad_why=T(
            "Тимур прямо сказал, о чём он думает, — о семье. Это речь человека отношений. "
            "Ответ цифрой в лоб он прочитал как «ваши заботы нас не интересуют» и "
            "закрылся: «надо подумать» здесь значит «разговор окончен». Цифра была "
            "нормальная — не подошёл язык.",
            "Timur said plainly what he was thinking about — his family. That is how a "
            "relationship person talks. A number thrown straight back read to him as "
            "“your worries are not our concern”, and he shut down: “I need to think it "
            "over” here means “we are done”. The number was fine — the language was wrong.",
        ),
        good=(
            you("Понимаю, переезд с семьёй — это главное. Что для вас сейчас самое сложное "
                "в переезде?",
                "I understand, moving the family comes first. What is the most difficult "
                "part of the move for you right now?",
                moves=("acknowledge", "spin_problem"), reveals=True),
            them("Жильё. Пока не найдём квартиру, семья остаётся в другом городе, а я "
                 "буду жить на два дома.",
                 "Housing. Until we find a flat, my family stays in another city and I "
                 "will be living in two places."),
        ),
        good_why=T(
            "Вы ответили на его языке: сначала признали главное для него, потом спросили "
            "о конкретной трудности. Тимур назвал интерес — жильё. Теперь у вас есть что "
            "положить в предложение кроме оклада, и о цифре вы будете говорить с "
            "человеком, который вам доверяет.",
            "You answered in his language: first you acknowledged what matters most to "
            "him, then asked about one concrete difficulty. Timur named an interest — "
            "housing. Now you have something to put in the offer besides salary, and you "
            "will talk numbers with a person who trusts you.",
        ),
    ),
    mistakes=(
        Mistake(
            T("Судить по одной фразе",
              "Judging by a single line"),
            T("Вежливое приветствие ещё не делает человека «мягким», а сухое — "
              "«аналитиком». Стиль виден по тому, как человек отвечает на ваш открытый "
              "вопрос, и по тому, к чему он возвращается. Подождите две реплики.",
              "A polite greeting does not make someone “soft”, and a dry one does not make "
              "them “analytical”. Style shows in how they answer your open question and in "
              "what they keep coming back to. Wait for two lines."),
        ),
        Mistake(
            T("Путать стиль с настроением",
              "Mistaking mood for style"),
            T("Раздражённый человек не обязательно жёсткий: возможно, у него просто "
              "тяжёлый день или давит начальство. Настроение снимают признанием и "
              "паузой, стиль — учитывают. Если после признания человек смягчился, это "
              "было настроение.",
              "An irritated person is not necessarily a tough one: they may just be "
              "having a bad day or feeling pressure from above. Mood is eased by "
              "acknowledging it and pausing; style is something you adapt to. If they "
              "soften after you acknowledge it, it was mood."),
        ),
        Mistake(
            T("Отвечать жёсткому жёсткостью",
              "Meeting toughness with toughness"),
            T("С жёстким собеседником хочется показать, что вы тоже не мягкий, — и "
              "поставить свой ультиматум. Он ответит тем же, и оба окажетесь в углу. "
              "Сила с ним — это спокойствие и данные, а не громкость.",
              "With a tough counterpart there is an urge to show you are no pushover — and "
              "to issue an ultimatum of your own. They will answer in kind, and you will "
              "both end up cornered. Strength with them is calm and data, not volume."),
        ),
    ),
    limits=(
        Limit(
            T("Стиль смешанный или не читается: человек и считает, и говорит о команде.",
              "The style is mixed or unreadable: the person both calculates and talks "
              "about the team."),
            T("Не гадайте. Берите безопасный порядок, который не ранит никого: сначала "
              "вопрос о важном, потом цифра с источником, альтернативу не называйте. И "
              "спросите прямо, как ему удобнее: с расчёта или с общей картины.",
              "Do not guess. Use the safe order that hurts no one: first a question about "
              "what matters, then a number with its source, and leave your alternative "
              "unsaid. And ask directly how they prefer to go: from the calculation or "
              "from the big picture."),
        ),
        Limit(
            T("Напротив несколько человек — например, резидент ОЭЗ ведёт переговоры с "
              "финансистом и директором подрядчика одновременно.",
              "Several people sit across from you — say, an SEZ resident negotiating with "
              "a contractor's finance lead and its director at once."),
            T("Единого стиля у стола нет. Отвечайте каждому на его вопрос: финансисту — "
              "расчётом, директору — ясной рамкой и сроками. Решение обычно за тем, кто "
              "говорит последним, — к его стилю и подстраивайте итоговое предложение.",
              "The table has no single style. Answer each person's question in their own "
              "terms: the finance lead gets the calculation, the director a clear frame "
              "and dates. The decision usually rests with whoever speaks last — shape the "
              "final offer to their style."),
        ),
    ),
)
