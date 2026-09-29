"""Подготовка к столу · урок 4 — «Кто называет цифру первым»."""

from app.course.lessons._model import (Dialog, LessonMaterial, Limit, Mistake,
                                       Phrase, T, them, you)

MATERIAL = LessonMaterial(
    block="preparation",
    lesson=4,
    scenario_id="salary",
    technique=T("Решить заранее, кто первым называет цифру",
                "Decide in advance who names the first number"),
    why=T(
        "Вопрос «сколько вы хотите?» застаёт врасплох, и человек называет цифру, придуманную "
        "на ходу: чаще всего заниженную и ничем не подкреплённую. Она сразу становится "
        "потолком — выше того, что вы сами попросили, вам не дадут. Бывает и наоборот: "
        "человек мнётся и отдаёт первое слово, хотя ему было чем его взять. Приём переносит "
        "это решение туда, где его можно принять спокойно, — в подготовку.",
        "“So what are you looking for?” catches people off guard, and they name a figure "
        "made up on the spot: usually too low and backed by nothing. It instantly becomes "
        "the ceiling — nobody will give you more than you asked for yourself. The opposite "
        "happens too: someone hesitates and hands over the first word when they had every "
        "reason to take it. This technique moves the decision to where it can be made "
        "calmly — into your preparation.",
    ),
    core=T(
        "Первая названная цифра тянет разговор к себе, но только если у неё есть опора — "
        "внешний источник: обзор зарплат, рыночная медиана, сопоставимые предложения. Голая "
        "цифра не тянет ничего, она лишь сообщает собеседнику ваши ожидания.\n\n"
        "Отсюда правило на одну строку листа подготовки: есть критерий — берите первое "
        "слово; нет критерия — отдайте его.\n\n"
        "Берут первое слово так: цифра и критерий в одной реплике, в самом начале "
        "разговора о деньгах. «Моё предложение — 230, потому что это медиана независимых "
        "обзоров зарплат на такую роль». Рамка разговора сдвигается к вам ещё до всякой "
        "уступки, и дальше торг идёт от вашей цифры, а не от его.\n\n"
        "Отдают первое слово тоже словами, а не молчанием, — вопросом о рамке собеседника: "
        "«Прежде чем назову свою цифру, хочу понять вашу рамку: какую вилку вы заложили на "
        "эту позицию?» Его ответ станет для вас данными, а свою цифру вы назовёте, когда "
        "будет на что её поставить.\n\n"
        "Если на вас давят, а критерия нет, честно скажите, что хотите сверить цифру с "
        "рынком, и верните вопрос. Это дешевле, чем якорь, который никуда не тянет.\n\n"
        "В закупках так же: есть на руках три коммерческих предложения — открывайтесь "
        "цифрой по их медиане. Нет — попросите поставщика назвать цену первым.",
        "The first number named pulls the conversation towards it — but only if it has "
        "backing: an outside source such as a salary survey, a market median, comparable "
        "offers. A bare number pulls nothing; it just tells the other side what you "
        "expect.\n\n"
        "Hence a one-line rule for your prep sheet: if you have a criterion, take the first "
        "word; if you do not, hand it over.\n\n"
        "You take the first word like this: the number and the criterion in one line, right "
        "at the start of the money conversation. “My offer is 230, because that is the "
        "median of independent salary surveys for this role.” The frame of the talk shifts "
        "your way before any concession, and the haggling then runs from your number rather "
        "than theirs.\n\n"
        "You hand the first word over with words too, not with silence — by asking about "
        "their frame: “Before I name my figure, I would like to understand your frame: what "
        "band have you set for this role?” Their answer becomes your data, and you name your "
        "own figure once you have something to stand it on.\n\n"
        "If you are pressed and have no criterion, say honestly that you want to check the "
        "figure against the market, and hand the question back. That is cheaper than an "
        "anchor that pulls nowhere.\n\n"
        "The same holds in procurement: if you have three written quotes, open with a figure "
        "at their median. If not, ask the supplier to name a price first.",
    ),
    phrases=(
        Phrase(
            T("Критерий есть: три независимых обзора зарплат, медиана 230. Значит, первое "
              "слово беру я.",
              "I have a criterion: three independent salary surveys, median 230. So I take "
              "the first word."),
            moves=("objective_criteria",),
            when=T("Строка листа подготовки — решение до разговора.",
                   "A line on the prep sheet — the decision made before the talk."),
        ),
        Phrase(
            T("Моё предложение — 230, потому что это медиана независимых обзоров зарплат на "
              "такую роль.",
              "My offer is 230, because that is the median of independent salary surveys for "
              "this role."),
            moves=("anchor", "objective_criteria"),
            when=T("Критерий есть: первой же репликой о деньгах.",
                   "You have a criterion: in your very first line about money."),
        ),
        Phrase(
            T("Прежде чем назову свою цифру, хочу понять вашу рамку: какую вилку вы заложили "
              "на эту позицию?",
              "Before I name my figure, I would like to understand your frame: what band have "
              "you set for this role?"),
            moves=("open_question",),
            when=T("Критерия нет: отдайте первое слово вопросом.",
                   "No criterion: hand over the first word with a question."),
        ),
        Phrase(
            T("Точную цифру я пока не готов назвать: сначала хочу сверить её с рынком. Какой "
              "диапазон вы видите для этой роли?",
              "I am not ready to name an exact figure yet: I want to check it against the "
              "market first. What range do you see for this role?"),
            moves=("open_question",),
            when=T("На вас давят, а критерия нет.",
                   "You are being pressed and have no criterion."),
        ),
    ),
    dialog=Dialog(
        setup=T("Найм. Дмитрий начинает разговор о деньгах и отдаёт первое слово вам. На руках "
                "у вас три независимых обзора зарплат с медианой 230.",
                "Hiring. Dmitry opens the money conversation and hands the first word to you. "
                "You have three independent salary surveys with a median of 230."),
        opening=(
            them("Давайте начнём с ваших ожиданий. Сколько вы хотите?",
                 "Let us start with your expectations. What are you looking for?"),
        ),
        bad=(
            you("Ну, хотелось бы 200 тысяч.", "Well, I was hoping for something like 200k."),
            them("200? Думаю, это мы потянем.", "200? I think we can manage that."),
        ),
        bad_why=T(
            "Цифра придумана на ходу: ниже вашей цели и без опоры. Дмитрий согласился сразу, и "
            "это худший знак: вы попросили меньше, чем он готов был обсуждать. Подняться выше "
            "названного вами же теперь почти невозможно, а обзоры с медианой 230 так и "
            "остались в папке.",
            "The figure was made up on the spot: below your target and with nothing behind "
            "it. Dmitry agreed at once, and that is the worst sign: you asked for less than he "
            "was ready to discuss. Getting above your own number now is almost impossible, and "
            "the surveys with their 230 median never left your folder.",
        ),
        good=(
            you("Моё предложение — 230, потому что это медиана независимых обзоров зарплат на "
                "такую роль.",
                "My offer is 230, because that is the median of independent salary surveys "
                "for this role.",
                moves=("anchor", "objective_criteria")),
            them("Высоко. Но с обзорами спорить сложно. Давайте разбираться, что можно "
                 "сделать.",
                 "That is high. But surveys are hard to argue with. Let us work out what can "
                 "be done."),
        ),
        good_why=T(
            "Решение было принято заранее: критерий есть — значит, первое слово ваше. Цифра и "
            "источник прозвучали одной репликой, и разговор пошёл от 230, а не от того, что "
            "собирался предложить Дмитрий. Спорить ему приходится не с вашим желанием, а с "
            "обзорами: для него это труднее, для вас спокойнее.",
            "The decision was made in advance: you have a criterion, so the first word is "
            "yours. The number and its source came in a single line, and the conversation "
            "started from 230 rather than from whatever Dmitry had planned to offer. He now "
            "has to argue with the surveys, not with your wishes — harder for him, calmer for "
            "you.",
        ),
    ),
    mistakes=(
        Mistake(
            T("Назвать голую цифру первым", "Naming a bare number first"),
            T("Без критерия первая цифра не тянет разговор к вам, а раскрывает ваши "
              "ожидания — часто заниженные. Нет опоры — отдайте первое слово.",
              "Without a criterion, the first number does not pull the talk your way; it "
              "just reveals your expectations — often too low ones. No backing, no first "
              "word."),
        ),
        Mistake(
            T("Отдать первое слово молчанием", "Handing over the first word with silence"),
            T("Пауза и «ну, не знаю» выглядят как неуверенность, и собеседник называет цифру "
              "пониже. Отдавайте словами — вопросом о его рамке.",
              "A pause and “well, I am not sure” look like uncertainty, and the other side "
              "names a lower number. Hand it over with words — a question about their frame."),
        ),
        Mistake(
            T("Назвать широкий коридор", "Naming a wide range"),
            T("«От 200 до 240» слышится как «200»: собеседник возьмёт нижний край. Первым "
              "называют одну цифру и её основание.",
              "“Between 200 and 240” is heard as “200”: the other side takes the bottom end. "
              "Open with one number and what it rests on."),
        ),
    ),
    limits=(
        Limit(
            T("Вы плохо знаете рынок, а собеседник знает его хорошо.",
              "You know the market poorly and the other side knows it well."),
            T("Первое слово за ним. Выслушайте цифру, не соглашайтесь и не спорьте на месте, "
              "спросите, от чего она посчитана, и возьмите время сверить её с независимыми "
              "источниками.",
              "Let them go first. Hear the number out, neither agree nor argue on the spot, "
              "ask what it was calculated from, and take time to check it against independent "
              "sources."),
        ),
        Limit(
            T("Собеседник уже назвал свою цифру раньше вас.",
              "The other side has already named their number before you."),
            T("Первое слово потрачено — не отвечайте встречной крайностью. Спросите, на чём "
              "стоит его цифра, предложите внешний критерий и ставьте свою цифру внутри него; "
              "подробно — в уроке блока про якорь «Защита: не контр-цифра».",
              "The first word is spent — do not answer with an opposite extreme. Ask what "
              "their number rests on, offer an outside criterion and place your number inside "
              "it; the anchoring block covers this in “Defence is not a counter-number”."),
        ),
    ),
)
