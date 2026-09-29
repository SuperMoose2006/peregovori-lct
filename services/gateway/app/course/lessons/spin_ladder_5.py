"""Лестница SPIN · урок 5 — «Частая ошибка: сразу N»."""

from app.course.lessons._model import (Dialog, LessonMaterial, Limit, Mistake,
                                       Phrase, T, them, you)

MATERIAL = LessonMaterial(
    block="spin-ladder",
    lesson=5,
    scenario_id="supplier",
    technique=T("Если прыгнули на выгоду — спуститься на ступень ниже",
                "If you jumped to the payoff, step back down a rung"),
    why=T(
        "Узнав, что вопрос о выгоде самый сильный, его начинают задавать первым: «Насколько "
        "важно было бы для вас закрыть загрузку на год?» — ещё до того, как собеседник "
        "признал хоть какую-то проблему. Звучит это как заготовка продавца, и человек "
        "обороняется: «у нас всё загружено, давайте о цене». Дальше обычно вторая ошибка — "
        "защищать свой вопрос и доказывать, что выгода очевидна. Приём: заметить, что "
        "прыгнули, коротко это признать и спуститься на ступень ниже — к фактам или к "
        "проблеме, — а потом подняться снова.",
        "Once people learn that the payoff question is the strongest, they start asking it "
        "first: “How valuable would it be to you to have the factory loaded a year ahead?” — "
        "before the other side has admitted any problem at all. It sounds like a sales "
        "script, and they get defensive: “we are fully loaded, let us talk price”. Then comes "
        "the usual second mistake — defending your question and insisting the value is "
        "obvious. The technique: notice that you jumped, own it briefly, and step down a rung "
        "— to facts or to the problem — then climb again.",
    ),
    core=T(
        "Почему порядок важен. Каждая ступень даёт право на следующую. Вопрос о выгоде "
        "работает, когда собеседник уже сам назвал проблему и посчитал, во что она "
        "обходится: тогда ценность решения — его вывод. Без этого тот же вопрос — ваше "
        "предложение, переодетое в вопрос, и его отбивают как предложение.\n\n"
        "Признаки, что вы прыгнули: «у нас всё в порядке», «к чему вы клоните?», «давайте "
        "лучше о цене». Это не отказ, а сигнал: собеседник не видит проблемы, которую вы "
        "решаете.\n\n"
        "Как вернуться. Не защищайте вопрос и не повторяйте его. Признайте коротко: "
        "«кажется, я забежал вперёд» — это снимает ощущение, что вас обрабатывают. "
        "Спуститесь на ступень, где собеседнику легко отвечать: спросите о фактах или о том, "
        "что мешает. Поднимайтесь снова по одной ступени, опираясь на его ответы, — и "
        "вопрос о выгоде в конце прозвучит уже как продолжение его слов.\n\n"
        "Что можно сокращать, а что нет. Ситуационные вопросы можно заменить подготовкой: "
        "прайс, сайт и прошлый договор часто отвечают на них заранее. Проблему и её цену "
        "пропускать нельзя — именно они делают вопрос о выгоде рабочим.\n\n"
        "Пример из найма: первым вопросом «Насколько важно закрыть вакансию до конца "
        "квартала?» — «Не горит». Шаг назад: «Сколько человек сейчас в команде и кто "
        "закрывает эту работу?» — и лестница начинается заново.",
        "Why the order matters. Each rung earns the right to the next. The payoff question "
        "works once the other side has named the problem and put a cost on it themselves: "
        "then the value of a fix is their conclusion. Without that, the same question is "
        "your proposal dressed up as a question, and it gets batted away like a proposal.\n\n"
        "Signs you jumped: “everything is fine with us”, “where are you going with this?”, "
        "“let us talk price instead”. This is not a refusal but a signal: they do not see the "
        "problem you are solving.\n\n"
        "How to recover. Do not defend the question and do not repeat it. Own it briefly: “I "
        "think I got ahead of myself” — it removes the sense of being worked on. Step down to "
        "a rung that is easy to answer: ask about facts or about what gets in the way. Then "
        "climb again one rung at a time, building on their answers — and the payoff question "
        "at the end will sound like a continuation of their own words.\n\n"
        "What you can shorten and what you cannot. Situation questions can be replaced by "
        "preparation: the price list, the website and last year's contract often answer "
        "them in advance. The problem and its cost cannot be skipped — they are what make the "
        "payoff question work.\n\n"
        "A hiring example: opening with “How valuable would it be to fill the role before "
        "quarter end?” gets “No rush.” Step back: “How many people are on the team, and who "
        "is covering that work now?” — and the ladder starts again.",
    ),
    phrases=(
        Phrase(
            T("Кажется, я забежал вперёд. Давайте с начала: как сейчас загружено ваше "
              "производство?",
              "I think I got ahead of myself. Let me start again: how do you currently plan "
              "production?"),
            moves=("spin_situation",), reveals=True,
            when=T("Сразу после «у нас всё в порядке» в ответ на вопрос о выгоде.",
                   "Right after “everything is fine” in reply to a payoff question."),
        ),
        Phrase(
            T("Можно я сначала задам пару вопросов о том, как у вас устроено производство, — "
              "чтобы не предлагать наугад?",
              "Tell me about your production planning first — I would rather not propose at "
              "random."),
            moves=("spin_situation",), reveals=True,
            when=T("В начале разговора: объясняет, зачем вы спрашиваете.",
                   "At the start: it explains why you are asking."),
        ),
        Phrase(
            T("Вы сказали, что всё загружено. А как у вас с загрузкой летом — так же ровно?",
              "You said you are fully loaded. How often does the factory run below capacity "
              "in summer?"),
            moves=("spin_situation",), reveals=True,
            when=T("Уточнить «у нас всё в порядке», не споря с ним.",
                   "To follow up on “everything is fine” without arguing with it."),
        ),
        Phrase(
            T("Что мешает держать ровную загрузку круглый год?",
              "What is the bottleneck in keeping utilization steady all year round?"),
            moves=("spin_problem",), reveals=True,
            when=T("Ступень P: после фактов — вопрос о том, что мешает.",
                   "The P rung: after the facts, ask what gets in the way."),
        ),
    ),
    dialog=Dialog(
        setup=T("Закупки. Вы открыли разговор с Ириной сразу вопросом о выгоде. Её цена — "
                "100 ₽ за штуку, ваша цель — 86.",
                "Procurement. You opened with Irina straight on the payoff question. Her "
                "price is 100 per unit; your target is 86."),
        opening=(
            you("Ирина, насколько важно было бы для вас закрыть загрузку на год вперёд?",
                "Irina, how valuable would it be to you to have the factory loaded a year "
                "ahead?",
                moves=("spin_needpayoff",)),
            them("У нас всё загружено, спасибо. Давайте лучше о цене — 100.",
                 "We are fully loaded, thank you. Let us talk price instead — 100."),
        ),
        bad=(
            you("Но годовой контракт — это стабильность и никаких простоев. Разве вам это не "
                "нужно?",
                "But an annual contract means stability and no downtime. Surely you need "
                "that?"),
            them("Спасибо, мы сами разберёмся, что нам нужно. Цена — 100.",
                 "Thank you, we will decide for ourselves what we need. The price is 100."),
        ),
        bad_why=T(
            "Вопрос о выгоде прозвучал раньше, чем Ирина признала проблему, и она его "
            "отбила. Вместо шага назад вы стали доказывать, что выгода есть, — то есть "
            "перешли от вопроса к рекламе. Ирина ещё больше уверена, что её обрабатывают, и "
            "разговор вернулся к цене.",
            "The payoff question came before Irina had admitted any problem, and she batted it "
            "away. Instead of stepping back, you started proving the value exists — you went "
            "from a question to an advert. Irina is now even surer she is being worked on, and "
            "the talk is back to price.",
        ),
        good=(
            you("Кажется, я забежал вперёд. Давайте с начала: как у вас с загрузкой летом — "
                "так же ровно, как весной?",
                "I think I got ahead of myself. Let me start again: how often does the "
                "factory run below capacity in summer?",
                moves=("spin_situation",)),
            them("Ну… летом проседаем, заказов меньше.",
                 "Well… it dips in summer, there are fewer orders."),
            you("Что мешает держать ровную загрузку круглый год?",
                "What is the bottleneck in keeping utilization steady all year round?",
                moves=("spin_problem",)),
            them("Крупные клиенты заказывают разово, под проект.",
                 "Big customers order one project at a time."),
            you("Во что обходится летний простой — и как это влияет на денежный поток?",
                "What does the summer downtime cost you — and how does that affect your cash "
                "flow?",
                moves=("spin_implication",), reveals=True),
            them("Люди на окладе, а летом ещё и кредиты берём.",
                 "People are on salary, and in summer we take loans on top."),
            you("Тогда насколько важно было бы для вас закрыть лето длинным контрактом?",
                "Then how valuable would it be to you to cover the summer with a long "
                "contract?",
                moves=("spin_needpayoff",), reveals=True),
            them("Вот это было бы очень кстати.", "Now that would be very welcome."),
        ),
        good_why=T(
            "Одна фраза «кажется, я забежал вперёд» сняла ощущение продажи, а вопрос о лете "
            "уточнил «всё загружено», не споря с ним. Дальше лестница по порядку: провал, "
            "причина, цена — и тот же по смыслу вопрос о выгоде в конце получил другой ответ, "
            "потому что теперь он стоит на её собственных словах.",
            "One line — “I think I got ahead of myself” — removed the sense of a sales pitch, "
            "and the question about summer followed up on “fully loaded” without arguing "
            "with it. Then the ladder in order: the dip, the cause, the cost — and a payoff "
            "question with the same meaning got a different answer at the end, because now it "
            "stands on her own words.",
        ),
    ),
    mistakes=(
        Mistake(
            T("Защищать свой вопрос",
              "Defending your question"),
            T("«Ну как же, это же очевидно выгодно» — вы спорите с человеком о его же "
              "бизнесе, и он обязан победить в этом споре, чтобы не потерять лицо. Вопрос, "
              "который не сработал, не доказывают, а заменяют вопросом ступенью ниже.",
              "“Come on, the benefit is obvious” — you are arguing with them about their own "
              "business, and they have to win that argument to save face. A question that did "
              "not work is not argued for; it is replaced by a question one rung down."),
        ),
        Mistake(
            T("Начать всё с нуля по сценарию",
              "Restarting from zero like a script"),
            T("Спуститься на ступень — не значит заново спрашивать про штат и историю "
              "компании. Если факты уже известны, начните с проблемы. Возврат на самое дно "
              "лестницы выглядит как анкета и тратит терпение, которое пригодится на I и N.",
              "Stepping down a rung does not mean asking about headcount and company history "
              "all over again. If you know the facts, start with the problem. Going back to "
              "the very bottom looks like a questionnaire and spends patience you will need "
              "for I and N."),
        ),
        Mistake(
            T("Перепрыгнуть с проблемы сразу на выгоду",
              "Jumping from the problem straight to the payoff"),
            T("«Летом простой? Насколько важно было бы закрыть лето?» — ступень I пропущена, "
              "и у выгоды нет цены: собеседник не посчитал, во что обходится проблема, и "
              "решение для него стоит мало. Между «что мешает» и «что это даст» всегда стоит "
              "«во что это обходится».",
              "“Downtime in summer? How valuable would it be to cover the summer?” — the I rung "
              "is skipped, so the payoff has no price: they never worked out what the problem "
              "costs, so a fix is worth little to them. Between “what gets in the way” and "
              "“what would it be worth” there is always “what does it cost”."),
        ),
    ),
    limits=(
        Limit(
            T("Собеседник сам пришёл с болью: «нам срочно нужен заказ на лето».",
              "The other side came with the pain themselves: “we urgently need an order for "
              "the summer”."),
            T("Проблема и её цена уже на столе — не заставляйте его проходить лестницу ради "
              "порядка. Уточните одно последствие и сразу спрашивайте о выгоде: «Насколько "
              "важно было бы закрыть лето контрактом на год?»",
              "The problem and its cost are already on the table — do not walk them up the "
              "ladder for the sake of order. Check one consequence and go straight to the "
              "payoff: “How valuable would it be to cover the summer with a year-long "
              "contract?”"),
        ),
        Limit(
            T("Это вторая встреча: проблему обсуждали в прошлый раз.",
              "This is a second meeting: the problem was discussed last time."),
            T("Не начинайте лестницу заново. Перескажите, что человек говорил тогда, и "
              "спросите, что изменилось: «В прошлый раз вы говорили о летнем провале — как "
              "сейчас?» Если боль на месте, можно подниматься сразу к выгоде.",
              "Do not start the ladder again. Retell what they said last time and ask what has "
              "changed: “Last time you mentioned the summer dip — how are things now?” If the "
              "pain is still there, you can go straight up to the payoff."),
        ),
    ),
)
