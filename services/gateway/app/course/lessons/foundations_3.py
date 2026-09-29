"""Позиции и интересы · урок 3 — «Вопрос-открывашка»."""

from app.course.lessons._model import (Dialog, LessonMaterial, Limit, Mistake,
                                       Phrase, T, them, you)

MATERIAL = LessonMaterial(
    block="foundations",
    lesson=3,
    scenario_id="rent",
    technique=T("Открытый вопрос с названной темой",
                "An open question that names a topic"),
    why=T(
        "Спросить хотят все, а спрашивают двумя неудачными способами. Закрытым вопросом — "
        "«вам же важно, чтобы платили вовремя, да?» — на него отвечают «да» или «нет», и "
        "разговор стоит на месте. Или голым «почему?» — «почему 75?», — которое звучит как "
        "требование оправдаться, и человек защищает цифру вместо того, чтобы рассказать о "
        "себе. Приём лечит оба случая: вопрос начинается с «что» или «как», спрашивает про "
        "человека, а не про цифру, и сразу называет тему, в которой может лежать ответ.",
        "Everyone wants to ask, and most people ask in one of two unhelpful ways. A closed "
        "question — “rent on time matters to you, right?” — gets a yes or a no, and the "
        "conversation stalls. Or a bare “why?” — “why 75?” — which sounds like a demand to "
        "justify yourself, so the person defends the number instead of talking about "
        "themselves. The technique fixes both: the question starts with “what” or “how”, "
        "asks about the person rather than the figure, and names the topic where the answer "
        "might lie.",
    ),
    core=T(
        "В вопросе-открывашке три части. Открытое начало: «что», «как» — на такой вопрос "
        "нельзя ответить одним словом. Адресат: «для вас», «вас» — вопрос про человека, а не "
        "про сумму. Тема — область, где может быть интерес: «в оплате», «в поиске жильцов», "
        "«в сроках поставки».\n\n"
        "Тема — не догадка о секрете, а направление. «Что для вас важно в оплате?» не "
        "утверждает, что беда в оплате, а показывает, куда смотреть, — и человеку легко "
        "ответить. Вопрос без темы («что для вас важно?») слишком широк: в ответ чаще "
        "переспрашивают «а что именно вас интересует?».\n\n"
        "Сравните три вопроса к одной и той же хозяйке квартиры. Закрытый: «Вам важно, чтобы "
        "платили вовремя?» — «Ну да». Голый: «Почему 75?» — «Потому что столько стоит». С "
        "темой: «Что для вас важно в оплате?» — «Чтобы деньги приходили первого числа, у меня "
        "самой платежи в начале месяца». Только третий ответ можно превратить в условие "
        "сделки.\n\n"
        "Где брать темы: из того, что человек уже сказал, и из того, что обычно волнует его "
        "сторону. У хозяйки квартиры — простой, жильцы, оплата. У поставщика — загрузка "
        "цеха, деньги, срок контракта. У нанимающего руководителя — бюджет, сроки найма, "
        "согласование с финансами.",
        "An opener question has three parts. An open start — “what”, “how” — which cannot be "
        "answered in one word. An addressee — “to you”, “you” — so the question is about the "
        "person, not the amount. A topic — the area where an interest might sit: “about "
        "payments”, “about vacancy”, “about delivery dates”.\n\n"
        "A topic is not a guess at the secret; it is a direction. “What matters to you about "
        "payments?” does not claim that payments are the problem; it shows where to look — "
        "and it is easy to answer. A question with no topic (“what matters to you?”) is too "
        "wide: the reply is more often “what exactly are you asking about?”.\n\n"
        "Compare three questions to the same landlady. Closed: “Is rent on time important to "
        "you?” — “Well, yes.” Bare: “Why 75?” — “Because that is what it costs.” With a "
        "topic: “What matters to you about payments?” — “That the money arrives on the "
        "first; my own bills are due at the start of the month.” Only the third answer can be "
        "turned into a term of the deal.\n\n"
        "Where topics come from: what the person has already said, and what usually worries "
        "their side. For a landlady — vacancy, tenants, payments. For a supplier — factory "
        "load, cash, contract length. For a hiring manager — budget, hiring timeline, "
        "sign-off from finance.",
    ),
    phrases=(
        Phrase(
            T("Что для вас важно в оплате?",
              "What matters most to you about payments?"),
            moves=("interests_probe",), reveals=True,
            when=T("Самая короткая форма: начало, адресат, тема.",
                   "The shortest form: open start, addressee, topic."),
        ),
        Phrase(
            T("Что стоит за цифрой 75 — прошлый опыт с жильцами?",
              "What is the real reason behind 75 — did the flat stand vacant between "
              "tenants?"),
            moves=("interests_probe",), reveals=True,
            when=T("Вместо «почему 75?»: тот же вопрос, но про человека, а не про цифру.",
                   "Instead of “why 75?”: the same question, but about the person, not the "
                   "number."),
        ),
        Phrase(
            T("Что вас беспокоит в поиске жильцов?",
              "What concerns you most about vacancy?"),
            moves=("spin_problem",), reveals=True,
            when=T("Когда видно, что за позицией стоит тревога.",
                   "When you can tell there is a worry behind the position."),
        ),
        Phrase(
            T("Что для вас важно в тишине и порядке — какой жилец вам спокойнее?",
              "What matters to you about peace and quiet — what kind of tenant puts you at "
              "ease?"),
            moves=("interests_probe",), reveals=True,
        ),
        Phrase(
            T("Как у вас обычно было с жильцами — надолго заезжали или менялись?",
              "How often has the flat stood vacant between tenants?"),
            moves=("spin_situation",), reveals=True,
            when=T("«Как»-вопрос о фактах, если спрашивать о важном пока рано.",
                   "A “how” question about facts, when it is too early to ask what matters."),
        ),
    ),
    dialog=Dialog(
        setup=T("Аренда. Наталья просит 75 тысяч в месяц и не объясняет почему.",
                "Renting. Natalia is asking 75k a month and does not say why."),
        opening=(
            them("75 тысяч. Дешевле не отдам.", "75k. I will not let it for less."),
        ),
        bad=(
            you("Почему 75?", "Why 75?"),
            them("Потому что столько стоит. Посмотрите объявления.",
                 "Because that is what it costs. Look at the listings."),
            you("А почему так дорого?", "And why is it so expensive?"),
            them("Я уже ответила. Не хотите — не снимайте.",
                 "I have already answered. If you do not want it, do not take it."),
        ),
        bad_why=T(
            "Два «почему» подряд — и разговор превратился в допрос. Наталья защищает цифру и "
            "ссылается на объявления, то есть отвечает про рынок, а не про себя. Вы узнали "
            "только то, что она обиделась.",
            "Two “whys” in a row, and the conversation has become an interrogation. Natalia "
            "defends the number and points at the listings — she is answering about the "
            "market, not about herself. All you learned is that she took offence.",
        ),
        good=(
            you("Что стоит за цифрой 75 — прошлый опыт с жильцами?",
                "What is the real reason behind 75 — did the flat stand vacant between "
                "tenants?",
                moves=("interests_probe",), reveals=True),
            them("Прошлые съехали без предупреждения. Два месяца я платила за пустую "
                 "квартиру сама.",
                 "The last ones left without warning. For two months I paid for an empty flat "
                 "myself."),
            you("Понимаю. А в оплате что для вас важно?",
                "I understand. And what matters most to you about payments?",
                moves=("acknowledge", "interests_probe"), reveals=True),
            them("Чтобы деньги приходили день в день. У меня самой платежи первого числа.",
                 "That the money comes on the same day every month. My own bills are due on "
                 "the first."),
        ),
        good_why=T(
            "Первый вопрос спрашивает о том же, что «почему 75», но про её опыт, а не про "
            "цифру, и подсказывает тему — жильцов. Наталье не нужно защищаться, и она "
            "рассказывает о пустых месяцах. Второй вопрос называет новую тему — оплату — и "
            "приносит второй интерес. Теперь у вас есть два условия, которыми можно платить "
            "вместо денег: долгий договор и оплата точно в срок.",
            "The first question asks the same thing as “why 75”, but about her experience "
            "rather than the number, and it hints at a topic — tenants. Natalia has nothing to "
            "defend, so she talks about the empty months. The second question names a new "
            "topic — payments — and brings out a second interest. Now you have two terms you "
            "can pay with instead of money: a long lease and rent exactly on time.",
        ),
    ),
    mistakes=(
        Mistake(
            T("Вопрос, в котором уже есть ответ",
              "A question that already contains the answer"),
            T("«Вам же важно, чтобы жилец был тихий, да?» — это не вопрос, а подсказка. "
              "Человек из вежливости скажет «да», и вы примете свою догадку за его интерес. "
              "Назовите тему, но оставьте ответ ему: «Что для вас важно в тишине и порядке?»",
              "“A quiet tenant matters to you, right?” is not a question but a prompt. Out of "
              "politeness they say “yes”, and you mistake your own guess for their interest. "
              "Name the topic but leave the answer to them: “What matters to you about peace "
              "and quiet?”"),
        ),
        Mistake(
            T("Две темы и три вопроса в одной реплике",
              "Two topics and three questions in one line"),
            T("«Что для вас важно в оплате, а в сроках, и вообще почему такая цена?» На длинную "
              "очередь вопросов отвечают на последний, самый неудобный, — или ни на какой. "
              "Один вопрос — одна тема. Следующую спросите, когда услышите ответ.",
              "“What matters to you about payments, and about timing, and why that price "
              "anyway?” People answer the last question in a queue — the most awkward one — or "
              "none at all. One question, one topic. Ask the next when you have heard the "
              "answer."),
        ),
        Mistake(
            T("Тема, которой у собеседника нет",
              "A topic the other side does not have"),
            T("Спросить хозяйку квартиры, что ей важно в логистике, — значит показать, что вы "
              "не думали о её положении. Тему берите из её мира: что она сказала, чего обычно "
              "боятся на её месте. Промах по теме стоит одного переспроса, но ещё один такой "
              "подряд — и вас перестают принимать всерьёз.",
              "Asking a landlady what matters to her about logistics shows you have not "
              "thought about her position. Take the topic from her world: what she has said, "
              "what people in her place usually fear. One miss costs you a clarifying "
              "question; two in a row and you stop being taken seriously."),
        ),
    ),
    limits=(
        Limit(
            T("Собеседник раздражён или разговор только что стал резким.",
              "The other side is irritated, or the conversation has just turned sharp."),
            T("Даже хороший вопрос сейчас прозвучит как попытка выведать слабое место. "
              "Сначала верните контакт — назовите то, что человек чувствует, или признайте "
              "свою резкость, — и только потом спрашивайте. Об этом урок 5 этого блока.",
              "Even a good question will now sound like fishing for a weak spot. Restore "
              "contact first — name what they feel, or own your sharpness — and only then "
              "ask. Lesson 5 of this block covers it."),
        ),
        Limit(
            T("Нужен факт, а не история: сумма залога, дата освобождения, срок поставки.",
              "You need a fact, not a story: the deposit amount, the move-in date, the "
              "delivery date."),
            T("Здесь закрытый вопрос честнее открытого: «Квартира свободна с первого "
              "числа?» Открытые оставьте для интересов, закрытые — для проверки фактов.",
              "Here a closed question is more honest than an open one: “Is the flat free from "
              "the first?” Keep open questions for interests and closed ones for checking "
              "facts."),
        ),
    ),
)
