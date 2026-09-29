"""Подготовка к столу · урок 3 — «Гипотезы пишутся до стола»."""

from app.course.lessons._model import (Dialog, LessonMaterial, Limit, Mistake,
                                       Phrase, T, them, you)

MATERIAL = LessonMaterial(
    block="preparation",
    lesson=3,
    scenario_id="salary",
    technique=T("Гипотеза на каждую тему — и вопрос, который её проверяет",
                "A hypothesis for each topic — and a question to test it"),
    why=T(
        "Без подготовки за столом остаются две крайности. Либо общий вопрос «что для вас "
        "важно?» — и такой же общий ответ, из которого ничего не следует. Либо уверенность, "
        "что вы и так всё знаете: «вы же боитесь перерасхода» — и предложение, которое "
        "никому не нужно. Приём даёт третий путь: до встречи вы записываете догадку по "
        "каждой теме и готовите вопрос, которым её проверите. За столом остаётся спросить и "
        "послушать.",
        "Without preparation you are left with two extremes at the table. Either a generic "
        "“what matters to you?” and an equally generic answer that leads nowhere. Or the "
        "certainty that you already know: “you are obviously worried about overspending” — "
        "and an offer nobody needs. This technique gives you a third way: before the "
        "meeting you write down a guess for each topic and prepare the question that will "
        "test it. At the table all that is left is to ask and listen.",
    ),
    core=T(
        "Интересы собеседника скрыты, но темы — области, где они лежат, — обычно видны "
        "заранее. У директора, который нанимает, это бюджет отдела, сроки найма, "
        "согласование с финансами. Тема не выдаёт секрет, но говорит, где копать.\n\n"
        "На каждую тему — три записи в листе подготовки.\n\n"
        "Гипотеза — ваша догадка, что в этой теме ему важно: «бюджет отдела — вилку, скорее "
        "всего, уже утвердили, и перерасход придётся объяснять».\n\n"
        "Вопрос — открытый и с названной темой: «Как у вас сейчас с бюджетом отдела на эту "
        "роль — вилка уже зафиксирована?»\n\n"
        "Что предложить, если подтвердится: «пересмотр через полгода по KPI — прибавка "
        "уходит с сегодняшнего бюджета».\n\n"
        "За столом гипотезу проверяют, а не объявляют. Подтвердилась — у вас готово "
        "предложение под настоящий интерес. Не подтвердилась — это тоже результат: скажите "
        "об этом вслух, уточните и замените гипотезу.\n\n"
        "Вопрос пишут заранее, потому что на ходу в тему попасть трудно: общий вопрос "
        "возвращается переспросом «а что именно вас интересует?». Пример из закупок: тема "
        "«оплата» — гипотеза «у поставщика кассовый разрыв к концу квартала» — вопрос «как "
        "у вас сейчас с оборотными средствами?».",
        "The other side's interests are hidden, but the topics — the areas where they lie — "
        "are usually visible in advance. For a director who is hiring, those are the team "
        "budget, the hiring timeline and finance approval. A topic gives away no secret, but "
        "it tells you where to dig.\n\n"
        "For each topic, three entries on your prep sheet.\n\n"
        "A hypothesis — your guess at what matters to them in this area: “team budget — the "
        "band has probably been signed off already, and any overrun will need "
        "explaining”.\n\n"
        "A question — open, and naming the topic: “How do you currently set the team budget "
        "for this role — is the band already fixed?”\n\n"
        "What to offer if it is confirmed: “a six-month KPI review — the raise moves off "
        "today's budget”.\n\n"
        "At the table a hypothesis is tested, not announced. Confirmed — you have an offer "
        "ready for a real interest. Refuted — that is a result too: say so out loud, ask a "
        "follow-up and replace the hypothesis.\n\n"
        "The question is written in advance because it is hard to hit the topic on the fly: "
        "a generic question comes back as “what exactly are you asking about?”. A "
        "procurement example: topic “payment” — hypothesis “the supplier has a cash gap "
        "before quarter end” — question “how is your working capital looking at the "
        "moment?”.",
    ),
    phrases=(
        Phrase(
            T("Как у вас сейчас с бюджетом отдела на эту роль — вилка уже зафиксирована?",
              "How do you currently set the team budget for this role — is the band already "
              "fixed?"),
            moves=("spin_situation",), reveals=True,
            when=T("Тема «бюджет»: гипотеза спрятана внутрь вопроса.",
                   "Topic “budget”: the hypothesis is tucked inside the question."),
        ),
        Phrase(
            T("Что для вас важнее в сроках найма: закрыть позицию быстро или без спешки найти "
              "подходящего человека?",
              "What matters more to you on the hiring timeline: filling the role quickly, or "
              "taking your time to find the right person?"),
            moves=("interests_probe",), reveals=True,
        ),
        Phrase(
            T("Что вас беспокоит в согласовании с финансами — придётся ли объяснять цифру "
              "выше вилки?",
              "What concerns you about finance approval — having to justify a figure above "
              "the band?"),
            moves=("spin_problem",), reveals=True,
        ),
        Phrase(
            T("Я думал, что главное для вас — бюджет. Правильно ли я понял, что сейчас важнее "
              "скорость?",
              "I assumed the budget was the main thing for you. If I understand you right, "
              "speed matters more right now?"),
            moves=("acknowledge",),
            when=T("Когда ответ разошёлся с гипотезой: скажите это и уточните.",
                   "When the answer does not match your hypothesis: say so and check."),
        ),
    ),
    dialog=Dialog(
        setup=T("Найм. Вы обсуждаете оффер с Дмитрием. В первом варианте гипотез нет, во "
                "втором на каждую тему записаны догадка и вопрос.",
                "Hiring. You are discussing an offer with Dmitry. In the first version you "
                "have no hypotheses; in the second, each topic has a guess and a question "
                "written down."),
        opening=(
            them("Давайте обсудим условия. С чего начнём?",
                 "Let us discuss terms. Where shall we start?"),
        ),
        bad=(
            you("Что для вас важно?", "What matters to you?", moves=("interests_probe",)),
            them("Чтобы человек хорошо работал. А что именно вас интересует?",
                 "That the person does good work. What exactly are you asking about?"),
            you("Ну, вы же явно боитесь перерасхода бюджета. Давайте часть оклада заменим "
                "бонусом.",
                "Well, you are obviously worried about overspending the budget. Let us swap "
                "part of the base for a bonus."),
            them("С чего вы взяли? Бюджет — не главная моя забота.",
                 "What makes you think that? The budget is not my main worry."),
        ),
        bad_why=T(
            "Общий вопрос получил общий ответ и переспрос. Тогда вы выдали догадку за факт — "
            "и промахнулись: предложили решение проблемы, которую Дмитрий считает не главной, "
            "да ещё и отдали часть своего оклада. Гипотеза, не проверенная вопросом, стоит "
            "денег.",
            "A generic question got a generic answer and a counter-question. Then you passed "
            "off a guess as a fact — and missed: you offered to solve a problem Dmitry does "
            "not see as the main one, and gave away part of your base pay in the process. A "
            "hypothesis that is not tested with a question costs money.",
        ),
        good=(
            you("Как у вас сейчас с бюджетом отдела на эту роль — вилка уже зафиксирована?",
                "How do you currently set the team budget for this role — is the band "
                "already fixed?",
                moves=("spin_situation",), reveals=True),
            them("Зафиксирована, выйти за неё сложно. Но сильнее давит другое: позиция горит, "
                 "человек нужен через месяц.",
                 "It is fixed, and going beyond it is hard. But something else weighs more: "
                 "the role is urgent, I need someone within a month."),
            you("Я думал, что главное для вас — бюджет. Правильно ли я понял, что сейчас "
                "важнее скорость? Тогда скажу сразу: выйти я могу через две недели.",
                "I assumed the budget was the main thing for you. If I understand you right, "
                "speed matters more right now? Then let me say straight away: I can start in "
                "two weeks.",
                moves=("acknowledge",)),
            them("Через две недели? Это серьёзно меняет разговор.",
                 "In two weeks? That changes the conversation considerably."),
        ),
        good_why=T(
            "На вопрос по теме с догадкой внутри — «вилка уже зафиксирована?» — легко "
            "ответить, и Дмитрий ответил больше, чем спросили: бюджет важен, но сильнее давят "
            "сроки. Вы не стали держаться за свою гипотезу, а вслух её поправили — и сразу "
            "предложили то, что ему ценно, а вам почти ничего не стоит: быстрый выход.",
            "A question on the topic with the guess built in — “is the band already fixed?” — "
            "is easy to answer, and Dmitry told you more than you asked: the budget matters, "
            "but timing weighs more. You did not cling to your hypothesis; you corrected it "
            "out loud — and immediately offered something he values and that costs you almost "
            "nothing: an early start.",
        ),
    ),
    mistakes=(
        Mistake(
            T("Объявить гипотезу фактом", "Announcing the hypothesis as fact"),
            T("«Вы же боитесь перерасхода» — если не угадали, вы спорите с человеком о его же "
              "мотивах. Гипотеза звучит вопросом: «вилка уже зафиксирована?».",
              "“You are obviously worried about overspending” — if you guessed wrong, you are "
              "now arguing with someone about their own motives. A hypothesis should sound "
              "like a question: “is the band already fixed?”."),
        ),
        Mistake(
            T("Спрашивать без темы", "Asking without a topic"),
            T("«Что для вас важно?» получает «чтобы человек хорошо работал». Назовите "
              "область — бюджет, сроки, согласование, — и ответ станет конкретным.",
              "“What matters to you?” gets “that the person does good work”. Name the area — "
              "budget, timing, approval — and the answer becomes concrete."),
        ),
        Mistake(
            T("Держаться за гипотезу, когда ответ её опроверг",
              "Clinging to a hypothesis the answer has refuted"),
            T("Вы готовили предложение под бюджет и продолжаете его продвигать, хотя человек "
              "говорит про сроки. Готовое предложение — не повод не слушать: меняйте "
              "гипотезу, а не ответ собеседника.",
              "You prepared an offer around the budget and keep pushing it while they talk "
              "about timing. A ready offer is no excuse to stop listening: change your "
              "hypothesis, not their answer."),
        ),
    ),
    limits=(
        Limit(
            T("Тем заранее не видно: новый собеседник, незнакомая отрасль.",
              "No topics are visible in advance: a new counterpart, an unfamiliar industry."),
            T("Возьмите стандартный набор областей — деньги, сроки, риск, репутация перед "
              "руководством — и на первой встрече задайте по вопросу на каждую. Гипотезы "
              "напишете после неё.",
              "Use a standard set of areas — money, timing, risk, how things look to their "
              "boss — and at the first meeting ask one question on each. Write the hypotheses "
              "afterwards."),
        ),
        Limit(
            T("Собеседник сам подробно рассказывает, что ему важно.",
              "The other side explains in detail what matters to them, unprompted."),
            T("Не перебивайте его заготовленными вопросами. Слушайте и отмечайте в листе, "
              "какие гипотезы он подтвердил; вопросы нужны только для тем, о которых он "
              "промолчал.",
              "Do not interrupt with your prepared questions. Listen, and tick off on your "
              "sheet which hypotheses they have confirmed; you only need questions for the "
              "topics they left out."),
        ),
    ),
)
