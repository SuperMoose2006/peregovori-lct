"""Давление и возражения · урок 2 — «Возражение как скрытый интерес»."""

from app.course.lessons._model import (Dialog, LessonMaterial, Limit, Mistake,
                                       Phrase, T, them, you)

MATERIAL = LessonMaterial(
    block="pressure-defense",
    lesson=2,
    scenario_id="sla_renewal",
    technique=T("Спросить, что стоит за возражением",
                "Ask what sits inside the objection"),
    why=T(
        "«99.9 — невозможно». Обычный ответ — доказать, что возможно: «у конкурентов же "
        "получается». Возражение превращается в стену, о которую бьются аргументами, и "
        "чем сильнее бьются, тем она крепче. Но возражение почти всегда упаковка: внутри "
        "страх или ограничение, которое человек не назвал. Пока вы спорите с упаковкой, "
        "содержимое остаётся закрытым. Приём: не опровергать возражение, а спросить, что "
        "его вызывает.",
        "“99.9 is impossible.” The usual answer is to prove that it is possible: “your "
        "competitors manage it”. The objection becomes a wall you throw arguments at, and "
        "the harder you throw, the firmer it stands. But an objection is almost always "
        "packaging: inside is a fear or a constraint the person has not named. While you "
        "argue with the packaging, the contents stay sealed. The technique: do not rebut "
        "the objection — ask what is causing it.",
    ),
    core=T(
        "Возражение — это позиция, сказанная как «нет». За «99.9 невозможно» может стоять "
        "что угодно: штрафы, которые не выдержит команда эксплуатации — люди, которые "
        "держат систему в работе; нет резервной площадки; нельзя брать обязательства без "
        "согласования наверху. Каждая причина решается по-своему, а голое «невозможно» не "
        "решается никак.\n\n"
        "Как спрашивать. Сначала признайте возражение, не соглашаясь с ним: «понимаю, что "
        "99.9 выглядит рискованно». Потом спросите, что внутри, и дайте варианты — "
        "отвечать на вопрос с вариантами легче: «что стоит за этим "
        "„невозможно“ — штрафы или нагрузка на эксплуатацию?». Выслушайте, перескажите "
        "(урок «Отражение смысла») и отвечайте уже на названную причину, а не на "
        "исходное «нет».\n\n"
        "Две проверки помогают не промахнуться. Первая — изолировать причину: «допустим, "
        "вопрос штрафов мы решим; что ещё мешает?». Если больше ничего — вы нашли главное. "
        "Вторая — перевести разговор с процента на причину: не «дайте 99.9», а «сколько "
        "штрафов ваша эксплуатация выдержит».\n\n"
        "Пример из найма: кандидат говорит «ваша зарплата ниже рынка». Не спорьте про "
        "рынок, спросите: «С каким предложением вы сравниваете и что в нём для вас "
        "главное?»",
        "An objection is a position phrased as “no”. Behind “99.9 is impossible” there "
        "could be anything: penalties the operations team — the people who keep the system "
        "running — cannot absorb; no standby site; no authority to commit without sign-off "
        "from above. Each reason has its own fix; a bare “impossible” has none.\n\n"
        "How to ask. First acknowledge the objection without agreeing with it: “I "
        "understand 99.9 looks risky.” Then ask what is inside, and offer options — a "
        "question with options is easier to answer: “what is the real reason behind "
        "‘impossible’ — the penalties, or the load on your ops team?”. Listen, play it "
        "back (the lesson “Reflecting the meaning”), and answer the reason he named, not "
        "the original “no”.\n\n"
        "Two checks keep you on target. The first isolates the reason: “suppose we solve "
        "the penalty question — what else is in the way?”. If nothing else, you have found "
        "the main one. The second moves the talk from the percentage to the reason: not "
        "“give us 99.9”, but “how much in penalties can your ops team absorb”.\n\n"
        "A hiring example: a candidate says “your salary is below market”. Do not argue "
        "about the market; ask: “Which offer are you comparing it with, and what matters "
        "most to you in it?”",
    ),
    phrases=(
        Phrase(
            T("Что стоит за этим «невозможно»: штрафы, нагрузка на вашу эксплуатацию или "
              "что-то другое?",
              "What is the real reason behind “impossible” — the penalties, the load on "
              "your ops team, or something else?"),
            moves=("interests_probe",), reveals=True,
            when=T("Сразу после возражения: вскрыть, что внутри.",
                   "Right after the objection: find out what is inside."),
        ),
        Phrase(
            T("Допустим, вопрос штрафов мы решим. Что ещё мешает дать 99.9?",
              "Suppose we solve the penalty question. What else is the bottleneck for 99.9?"),
            moves=("spin_problem",), reveals=True,
            when=T("Проверить, главная ли это причина или есть ещё.",
                   "To check whether this is the main reason or there are others."),
        ),
        Phrase(
            T("То есть вы не против 99.9 как цели — вы против штрафов, которые не вытянет "
              "ваша команда эксплуатации. Я правильно понял?",
              "So you are saying you are not against 99.9 as a goal — you are against "
              "penalties your ops team cannot sustain. Is that right?"),
            moves=("acknowledge",),
            when=T("Когда причина названа: пересказать и отделить цель от риска.",
                   "Once the reason is out: play it back and separate the goal from the "
                   "risk."),
        ),
        Phrase(
            T("Сколько штрафов в год ваша команда эксплуатации выдержит без потерь?",
              "How much in penalties a year can your ops team absorb without real damage?"),
            moves=("spin_situation",), reveals=True,
            when=T("Перевести спор с процента на то, что можно посчитать.",
                   "To move the argument from the percentage to something you can count."),
        ),
    ),
    dialog=Dialog(
        setup=T("Продление SLA — договора об уровне сервиса. Вы попросили аптайм 99.9%, "
                "Виктор отвечает возражением.",
                "Renewing an SLA — the service level agreement. You asked for 99.9% "
                "uptime, and Viktor answers with an objection."),
        opening=(
            them("99.9 — невозможно. Такого никто не даёт.",
                 "99.9 is impossible. Nobody offers that."),
        ),
        bad=(
            you("Как это невозможно? Все дают, и вы можете. Просто не хотите.",
                "What do you mean impossible? Everyone offers it, and so can you. You just "
                "do not want to."),
            them("Не хотим — и не будем. Вопрос закрыт.",
                 "We do not want to, and we will not. Subject closed."),
            you("Ну хоть 99.8 дайте.", "Well, at least give us 99.8."),
            them("99.5, как я и сказал.", "99.5, as I said."),
        ),
        bad_why=T(
            "Вы опровергали «невозможно» — и Виктор защищал его всё упорнее: теперь это "
            "вопрос его правоты, а не аптайма. Причину вы так и не узнали, а без неё "
            "осталось одно — выпрашивать цифру. Возражение, которое оспорили, твердеет.",
            "You tried to disprove “impossible” — and Viktor defended it harder and harder: "
            "now it is about him being right, not about uptime. You never learned the "
            "reason, and without it all that was left was to beg for a number. An objection "
            "you argue with only hardens.",
        ),
        good=(
            you("Что стоит за этим «невозможно»: штрафы, нагрузка на вашу эксплуатацию или "
                "что-то другое?",
                "What is the real reason behind “impossible” — the penalties, the load on "
                "your ops team, or something else?",
                moves=("interests_probe",), reveals=True),
            them("Штрафы. При 99.9 любой ночной сбой — и мы платим. Моя эксплуатация столько "
                 "не вытянет.",
                 "The penalties. At 99.9, any outage at night and we pay. My ops team "
                 "cannot carry that."),
            you("То есть вы не против 99.9 как цели — вы против штрафов, которые не вытянет "
                "ваша эксплуатация. Если так, давайте обсуждать ступенчатый SLA: сейчас "
                "99.7, через два квартала — 99.9. Сможете ли вы на это пойти?",
                "So you are saying you are not against 99.9 as a goal — you are against "
                "penalties your ops team cannot sustain. Then let us talk about a phased "
                "SLA: 99.7 now, 99.9 in two quarters. Would you move on that?",
                moves=("acknowledge", "tradeoff")),
            them("Ступенчато… С этим я могу пойти к своим.",
                 "In steps… That I can take to my people."),
        ),
        good_why=T(
            "Вы не спорили с «невозможно», а спросили, что внутри, и дали варианты, чтобы "
            "ответить было легко. Виктор назвал настоящий страх — штрафы. Пересказ показал, "
            "что вы услышали разницу между целью и риском, а предложение ответило на риск, "
            "а не на «нет». Стена стала задачей, которую решают вдвоём.",
            "You did not argue with “impossible”; you asked what was inside and offered "
            "options so it was easy to answer. Viktor named his real fear — penalties. The "
            "playback showed you had heard the difference between the goal and the risk, "
            "and your proposal answered the risk, not the “no”. The wall became a problem "
            "the two of you can work on.",
        ),
    ),
    mistakes=(
        Mistake(
            T("Опровергать возражение", "Rebutting the objection"),
            T("«Как это невозможно? У всех получается». Чем сильнее вы доказываете, тем "
              "крепче человек держится за своё «нет»: отступить теперь значит признать, что "
              "был неправ.",
              "“Impossible? Everyone manages it.” The harder you prove your case, the tighter "
              "the person holds on to their “no”: backing down now means admitting they "
              "were wrong."),
        ),
        Mistake(
            T("Принять возражение за отказ и уступить", "Taking the objection as a refusal "
              "and conceding"),
            T("«Хорошо, тогда 99.5». Вы заплатили за возражение, не узнав, что за ним. А "
              "за ним часто то, что обходится вам дешевле уступки в цифре: срок договора, "
              "поэтапный график, общий план инцидентов.",
              "“Fine, 99.5 then.” You paid for the objection without finding out what was "
              "behind it. And behind it there is often something cheaper for you than giving "
              "ground on the number: contract length, a phased schedule, a shared incident "
              "plan."),
        ),
        Mistake(
            T("Спросить «почему?»", "Asking “why?”"),
            T("«Почему невозможно?» звучит как вызов: докажите. Спрашивайте о деле, а не о "
              "человеке — «что стоит за…», «что мешает…», «что вас беспокоит в…» — и "
              "давайте варианты ответа.",
              "“Why is it impossible?” sounds like a challenge: prove it. Ask about the "
              "matter, not the person — “what is the real reason behind…”, “what is in the "
              "way of…”, “what concerns you about…” — and offer possible answers."),
        ),
    ),
    limits=(
        Limit(
            T("Возражение — вежливая форма отказа: собеседник уже решил работать с другим.",
              "The objection is a polite refusal: the other side has already decided to go "
              "with someone else."),
            T("Интереса, который можно закрыть, там нет, сколько ни спрашивай. Проверьте "
              "прямо: «Если мы решим вопрос со штрафами, вы готовы продлить договор?» Если "
              "нет — не тратьте время, переходите к своей альтернативе.",
              "There is no interest to meet there, however much you ask. Test it directly: "
              "“If we solve the penalty question, are you ready to renew?” If not, do not "
              "waste time — move to your alternative."),
        ),
        Limit(
            T("Возражение повторяют снова и снова, хотя названную причину вы уже закрыли.",
              "The objection keeps coming back even though you have dealt with the reason "
              "given."),
            T("Значит, названная причина была не главной. Спросите прямо, что осталось: "
              "«Кроме штрафов, что ещё мешает?» Нет ответа — переходите к объективным "
              "критериям: отраслевому стандарту и цене простоя.",
              "Then the reason given was not the main one. Ask straight out what is left: "
              "“Apart from the penalties, what else is in the way?” No answer — move to "
              "objective criteria: the industry standard and the cost of downtime."),
        ),
    ),
)
