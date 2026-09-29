"""Лестница SPIN · урок 2 — «S и P: факты и боль»."""

from app.course.lessons._model import (Dialog, LessonMaterial, Limit, Mistake,
                                       Phrase, T, them, you)

MATERIAL = LessonMaterial(
    block="spin-ladder",
    lesson=2,
    scenario_id="supplier",
    technique=T("Два-три вопроса о фактах — и вопрос о том, что мешает",
                "Two or three fact questions, then ask what gets in the way"),
    why=T(
        "На первых ступенях ошибаются двумя способами. Одни устраивают аудит: десять "
        "вопросов подряд про линии, смены, штат и клиентов — собеседник устаёт и начинает "
        "отвечать «а зачем вам?». Другие пропускают факты и спрашивают в лоб: «а какие у вас "
        "проблемы?» — на это поставщик покупателю честно не отвечает никогда. Приём: задать "
        "два-три ситуационных вопроса, ответы на которые вам действительно нужны, и сразу "
        "построить на одном из ответов проблемный вопрос.",
        "People go wrong on the first rungs in two ways. Some run an audit: ten questions "
        "in a row about lines, shifts, headcount and customers — the other side tires and "
        "starts asking “why do you need that?”. Others skip the facts and ask straight out: "
        "“so what problems do you have?” — which no supplier ever answers honestly to a "
        "buyer. The technique: ask two or three situation questions whose answers you "
        "genuinely need, and build a problem question on one of those answers straight "
        "away.",
    ),
    core=T(
        "Ситуационный вопрос (S) собирает факты: как устроено сейчас — объём, смены, "
        "условия оплаты, кто заказывает. Отвечать на него легко, но десяток подряд "
        "утомляет. Мерка — два-три вопроса, и только о том, чего не узнать заранее из "
        "прайса, сайта или прошлого договора. Каждый S-вопрос должен готовить проблему: "
        "«сколько смен летом» готовит разговор о летнем провале, «сколько лет компании» не "
        "готовит ничего.\n\n"
        "Проблемный вопрос (P) — первый, где собеседник говорит вслух то, что ему не "
        "нравится. Формулы: «что мешает…», «что не устраивает в…», «где узкое место…», «с "
        "какими сложностями вы сталкиваетесь, когда…». С этого момента разговор идёт о его "
        "положении, а не о вашей цене.\n\n"
        "Мост между ступенями — его же слова: «Вы сказали, что летом работает одна смена. "
        "Что мешает загрузить производство летом?» Такой вопрос не выглядит выпытыванием: "
        "вы просто уточняете то, что он сам начал.\n\n"
        "Как понять, что P сработал: человек начинает рассказывать о своём — о заказчиках, "
        "деньгах, людях. Если слышите «у нас всё хорошо», вопрос был слишком общим или "
        "слишком ранним: вернитесь к фактам или сузьте тему.\n\n"
        "Пример со сроками подрядчика: «Сколько бригад сейчас на объекте?», «Как у вас "
        "устроена поставка материалов?» — и мост: «Вы сказали, что бригада одна. Что мешает "
        "вывести вторую?»",
        "A situation question (S) gathers facts: how things work today — volume, shifts, "
        "payment terms, who orders. It is easy to answer, but ten in a row is exhausting. "
        "The yardstick is two or three questions, and only about what you cannot learn in "
        "advance from the price list, the website or last year's contract. Every S question "
        "should set up a problem: “how many shifts in summer” sets up a talk about the "
        "summer dip; “how old is the company” sets up nothing.\n\n"
        "A problem question (P) is the first one where the other side says out loud what "
        "they do not like. Templates: “what gets in the way of…”, “what frustrates you "
        "about…”, “where is the bottleneck…”, “what challenges do you run into when…”. From "
        "that moment the conversation is about their position, not your price.\n\n"
        "The bridge between rungs is their own words: “You said the line runs one shift in "
        "summer. What is the bottleneck in loading the factory then?” It does not feel like "
        "prying: you are simply following up on what they started.\n\n"
        "How to tell P worked: the person starts talking about their side — customers, "
        "money, people. If you hear “everything is fine”, the question was too general or "
        "too early: go back to facts or narrow the topic.\n\n"
        "An example with a contractor's deadlines: “How many crews are on site now?”, “How "
        "do your material deliveries work?” — and the bridge: “You said there is one crew. "
        "What is stopping you from bringing in a second?”",
    ),
    phrases=(
        Phrase(
            T("Сколько заказов у вас сейчас в производстве на следующий квартал?",
              "How many orders do you have in production for next quarter?"),
            moves=("spin_situation",), reveals=True,
            when=T("S: факт, которого нет ни в прайсе, ни на сайте.",
                   "S: a fact that is in neither the price list nor the website."),
        ),
        Phrase(
            T("Как у вас устроена оплата с крупными заказчиками — какая отсрочка обычно?",
              "What is your current payment arrangement with large customers — what terms "
              "are usual?"),
            moves=("spin_situation",), reveals=True,
            when=T("S: готовит разговор о деньгах.", "S: sets up the talk about cash."),
        ),
        Phrase(
            T("Вы сказали, что летом работает одна смена. Что мешает загрузить производство "
              "летом?",
              "You said the line runs one shift in summer. What is the bottleneck in "
              "loading the factory then?"),
            moves=("spin_problem",), reveals=True,
            when=T("P-мост: проблема строится на его же ответе.",
                   "P bridge: the problem is built on their own answer."),
        ),
        Phrase(
            T("Что вас не устраивает в коротких контрактах — каждый раз торговаться заново?",
              "What frustrates you about short contracts — negotiating from scratch every "
              "time?"),
            moves=("spin_problem",), reveals=True,
        ),
        Phrase(
            T("Где у вас сейчас узкое место — в загрузке линий или в деньгах?",
              "Where is your bottleneck right now — keeping the lines loaded or cash flow?"),
            moves=("spin_problem",), reveals=True,
            when=T("P с выбором: легче ответить, чем на «какие у вас проблемы?».",
                   "P with a choice: easier to answer than “what problems do you have?”."),
        ),
    ),
    dialog=Dialog(
        setup=T("Закупки. Ирина открыла торг на 100 ₽ за штуку. Вам нужно не дороже 92, а "
                "лучше 86.",
                "Procurement. Irina opened at 100 per unit. You need 92 at most, and 86 "
                "ideally."),
        bad=(
            you("Сколько у вас линий? Сколько смен? Сколько сотрудников? Кто ваши основные "
                "клиенты?",
                "How many lines do you have? How many shifts? How many employees? Who are "
                "your main customers?",
                moves=("spin_situation",)),
            them("Вы аудит проводите? Давайте к делу.",
                 "Are you running an audit? Let us get to the point."),
            you("Хорошо. Какие у вас проблемы?", "Fine. What problems do you have?"),
            them("Никаких. Цена — 100.", "None. The price is 100."),
        ),
        bad_why=T(
            "Четыре факта одной очередью, и ни один не выбран с умыслом: Ирина не понимает, "
            "зачем вам её штат, и закрывается. Проблемный вопрос прозвучал в лоб и без темы — "
            "признать проблему перед покупателем значит дать ему повод давить, поэтому ответ "
            "«никаких».",
            "Four facts in one burst, none chosen with a purpose: Irina cannot see why you "
            "need her headcount, and she closes up. The problem question comes straight out "
            "and with no topic — admitting a problem to a buyer hands them leverage, so the "
            "answer is “none”.",
        ),
        good=(
            you("Сколько смен сейчас работает ваша линия — и так круглый год?",
                "How many shifts does your line currently run — the same all year round?",
                moves=("spin_situation",)),
            them("Весной три, летом одна.", "Three in spring, one in summer."),
            you("Как у вас устроена оплата с крупными заказчиками — какая отсрочка обычно?",
                "What is your current payment arrangement with large customers — what terms "
                "are usual?",
                moves=("spin_situation",), reveals=True),
            them("Шестьдесят дней, бывает и девяносто.", "Sixty days, sometimes ninety."),
            you("Вы сказали, что летом работает одна смена. Что мешает загрузить "
                "производство летом?",
                "You said the line runs one shift in summer. What is the bottleneck in "
                "loading the factory then?",
                moves=("spin_problem",), reveals=True),
            them("Заказы разовые, под проекты. Летом проектов мало — люди сидят без работы.",
                 "Orders come one project at a time. There are few projects in summer — "
                 "people sit idle."),
        ),
        good_why=T(
            "Два вопроса о фактах, и оба с умыслом: смены готовят разговор о загрузке, "
            "отсрочки — о деньгах. Проблемный вопрос опирается на её же слова про одну смену, "
            "поэтому он не звучит как выпытывание, — и Ирина сама говорит, что людей летом "
            "нечем занять. Разговор уже идёт о её положении, а не о вашей цене.",
            "Two fact questions, both with a purpose: shifts set up the talk about "
            "utilization, payment terms set up the talk about cash. The problem question "
            "rests on her own words about one shift, so it does not sound like prying — and "
            "Irina says herself that her people have nothing to do in summer. The talk is now "
            "about her position, not your price.",
        ),
    ),
    mistakes=(
        Mistake(
            T("Аудит вместо разговора",
              "An audit instead of a conversation"),
            T("Ситуационные вопросы дёшевы для вас и дороги для собеседника: каждый требует "
              "вспомнить и сформулировать, а пользы ему не несёт. После третьего подряд "
              "человек чувствует себя на проверке. Два-три вопроса — и переход к проблеме.",
              "Situation questions are cheap for you and costly for the other side: each one "
              "makes them recall and phrase something, with nothing in it for them. After the "
              "third in a row they feel they are being inspected. Two or three, then move to "
              "the problem."),
        ),
        Mistake(
            T("«Какие у вас проблемы?» без темы",
              "“What problems do you have?” with no topic"),
            T("Общий вопрос о проблемах звучит как попытка найти слабое место, и ответ почти "
              "всегда «никаких». Спрашивайте о конкретной области и лучше с выбором: «где "
              "узкое место — в загрузке или в деньгах?».",
              "A general question about problems sounds like hunting for a weak spot, and the "
              "answer is nearly always “none”. Ask about one specific area, ideally with a "
              "choice: “where is the bottleneck — utilization or cash?”."),
        ),
        Mistake(
            T("Спрашивать то, что можно узнать заранее",
              "Asking what you could have looked up"),
            T("«А что вы производите?» у поставщика, с которым вы работаете второй год, "
              "показывает, что вы не готовились. Такие вопросы тратят терпение собеседника на "
              "то, что вы могли выяснить сами, и его не хватит на важные.",
              "“And what do you make?” to a supplier you have worked with for two years shows "
              "you did not prepare. Such questions spend their patience on what you could "
              "have found out yourself, and there will not be enough left for the ones that "
              "matter."),
        ),
    ),
    limits=(
        Limit(
            T("Собеседник не раскрывает внутреннюю кухню: загрузка и деньги — коммерческая "
              "тайна.",
              "The other side will not open up about internals: utilization and cash are "
              "commercially confidential."),
            T("Не дожимайте. Спрашивайте о вашей общей части работы: «Как наши заказы "
              "ложатся в ваш график?», «Где у вас узкое место при отгрузке нам?» — это не "
              "тайна, и проблема там та же.",
              "Do not press. Ask about the part of the work you share: “How do our orders fit "
              "into your schedule?”, “Where is the bottleneck when you ship to us?” — that is "
              "not confidential, and the problem shows up there just the same."),
        ),
        Limit(
            T("Факты вы уже знаете: готовились, видели отчётность, работали раньше.",
              "You already know the facts: you prepared, saw the figures, worked together "
              "before."),
            T("Пропустите S и начните с проблемы, назвав факт сами: «Я знаю, что летом у вас "
              "работает одна смена. Что мешает загрузить линию?» Так вы экономите время и "
              "показываете, что готовились.",
              "Skip S and open with the problem, stating the fact yourself: “I know the line "
              "runs one shift in summer. What gets in the way of loading it?” It saves time "
              "and shows you prepared."),
        ),
    ),
)
