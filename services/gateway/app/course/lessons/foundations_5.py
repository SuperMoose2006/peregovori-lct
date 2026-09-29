"""Позиции и интересы · урок 5 — «Интерес открывается на доверии»."""

from app.course.lessons._model import (Dialog, LessonMaterial, Limit, Mistake,
                                       Phrase, T, them, you)

MATERIAL = LessonMaterial(
    block="foundations",
    lesson=5,
    scenario_id="rent",
    technique=T("Сначала контакт, потом вопрос",
                "Contact first, question second"),
    why=T(
        "Хороший вопрос, заданный не вовремя, не работает. После резкого начала, спора о "
        "цене или колкости на «что для вас важно?» отвечают «а что именно вас интересует?» "
        "или «цена 75, что тут обсуждать». Причина простая: назвать свой интерес — значит "
        "показать, на что можно давить. Признаться, что боишься пустых месяцев, человек "
        "готов только тому, кому хоть немного доверяет. Приём: если стол остыл, сначала "
        "одним ходом вернуть контакт и только потом спрашивать — про одну конкретную вещь.",
        "A good question asked at the wrong moment does not work. After a sharp start, an "
        "argument about price or a jab, “what matters to you?” gets “what exactly are you "
        "asking about?” or “it is 75, what is there to discuss”. The reason is simple: "
        "naming your interest shows where you can be pushed. People admit they fear empty "
        "months only to someone they trust at least a little. The technique: if the table "
        "has gone cold, spend one move restoring contact, and only then ask — about one "
        "specific thing.",
    ),
    core=T(
        "Два сигнала, что спрашивать рано. Переспрос: «а что именно вас интересует?», «к "
        "чему вы клоните?». И отписка: короткий ответ, который возвращает к цифре. Переспрос "
        "значит «уточните», а не «отстаньте» — у него две причины, и лечатся они по-разному.\n\n"
        "Первая причина — мало доверия. Не повторяйте вопрос громче и не задавайте его "
        "другими словами: сначала один ход на контакт. Назовите то, что человек чувствует "
        "(«понимаю, после прошлого жильца вам не хочется рисковать»). Признайте свою "
        "резкость, если она была, — коротко и без оправданий. Поблагодарите за что-то "
        "конкретное. Это не лесть: вы показываете, что видите человека, а не только цену.\n\n"
        "Вторая причина — вопрос слишком широкий. «Что для вас важно?» можно понять как «что "
        "вы готовы мне уступить». Сузьте его до одной темы: «что для вас важно в оплате — "
        "сумма или день, когда приходят деньги?». Узкий вопрос безопаснее: он спрашивает о "
        "деле, а не о слабых местах.\n\n"
        "Порядок: контакт, потом узкий вопрос. Можно в одной реплике, но контакт идёт "
        "первым. Если собеседник может не понять, зачем вы спрашиваете, скажите это вслух: "
        "«спрашиваю, чтобы предложить удобные вам условия».",
        "Two signs it is too early to ask. A query back: “what exactly are you asking "
        "about?”, “where are you going with this?”. And a brush-off: a short answer that "
        "steers back to the number. A query back means “be specific”, not “go away” — and it "
        "has two causes that need different cures.\n\n"
        "The first cause is too little trust. Do not repeat the question louder or reword "
        "it: spend one move on contact first. Name what the person feels (“I understand, "
        "after the last tenant you do not want to take chances”). Own your sharpness if "
        "there was any — briefly and without excuses. Thank them for something specific. "
        "This is not flattery: you show that you see a person, not just a price.\n\n"
        "The second cause is a question that is too wide. “What matters to you?” can be heard "
        "as “what are you willing to give me”. Narrow it to one topic: “what matters to you "
        "about payments — the amount, or the day the money arrives?”. A narrow question is "
        "safer: it asks about the matter, not about weak spots.\n\n"
        "The order: contact, then a narrow question. It can be one line, but contact comes "
        "first. If the other side may wonder why you are asking, say it out loud: “I am "
        "asking so I can offer terms that suit you.”",
    ),
    phrases=(
        Phrase(
            T("Я начал разговор с торга, и получилось резко. Извините — давайте иначе.",
              "I opened with haggling, and it came out sharp. I am sorry — let me start "
              "again."),
            when=T("Если резкость была с вашей стороны. Одна фраза, без оправданий.",
                   "If the sharpness came from you. One line, no excuses."),
        ),
        Phrase(
            T("Понимаю, после прошлого жильца вам не хочется рисковать.",
              "I understand — after the last tenant you do not want to take chances."),
            moves=("acknowledge",),
            when=T("Назвать чувство, которое стоит за холодным ответом.",
                   "To name the feeling behind a cold answer."),
        ),
        Phrase(
            T("Спасибо, что показали квартиру вечером, — я ценю ваше время.",
              "Thank you for showing me the flat in the evening — I appreciate your time."),
            moves=("acknowledge",),
        ),
        Phrase(
            T("Спрошу конкретнее: что для вас важно в оплате — сумма или день, когда приходят "
              "деньги?",
              "Let me be more specific: what matters to you about payments — the amount, or "
              "the day the money arrives?"),
            moves=("interests_probe",), reveals=True,
            when=T("Ответ на переспрос «а что именно вас интересует?».",
                   "The answer to “what exactly are you asking about?”."),
        ),
        Phrase(
            T("Спрашиваю не из любопытства: хочу предложить условия, которые вам удобны. Что "
              "для вас важно в поиске жильцов?",
              "I am not asking out of curiosity: I want to offer terms that suit you. What "
              "matters to you about vacancy?"),
            moves=("interests_probe",), reveals=True,
            when=T("Когда вопрос могут принять за попытку выведать слабое место.",
                   "When the question might be taken as fishing for a weak spot."),
        ),
    ),
    dialog=Dialog(
        setup=T("Аренда. Вы начали с того, что назвали цену Натальи завышенной, и она "
                "обиделась. Разговор остыл.",
                "Renting. You opened by calling Natalia's price inflated, and she took "
                "offence. The conversation has gone cold."),
        state={"trust": 24, "tension": 45},
        opening=(
            them("Если вам дорого — ищите дешевле. Я своё сказала.",
                 "If it is too expensive for you, look for something cheaper. I have said my "
                 "piece."),
        ),
        bad=(
            you("Ладно. Что для вас важно?", "Fine. What matters to you?",
                moves=("interests_probe",)),
            them("А что именно вас интересует? Цена — 75.",
                 "What exactly are you asking about? The price is 75."),
            you("Ну хорошо, что для вас важно в жильце?",
                "All right, what matters to you in a tenant?",
                moves=("interests_probe",)),
            them("Чтобы платил 75. Вы уже спрашивали.",
                 "That they pay 75. You have asked that already."),
        ),
        bad_why=T(
            "Вопросы правильные по форме, но заданы на холодном столе. Наталья только что "
            "услышала, что её цена завышена, и рассказывать о своих тревогах человеку, "
            "который её задел, не станет. Второй вопрос уже с темой, но контакта по-прежнему "
            "нет — и ответ тот же.",
            "The questions are well formed, but they are asked at a cold table. Natalia has "
            "just been told her price is inflated, and she will not tell her worries to "
            "someone who has just stung her. The second question has a topic, but there is "
            "still no contact — so the answer is the same.",
        ),
        good=(
            you("Наталья, я начал с цены, и получилось резко. Извините. Понимаю, для вас это "
                "не просто квартира.",
                "Natalia, I opened with the price and it came out sharp. I am sorry. I "
                "understand this is not just a flat to you.",
                moves=("acknowledge",)),
            them("Не просто. Я в ней выросла. И жильцов выбираю не по цене.",
                 "It is not. I grew up in it. And I do not pick tenants by price."),
            you("Спрошу конкретнее: что для вас важно в оплате — сумма или день, когда "
                "приходят деньги?",
                "Let me be more specific: what matters to you about payments — the amount, "
                "or the day the money arrives?",
                moves=("interests_probe",), reveals=True),
            them("День. Прошлый жилец вечно задерживал, а мне самой платить первого числа.",
                 "The day. The last tenant was always late, and my own bills are due on the "
                 "first."),
        ),
        good_why=T(
            "Первая реплика ничего не спрашивает — она возвращает контакт: признаёт резкость и "
            "показывает, что вы видите человека. Наталья смягчается и сама говорит, что "
            "выбирает жильцов не по цене. Второй вопрос узкий — про оплату — и открывает "
            "интерес, который на холодном столе был недоступен: деньги день в день.",
            "The first line asks nothing — it restores contact: it owns the sharpness and "
            "shows you see a person. Natalia softens and says herself that she does not pick "
            "tenants by price. The second question is narrow — about payments — and opens the "
            "interest that was out of reach at the cold table: money on the same day.",
        ),
    ),
    mistakes=(
        Mistake(
            T("Повторить тот же вопрос громче",
              "Repeating the same question louder"),
            T("Переспрос кажется непониманием, и хочется повторить медленнее и настойчивее. Но "
              "дело не в словах, а в том, что человеку небезопасно отвечать. Повтор добавляет "
              "давления и отнимает последнее доверие. Смените ход: контакт вместо вопроса.",
              "A query back feels like a misunderstanding, and you want to repeat yourself "
              "slower and firmer. But the problem is not the words — answering does not feel "
              "safe. Repeating adds pressure and burns the last of the trust. Change the move: "
              "contact instead of a question."),
        ),
        Mistake(
            T("Извиниться и тут же оправдаться",
              "Apologising and then justifying yourself"),
            T("«Извините, но цена правда завышена» — это не извинение, а второй раунд спора. "
              "Всё, что после «но», отменяет то, что до него. Признали резкость — остановитесь "
              "и дайте человеку ответить.",
              "“I am sorry, but the price really is inflated” is not an apology but round two "
              "of the argument. Everything after “but” cancels what came before. Once you "
              "have owned the sharpness, stop and let them respond."),
        ),
        Mistake(
            T("Контакт как ритуал",
              "Contact as a ritual"),
            T("Дежурное «спасибо, что нашли время» в начале каждой реплики перестаёт работать "
              "на второй раз и звучит как техника продаж. Контакт работает, когда он про "
              "конкретное: про то, что человек сказал или сделал, — «спасибо, что показали "
              "квартиру вечером».",
              "A stock “thank you for your time” at the start of every line stops working the "
              "second time and sounds like a sales technique. Contact works when it is about "
              "something specific — something they said or did: “thank you for showing me the "
              "flat in the evening”."),
        ),
    ),
    limits=(
        Limit(
            T("Собеседник закрыт не из-за вас: у него плохой день, давят сверху, он в споре "
              "с кем-то ещё.",
              "The other side is closed off for reasons that have nothing to do with you: a "
              "bad day, pressure from above, a fight with someone else."),
            T("Извиняться вам не за что, и не надо. Назовите то, что видите («вижу, что "
              "день непростой»), и предложите перенести разговор или сократить его до одного "
              "вопроса. Иногда лучший ход — договориться о следующей встрече.",
              "You have nothing to apologise for, so do not. Name what you see (“I can see "
              "it has been a tough day”) and offer to move the conversation or cut it down to "
              "one question. Sometimes the best move is to agree on the next meeting."),
        ),
        Limit(
            T("Доверие не возвращается: на каждый ваш шаг — новая колкость.",
              "Trust does not come back: every step you take meets another jab."),
            T("Интересы здесь не вскрыть, и дожимать бесполезно. Переходите к тому, что не "
              "требует доверия: к цифрам сопоставимых предложений и к своей альтернативе. А "
              "если и это не помогает — к ней и идите.",
              "You will not uncover interests here, and pressing is useless. Move to what "
              "needs no trust: the numbers of comparable offers and your own alternative. And "
              "if that does not help either — take the alternative."),
        ),
    ),
)
