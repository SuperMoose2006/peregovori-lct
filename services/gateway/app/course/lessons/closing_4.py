"""Закрытие и фиксация · урок 4 — «Счёт и потолок „C“»."""

from app.course.lessons._model import (Dialog, LessonMaterial, Limit, Mistake,
                                       Phrase, T, them, you)

MATERIAL = LessonMaterial(
    block="closing",
    lesson=4,
    scenario_id="supplier",
    technique=T("Закрепить сделку: резюме письмом и разбор для себя",
                "Secure the deal: a written summary and your own debrief"),
    why=T(
        "Сделку закрыли устно, а через неделю в договоре другая отсрочка, объём без "
        "гарантии и цена «без учёта доставки». Или закрыли так жёстко, что собеседник "
        "чувствует себя проигравшим, — и при первой возможности отыграется: сорвёт "
        "сроки, не пойдёт навстречу при продлении. Хорошая сделка — это не только "
        "цифра: это цифра, которая исполнится, отношения, с которыми можно работать "
        "дальше, и способ, который вы сможете повторить.",
        "The deal was closed verbally, and a week later the contract has different "
        "payment terms, volume with no guarantee, and a price “excluding delivery”. Or it "
        "was closed so hard that the other side feels beaten — and will get even at the "
        "first chance: slip deadlines, refuse to budge at renewal. A good deal is not just "
        "a number: it is a number that gets delivered, a relationship you can keep "
        "working with, and a method you can repeat.",
    ),
    core=T(
        "После «да» — три действия.\n\n"
        "Резюме письмом в тот же день. Коротко, списком: цена, объём, срок, оплата, дата "
        "первой поставки и что осталось открытым. В конце — просьба подтвердить. Устная "
        "договорённость через неделю превращается в две версии, и побеждает та, что "
        "записана первой.\n\n"
        "Не праздновать выжатое вслух. «Мы рассчитывали на 92, а вы дошли до 88» "
        "превращает партнёра в проигравшего. Закупка — это повторяющиеся переговоры: "
        "через год продление, и Ирина его запомнит. Вместо этого признайте её вклад и "
        "подтвердите свою часть обмена.\n\n"
        "Разбор для себя. Три вопроса: где сделка легла между вашей красной линией и "
        "целью; захочет ли собеседник работать с вами снова; чем заработана цифра — "
        "вопросами, внешними данными, разменом — или нажимом и удачей. Результат, "
        "который вы не можете объяснить, не повторится со следующим поставщиком.\n\n"
        "То же в найме: оффер письмом сразу после разговора — оклад, дата выхода, "
        "условия пересмотра — и никаких «дёшево его взяли» в коридоре.",
        "After the yes — three actions.\n\n"
        "A written summary the same day. Short, as a list: price, volume, term, payment, "
        "first delivery date, and what is still open. At the end — a request to confirm. "
        "A verbal agreement turns into two versions within a week, and the one written "
        "down first wins.\n\n"
        "Do not celebrate the squeeze out loud. “We were counting on 92 and you went all "
        "the way to 88” turns your partner into the loser. Purchasing is a repeated "
        "negotiation: renewal comes in a year, and Irina will remember. Instead, "
        "acknowledge what she gave and confirm your side of the exchange.\n\n"
        "A debrief for yourself. Three questions: where did the deal land between your red "
        "line and your target; will the other side want to work with you again; what "
        "earned the number — questions, outside data, a trade — or pressure and luck. A "
        "result you cannot explain will not repeat with the next supplier.\n\n"
        "Hiring is the same: the offer goes out in writing right after the call — salary, "
        "start date, review terms — and no “we got him cheap” in the corridor.",
    ),
    phrases=(
        Phrase(
            T("Ирина, спасибо, что пошли навстречу по цене. Годовой объём с нашей стороны "
              "будет — план закупок пришлю до пятницы.",
              "Irina, I appreciate you meeting us on price. The annual volume will be there "
              "on our side — I will send the purchase plan by Friday."),
            moves=("acknowledge",),
            when=T("Сразу после «да»: признать её шаг и подтвердить свой.",
                   "Right after the yes: acknowledge her step and confirm yours."),
        ),
        Phrase(
            T("Отправляю резюме нашей договорённости: цена 88 рублей за штуку, годовой "
              "контракт с гарантией объёма, оплата в течение 15 дней после поставки, первая "
              "поставка 15-го числа. Подтвердите, пожалуйста, что всё верно.",
              "Sending a summary of our agreement: 88 per unit, an annual volume "
              "commitment, payment within 15 days of delivery, first delivery on the 15th. "
              "Please confirm it is all correct."),
            when=T("Письмо в тот же день, пока договорённость свежая.",
                   "An email the same day, while the agreement is fresh."),
        ),
        Phrase(
            T("Если что-то в письме расходится с тем, как вы поняли, давайте поправим "
              "сейчас, а не в договоре.",
              "If anything in the email differs from how you understood it, let us fix it "
              "now rather than in the contract."),
        ),
        Phrase(
            T("Как вам работалось с нами в этих переговорах? Что нам стоит учесть в "
              "следующий раз?",
              "How did this negotiation feel from your side? What should we take into "
              "account next time?"),
            moves=("open_question",),
            when=T("Если отношения долгие: проверить, не остался ли осадок.",
                   "In a long relationship: to check nothing sour was left behind."),
        ),
        Phrase(
            T("Разберём, чем мы заработали 88: что узнали, чем обосновали, что разменяли.",
              "Let us go over what earned us the 88: what we learned, how we backed it, "
              "what we traded."),
            when=T("Своей команде, после встречи.",
                   "To your own team, after the meeting."),
        ),
    ),
    dialog=Dialog(
        setup=T("Закупки. Ирина только что согласилась на 88 ₽ за штуку при годовом "
                "контракте с гарантией объёма и оплате в течение 15 дней.",
                "Procurement. Irina has just agreed to 88 per unit with an annual volume "
                "commitment and payment within 15 days."),
        opening=(
            them("Ну что ж, 88 при годовом объёме. Непросто мне это далось.",
                 "Well then, 88 with an annual volume. That did not come easy for me."),
        ),
        bad=(
            you("Отлично! Честно, мы рассчитывали на 92 — а вы до 88 дошли.",
                "Great! Honestly, we were counting on 92, and you went all the way to 88."),
            them("Вот как… Понятно.", "I see… Right."),
            you("Ну всё, тогда до связи, договор пришлёте.",
                "That is it, then. Talk soon, send us the contract."),
            them("Через неделю: «Направляю договор: 88 рублей, объём по заявкам, "
                 "предоплата 30%, как у нас принято».",
                 "A week later: “Attaching the contract: 88 per unit, volume on request, 30% "
                 "upfront, as is our standard.”"),
        ),
        bad_why=T(
            "Вы сказали вслух, что она уступила больше, чем вы надеялись, — теперь Ирина "
            "считает, что продешевила, и будет возвращать своё. Резюме не было, поэтому "
            "договор пришёл на её стандартных условиях: гарантия объёма и отсрочка, на "
            "которых держались 88, исчезли. Спорить теперь придётся о том, что «было "
            "сказано».",
            "You said out loud that she gave more than you hoped for — now Irina believes "
            "she sold too cheap and will be looking to win it back. There was no summary, "
            "so the contract came on her standard terms: the volume guarantee and payment "
            "terms that the 88 rested on have vanished. Now you will be arguing over what "
            "“was said”.",
        ),
        good=(
            you("Ирина, спасибо, что пошли навстречу по цене. Годовой объём с нашей стороны "
                "будет — план закупок пришлю до пятницы.",
                "Irina, I appreciate you meeting us on price. The annual volume will be "
                "there on our side — I will send the purchase plan by Friday.",
                moves=("acknowledge",)),
            them("Хорошо, жду.", "Good, I will look out for it."),
            you("И сегодня отправлю короткое резюме: 88 рублей за штуку, годовой контракт с "
                "гарантией объёма, оплата в течение 15 дней после поставки. Если что-то "
                "поняли иначе — поправим сейчас, а не в договоре.",
                "And today I will send a short summary: 88 per unit, an annual volume "
                "commitment, payment within 15 days of delivery. If you read anything "
                "differently, we fix it now rather than in the contract."),
            them("Хорошо, пришлите. Я сразу отвечу.",
                 "Fine, send it over. I will reply straight away."),
        ),
        good_why=T(
            "Вы признали её шаг и сразу подтвердили свою часть обмена — годовой объём, — "
            "поэтому сделка выглядит честной для обеих сторон. Резюме назвало все условия, "
            "на которых держится цифра, и дало возможность поправить расхождения до "
            "договора, а не после.",
            "You acknowledged her step and confirmed your side of the exchange straight "
            "away — the annual volume — so the deal looks fair to both sides. The summary "
            "named every term the number rests on and gave a chance to fix any mismatch "
            "before the contract, not after.",
        ),
    ),
    mistakes=(
        Mistake(
            T("Праздновать выжатое вслух",
              "Celebrating the squeeze out loud"),
            T("«Вы дёшево отдали» — лучший способ сделать так, чтобы при продлении вам "
              "отдали дорого. Победу над партнёром он запоминает дольше, чем цену.",
              "“You let it go cheap” is the surest way to be charged dearly at renewal. A "
              "partner remembers being beaten longer than they remember the price."),
        ),
        Mistake(
            T("Полагаться на устную договорённость",
              "Relying on a verbal agreement"),
            T("«Вроде обо всём договорились» — через неделю у каждой стороны своя "
              "версия, и обе честные. Письмо в тот же день стоит пять минут и снимает спор "
              "о том, что было сказано.",
              "“I think we covered everything” — a week later each side has its own "
              "version, and both are honest. An email the same day takes five minutes and "
              "removes the argument about what was said."),
        ),
        Mistake(
            T("Оценивать сделку только ценой",
              "Judging the deal by price alone"),
            T("88 получено нажимом — поставщик вернёт своё при продлении. 88 получено "
              "случайно — вы не повторите его в следующий раз. Спросите себя, за счёт чего "
              "вышла цифра.",
              "88 won by pressure — the supplier will take it back at renewal. 88 won by "
              "luck — you will not repeat it next time. Ask yourself what the number came "
              "from."),
        ),
    ),
    limits=(
        Limit(
            T("Разовая сделка: партия у продавца, с которым вы больше не встретитесь.",
              "A one-off deal: a batch from a seller you will never meet again."),
            T("Отношения здесь весят меньше, и разбор можно сделать короче. Но условия всё "
              "равно письменно: гарантия, срок поставки, порядок возврата — спорить о них "
              "после оплаты будет не с кем.",
              "The relationship weighs less here, and the debrief can be shorter. But the "
              "terms still go in writing: warranty, delivery date, returns — after payment "
              "there will be no one to argue with."),
        ),
        Limit(
            T("Резюме присылает собеседник, и в нём другие условия.",
              "The other side sends the summary, and the terms are different."),
            T("Не подписывайте «с поправкой потом». Ответьте по пунктам и сошлитесь на "
              "сказанное: «Мы обсуждали оплату в течение 15 дней после поставки, а в "
              "письме предоплата — поправьте, пожалуйста».",
              "Do not sign “and fix it later”. Reply point by point and refer to what was "
              "said: “We discussed payment within 15 days of delivery, and the email says "
              "prepayment — please correct it.”"),
        ),
    ),
)
