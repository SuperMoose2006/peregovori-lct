"""Стиль собеседника · урок 4 — «Когда сила у вас»."""

from app.course.lessons._model import (Dialog, LessonMaterial, Limit, Mistake,
                                       Phrase, T, them, you)

MATERIAL = LessonMaterial(
    block="styles",
    lesson=4,
    scenario_id="candidate_offer",
    technique=T("Не выжимать, когда можно выжать",
                "Do not squeeze just because you can"),
    why=T(
        "Когда у второй стороны нет выбора — у кандидата нет другого оффера, маленький "
        "поставщик живёт на ваших заказах, — очень хочется дожать до минимума. Цифра "
        "получается отличная, а результат плохой: кандидат подписывает и через полгода "
        "уходит к тому, кто позвонит с лучшим предложением; поставщик соглашается на "
        "цену в убыток и начинает экономить на качестве. Приём лечит близорукость: "
        "сила нужна не чтобы забрать всё, а чтобы спокойно спросить, что человеку "
        "нужно, и заплатить тем, что вам стоит дёшево.",
        "When the other side has no choice — the candidate has no rival offer, a small "
        "supplier lives on your orders — the urge is to squeeze them to the minimum. "
        "The number comes out great and the result comes out bad: the candidate signs "
        "and leaves six months later for whoever calls with a better offer; the "
        "supplier agrees to a loss-making price and starts saving on quality. This "
        "technique cures the short sight: power is not there to take everything, but "
        "to ask calmly what the person needs and to pay with what is cheap for you.",
    ),
    core=T(
        "Четыре шага.\n\n"
        "Первый — цель назначается до разговора, и на ней вы останавливаетесь. Всё, "
        "что ниже цели, результат не улучшает: деньги вы сэкономили, а человека, "
        "который помнит, как его дожали, получили.\n\n"
        "Второй — силу тратят на вопрос, а не на нажим. Человеку, которому некуда "
        "идти, не нужно напоминать об этом: он знает. Ему нужно понять, что с вами "
        "можно договориться.\n\n"
        "Третий — платите тем, что стоит вам дёшево и ценно ему. План развития до "
        "архитектора стоит компании подписи под документом, а для Тимура это причина "
        "всего перехода.\n\n"
        "Четвёртый — закрывайте на цели и фиксируйте условия письменно.\n\n"
        "Та же логика в закупках: резидент ОЭЗ, для которого местный подрядчик — "
        "единственный в округе, может продавить цену ниже себестоимости. Через квартал "
        "он будет искать нового подрядчика — дороже и дальше.",
        "Four steps.\n\n"
        "First — the target is set before the conversation, and you stop there. "
        "Anything below the target does not improve the result: you save money and gain "
        "a person who remembers being squeezed.\n\n"
        "Second — spend the power on a question, not on pressure. Someone with nowhere "
        "else to go does not need reminding: they know. What they need is to see that "
        "you are someone they can deal with.\n\n"
        "Third — pay with what is cheap for you and valuable to them. A development plan "
        "toward architect costs the company a signature on a document; for Timur it is "
        "the reason for the whole move.\n\n"
        "Fourth — close at the target and put the terms in writing.\n\n"
        "The same logic in procurement: an SEZ resident for whom a local contractor is "
        "the only one around can push the price below cost. A quarter later it will be "
        "looking for a new contractor — pricier and farther away.",
    ),
    phrases=(
        Phrase(
            T("Мне не нужна самая низкая цифра — мне нужно, чтобы вы пришли и остались. "
              "Что для вас важно в карьере здесь?",
              "I do not need the lowest number — I need you to join and to stay. What "
              "matters most to you about your career here?"),
            moves=("interests_probe",), reveals=True,
            when=T("Вместо нажима, когда знаете, что второго оффера у человека нет.",
                   "Instead of pressure, when you know they have no rival offer."),
        ),
        Phrase(
            T("Что для вас критично в переезде: подъёмные или жильё на первые месяцы?",
              "What matters most to you in relocating: a moving allowance, or housing for "
              "the first months?"),
            moves=("interests_probe",), reveals=True,
        ),
        Phrase(
            T("Мы готовы вписать в оффер план развития до архитектора и наставника при "
              "условии, что сходимся на 230.",
              "We are ready to write a development plan toward architect and a mentor "
              "into the offer, provided that we settle at 230."),
            moves=("tradeoff",),
            when=T("Платите дешёвым для вас и ценным для него — и связывайте с цифрой.",
                   "Pay with what is cheap for you and valuable to him — and tie it to the "
                   "number."),
        ),
        Phrase(
            T("Хочу, чтобы через год вы не искали новое место. Давайте соберём условия, "
              "при которых уходить не захочется.",
              "I want you not to be job-hunting a year from now. Let us put together terms "
              "that make leaving the last thing on your mind."),
        ),
    ),
    dialog=Dialog(
        setup=T("Найм. У Тимура нет другого оффера, и он подписал бы и на 210. Ваша цель — "
                "230, бюджет позволяет до 260.",
                "Hiring. Timur has no other offer and would sign even at 210. Your target is "
                "230; the budget allows up to 260."),
        opening=(
            them("Я бы хотел 280. Но понимаю, что других предложений у меня сейчас нет.",
                 "I would like 280. But I understand I have no other offers right now."),
        ),
        bad=(
            you("Раз других предложений нет, наше предложение — 210. Выходите в "
                "понедельник.",
                "Since there are no other offers, our offer is 210. You start on Monday.",
                moves=("anchor",)),
            them("…Хорошо. Подпишу.", "…All right. I will sign."),
        ),
        bad_why=T(
            "Вы выжали на двадцать тысяч ниже собственной цели и ничего за это не "
            "получили: цель была 230, и она уже означала хорошую сделку. Тимур подписал, "
            "потому что выбора не было, — и запомнил. Через полгода ему позвонят с 260, "
            "и позицию вы откроете заново: месяцы поиска, снова ввод в работу. Сила "
            "купила цифру и стоила результата.",
            "You squeezed twenty thousand below your own target and got nothing for it: "
            "the target was 230, and that already meant a good deal. Timur signed because "
            "he had no choice — and he will remember. In six months someone will call him "
            "with 260, and you will reopen the role: months of searching, onboarding all "
            "over again. The power bought a number and cost the result.",
        ),
        good=(
            you("Мне не нужна самая низкая цифра — мне нужно, чтобы вы пришли и остались. "
                "Что для вас важно в карьере здесь?",
                "I do not need the lowest number — I need you to join and to stay. What "
                "matters most to you about your career here?",
                moves=("interests_probe",), reveals=True),
            them("Расти. На прошлом месте я три года сидел на легаси, а потом нас сократили.",
                 "To grow. At my last job I spent three years on legacy code, and then we "
                 "were laid off."),
            you("Мы готовы вписать в оффер план развития до архитектора и наставника при "
                "условии, что сходимся на 230.",
                "We are ready to write a development plan toward architect and a mentor "
                "into the offer, provided that we settle at 230.",
                moves=("tradeoff",)),
            them("С таким планом 230 — честно. Согласен.",
                 "With a plan like that, 230 is fair. I agree."),
        ),
        good_why=T(
            "Сила никуда не делась — вы просто не стали её показывать. Вопрос дал Тимуру "
            "назвать главное, план развития стоил компании подписи, а цифра осталась на "
            "вашей цели. Человек подписывает не потому, что некуда деться, а потому, что "
            "получил то, ради чего шёл, — и такой сотрудник остаётся.",
            "The power did not go anywhere — you simply did not show it. The question let "
            "Timur name what matters most, the development plan cost the company a "
            "signature, and the number stayed on your target. He signs not because he has "
            "nowhere else to go but because he got what he came for — and that kind of hire "
            "stays.",
        ),
    ),
    mistakes=(
        Mistake(
            T("Путать «можно выжать» и «нужно выжать»",
              "Confusing “can squeeze” with “should squeeze”"),
            T("Цель уже означает хорошую сделку. Каждая тысяча ниже неё не добавляет "
              "ничего, кроме обиды, а обида обходится дороже тысячи: уходом, "
              "саботажем, плохой славой на рынке.",
              "The target already means a good deal. Every thousand below it adds nothing "
              "but resentment, and resentment costs more than the thousand: an early exit, "
              "foot-dragging, a bad name in the market."),
        ),
        Mistake(
            T("Показывать силу вслух",
              "Saying your power out loud"),
            T("«У вас же всё равно нет других предложений» — даже если это правда, "
              "сказанное вслух это унижение. Человек согласится и запомнит. Сила, о "
              "которой обе стороны знают, работает и без слов.",
              "“You have no other offers anyway” — even if true, said out loud it is "
              "humiliating. The person will agree and remember. Power both sides know "
              "about works without being spoken."),
        ),
        Mistake(
            T("Платить дорогим, когда есть дешёвое",
              "Paying with something expensive when something cheap will do"),
            T("Поднять оклад «в знак доброй воли» — дорого и ненадолго. План развития и "
              "наставник ценны ему больше, а компании стоят меньше. Сначала спросите, что "
              "для человека главное, потом выбирайте, чем платить.",
              "Raising the salary “as a gesture of goodwill” is expensive and does not last. "
              "A development plan and a mentor mean more to him and cost the company less. "
              "Ask first what matters most to the person, then choose what to pay with."),
        ),
    ),
    limits=(
        Limit(
            T("Сделка действительно разовая: вы покупаете оборудование у фирмы, которая "
              "закрывается, и больше не встретитесь.",
              "The deal really is one-off: you are buying equipment from a company that is "
              "closing down, and you will not meet again."),
            T("Здесь силу можно тратить на цену — отношений, которые стоит беречь, нет. Но "
              "не унижайте: рынок тесный, и люди, с которыми вы торговались, уходят "
              "работать к вашим будущим партнёрам.",
              "Here you can spend the power on price — there is no relationship to protect. "
              "But do not humiliate anyone: the market is small, and the people you "
              "bargained with go on to work for your future partners."),
        ),
        Limit(
            T("Цель пришлось опустить: бюджет урезали, и 230 компания уже не даёт.",
              "The target had to drop: the budget was cut and the company can no longer "
              "pay 230."),
            T("Скажите это прямо и с причиной, а разницу доберите дешёвыми условиями: "
              "«Бюджет урезали, 230 не могу. Могу 220, сокращённый испытательный срок и "
              "пересмотр через полгода». Честное ограничение человек принимает, "
              "спрятанное — нет.",
              "Say so directly and give the reason, and make up the gap with cheap terms: "
              "“The budget was cut, I cannot do 230. I can do 220, a shorter probation and "
              "a review in six months.” People accept an honest constraint; a hidden one "
              "they do not."),
        ),
    ),
)
