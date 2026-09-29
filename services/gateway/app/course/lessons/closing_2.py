"""Закрытие и фиксация · урок 2 — «Пол оппонента непробиваем»."""

from app.course.lessons._model import (Dialog, LessonMaterial, Limit, Mistake,
                                       Phrase, T, them, you)

MATERIAL = LessonMaterial(
    block="closing",
    lesson=2,
    scenario_id="supplier",
    technique=T("Распознать предел и перестать давить на цену",
                "Recognise the limit and stop pushing on price"),
    why=T(
        "Когда цена перестаёт двигаться, первое желание — надавить сильнее: повторить "
        "просьбу, пригрозить уйти. Но у любого собеседника есть предел — цена, ниже "
        "которой ему выгоднее не заключать сделку вовсе. За пределом нет ничего: ни "
        "доверие, ни давление его не сдвинут. Давить в предел — значит портить отношения "
        "и не получить за это ни рубля. Приём учит узнавать предел и вовремя менять "
        "предмет разговора.",
        "When the price stops moving, the first urge is to push harder: repeat the "
        "request, threaten to walk. But every counterpart has a limit — a price below "
        "which they are better off with no deal at all. There is nothing beyond that "
        "limit: neither trust nor pressure will move it. Pushing into the limit damages "
        "the relationship and earns you nothing. This technique teaches you to recognise "
        "the limit and change the subject in time.",
    ),
    core=T(
        "Предел собеседника, или его красная линия, — самая невыгодная для него цена, на "
        "которую он ещё согласен. Признаки, что вы рядом с ней: шаги уступок мельчают "
        "(97, 95, 94, 93,5); появляются объяснения себестоимостью; собеседник сам "
        "предлагает поменять условия вместо цены; повторяет одни и те же слова.\n\n"
        "Что делать. Проверьте вопросом: «это ваш предел по цене или есть пространство, "
        "если поменяем условия?» Переведите разговор с цены на условия: срок контракта, "
        "объём, график оплаты. То, что звучит как предел, часто предел только для "
        "нынешних условий: цена без гарантии объёма и цена с гарантией — разные цены. А "
        "настоящий предел, ниже которого ей невыгодно при любых условиях, не сдвинется, "
        "как ни дави.\n\n"
        "Если и условия не помогают, сравните её цифру со своей альтернативой. Здесь "
        "запасной поставщик предлагает 95 и с рисками по качеству — это хуже, чем 92 "
        "Ирины. Значит, 92 может оказаться лучшим, что у вас есть, и уходить некуда.\n\n"
        "В найме так же: если минимум кандидата выше вашего потолка, давление не "
        "поможет — поможет только другой состав оффера или честное «сейчас не сходимся».",
        "The other side's limit, their red line, is the worst price they would still "
        "accept. Signs you are close to it: their concessions shrink (97, 95, 94, 93.5); "
        "explanations about costs appear; they suggest changing terms instead of price; "
        "they repeat the same words.\n\n"
        "What to do. Test it with a question: “is that your limit on price, or is there "
        "room if we change the terms?” Move the conversation from price to terms: "
        "contract length, volume, payment schedule. What sounds like a limit is often a "
        "limit only for the current terms: the price without a volume guarantee and the "
        "price with one are different prices. The real limit, below which the deal does "
        "not pay for her on any terms, will not move however hard you push.\n\n"
        "If terms do not help either, compare her number with your alternative. Here the "
        "fallback supplier offers 95 with quality risks — worse than Irina's 92. So 92 "
        "may turn out to be the best you have, and there is nowhere to walk to.\n\n"
        "Hiring works the same way: if the candidate's minimum is above your ceiling, "
        "pressure will not help — only a different shape of offer or an honest “we do not "
        "meet this time”.",
    ),
    phrases=(
        Phrase(
            T("Похоже, по цене мы подошли к вашему пределу. Это так, или есть пространство, "
              "если поменяем условия?",
              "It looks like we have reached your limit on price. Is that so, or is there "
              "room if we change the terms?"),
            moves=("open_question",),
            when=T("Когда шаги её уступок стали мелкими.",
                   "When her concessions have become small steps."),
        ),
        Phrase(
            T("Давайте оставим цену и посмотрим на условия: срок контракта, график оплаты. "
              "Что из этого помогло бы вам?",
              "Let us park the price and look at the terms instead — the contract length, "
              "the payment schedule. How valuable would either of those be for you?"),
            moves=("spin_needpayoff",), reveals=True,
            when=T("Сменить предмет разговора, а не громкость.",
                   "To change the subject, not the volume."),
        ),
        Phrase(
            T("Из чего складывается 92 — что в этой цене для вас неснижаемое?",
              "What makes up the 92 — which part of that price cannot go lower for you?"),
            moves=("open_question",),
            when=T("Отличить настоящий предел от заявленного.",
                   "To tell a real limit from a stated one."),
        ),
        Phrase(
            T("Ирина, спасибо, что сказали прямо. Тогда давайте искать не рубли, а условия.",
              "Irina, I appreciate you being straight with me. Then let us look for terms, "
              "not roubles."),
            moves=("acknowledge",),
            when=T("Когда она прямо назвала свой предел.",
                   "When she has named her limit outright."),
        ),
        Phrase(
            T("Если 92 — ваш предел, мне нужно время это взвесить. Вернусь с ответом завтра "
              "до обеда.",
              "If 92 is your limit, I need time to weigh it. I will come back to you with an "
              "answer by tomorrow lunchtime."),
            when=T("Пауза вместо нажима, чтобы сравнить с альтернативой.",
                   "A pause instead of pressure, to compare with your alternative."),
        ),
    ),
    dialog=Dialog(
        setup=T("Закупки. Ирина за полчаса прошла от 100 до 92 ₽ за штуку, последние шаги — "
                "по полрубля. Ваша цель — 86, дороже 92 брать нельзя. Запасной вариант — "
                "другой поставщик по 95, но с рисками по качеству.",
                "Procurement. In half an hour Irina has come down from 100 to 92 per unit, "
                "the last steps half a rouble each. Your target is 86; you cannot pay more "
                "than 92. Your fallback is another supplier at 95, with quality risks."),
        opening=(
            them("92 — ниже я уже не могу, у меня себестоимость.",
                 "92 — I cannot go any lower, there are my costs."),
        ),
        bad=(
            you("Ирина, ну ещё чуть-чуть. 88 — и все довольны.",
                "Irina, just a little more. 88 and everyone is happy."),
            them("Я же говорю: ниже не могу.", "As I said, I cannot go lower."),
            you("Тогда мы уйдём к другому поставщику. Или 88, или я ухожу.",
                "Then we will go to another supplier. Either 88, or I walk.",
                moves=("threat",)),
            them("Жаль. Тогда, наверное, не получится.",
                 "A pity. Then it probably will not work out."),
        ),
        bad_why=T(
            "Повтор просьбы не аргумент, а угроза — блеф: другой поставщик стоит 95 и "
            "рискует качеством, то есть он хуже, чем 92 Ирины. Если она это знает или "
            "догадывается, вы потеряли и доверие, и лицо. Цена при этом не сдвинулась ни "
            "на рубль.",
            "Repeating the request is not an argument, and the threat is a bluff: the other "
            "supplier costs 95 and risks quality — worse than Irina's 92. If she knows or "
            "suspects it, you have lost both trust and face. And the price has not moved by "
            "a single rouble.",
        ),
        good=(
            you("Спасибо, что сказали прямо. Похоже, по цене мы у вашего предела. Давайте "
                "оставим цену и посмотрим на условия — срок контракта, график оплаты. Что "
                "из этого помогло бы вам?",
                "I appreciate you being straight with me. It looks like we are at your limit "
                "on price. Let us park the price and look at the terms instead — the "
                "contract length, the payment schedule. How valuable would either of those "
                "be for you?",
                moves=("acknowledge", "spin_needpayoff"), reveals=True),
            them("Годовой контракт помог бы. С гарантией объёма у меня другая "
                 "себестоимость.",
                 "An annual contract would help. With a volume guarantee my costs are "
                 "different."),
            you("Годовой контракт с гарантией объёма — в обмен на 89?",
                "An annual volume commitment in exchange for 89?",
                moves=("tradeoff",)),
            them("С годовым объёмом 89 я могу. Давайте так.",
                 "With an annual volume I can do 89. Let us do that."),
        ),
        good_why=T(
            "Вы поверили её пределу для нынешних условий и перестали давить на цену. "
            "Вопрос про условия показал, что при гарантии объёма у Ирины другая "
            "себестоимость, — это уже другая сделка с другой ценой. Три рубля пришли не "
            "от нажима, а от условия, которое вам почти ничего не стоит.",
            "You took her limit seriously for the current terms and stopped pushing on "
            "price. The question about terms showed that with a volume guarantee Irina's "
            "costs are different — that is a different deal with a different price. Three "
            "roubles came not from pressure but from a term that costs you almost nothing.",
        ),
    ),
    mistakes=(
        Mistake(
            T("Повторять просьбу настойчивее",
              "Repeating the request more forcefully"),
            T("«Ну ещё чуть-чуть» в третий раз не несёт ничего нового. Если не слышат, "
              "меняйте тип хода: вопрос вместо просьбы, условие вместо цифры.",
              "“Just a little more” for the third time carries nothing new. If you are not "
              "heard, change the kind of move: a question instead of a request, a term "
              "instead of a number."),
        ),
        Mistake(
            T("Пугать альтернативой, которая хуже предложения",
              "Threatening with an alternative worse than the offer"),
            T("Уходить к поставщику за 95 от предложения за 92 невыгодно вам самим. Такая "
              "угроза — блеф, и опытный продавец его чувствует. Прежде чем называть "
              "альтернативу, сравните её с тем, что лежит на столе.",
              "Walking away from 92 to a supplier at 95 hurts you, not her. A threat like "
              "that is a bluff, and an experienced seller can smell it. Before naming your "
              "alternative, compare it with what is on the table."),
        ),
        Mistake(
            T("Принять первое «не могу» за предел",
              "Taking the first “I cannot” as the limit"),
            T("Первое «ниже не могу» часто просто позиция. Предел узнают по признакам: "
              "мелкие шаги, себестоимость, повтор. Проверьте вопросом, прежде чем "
              "сдаваться или давить.",
              "The first “I cannot go lower” is often just a position. A limit shows through "
              "signs: small steps, costs, repetition. Test it with a question before you "
              "give in or push."),
        ),
    ),
    limits=(
        Limit(
            T("Её предел хуже вашей красной линии: зоны, где сделка выгодна обоим, нет.",
              "Her limit is worse than your red line: there is no zone where the deal works "
              "for both."),
            T("Скажите это прямо и спокойно, поблагодарите и оставьте дверь открытой: "
              "«Сейчас не сходимся. Если у вас изменятся объёмы или себестоимость — давайте "
              "вернёмся к разговору». Уйти к альтернативе — нормальный исход, а не "
              "поражение.",
              "Say so plainly and calmly, thank her and leave the door open: “We do not meet "
              "this time. If your volumes or costs change, let us talk again.” Walking away "
              "to your alternative is a normal outcome, not a defeat."),
        ),
        Limit(
            T("«Это последняя цена» звучит на первом же шаге — это тактика, а не предел.",
              "“This is my final price” comes at the very first step — a tactic, not a "
              "limit."),
            T("Не проверяйте такую «последнюю цену» давлением. Вернитесь к интересам и "
              "внешним цифрам: «из чего складывается эта цифра?», «вот прайсы сопоставимых "
              "поставщиков».",
              "Do not test such a “final price” with pressure. Go back to interests and "
              "outside figures: “what makes up this number?”, “here are comparable "
              "suppliers' prices”."),
        ),
    ),
)
