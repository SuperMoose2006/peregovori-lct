"""Объективные критерии · урок 3 — «Критерий как броня для уступки»."""

from app.course.lessons._model import (Dialog, LessonMaterial, Limit, Mistake,
                                       Phrase, T, them, you)

MATERIAL = LessonMaterial(
    block="objective-criteria",
    lesson=3,
    scenario_id="salary",
    technique=T("Уступать только к цифре с источником",
                "Only move toward a number with a source behind it"),
    why=T(
        "Любая уступка без объяснения говорит собеседнику одно: «надавите ещё — сдвинусь "
        "снова». Поэтому люди либо не двигаются вовсе, и разговор встаёт, либо уступают по "
        "чуть-чуть и в итоге отдают всё. Приём даёт третий путь: двигаться можно, но только "
        "к цифре, за которой стоит мерка. Тогда уступка выглядит не как слабость, а как "
        "точность. И то же правило даёт собеседнику повод сдвинуться самому, не проиграв.",
        "Any concession without a reason tells the other side one thing: “push again and I "
        "will move again”. So people either do not move at all and the talks stall, or they "
        "give ground bit by bit and end up giving everything. This technique is a third way: "
        "you may move, but only toward a number with a yardstick behind it. Then a concession "
        "looks like precision, not weakness. And the same rule gives the other side a way to "
        "move without losing.",
    ),
    core=T(
        "Правило работает в обе стороны.\n\n"
        "Для себя. Прежде чем сдвинуться, назовите, к чему вы двигаетесь. Не «ладно, 230», а "
        "«если брать медиану, а не верхнюю границу рынка, выходит 230 — на неё я готов». "
        "Вторая фраза закрывает торг на этой точке: чтобы опустить вас ниже, собеседнику "
        "нужна новая мерка, а не ещё одно «ну пожалуйста».\n\n"
        "Для него. Дайте собеседнику уступить стандарту, а не вам: «Если свежий обзор "
        "покажет 230 — берём 230, покажет меньше — соглашусь на меньше». Человеку, который "
        "отчитывается наверх — финансам, собственнику, совету директоров, — нужно "
        "объяснение для своих. Критерий и есть это объяснение: он может сказать «так "
        "показал рынок», а не «так меня дожал кандидат».\n\n"
        "Одно условие: правило проверки назначают ДО того, как узнали результат. Иначе "
        "проигравший всегда найдёт, почему «этот обзор не про нас».\n\n"
        "Со сроками подрядчика то же самое: не «ладно, сдвигайте на месяц», а «берём "
        "нормативный срок монтажа из регламента плюс вашу реальную загрузку — сколько "
        "выйдет, на столько и сдвигаем».",
        "The rule cuts both ways.\n\n"
        "For you. Before you move, name what you are moving toward. Not “fine, 230”, but “if "
        "we take the median rather than the top of the market, it comes to 230 — I can go "
        "there”. The second line closes the haggling at that point: to push you lower, the "
        "other side now needs a new yardstick, not another “oh, come on”.\n\n"
        "For them. Let the other side give way to a standard rather than to you: “If a fresh "
        "survey shows 230, we take 230; if it shows less, I will take less.” Someone who "
        "reports upward — to finance, an owner, a board — needs an explanation for their own "
        "people. A criterion is that explanation: they can say “that is what the market "
        "showed”, not “the candidate squeezed me”.\n\n"
        "One condition: the checking rule is set BEFORE anyone knows the result. Otherwise the "
        "losing side will always find a reason why “that survey does not apply to us”.\n\n"
        "A contractor's deadline works the same way: not “fine, slip it a month”, but “we take "
        "the standard installation time from the regulation plus your actual workload — "
        "whatever that comes to is the slip”.",
    ),
    phrases=(
        Phrase(
            T("Если свежий независимый обзор покажет 230 — давайте брать 230. Покажет меньше — "
              "я соглашусь на меньше.",
              "If a fresh independent survey shows 230, let us go with 230. If it shows less, I "
              "will take less."),
            moves=("objective_criteria",),
            when=T("Когда хотите дать собеседнику уступить стандарту, а не вам.",
                   "When you want the other side to yield to a standard rather than to you."),
        ),
        Phrase(
            T("Давайте заранее договоримся: берём медиану по трём независимым обзорам, какой "
              "бы она ни оказалась, и к цифре больше не возвращаемся.",
              "Let us settle it in advance: we take the median of three independent surveys, "
              "whatever it turns out to be, and do not reopen the figure."),
            moves=("objective_criteria",),
            when=T("До того, как кто-то из вас открыл данные.",
                   "Before either of you has looked at the data."),
        ),
        Phrase(
            T("Готов сдвинуться, но не на глаз: если брать медиану, а не верхнюю границу "
              "рыночной вилки, выходит 230. Ниже медианы у меня оснований нет.",
              "I am ready to move, but not by guesswork: if we use the median benchmark rather "
              "than the top of the range, it comes to 230. Below the median I have no grounds."),
            moves=("objective_criteria",),
        ),
        Phrase(
            T("Вам ведь эту цифру защищать перед финансами — давайте дадим им то, с чем не "
              "поспоришь: три независимых обзора по этой роли.",
              "You will have to defend this figure to finance — let us give them something "
              "they cannot argue with: three independent surveys for this role."),
            moves=("objective_criteria",),
        ),
        Phrase(
            T("Сдвинуться ещё я могу только к другой цифре из источника. Если у вас есть "
              "независимые данные ниже медианы — покажите, я честно посмотрю.",
              "I can only move again toward another figure with a source behind it. If you have "
              "benchmark data below the median, show me and I will look at it honestly."),
            moves=("objective_criteria",),
            when=T("Когда вас просят подвинуться ещё, ничего не объясняя.",
                   "When you are asked to move again with no reason given."),
        ),
    ),
    dialog=Dialog(
        setup=T("Найм, середина разговора. Вы назвали 235 — верхнюю границу по обзорам "
                "зарплат. Дмитрий держит 200.",
                "Hiring, midway through. You named 235 — the top of the range in the salary "
                "surveys. Dmitry is holding at 200."),
        opening=(
            them("235 я финансам не продам. Давайте 200 — и закончим.",
                 "I cannot sell 235 to finance. Let us say 200 and be done."),
        ),
        bad=(
            you("Ну хорошо, давайте 220. Это моя последняя уступка.",
                "All right, let us say 220. That is my last concession."),
            them("Вы уже сдвинулись на пятнадцать. Может, и до 210 дойдём?",
                 "You have already moved fifteen. Maybe we can get to 210?"),
        ),
        bad_why=T(
            "Уступка без причины — приглашение давить дальше. Дмитрий понял главное: ваша "
            "цифра движется от нажима, а «последняя уступка» — просто слова. И финансам он "
            "по-прежнему несёт не довод, а «кандидат сдвинулся» — такой разговор наверху не "
            "заканчивается, а только начинается.",
            "A concession with no reason is an invitation to push harder. Dmitry has learned "
            "the key thing: your number moves under pressure, and “last concession” is just "
            "words. And he still has no argument for finance, only “the candidate moved” — a "
            "conversation that does not end upstairs, it only starts there.",
        ),
        good=(
            you("Понимаю, вам нужно объяснить цифру финансам. Давайте я помогу: если брать не "
                "верхнюю границу, а медиану по трём независимым обзорам, выходит 230. На "
                "медиану я готов сдвинуться, ниже неё у меня нет оснований.",
                "I understand you need to explain the figure to finance. Let me help: if we use "
                "the median of three independent surveys rather than the top of the range, it "
                "comes to 230. I am ready to move to the median; below it I have no grounds.",
                moves=("acknowledge", "objective_criteria")),
            them("С медианой по трём обзорам я к финансам пойти могу. Пришлите источники.",
                 "With the median of three surveys I can go to finance. Send me the sources."),
        ),
        good_why=T(
            "Вы сдвинулись — но к точке, у которой есть имя: медиана. Ниже неё дороги нет, и "
            "Дмитрий это понимает, потому что правило общее. Заодно вы дали ему то, что нужно "
            "ему самому, — объяснение для финансов. Он соглашается не с вами, а с данными, и "
            "наверху ему не стыдно.",
            "You moved — but to a point with a name: the median. There is no road below it, and "
            "Dmitry understands that, because the rule is shared. You also gave him what he "
            "himself needs — an explanation for finance. He is agreeing with the data, not with "
            "you, and he has nothing to be embarrassed about upstairs.",
        ),
    ),
    mistakes=(
        Mistake(
            T("Уступать «на глаз» или «посередине»",
              "Moving by feel, or “splitting the difference”"),
            T("Середина между двумя случайными цифрами тоже случайна. Каждый такой шаг учит "
              "собеседника, что давление работает, и следующий шаг он потребует так же — без "
              "причины.",
              "The midpoint between two arbitrary numbers is arbitrary too. Every step like "
              "that teaches the other side that pressure works, and they will ask for the next "
              "one the same way — with no reason."),
        ),
        Mistake(
            T("Выбирать мерку после того, как увидели результат",
              "Choosing the yardstick after seeing the result"),
            T("Если сначала посмотреть цифру, а потом решать, годится ли источник, проигравшая "
              "сторона всегда найдёт повод его отвергнуть. Правило «какой результат что "
              "значит» — до проверки, вслух.",
              "If you look at the number first and decide afterwards whether the source is "
              "valid, the losing side will always find a reason to reject it. The rule for what "
              "each result means is set before the check, out loud."),
        ),
        Mistake(
            T("Подать критерий как победу",
              "Presenting the criterion as a victory"),
            T("«Данные на моей стороне, так что спорить не о чем» — даже верный критерий, "
              "поданный как ваш выигрыш, заставляет человека проиграть публично. Говорите "
              "«давайте опираться на данные», а не «я доказал».",
              "“The data is on my side, so there is nothing to discuss” — even a sound criterion, "
              "served up as your win, forces the other person to lose in public. Say “let us go "
              "by the data”, not “I have proved it”."),
        ),
    ),
    limits=(
        Limit(
            T("Критерии противоречат друг другу: один обзор даёт 210, другой 245, и каждая "
              "сторона тянет к своему.",
              "The criteria contradict each other: one survey says 210, another 245, and each "
              "side pulls toward its own."),
            T("Не спорьте, чей обзор лучше, — договоритесь о правиле: медиана всех, самый "
              "свежий, среднее двух ближайших к роли. Разница делится по правилу, а не по "
              "усталости.",
              "Do not argue about whose survey is better — agree on a rule: the median of all, "
              "the most recent, the average of the two closest to the role. The gap is split by "
              "rule, not by fatigue."),
        ),
        Limit(
            T("Цифра из источника ниже вашей красной линии — самой худшей цены, на которую вы "
              "ещё готовы согласиться.",
              "The sourced figure is below your red line — the worst price you would still "
              "accept."),
            T("Критерий не обязывает подписывать. Скажите спокойно, что на таких условиях не "
              "можете, и обсуждайте другое: бонус, пересмотр через полгода, объём задач. Если "
              "и это не помогает, ваша альтернатива лучше этой сделки.",
              "A criterion does not oblige you to sign. Say calmly that you cannot on these "
              "terms and discuss other things: a bonus, a review in six months, the scope of "
              "the role. If that does not help either, your alternative beats this deal."),
        ),
    ),
)
