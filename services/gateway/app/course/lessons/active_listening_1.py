"""Слушание и деэскалация · урок 1 — «Назвать чувство, не соглашаясь»."""

from app.course.lessons._model import (Dialog, LessonMaterial, Limit, Mistake,
                                       Phrase, T, them, you)

MATERIAL = LessonMaterial(
    block="active-listening",
    lesson=1,
    scenario_id="conflict",
    technique=T("Назвать чувство собеседника, не признавая вины",
                "Name their feeling without accepting the blame"),
    why=T(
        "Когда на вас нападают — «это ваша команда сорвала сроки», — первая реакция "
        "защищаться: «это не наша вина, посмотрите на факты». Собеседник слышит в этом "
        "«вы не правы» и давит сильнее: теперь ему надо доказать, что ему действительно "
        "тяжело. Разговор уходит в спор о том, кто виноват, и о новом плане никто не "
        "говорит. Приём простой: назвать вслух то, что с человеком происходит, — не "
        "признавая вины и ничего не уступая. Злость, которую назвали, спадает быстрее, "
        "чем злость, которую оспорили.",
        "When you are attacked — “your team blew the deadline” — the first reflex is to "
        "defend yourself: “that is not our fault, look at the facts”. The other side hears "
        "“you are wrong” and pushes harder: now they have to prove it really is hard for "
        "them. The conversation turns into a fight about who is to blame, and nobody talks "
        "about the new plan. The technique is simple: say out loud what is happening to "
        "the person — without admitting fault and without giving anything away. Anger that "
        "has been named cools faster than anger that has been argued with.",
    ),
    core=T(
        "Отделить человека от проблемы — значит говорить о его положении отдельно от "
        "предмета спора. Чувство и давление, под которым он находится, вы признаёте. "
        "Требование — сроки, цену, вину — нет. Это две разные темы, и смешивать их не "
        "нужно.\n\n"
        "Формула: «Я вижу, что…» или «Я слышу, что…» плюс то, что видно по фактам: на "
        "него давит руководство, ему докладывать, сроки горят у него. Потом точка. Не "
        "«понимаю, но…» — «но» зачёркивает всё, что было до него. Следующей фразой — "
        "вопрос или предложение перейти к делу.\n\n"
        "Чем приём не является: это не согласие («да, мы виноваты»), не извинение за то, "
        "чего вы не делали, и не уступка. «Я вижу, что на вас давит руководство» — факт о "
        "нём, а не признание о вас.\n\n"
        "Второй пример: подрядчик, который строит цех резиденту ОЭЗ, сорвал этап и "
        "говорит, что вы поздно дали чертежи. «Слышу, что вы на нервах: бригада стоит, и "
        "платить за простой вам». Вы назвали его положение, а про чертежи и вину пока не "
        "сказали ни слова.",
        "Separating the people from the problem means talking about the person's situation "
        "apart from the thing you disagree on. You acknowledge the feeling and the pressure "
        "they are under. You do not acknowledge the demand — the dates, the price, the "
        "blame. These are two different subjects, and there is no need to mix them.\n\n"
        "The formula: “I can see that…” or “I hear…” plus whatever the facts show: "
        "leadership is leaning on them, they have to report upwards, the deadline is "
        "burning on their side. Then a full stop. Not “I understand, but…” — the “but” "
        "cancels everything before it. Your next sentence is a question, or an offer to get "
        "down to work.\n\n"
        "What this is not: it is not agreement (“yes, it was our fault”), not an apology "
        "for something you did not do, and not a concession. “I can see that leadership is "
        "pressing you” is a fact about them, not a confession about you.\n\n"
        "A second example: a contractor building a workshop for a special economic zone "
        "resident has missed a stage and says you sent the drawings late. “I hear you are "
        "on edge: the crew is standing idle and you are the one paying for it.” You named "
        "their situation and have not said a word yet about drawings or blame.",
    ),
    phrases=(
        Phrase(
            T("Алексей, я вижу, что на вас давит руководство, и объясняться перед "
              "директором придётся вам.",
              "Alexey, I can see that leadership is pressing you, and you are the one who "
              "has to face the director."),
            moves=("acknowledge",),
            when=T("Первой репликой, когда вас обвиняют.",
                   "As your first line when you are being blamed."),
        ),
        Phrase(
            T("Понимаю, для вас это неприятная история: сроки сорвались, а спрашивают с вас.",
              "I understand — this is an unpleasant situation for you: the dates slipped "
              "and you are the one being asked about it."),
            moves=("acknowledge",),
        ),
        Phrase(
            T("Понимаю, что для вас это выглядит как наша ошибка. Давайте посмотрим на "
              "график вместе и решим, что делать дальше.",
              "I understand that from where you sit this looks like our mistake. Let us "
              "look at the schedule together and decide what to do next."),
            moves=("acknowledge",),
            when=T("Когда надо признать, как он это видит, но не соглашаться, что так и есть.",
                   "When you need to acknowledge how he sees it without agreeing that it "
                   "is so."),
        ),
        Phrase(
            T("Я вижу, что вам сейчас важно не выглядеть виноватым перед руководством. Что "
              "для вас важнее всего в статусе для директора?",
              "I can see that it matters to you not to look bad in front of leadership. "
              "What matters most to you in the status for the director?"),
            moves=("acknowledge", "interests_probe"), reveals=True,
            when=T("Когда первая волна злости прошла: назвали — и сразу спросили.",
                   "Once the first wave of anger has passed: name it, then ask."),
        ),
    ),
    dialog=Dialog(
        setup=T("Конфликт отделов. Команда Алексея сорвала сроки, а он винит вашу. Нужно "
                "договориться о новом плане и не рассориться.",
                "A cross-team conflict. Alexey's team missed the deadline, and he blames "
                "yours. You need to agree a new plan without falling out."),
        opening=(
            them("Это ваша команда сорвала сроки. А мне теперь объясняться перед директором.",
                 "Your team blew the deadline. And now I have to explain it to the "
                 "director."),
        ),
        bad=(
            you("Это не наша вина, посмотрите на факты. Мы всё сдали вовремя.",
                "That is not our fault, look at the facts. We delivered everything on time."),
            them("Факты? Ваш модуль пришёл сырой. Я на него полночи потратил!",
                 "Facts? Your module arrived half-baked. I spent half the night on it!"),
            you("Вы не понимаете, как устроен наш процесс.",
                "You just do not get how our process works."),
            them("Прекрасно. Тогда пусть директор и решает, кто тут что не понимает.",
                 "Wonderful. Then let the director decide who does not get what."),
        ),
        bad_why=T(
            "Вы начали со спора о вине — и Алексей стал доказывать, что прав он. Второй "
            "репликой вы задели уже его самого. Теперь разговор о том, кто прав, а о новом "
            "плане не сказано ни слова, и он грозит директором.",
            "You opened with an argument about blame, so Alexey set out to prove he was "
            "right. Your second line went after him personally. Now the conversation is "
            "about who is right, not a word has been said about a new plan, and he is "
            "threatening to take it to the director.",
        ),
        good=(
            you("Алексей, я вижу, что на вас давит руководство, и объясняться перед "
                "директором придётся вам. Это неприятно.",
                "Alexey, I can see that leadership is pressing you, and you are the one who "
                "has to face the director. That is unpleasant.",
                moves=("acknowledge",)),
            them("Неприятно — мягко сказано. Мне в пятницу докладывать.",
                 "Unpleasant is putting it mildly. I report on Friday."),
            you("Я вижу, что вам важно не выглядеть виноватым перед руководством. Что для "
                "вас важнее всего в пятничном статусе?",
                "I can see that it matters to you not to look bad in front of leadership. "
                "What matters most to you in Friday's status update?",
                moves=("acknowledge", "interests_probe"), reveals=True),
            them("Чтобы там был план, а не поиск крайних. Ладно, давайте разберём по пунктам.",
                 "That it shows a plan, not a hunt for someone to blame. Fine, let us go "
                 "through it point by point."),
        ),
        good_why=T(
            "Вы не спорили о вине и не признавали её. Вы назвали то, что с ним "
            "происходит: давление сверху и неприятный доклад. Ему больше не нужно "
            "доказывать, что ему тяжело, — вы это уже сказали. Второй репликой вы "
            "спросили про его интерес, и он сам перевёл разговор с «кто виноват» на "
            "«что делаем». Сроки ещё не обсуждались, но спорите вы теперь о плане, а не "
            "друг с другом.",
            "You did not argue about blame, and you did not accept it. You named what is "
            "happening to him: pressure from above and an unpleasant report. He no longer "
            "has to prove it is hard for him — you have already said so. With your second "
            "line you asked about his interest, and he moved the conversation from “who is "
            "to blame” to “what do we do” himself. The dates have not come up yet, but what "
            "you are arguing about now is the plan, not each other.",
        ),
    ),
    mistakes=(
        Mistake(
            T("«Понимаю, но…»", "“I understand, but…”"),
            T("«Но» зачёркивает всё, что было до него: человек слышит только вторую "
              "половину, то есть возражение. Ставьте точку: «Понимаю, что на вас давят». "
              "Возражение, если оно нужно, — отдельной фразой и позже.",
              "The “but” cancels everything before it: the person only hears the second "
              "half, which is the objection. Put a full stop: “I understand you are under "
              "pressure.” If you need to object, do it in a separate sentence and later."),
        ),
        Mistake(
            T("Признать вину вместо чувства", "Admitting fault instead of naming the feeling"),
            T("«Да, мы подвели, простите» ради мира — это уже уступка. Дальше вы ведёте "
              "разговор о сроках с позиции виноватого, и двадцать дней сдвига начинают "
              "выглядеть справедливыми. Называйте его положение, а не свою вину.",
              "“Yes, we let you down, sorry” for the sake of peace is already a concession. "
              "From then on you negotiate the dates as the guilty party, and a twenty-day "
              "slip starts to look fair. Name his situation, not your guilt."),
        ),
        Mistake(
            T("Назвать чувство свысока", "Naming the feeling from above"),
            T("«Вы просто перенервничали», «успокойтесь» — это оценка, а не наблюдение, и "
              "звучит она как «вы не в себе». Человек начнёт защищаться от неё. Называйте "
              "то, что видно по фактам: давление, срок, доклад наверх.",
              "“You are just stressed”, “calm down” — that is a judgement, not an "
              "observation, and it sounds like “you are not yourself”. The person will start "
              "defending against it. Name what the facts show: pressure, a deadline, a "
              "report upwards."),
        ),
    ),
    limits=(
        Limit(
            T("Собеседник спокоен и торгуется холодно — например, поставщик ровным тоном "
              "называет цену.",
              "The other side is calm and bargains coolly — say, a supplier naming a price "
              "in an even tone."),
            T("Называть чувство, которого нет, — фальшь, и её слышно. Переходите сразу к "
              "вопросам об интересах и к объективным критериям.",
              "Naming a feeling that is not there rings false, and people hear it. Go "
              "straight to questions about interests and to objective criteria."),
        ),
        Limit(
            T("Вы и правда виноваты: срыв на вашей стороне.",
              "You really are at fault: the slip is on your side."),
            T("Одно только «я вижу, что вам тяжело» прозвучит как уловка. Признайте "
              "конкретный факт — «мы сдали модуль на три дня позже» — и сразу предложите, "
              "как это исправить. Признание факта не обязывает соглашаться с любым сроком.",
              "“I can see this is hard for you” on its own will sound like a trick. Admit "
              "the specific fact — “we delivered the module three days late” — and propose a "
              "fix straight away. Admitting a fact does not commit you to any deadline he "
              "names."),
        ),
    ),
)
