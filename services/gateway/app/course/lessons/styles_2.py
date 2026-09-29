"""Стиль собеседника · урок 2 — «Что стиль удорожает и что удешевляет»."""

from app.course.lessons._model import (Dialog, LessonMaterial, Limit, Mistake,
                                       Phrase, T, them, you)

MATERIAL = LessonMaterial(
    block="styles",
    lesson=2,
    scenario_id="candidate_offer",
    technique=T("Говорить одно и то же на языке собеседника",
                "Say the same thing in the other side's language"),
    why=T(
        "Приём, который обычно работает, с конкретным человеком может обойтись очень "
        "дорого. Упомянуть второго кандидата — нормальный ход на переговорах, но "
        "человек, для которого главное отношения, услышит «вас легко заменить». "
        "Поставить жёсткие сроки — нормально, но жёсткий собеседник воспримет это как "
        "вызов. Ошибка тут не в приёме, а в цене: вы платите за ход больше, чем он "
        "приносит, и не замечаете этого, пока человек не закроется.",
        "A move that usually works can cost a great deal with one particular person. "
        "Mentioning a second candidate is a normal negotiating move, but someone who "
        "puts the relationship first hears “you are easy to replace”. Setting a hard "
        "deadline is normal, but a tough counterpart takes it as a challenge. The "
        "mistake is not the move, it is the price: you pay more for it than it brings, "
        "and you do not notice until the person shuts down.",
    ),
    core=T(
        "У каждого стиля есть ход, который с ним дорожает.\n\n"
        "Аналитик. Дорого стоят слова без данных: «поверьте, это хорошая цифра» он "
        "просто не засчитает. Зато источник и расчёт с ним работают сильнее, чем с "
        "кем-либо.\n\n"
        "Человек отношений. Дорого стоит названная альтернатива. «У нас есть другие "
        "кандидаты» для него значит «вы нам не очень нужны», и напряжение растёт "
        "сильнее, чем с остальными.\n\n"
        "Жёсткий. Дорого стоит ультиматум: он отвечает своим, и разговор становится "
        "перетягиванием каната.\n\n"
        "Скидки за стиль не бывает. Жёсткость с жёстким не становится дешевле, тепло с "
        "аналитиком не заменяет расчёта. Поэтому содержание предложения остаётся тем же, "
        "меняется упаковка. Пример — одно и то же предложение Тимуру: 235 тысяч и "
        "план развития до архитектора. Аналитику: «235 — медиана по трём обзорам, план "
        "развития — с датами и критериями». Человеку отношений: «нам важно, чтобы вы "
        "здесь выросли: вот план до архитектора и наставник». Жёсткому: «наша рамка — "
        "235 по рынку; внутри неё добавим план развития».",
        "Each style has a move that gets expensive with it.\n\n"
        "The analytical one. Words without data cost a lot: “trust me, it is a good "
        "number” simply does not count with them. Sources and calculations, on the "
        "other hand, work harder with them than with anyone.\n\n"
        "The relationship one. A named alternative costs a lot. “We have other "
        "candidates” means to them “we do not really need you”, and tension climbs "
        "further than with anyone else.\n\n"
        "The tough one. An ultimatum costs a lot: they answer with one of their own, and "
        "the talk turns into a tug of war.\n\n"
        "There is no style discount. Toughness with a tough person does not get cheaper, "
        "and warmth with an analyst does not replace the numbers. So the substance of "
        "the offer stays the same; the packaging changes. Take one offer to Timur: 235k "
        "and a development plan toward architect. To an analyst: “235 is the median of "
        "three surveys; the plan comes with dates and criteria.” To a relationship "
        "person: “we want you to grow here: here is the path to architect, and a "
        "mentor.” To a tough one: “our frame is 235 by the market; within it we add the "
        "development plan.”",
    ),
    phrases=(
        Phrase(
            T("235 — это медиана по трём независимым обзорам для этой роли. Расчёт могу "
              "показать.",
              "235 is the median of three independent surveys for this role. I can show "
              "you the calculation."),
            moves=("objective_criteria",),
            when=T("Аналитику: цифра всегда вместе с источником.",
                   "For the analytical one: the number always comes with its source."),
        ),
        Phrase(
            T("Нам важно, чтобы через год вы были здесь и росли. Что для вас важно в "
              "карьере у нас?",
              "We want you to be here in a year's time, and growing. What matters most "
              "to you about your career with us?"),
            moves=("interests_probe",), reveals=True,
            when=T("Человеку отношений: сначала о нём и о будущем.",
                   "For the relationship one: them and the future first."),
        ),
        Phrase(
            T("Понимаю вашу позицию. Предлагаю опереться на рыночные данные, а не на наши с "
              "вами мнения.",
              "I understand your position. Let us go by the data — independent market "
              "benchmarks — rather than by your opinion or mine."),
            moves=("acknowledge", "objective_criteria"),
            when=T("Жёсткому: признать рамку и увести спор от «кто упрямее».",
                   "For the tough one: acknowledge the frame and take the argument away "
                   "from “who is more stubborn”."),
        ),
        Phrase(
            T("Я хочу закрыть позицию именно с вами, поэтому давайте найдём вариант, "
              "который вам подходит.",
              "I want to fill this role with you specifically, so let us find an option "
              "that works for you."),
            when=T("Вместо упоминания второго кандидата — сказать, чего хотите вы.",
                   "Instead of mentioning a second candidate — say what you want."),
        ),
        Phrase(
            T("Если мы добавим план развития до архитектора и наставника, сможете ли вы "
              "выйти на 235?",
              "If we add a development plan toward architect and a mentor, can you move "
              "to 235?"),
            moves=("tradeoff",),
            when=T("Одинаково годится для всех трёх: размен понятен каждому.",
                   "Works the same for all three: everyone understands a trade."),
        ),
    ),
    dialog=Dialog(
        setup=T("Найм. Тимур — человек отношений, второго оффера у него нет. У вас в финале "
                "ещё двое кандидатов. Цель — 230–235 тысяч.",
                "Hiring. Timur is a relationship person with no rival offer. You still "
                "have two other finalists. Target: 230–235k."),
        opening=(
            them("Для меня важно, чтобы это было надолго. На прошлом месте меня сократили "
                 "без предупреждения.",
                 "It matters to me that this is for the long run. At my last job I was "
                 "let go without warning."),
        ),
        bad=(
            you("Скажу честно: у нас есть альтернатива, в финале ещё двое. Поэтому давайте "
                "без долгих торгов.",
                "To be honest, we do have an alternative — two more finalists. So let us "
                "not haggle for long.",
                moves=("batna",)),
            them("Понятно. То есть меня легко заменить. Мне надо подумать.",
                 "I see. So I am easy to replace. I need to think about it."),
        ),
        bad_why=T(
            "Альтернатива настоящая, и в разговоре с жёстким собеседником её упоминание "
            "могло бы сработать. Но Тимур только что сказал, чего боится: снова оказаться "
            "лишним. Ваша фраза попала ровно в этот страх. Вы заплатили доверием, а "
            "получили человека, который теперь ищет подвох в каждом пункте оффера.",
            "The alternative is real, and with a tough counterpart mentioning it might "
            "have worked. But Timur had just said what he fears: being surplus again. "
            "Your line hit exactly that fear. You paid with trust and got a person who now "
            "looks for a catch in every line of the offer.",
        ),
        good=(
            you("Понимаю, после такого сокращения хочется уверенности. Что для вас важно, "
                "чтобы чувствовать себя здесь стабильно?",
                "I understand, after being laid off like that you want certainty. What "
                "matters most to you to feel secure here?",
                moves=("acknowledge", "interests_probe"), reveals=True),
            them("Понятный план и короткий испытательный срок. Тогда я спокоен.",
                 "A clear plan and a short probation. Then I can relax."),
            you("Тогда так: испытательный срок сокращаем, план развития до архитектора "
                "пишем вместе. Если так, сможете ли вы выйти на 235?",
                "Then here is the idea: we shorten the probation and write the "
                "development plan toward architect together. On that basis, can you move "
                "to 235?",
                moves=("tradeoff",)),
            them("С таким планом — да, давайте обсуждать.",
                 "With a plan like that — yes, let us talk."),
        ),
        good_why=T(
            "Вы не упомянули альтернативу вовсе — она и так работала на вас, потому что "
            "придавала спокойствия. Вместо этого вы отозвались на его страх и спросили, "
            "что его снимет. Тимур сам назвал условия, которые стоят компании немного, и "
            "цифру вы обсуждаете уже внутри пакета.",
            "You never mentioned the alternative — it worked for you anyway, by keeping "
            "you calm. Instead you answered his fear and asked what would ease it. Timur "
            "named terms that cost the company little, and now you discuss the number "
            "inside a package.",
        ),
    ),
    mistakes=(
        Mistake(
            T("Смягчить до потери сути",
              "Softening until nothing is left"),
            T("Подстройка под человека отношений не значит убрать цифру. Цифру называют, "
              "только в его рамке: «чтобы вам здесь было спокойно, мы предлагаем…». Без "
              "цифры разговор остаётся приятным и ничем не заканчивается.",
              "Adapting to a relationship person does not mean dropping the number. You "
              "still name it, just inside their frame: “so that you can feel settled here, "
              "we offer…”. Without a number the talk stays pleasant and leads nowhere."),
        ),
        Mistake(
            T("Засыпать аналитика цифрами без вывода",
              "Burying the analyst in numbers with no conclusion"),
            T("Десять показателей подряд аналитик воспримет как попытку спрятать слабое "
              "место. Ему нужен один источник, одна цифра и вывод: «поэтому 235». "
              "Остальное — по его вопросу.",
              "Ten figures in a row read to an analyst as an attempt to hide the weak spot. "
              "They need one source, one number and a conclusion: “hence 235”. The rest — "
              "when they ask."),
        ),
        Mistake(
            T("Ждать скидки за жёсткость",
              "Expecting a discount for toughness"),
            T("«Он жёсткий, значит, поймёт ультиматум» — нет. Жёсткий уважает силу, но на "
              "ультиматум отвечает своим, и оба оказываются в углу. Сила с ним — спокойная "
              "рамка и данные.",
              "“He is tough, so he will respect an ultimatum” — no. A tough counterpart "
              "respects strength but answers an ultimatum with one of their own, and both "
              "of you end up cornered. Strength with them is a calm frame and data."),
        ),
    ),
    limits=(
        Limit(
            T("Сроки действительно горят, и сказать о них нужно даже человеку отношений.",
              "The deadline really is tight, and you have to say so even to a relationship "
              "person."),
            T("Говорите о своём ограничении, а не о его заменимости: «мне нужно закрыть "
              "позицию до конца месяца — давайте решим до пятницы». В закупках так же: "
              "не «найдём другого поставщика», а «у нас правило двух поставщиков, и я "
              "хочу, чтобы основным были вы».",
              "Talk about your constraint, not their replaceability: “I need to fill the "
              "role by the end of the month — can we decide by Friday?” The same in "
              "procurement: not “we will find another supplier” but “we have a two-supplier "
              "rule, and I want you to be the main one.”"),
        ),
        Limit(
            T("Стиль не читается, а говорить надо уже сейчас.",
              "You cannot read the style, and you have to speak now."),
            T("Говорите на языке данных и вопросов: источник с цифрой и вопрос о том, что "
              "важно, не дорожают ни с одним стилем. Альтернативу и сроки придержите, "
              "пока не поймёте, с кем говорите.",
              "Speak the language of data and questions: a sourced number and a question "
              "about what matters get expensive with no style. Hold back the alternative "
              "and the deadline until you know who you are dealing with."),
        ),
    ),
)
