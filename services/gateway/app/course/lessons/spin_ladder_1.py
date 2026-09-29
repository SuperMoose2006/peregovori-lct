"""Лестница SPIN · урок 1 — «Четыре ступени»."""

from app.course.lessons._model import (Dialog, LessonMaterial, Limit, Mistake,
                                       Phrase, T, them, you)

MATERIAL = LessonMaterial(
    block="spin-ladder",
    lesson=1,
    scenario_id="supplier",
    technique=T("Вести вопросы по лестнице SPIN",
                "Walk your questions up the SPIN ladder"),
    why=T(
        "Когда вопросы идут вразнобой — один про штат, другой про цену, третий «а какие у "
        "вас проблемы?», — собеседник не видит, к чему вы ведёте, отвечает коротко и "
        "настораживается. Вы собираете разрозненные факты, из которых ничего не следует. "
        "Лестница SPIN — схема исследователя продаж Нила Рэкхема — выстраивает вопросы в "
        "порядке, где каждый готовит следующий: факты, боль, цена боли, ценность решения. К "
        "концу лестницы собеседник сам объяснил, почему ему нужно то, что вы предложите.",
        "When questions come at random — one about headcount, one about price, a third "
        "“so what problems do you have?” — the other side cannot see where you are going, "
        "answers briefly and grows wary. You collect scattered facts that add up to nothing. "
        "The SPIN ladder — a scheme from sales researcher Neil Rackham — puts questions in an "
        "order where each one prepares the next: facts, pain, the cost of the pain, the value "
        "of a fix. By the top of the ladder the other side has explained, in their own words, "
        "why they need what you are about to offer.",
    ),
    core=T(
        "Четыре ступени — четыре вида вопросов. Ситуационные (S, Situation): как всё "
        "устроено сейчас — объём, смены, график оплаты. Проблемные (P, Problem): что мешает, "
        "что не устраивает, где узкое место. Извлекающие (I, Implication): к чему проблема "
        "приводит, во что обходится. Направляющие (N, Need-payoff): что даст решение.\n\n"
        "Порядок не для красоты. Без фактов не найти боль. Без названной боли вопрос о "
        "последствиях звучит как запугивание. Без цены последствий решение ничего не "
        "стоит — его не с чем сравнить.\n\n"
        "Лестница работает и у покупателя. Вы закупаете комплектующие у Ирины. Её факты — "
        "линия летом работает в одну смену. Боль — сезонный провал загрузки. Цена боли — "
        "люди на окладе без работы и дыра в деньгах. Ценность решения — загрузка на год "
        "вперёд. После этого ваш годовой контракт с гарантией объёма стоит для неё больше, "
        "чем пара рублей скидки.\n\n"
        "Пример из найма: «Сколько человек сейчас в команде?» (S) — «Что сложнее всего "
        "без этого специалиста?» (P) — «Как пустая позиция влияет на сроки проекта?» (I) — "
        "«Насколько важно закрыть её до конца квартала?» (N).",
        "Four rungs, four kinds of question. Situation (S): how things work today — volume, "
        "shifts, payment schedule. Problem (P): what gets in the way, what is not working, "
        "where the bottleneck is. Implication (I): what the problem leads to, what it costs. "
        "Need-payoff (N): what solving it would be worth.\n\n"
        "The order is not decoration. Without facts you cannot find the pain. Without a pain "
        "they have named, a question about consequences sounds like scaremongering. Without "
        "the cost of those consequences, a fix is worth nothing — there is nothing to compare "
        "it with.\n\n"
        "The ladder works for a buyer too. You are buying components from Irina. Her facts: "
        "in summer the line runs one shift. The pain: a seasonal dip in utilization. The cost: "
        "salaried people with no work and a hole in cash flow. The value of a fix: the "
        "factory loaded a year ahead. After that, your annual volume commitment is worth more "
        "to her than a couple of roubles off the price.\n\n"
        "A hiring example: “How many people are on the team now?” (S) — “What is hardest "
        "without this specialist?” (P) — “How does the empty seat affect the project "
        "deadlines?” (I) — “How valuable would it be to fill it before quarter end?” (N).",
    ),
    phrases=(
        Phrase(
            T("Как сейчас загружено ваше производство — линии работают в полную смену?",
              "How do you currently load your production — are the lines running full "
              "shifts?"),
            moves=("spin_situation",), reveals=True,
            when=T("S — факты. Спрашивайте то, чего не узнать самому заранее.",
                   "S — facts. Ask only what you cannot find out beforehand."),
        ),
        Phrase(
            T("Что вам мешает с оплатой от крупных заказчиков — длинные отсрочки?",
              "What is the biggest challenge with payments from large customers — long "
              "payment terms?"),
            moves=("spin_problem",), reveals=True,
            when=T("P — боль. Первый вопрос, где собеседник говорит вслух, что ему не нравится.",
                   "P — pain. The first question where they say out loud what they do not "
                   "like."),
        ),
        Phrase(
            T("Вы сказали, что летом загрузка падает. К чему это приводит?",
              "You said utilization drops in summer. What happens if this continues next "
              "year?"),
            moves=("spin_implication",), reveals=True,
            when=T("I — цена боли. Опирайтесь на то, что человек уже сказал сам.",
                   "I — the cost of the pain. Build on what they have already said."),
        ),
        Phrase(
            T("Насколько важно было бы для вас закрыть загрузку производства на год вперёд?",
              "How valuable would it be to you to have the factory loaded a year ahead?"),
            moves=("spin_needpayoff",), reveals=True,
            when=T("N — ценность решения. Её называет собеседник, а не вы.",
                   "N — the value of a fix. They name it, not you."),
        ),
    ),
    dialog=Dialog(
        setup=T("Закупки. Ирина открыла торг на 100 ₽ за штуку. Ваша цель — 86, дороже 92 "
                "вы не возьмёте.",
                "Procurement. Irina opened at 100 per unit. Your target is 86; you will not "
                "pay more than 92."),
        bad=(
            you("Сколько у вас сотрудников?", "How many people do you employ?"),
            them("Около двухсот. А что?", "About two hundred. Why?"),
            you("Насколько важно было бы вам получить годовой контракт?",
                "How valuable would an annual contract be to you?",
                moves=("spin_needpayoff",)),
            them("Годовой — хорошо бы. По цене 100.", "An annual one would be nice. At 100."),
            you("Какие у вас проблемы с оплатой?", "What problems do you have with payments?"),
            them("Никаких проблем, у нас всё в порядке.",
                 "No problems at all, everything is fine with us."),
        ),
        bad_why=T(
            "Три вопроса — три разных направления. Штат ни к чему не ведёт. Вопрос о выгоде "
            "годового контракта прозвучал раньше, чем Ирина признала хоть какую-то проблему, "
            "поэтому она услышала в нём заготовку и ответила ценой. «Какие у вас проблемы?» в "
            "лоб — вопрос, на который поставщик покупателю честно не отвечает.",
            "Three questions, three directions. Headcount leads nowhere. The question about the "
            "value of an annual contract came before Irina had admitted any problem, so she "
            "heard a script and answered with the price. A blunt “what problems do you have?” "
            "is a question no supplier answers honestly to a buyer.",
        ),
        good=(
            you("Сколько смен сейчас работает ваша линия — и так круглый год?",
                "How many shifts does your line currently run — the same all year round?",
                moves=("spin_situation",)),
            them("Весной три смены, летом одна.", "Three in spring, one in summer."),
            you("Что мешает держать ровную загрузку летом?",
                "What is the bottleneck in keeping utilization steady over the summer?",
                moves=("spin_problem",), reveals=True),
            them("Крупные клиенты заказывают разово, под проект. Кончился проект — кончился "
                 "заказ.",
                 "Big customers order one project at a time. The project ends, the order "
                 "ends."),
            you("Во что обходится летний простой — и как это влияет на денежный поток?",
                "What does the summer downtime cost you — and how does that affect your cash "
                "flow?",
                moves=("spin_implication",), reveals=True),
            them("Люди на окладе, аренда цеха. Летом берём короткие кредиты.",
                 "People are on salary, the shop floor is rented. In summer we take "
                 "short-term loans."),
            you("Насколько важно было бы для вас иметь контракт на год вперёд с гарантией "
                "объёма?",
                "How valuable would it be to you to have a year-long contract with "
                "guaranteed volume?",
                moves=("spin_needpayoff",), reveals=True),
            them("Очень. Тогда и о цене можно говорить иначе.",
                 "Very. Then we could talk about price differently."),
        ),
        good_why=T(
            "Каждый вопрос стоит на ответе предыдущего: одна смена летом — что мешает — во "
            "что обходится — насколько ценно решение. Ирина сама назвала боль, сама посчитала "
            "её цену и сама сказала, что год загрузки меняет разговор о цене. Годовой "
            "контракт теперь не ваша просьба, а ответ на её проблему.",
            "Each question stands on the previous answer: one shift in summer — what gets in "
            "the way — what it costs — how valuable a fix would be. Irina named the pain "
            "herself, costed it herself and said herself that a year of guaranteed load "
            "changes the price conversation. The annual contract is no longer your request but "
            "the answer to her problem.",
        ),
    ),
    mistakes=(
        Mistake(
            T("Вопросы вразнобой",
              "Questions at random"),
            T("Вопрос, который не опирается на предыдущий ответ, обнуляет разговор: "
              "собеседник снова гадает, зачем вы спрашиваете. Проверка простая — можно ли "
              "начать ваш вопрос словами «вы сказали, что…». Если нельзя, он, скорее всего, "
              "не с этой лестницы.",
              "A question that does not build on the last answer resets the conversation: "
              "they are guessing again why you are asking. A simple test — can your question "
              "start with “you said that…”? If not, it probably does not belong on this "
              "ladder."),
        ),
        Mistake(
            T("Назвать боль за собеседника",
              "Naming the pain for them"),
            T("«У вас же летом простой, да?» — вы угадали, но теперь это ваша версия, и её "
              "можно оспорить или просто сказать «справляемся». Проблема работает на вас, "
              "только когда её произнёс сам собеседник. Спросите — «что мешает держать ровную "
              "загрузку летом?» — и дайте ему сказать.",
              "“You have downtime in summer, right?” — you guessed right, but now it is your "
              "version, and it can be disputed or shrugged off with “we manage”. A problem "
              "works for you only when they have said it themselves. Ask — “what gets in the "
              "way of steady load in summer?” — and let them say it."),
        ),
        Mistake(
            T("Лестница как допрос",
              "The ladder as an interrogation"),
            T("Четыре вопроса подряд без единого отклика звучат как анкета. Между ступенями "
              "покажите, что услышали: «понимаю, летом тяжело». Лестница — это порядок "
              "вопросов, а не их скорострельность.",
              "Four questions in a row with no response to the answers sound like a "
              "questionnaire. Between rungs, show you heard them: “I understand, summers are "
              "hard.” The ladder is about the order of questions, not the rate of fire."),
        ),
    ),
    limits=(
        Limit(
            T("У собеседника нет боли, которую решает ваше предложение: линия загружена, "
              "денег хватает.",
              "The other side has no pain that your offer solves: the line is full and cash "
              "is fine."),
            T("SPIN не создаёт проблему, он её находит. Не выдумывайте боль и не нагнетайте. "
              "Переходите к объективным критериям — цене сопоставимых поставщиков — и к "
              "размену по другим условиям.",
              "SPIN does not create a problem; it finds one. Do not invent pain or inflate it. "
              "Move to objective criteria — what comparable suppliers charge — and to trading "
              "on other terms."),
        ),
        Limit(
            T("Разговор короткий: у собеседника десять минут, и он хочет цифру.",
              "The conversation is short: they have ten minutes and want a number."),
            T("Сократите лестницу, а не порядок. Факты соберите заранее — из прайса, сайта, "
              "прошлого договора — и начните сразу с проблемного вопроса. Одна ступень P и "
              "одна I дают больше, чем четыре торопливых вопроса.",
              "Shorten the ladder, not the order. Gather the facts beforehand — from the price "
              "list, the website, last year's contract — and open straight with a problem "
              "question. One P and one I give you more than four rushed questions."),
        ),
    ),
)
