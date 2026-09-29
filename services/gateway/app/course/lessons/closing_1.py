"""Закрытие и фиксация · урок 1 — «Точка встречи»."""

from app.course.lessons._model import (Dialog, LessonMaterial, Limit, Mistake,
                                       Phrase, T, them, you)

MATERIAL = LessonMaterial(
    block="closing",
    lesson=1,
    scenario_id="supplier",
    technique=T("Пробное закрытие: проверить готовность вопросом «если…»",
                "The trial close: test readiness with an “if…” question"),
    why=T(
        "На финише переговоров ошибаются двумя способами. Одни закрывают слишком рано — "
        "хватаются за первую цифру, которая показалась приемлемой, и оставляют "
        "собеседнику всё, что лежало дальше. Другие тянут слишком долго — дожимают, "
        "когда всё уже сложилось, и теряют доверие. Пробное закрытие решает обе "
        "проблемы: это вопрос, который проверяет готовность подписать, но сам сделку не "
        "закрывает.",
        "People get the end of a negotiation wrong in two ways. Some close too early — "
        "they grab the first number that looks acceptable and leave everything beyond it "
        "to the other side. Others drag it out — they keep squeezing after everything has "
        "come together and lose trust. The trial close solves both: it is a question that "
        "tests readiness to sign without closing the deal itself.",
    ),
    core=T(
        "Сделка закрывается там, куда её довела работа: вскрытые интересы, внешние "
        "цифры, размены. Само закрытие ничего не добавляет, оно только фиксирует. "
        "Поэтому закрывать стоит тогда, когда за вашей цифрой уже что-то стоит.\n\n"
        "Признаки, что собеседник готов: говорит о деталях исполнения — сроки поставки, "
        "кто подписывает; повторяет вашу цифру вслух; спрашивает «а если…»; шаги его "
        "уступок стали мелкими.\n\n"
        "Пробное закрытие — условный вопрос: «если сойдёмся на X при условии Y — вы "
        "готовы подписать?» Слушайте ответ. «Да» — переходите к закрывающей фразе с "
        "числом (урок 3 этого блока). «Да, но…» — всё после «но» и есть список того, "
        "что осталось обсудить. «Нет» — закрывать рано, возвращайтесь к интересам.\n\n"
        "В найме это звучит так: «Если оклад будет 230 и выход с первого числа — вы "
        "готовы принять оффер?» С подрядчиком: «Если сдвигаем сдачу на две недели и "
        "фиксируем смету — вы готовы подписать допсоглашение?»",
        "A deal closes where the work has brought it: interests uncovered, outside "
        "figures, trades made. The close itself adds nothing; it only records. So it is "
        "worth closing once your number already has something behind it.\n\n"
        "Signs the other side is ready: they talk about execution details — delivery "
        "dates, who signs; they repeat your number out loud; they ask “what if…”; their "
        "concessions have become small steps.\n\n"
        "A trial close is a conditional question: “if we settle on X with Y — are you "
        "ready to sign?” Listen to the answer. “Yes” — move on to the closing line with a "
        "number (lesson 3 of this block). “Yes, but…” — everything after the “but” is "
        "the list of what is left to discuss. “No” — it is too early to close; go back "
        "to the interests.\n\n"
        "In hiring it sounds like this: “If the salary is 230 and you start on the first "
        "of the month — are you ready to accept the offer?” With a contractor: “If we "
        "move handover by two weeks and fix the estimate — are you ready to sign the "
        "amendment?”",
    ),
    phrases=(
        Phrase(
            T("Если сойдёмся на 88 при годовом контракте, вы готовы подписать на этой "
              "неделе?",
              "If we settle on 88 with an annual contract, are you ready to sign this "
              "week?"),
            moves=("open_question",),
            when=T("Главная форма: цифра, условие и вопрос о готовности.",
                   "The main form: a number, a condition and a question about readiness."),
        ),
        Phrase(
            T("Что ещё должно сложиться, чтобы вы могли подписать?",
              "What else needs to fall into place for you to sign?"),
            moves=("open_question",),
            when=T("Когда не ясно, чего не хватает до сделки.",
                   "When it is unclear what is still missing for a deal."),
        ),
        Phrase(
            T("Правильно ли я понимаю, что по цене мы близко и остался только график "
              "оплаты?",
              "If I understand it right, we are close on price and only the payment "
              "schedule is left?"),
            moves=("acknowledge",),
            when=T("Сузить остаток разговора до одного пункта.",
                   "To narrow what is left down to one item."),
        ),
        Phrase(
            T("Кто с вашей стороны подписывает договор и сколько времени занимает "
              "согласование?",
              "Who handles sign-off on your side, and how much time does approval take?"),
            moves=("spin_situation",),
            when=T("Проверить, что до подписи нет скрытых шагов.",
                   "To check there are no hidden steps before signing."),
        ),
        Phrase(
            T("Что мешает сказать «да» прямо сейчас?",
              "What is the main challenge in saying yes today?"),
            moves=("spin_problem",),
            when=T("После «да, но…», чтобы услышать возражение целиком.",
                   "After a “yes, but…”, to hear the whole objection."),
        ),
    ),
    dialog=Dialog(
        setup=T("Закупки. Вы узнали, что Ирине важна загрузка производства, и заговорили "
                "о годовом контракте. Ваша цель — 86 ₽ за штуку.",
                "Procurement. You have learned that Irina cares about keeping the factory "
                "loaded, and you have raised an annual contract. Your target is 86 per "
                "unit."),
        opening=(
            them("Годовой объём — это интересно. Я могу сделать 90.",
                 "An annual volume is interesting. I can do 90."),
        ),
        bad=(
            you("Отлично, договорились — 90!", "Great, we have a deal at 90!",
                moves=("accept",)),
            them("Прекрасно, готовлю договор на 90.",
                 "Lovely, I will draw up the contract at 90."),
        ),
        bad_why=T(
            "Вы закрыли на первой цифре, которая показалась приемлемой, и не проверили, "
            "есть ли дальше. Ирина только начала двигаться за годовой объём — всё, что "
            "лежало между 90 и её пределом, осталось у неё.",
            "You closed on the first number that looked acceptable and never checked "
            "whether there was more. Irina had only just started moving for the annual "
            "volume — everything between 90 and her limit stayed with her.",
        ),
        good=(
            you("Это уже ближе. Если сойдёмся на 88 при годовом контракте с гарантией "
                "объёма, вы готовы подписать на этой неделе?",
                "That is closer. If we settle on 88 with an annual volume commitment, are you "
                "ready to sign this week?",
                moves=("open_question",)),
            them("На 88… Мне нужно согласовать с производством, но в целом — да, если "
                 "оплата будет в срок.",
                 "At 88… I need to check with production, but in principle — yes, as long "
                 "as payment comes on time."),
            you("Правильно ли я понимаю, что остался только срок оплаты? Мы платим в "
                "течение 15 дней после поставки.",
                "If I understand it right, only the payment term is left? We pay within 15 "
                "days of delivery.",
                moves=("acknowledge",)),
            them("Тогда 88, годовой контракт, оплата за 15 дней. Готовлю договор.",
                 "Then 88, an annual contract, payment within 15 days. I will draw up the "
                 "contract."),
        ),
        good_why=T(
            "Вопрос «если…» проверил готовность, ничего не закрывая: откажись Ирина — вы "
            "бы продолжили разговор, а не отыгрывали назад. Её «да, но» показало, что "
            "осталось, — срок оплаты. Вы закрыли этот пункт, и сделка встала на 88, а не "
            "на 90.",
            "The “if…” question tested readiness without closing anything: had Irina said "
            "no, you would simply have carried on, not backtracked. Her “yes, but” showed "
            "what was left — the payment term. You settled that point, and the deal landed "
            "at 88 rather than 90.",
        ),
    ),
    mistakes=(
        Mistake(
            T("Закрыть на первой устроившей цифре",
              "Closing on the first number that suits you"),
            T("«Устраивает» — не то же самое, что «лучше не будет». Прежде чем "
              "пожимать руки, проверьте условным вопросом, есть ли пространство дальше.",
              "“It suits me” is not the same as “it will not get better”. Before shaking "
              "hands, test with a conditional question whether there is more room."),
        ),
        Mistake(
            T("Пробное закрытие без «если»",
              "A trial close without the “if”"),
            T("«Ну что, подписываем?» — это уже не проверка, а закрытие. Согласие "
              "придёт на то, что лежит на столе сейчас, то есть на её последнюю цифру. "
              "Условие в вопросе оставляет вам путь назад.",
              "“So, shall we sign?” is no longer a test; it is the close itself. The yes "
              "you get is to whatever is on the table now — that is, her last number. The "
              "condition in the question keeps a way back open for you."),
        ),
        Mistake(
            T("Не расслышать «но» в «да, но…»",
              "Missing the “but” in “yes, but…”"),
            T("Услышать «да» и начать благодарить. Всё, что прозвучало после «но», — "
              "условие её согласия. Не обсудили его сейчас — оно всплывёт в договоре.",
              "Hearing “yes” and starting to thank her. Everything after the “but” is a "
              "condition of her agreement. Leave it undiscussed now and it will surface in "
              "the contract."),
        ),
    ),
    limits=(
        Limit(
            T("Решение принимает не собеседник: нужен директор, закупочная комиссия, "
              "головная компания.",
              "The decision is not theirs: it needs a director, a purchasing committee, a "
              "parent company."),
            T("Адресуйте пробное закрытие процессу: «Что нужно, чтобы ваш директор это "
              "утвердил?» — и помогите собеседнику аргументами, с которыми он пойдёт "
              "наверх.",
              "Aim the trial close at the process: “What does your director need in order "
              "to approve this?” — and give the person the arguments they will take "
              "upstairs."),
        ),
        Limit(
            T("На пробное закрытие приходит твёрдое «нет».",
              "The trial close gets a firm “no”."),
            T("Это не повод дожимать, а сигнал, что за цифрой пока ничего не стоит. "
              "Вернитесь к вопросам об интересах и к обмену условиями и закрывайте позже.",
              "That is not a reason to push; it is a signal that nothing stands behind "
              "the number yet. Go back to questions about interests and to trading terms, "
              "and close later."),
        ),
    ),
)
