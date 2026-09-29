"""Объективные критерии · урок 1 — «Столкновение мнений против столкновения критериев»."""

from app.course.lessons._model import (Dialog, LessonMaterial, Limit, Mistake,
                                       Phrase, T, them, you)

MATERIAL = LessonMaterial(
    block="objective-criteria",
    lesson=1,
    scenario_id="salary",
    technique=T("Сначала договориться о мерке, потом о цифре",
                "Agree on the yardstick before the number"),
    why=T(
        "Кандидат говорит «я стою больше», директор отвечает «у нас такие бюджеты». Это "
        "два мнения, и проверить нельзя ни одно. Чтобы сдвинуться, кому-то придётся "
        "признать, что он был неправ, — а этого не хочет никто, поэтому спор выигрывает "
        "не тот, кто прав, а тот, кто упрямее. Приём выводит из тупика: вместо того чтобы "
        "спорить о цифре, стороны сначала выбирают мерку, по которой будут считать. "
        "Уступить мерке не стыдно: вы уступаете стандарту, а не человеку.",
        "The candidate says “I am worth more”, the director answers “these are our budgets”. "
        "Those are two opinions, and neither can be checked. To move, someone has to admit "
        "they were wrong — nobody wants to, so the argument goes not to whoever is right but "
        "to whoever is more stubborn. This technique gets you out: instead of arguing about "
        "the number, both sides first choose the yardstick they will measure it by. Giving "
        "way to a yardstick costs no face: you yield to a standard, not to a person.",
    ),
    core=T(
        "Объективный критерий — внешняя мерка, которая не зависит от желаний сторон: "
        "рыночная медиана зарплат по роли, вилки в открытых вакансиях сопоставимых "
        "компаний, отраслевой регламент, прецедент — сколько платили за такую же работу "
        "раньше. Это четвёртый принцип Гарвардского метода: настаивать не на своей цифре, "
        "а на справедливой мерке.\n\n"
        "Как применять. Разговор упёрся в «я считаю — а мы считаем»? Остановите цифры и "
        "предложите договориться, от чего считать. Назовите две-три возможные мерки и "
        "спросите, какую собеседник считает справедливой: если он выберет сам, результат "
        "ему потом легче принять. Если он предлагает свою мерку — не отвергайте её, а "
        "сравните с внешней. Цифры — только после этого, и спор уже не о том, кто прав, а "
        "о том, как правильно применить мерку.\n\n"
        "Пример из закупок: поставщик хочет поднять цену на 12%, вы не хотите поднимать "
        "вовсе. Вместо торга — «давайте привяжем рост цены к отраслевому индексу за год». "
        "Дальше вы обсуждаете, какой индекс уместен, а не кто из вас жаднее.",
        "An objective criterion is an external yardstick that does not depend on what either "
        "side wants: the market median salary for the role, the bands comparable companies "
        "advertise, an industry regulation, a precedent — what was paid for the same work "
        "before. It is the fourth principle of the Harvard method: insist not on your number "
        "but on a fair standard.\n\n"
        "How to use it. The conversation has stalled at “I think — well, we think”? Stop the "
        "numbers and suggest agreeing on what to measure from. Name two or three possible "
        "yardsticks and ask which one the other side considers fair: if they choose, the "
        "result is easier for them to accept later. If they offer their own yardstick, do not "
        "reject it — compare it with an external one. Numbers come only after that, and the "
        "argument is no longer about who is right but about how to apply the standard "
        "properly.\n\n"
        "A procurement example: a supplier wants a 12% price rise and you want none. Instead "
        "of haggling — “let us tie the increase to the industry price index for the year”. "
        "From then on you discuss which index fits, not which of you is greedier.",
    ),
    phrases=(
        Phrase(
            T("Прежде чем спорить о цифре, давайте определимся, от чего считаем: от бюджета "
              "отдела или от рыночной медианы по этой роли?",
              "Before we argue about the number, let us settle what we measure it against: "
              "your team budget, or the market rate for this role?"),
            moves=("objective_criteria",),
            when=T("Когда разговор свёлся к «я считаю — а мы считаем».",
                   "When the talk has come down to “I think — well, we think”."),
        ),
        Phrase(
            T("Какую мерку вы сами считаете справедливой для этой роли: обзоры зарплат, вилки "
              "сопоставимых вакансий или вашу внутреннюю сетку?",
              "Which yardstick do you consider fair for this role: salary surveys, the bands in "
              "comparable openings, or your internal grid?"),
            moves=("objective_criteria",),
        ),
        Phrase(
            T("Я вижу, что мы спорим мнениями: вы считаете, что это дорого, я — что это рынок. "
              "Давайте положим на стол независимые данные.",
              "I can see that we are trading opinions: you think it is expensive, I think it is "
              "the market rate. Let us put independent data on the table."),
            moves=("acknowledge", "objective_criteria"),
        ),
        Phrase(
            T("Я не прошу поверить мне на слово — и сам не хочу принимать цифру на веру. Давайте "
              "опираться на объективные данные, которые можем проверить оба.",
              "I am not asking you to take my word for it, and I would rather not take a figure "
              "on faith either. Let us work from objective data we can both check."),
            moves=("objective_criteria",),
        ),
        Phrase(
            T("Внутренняя сетка — тоже мерка, это логично. Давайте сравним её с медианой по "
              "рынку: если сетка ниже, это вопрос к сетке, а не ко мне.",
              "Your internal grid is a yardstick too, fair point. Let us compare it with the "
              "market rate: if the grid sits below it, that is a question about the grid, not "
              "about me."),
            moves=("acknowledge", "objective_criteria"),
            when=T("Когда собеседник предложил свою мерку.",
                   "When the other side has offered a yardstick of their own."),
        ),
    ),
    dialog=Dialog(
        setup=T("Найм. Дмитрий предлагает 180 тысяч в месяц, вы хотите 230. Он директор и "
                "ценит цифры.",
                "Hiring. Dmitry is offering 180k a month and you want 230k. He is a director "
                "and respects numbers."),
        opening=(
            them("180 — это наш бюджет на позицию. Больше мы не платим.",
                 "180 is our budget for the role. We do not pay more."),
        ),
        bad=(
            you("Я стою больше. У меня хороший опыт, и 180 для меня несправедливо.",
                "I am worth more than that. I have solid experience, and 180 is unfair to me."),
            them("Хороший опыт у всех финалистов. Бюджет есть бюджет.",
                 "Every finalist has solid experience. A budget is a budget."),
            you("Ну хотя бы 210? Мне столько предлагают в другом месте.",
                "Could we at least say 210? That is what I am offered elsewhere."),
            them("Не вижу оснований. 180.", "I see no grounds for it. 180."),
        ),
        bad_why=T(
            "Мнение против мнения: «я стою больше» против «бюджет есть бюджет». Проверить ни "
            "то, ни другое нельзя, а сдвинуться без проигрыша — тоже. Вдобавок вы уже "
            "сбросили 20 тысяч, ничего не получив. Дмитрию нечем объяснить финансам, почему "
            "он заплатил бы больше: вы не дали ему ни одного довода.",
            "Opinion against opinion: “I am worth more” against “a budget is a budget”. "
            "Neither can be checked, and neither side can move without losing. On top of that "
            "you have already dropped 20k and got nothing for it. Dmitry has nothing to show "
            "finance for paying more: you have not given him a single argument.",
        ),
        good=(
            you("Понимаю, у вас есть рамка бюджета. Прежде чем спорить о цифре, давайте "
                "определимся, от чего считаем: от бюджета отдела или от рыночной медианы по "
                "этой роли?",
                "I understand your budget has a frame. Before we argue about the "
                "number, let us settle what we measure it against: your team budget, or the "
                "market rate for this role?",
                moves=("acknowledge", "objective_criteria")),
            them("Вилку мне в любом случае обосновывать перед финансами. Сетка у нас от 170 "
                 "до 200.",
                 "Either way I have to justify the band to finance. Our grid runs from 170 to "
                 "200."),
            you("Тогда давайте сравним сетку с рынком. Медиана по трём независимым обзорам "
                "зарплат для этой роли — 230 тысяч, потому что таких специалистов мало. С этой "
                "цифрой идти к финансам проще, чем с моим «я стою больше».",
                "Then let us compare the grid with the market. The median across three "
                "independent salary surveys for this role is 230k, because people at this "
                "level are scarce. That figure is easier to take to finance than my “I am "
                "worth more”.",
                moves=("objective_criteria",)),
            them("Если это медиана по независимым обзорам, мне есть что показать наверху. "
                 "Пришлите источники.",
                 "If that is the median across independent surveys, I have something to show "
                 "upstairs. Send me the sources."),
        ),
        good_why=T(
            "Вы не спорили с «бюджет есть бюджет», а предложили выбрать мерку. Дмитрий сам "
            "назвал, что ему важно: обосновать вилку перед финансами. Внешний критерий решает "
            "его задачу — с рыночной медианой ему не стыдно идти наверх. Теперь спор не о том, "
            "кто упрямее, а о том, чьи данные точнее.",
            "You did not argue with “a budget is a budget”; you suggested choosing a yardstick. "
            "Dmitry named what matters to him on his own: justifying the band to finance. An "
            "external criterion solves his problem — with a market median he can face his "
            "bosses. Now the argument is not about who is more stubborn but about whose data is "
            "more accurate.",
        ),
    ),
    mistakes=(
        Mistake(
            T("Предложить мерку, выгодную только вам",
              "Offering a yardstick that only suits you"),
            T("Взять единственный источник, где цифра максимальна, — это не критерий, а якорь в "
              "костюме критерия. Собеседник найдёт другой источник, и вы снова спорите "
              "мнениями, только уже о данных. Берите мерку, которую приняли бы, сидя на его "
              "стороне стола.",
              "Picking the one source where the figure is highest is not a criterion — it is an "
              "anchor dressed as one. The other side will find another source and you are back "
              "to trading opinions, only now about data. Choose a yardstick you would accept if "
              "you sat on their side of the table."),
        ),
        Mistake(
            T("Отвергнуть его мерку с порога",
              "Dismissing their yardstick out of hand"),
            T("«Ваша сетка меня не касается» — это снова мнение против мнения. Внутренняя сетка "
              "тоже мерка, просто не единственная. Положите её рядом с внешней и обсуждайте "
              "разницу: так он сам увидит, где его мерка отстаёт.",
              "“Your grid is not my problem” is opinion against opinion again. An internal grid "
              "is a yardstick too, just not the only one. Put it next to an external one and "
              "discuss the gap: that way they see for themselves where their standard lags."),
        ),
        Mistake(
            T("Прятаться за критерий, когда он против вас",
              "Hiding behind the criterion when it goes against you"),
            T("Мерка работает в обе стороны. Если данные показали меньше, чем вы хотели, а вы "
              "продолжаете стоять на своём, вы сами превратили критерий обратно в мнение — и "
              "следующим вашим данным уже не поверят.",
              "A yardstick cuts both ways. If the data comes out lower than you hoped and you "
              "keep standing your ground, you have turned the criterion back into an opinion — "
              "and your next data will not be believed."),
        ),
    ),
    limits=(
        Limit(
            T("Мерки для вопроса нет: новая роль, которой нет на рынке, уникальная вещь или "
              "дело вкуса.",
              "There is no yardstick for the question: a brand-new role, a one-of-a-kind item, "
              "or a matter of taste."),
            T("Договоритесь о справедливой процедуре вместо цифры: оклад сейчас и пересмотр "
              "через полгода по KPI, мнение третьего эксперта, пробный период. Процедура — тоже "
              "критерий, только не «сколько», а «как решаем».",
              "Agree on a fair procedure instead of a figure: base pay now and a review tied to "
              "KPIs in six months, a third expert's view, a trial period. A procedure is a "
              "criterion too — it answers “how we decide” rather than “how much”."),
        ),
        Limit(
            T("Собеседник не спорит о справедливости, он просто сильнее: «Не нравится — не "
              "подписывайте».",
              "The other side is not arguing about fairness; they are simply stronger: “If you "
              "do not like it, do not sign.”"),
            T("Критерий не заменит рычага. Опора здесь — ваша альтернатива: спокойно назовите "
              "её и решите, есть ли вообще зона сделки. Это блок «BATNA и ZOPA».",
              "A criterion does not replace leverage. Here your footing is your alternative: "
              "name it calmly and decide whether there is a deal zone at all. That is the "
              "“BATNA & ZOPA” block."),
        ),
    ),
)
