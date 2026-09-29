"""Давление и возражения · урок 4 — «Анти-гейминг»."""

from app.course.lessons._model import (Dialog, LessonMaterial, Limit, Mistake,
                                       Phrase, T, them, you)

MATERIAL = LessonMaterial(
    block="pressure-defense",
    lesson=4,
    scenario_id="sla_renewal",
    technique=T("Если вас не услышали — сменить тип хода, а не громкость",
                "Not heard? Change the kind of move, not the volume"),
    why=T(
        "Вас не услышали — и тянет сказать то же самое ещё раз, погромче и с нажимом. "
        "Третье «нам нужно 99.8» звучит уже не как довод, а как упрямство, и собеседник "
        "перестаёт слушать совсем. Настойчивость — не аргумент. Приём: если реплика не "
        "сработала, не повторяйте её, а смените сам тип хода.",
        "You were not heard — and you want to say the same thing again, louder and with "
        "more push. The third “we need 99.8” no longer sounds like an argument but like "
        "stubbornness, and the other side stops listening altogether. Persistence is not "
        "an argument. The technique: if a line did not work, do not repeat it — change the "
        "kind of move.",
    ),
    core=T(
        "Типы хода, между которыми стоит переключаться.\n\n"
        "Заявление → вопрос. Вместо «нам нужно 99.8» — «что мешает вашей эксплуатации "
        "держать 99.8?». Вопрос возвращает разговор к собеседнику и приносит новую "
        "информацию.\n\n"
        "Цифра → критерий. Вместо «99.8, и всё» — «отраслевой стандарт для таких систем — "
        "99.9%». Спорить тогда приходится не с вами, а с внешним ориентиром.\n\n"
        "Просьба → размен. Вместо «дайте 99.8» — «если мы продлим договор на три года, "
        "сможете ли вы дать 99.8?». Размен — обмен условиями: вы отдаёте то, что дёшево "
        "вам и ценно ему, и получаете движение (подробно — блок «Размен и создание "
        "ценности»).\n\n"
        "Правило простое: один довод — один раз. Не сработал — второй раз сработает хуже. "
        "Перед тем как повторить, спросите себя: что нового в этой реплике? Если ничего — "
        "меняйте тип.\n\n"
        "Следующий ход должен опираться на ответ, который вы только что получили. Вопрос "
        "дал причину — размен отвечает на эту причину, а не на ваш список.\n\n"
        "В закупках: поставщик дважды отверг «88 рублей за штуку». Третий раз — не «ну "
        "давайте 88», а вопрос: «Что для вас важнее — цена за штуку или загрузка "
        "производства на год вперёд?»",
        "The kinds of move worth switching between.\n\n"
        "Statement → question. Instead of “we need 99.8” — “what is the bottleneck for "
        "your ops team in holding 99.8?”. A question brings the conversation back to the "
        "other side and gets you new information.\n\n"
        "Number → criterion. Instead of “99.8, full stop” — “the industry standard for "
        "systems like this is 99.9%”. Then he is arguing with an outside yardstick, not "
        "with you.\n\n"
        "Request → trade. Instead of “give us 99.8” — “if we renew for three years, would "
        "you move to 99.8?”. A trade is an exchange of terms: you give what is cheap for "
        "you and valuable to him, and get movement in return (in detail — the “Logrolling "
        "& Value Creation” block).\n\n"
        "The rule is simple: one argument, once. If it did not work, it will work worse the "
        "second time. Before you repeat anything, ask yourself: what is new in this line? "
        "If nothing, change the kind of move.\n\n"
        "Your next move should build on the answer you just got. The question gave you a "
        "reason — the trade answers that reason, not your own list.\n\n"
        "In procurement: a supplier has twice turned down “88 roubles a unit”. The third "
        "time is not “come on, 88” but a question: “What matters more to you — the unit "
        "price, or a full production schedule for the year ahead?”",
    ),
    phrases=(
        Phrase(
            T("Я уже дважды назвал 99.8 — давайте я лучше спрошу: что мешает вашей "
              "эксплуатации держать такой уровень?",
              "I have named 99.8 twice now — let me ask instead: what is the bottleneck "
              "for your ops team in holding that level?"),
            moves=("spin_problem",), reveals=True,
            when=T("Заявление → вопрос.", "Statement → question."),
        ),
        Phrase(
            T("Давайте сверимся не с моей цифрой, а с рынком: отраслевой стандарт для таких "
              "систем — 99.9%, у двух других провайдеров в договоре то же.",
              "Let us check this not against my number but against the market: the "
              "industry standard for systems like this is 99.9%, and two other providers "
              "write the same into their contracts."),
            moves=("objective_criteria",),
            when=T("Цифра → критерий.", "Number → criterion."),
        ),
        Phrase(
            T("Если мы продлим договор на три года, сможете ли вы дать 99.8?",
              "If we renew for three years, would you move to 99.8?"),
            moves=("tradeoff",),
            when=T("Просьба → размен.", "Request → trade."),
        ),
        Phrase(
            T("Похоже, я хожу по кругу. Давайте зайду с другой стороны.",
              "It looks like I am going in circles. Let me come at this from another "
              "angle."),
            when=T("Когда поймали себя на повторе: сказать это вслух, прежде чем менять ход.",
                   "When you catch yourself repeating: say so out loud before you switch."),
        ),
    ),
    dialog=Dialog(
        setup=T("Продление SLA. Вы уже дважды сказали «нам нужно 99.8», Виктор оба раза "
                "ответил «нет».",
                "The SLA renewal. You have said “we need 99.8” twice already, and Viktor "
                "said no both times."),
        opening=(
            them("Я слышу это третий раз. Нет.", "That is the third time I have heard "
                 "this. No."),
        ),
        bad=(
            you("Нам нужно 99.8. Нам правда нужно 99.8.",
                "We need 99.8. We really do need 99.8."),
            them("А мне правда нужно 99.5.", "And I really do need 99.5."),
            you("Виктор, я повторю ещё раз: 99.8 — это минимум для нас.",
                "Viktor, I will say it once more: 99.8 is our minimum."),
            them("Повторяйте. Ответ тот же.", "Repeat it all you like. The answer is the "
                 "same."),
        ),
        bad_why=T(
            "Три раза одно и то же — и каждый раз слабее. Повтор не добавляет доводов, он "
            "показывает, что их больше нет. Виктору ничего не нужно опровергать: достаточно "
            "ответить «нет» тем же тоном, и тупик держится сам.",
            "The same thing three times — weaker each time. Repetition adds no arguments; "
            "it shows you have run out of them. Viktor has nothing to rebut: he only has to "
            "say no in the same tone, and the deadlock holds by itself.",
        ),
        good=(
            you("Похоже, я хожу по кругу, — давайте я лучше спрошу: что мешает вашей "
                "эксплуатации держать 99.8?",
                "I seem to be going in circles — let me ask instead: what is the bottleneck "
                "for your ops team in holding 99.8?",
                moves=("spin_problem",), reveals=True),
            them("Ночные смены. Два инженера на всё — один сбой, и мы в штрафах.",
                 "Night shifts. Two engineers for everything — one outage and we are paying "
                 "penalties."),
            you("Понимаю. Если мы продлим договор на три года, вам будет на что нанять "
                "третьего инженера. Сможете ли вы при этом дать 99.8?",
                "I understand. If we renew for three years, you will have the revenue to "
                "hire a third engineer. Would you move to 99.8 on that basis?",
                moves=("acknowledge", "tradeoff")),
            them("Три года… С такой выручкой я третьего инженера выбью. 99.8 — давайте "
                 "обсуждать.",
                 "Three years… With that revenue I can get a third engineer approved. 99.8 — "
                 "let us talk about it."),
        ),
        good_why=T(
            "Вы сами назвали, что пошли по кругу, и сменили тип хода: вместо четвёртого "
            "«нам нужно» — вопрос. Он дал то, чего у вас не было: причину, ночные смены. "
            "Второй ход тоже новый — не просьба, а размен, который отвечает именно на эту "
            "причину. За две реплики вы сказали больше, чем за три повтора.",
            "You called out your own circling and changed the kind of move: a question "
            "instead of a fourth “we need”. It gave you what you did not have: the reason — "
            "night shifts. The second move was new too — not a request but a trade that "
            "answers exactly that reason. Two lines said more than three repeats.",
        ),
    ),
    mistakes=(
        Mistake(
            T("Повторять тот же довод другими словами", "Repeating the same argument in "
              "different words"),
            T("«Нам нужно 99.8» → «для нас критично 99.8» → «без 99.8 никак» — три фразы, по "
              "сути одна, и собеседник это слышит. Новое — это новый тип хода или новая "
              "информация, а не новые слова.",
              "“We need 99.8” → “99.8 is critical for us” → “99.8 or nothing” — three "
              "sentences, one point, and the other side can tell. New means a new kind of "
              "move or new information, not new words."),
        ),
        Mistake(
            T("Добавлять громкость", "Turning up the volume"),
            T("«Правда», «серьёзно», «я вас очень прошу» — нажим без нового содержания "
              "превращает довод в давление, и накал растёт вместе с ним.",
              "“Really”, “seriously”, “I am asking you” — push without new content turns an "
              "argument into pressure, and the tension rises with it."),
        ),
        Mistake(
            T("Менять тип хода по кругу", "Cycling through kinds of move"),
            T("Вопрос, критерий, размен, снова вопрос — механически, не слушая ответов. "
              "Смена типа работает, только если следующий ход опирается на то, что вы "
              "узнали из предыдущего.",
              "Question, criterion, trade, question again — mechanically, without listening "
              "to the answers. Switching works only when the next move builds on what the "
              "previous one taught you."),
        ),
    ),
    limits=(
        Limit(
            T("Вы уже попробовали и вопрос, и критерий, и размен, а ответ всё ещё «нет».",
              "You have tried a question, a criterion and a trade, and the answer is still "
              "no."),
            T("Похоже, вы упёрлись в настоящий предел собеседника. Перестаньте двигать эту "
              "цифру: проверьте другие условия — срок договора, штрафы, объём — или "
              "спокойно, как факт, назовите свою альтернативу.",
              "You have probably hit the other side's real limit. Stop pushing this number: "
              "try other terms — contract length, penalties, volume — or calmly state your "
              "alternative as a fact."),
        ),
        Limit(
            T("Вас действительно не расслышали или не поняли — например, по плохой связи.",
              "You genuinely were not heard or understood — a bad line, for instance."),
            T("Тогда повторить можно и нужно, но проще и короче, и сразу спросить, как "
              "собеседник это понял. Это не повтор довода, а проверка связи.",
              "Then repeating is fine, even necessary — but simpler and shorter, followed by "
              "a question about how they understood it. That is not repeating an argument; "
              "it is checking the connection."),
        ),
    ),
)
