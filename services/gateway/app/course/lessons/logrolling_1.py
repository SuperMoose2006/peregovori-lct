"""Размен и создание ценности · урок 1 — «Одна ось — торг, две — сделка»."""

from app.course.lessons._model import (Dialog, LessonMaterial, Limit, Mistake,
                                       Phrase, T, them, you)

MATERIAL = LessonMaterial(
    block="logrolling",
    lesson=1,
    scenario_id="supplier",
    technique=T("Добавить к цене второй вопрос",
                "Put a second issue next to the price"),
    why=T(
        "Закупщик приходит к поставщику и обсуждает одно — цену за штуку. Каждый рубль "
        "вниз — рубль из кармана продавца, поэтому она защищается, вы давите, и оба "
        "упираются. Ошибка в том, что переговоры о закупке считают переговорами о цене. "
        "Приём выводит разговор с одной оси: рядом с ценой кладут срок контракта, объём, "
        "график оплаты — и появляются варианты, в которых выигрывают обе стороны.",
        "A buyer meets a supplier and discusses one thing — the unit price. Every rouble "
        "off comes out of the seller's pocket, so she defends, you push, and both dig in. "
        "The mistake is treating a purchasing negotiation as a negotiation about price. "
        "This technique takes the conversation off that single axis: next to the price "
        "you put the contract term, the volume, the payment schedule — and options appear "
        "in which both sides come out ahead.",
    ),
    core=T(
        "Пока на столе одна цифра, у переговоров нулевая сумма: сколько получил один, "
        "столько потерял другой. Но почти у любой сделки, кроме главной цифры, есть "
        "условия: срок, объём, отсрочка или предоплата, график поставок, гарантия, "
        "доставка. Для вас и для собеседника они весят по-разному. Годовой контракт "
        "поставщику даёт загрузку производства на год, а вам почти ничего не стоит — вы "
        "и так закупаете круглый год. Как только условий на столе два, можно отдать "
        "дешёвое для себя и получить важное.\n\n"
        "Порядок простой. Назовите вслух, что ещё можно обсудить, кроме цены. Спросите, "
        "какие из этих условий важны собеседнику. Пока ничего не отдавайте: на этом шаге "
        "вы только расширяете стол, а обмен — следующий шаг.\n\n"
        "Так же в найме: кандидат просит 250 тысяч, бюджет 230 — но кроме оклада есть "
        "дата выхода, удалённые дни и пересмотр через полгода. И у резидента особой "
        "экономической зоны с подрядчиком на стройке цеха разговор не только о смете, "
        "но и о сроках, этапах оплаты и штрафах за срыв.",
        "While one number sits on the table, the negotiation is zero-sum: whatever one "
        "side gains, the other loses. But almost every deal has terms besides the headline "
        "number: term, volume, payment in advance or deferred, delivery schedule, warranty, "
        "shipping. They weigh differently for you and for the other side. An annual "
        "contract gives the supplier a loaded factory for a year and costs you almost "
        "nothing — you buy all year round anyway. As soon as there are two issues on the "
        "table, you can give what is cheap for you and get what matters.\n\n"
        "The order is simple. Say out loud what else there is to discuss besides the "
        "price. Ask which of those terms matter to the other side. Give nothing away yet: "
        "at this step you are only widening the table; the exchange comes next.\n\n"
        "Hiring works the same way: the candidate asks for 250k, the budget is 230k — but "
        "besides base pay there is the start date, remote days and a review in six months. "
        "And a resident of a special economic zone talking to a contractor about building "
        "a workshop discusses not just the estimate but deadlines, payment stages and "
        "penalties for delay.",
    ),
    phrases=(
        Phrase(
            T("Давайте обсудим не только цену за штуку. Есть ещё срок контракта, объём и "
              "график оплаты — от них цена тоже зависит.",
              "Let us look at more than the unit price. There is the contract term, the "
              "volume and the payment schedule — the price depends on those too."),
            when=T("Когда торг застрял на одной цифре.",
                   "When the haggling has stalled on a single number."),
        ),
        Phrase(
            T("Ирина, что для вас важнее всего, кроме цены: загрузка производства, график "
              "оплаты или срок контракта?",
              "Irina, apart from the price, what matters more to you: keeping the factory "
              "loaded, the payment schedule, or the contract term?"),
            moves=("interests_probe",), reveals=True,
            when=T("Чтобы узнать, какое из условий для неё весит больше.",
                   "To find out which of the terms weighs more for her."),
        ),
        Phrase(
            T("Как изменится цена за штуку, если объём будет больше, а контракт — длиннее?",
              "How would the unit price change with a bigger volume and a longer contract?"),
            moves=("open_question",),
            when=T("Пусть она сама покажет, как условия связаны с ценой.",
                   "Let her show you how the terms are tied to the price."),
        ),
        Phrase(
            T("Для нас цена важна, но не только она: нам нужны ещё стабильные сроки "
              "поставки и качество каждой партии.",
              "Price matters to us, but it is not the only thing: we also need stable "
              "delivery dates and consistent quality in every batch."),
            when=T("Назовите и свою вторую ось — ей тоже нужно, чем с вами меняться.",
                   "Name your own second axis too — she also needs something to trade with."),
        ),
    ),
    dialog=Dialog(
        setup=T("Закупки. Ирина, глава продаж поставщика, открылась на 100 ₽ за штуку. "
                "Ваша цель — 86, дороже 92 брать нельзя.",
                "Procurement. Irina, the supplier's head of sales, opened at 100 per unit. "
                "Your target is 86; you cannot pay more than 92."),
        opening=(
            them("Наша цена — 100 рублей за штуку. Это уже с учётом ваших объёмов.",
                 "Our price is 100 per unit. That already takes your volumes into account."),
        ),
        bad=(
            you("100 — дорого. Давайте 88.", "100 is too much. Let us say 88."),
            them("Не могу, у меня себестоимость. Могу 97.",
                 "I cannot, there are my costs. I can do 97."),
            you("Хорошо, 95 — и закончим.", "Fine, 95 and we are done."),
            them("97. Ниже никак.", "97. There is no going lower."),
        ),
        bad_why=T(
            "Весь разговор — об одной цифре. Каждый ваш шаг вниз для Ирины прямой убыток, "
            "поэтому она держится за себестоимость. Вы уже отступили с 88 до 95 и ничего "
            "не узнали о том, что ей нужно, кроме денег.",
            "The whole conversation is about one number. Every step down you ask for is a "
            "straight loss for Irina, so she holds on to her costs. You have already moved "
            "from 88 to 95 and learned nothing about what she needs besides money.",
        ),
        good=(
            you("Прежде чем торговаться о цене, давайте посмотрим, что ещё на столе. Ирина, "
                "что для вас важнее всего, кроме цены: загрузка производства, график оплаты "
                "или срок контракта?",
                "Before we haggle over price, let us see what else is on the table. Irina, "
                "apart from the price, what matters more to you: keeping the factory loaded, "
                "the payment schedule, or the contract term?",
                moves=("interests_probe",), reveals=True),
            them("Честно? Загрузка. Летом линия простаивает, и годовой объём я бы ценила "
                 "больше, чем пару рублей в цене.",
                 "Honestly? Keeping the line loaded. It stands idle in summer, and I would "
                 "value an annual volume more than a couple of roubles on the price."),
            you("Тогда давайте обсуждать цену вместе с объёмом. Сколько гарантированного "
                "объёма вам нужно, чтобы цена стала другой?",
                "Then let us discuss the price together with the volume. How much guaranteed "
                "volume do you need for the price to change?",
                moves=("spin_situation",)),
            them("С гарантией на год я могу говорить о другой цене. Давайте считать.",
                 "With a year's guarantee I can talk about a different price. Let us work "
                 "it out."),
        ),
        good_why=T(
            "Вы не спорили о цифре, а положили рядом с ней три условия и спросили, что из "
            "них важнее. Ирина сама назвала то, что для неё дороже пары рублей, — "
            "загрузку. Теперь у разговора две оси, и цена может двигаться не за счёт её "
            "убытка, а за счёт объёма, который вам почти ничего не стоит.",
            "You did not fight over the number; you put three terms next to it and asked "
            "which mattered more. Irina herself named what is worth more to her than a "
            "couple of roubles — a loaded line. Now the conversation has two axes, and the "
            "price can move not at her loss but thanks to volume that costs you almost "
            "nothing.",
        ),
    ),
    mistakes=(
        Mistake(
            T("Добавить условие и тут же его отдать",
              "Adding a term and giving it away at once"),
            T("«Годовой контракт? Да без проблем». Второе условие — это то, чем вы будете "
              "платить за цену. Отданное просто так не покупает ничего, и платить станет "
              "нечем.",
              "“An annual contract? Sure, no problem.” The second issue is what you will pay "
              "for the price with. Given away for free, it buys nothing, and you are left "
              "with nothing to pay with."),
        ),
        Mistake(
            T("Вывалить десять условий сразу",
              "Piling ten terms on at once"),
            T("Стол превращается в список претензий, и собеседник защищается по каждому "
              "пункту. Выберите два-три условия, которые что-то значат для обеих сторон.",
              "The table turns into a list of complaints, and the other side defends every "
              "item. Pick two or three terms that mean something to both sides."),
        ),
        Mistake(
            T("Решить за неё, что ей важно",
              "Deciding for her what matters to her"),
            T("«Срок контракта ей наверняка безразличен». Вы не знаете, что для "
              "собеседника дорого, пока не спросили. Поэтому условия сначала называют, а "
              "потом спрашивают, какое из них важнее.",
              "“She surely does not care about the contract term.” You do not know what is "
              "valuable to the other side until you ask. So you name the terms first, then "
              "ask which of them matters more."),
        ),
    ),
    limits=(
        Limit(
            T("Разовая покупка стандартного товара со склада: кроме цены правда нечего "
              "обсуждать.",
              "A one-off purchase of a standard item from stock: there really is nothing to "
              "discuss besides the price."),
            T("Не выдумывайте условия ради условий. Опирайтесь на цены сопоставимых "
              "предложений и на свою альтернативу. Если что-то и добавлять, то то, что "
              "вокруг сделки: срок оплаты, доставку, скорость отгрузки.",
              "Do not invent terms for the sake of it. Lean on the prices of comparable "
              "offers and on your alternative. If you add anything, add what surrounds the "
              "deal: payment terms, delivery, speed of shipment."),
        ),
        Limit(
            T("У собеседника нет полномочий по другим условиям: менеджер отвечает только "
              "за цену.",
              "The other side has no authority over the other terms: the manager only "
              "owns the price."),
            T("Спросите, кто решает про срок и объём, и попросите подключить этого "
              "человека. Или соберите условия в письменное предложение, которое уйдёт "
              "наверх вместе с ценой.",
              "Ask who decides on term and volume, and ask to bring that person in. Or put "
              "the terms into a written proposal that goes up the chain together with the "
              "price."),
        ),
    ),
)
