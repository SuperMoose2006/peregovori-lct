"""Лестница SPIN · урок 3 — «I — самая дорогая ступень»."""

from app.course.lessons._model import (Dialog, LessonMaterial, Limit, Mistake,
                                       Phrase, T, them, you)

MATERIAL = LessonMaterial(
    block="spin-ladder",
    lesson=3,
    scenario_id="supplier",
    technique=T("Спросить, во что обходится проблема",
                "Ask what the problem costs"),
    why=T(
        "Собеседник признал проблему — «летом линия стоит», — и хочется сразу перейти к "
        "делу: «значит, вам выгодно дать нам скидку». Но названная проблема — ещё не повод "
        "менять условия. Пока она не измерена в деньгах и времени, ваше предложение "
        "сравнивают с нулём: скидка 14 рублей со штуки — это потеря, а простой — «как-нибудь "
        "переживём». Приём: задать вопрос о последствиях, чтобы собеседник сам посчитал цену "
        "бездействия. После этого ваше предложение сравнивают уже с ней.",
        "The other side has admitted a problem — “the line stands idle in summer” — and you "
        "want to get straight to business: “so a discount would pay off for you”. But a "
        "named problem is not yet a reason to change terms. Until it is measured in money "
        "and time, your proposal is compared with zero: 14 roubles off per unit is a loss, "
        "while the downtime is “something we will live with”. The technique: ask about "
        "consequences so they work out the cost of doing nothing themselves. From then on, "
        "your proposal is compared with that cost.",
    ),
    core=T(
        "Извлекающий вопрос (I, Implication) берёт проблему, которую собеседник уже назвал, "
        "и спрашивает, к чему она приводит: по деньгам, по времени, по людям, по другим "
        "заказчикам. Формулы: «Во что обходится…», «К чему это приводит…», «Что будет, если "
        "так продолжится ещё год?», «Сколько вы теряете, когда…», «Как это влияет на…».\n\n"
        "Три правила. Только после проблемы, которую назвал сам собеседник: вопрос о "
        "последствиях чужой, не признанной им беды звучит как запугивание. Считает он, а не "
        "вы: свои цифры человек не оспаривает, ваши — оспорит обязательно. Одно последствие "
        "на вопрос, и двух-трёх вопросов хватит: дальше это уже нажим.\n\n"
        "Почему эта ступень самая дорогая: она меняет, с чем сравнивают ваше предложение. "
        "Годовой контракт по 88 против разовых заказов по 100 — это минус 12 рублей со штуки. "
        "Тот же контракт против летнего простоя, который стоит поставщику зарплат и "
        "процентов по кредитам, — это выгода.\n\n"
        "Пример из найма: руководитель говорит, что вакансия открыта третий месяц. "
        "I-вопрос: «Как пустая позиция влияет на сроки проекта — кто сейчас закрывает эту "
        "работу?» Прибавка кандидату после такого ответа выглядит меньше, чем сорванный "
        "запуск.",
        "An implication question (I) takes a problem the other side has already named and "
        "asks what it leads to: in money, in time, for people, for other customers. "
        "Templates: “What does that cost you…”, “What happens if…”, “If this continues for "
        "another year…”, “How does that affect…”.\n\n"
        "Three rules. Only after a problem they named themselves: asking about the "
        "consequences of a trouble they have not admitted sounds like scaremongering. They "
        "do the arithmetic, not you: people do not dispute their own numbers, but they will "
        "always dispute yours. One consequence per question, and two or three questions are "
        "enough: beyond that it turns into pressure.\n\n"
        "Why this rung is the most valuable: it changes what your offer is compared with. An "
        "annual contract at 88 versus one-off orders at 100 is minus 12 per unit. The same "
        "contract versus a summer downtime that costs the supplier salaries and loan "
        "interest is a gain.\n\n"
        "A hiring example: a manager says the role has been open for three months. The "
        "I-question: “How does the empty seat affect the project deadlines — who is covering "
        "that work now?” After that answer, a raise for the candidate looks smaller than a "
        "missed launch.",
    ),
    phrases=(
        Phrase(
            T("Во что обходится простой линии, если летом она стоит месяц?",
              "What does that cost you when a line sits idle for a month in summer?"),
            moves=("spin_implication",), reveals=True,
            when=T("Сразу после того, как собеседник назвал проблему.",
                   "Right after they have named the problem."),
        ),
        Phrase(
            T("Что будет с денежным потоком, если так продолжится ещё квартал?",
              "If this continues for another quarter, how does that affect your cash flow?"),
            moves=("spin_implication",), reveals=True,
            when=T("Второе последствие — в другой области, чем первое.",
                   "A second consequence — in a different area from the first."),
        ),
        Phrase(
            T("Сколько вы теряете, когда вместо длинного контракта каждый месяц приходится "
              "искать новые заказы?",
              "What does that cost you each time a one-off order ends and you have to start "
              "selling again?"),
            moves=("spin_implication",), reveals=True,
        ),
        Phrase(
            T("Если прикинуть на год, во что обходится простой?",
              "Over a whole year, what does that cost you — the idle weeks?"),
            moves=("spin_implication",), reveals=True,
            when=T("Чтобы посчитал он, а не вы.",
                   "So that they do the arithmetic, not you."),
        ),
    ),
    dialog=Dialog(
        setup=T("Закупки. Ирина держит 100 ₽ за штуку. Вам нужно не дороже 92, а лучше 86.",
                "Procurement. Irina is holding at 100 per unit. You need 92 at most, and 86 "
                "ideally."),
        opening=(
            them("Честно говоря, летом у нас провал по заказам, линия стоит.",
                 "To be honest, orders dry up in summer and the line stands idle."),
        ),
        bad=(
            you("Понятно. Тогда вам точно выгодно дать нам 86.",
                "I see. Then 86 for us would clearly pay off for you."),
            them("Выгодно? Цену мы держим, провалы как-нибудь переживём.",
                 "Pay off? We hold our price; we will get through the dips somehow."),
            you("По моим подсчётам, вы теряете летом миллиона три. Так что 86 — это для вас "
                "спасение.",
                "By my estimate you lose about three million every summer. So 86 would be a "
                "lifeline for you."),
            them("Не надо считать мои деньги. 100.", "Do not count my money. 100."),
        ),
        bad_why=T(
            "Проблема названа, но так и осталась настроением: вы прыгнули от неё сразу к "
            "своей цене, и Ирина сравнила 86 со своими 100, а не с простоем. Потом вы "
            "посчитали её убытки за неё — и она спорит уже с вашими цифрами, защищая свою "
            "фабрику.",
            "The problem was named but stayed a mood: you jumped from it straight to your "
            "price, so Irina compared 86 with her 100, not with the downtime. Then you worked "
            "out her losses for her — and now she is arguing with your numbers, defending her "
            "factory.",
        ),
        good=(
            you("Во что обходится простой линии, если летом она стоит месяц?",
                "What does that cost you when a line sits idle for a month in summer?",
                moves=("spin_implication",), reveals=True),
            them("Люди на окладе, аренда цеха. Месяц простоя — несколько миллионов.",
                 "People are on salary, the shop floor is rented. A month idle is several "
                 "million."),
            you("Что будет с денежным потоком, если так продолжится ещё год?",
                "If this continues for another year, how does that affect your cash flow?",
                moves=("spin_implication",), reveals=True),
            them("Будем и дальше брать короткие кредиты на лето. А это проценты.",
                 "We will keep taking short-term loans every summer. And that means "
                 "interest."),
            you("Понимаю. Получается, летний простой бьёт и по зарплатам, и по процентам за "
                "кредиты. Учтём это, когда дойдём до годового контракта.",
                "I understand. So the summer downtime hits both salaries and the interest on "
                "your loans. Let us keep that in mind when we get to an annual contract.",
                moves=("acknowledge",)),
            them("Да, это уже другой разговор.", "Yes, that is a different conversation."),
        ),
        good_why=T(
            "Два вопроса — две цены проблемы, и обе назвала Ирина: миллионы на простой и "
            "проценты за кредиты. Спорить с собственными цифрами она не станет. Годовой "
            "контракт теперь сравнивают не со скидкой, а с этими потерями, — и Ирина сама "
            "говорит, что разговор стал другим.",
            "Two questions, two costs of the problem, both named by Irina: millions on "
            "downtime and interest on loans. She will not argue with her own numbers. An "
            "annual contract is now weighed not against a discount but against those losses "
            "— and Irina says herself that the conversation has changed.",
        ),
    ),
    mistakes=(
        Mistake(
            T("Посчитать убытки за собеседника",
              "Working out their losses for them"),
            T("«По моим оценкам, вы теряете три миллиона» — ваша цифра, и её обязательно "
              "оспорят: «вы не знаете нашей экономики». Спор о цифре заменяет разговор о "
              "проблеме. Спросите — пусть посчитает он, даже если выйдет меньше вашей "
              "оценки.",
              "“By my estimate you are losing three million” is your number, and it will "
              "always be disputed: “you do not know our economics”. An argument about the "
              "figure replaces the conversation about the problem. Ask — let them do the "
              "sums, even if the result is lower than your estimate."),
        ),
        Mistake(
            T("Последствия проблемы, которой не называли",
              "Consequences of a problem nobody named"),
            T("«А вы понимаете, что будет, если заказчики уйдут?» — если собеседник не "
              "говорил, что заказчики уходят, это не вопрос, а угроза. Извлекающий вопрос "
              "всегда опирается на его слова: «вы сказали, что летом линия стоит — во что "
              "это обходится?».",
              "“Do you realise what happens if your customers leave?” — if they never said "
              "customers were leaving, that is not a question but a threat. An implication "
              "question always rests on their words: “you said the line stands idle in "
              "summer — what does that cost you?”."),
        ),
        Mistake(
            T("Нагнетать",
              "Piling it on"),
            T("Пятый вопрос о потерях подряд — и человек чувствует, что его загоняют в угол: "
              "«вы хотите сказать, что мы плохо работаем?». Двух-трёх последствий хватает, "
              "чтобы проблема стала ощутимой. Дальше переходите к вопросу о решении.",
              "A fifth question about losses in a row, and the person feels cornered: “are "
              "you saying we run our business badly?”. Two or three consequences are enough "
              "to make the problem real. Then move on to a question about the fix."),
        ),
    ),
    limits=(
        Limit(
            T("Проблема для собеседника мелкая: последствия копеечные, и он это знает.",
              "The problem is minor for them: the consequences are trivial, and they know "
              "it."),
            T("Не раздувайте её — это видно и подрывает доверие. Ищите другой интерес, где "
              "последствия настоящие, или торгуйтесь по другим условиям: сроку, объёму, "
              "графику оплаты.",
              "Do not blow it up — it shows and undermines trust. Look for another interest "
              "where the consequences are real, or trade on other terms: length, volume, "
              "payment schedule."),
        ),
        Limit(
            T("Тема болезненная лично: сокращения, личные потери, чужая ошибка, за которую "
              "человеку попало.",
              "The topic is personally painful: layoffs, personal losses, someone else's "
              "mistake they were blamed for."),
            T("Вопрос «во что это обходится» здесь звучит жестоко. Сначала назовите чувство и "
              "покажите, что понимаете, — этому учит блок «Слушание и деэскалация», — и "
              "только потом, если уместно, спрашивайте о последствиях для дела.",
              "“What does it cost you” sounds cruel here. First name the feeling and show you "
              "understand — the “Listening & De-escalation” block teaches this — and only "
              "then, if it fits, ask about the consequences for the business."),
        ),
    ),
)
