"""Стиль собеседника · урок 3 — «Подстройка — это порядок, а не маска»."""

from app.course.lessons._model import (Dialog, LessonMaterial, Limit, Mistake,
                                       Phrase, T, them, you)

MATERIAL = LessonMaterial(
    block="styles",
    lesson=3,
    scenario_id="candidate_offer",
    technique=T("Менять порядок ходов, а не себя",
                "Change the order of moves, not yourself"),
    why=T(
        "Услышав «подстраивайтесь под собеседника», люди начинают играть роль: с "
        "мягким изображают теплоту, с жёстким — бульдога. Фальшь слышно сразу, и "
        "доверие падает сильнее, чем если бы вы остались собой. Подстройка на самом "
        "деле устроена проще: вы говорите то же самое и остаётесь тем же человеком, но "
        "меняете ПОРЯДОК — что сказать первым, что вторым, а что не говорить вовсе.",
        "Told to “adapt to the other side”, people start playing a part: warmth for the "
        "gentle one, a bulldog for the tough one. The fake shows at once, and trust drops "
        "further than if you had stayed yourself. Real adapting is simpler: you say the "
        "same things and remain the same person, but you change the ORDER — what comes "
        "first, what comes second, and what is best left unsaid.",
    ),
    core=T(
        "С аналитиком — сначала данные, потом пакет. Если начать с размена, он спросит "
        "«а из чего вообще цифра?» и будет прав: без обоснования любое предложение для "
        "него висит в воздухе.\n\n"
        "С человеком отношений — сначала вопросы и признание, потом пакет из того, что "
        "ему важно. Альтернативу не называйте, пока пакет не собран, а лучше не "
        "называйте вовсе: на тёплом столе цифра и так сдвинется от размена.\n\n"
        "С жёстким — спокойно признать его рамку, затем встречный критерий и твёрдое "
        "«пока нет», без ультиматума. Размен — когда он сам попросит движения.\n\n"
        "Проверка простая. Если после вашей реплики собеседник напрягся — отвечает "
        "короче, повторяет свою цифру, говорит «мне надо подумать», — вы нарушили "
        "порядок. Вернитесь на шаг: к вопросу или к признанию.",
        "With the analytical one — data first, then the package. Open with a trade and "
        "they will ask “what is the number based on, anyway?” and they will be right: "
        "without grounds, any offer hangs in the air for them.\n\n"
        "With the relationship one — questions and acknowledgement first, then a package "
        "built from what matters to them. Do not name your alternative until the package "
        "is built, and better not at all: at a warm table the number moves from the "
        "trade anyway.\n\n"
        "With the tough one — calmly acknowledge their frame, then a counter-criterion "
        "and a firm “not yet”, with no ultimatum. The trade comes when they themselves "
        "ask for movement.\n\n"
        "The check is simple. If the other side tenses up after your line — shorter "
        "answers, repeating their number, “I need to think about it” — you broke the "
        "order. Step back: to a question or to an acknowledgement.",
    ),
    phrases=(
        Phrase(
            T("Что для вас важно в карьере на новом месте?",
              "What matters most to you about your career in a new place?"),
            moves=("interests_probe",), reveals=True,
            when=T("Первый ход с человеком отношений.",
                   "Your first move with a relationship person."),
        ),
        Phrase(
            T("Сначала покажу расчёт: медиана по независимым обзорам для этой роли — 235. "
              "Потом обсудим, что войдёт в предложение кроме оклада.",
              "Let me show the calculation first: the median of independent surveys for "
              "this role is 235. Then we can talk about what goes into the offer besides "
              "base."),
            moves=("objective_criteria",),
            when=T("Первый ход с аналитиком.", "Your first move with an analyst."),
        ),
        Phrase(
            T("Я слышу вашу позицию. Пока нет: по рынку для этой роли 235. Давайте искать "
              "решение внутри рынка.",
              "I hear you, and I know where you stand. Not yet: by the market rate this "
              "role is 235. Let us look for a solution within the market."),
            moves=("acknowledge", "objective_criteria"),
            when=T("Ответ жёсткому на его рамку.", "Answering a tough one's frame."),
        ),
        Phrase(
            T("Предлагаю пакет: 235, план развития до архитектора и наставник с первого "
              "месяца. Как вам такой вариант?",
              "Here is a package: 235, a development plan toward architect, and a mentor "
              "from month one. How does that sound?"),
            moves=("tradeoff",),
            when=T("Когда интересы уже названы — с любым стилем.",
                   "Once the interests are on the table — with any style."),
        ),
        Phrase(
            T("Я вижу, что задел что-то важное. Давайте вернёмся на шаг назад.",
              "I can see that I touched something important. Let us step back for a "
              "moment."),
            moves=("acknowledge",),
            when=T("Если после вашей реплики человек закрылся.",
                   "If the person shut down after your line."),
        ),
    ),
    dialog=Dialog(
        setup=T("Найм. Тимур — человек отношений. Вы знаете, что у вас есть запасные "
                "кандидаты и что можно предложить план развития до архитектора.",
                "Hiring. Timur is a relationship person. You know you have backup "
                "candidates and that you can offer a development plan toward architect."),
        opening=(
            them("Здравствуйте. Рад, что дошли до оффера.",
                 "Hello. Glad we got as far as an offer."),
        ),
        bad=(
            you("Скажу сразу: альтернатива у нас есть. Но мы хотим вас, поэтому давайте "
                "обсудим условия.",
                "I will be upfront: we do have an alternative. But we want you, so let us "
                "discuss terms.",
                moves=("batna",)),
            them("Хорошо. Я понял, что выбор у вас есть.",
                 "All right. I understand you have options."),
        ),
        bad_why=T(
            "Содержание верное: альтернатива есть, и вы действительно хотите его. Но "
            "порядок — неверный. Первой фразой прозвучало «вас можно заменить», и всё "
            "дальнейшее Тимур будет слушать сквозь неё: даже хороший пакет теперь выглядит "
            "как уступка под давлением, а не как забота.",
            "The substance is right: the alternative exists, and you really do want him. "
            "The order is wrong. The first thing he heard was “you can be replaced”, and "
            "he will hear everything after it through that: even a good package now looks "
            "like a concession under pressure, not like care.",
        ),
        good=(
            you("Что для вас важно в карьере на новом месте?",
                "What matters most to you about your career in a new place?",
                moves=("interests_probe",), reveals=True),
            them("Не хочу снова застрять на поддержке легаси. Хочу вырасти до архитектора.",
                 "I do not want to get stuck maintaining legacy code again. I want to grow "
                 "into an architect."),
            you("Предлагаю пакет: 235, план развития до архитектора и наставник с первого "
                "месяца. Как вам такой вариант?",
                "Here is a package: 235, a development plan toward architect, and a mentor "
                "from month one. How does that sound?",
                moves=("tradeoff",)),
            them("Это ровно то, чего я хочу. Давайте обсудим детали.",
                 "That is exactly what I want. Let us go through the details."),
        ),
        good_why=T(
            "Те же карты, другой порядок. Сначала вопрос — Тимур сам назвал, ради чего "
            "идёт. Потом пакет, собранный из его слов. Альтернатива не прозвучала вовсе, и "
            "не понадобилась: предложение, в котором человек узнаёт свою цель, двигает "
            "цифру лучше любой угрозы.",
            "Same cards, different order. First the question — Timur named what he is "
            "coming for. Then a package built from his own words. The alternative was "
            "never mentioned and was never needed: an offer in which a person recognises "
            "their own goal moves the number better than any threat.",
        ),
    ),
    mistakes=(
        Mistake(
            T("Менять себя вместо порядка",
              "Changing yourself instead of the order"),
            T("Наигранная теплота или наигранная жёсткость видны с первой фразы. "
              "Собеседник перестаёт понимать, с кем говорит, и перестаёт доверять. Тон "
              "оставьте свой — меняйте, что идёт первым.",
              "Put-on warmth or put-on toughness shows from the first line. The other side "
              "stops knowing who they are talking to, and stops trusting you. Keep your "
              "own tone — change what comes first."),
        ),
        Mistake(
            T("Держаться заготовленного сценария",
              "Sticking to the prepared script"),
            T("Вы готовились к аналитику — «критерий, размен, альтернатива», — а напротив "
              "человек отношений. Если стиль ясен уже во второй реплике, сценарий надо "
              "перестроить сразу, а не доигрывать до конца.",
              "You prepared for an analyst — “criterion, trade, alternative” — and across "
              "the table is a relationship person. If the style is clear by the second "
              "line, rebuild the script then and there instead of playing it out."),
        ),
        Mistake(
            T("Прыгать между порядками",
              "Jumping between orders"),
            T("Критерий, потом эмоции, потом нажим — за три реплики. Собеседник не "
              "успевает понять, о чём разговор, и отвечает на самое резкое из сказанного. "
              "Выбрали порядок — держитесь его, пока реакция не скажет обратное.",
              "A criterion, then feelings, then pressure — within three lines. The other "
              "side cannot tell what the talk is about and responds to the sharpest thing "
              "you said. Once you pick an order, keep to it until their reaction tells you "
              "otherwise."),
        ),
    ),
    limits=(
        Limit(
            T("Времени мало: одна встреча на пятнадцать минут.",
              "Time is short: one fifteen-minute meeting."),
            T("Полный порядок не уложится. Возьмите ход, который годится для всех "
              "стилей: вопрос с названной темой и цифру с источником. Альтернативу "
              "пропустите — на короткой встрече она почти всегда стоит дороже, чем даёт.",
              "The full order will not fit. Take the move that suits every style: a "
              "question with a named topic and a number with its source. Skip the "
              "alternative — in a short meeting it nearly always costs more than it "
              "brings."),
        ),
        Limit(
            T("Собеседник сам ломает ваш порядок: «сначала назовите цифру».",
              "The other side breaks your order themselves: “name a number first”."),
            T("Не упирайтесь. Дайте вилку с опорой и верните разговор к своему порядку: "
              "«По рынку это 225–240. Чтобы назвать точнее, мне нужно понять, что для вас "
              "важно кроме оклада».",
              "Do not dig in. Give a range with its grounds and bring the talk back to your "
              "order: “By the market it is 225 to 240. To be more precise I need to "
              "understand what matters to you besides base salary.”"),
        ),
    ),
)
