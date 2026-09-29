"""Слушание и деэскалация · урок 3 — «Лестница реакций»."""

from app.course.lessons._model import (Dialog, LessonMaterial, Limit, Mistake,
                                       Phrase, T, them, you)

MATERIAL = LessonMaterial(
    block="active-listening",
    lesson=3,
    scenario_id="conflict",
    technique=T("Читать состояние собеседника и подбирать ход под него",
                "Read their state and fit your next move to it"),
    why=T(
        "Реплики готовят заранее и произносят по плану, не глядя на человека напротив. "
        "Но одна и та же фраза «давайте обсудим цифру» на собеседнике, который теплеет, "
        "двигает дело, а на том, кто только что закрылся, добивает разговор. Ошибка — "
        "вести переговоры по своему списку, а не по состоянию собеседника. Приём: после "
        "каждого его ответа спросить себя «где он сейчас?» и выбрать ход, который "
        "подходит именно к этому состоянию.",
        "People prepare their lines in advance and deliver them on schedule, without "
        "looking at the person across the table. Yet the same line — “let us talk "
        "numbers” — moves things forward with someone who is warming up and finishes the "
        "conversation off with someone who has just closed down. The mistake is to "
        "negotiate from your own list rather than from the other side's state. The "
        "technique: after each of their answers, ask yourself “where are they now?” and "
        "choose the move that fits that state.",
    ),
    core=T(
        "Состояния удобно держать в голове как лестницу, от холодного к тёплому, и делить "
        "её на три зоны.\n\n"
        "Холодная зона: «принимает на свой счёт», «закрывается», «под давлением». "
        "Признаки — короткие резкие ответы, «это не обсуждается», переход на «вы "
        "всегда». Здесь ничего не просят. Ход один: снизить накал — назвать его "
        "положение (урок «Назвать чувство, не соглашаясь»), убрать нажим, иногда взять "
        "паузу.\n\n"
        "Средняя зона: «пока не соглашается», «держит нейтралитет». Признаки — «посмотрим», "
        "«пока нет», вежливые, но пустые ответы. Ход — узнать, чего не хватает: вопрос о "
        "том, что мешает, или о том, что должно появиться в плане.\n\n"
        "Тёплая зона: «идёт навстречу», «принимает довод», «приоткрывается», «теплеет». "
        "Признаки — сам предлагает варианты, рассказывает о своих трудностях, задаёт "
        "встречные вопросы. Ход — закреплять: конкретное предложение, условие «если… "
        "то…», цифра.\n\n"
        "Главное правило: по лестнице не прыгают через ступень. Из холодной зоны сразу в "
        "предложение не попасть — сначала снять холод, потом узнать, потом предлагать. "
        "Если не уверены, где человек, — спросите: проверочный вопрос заменяет догадку.\n\n"
        "В закупках то же самое: поставщик на «это не обсуждается» — не время для "
        "встречной цены, а поставщик, который сам спросил про объём на год, — ровно время.",
        "It helps to hold the states in your head as a ladder, from cold to warm, and to "
        "split it into three zones.\n\n"
        "The cold zone: “offended”, “hardened”, “pressured”. The signs are short, sharp "
        "answers, “this is not up for discussion”, a switch to “you always”. You ask for "
        "nothing here. There is one move: bring the heat down — name their situation (the "
        "lesson “Name the feeling without agreeing”), take the pressure off, sometimes take "
        "a break.\n\n"
        "The middle zone: “not yet”, “neutral”. The signs are “we will see”, “not for now”, "
        "polite but empty answers. The move is to find out what is missing: ask what is in "
        "the way, or what would need to be in the plan.\n\n"
        "The warm zone: “collaborated”, “persuaded”, “opened up”, “warmed”. The signs: they "
        "suggest options themselves, talk about their own difficulties, ask questions back. "
        "The move is to lock things in: a concrete proposal, an “if… then…” condition, a "
        "number.\n\n"
        "The main rule: you do not skip rungs. There is no jumping from the cold zone "
        "straight to a proposal — first take the chill off, then find out, then propose. If "
        "you are not sure where the person is, ask: a checking question beats a guess.\n\n"
        "Procurement works the same way: a supplier who says “this is not up for "
        "discussion” is not the moment for a counter-price, while a supplier who has just "
        "asked about annual volume is exactly that moment.",
    ),
    phrases=(
        Phrase(
            T("Я вижу, что задел вас. Давайте я скажу иначе: вопрос не в том, кто "
              "виноват, а в том, что мы сдвигаем.",
              "I can see that I touched a nerve. Let me put it differently: the question is "
              "not who is to blame but what we move."),
            moves=("acknowledge",),
            when=T("Холодная зона: он принял сказанное на свой счёт.",
                   "Cold zone: he took what you said personally."),
        ),
        Phrase(
            T("Что вас не устраивает в этом плане: людей не хватает, времени или "
              "аргументов для руководства?",
              "What concerns you in this plan — not enough people, not enough time, or "
              "nothing to show leadership?"),
            moves=("spin_problem",), reveals=True,
            when=T("Средняя зона: «пока нет» без объяснений.",
                   "Middle zone: a “not yet” with no explanation."),
        ),
        Phrase(
            T("Я правильно понимаю, что пока вас это не устраивает?",
              "Do I understand correctly that this does not work for you yet?"),
            moves=("acknowledge",),
            when=T("Когда не уверены, в какой он зоне: проверочный вопрос.",
                   "When you are not sure which zone he is in: a checking question."),
        ),
        Phrase(
            T("Похоже, мы движемся к общему плану. Давайте закрепим: если мы подготовим "
              "совместный статус для руководства, сможете ли вы уложиться в восемь дней?",
              "It looks like we are close to a shared plan. Let us lock it in: if we "
              "prepare a joint status update for leadership, can you move to eight days?"),
            moves=("tradeoff",),
            when=T("Тёплая зона: он сам предлагает варианты.",
                   "Warm zone: he is suggesting options himself."),
        ),
    ),
    dialog=Dialog(
        setup=T("Середина разговора. Вы предложили сдвиг в восемь дней, Алексей ответил "
                "коротко и холодно.",
                "Mid-conversation. You proposed an eight-day slip, and Alexey answered "
                "curtly and coldly."),
        opening=(
            them("Восемь дней? Нет. Это не обсуждается.",
                 "Eight days? No. That is not up for discussion."),
        ),
        bad=(
            you("Давайте всё-таки обсудим. Восемь дней — это разумно, у нас тоже есть сроки.",
                "Let us discuss it anyway. Eight days is reasonable, we have deadlines too."),
            them("Я сказал — нет.", "I said no."),
            you("Восемь дней — моё последнее слово. Иначе иду к директору.",
                "Eight days, take it or leave it. Otherwise I go to the director.",
                moves=("threat",)),
            them("Идите. Посмотрим, кто кого.", "Go ahead. We will see who wins."),
        ),
        bad_why=T(
            "Алексей был в холодной зоне — «не обсуждается», — а вы продолжили тем же "
            "предложением, будто он ответил «может быть». Он закрылся жёстче, и вы "
            "ответили ультиматумом. На закрывшемся человеке нажим работает против вас: даже "
            "если он уступит, то неохотно и только на словах.",
            "Alexey was in the cold zone — “not up for discussion” — and you carried on with "
            "the same proposal as if he had said “maybe”. He shut down harder, and you "
            "answered with an ultimatum. With someone who has closed down, pressure works "
            "against you: even if he gives way, it will be grudging and on paper only.",
        ),
        good=(
            you("Я вижу, что восемь дней для вас сейчас звучат нереально. Что вас не "
                "устраивает в этом плане: людей не хватает или нечего показать руководству?",
                "I can see that eight days sounds unrealistic to you right now. What "
                "concerns you in this plan — not enough people, or nothing to show "
                "leadership?",
                moves=("acknowledge", "spin_problem"), reveals=True),
            them("Людей не хватает. Двое на больничном, я физически не успеваю.",
                 "Not enough people. Two are off sick, I physically cannot make it."),
            you("Понял. Если я временно поделюсь ресурсом — дам одного разработчика на две "
                "недели, — сможете ли вы подвинуться до восьми дней?",
                "Got it. If we temporarily share a resource — one developer for two weeks — "
                "can you move to eight days?",
                moves=("tradeoff",)),
            them("С человеком — да, восемь реально.", "With an extra person — yes, eight "
                 "is doable."),
        ),
        good_why=T(
            "Вы прочитали «не обсуждается» как холодную зону и ничего не стали просить: "
            "назвали его положение и спросили, что мешает. Ответ перевёл его в тёплую "
            "зону — он сам рассказал о своей проблеме. И только тогда вы сделали "
            "предложение, причём под его проблему. Порядок тот же, что на лестнице: снять "
            "холод, узнать, предложить.",
            "You read “not up for discussion” as the cold zone and asked for nothing: you "
            "named his situation and asked what was in the way. His answer moved him into "
            "the warm zone — he told you about his problem himself. Only then did you make a "
            "proposal, and one built around his problem. The same order as the ladder: take "
            "the chill off, find out, propose.",
        ),
    ),
    mistakes=(
        Mistake(
            T("Судить по словам, а не по поведению", "Judging by words, not behaviour"),
            T("«Хорошо, я подумаю» может значить и «пока не соглашается», и вежливое "
              "«закрылся». Смотрите на признаки: задаёт ли он вопросы, предлагает ли сам, "
              "стали ли ответы короче.",
              "“Fine, I will think about it” can mean “not yet” or a polite “hardened”. "
              "Watch the signs: is he asking questions, is he suggesting anything himself, "
              "have his answers become shorter?"),
        ),
        Mistake(
            T("Прыгать через ступень", "Skipping rungs"),
            T("Из холодной зоны сразу к предложению. Человек, который только что закрылся, "
              "любое предложение прочитает как нажим — даже хорошее. Сначала снять холод, "
              "потом спрашивать, потом предлагать.",
              "Going from the cold zone straight to a proposal. Someone who has just shut "
              "down will read any proposal as pressure — even a good one. First take the "
              "chill off, then ask, then propose."),
        ),
        Mistake(
            T("Не заметить тёплую зону", "Missing the warm zone"),
            T("Собеседник уже идёт навстречу, а вы досказываете заготовленные доводы — и "
              "упускаете момент. Когда тепло, закрепляйте: конкретное условие или цифра, "
              "а не ещё один аргумент.",
              "The other side is already coming your way, and you are still delivering your "
              "prepared arguments — and the moment slips by. When it is warm, lock it in: a "
              "concrete condition or a number, not one more argument."),
        ),
    ),
    limits=(
        Limit(
            T("Разговор идёт по почте или по телефону: лица и позы не видно.",
              "The conversation is by email or phone: you cannot see the face or posture."),
            T("По словам и паузам состояние читается хуже. Спрашивайте прямо: «Как вам "
              "такой вариант?», «Что вас пока останавливает?» — проверочный вопрос "
              "заменяет наблюдение.",
              "Words and pauses are a poorer guide. Ask outright: “How does this option "
              "sound to you?”, “What is holding you back for now?” — a checking question "
              "stands in for observation."),
        ),
        Limit(
            T("Собеседник намеренно держит непроницаемое лицо — опытный закупщик или "
              "жёсткий переговорщик.",
              "The other side keeps a deliberately blank face — an experienced buyer or a "
              "hard bargainer."),
            T("Не гадайте по лицу. Смотрите на действия: двигается ли он в цифрах, "
              "спрашивает ли о деталях. И опирайтесь на то, что работает в любом "
              "состоянии: вопросы об интересах и объективные критерии.",
              "Do not guess from the face. Watch what he does: is he moving on numbers, is "
              "he asking about details? And rely on what works in any state: questions about "
              "interests and objective criteria."),
        ),
    ),
)
