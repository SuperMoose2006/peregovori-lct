"""Размен и создание ценности · урок 3 — «Формула пакета»."""

from app.course.lessons._model import (Dialog, LessonMaterial, Limit, Mistake,
                                       Phrase, T, them, you)

MATERIAL = LessonMaterial(
    block="logrolling",
    lesson=3,
    scenario_id="supplier",
    technique=T("Торговаться пакетом, а не по пунктам",
                "Negotiate the package, not item by item"),
    why=T(
        "Разговор с поставщиком часто идёт по списку: сначала договорились о сроке, "
        "потом об оплате, потом взялись за цену. К цене все условия уже отданы по "
        "одному, и двигать её нечем. Приём — держать все условия на столе одновременно и "
        "считать любое «да» по отдельному пункту предварительным, пока не сложилось "
        "целое.",
        "A conversation with a supplier often runs down a list: first you settle the "
        "term, then the payment, then you get to the price. By the time you reach the "
        "price, every term has been given away one at a time, and there is nothing left "
        "to move it with. The technique is to keep all the terms on the table at once and "
        "treat any “yes” on a single item as provisional until the whole thing comes "
        "together.",
    ),
    core=T(
        "Пакет — это набор условий, который обсуждается и принимается целиком: цена, "
        "срок, объём, оплата. Первое правило пакета: ничего не согласовано, пока не "
        "согласовано всё. Отдельные «да» вы записываете как предварительные и честно "
        "говорите об этом вслух — тогда к ним можно вернуться, если цена не сложится.\n\n"
        "Второй инструмент — два-три варианта пакета на выбор, одинаково приемлемые для "
        "вас. Например: 88 рублей при годовом контракте с гарантией объёма или 91 рубль "
        "без обязательств по объёму. Вам оба подходят. Собеседник выбирает, а не "
        "уступает, — и выбором показывает, что ему важнее, точнее, чем ответом на прямой "
        "вопрос.\n\n"
        "Пакет не заменяет вопросов. Собрать варианты, не узнав интересов, — значит "
        "угадывать. Сначала узнайте, что для неё ценно, потом складывайте пакет.\n\n"
        "Тот же приём у подрядчика на стройке: не «сначала сроки, потом смета», а "
        "«вариант А — сдача в марте за эту сумму, вариант Б — в мае, но дешевле».",
        "A package is a set of terms that is discussed and accepted as a whole: price, "
        "term, volume, payment. The first rule of a package: nothing is agreed until "
        "everything is agreed. You record each single “yes” as provisional and say so out "
        "loud — then you can come back to it if the price does not work out.\n\n"
        "The second tool is two or three versions of the package to choose from, all "
        "equally acceptable to you. For example: 88 per unit with an annual volume "
        "commitment, or 91 with no volume commitment. Both work for you. The other side "
        "chooses rather than concedes — and the choice shows what matters to them more "
        "precisely than an answer to a direct question.\n\n"
        "A package does not replace questions. Building options without knowing the "
        "interests is guessing. Find out what she values first, then build the package.\n\n"
        "The same technique works with a building contractor: not “deadlines first, then "
        "the estimate”, but “option A — handover in March for this sum, option B — in May, "
        "but cheaper”.",
    ),
    phrases=(
        Phrase(
            T("Давайте договоримся так: ничего не считаем согласованным, пока не сложится "
              "весь пакет — цена, срок и оплата вместе.",
              "Let us agree on one thing: nothing is settled until the whole package is — "
              "price, term and payment together."),
            moves=("tradeoff",),
            when=T("В начале торга или как только вас тянут закрывать пункты по одному.",
                   "At the start, or as soon as you are pulled into closing items one by "
                   "one."),
        ),
        Phrase(
            T("Предлагаю два пакета на выбор: 88 рублей при годовом контракте с гарантией "
              "объёма или 91 рубль без обязательств по объёму. Какой вам ближе?",
              "Here are two packages to choose from: 88 per unit with an annual volume "
              "commitment, or 91 with no volume commitment. Which works better for you?"),
            moves=("tradeoff",),
            when=T("Когда интересы уже известны и нужно, чтобы она выбрала.",
                   "When the interests are known and you want her to choose."),
        ),
        Phrase(
            T("Хорошо, этот пункт отмечаем как предварительный — вернёмся к нему, когда "
              "увидим всю картину.",
              "Fine, let us mark that point as provisional — we will come back to it once "
              "we see the whole picture."),
            when=T("Когда по одному условию уже можно сказать «да».",
                   "When you could already say yes to one term."),
        ),
        Phrase(
            T("Давайте не закрывать цену отдельно. Если назовём цифру сейчас, потом нечем "
              "будет двигать срок и оплату.",
              "Let us not close the price on its own. If we fix a number now, we will have "
              "nothing left to move the term and payment with."),
        ),
        Phrase(
            T("Что нужно поменять в этом пакете, чтобы он вам подошёл?",
              "What would need to change in this package for it to work for you?"),
            moves=("tradeoff",),
            when=T("Если пакет отвергли: пусть его поправят, а не отбросят.",
                   "If the package is turned down: get them to adjust it, not drop it."),
        ),
    ),
    dialog=Dialog(
        setup=T("Закупки. Вы уже знаете, что Ирине важна загрузка производства. Она "
                "предлагает закрывать вопросы по одному.",
                "Procurement. You already know Irina cares about keeping the factory loaded. "
                "She suggests closing the issues one at a time."),
        opening=(
            them("Давайте сначала закроем срок. Годовой контракт — да?",
                 "Let us close the term first. An annual contract — yes?"),
        ),
        bad=(
            you("Да, годовой — без проблем.", "Yes, annual is no problem."),
            them("Отлично. Теперь оплата: предоплата 30% вам подходит?",
                 "Great. Now payment: does 30% upfront suit you?"),
            you("Ну, если нужно — давайте.", "Well, if you need it, fine."),
            them("Прекрасно. Тогда цена — 96.", "Lovely. Then the price is 96."),
            you("А как же скидка за годовой контракт и предоплату?",
                "What about a discount for the annual contract and the prepayment?"),
            them("Так мы же уже закрыли условия. Цена с ними — 96.",
                 "But we have already closed the terms. With them the price is 96."),
        ),
        bad_why=T(
            "Каждое «да» было отдельным подарком. Когда дошло до цены, годовой контракт и "
            "предоплата уже лежали у Ирины в кармане, и просить за них скидку задним числом "
            "выглядит как попытка переиграть договорённость.",
            "Every “yes” was a separate gift. By the time you reached the price, the annual "
            "contract and the prepayment were already in Irina's pocket, and asking for a "
            "discount for them after the fact looks like trying to reopen the deal.",
        ),
        good=(
            you("Годовой контракт мы готовы обсуждать. Но давайте ничего не считать "
                "согласованным, пока не сложится весь пакет — цена, срок и оплата вместе.",
                "We are open to an annual contract. But let us treat nothing as settled "
                "until the whole package is — price, term and payment together.",
                moves=("tradeoff",)),
            them("Хорошо. Что вы предлагаете?", "All right. What do you suggest?"),
            you("Два пакета на выбор: 88 рублей при годовом контракте с гарантией объёма "
                "или 91 рубль без обязательств по объёму. Какой вам ближе?",
                "Two packages to choose from: 88 per unit with an annual volume commitment, "
                "or 91 with no volume commitment. Which works better for you?",
                moves=("tradeoff",)),
            them("Годовой, конечно. 88 — жёстко, но давайте считать от него.",
                 "The annual one, of course. 88 is tough, but let us work from there."),
        ),
        good_why=T(
            "Годовой контракт остался на столе как часть целого, а не ушёл отдельным «да». "
            "Два варианта одинаково устраивали вас, и Ирина выбрала сама — годовой, то "
            "есть подтвердила, что загрузка ей дороже трёх рублей в цене. Торг теперь идёт "
            "от 88, а не от 96.",
            "The annual contract stayed on the table as part of the whole instead of going "
            "out as a separate yes. Both options suited you equally, and Irina chose for "
            "herself — the annual one, confirming that a loaded line is worth more to her "
            "than three roubles on the price. The haggling now starts from 88, not 96.",
        ),
    ),
    mistakes=(
        Mistake(
            T("Говорить «да» по пунктам",
              "Saying yes item by item"),
            T("Каждое отдельное согласие — это условие, которым вы больше не можете "
              "заплатить за цену. К последнему пункту в руках не остаётся ничего.",
              "Every separate agreement is a term you can no longer use to pay for the "
              "price. By the last item you have nothing left in hand."),
        ),
        Mistake(
            T("Вариант, который вам на самом деле хуже",
              "An option that is actually worse for you"),
            T("Предложить «для вида» вариант, на который вы не хотите соглашаться, в "
              "надежде, что его не выберут. Выберут именно его. Каждый вариант пакета "
              "должен быть таким, под которым вы спокойно подпишетесь.",
              "Offering an option “for show” that you do not want, hoping it will not be "
              "picked. That is exactly the one that gets picked. Every version of the "
              "package must be one you would sign without hesitation."),
        ),
        Mistake(
            T("Пакет вместо вопросов",
              "A package instead of questions"),
            T("Собрать варианты, не зная, что важно собеседнику, — это угадывание. Пакет "
              "работает, когда вы уже спросили про интересы и знаете, из чего его "
              "складывать.",
              "Building options without knowing what matters to the other side is "
              "guessing. A package works once you have asked about interests and know what "
              "to build it from."),
        ),
    ),
    limits=(
        Limit(
            T("Закупка идёт через конкурс, где условия заранее прописаны в документации, "
              "а спорить можно только о цене.",
              "The purchase goes through a tender where the terms are fixed in the "
              "documents in advance, and only the price is open."),
            T("Торгуйтесь пакетом раньше — пока документацию ещё пишут. Внутри конкурса "
              "работают цена и её обоснование, и там пакет не собрать.",
              "Negotiate the package earlier — while the documents are still being "
              "written. Inside the tender, only the price and its justification work, and "
              "no package can be built there."),
        ),
        Limit(
            T("Условий так много, что стороны путаются и забывают, что уже обсудили.",
              "There are so many terms that both sides get confused and forget what has "
              "been covered."),
            T("Держите в пакете три-четыре условия, не больше, и записывайте варианты в "
              "таблицу, которую видят обе стороны. Остальное вынесите в отдельное письмо "
              "после главной договорённости.",
              "Keep three or four terms in the package, no more, and write the options "
              "into a table both sides can see. Move the rest into a separate email after "
              "the main agreement."),
        ),
    ),
)
