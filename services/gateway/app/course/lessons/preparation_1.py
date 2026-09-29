"""Подготовка к столу · урок 1 — «Лист подготовки: четыре строки»."""

from app.course.lessons._model import (Dialog, LessonMaterial, Limit, Mistake,
                                       Phrase, T, them, you)

MATERIAL = LessonMaterial(
    block="preparation",
    lesson=1,
    scenario_id="salary",
    technique=T("Лист подготовки: четыре строки до разговора",
                "The prep sheet: four lines before the conversation"),
    why=T(
        "Подготовку обычно понимают как «настроиться». Человек приходит без цифр, первое же "
        "предложение собеседника становится для него точкой отсчёта, а красную линию он "
        "придумывает прямо за столом — под давлением и в пользу собеседника. Итог — "
        "согласие на условие, которое вчера он бы не принял. Лист подготовки лечит это: "
        "четыре строки, написанные до встречи, заранее решают то, что за столом решать "
        "нельзя.",
        "Preparation usually means “getting in the right frame of mind”. People arrive "
        "without numbers, the other side's first offer becomes their reference point, and "
        "they invent their red line on the spot — under pressure and in the other side's "
        "favour. The result is agreeing to terms they would have refused yesterday. The prep "
        "sheet cures this: four lines written before the meeting settle in advance what "
        "must not be decided at the table.",
    ),
    core=T(
        "Четыре строки на одной странице.\n\n"
        "Цель — чего вы хотите добиться, с опорой на внешний источник: «230 тысяч — медиана "
        "независимых обзоров зарплат на эту роль».\n\n"
        "Красная линия — худшее условие, на которое вы ещё согласитесь: «195 тысяч». Ниже "
        "неё сделка хуже, чем отказ от неё.\n\n"
        "Альтернатива — что вы сделаете, если здесь не договоритесь: «второй оффер на 210, "
        "проект скучнее». Альтернатива объясняет, почему красная линия стоит там, где стоит: "
        "ниже 195 второй оффер выгоднее даже со скучным проектом.\n\n"
        "Темы интересов собеседника — области, где лежит то, что ему важно: «бюджет "
        "отдела», «сроки найма», «согласование с финансами». Что именно ему важно, вы не "
        "знаете, но знаете, куда спрашивать.\n\n"
        "Между красной линией и целью лежит весь ваш выигрыш: сделка ровно на красной линии — "
        "ноль, на цели — полный результат, и каждая тысяча между ними на счету. Поэтому "
        "красная линия назначается до разговора и за столом не двигается. Хочется её "
        "подвинуть — это сигнал взять паузу, а не уступить.\n\n"
        "Тот же лист работает в закупках: цель по цене за штуку, предел, запасной поставщик, "
        "темы — объём, оплата, срок контракта.",
        "Four lines on a single page.\n\n"
        "Target — what you want to achieve, backed by an outside source: “230k — the median "
        "of independent salary surveys for this role”.\n\n"
        "Red line — the worst term you would still accept: “195k”. Below it, the deal is "
        "worse than no deal.\n\n"
        "Alternative — what you will do if you do not agree here: “a second offer at 210, "
        "duller project”. The alternative explains why the red line sits where it does: "
        "below 195 the second offer wins even with the duller project.\n\n"
        "Topics of their interests — the areas where what matters to them lies: “team "
        "budget”, “hiring timeline”, “finance approval”. You do not know exactly what they "
        "care about, but you know where to ask.\n\n"
        "Everything you can win lies between the red line and the target: a deal right on "
        "the red line counts as zero, one on target as the full result, and every thousand "
        "in between counts. That is why the red line is set before the conversation and "
        "does not move at the table. If you feel like moving it, that is your cue to take a "
        "break, not to give way.\n\n"
        "The same sheet works in procurement: a target price per unit, a limit, a fallback "
        "supplier, and the topics — volume, payment, contract term.",
    ),
    phrases=(
        Phrase(
            T("Моя цель — 230 тысяч: столько по медиане независимых обзоров зарплат платят на "
              "такую роль.",
              "My target is 230k: that is the median of independent salary surveys for this "
              "role."),
            moves=("objective_criteria",),
            when=T("Строка «цель» — и готовый довод, когда разговор дойдёт до цифры.",
                   "The “target” line — and a ready argument once the talk turns to numbers."),
        ),
        Phrase(
            T("Красная линия — 195: ниже неё второй оффер на 210 выгоднее, даже с учётом "
              "скучного проекта.",
              "Red line: 195. Below that, my second offer at 210 is the better deal, dull "
              "project and all."),
            when=T("Строка для себя. Вслух красную линию не называют.",
                   "A line for yourself. The red line is never said out loud."),
        ),
        Phrase(
            T("Дмитрий, как у вас устроено согласование с финансами — вилку на эту роль уже "
              "утвердили?",
              "Dmitry, how do you currently handle finance approval — has the band for this "
              "role been signed off yet?"),
            moves=("spin_situation",), reveals=True,
            when=T("Строка «темы» превращается в первый вопрос.",
                   "The “topics” line turns into your first question."),
        ),
        Phrase(
            T("Эту цифру мне нужно сверить со своими расчётами. Давайте я вернусь к вам "
              "завтра утром.",
              "I need to check that figure against my own numbers. Let me come back to you "
              "tomorrow morning."),
            when=T("Когда предложение ниже красной линии и вас торопят с ответом.",
                   "When an offer is below your red line and you are being rushed."),
        ),
    ),
    dialog=Dialog(
        setup=T("Найм. Вы получили оффер и обсуждаете зарплату с Дмитрием, директором. Первый "
                "вариант — без листа подготовки, второй — с ним.",
                "Hiring. You have an offer and are discussing salary with Dmitry, the "
                "director. The first version is without a prep sheet, the second with one."),
        opening=(
            them("Мы готовы предложить 180 тысяч. Это хорошие деньги для рынка.",
                 "We are prepared to offer 180k. That is good money for the market."),
        ),
        bad=(
            you("Ну... А можно хотя бы 200 тысяч?", "Well... could we make it at least 200k?"),
            them("200 — это верх вилки. Могу 190, и это последнее.",
                 "200 is the top of the band. I can do 190, and that is final."),
            you("Ладно, 190 так 190. Договорились.", "All right, 190 then. We have a deal.",
                moves=("accept",)),
        ),
        bad_why=T(
            "Без листа вы не знали ни своей цели, ни своей границы. Первое предложение — 180 — "
            "стало точкой отсчёта, 200 вы попросили наугад, а 190 приняли, хотя это ниже "
            "вашей красной линии в 195: второй оффер был выгоднее. Решение, которое надо было "
            "принять дома, приняли за столом за десять секунд.",
            "Without the sheet you knew neither your target nor your limit. The first offer — "
            "180 — became your reference point, you asked for 200 at random, and accepted 190 "
            "even though it is below your 195 red line: the second offer was the better deal. "
            "A decision that belonged at home was made at the table in ten seconds.",
        ),
        good=(
            you("Спасибо за предложение. Прежде чем обсуждать цифру, спрошу: как у вас "
                "устроено согласование с финансами — вилку на эту роль уже утвердили?",
                "Thank you for the offer. Before we discuss the figure, may I ask: how do you "
                "currently handle finance approval — has the band for this role been signed "
                "off?",
                moves=("spin_situation",), reveals=True),
            them("Утвердили. Но всё, что выше середины вилки, мне придётся объяснять "
                 "финансовому директору.",
                 "It has. But anything above the middle of the band I will have to explain to "
                 "the finance director."),
            you("Тогда дам вам объяснение: по медиане независимых обзоров зарплат такая роль "
                "стоит 230 тысяч. С этой цифрой вам будет что показать финансам.",
                "Then let me give you the explanation: the median of independent salary "
                "surveys for this role is 230k. That is a figure you can show finance.",
                moves=("objective_criteria",)),
            them("С обзорами спорить сложно. Давайте посмотрим, что можно сделать.",
                 "Surveys are hard to argue with. Let us see what can be done."),
        ),
        good_why=T(
            "С листом у вас было всё: цель с опорой — 230 и медиана обзоров; граница — 195, "
            "поэтому 180 не пугает и не соблазняет; тема «согласование с финансами» стала "
            "первым вопросом. Дмитрий назвал свою трудность, и ваша цель легла на неё как "
            "решение: вы дали ему то, что он покажет финансам.",
            "With the sheet you had everything: a backed target — 230 and the survey median; a "
            "limit — 195, so 180 neither scares nor tempts you; the topic “finance approval” "
            "became your first question. Dmitry named his difficulty, and your target landed "
            "on it as a solution: you gave him something to show finance.",
        ),
    ),
    mistakes=(
        Mistake(
            T("Прийти только с целью", "Arriving with a target only"),
            T("Цель без красной линии — мечта: за столом она тает по тысяче, и непонятно, где "
              "остановиться. Нужны обе строки — куда стремитесь и где уходите.",
              "A target without a red line is a wish: at the table it melts a thousand at a "
              "time, and you do not know where to stop. You need both lines — where you are "
              "heading and where you walk away."),
        ),
        Mistake(
            T("Назначить красную линию по первому предложению",
              "Setting the red line from their first offer"),
            T("«Раз предлагают 180, соглашусь от 190» — теперь вашу границу задаёт "
              "собеседник. Красная линия считается от вашей альтернативы, а не от его цифры.",
              "“They offer 180, so I will take anything from 190” — now the other side sets "
              "your limit. The red line is worked out from your alternative, not from their "
              "number."),
        ),
        Mistake(
            T("Двигать красную линию в разговоре", "Moving the red line mid-conversation"),
            T("Если её можно подвинуть за столом, это была не красная линия, а настроение. "
              "Новые факты — повод взять паузу и пересчитать, а не уступить на месте.",
              "If it can be moved at the table, it was never a red line — it was a mood. New "
              "facts are a reason to take a break and recalculate, not to give way on the "
              "spot."),
        ),
    ),
    limits=(
        Limit(
            T("Нет времени готовиться: разговор через пять минут.",
              "No time to prepare: the conversation starts in five minutes."),
            T("Напишите хотя бы две строки — красную линию и один вопрос по теме собеседника. "
              "Всё остальное можно выяснить за столом, а границу — нельзя.",
              "Write at least two lines — your red line and one question on the other side's "
              "topic. Everything else can be found out at the table; your limit cannot."),
        ),
        Limit(
            T("Вы не знаете рынок и не можете поставить цель с опорой.",
              "You do not know the market and cannot set a backed target."),
            T("Не выдумывайте цель. Первую встречу посвятите вопросам, отдайте первое слово "
              "собеседнику, а цель поставьте после — когда будет с чем сравнить.",
              "Do not invent one. Spend the first meeting asking questions, let the other "
              "side name a number first, and set your target afterwards — once you have "
              "something to compare against."),
        ),
    ),
)
