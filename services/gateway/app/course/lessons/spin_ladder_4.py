"""Лестница SPIN · урок 4 — «N — пусть ценность назовёт собеседник»."""

from app.course.lessons._model import (Dialog, LessonMaterial, Limit, Mistake,
                                       Phrase, T, them, you)

MATERIAL = LessonMaterial(
    block="spin-ladder",
    lesson=4,
    scenario_id="supplier",
    technique=T("Спросить, что даст решение, — и дать ответить",
                "Ask what a fix would be worth — and let them answer"),
    why=T(
        "Дойдя до своего предложения, почти все начинают его расхваливать: «годовой "
        "контракт — это стабильность, прогнозируемость, никаких простоев». Собеседник слышит "
        "рекламу и делает то, что делают с рекламой, — спорит с ней: «годовой контракт у нас "
        "просят все». Приём переворачивает роли: вы не перечисляете выгоды, а спрашиваете, "
        "что решение дало бы ему. Ценность, которую человек назвал сам, он потом не "
        "оспаривает — в этом весь смысл последней ступени.",
        "Once they reach their own proposal, almost everyone starts praising it: “an annual "
        "contract means stability, predictability, no downtime”. The other side hears an "
        "advert and does what people do with adverts — argues with it: “everyone asks us for "
        "an annual contract”. The technique swaps the roles: instead of listing benefits, "
        "you ask what a fix would give them. People do not argue later with a value they "
        "named themselves — that is the whole point of the last rung.",
    ),
    core=T(
        "Направляющий вопрос (N, Need-payoff) спрашивает, что даст решение проблемы. "
        "Формулы: «Насколько важно было бы для вас…», «Что это бы вам дало, если…», «Было "
        "бы полезно, если…», «Если бы мы решили вопрос с…, что бы это изменило?».\n\n"
        "Правила. N идёт после I: сначала собеседник назвал проблему и посчитал её цену, "
        "потом вы спрашиваете о решении — иначе вопросу не на что опереться. Спрашивайте о "
        "его выгоде, а не о свойствах вашего предложения: «что это дало бы вашему цеху», а "
        "не «как вам наш годовой контракт». Дослушайте ответ до конца и не договаривайте "
        "за человека — самое ценное он часто добавляет последней фразой.\n\n"
        "Потом верните ему его же слова: «Вы сказали, что год загрузки — это лето без "
        "кредитов. Годовой контракт с гарантией объёма даёт ровно это». Теперь это не ваша "
        "реклама, а его вывод.\n\n"
        "Ответ на N-вопрос полезен и вам: он показывает, сколько стоит для собеседника то, "
        "что вы можете дать. «Очень важно» значит, что за годовой контракт можно просить "
        "заметное движение по цене.\n\n"
        "Пример из найма: «Насколько важно для вас, чтобы человек вышел до конца квартала?» "
        "Если ответ «критично», ранний выход на работу — ваша фишка в торге об окладе.",
        "A need-payoff question (N) asks what solving the problem would give them. "
        "Templates: “How valuable would it be to you…”, “Would it help you if…”, “Would that "
        "be useful…”, “What if you could…, what would that change?”.\n\n"
        "The rules. N comes after I: first they named the problem and put a cost on it, then "
        "you ask about the fix — otherwise the question has nothing to stand on. Ask about "
        "their gain, not about the features of your offer: “what would that give your "
        "plant”, not “how do you like our annual contract”. Hear the answer out and do not "
        "finish their sentence — the most valuable part often comes last.\n\n"
        "Then hand their words back: “You said a year of steady load means a summer without "
        "loans. An annual volume commitment gives you exactly that.” Now it is not your "
        "advert but their conclusion.\n\n"
        "The answer to an N-question helps you too: it shows how much what you can give is "
        "worth to them. “Very valuable” means you can ask for real movement on price in "
        "return for an annual contract.\n\n"
        "A hiring example: “How valuable would it be for the new hire to start before "
        "quarter end?” If the answer is “critical”, an early start date is your chip in the "
        "salary talk.",
    ),
    phrases=(
        Phrase(
            T("Насколько важно было бы для вас закрыть загрузку производства на год вперёд?",
              "How valuable would it be to you to have the factory loaded a year ahead?"),
            moves=("spin_needpayoff",), reveals=True,
            when=T("После того как собеседник посчитал цену простоя.",
                   "After they have put a cost on the downtime."),
        ),
        Phrase(
            T("Что это бы вам дало, если бы оплата приходила раньше — без коротких кредитов?",
              "Would it help you if payments came in earlier, with no short-term loans?"),
            moves=("spin_needpayoff",), reveals=True,
        ),
        Phrase(
            T("Было бы полезно, если бы контракт был не разовым, а на год?",
              "Would that be useful — a contract for a year rather than a one-off?"),
            moves=("spin_needpayoff",), reveals=True,
        ),
        Phrase(
            T("Если бы мы решили вопрос с загрузкой на лето, что бы это изменило для вашей "
              "команды?",
              "What if you could solve utilization for the summer — what would that change "
              "for your team?"),
            moves=("spin_needpayoff",), reveals=True,
            when=T("Открытая форма: ответ длиннее и честнее, чем «да» или «нет».",
                   "The open form: the answer is longer and more honest than yes or no."),
        ),
        Phrase(
            T("Вы сами сказали: год загрузки — это лето без кредитов. Годовой контракт с "
              "гарантией объёма даёт ровно это.",
              "You said it yourself: a year of steady load means a summer without loans. An "
              "annual volume commitment gives you exactly that."),
            when=T("Вернуть собеседнику его слова, прежде чем назвать условия.",
                   "Hand their words back before you name your terms."),
        ),
    ),
    dialog=Dialog(
        setup=T("Закупки. Ирина уже рассказала, что летом линия стоит и это дорого. Её цена — "
                "100 ₽ за штуку, ваша цель — 86.",
                "Procurement. Irina has already said the line stands idle in summer and that "
                "it is costly. Her price is 100 per unit; your target is 86."),
        opening=(
            them("Летом линия стоит, люди на окладе — да, это дорого нам обходится.",
                 "The line stands idle in summer while people are on salary — yes, it costs "
                 "us a lot."),
        ),
        bad=(
            you("Тогда вам нужен наш годовой контракт: стабильность, прогнозируемость, "
                "никаких простоев. Это же очевидная выгода.",
                "Then what you need is our annual contract: stability, predictability, no "
                "downtime. The benefit is obvious."),
            them("Выгода — это когда цена нормальная. Годовой контракт у нас просят все.",
                 "A benefit is when the price is fair. Everyone asks us for an annual "
                 "contract."),
        ),
        bad_why=T(
            "Вы сказали правду, но сказали её сами — и Ирина услышала продажу. Спорить с "
            "вашим списком выгод легко: «просят все» обесценивает контракт одной фразой. "
            "Ценность так и осталась вашим мнением, а не её выводом.",
            "What you said was true, but you said it yourself — and Irina heard a sales "
            "pitch. Your list of benefits is easy to argue with: “everyone asks” devalues the "
            "contract in one line. The value remained your opinion rather than her "
            "conclusion.",
        ),
        good=(
            you("Насколько важно было бы для вас закрыть загрузку производства на год вперёд?",
                "How valuable would it be to you to have the factory loaded a year ahead?",
                moves=("spin_needpayoff",), reveals=True),
            them("Очень. Я бы летом не держала людей без дела. И спала бы спокойнее.",
                 "Very. I would not have people sitting idle in summer. And I would sleep "
                 "better."),
            you("Что это бы вам дало, если бы оплата приходила раньше — без коротких "
                "кредитов?",
                "Would it help you if payments came in earlier, with no short-term loans?",
                moves=("spin_needpayoff",), reveals=True),
            them("Могла бы закупать сырьё заранее, по лучшей цене.",
                 "I could buy raw materials ahead of time, at a better price."),
            you("Вы сами сказали: год загрузки и деньги без кредитов. Если мы дадим годовой "
                "контракт с гарантией объёма, сможете ли вы подвинуться до 88?",
                "You said it yourself: a year of steady load and cash without loans. If we "
                "give you an annual volume commitment, can you move to 88?",
                moves=("tradeoff",)),
            them("При гарантии объёма — давайте обсуждать 88.",
                 "With guaranteed volume — let us discuss 88."),
        ),
        good_why=T(
            "Две ценности назвала сама Ирина: спокойное лето и деньги на сырьё без кредитов. "
            "Годовой контракт в последней реплике — не ваша реклама, а ответ на её же слова, "
            "и обесценить его «все просят» уже нельзя. А по её «очень» вы поняли, что за "
            "контракт можно просить движение по цене, — и попросили.",
            "Irina named both values herself: a quiet summer and cash for raw materials "
            "without loans. The annual contract in your last line is not your advert but an "
            "answer to her own words, and “everyone asks” can no longer devalue it. Her “very” "
            "told you the contract is worth real movement on price — and you asked for it.",
        ),
    ),
    mistakes=(
        Mistake(
            T("Перечислить выгоды самому",
              "Listing the benefits yourself"),
            T("Каждая выгода, которую вы назвали, — утверждение, и его можно оспорить. Та же "
              "выгода, названная собеседником, — его вывод, и спорить с собой он не станет. "
              "Если хочется сказать «это же стабильность», спросите: «насколько важна вам "
              "стабильная загрузка?».",
              "Every benefit you name is a claim, and claims can be disputed. The same "
              "benefit named by them is their conclusion, and they will not argue with "
              "themselves. If you feel like saying “but it means stability”, ask instead: "
              "“how valuable is steady utilization to you?”."),
        ),
        Mistake(
            T("Вопрос с подвохом",
              "A loaded question"),
            T("«Вы же хотите сэкономить, правда?» — формально вопрос о выгоде, на деле "
              "ловушка с одним возможным ответом. Люди это чувствуют и отвечают «смотря "
              "как». Настоящий N-вопрос открытый: ответ на него может вас удивить.",
              "“You do want to save money, right?” is formally a question about value, but in "
              "fact a trap with one possible answer. People sense it and reply “depends”. A "
              "real N-question is open: the answer might surprise you."),
        ),
        Mistake(
            T("Услышать «очень важно» и не связать",
              "Hearing “very valuable” and not linking it"),
            T("Собеседник назвал ценность, а вы вернулись к торгу о цене, будто ничего не "
              "прозвучало. Ценность, которую не превратили в условие, пропадает. Свяжите "
              "сразу: «вы сказали… — если мы дадим это, сможете ли вы…».",
              "They named a value, and you went back to haggling over price as if nothing had "
              "been said. A value you do not turn into a term is lost. Link it at once: “you "
              "said… — if we give you that, can you…”."),
        ),
    ),
    limits=(
        Limit(
            T("На N-вопрос отвечают «не особо важно».",
              "The answer to an N-question is “not that important”."),
            T("Не спорьте и не доказывайте, что важно. Вы ошиблись с интересом — это "
              "информация. Вернитесь на ступень ниже, к проблемам, и найдите ту, что для "
              "собеседника действительно дорога.",
              "Do not argue or try to prove it matters. You picked the wrong interest — that "
              "is information. Step back down to problems and find the one that really costs "
              "them."),
        ),
        Limit(
            T("Опытный переговорщик узнаёт технику: «вы меня по учебнику ведёте?».",
              "An experienced negotiator spots the technique: “are you running a textbook "
              "on me?”."),
            T("Бросьте формулу и скажите прямо: «Мне кажется, год загрузки для вас ценнее "
              "скидки в рублях. Я правильно понимаю?» Прямота с опытными работает лучше, чем "
              "хорошо скрытый приём.",
              "Drop the formula and say it plainly: “It seems to me a year of guaranteed load "
              "is worth more to you than a discount in roubles. Am I reading that right?” With "
              "experienced people, directness works better than a well-hidden technique."),
        ),
    ),
)
