"""Слушание и деэскалация · урок 4 — «Что взрывает стол»."""

from app.course.lessons._model import (Dialog, LessonMaterial, Limit, Mistake,
                                       Phrase, T, them, you)

MATERIAL = LessonMaterial(
    block="active-listening",
    lesson=4,
    scenario_id="conflict",
    technique=T("Заменить удар на ход и вернуть разговор, если сорвались",
                "Swap the jab for a move, and recover if you slipped"),
    why=T(
        "Под давлением тянет ответить ударом: съязвить, поставить ультиматум, повторить "
        "своё громче. Это приносит облегчение на полминуты и стоит всей сделки: человек, "
        "которого задели, перестаёт уступать, даже если вы правы. Хуже того, нажим даёт "
        "ощущение силы и одновременно отнимает возможность ею воспользоваться. Приём: "
        "знать три вещи, которые взрывают разговор, держать наготове замену каждой и "
        "уметь вернуть разговор, если сорвались сами.",
        "Under pressure you want to hit back: a dig, an ultimatum, the same point again "
        "but louder. It feels good for thirty seconds and costs you the deal: a person who "
        "has been stung stops giving ground, even when you are right. Worse, pressure "
        "gives you a feeling of strength and takes away your ability to use it in the "
        "same breath. The technique: know the three things that blow a conversation up, "
        "keep a replacement ready for each, and know how to bring the talk back if you "
        "slip yourself.",
    ),
    core=T(
        "Грубость — это оценка человека, а не предмета: «вы не умеете планировать», «это "
        "смешно», «вы не понимаете». Замена — факт и его последствие: «Модуль пришёл без "
        "тестов, и мы потеряли на этом три дня». Спорить с фактом можно, обижаться на "
        "него — нет.\n\n"
        "Ультиматум — «либо… либо», «моё последнее слово». Он не оставляет места для "
        "движения ни вам, ни ему: уступить после ультиматума — значит проиграть лицо. "
        "Замена — условие: «если мы возьмём на себя тестирование, сможете ли вы "
        "уложиться в десять дней?» Условие даёт ему выбор, ультиматум — только "
        "капитуляцию.\n\n"
        "Повтор — одно и то же громче. Он слышится как упрямство, а не как довод. "
        "Замена — другой тип хода: вопрос вместо заявления.\n\n"
        "Если сорвались сами: признать конкретную реплику коротко, без самобичевания, и "
        "сразу вернуться к делу. «Я сказал резко, это было лишнее. Вернусь к сути…» "
        "Извинение за тон — не уступка по существу: срок, который вы защищали, остаётся "
        "тем же.\n\n"
        "С подрядчиком так же: вместо «вы опять всё сорвали» — «второй этап сдвинулся на "
        "неделю; что нам сделать, чтобы третий не сдвинулся?»",
        "Rudeness is a verdict on the person rather than the subject: “you cannot plan”, "
        "“this is a joke”, “you just do not get it”. The replacement is a fact and its "
        "consequence: “The module arrived without tests, and we lost three days on it.” You "
        "can argue with a fact; you cannot take offence at it.\n\n"
        "An ultimatum is “either… or”, “my final word”. It leaves no room to move for "
        "either of you: giving way after an ultimatum means losing face. The replacement "
        "is a condition: “if we take over the testing, can you move to ten days?” A "
        "condition gives him a choice; an ultimatum gives him only surrender.\n\n"
        "Repetition is the same thing, louder. It comes across as stubbornness, not as an "
        "argument. The replacement is a different kind of move: a question instead of a "
        "statement.\n\n"
        "If you slip yourself: name the specific line briefly, without beating yourself "
        "up, and go straight back to the matter. “That was too sharp of me, and "
        "unnecessary. Back to the point…” Apologising for your tone is not a concession on "
        "substance: the date you were defending stays the same.\n\n"
        "The same goes for a contractor: instead of “you have wrecked it again” — “stage "
        "two has slipped by a week; what do we need to do so that stage three does not?”",
    ),
    phrases=(
        Phrase(
            T("Модуль пришёл без тестов, и мы потеряли на этом три дня. Давайте разберём, "
              "как этого избежать в следующий раз.",
              "The module arrived without tests, and we lost three days on it. Let us work "
              "out how to avoid that next time."),
            when=T("Вместо «вы не умеете работать»: факт и последствие.",
                   "Instead of “you cannot do your job”: a fact and its consequence."),
        ),
        Phrase(
            T("Если мы возьмём на себя тестирование, сможете ли вы уложиться в десять дней?",
              "If we take over the testing, can you move to ten days?"),
            moves=("tradeoff",),
            when=T("Вместо ультиматума: условие вместо «либо — либо».",
                   "Instead of an ultimatum: a condition instead of “either — or”."),
        ),
        Phrase(
            T("Я, похоже, повторяюсь. Спрошу иначе: что мешает вашей команде уложиться в "
              "десять дней?",
              "I think I am repeating myself. Let me ask differently: what is the "
              "bottleneck for your team in hitting ten days?"),
            moves=("spin_problem",), reveals=True,
            when=T("Вместо третьего повтора: вопрос.",
                   "Instead of saying it a third time: a question."),
        ),
        Phrase(
            T("Я сказал резко, это было лишнее. Вернусь к сути: нам нужен план, с которым "
              "вы спокойно пойдёте к руководству.",
              "That was too sharp of me, and unnecessary. Back to the point: we need a plan "
              "you can take to leadership with a clear conscience."),
            when=T("Если сорвались сами.", "If you slipped yourself."),
        ),
    ),
    dialog=Dialog(
        setup=T("Конфликт отделов. Алексей в третий раз требует двадцать дней сдвига. Вы "
                "устали, и вам нужно не больше двенадцати.",
                "A cross-team conflict. Alexey demands a twenty-day slip for the third time. "
                "You are tired, and you need twelve at most."),
        opening=(
            them("Я вам уже сказал: двадцать дней. Меньше не будет.",
                 "I have told you already: twenty days. It will not be less."),
        ),
        bad=(
            you("Это смешно. Вы просто не умеете планировать.",
                "This is a joke. You simply cannot plan.",
                moves=("hostile",)),
            them("Ах, это я не умею? Тогда двадцать пять.",
                 "Oh, so I am the one who cannot plan? Then twenty-five."),
            you("Десять дней — моё последнее слово. Иначе иду к директору.",
                "Ten days, take it or leave it. Otherwise I go to the director.",
                moves=("threat",)),
            them("Идите куда хотите.", "Go wherever you like."),
        ),
        bad_why=T(
            "Первой репликой вы оценили его, а не план, — и он тут же отыграл назад: было "
            "двадцать, стало двадцать пять. Второй вы поставили ультиматум, и он закрылся "
            "совсем. Даже если директор встанет на вашу сторону, работать дальше с "
            "Алексеем вам, а этот разговор он запомнит.",
            "With your first line you passed judgement on him rather than the plan — and he "
            "walked it straight back: twenty became twenty-five. With the second you issued "
            "an ultimatum, and he shut down completely. Even if the director sides with you, "
            "you still have to work with Alexey, and he will remember this conversation.",
        ),
        good=(
            you("Я, похоже, повторяюсь. Спрошу иначе: что мешает вашей команде уложиться в "
                "десять дней?",
                "I think I am repeating myself. Let me ask differently: what is the "
                "bottleneck for your team in hitting ten days?",
                moves=("spin_problem",), reveals=True),
            them("Людей мало. Двое на больничном.", "Too few people. Two are off sick."),
            you("Понимаю. Если мы возьмём на себя тестирование, сможете ли вы уложиться в "
                "десять дней?",
                "I understand. If we take over the testing, can you move to ten days?",
                moves=("acknowledge", "tradeoff")),
            them("Без тестирования… Двенадцать — точно, десять — попробуем.",
                 "Without the testing… Twelve for sure, ten we can try."),
        ),
        good_why=T(
            "Вы заметили, что пошли по кругу, сказали это вслух и сменили тип хода: вместо "
            "заявления — вопрос. Вопрос вскрыл причину — нехватку людей. Под неё вы "
            "предложили условие, а не ультиматум. Алексей начал двигаться сам, и работать "
            "вместе вы сможете и после этого разговора.",
            "You noticed you were going round in circles, said so out loud, and changed the "
            "kind of move: a question instead of a statement. The question uncovered the "
            "reason — a shortage of people. You answered it with a condition, not an "
            "ultimatum. Alexey started moving on his own, and you can still work together "
            "after this conversation.",
        ),
    ),
    mistakes=(
        Mistake(
            T("Считать сарказм не грубостью", "Not counting sarcasm as rudeness"),
            T("«Ну конечно, у вас всегда уважительные причины» — та же оценка человека, "
              "только завёрнутая в шутку. Слышат её так же, как прямую грубость, а "
              "обижаются часто сильнее.",
              "“Of course, you always have a good excuse” is the same verdict on the person, "
              "only wrapped in a joke. It lands the same way as open rudeness, and often "
              "stings more."),
        ),
        Mistake(
            T("Извиниться за суть вместе с тоном", "Apologising for the substance along with "
              "the tone"),
            T("«Простите, я был неправ, пусть будут ваши двадцать дней». Извинение за "
              "резкость — да; отказ от позиции в придачу — нет. Это разные вещи, и первое "
              "не требует второго.",
              "“Sorry, I was wrong, let us go with your twenty days.” An apology for being "
              "sharp — yes; dropping your position into the bargain — no. These are "
              "different things, and the first does not require the second."),
        ),
        Mistake(
            T("Угрожать вежливо", "Threatening politely"),
            T("«Не хотелось бы доводить до директора…» — это ультиматум в вежливой "
              "обёртке, и он действует так же. Если альтернативу нужно назвать, называйте "
              "её как факт, без «или — или» (блок «BATNA и ZOPA»).",
              "“I would hate for this to end up with the director…” is an ultimatum in "
              "polite wrapping, and it works the same way. If you need to mention your "
              "alternative, state it as a fact, without “either — or” (the “BATNA & ZOPA” "
              "block)."),
        ),
    ),
    limits=(
        Limit(
            T("Грубит и провоцирует сам собеседник.",
              "The other side is the one being rude and provoking."),
            T("Не отвечайте тем же и не делайте вид, что ничего не случилось. Назовите "
              "поведение и предложите правило: «Давайте без оценок друг друга — так быстрее "
              "договоримся». Если не помогает, перенесите встречу.",
              "Do not answer in kind, and do not pretend nothing happened. Name the "
              "behaviour and suggest a rule: “Let us leave out judgements of each other — "
              "we will agree faster that way.” If that does not help, reschedule the "
              "meeting."),
        ),
        Limit(
            T("Нужно сказать жёсткое «нет» — например, назвать свою красную линию.",
              "You need to deliver a hard “no” — for instance, to state your red line."),
            T("Жёсткость в содержании не требует жёсткости в тоне. Скажите границу спокойно "
              "и с причиной: «Больше двенадцати дней мы взять не можем: у нас релиз "
              "пятнадцатого». Твёрдо — не значит грубо.",
              "Firm substance does not need a harsh tone. State the limit calmly, with a "
              "reason: “We cannot take more than twelve days: our release is on the "
              "fifteenth.” Firm does not mean rude."),
        ),
    ),
)
