"""Позиции и интересы · урок 1 — «Позиция — это ещё не человек»."""

from app.course.lessons._model import (Dialog, LessonMaterial, Limit, Mistake,
                                       Phrase, T, them, you)

MATERIAL = LessonMaterial(
    block="foundations",
    lesson=1,
    scenario_id="rent",
    technique=T("Спросить, что стоит за требованием",
                "Ask what sits behind the demand"),
    why=T(
        "Собеседник называет цифру — «75 тысяч, и это окончательно», — и почти каждый "
        "отвечает своей цифрой: «давайте 65». Дальше торг идёт по одной оси: каждая "
        "тысяча, которую выиграли вы, проиграна им, и уступает тот, кто первым устал. "
        "Приём снимает эту ловушку: вы перестаёте спорить с требованием и выясняете, "
        "зачем оно человеку. Очень часто то, что ему на самом деле нужно, стоит вам "
        "дёшево.",
        "The other side names a number — “75k, and that is final” — and nearly everyone "
        "answers with a number of their own: “let us say 65”. From there the haggling runs "
        "along one axis: every thousand you win is a thousand they lose, and whoever tires "
        "first gives way. This technique gets you out of that trap: you stop arguing with "
        "the demand and find out why the person needs it. Very often what they actually "
        "need is cheap for you to give.",
    ),
    core=T(
        "Позиция — то, что человек требует: «75 тысяч», «30% предоплаты», «сдвиг на "
        "20 дней». Интерес — зачем ему это: не остаться с пустой квартирой, закрыть "
        "кассовый разрыв, не выглядеть виноватым перед начальством. Позицию можно "
        "удовлетворить одним способом, интерес — несколькими.\n\n"
        "Порядок такой. Услышали позицию — не отвечайте на неё цифрой. Спросите, что за "
        "ней стоит, и сразу назовите одну-две возможные причины: на вопрос с вариантами "
        "ответить легче, чем на голое «почему». Перескажите ответ своими словами и "
        "проверьте, правильно ли поняли. Только после этого предлагайте — уже под "
        "интерес, а не под цифру.\n\n"
        "Пример из закупок: поставщик требует 30% предоплаты. Это позиция. Интерес — "
        "закрыть кассовый разрыв до конца квартала. Под него подходит и предоплата, и "
        "отсрочка 15 дней вместо 60, и быстрая оплата первой партии. Три варианта "
        "вместо одного спора.",
        "A position is what someone demands: “75k”, “30% upfront”, “a 20-day slip”. An "
        "interest is why they want it: not being left with an empty flat, closing a cash "
        "gap, not looking at fault in front of their boss. A position can be met one way; "
        "an interest can be met several ways.\n\n"
        "The order is this. When you hear a position, do not answer it with a number. Ask "
        "what sits behind it and offer one or two possible reasons straight away: a "
        "question with options is easier to answer than a bare “why”. Retell the answer in "
        "your own words and check you got it right. Only then make an offer — shaped to "
        "the interest, not to the number.\n\n"
        "A procurement example: a supplier demands 30% upfront. That is the position. The "
        "interest is closing a cash gap before quarter end. Prepayment serves it, but so do "
        "15-day payment terms instead of 60, or paying fast for the first batch. Three "
        "options instead of one argument.",
    ),
    phrases=(
        Phrase(
            T("Понимаю, 75 — ваша цифра. Помогите понять, что стоит за этой цифрой: "
              "вам важнее, чтобы квартира не пустовала, или чтобы жилец был без хлопот?",
              "I understand 75 is your number. Help me see what sits behind it: is it more "
              "important to you that the flat is never empty, or a tenant with no hassle?"),
            moves=("acknowledge", "interests_probe"), reveals=True,
            when=T("Сразу после того, как прозвучала цифра.",
                   "Right after the number has been named."),
        ),
        Phrase(
            T("Что вас беспокоит сильнее всего, когда вы сдаёте квартиру: пустые месяцы, "
              "шумные жильцы или задержки оплаты?",
              "What matters most to you when you let a flat: avoiding vacancy, a quiet "
              "tenant, or rent that arrives on time?"),
            moves=("interests_probe",), reveals=True,
        ),
        Phrase(
            T("Что важнее для вас в этой сделке, кроме цены: срок договора, оплата день в "
              "день или спокойный жилец?",
              "Apart from the price, what matters more to you here: the length of the "
              "lease, payment on time, or a quiet tenant?"),
            moves=("interests_probe",), reveals=True,
        ),
        Phrase(
            T("Правильно ли я понял: для вас главное не сама сумма, а чтобы деньги "
              "приходили точно в срок?",
              "If I understand you right, the point for you is not the amount itself but "
              "that the money arrives exactly on time?"),
            moves=("acknowledge",),
            when=T("Когда человек ответил — перескажите, прежде чем предлагать.",
                   "Once they have answered — retell it before you offer anything."),
        ),
        Phrase(
            T("С цифрой я пока спорить не буду. Сначала хочу понять, какой жилец вам нужен.",
              "I will not argue with the number yet. First I want to understand what kind "
              "of tenant you are looking for."),
            when=T("Если вас тянут торговаться раньше, чем вы что-то узнали.",
                   "If you are being pulled into haggling before you have learned anything."),
        ),
    ),
    dialog=Dialog(
        setup=T("Аренда. Наталья сдаёт квартиру. Вам нужно не дороже 70 тысяч, а лучше 64.",
                "Renting. Natalia is letting a flat. You need 70k at most, and 64k ideally."),
        opening=(
            them("Квартира стоит 75 тысяч в месяц. Это окончательная цена.",
                 "The flat is 75k a month. That is my final price."),
        ),
        bad=(
            you("75 — это дорого. Давайте 65.", "75 is too much. Let us say 65."),
            them("Ниже не пойду. Желающих хватает.",
                 "I will not go lower. There are plenty of people interested."),
            you("Ну хорошо, 70 — и по рукам?", "Fine, 70 and we shake on it?"),
            them("Семьдесят пять. Я же сказала.", "Seventy-five. I told you."),
        ),
        bad_why=T(
            "Две реплики — и вы сдвинулись с 65 до 70, ничего не узнав. Наталья стоит на "
            "месте: спорить с цифрой можно только цифрой, и на этой оси уступает тот, кто "
            "первым устал. Устали вы.",
            "Two lines, and you have moved from 65 to 70 without learning a thing. Natalia "
            "has not moved: you can only argue with a number using a number, and on that "
            "axis whoever tires first gives way. You tired first.",
        ),
        good=(
            you("Понимаю, 75 — ваша цифра. Помогите понять, что стоит за этой цифрой: вам "
                "важнее, чтобы квартира не пустовала, или чтобы жилец был без хлопот?",
                "I understand 75 is your number. Help me see what sits behind it: is it more "
                "important to you that the flat is never empty, or a tenant with no hassle?",
                moves=("acknowledge", "interests_probe"), reveals=True),
            them("Честно? Прошлый жилец съехал внезапно, и квартира два месяца стояла "
                 "пустая. Больше я так не хочу.",
                 "Honestly? The last tenant left without warning and the flat sat empty for "
                 "two months. I do not want that again."),
            you("Правильно ли я понял, что главное для вас — не остаться без жильца? Тогда "
                "так: если я подпишу договор на 11 месяцев, сможете ли вы подвинуться по цене?",
                "If I understand you right, the main thing is not to be left without a "
                "tenant? Then here is an idea: if I sign an 11-month lease, can you move on "
                "the price?",
                moves=("acknowledge", "tradeoff")),
            them("На год? Это меняет дело. Давайте обсудим цифру.",
                 "For a year? That changes things. Let us talk numbers."),
        ),
        good_why=T(
            "Вы не спорили с цифрой, а спросили, что за ней, и сразу назвали две возможные "
            "причины — на такой вопрос легко ответить. Наталья назвала настоящую тревогу: "
            "пустые месяцы. Договор на год ей важен, а вам почти ничего не стоит — вы и так "
            "хотите жить здесь долго. Цена сдвинулась не от нажима, а потому что вы "
            "предложили то, что ей нужно.",
            "You did not argue with the number; you asked what sat behind it and offered two "
            "possible reasons at once — an easy question to answer. Natalia named her real "
            "worry: empty months. A year-long lease matters to her and costs you almost "
            "nothing — you want to stay long anyway. The price moved not because you pushed, "
            "but because you offered what she needs.",
        ),
    ),
    mistakes=(
        Mistake(
            T("Спросить «почему?» в лоб",
              "Asking a blunt “why?”"),
            T("«Почему 75?» звучит как требование оправдаться. Человек начинает защищать "
              "цифру, а не рассказывать о себе. Спрашивайте про него, а не про цифру: «что "
              "для вас важно», «что стоит за этой цифрой».",
              "“Why 75?” sounds like a demand to justify yourself. The person starts "
              "defending the number instead of talking about themselves. Ask about them, "
              "not about the figure: “what matters to you”, “what sits behind that number”."),
        ),
        Mistake(
            T("Принять вторую позицию за интерес",
              "Taking a second position for the interest"),
            T("«Мне нужно больше денег» — это всё ещё позиция, просто другими словами. Если "
              "ответ снова звучит как требование, спросите на шаг глубже: «А на что для вас "
              "влияет эта сумма?» Интерес — это то, про что можно сказать «ага, вот зачем».",
              "“I need more money” is still a position, only reworded. If the answer still "
              "sounds like a demand, go one step deeper: “And what does that amount affect "
              "for you?” An interest is the thing that makes you say “so that is why”."),
        ),
        Mistake(
            T("Спросить и тут же предложить",
              "Asking and offering in the same breath"),
            T("Задать вопрос и, не дослушав, сказать «ну давайте 70». Интерес, который вы не "
              "дослушали, на вас не сработает: вы предложили под свою догадку, а не под "
              "ответ. Сначала пересказ, потом предложение.",
              "Asking the question and then, without waiting, saying “well, let us say 70”. "
              "An interest you did not hear out cannot work for you: you shaped the offer to "
              "your guess, not to the answer. Retell first, then offer."),
        ),
    ),
    limits=(
        Limit(
            T("Разовая покупка у незнакомого продавца, которому важны только деньги и "
              "второй встречи не будет.",
              "A one-off purchase from a stranger who only cares about money, with no "
              "second meeting ahead."),
            T("Интересы там узкие, и вопрос «что для вас важно» прозвучит странно. "
              "Опирайтесь на цены сопоставимых предложений и на свою альтернативу — это "
              "блоки «Объективные критерии» и «BATNA и ZOPA».",
              "The interests there are narrow, and “what matters to you” will sound odd. "
              "Lean on the prices of comparable offers and on your alternative — the "
              "“Objective Criteria” and “BATNA & ZOPA” blocks."),
        ),
        Limit(
            T("Собеседник не хочет раскрываться и отвечает: «Это просто моя цена».",
              "The other side will not open up and says: “That is just my price.”"),
            T("Не дожимайте вопросами — это похоже на допрос. Предложите два варианта "
              "условий и посмотрите, какой выберут: выбор выдаёт интерес не хуже ответа. "
              "«Могу 70 при договоре на полгода или 67 при договоре на год — что вам "
              "удобнее?»",
              "Do not keep pressing with questions — it starts to feel like an "
              "interrogation. Offer two sets of terms and see which one they pick: a choice "
              "reveals an interest as well as an answer does. “I can do 70 on a six-month "
              "lease or 67 on a twelve-month one — which suits you better?”"),
        ),
    ),
)
