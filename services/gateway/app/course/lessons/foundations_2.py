"""Позиции и интересы · урок 2 — «Три интереса за одной цифрой»."""

from app.course.lessons._model import (Dialog, LessonMaterial, Limit, Mistake,
                                       Phrase, T, them, you)

MATERIAL = LessonMaterial(
    block="foundations",
    lesson=2,
    scenario_id="rent",
    technique=T("Собрать все интересы, а не первый",
                "Map every interest, not just the first"),
    why=T(
        "Человек задал хороший вопрос, услышал одну причину — и тут же строит под неё "
        "предложение. Но за одной цифрой почти всегда стоит несколько интересов: деньги, "
        "сроки, риск, спокойствие. Остановившись на первом, вы торгуетесь только им, а "
        "остальные так и остаются невидимыми — хотя среди них как раз те, что стоят вам "
        "дёшево. Приём простой: после первого ответа спросить «а что для вас важно ещё?» и "
        "пройти по областям, которых собеседник не коснулся, пока не соберётся карта из "
        "двух-трёх интересов.",
        "Someone asks a good question, hears one reason — and immediately builds an offer "
        "around it. But one number nearly always hides several interests: money, timing, "
        "risk, peace of mind. Stop at the first one and you trade on it alone, while the "
        "rest stay invisible — even though those are often exactly the things that cost you "
        "little. The technique is simple: after the first answer, ask “what else matters to "
        "you?” and walk through the areas the other side has not touched, until you have a "
        "map of two or three interests.",
    ),
    core=T(
        "Карта интересов — это короткий список того, что важно собеседнику, разложенный по "
        "областям. Областей обычно четыре: деньги (сумма, график оплаты), время (сроки, "
        "как быстро), риск (что может пойти не так) и спокойствие (хлопоты, репутация, как "
        "это выглядит для других).\n\n"
        "Порядок такой. Первый ответ не превращайте в предложение — запишите его и "
        "спросите дальше. Затем назовите область, которой ещё не касались: «А в оплате что "
        "для вас важно?» Когда интересов набралось два-три, спросите, какой из них главный, "
        "и перескажите весь список одной фразой.\n\n"
        "Потом рассортируйте. Одни интересы конфликтуют с вашими: сумма аренды — чем "
        "больше ей, тем меньше вам. Другие не конфликтуют вовсе: договор на год и оплата "
        "точно в срок вам почти ничего не стоят. Сделка строится на вторых.\n\n"
        "Пример из найма: кандидат просит оклад выше вилки. Спросите дальше — и окажется, "
        "что ему важны ещё два удалённых дня в неделю и понятный план роста. Удалёнка и "
        "план стоят компании меньше, чем прибавка к окладу.",
        "An interest map is a short list of what matters to the other side, sorted by area. "
        "There are usually four areas: money (amount, payment schedule), time (deadlines, "
        "speed), risk (what could go wrong) and peace of mind (hassle, reputation, how it "
        "looks to others).\n\n"
        "The order is this. Do not turn the first answer into an offer — note it and keep "
        "asking. Then name an area you have not touched yet: “And what matters to you about "
        "payments?” Once you have two or three interests, ask which one comes first, and "
        "retell the whole list in one sentence.\n\n"
        "Then sort them. Some interests clash with yours: the rent — the more she gets, the "
        "less you keep. Others do not clash at all: a year-long lease and paying exactly on "
        "time cost you next to nothing. The deal is built on the second kind.\n\n"
        "A hiring example: a candidate asks for a salary above the band. Keep asking, and it "
        "turns out two remote days a week and a clear growth plan matter to them as well. "
        "Remote days and a plan cost the company less than a raise.",
    ),
    phrases=(
        Phrase(
            T("Что для вас важно ещё, кроме цены: чтобы жильцов не пришлось искать заново "
              "или чтобы в квартире был порядок?",
              "Apart from the price, what matters to you — not having the flat stand vacant "
              "again, or peace and quiet?"),
            moves=("interests_probe",), reveals=True,
            when=T("Сразу после первого ответа, вместо предложения.",
                   "Right after the first answer, instead of an offer."),
        ),
        Phrase(
            T("А в оплате что для вас важно: сумма или чтобы деньги приходили день в день?",
              "And what matters most to you about payments — the amount, or money arriving "
              "on the same day every month?"),
            moves=("interests_probe",), reveals=True,
            when=T("Чтобы проверить область, которой собеседник не коснулся.",
                   "To check an area the other side has not mentioned."),
        ),
        Phrase(
            T("Если выбирать одно, что для вас важнее: пустые месяцы или задержки оплаты?",
              "If you had to pick one, what matters more to you: avoiding vacancy or late "
              "payments?"),
            moves=("interests_probe",), reveals=True,
            when=T("Когда интересов набралось несколько — чтобы узнать главный.",
                   "Once you have several interests — to find out which comes first."),
        ),
        Phrase(
            T("Если я верно понял, для вас важны три вещи: чтобы квартира не пустовала, "
              "чтобы было тихо и чтобы оплата приходила вовремя. Я ничего не упустил?",
              "If I understand you right, three things matter to you: the flat never stands "
              "empty, it stays quiet, and the rent arrives on time. Have I missed anything?"),
            moves=("acknowledge",),
            when=T("Перед тем как предлагать: пересказ всей карты.",
                   "Before you make an offer: retell the whole map."),
        ),
    ),
    dialog=Dialog(
        setup=T("Аренда. Наталья просит 75 тысяч в месяц. Вам нужно не дороже 70, а лучше 64.",
                "Renting. Natalia is asking 75k a month. You need 70k at most, and 64k ideally."),
        opening=(
            them("Квартира стоит 75 тысяч. Желающие есть.",
                 "The flat is 75k. There are people interested."),
            you("Что для вас важно в поиске жильцов?",
                "What matters to you about avoiding vacancy?",
                moves=("interests_probe",), reveals=True),
            them("Чтобы квартира не простаивала. Последнего жильца я искала два месяца.",
                 "That the flat does not stand empty. It took me two months to find the last "
                 "tenant."),
        ),
        bad=(
            you("Понял. Тогда подписываю на год — и давайте 65.",
                "Got it. Then I will sign for a year — and let us say 65."),
            them("Год — это хорошо. Но 65 мало, я на это не пойду.",
                 "A year is good. But 65 is too little, I will not go for that."),
            you("Ну хорошо, 68.", "All right, 68."),
        ),
        bad_why=T(
            "Вы узнали один интерес и сразу потратили его: договор на год ушёл в первой же "
            "реплике, а разговор вернулся к цене. Про оплату и тишину вы так и не спросили — "
            "и отдать Наталье, кроме денег, вам больше нечего.",
            "You learned one interest and spent it at once: the year-long lease went out in "
            "the very first line, and the talk slid back to price. You never asked about "
            "payment or quiet — and now you have nothing left to give Natalia except money.",
        ),
        good=(
            you("Понял, пустые месяцы — это главное. А что вас беспокоит в тишине и порядке — "
                "были сложности с прошлыми жильцами?",
                "Got it, empty months come first. And what matters to you about peace and "
                "quiet — have past tenants caused trouble?",
                moves=("interests_probe",), reveals=True),
            them("Были. Соседи жаловались на шум, пришлось извиняться.",
                 "They have. The neighbours complained about noise, I had to apologise."),
            you("А в оплате что для вас важно: сумма или чтобы деньги приходили день в день?",
                "And what matters most to you about payments — the amount, or money arriving "
                "on the same day every month?",
                moves=("interests_probe",), reveals=True),
            them("Чтобы первого числа и без напоминаний. У меня самой платежи в начале месяца.",
                 "On the first, without reminders. My own bills are due at the start of the "
                 "month."),
            you("Сможете ли вы сдать за 64, если я подпишу договор на 11 месяцев и буду "
                "платить первого числа?",
                "If I sign an 11-month lease and pay on the first of every month, would you "
                "come down to 64?",
                moves=("tradeoff",)),
        ),
        good_why=T(
            "Три вопроса — и у вас карта: пустые месяцы, тишина, оплата день в день. Ни один "
            "из этих интересов не требует от вас денег. Договор на 11 месяцев и оплата "
            "первого числа закрывают два из трёх сразу, а спокойный жилец — это вы и так. "
            "Предложение собрано из её интересов, поэтому 64 уже не звучит как торг.",
            "Three questions, and you have a map: empty months, quiet, payment on the day. "
            "None of these interests asks you for money. An 11-month lease and paying on the "
            "first cover two of the three at once, and a quiet tenant is what you are anyway. "
            "The offer is built from her interests, so 64 no longer sounds like haggling.",
        ),
    ),
    mistakes=(
        Mistake(
            T("Остановиться на первом ответе",
              "Stopping at the first answer"),
            T("Первый ответ — самый безопасный для собеседника, а не самый важный. Люди "
              "начинают с того, что не стыдно сказать. Главный интерес часто всплывает вторым "
              "или третьим, когда видно, что вас слушают, а не ловят на слове.",
              "The first answer is the safest one for them to give, not the most important. "
              "People start with what is comfortable to say. The main interest often comes "
              "out second or third, once they see you are listening rather than trying to "
              "catch them out."),
        ),
        Mistake(
            T("Спрашивать «что ещё?» по кругу",
              "Asking “what else?” in circles"),
            T("Три одинаковых «а что ещё для вас важно?» звучат как анкета, и на третий раз "
              "человек ответит «больше ничего». Каждый следующий вопрос называйте новой "
              "областью: оплата, сроки, соседи. Тогда вопрос звучит как интерес к делу, а не "
              "как повтор.",
              "Three identical “what else matters to you?” sound like a survey, and by the "
              "third one the answer is “nothing else”. Give each next question a new area: "
              "payments, timing, neighbours. Then it sounds like interest in the matter, not "
              "like a repeat."),
        ),
        Mistake(
            T("Отдать всё, что узнали, в одной реплике",
              "Giving away everything you learned in one line"),
            T("Узнав про пустые месяцы, вы сразу обещаете год. Это ваш главный козырь, и "
              "отдан он даром — ничего не попросив взамен. Соберите карту целиком, а потом "
              "предлагайте пакет: «договор на год и оплата первого числа — при цене 64».",
              "Hearing about empty months, you promise a year straight away. That was your "
              "best card, and you gave it free — without asking for anything back. Build the "
              "full map first, then offer a package: “a year-long lease and payment on the "
              "first — at 64”."),
        ),
    ),
    limits=(
        Limit(
            T("Собеседник торопится и прямо говорит: «Давайте к цифрам».",
              "The other side is in a hurry and says outright: “Let us get to the numbers.”"),
            T("Не устраивайте опрос. Задайте один вопрос с выбором — «что для вас важнее: "
              "быстро заселить или надёжный жилец?» — и дальше собирайте карту по ходу торга: "
              "каждое «нет» на ваше предложение подсказывает, какой интерес вы не закрыли.",
              "Do not run a survey. Ask one either-or question — “what matters more: filling "
              "the flat fast or a reliable tenant?” — and then build the map as you haggle: "
              "every “no” to your offer tells you which interest you have not covered."),
        ),
        Limit(
            T("Интерес у собеседника действительно один — например, продать срочно и дороже.",
              "The other side really does have only one interest — say, to sell fast and "
              "high."),
            T("Не выдумывайте второй. Если спросили про две-три области и везде слышите "
              "«неважно», переходите к объективным критериям — ценам сопоставимых "
              "предложений — и к своей альтернативе.",
              "Do not invent a second one. If you asked about two or three areas and hear "
              "“does not matter” each time, move to objective criteria — the prices of "
              "comparable offers — and to your alternative."),
        ),
    ),
)
