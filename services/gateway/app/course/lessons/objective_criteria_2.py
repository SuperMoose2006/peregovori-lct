"""Объективные критерии · урок 2 — «Что считается критерием»."""

from app.course.lessons._model import (Dialog, LessonMaterial, Limit, Mistake,
                                       Phrase, T, them, you)

MATERIAL = LessonMaterial(
    block="objective-criteria",
    lesson=2,
    scenario_id="salary",
    technique=T("Ставить цифру на проверяемый источник",
                "Stand your number on a checkable source"),
    why=T(
        "Многим кажется, что они аргументируют, когда говорят «я стою больше», «это "
        "несправедливо» или «у всех знакомых выше». Для собеседника это не довод, а "
        "мнение, и ответить на него можно только другим мнением. Хуже того: так вы сами "
        "показываете, что опоры у вас нет. Приём — пропускать каждый довод через три "
        "простых вопроса, прежде чем сказать его вслух, и оставлять только то, что их "
        "прошло.",
        "Many people believe they are making a case when they say “I am worth more”, “this "
        "is unfair” or “everyone I know earns more”. To the other side that is not an "
        "argument but an opinion, and the only answer to an opinion is another opinion. "
        "Worse, it shows you have nothing to stand on. The technique: run every argument "
        "through three simple questions before you say it out loud, and keep only what "
        "passes.",
    ),
    core=T(
        "Критерий — это источник, который одновременно:\n\n"
        "Внешний — не зависит ни от вас, ни от собеседника. Проверяемый — его можно "
        "открыть, пересчитать и показать начальству. С цифрой — даёт число или диапазон, а "
        "не впечатление.\n\n"
        "Что годится: обзоры зарплат по роли и региону, вилки в открытых вакансиях "
        "сопоставимых компаний, прецедент — сколько платили на такую же позицию в прошлом "
        "году, отраслевой регламент, прайсы нескольких поставщиков на одну и ту же позицию. "
        "Что не годится: «я стою больше» — мнение о себе; «у знакомых выше» — не "
        "проверить, и выборка случайная; «несправедливо» — эмоция; «мне платить ипотеку» — "
        "ваш интерес, а не мерка: его можно назвать, чтобы вас поняли, но довод для "
        "работодателя он не заменит.\n\n"
        "Три вопроса перед тем, как сказать: откуда цифра? Может ли он её проверить? Принял "
        "бы я этот источник, если бы он говорил против меня? Сама фраза собирается из трёх "
        "частей: цифра, источник и почему он уместен здесь — «230, медиана трёх независимых "
        "обзоров, потому что роль и регион те же».\n\n"
        "В закупках то же самое: «дорого» — мнение, а «три прайса на ту же позицию — 86, 88 "
        "и 90 рублей» — критерий.",
        "A criterion is a source that is all three at once:\n\n"
        "External — it depends neither on you nor on the other side. Checkable — it can be "
        "opened, recalculated and shown to a boss. Numeric — it gives a figure or a range, "
        "not an impression.\n\n"
        "What qualifies: salary surveys by role and region, the bands comparable companies "
        "advertise, a precedent — what was paid for the same role last year, an industry "
        "regulation, several suppliers' price lists for the same item. What does not: “I am "
        "worth more” is an opinion about yourself; “people I know earn more” cannot be "
        "checked and is a random sample; “unfair” is a feeling; “I have a mortgage to pay” "
        "is your interest, not a yardstick — say it so they understand you, but it will not "
        "stand in for an argument to an employer.\n\n"
        "Three questions before you speak: where does the number come from? Can they check "
        "it? Would I accept this source if it argued against me? The line itself has three "
        "parts: the number, the source, and why the source fits — “230, the median of three "
        "independent surveys, because the role and region match”.\n\n"
        "Procurement works the same way: “too expensive” is an opinion, “three price lists "
        "for the same part say 86, 88 and 90” is a criterion.",
    ),
    phrases=(
        Phrase(
            T("По трём независимым обзорам зарплат медиана для этой роли в нашем регионе — "
              "230 тысяч.",
              "Three independent salary surveys put the median for this role in our region at "
              "230k."),
            moves=("objective_criteria",),
        ),
        Phrase(
            T("В открытых вакансиях сопоставимых компаний на эту роль пишут до 240 тысяч, в "
              "среднем — 230. Могу прислать ссылки.",
              "Comparable companies advertise this role at up to 240k, 230k on average. I can "
              "send you the links."),
            moves=("objective_criteria",),
            when=T("Диапазон называйте с того края, который нужен вам: собеседник запомнит "
                   "первую цифру.",
                   "Quote a range from the end that suits you: the other side remembers the "
                   "first number."),
        ),
        Phrase(
            T("В прошлом году вы закрывали такую же позицию — это хороший прецедент для нас "
              "обоих. На какой цифре тогда сошлись?",
              "You filled the same role last year — that is a fair precedent for both of us. "
              "What figure did you land on then?"),
            moves=("objective_criteria",),
            when=T("Когда у собеседника есть своя история найма на эту роль.",
                   "When the other side has hired for this role before."),
        ),
        Phrase(
            T("А на что опирается ваша вилка? Если это независимый обзор, давайте положим наши "
              "источники рядом.",
              "And what is your band based on? If it comes from an independent survey, let us "
              "put our sources side by side."),
            moves=("objective_criteria",),
            when=T("Когда цифру назвал он, а источник — нет.",
                   "When they named a number but no source."),
        ),
    ),
    dialog=Dialog(
        setup=T("Найм. Дмитрий предлагает 180 тысяч, вы хотите 230. Он спрашивает, на чём "
                "основана ваша цифра.",
                "Hiring. Dmitry is offering 180k and you want 230k. He asks what your number "
                "is based on."),
        opening=(
            them("Мы готовы на 180. Объясните, почему должно быть больше.",
                 "We are ready to pay 180. Explain why it should be more."),
        ),
        bad=(
            you("Я стою больше. У меня восемь лет опыта, и все мои знакомые на таких позициях "
                "получают больше.",
                "I am worth more than that. I have eight years of experience, and everyone I "
                "know in roles like this earns more."),
            them("Опыт есть у всех финалистов. А ваших знакомых я не знаю.",
                 "Every finalist has experience. And I do not know the people you know."),
        ),
        bad_why=T(
            "Три довода — и ни одного, который Дмитрий может проверить или показать финансам. "
            "«Я стою больше» — мнение, восемь лет опыта есть у каждого второго финалиста, "
            "«знакомые» — случайная выборка. Ему остаётся только вежливо не согласиться, и он "
            "это делает.",
            "Three arguments and not one Dmitry can check or show to finance. “I am worth "
            "more” is an opinion, eight years of experience is what half the finalists have, "
            "“people I know” is a random sample. All he can do is politely disagree, and he "
            "does.",
        ),
        good=(
            you("Я опираюсь не на своё мнение. По трём независимым обзорам зарплат медиана для "
                "этой роли — 230 тысяч, потому что специалистов такого уровня на рынке мало. "
                "Могу прислать все три.",
                "I am not relying on my own opinion. Three independent salary surveys put the "
                "median for this role at 230k, because people at this level are scarce. I can "
                "send you all three.",
                moves=("objective_criteria",)),
            them("Три обзора — это уже разговор. Нашу вилку, если честно, считали по данным "
                 "двухлетней давности. Пришлите, посмотрю.",
                 "Three surveys is something to work with. To be honest, our band was set on "
                 "data from two years ago. Send them over and I will look."),
        ),
        good_why=T(
            "Цифра, источник и причина — в одной реплике, и источник можно проверить. Дмитрий "
            "аналитик: такой довод он может пересчитать и сам же донести до финансов. В ответ "
            "он честно показал слабое место своей вилки — старые данные. Теперь спорят не люди, "
            "а источники, и свежие данные сильнее старых.",
            "The number, the source and the reason in one line — and the source can be checked. "
            "Dmitry is an analyst: he can recalculate an argument like that and take it to "
            "finance himself. In return he honestly showed the weak spot in his band — old "
            "data. Now the sources are arguing, not the people, and fresh data beats old.",
        ),
    ),
    mistakes=(
        Mistake(
            T("Слова критерия без цифры",
              "The words of a criterion with no number"),
            T("«По рынку это дёшево», «стандарт индустрии выше» звучит как критерий, но без "
              "числа и источника это то же мнение. Аналитик спросит «какой рынок? какой "
              "стандарт?» — и довод рассыплется. Цифра и источник всегда идут вместе.",
              "“That is cheap for the market”, “the industry standard is higher” sounds like a "
              "criterion, but with no number and no source it is the same opinion. An analyst "
              "will ask “which market? which standard?” and the argument falls apart. The "
              "number and the source always come together."),
        ),
        Mistake(
            T("Назвать самый выгодный источник и промолчать про остальные",
              "Quoting the best source and keeping quiet about the rest"),
            T("В двух обзорах 210, в одном 250, а вы назвали только 250. Это вскроется, и после "
              "этого вам не поверят ни в одной цифре. Называйте диапазон и медиану: честная "
              "середина убеждает сильнее удобного максимума.",
              "Two surveys say 210, one says 250, and you quote only the 250. It will come out, "
              "and after that none of your numbers will be believed. Give the range and the "
              "median: an honest middle convinces better than a convenient top."),
        ),
        Mistake(
            T("Путать свой интерес с критерием",
              "Mistaking your interest for a criterion"),
            T("«Мне нужно закрыть ипотеку» объясняет, зачем вам деньги, но не почему "
              "работодатель должен их платить. Интерес стоит назвать, чтобы вас поняли, — "
              "аргументом цены он от этого не станет.",
              "“I need to pay off my mortgage” explains why you want the money, not why the "
              "employer should pay it. It is worth saying so they understand you — it still "
              "will not become an argument for the price."),
        ),
    ),
    limits=(
        Limit(
            T("Данных нет или они противоречат друг другу: новая роль, редкий стек, закрытый "
              "рынок.",
              "There is no data, or it contradicts itself: a new role, a rare stack, a closed "
              "market."),
            T("Не выдумывайте цифру. Соберите ближайшие аналоги и назовите метод, а не число: "
              "«похожих ролей три, считал так». Или предложите процедуру вместо цифры: оклад "
              "сейчас и пересмотр через полгода по KPI.",
              "Do not invent a figure. Gather the closest analogues and name the method rather "
              "than the number: “there are three similar roles, here is how I worked it out”. "
              "Or offer a procedure instead of a figure: base pay now and a KPI review in six "
              "months."),
        ),
        Limit(
            T("Источник собеседника сильнее вашего — свежее и ближе к делу.",
              "The other side's source is stronger than yours — fresher and closer to the "
              "case."),
            T("Признайте это и двигайтесь к его цифре. Держать позицию вопреки лучшим данным "
              "значит превратить критерий обратно в упрямство. Стойте там, где ваши данные "
              "сильнее, а не везде.",
              "Admit it and move toward their number. Holding out against better data turns "
              "the criterion back into stubbornness. Stand firm where your data is stronger, "
              "not everywhere."),
        ),
    ),
)
