"""bank.py — банк упражнений курса.

ГЛАВНОЕ ПРАВИЛО БАНКА: правильный ответ здесь обязан быть правильным и в игре.
Поэтому банк не «написан», а проверен — `tests/test_course_bank.py` прогоняет
каждый текстовый пункт через настоящий `analyze()` / `apply_move()` на обоих
языках. Если правка баланса или словаря разойдётся с упражнением, падает
сборка, а не пользователь: урок не может тихо превратиться в ложь.

ТИПЫ (девять; проверка у всех детерминированная, ИИ в зачёте не участвует):

    choice      выбрать верную реплику          — сверка индекса
    spot_error  найти ошибку в чужой реплике    — сверка индекса
    order       расставить по порядку           — точное совпадение массива
    match       сопоставить пары                — сверка отображения
    numeric     логический вопрос про числа     — |ввод − ответ| ≤ допуск
    freeform    применить приём своими словами  — предикат над analyze()
    reaction    определить реакцию оппонента    — вычисляется apply_move()
    meters      предсказать движение шкал       — вычисляется apply_move()
    drill       мини-переговорка на 3–6 ходов   — предикат над состоянием партии

`explain` показывается ПОСЛЕ ответа всегда — и когда верно, и когда нет.
"""

from __future__ import annotations

from app.course.blocks import T

BANK: list[dict] = [
    # ---------------- 1. foundations --------------------------------------
    {
        "id": "fo-01", "block": "foundations", "lesson": 1, "type": "choice",
        "difficulty": 1, "xp": 10, "scenario_id": "rent",
        "prompt": T("Наталья: «75 тысяч, и это окончательная цена». Ваш ход?",
                    "Natalia: “75k, and that is final.” Your move?"),
        "options": [
            T("А если 65? Мне это дорого.", "What about 65? That is too much for me."),
            T("Наталья, что для вас важнее всего в жильце — и что вас беспокоит?",
              "Natalia, what matters most to you in a tenant — and what concerns you?"),
            T("У меня есть другая квартира за 68, я подумаю.",
              "I have another flat at 68, I will think about it."),
            T("Окончательных цен не бывает.", "There is no such thing as a final price."),
        ],
        "answer": 1, "expect_moves": ["interests_probe"],
        "explain": T(
            "«75 тысяч» — позиция. Пока вы торгуетесь с ней, у стола одна ось и кто-то обязан "
            "проиграть. Вопрос про жильца вскрывает интерес — Информация +24, и цена поедет сама.",
            "“75k” is a position. Haggle with it and the table has one axis and someone has to lose. "
            "The tenant question surfaces an interest — Information +24, and the price moves on its own."),
    },
    {
        "id": "fo-02", "block": "foundations", "lesson": 1, "type": "spot_error",
        "difficulty": 1, "xp": 10, "scenario_id": "rent",
        "prompt": T("Что здесь не так?", "What is wrong here?"),
        "bad_line": T("Мне это дорого, скиньте 10 тысяч.",
                      "That is too expensive, knock ten thousand off."),
        "options": [
            {"key": "hostile", **T("Реплика груба", "The line is rude")},
            {"key": "position_no_interest", **T(
                "Это позиция без интереса и без обоснования: нет ни одной причины, почему она должна согласиться",
                "A position with no interest and no grounding: not one reason why she should agree")},
            {"key": "threat", **T("Это ультиматум", "It is an ultimatum")},
            {"key": "anchor_without_rationale", **T("Слишком низкий якорь", "The anchor is too low")},
        ],
        "answer": 1, "fault_key": "position_no_interest",
        "explain": T(
            "Движок видит здесь только предложение цены — ни вопроса, ни критерия, ни эмпатии. "
            "Реакция нейтральная, шкалы не двигаются. «Дорого» — это про вас, а не про неё.",
            "The engine sees only a price offer — no question, no criterion, no empathy. The reaction "
            "is neutral and the meters do not move. “Expensive” is about you, not about her."),
    },
    {
        "id": "fo-03", "block": "foundations", "lesson": 2, "type": "order",
        "difficulty": 2, "xp": 15,
        "prompt": T("Расставьте четыре принципа Гарвардского метода в порядке, в котором их применяют за столом.",
                    "Put the four Harvard principles in the order you apply them at the table."),
        "items": [
            {"id": "people", **T("Отделить человека от проблемы", "Separate the people from the problem")},
            {"id": "interests", **T("Смотреть на интересы, а не на позиции", "Focus on interests, not positions")},
            {"id": "options", **T("Изобрести варианты к взаимной выгоде", "Invent options for mutual gain")},
            {"id": "criteria", **T("Настаивать на объективных критериях", "Insist on objective criteria")},
        ],
        "answer": ["people", "interests", "options", "criteria"],
        "explain": T(
            "Порядок не декоративный. Пока человек защищается, он не расскажет интерес. Пока интересы "
            "скрыты, изобретать нечего. Пока вариантов нет, критерий нечем применить.",
            "The order is not decorative. While a person is defending themselves they will not name an "
            "interest. While interests are hidden there is nothing to invent. With no options there is "
            "nothing to apply a criterion to."),
    },
    {
        "id": "fo-04", "block": "foundations", "lesson": 3, "type": "freeform",
        "difficulty": 2, "xp": 15, "scenario_id": "rent",
        "prompt": T("Задайте Наталье вопрос, который вскроет её настоящий интерес. Не про цену.",
                    "Ask Natalia a question that surfaces her real interest. Not about price."),
        "check": {"require_moves": ["interests_probe"], "forbid_moves": ["threat", "hostile"],
                  "min_arg": 30, "min_words": 5},
        "reference": T("Наталья, что для вас важнее всего в жильце — и что вас беспокоит?",
                       "Natalia, what matters most to you in a tenant — and what concerns you?"),
        "explain": T(
            "Ключ — формулировка «что для вас важно / что вас беспокоит». Голое «почему?» движок "
            "засчитает как обычный открытый вопрос: ноль к Информации.",
            "The key is “what matters to you / what concerns you”. A bare “why?” classifies as a plain "
            "open question: zero Information."),
    },
    {
        "id": "fo-05", "block": "foundations", "lesson": 2, "type": "match",
        "difficulty": 2, "xp": 15,
        "prompt": T("Соедините позицию с интересом, который за ней стоит.",
                    "Match each position to the interest behind it."),
        "left": [
            {"id": "p_rent", **T("«75 тысяч, и это окончательно» (аренда)", "“75k and that is final” (rent)")},
            {"id": "p_supplier", **T("«100 ₽ за штуку, дешевле не работаем» (поставщик)",
                                     "“100 per unit, no lower” (supplier)")},
            {"id": "p_conflict", **T("«Это вы сорвали сроки» (смежный отдел)",
                                     "“You are the ones who missed the deadline” (partner team)")},
        ],
        "right": [
            {"id": "i_vacancy", **T("Страх простоя и пустых месяцев", "Fear of vacancy and empty months")},
            {"id": "i_utilization", **T("Стабильная загрузка производства", "Stable factory utilization")},
            {"id": "i_face", **T("Не выглядеть виноватым перед руководством", "Not look at fault to leadership")},
        ],
        "answer": {"p_rent": "i_vacancy", "p_supplier": "i_utilization", "p_conflict": "i_face"},
        "explain": T(
            "Все три интереса — настоящие, из скрытых интересов этих сценариев. Позиция всегда громче "
            "интереса, поэтому её слышно, а его — нет.",
            "All three interests are real, taken from these scenarios' hidden interests. A position is "
            "always louder than an interest — that is why you hear one and not the other."),
    },


    {
        "id": "fo-06", "block": "foundations", "lesson": 4, "type": "meters",
        "difficulty": 2, "xp": 10, "scenario_id": "rent",
        "state": {"trust": 40, "tension": 25, "info": 0, "leverage": 12, "turn": 2},
        "player_line": T("Наталья, что для вас важнее всего в жильце — и что вас беспокоит?",
                         "Natalia, what matters most to you in a tenant — and what concerns you?"),
        "ask": "largest_delta", "answer": "info",
        "prompt": T("Какая шкала сдвинется сильнее всего?", "Which meter moves the most?"),
        "explain": T(
            "Информация +24 — больше, чем даёт любой другой ход. Доверие тоже подрастает, но "
            "заметно меньше: вопрос про интерес нужен ради того, что вы УЗНАЁТЕ, а не ради тепла.",
            "Information +24 — more than any other move grants. Trust rises too, but far less: an "
            "interest question is for what you LEARN, not for warmth."),
    },
    # ---------------- 2. spin-ladder --------------------------------------
    {
        "id": "sp-01", "block": "spin-ladder", "lesson": 1, "type": "order",
        "difficulty": 1, "xp": 10,
        "prompt": T("Расставьте ступени SPIN.", "Order the SPIN stages."),
        "items": [
            {"id": "s", **T("Ситуация: как всё устроено сейчас", "Situation: how things work today")},
            {"id": "p", **T("Проблема: что мешает", "Problem: what gets in the way")},
            {"id": "i", **T("Последствия: чем это грозит", "Implication: what it costs")},
            {"id": "n", **T("Выгода: что даст решение", "Need-payoff: what solving it is worth")},
        ],
        "answer": ["s", "p", "i", "n"],
        "explain": T(
            "Порядок работает как лестница: без фактов не найти боль, без боли последствия звучат как "
            "манипуляция, без последствий выгода не имеет цены.",
            "The order is a ladder: with no facts you cannot find the pain, with no pain implications "
            "sound like manipulation, with no implications the payoff is worth nothing."),
    },
    {
        "id": "sp-02", "block": "spin-ladder", "lesson": 3, "type": "choice",
        "difficulty": 2, "xp": 10, "scenario_id": "supplier",
        "prompt": T("Какой из вопросов — ступень I (Последствия)?",
                    "Which question is stage I (Implication)?"),
        "options": [
            T("Расскажите о вашем производственном цикле — как он устроен?",
              "Tell me about your production cycle — how is it set up?"),
            T("С какими сложностями вы сталкиваетесь при неравномерной загрузке?",
              "What difficulties do you hit when the load is uneven?"),
            T("Сколько вы теряете, если линия стоит месяц?",
              "What does that cost you when the line is idle for a month?"),
            T("Насколько важно было бы закрыть загрузку на год вперёд?",
              "How valuable would it be to lock the whole year's utilization now?"),
        ],
        "answer": 2, "expect_moves": ["spin_implication"],
        "explain": T(
            "I-вопрос переводит проблему в цифру потерь. В движке он дороже остальных: +22 к "
            "Информации против +14 у ситуации и проблемы.",
            "An I-question turns a problem into a number. The engine prices it higher: +22 Information "
            "versus +14 for situation and problem."),
    },
    {
        "id": "sp-03", "block": "spin-ladder", "lesson": 3, "type": "freeform",
        "difficulty": 2, "xp": 15, "scenario_id": "supplier",
        "prompt": T("Ирина сказала, что заказы приходят рывками. Задайте вопрос ступени I.",
                    "Irina said orders arrive in bursts. Ask a stage-I question."),
        "check": {"require_moves": ["spin_implication"], "forbid_moves": ["threat", "hostile"],
                  "min_arg": 30, "min_words": 5},
        "reference": T("К чему это приводит, когда линия простаивает месяц?",
                       "What happens if the line sits idle for a month?"),
        "explain": T(
            "Движок ловит I по маркерам «к чему это приводит / сколько вы теряете / чем это грозит». "
            "«Это плохо?» — не I, это просто открытый вопрос.",
            "The engine detects I from markers like “what happens if / what does that cost / how does "
            "that affect”. “Is that bad?” is not I — it is a plain open question."),
    },
    {
        "id": "sp-04", "block": "spin-ladder", "lesson": 3, "type": "reaction",
        "difficulty": 2, "xp": 10, "scenario_id": "supplier", "seed_turn": 3,
        "opponent_line": T("Мы держим цену 100, это наша политика.",
                           "We hold at 100, that is our policy."),
        "player_line": T("К чему это приводит, когда линия простаивает месяц?",
                         "What happens if the line sits idle for a month?"),
        "answer": "opened_up",
        "prompt": T("Что произошло с Ириной?", "What happened to Irina?"),
        "explain": T(
            "SPIN-вопрос вскрывает интерес: Информация +22, доверие вверх, напряжение вниз. Это "
            "«приоткрылась» — не «потеплела» (для этого нужно активное слушание) и не «убеждена "
            "данными» (для этого нужен критерий).",
            "A SPIN question uncovers an interest: Information +22, trust up, tension down. That is "
            "“opened up” — not “warmed” (that needs active listening) and not “persuaded” (that needs "
            "a criterion)."),
    },
    {
        "id": "sp-05", "block": "spin-ladder", "lesson": 5, "type": "spot_error",
        "difficulty": 3, "xp": 15, "scenario_id": "supplier",
        "prompt": T("Первый ход переговоров. Что не так?", "First move of the negotiation. What is wrong?"),
        "bad_line": T("Насколько важно для вас было бы закрыть загрузку на весь год вперёд?",
                      "How valuable would it be to lock the whole year's utilization now?"),
        "options": [
            {"key": "hostile", **T("Вопрос звучит грубо", "The question sounds rude")},
            {"key": "question_too_vague", **T("Вопрос слишком расплывчатый", "The question is too vague")},
            {"key": "spin_out_of_order", **T(
                "N-вопрос задан до S/P/I: предлагается ценность решения проблемы, которую вы ещё не назвали вместе",
                "An N-question before S/P/I: you offer the value of solving a problem the two of you have not named")},
            {"key": "anchor_without_rationale", **T("Нет цифры", "There is no number")},
        ],
        "answer": 2, "fault_key": "spin_out_of_order",
        "explain": T(
            "Формально движок засчитает need-payoff и даст +22. Но на первом ходу Ирина ещё не "
            "признала боль, поэтому вопрос читается как заготовка продавца. Лестница SPIN — про "
            "порядок, а не про набор.",
            "Formally the engine scores need-payoff and grants +22. But on turn one Irina has not "
            "admitted the pain, so the question reads as a sales script. The SPIN ladder is about "
            "sequence, not a checklist."),
    },


    {
        "id": "sp-06", "block": "spin-ladder", "lesson": 2, "type": "freeform",
        "difficulty": 2, "xp": 15, "scenario_id": "supplier",
        "prompt": T("Ирина рассказала, как устроено производство. Задайте вопрос ступени P — про то, что мешает.",
                    "Irina described how production runs. Ask a stage-P question — about what gets in the way."),
        "check": {"require_moves": ["spin_problem"], "forbid_moves": ["threat", "hostile"],
                  "min_arg": 30, "min_words": 5},
        "reference": T("С какими сложностями вы сталкиваетесь при неравномерной загрузке?",
                       "What difficulties do you hit when the load is uneven?"),
        "explain": T(
            "P — первый вопрос, где собеседник произносит вслух то, что ему не нравится. С этого "
            "момента разговор уже не про вашу цену, а про его положение.",
            "P is the first question where the other side says out loud what they do not like. From "
            "that moment the conversation is about their position, not your price."),
    },
    {
        "id": "sp-07", "block": "spin-ladder", "lesson": 4, "type": "choice",
        "difficulty": 2, "xp": 10, "scenario_id": "supplier",
        "prompt": T("Ирина признала, что простои дорого обходятся. Какой вопрос — ступень N?",
                    "Irina admitted idle time is costly. Which question is stage N?"),
        "options": [
            T("Насколько важно было бы закрыть загрузку на год вперёд?",
              "How valuable would it be to lock the year's utilization now?"),
            T("Сколько вы теряете, если линия стоит месяц?",
              "What does that cost you when the line is idle for a month?"),
            T("Как сейчас устроено планирование заказов?",
              "How is order planning set up today?"),
            T("Мы предлагаем 88 ₽ за штуку.", "We propose 88 per unit."),
        ],
        "answer": 0, "expect_moves": ["spin_needpayoff"],
        "explain": T(
            "N — единственный вопрос, где выгоду формулирует не вы, а собеседник. То, что человек "
            "сказал сам, он потом не оспаривает: в этом вся хитрость четвёртой ступени.",
            "N is the one question where the value is spoken by the other side, not by you. What "
            "people say themselves they do not argue with later — that is the trick of the fourth rung."),
    },
    # ---------------- 3. active-listening ---------------------------------
    {
        "id": "al-01", "block": "active-listening", "lesson": 1, "type": "choice",
        "difficulty": 1, "xp": 10, "scenario_id": "conflict",
        "prompt": T("Алексей: «Это вы сорвали сроки, а теперь мне объясняться перед директором». Ваш ход?",
                    "Alexey: “You missed the deadline and now I have to explain it to the director.” Your move?"),
        "options": [
            T("Это не наша вина, посмотрите на факты.", "That is not our fault, look at the facts."),
            T("Алексей, я вас слышу: на вас давит руководство. Что для вас важнее всего в этом статусе?",
              "Alexey, I hear you: leadership is pressing you. What matters most to you in that status update?"),
            T("Давайте эскалируем директору, пусть он решит.",
              "Let us escalate to the director and let him decide."),
            T("Вы не понимаете, как устроен наш процесс.", "You do not understand how our process works."),
        ],
        "answer": 1, "expect_moves": ["acknowledge", "interests_probe"],
        "explain": T(
            "Признать давление — не признать вину. Движок: доверие вверх, напряжение вниз, Информация "
            "+24, реакция «потеплел». Четвёртый вариант — грубость: доверие −22, напряжение +26.",
            "Acknowledging the pressure is not admitting fault. Engine: trust up, tension down, "
            "Information +24, reaction “warmed”. Option four is rudeness: trust −22, tension +26."),
    },
    {
        "id": "al-02", "block": "active-listening", "lesson": 2, "type": "freeform",
        "difficulty": 2, "xp": 15, "scenario_id": "conflict",
        "prompt": T("Отразите позицию Алексея и спросите, что за ней стоит. Без согласия с обвинением.",
                    "Reflect Alexey's position back and ask what is behind it. Without agreeing with the accusation."),
        "check": {"require_moves": ["acknowledge"], "require_any": ["interests_probe", "spin_problem"],
                  "forbid_moves": ["threat", "hostile"], "min_arg": 38, "min_words": 8},
        "reference": T(
            "Понимаю, что вам важно не выглядеть виноватым перед руководством. Что для вас важнее — "
            "сроки или как это будет подано наверх?",
            "I understand you must not look at fault to leadership. What matters more to you — the "
            "dates, or how this is framed upwards?"),
        "explain": T(
            "Два приёма в одной реплике: активное слушание (напряжение −10) плюс вскрытие интереса "
            "(Информация +24). Именно эта пара даёт самую тёплую реакцию в шкале.",
            "Two moves in one line: active listening (tension −10) plus an interest probe "
            "(Information +24). That pair yields the warmest rung on the scale."),
    },
    {
        "id": "al-03", "block": "active-listening", "lesson": 4, "type": "reaction",
        "difficulty": 2, "xp": 10, "scenario_id": "used_car", "seed_turn": 4,
        "opponent_line": T("Машина в идеале, я за ней следил каждый день.",
                           "The car is immaculate, I looked after it every single day."),
        "player_line": T("1200? Да она столько не стоит, это смешно.",
                         "1200? The car is not worth that, this is a joke."),
        "answer": "offended",
        "prompt": T("Что сейчас с Сергеем?", "Where is Sergey now?"),
        "explain": T(
            "Грубость: доверие −22, напряжение +26. Сергей привязан к машине — критика авто читается "
            "как критика его самого. Худшая реакция после ухода из-за стола.",
            "Rudeness: trust −22, tension +26. Sergey is attached to the car — criticising it reads as "
            "criticising him. The worst rung short of walking out."),
    },
    {
        "id": "al-04", "block": "active-listening", "lesson": 3, "type": "match",
        "difficulty": 2, "xp": 15,
        "prompt": T("Соедините ход игрока с реакцией, которую даст движок.",
                    "Match each player move to the reaction the engine returns."),
        "left": [
            {"id": "acknowledge", **T("Активное слушание", "Active listening")},
            {"id": "objective_criteria", **T("Объективный критерий", "Objective criterion")},
            {"id": "batna", **T("Упоминание альтернативы", "Naming your alternative")},
            {"id": "tradeoff", **T("Размен по вопросам", "A cross-issue trade")},
            {"id": "threat", **T("Ультиматум", "An ultimatum")},
        ],
        "right": [
            {"id": "warmed", **T("Потеплела", "Warmed up")},
            {"id": "persuaded", **T("Убеждена данными", "Persuaded by data")},
            {"id": "pressured", **T("Под давлением", "Pressured")},
            {"id": "collaborated", **T("Готова сотрудничать", "Ready to cooperate")},
            {"id": "hardened", **T("Закрылась", "Closed off")},
        ],
        "answer": {"acknowledge": "warmed", "objective_criteria": "persuaded", "batna": "pressured",
                   "tradeoff": "collaborated", "threat": "hardened"},
        "explain": T(
            "Это буквальная карта движка. Важно: если в одной реплике и критерий, и альтернатива — "
            "победит «под давлением», потому что блок альтернативы перезаписывает реакцию позже.",
            "This is the literal map inside the engine. Note: if one line carries both a criterion and "
            "an alternative, “pressured” wins — the alternative block overwrites the reaction later."),
    },
    {
        "id": "al-05", "block": "active-listening", "lesson": 1, "type": "meters",
        "difficulty": 3, "xp": 15, "scenario_id": "conflict",
        "state": {"trust": 35, "tension": 60, "info": 20, "leverage": 20, "turn": 5},
        "player_line": T("Понимаю, что вам важно не выглядеть виноватым перед руководством.",
                         "I understand you must not look at fault to leadership."),
        "ask": "largest_delta", "answer": "tension",
        "prompt": T("Какая шкала сдвинется сильнее всего?", "Which meter moves the most?"),
        "explain": T(
            "Активное слушание даёт доверие +8 и напряжение −10 — по модулю напряжение сильнее. И это "
            "важно на 60: пока напряжение выше 55, уступки режутся на 40%.",
            "Active listening gives trust +8 and tension −10 — tension moves more in absolute terms. "
            "That matters at 60: above 55, concessions are cut by 40%."),
    },

    # ---------------- 4. objective-criteria -------------------------------
    {
        "id": "oc-01", "block": "objective-criteria", "lesson": 2, "type": "choice",
        "difficulty": 2, "xp": 10, "scenario_id": "salary",
        "prompt": T("Что здесь — настоящий объективный критерий?",
                    "Which of these is a real objective criterion?"),
        "options": [
            T("Я стою больше, поверьте мне.", "I am worth more than that, trust me."),
            T("Отраслевой обзор зарплат по этой роли даёт 225k — вот три независимых источника.",
              "The industry salary survey for this role gives 225k — here are three independent sources."),
            T("У всех моих знакомых платят выше.", "Everyone I know is paid more than that."),
            T("Это несправедливо по отношению ко мне.", "This is simply unfair to me."),
        ],
        "answer": 1, "expect_moves": ["objective_criteria"],
        "explain": T(
            "Критерий — это внешний, проверяемый источник с цифрой. Остальные три движок читает как "
            "обычные заявления: рычаг +0. Критерий даёт рычаг +16, а Дмитрий аналитик — ещё +6.",
            "A criterion is an external, checkable source with a number. The other three read as plain "
            "statements: leverage +0. A criterion gives leverage +16 — and Dmitry is analytical, so "
            "another +6."),
    },
    {
        "id": "oc-02", "block": "objective-criteria", "lesson": 2, "type": "freeform",
        "difficulty": 2, "xp": 15, "scenario_id": "salary",
        "prompt": T("Обоснуйте 230k объективным критерием. Нужна цифра и источник.",
                    "Justify 230k with an objective criterion. A number and a source are required."),
        "check": {"require_moves": ["objective_criteria"], "forbid_moves": ["threat", "hostile"],
                  "require_number": True, "min_arg": 38, "min_words": 7},
        "reference": T(
            "Отраслевой стандарт для этой роли — 225–235k, вот независимая оценка по трём обзорам.",
            "The market rate for this role is 225–235k — here is independent benchmark data from three surveys."),
        "explain": T(
            "Судья ставит высокий балл только там, где есть конкретное число или источник; без них "
            "«рынок» и «стандарт индустрии» — это спам, а не аргумент. Офлайновая проверка требует "
            "того же: критерий плюс число.",
            "The judge scores high only where a concrete number or source is present; without them "
            "“market” and “industry standard” are spam, not argument. The offline check demands the "
            "same: a criterion plus a number."),
    },
    {
        "id": "oc-03", "block": "objective-criteria", "lesson": 3, "type": "spot_error",
        "difficulty": 2, "xp": 10, "scenario_id": "freelance_rate",
        "prompt": T("Что не так с этим обоснованием ставки?", "What is wrong with this rate justification?"),
        "bad_line": T("Моя ставка 19k в день, у меня большой опыт.",
                      "My rate is 19k a day, I have a lot of experience."),
        "options": [
            {"key": "threat", **T("Это давление", "It is pressure")},
            {"key": "claim_without_criteria", **T(
                "Утверждение без внешнего критерия: «большой опыт» нельзя проверить и нечем оспорить, значит нечем и убедить",
                "A claim with no external criterion: “a lot of experience” cannot be checked, so it cannot convince")},
            {"key": "position_no_interest", **T("Не спрошен интерес", "The interest was not probed")},
            {"key": "concession_without_trade", **T("Уступка без размена", "A concession with no trade")},
        ],
        "answer": 1, "fault_key": "claim_without_criteria",
        "explain": T(
            "Павел — аналитик, он убеждается цифрами. «Большой опыт» движок читает как предложение без "
            "критерия: рычаг +0. Замените на «отраслевой стандарт для сеньора на этом стеке — 19k, вот "
            "данные двух обзоров» → рычаг +16.",
            "Pavel is analytical — he is convinced by numbers. “A lot of experience” reads as an offer "
            "with no criterion: leverage +0. Swap it for “industry standard for a senior on this stack "
            "is 19k, here is data from two surveys” → leverage +16."),
    },
    {
        "id": "oc-04", "block": "objective-criteria", "lesson": 4, "type": "meters",
        "difficulty": 2, "xp": 10, "scenario_id": "salary",
        "state": {"trust": 45, "tension": 30, "info": 30, "leverage": 24, "turn": 4},
        "player_line": T("Отраслевой обзор зарплат по этой роли даёт 225k — вот три независимых источника.",
                         "The industry salary survey for this role gives 225k — here are three independent sources."),
        "ask": "largest_delta", "answer": "leverage",
        "prompt": T("Какая шкала сдвинется сильнее всего?", "Which meter moves the most?"),
        "explain": T(
            "Критерий: рычаг +16, плюс +6 за аналитический стиль. Доверие всего +3. Критерий — это про "
            "силу позиции, а не про тепло.",
            "The criterion gives leverage +16, plus +6 for the analytical style. Trust only +3. A "
            "criterion buys standing, not warmth."),
    },
    {
        "id": "oc-05", "block": "objective-criteria", "lesson": 4, "type": "numeric",
        "difficulty": 3, "xp": 15, "scenario_id": "salary",
        "prompt": T("Ваша цель 230k, красная линия 195k. Вы закрылись на 213k. Какой экономический балл поставит движок?",
                    "Your target is 230k, your red line 195k. You closed at 213k. What economic score does the engine give?"),
        "answer": {"value": 51, "tolerance": 1}, "unit": T("баллов", "points"),
        "explain": T(
            "Экономика = (сделка − красная линия) / (цель − красная линия) × 100 = (213 − 195)/(230 − 195) × 100 ≈ 51. "
            "Не «сколько вы получили», а «какую долю пути от красной линии до цели вы прошли».",
            "Economics = (deal − reservation)/(target − reservation) × 100 = (213 − 195)/(230 − 195) × 100 ≈ 51. "
            "Not “how much you got”, but “how far you travelled from your red line to your target”."),
    },


    {
        "id": "oc-06", "block": "objective-criteria", "lesson": 1, "type": "choice",
        "difficulty": 2, "xp": 10, "scenario_id": "salary",
        "prompt": T("Дмитрий: «У нас в компании такие бюджеты, и точка». Что переводит спор из мнений в критерии?",
                    "Dmitry: “These are our budgets, full stop.” What turns a clash of opinions into a clash of criteria?"),
        "options": [
            T("Бюджеты у всех, а я стою больше.", "Everyone has budgets, and I am worth more."),
            T("Отраслевой обзор зарплат по этой роли даёт медиану 225k — вот три независимых источника.",
              "The industry salary survey puts the median for this role at 225k — three independent sources."),
            T("Тогда я поищу другое место.", "Then I will look elsewhere."),
            T("Хорошо, я согласен на ваш бюджет.", "Fine, I accept your budget."),
        ],
        "answer": 1, "expect_moves": ["objective_criteria"],
        "explain": T(
            "Спор двух мнений выигрывает упрямый; спор двух критериев — тот, чей критерий уместнее. "
            "И проигравшему не приходится капитулировать: он уступает стандарту, а не человеку.",
            "A clash of opinions is won by the stubborn one; a clash of criteria by whoever's standard "
            "fits better. And the loser never capitulates: they yield to a standard, not to a person."),
    },
    # ---------------- 5. batna-zopa ---------------------------------------
    {
        "id": "bz-01", "block": "batna-zopa", "lesson": 1, "type": "numeric",
        "difficulty": 1, "xp": 10, "scenario_id": "supplier", "derive": "zopa_width",
        "prompt": T("Поставщик не пойдёт ниже 84 ₽/шт. Вы не заплатите больше 92. Какова ширина ZOPA?",
                    "The supplier will not go below 84/unit. You will not pay above 92. How wide is the ZOPA?"),
        "answer": {"value": 8, "tolerance": 0}, "unit": T("₽/шт", "/unit"),
        "explain": T(
            "ZOPA = [84, 92], ширина 8. Всё, о чём вы торгуетесь, — это распределение этих восьми "
            "рублей. Всё, что вне, — не сделка ни для кого.",
            "ZOPA = [84, 92], width 8. Everything you haggle over is the split of those eight. Anything "
            "outside is not a deal for anyone."),
    },
    {
        "id": "bz-02", "block": "batna-zopa", "lesson": 1, "type": "numeric",
        "difficulty": 2, "xp": 10, "scenario_id": "sla_renewal", "derive": "zopa_width",
        "prompt": T("Вендор физически не даст больше 99.9%. Вам не подходит ниже 99.4%. Какова ширина ZOPA в процентных пунктах?",
                    "The vendor cannot go above 99.9%. You cannot accept below 99.4%. How wide is the ZOPA in percentage points?"),
        "answer": {"value": 0.5, "tolerance": 0.01}, "unit": T("п.п.", "pp"),
        "explain": T(
            "Полпроцентного пункта — самая узкая ZOPA в игре. Отсюда правило блока про давление: в "
            "узкой зоне оно обходится дороже всего, потому что уступать почти нечем.",
            "Half a percentage point — the narrowest ZOPA in the game. Hence the rule about pressure: "
            "in a narrow zone it costs the most, because there is barely anything to concede."),
    },
    {
        "id": "bz-03", "block": "batna-zopa", "lesson": 2, "type": "choice",
        "difficulty": 3, "xp": 15, "scenario_id": "supplier",
        "prompt": T("Ваша альтернатива — другой поставщик по 95, но с рисками качества. При этом ваша красная линия 92, то есть СТРОЖЕ альтернативы. Почему это рационально?",
                    "Your alternative is another supplier at 95, but with quality risk. Yet your red line is 92 — STRICTER than the alternative. Why is that rational?"),
        "options": [
            T("Это ошибка в брифинге: красная линия должна быть 95.",
              "It is a briefing error: the red line should be 95."),
            T("Риск качества снижает реальную ценность альтернативы: платить 92 здесь выгоднее, чем 95 там.",
              "Quality risk lowers the alternative's real value: paying 92 here beats 95 there."),
            T("Красная линия всегда строже альтернативы.", "A red line is always stricter than the alternative."),
            T("Красная линия ставится по цели, а не по альтернативе.",
              "The red line is set from the target, not the alternative."),
        ],
        "answer": 1,
        "explain": T(
            "Правило: красная линия = ценность альтернативы ± стоимость переключения. У поставщика риск "
            "вычитается (92 < 95). В аренде наоборот: альтернатива 68, но +40 минут дороги, поэтому "
            "красная линия мягче — 70.",
            "The rule: red line = the alternative's value ± switching cost. With the supplier the risk "
            "is subtracted (92 < 95). In the rent case it is the reverse: the alternative is 68 but 40 "
            "minutes farther, so the red line is looser — 70."),
    },
    {
        "id": "bz-04", "block": "batna-zopa", "lesson": 3, "type": "freeform",
        "difficulty": 3, "xp": 20, "scenario_id": "salary",
        "prompt": T("Назовите свой второй оффер так, чтобы это был рычаг, а не угроза.",
                    "Name your second offer so that it reads as leverage, not as a threat."),
        "check": {"require_moves": ["batna"], "forbid_moves": ["threat", "hostile"],
                  "min_arg": 30, "min_words": 8},
        "reference": T(
            "У меня есть альтернативное предложение на 210k, но ваш проект мне интереснее — давайте искать решение здесь.",
            "I have an alternative offer at 210k, but your project interests me more — let us find a solution here."),
        "explain": T(
            "Альтернатива без подкрепления: рычаг +10, напряжение +14. С подкреплением: рычаг +18, "
            "напряжение всего +4. Разница — в том, сообщаете вы факт или угрожаете им.",
            "An unbacked alternative: leverage +10, tension +14. Backed: leverage +18, tension only +4. "
            "The difference is whether you are reporting a fact or brandishing it."),
    },
    {
        "id": "bz-05", "block": "batna-zopa", "lesson": 3, "type": "spot_error",
        "difficulty": 2, "xp": 10, "scenario_id": "salary",
        "prompt": T("Что не так с этой подачей альтернативы?", "What is wrong with this BATNA delivery?"),
        "bad_line": T("Или вы даёте 230k, или я ухожу к конкуренту.",
                      "Either you give me 230k or I walk to your competitor."),
        "options": [
            {"key": "claim_without_criteria", **T("Нет объективного критерия под цифрой 230k",
                                                  "No objective criterion under the 230k figure")},
            {"key": "batna_as_club", **T(
                "Альтернатива подана как дубина: она превращена в ультиматум, и теперь любое движение оппонента = его капитуляция",
                "The alternative is wielded as a club: it became an ultimatum, so any movement now reads as surrender")},
            {"key": "position_no_interest", **T("Не вскрыт интерес работодателя",
                                                "The employer's interest was not surfaced")},
            {"key": "repeat_same_line", **T("Повтор предыдущей реплики", "A repeat of the previous line")},
        ],
        "answer": 1, "fault_key": "batna_as_club",
        "explain": T(
            "Движок здесь видит и альтернативу, и угрозу разом: доверие вниз, напряжение вверх. "
            "Тот же факт, сказанный без ультиматума, дал бы рычаг и почти не поднял напряжение.",
            "The engine sees both an alternative and a threat at once: trust down, tension up. The same "
            "fact stated without the ultimatum would give leverage and barely raise tension."),
    },


    {
        "id": "bz-06", "block": "batna-zopa", "lesson": 4, "type": "meters",
        "difficulty": 2, "xp": 10, "scenario_id": "salary",
        "state": {"trust": 45, "tension": 30, "info": 20, "leverage": 30, "turn": 4},
        "player_line": T("Или вы даёте 230k, или я ухожу к конкуренту.",
                         "Either you give me 230k or I walk to your competitor."),
        "ask": "sign_of:trust", "answer": "down",
        "prompt": T("Что произойдёт с доверием?", "What happens to trust?"),
        "explain": T(
            "Доверие −14, напряжение вверх сразу на треть шкалы. Альтернатива, поданная как "
            "ультиматум, делает любое движение оппонента капитуляцией — а человеку, который "
            "отчитывается перед кем-то, капитулировать нельзя.",
            "Trust −14 and tension up by a third of the scale at once. An alternative delivered as an "
            "ultimatum turns any movement into a surrender — and someone who reports to a boss cannot "
            "afford to surrender."),
    },
    # ---------------- 6. anchoring ----------------------------------------
    {
        "id": "an-01", "block": "anchoring", "lesson": 1, "type": "numeric",
        "difficulty": 1, "xp": 10, "scenario_id": "used_car", "derive": "anchor_gap",
        "prompt": T("Сергей открылся на 1200k. Его настоящее дно — 1040k. На сколько якорь выше дна?",
                    "Sergey opened at 1200k. His real floor is 1040k. How far above the floor is the anchor?"),
        "answer": {"value": 160, "tolerance": 0}, "unit": T("k ₽", "k"),
        "explain": T(
            "160 тысяч — это не цена, это переговорный воздух. Именно поэтому первый номер нельзя "
            "принимать за точку отсчёта: он выбран так, чтобы утянуть ваши ожидания.",
            "160k is not price, it is negotiating air. That is exactly why a first number must not "
            "become your reference point: it was chosen to drag your expectations."),
    },
    {
        "id": "an-02", "block": "anchoring", "lesson": 3, "type": "choice",
        "difficulty": 2, "xp": 15, "scenario_id": "used_car",
        "prompt": T("Сергей: «1200, и я уже скинул». Лучший ответ?",
                    "Sergey: “1200, and I already came down.” Best response?"),
        "options": [
            T("900, и то много.", "900, and that is generous."),
            T("По объявлениям на такую же модель с этим пробегом рыночная цена 1080 — давайте отталкиваться от неё.",
              "Comparable listings for the same model at this mileage put the market price at 1080 — let us start there."),
            T("1200? Да она столько не стоит, это смешно.", "1200? The car is not worth that, this is a joke."),
            T("Хорошо, 1150 — моё последнее слово.", "Fine, 1150, that is my final word."),
        ],
        "answer": 1, "expect_moves": ["objective_criteria"],
        "explain": T(
            "Защита от якоря — не контр-цифра, а другая система координат. Второй вариант даёт "
            "«убеждён данными» и рычаг +16. Третий — обиду. Четвёртый — вы уже внутри его якоря.",
            "Defending against an anchor is not a counter-number, it is a different frame. Option two "
            "yields “persuaded” and leverage +16. Option three offends. Option four leaves you anchored."),
    },
    {
        "id": "an-03", "block": "anchoring", "lesson": 2, "type": "freeform",
        "difficulty": 3, "xp": 20, "scenario_id": "used_car",
        "prompt": T("Поставьте встречный якорь 1080 и подкрепите его критерием.",
                    "Set a counter-anchor at 1080 and back it with a criterion."),
        "check": {"require_moves": ["objective_criteria"], "forbid_moves": ["threat", "hostile"],
                  "require_number": True, "min_arg": 40, "min_words": 8},
        "reference": T(
            "По объявлениям на такую же модель с этим пробегом рыночная цена — 1080, давайте отталкиваться от неё.",
            "Comparable listings for the same model at this mileage put the market price at 1080 — let us start there."),
        "explain": T(
            "Голый встречный якорь — это война цифр. Тот же якорь с критерием даёт «убеждён данными», "
            "рычаг +16 и делает вашу цифру той, от которой считают.",
            "A bare counter-anchor is a war of numbers. The same anchor with a criterion yields "
            "“persuaded”, leverage +16, and makes YOUR number the one people count from."),
    },
    {
        "id": "an-04", "block": "anchoring", "lesson": 4, "type": "meters",
        "difficulty": 3, "xp": 15, "scenario_id": "used_car",
        "state": {"trust": 40, "tension": 25, "info": 0, "leverage": 20, "turn": 2},
        "player_line": T("1200? Да она столько не стоит, это смешно.",
                         "1200? The car is not worth that, this is a joke."),
        "ask": "sign_of:tension", "answer": "up",
        "prompt": T("Напряжение вырастет или упадёт?", "Does tension rise or fall?"),
        "explain": T(
            "Напряжение +26, доверие −22. А дальше механика мстит: при напряжении выше 55 уступки "
            "режутся на 40%, выше 75 — на 75%. Оскорбительный контр-якорь закрывает ту самую дверь, "
            "ради которой вы его ставили.",
            "Tension +26, trust −22. Then the mechanics take revenge: above 55 concessions are cut by "
            "40%, above 75 by 75%. An insulting counter-anchor shuts the very door you set it to open."),
    },
    {
        "id": "an-05", "block": "anchoring", "lesson": 3, "type": "order",
        "difficulty": 2, "xp": 10,
        "prompt": T("Расставьте шаги защиты от экстремального якоря.",
                    "Order the steps for defusing an extreme anchor."),
        "items": [
            {"id": "notice", **T("Назвать якорь якорем, не отвечая цифрой",
                                 "Name the anchor as an anchor, without answering with a number")},
            {"id": "interests", **T("Спросить, что стоит за его цифрой", "Ask what sits behind their number")},
            {"id": "criteria", **T("Предложить внешний критерий как систему отсчёта",
                                   "Offer an external criterion as the frame")},
            {"id": "counter", **T("Поставить свою цифру ВНУТРИ этого критерия",
                                  "Put your number INSIDE that criterion")},
        ],
        "answer": ["notice", "interests", "criteria", "counter"],
        "explain": T(
            "Цифру называют последней. Пока не найдена общая система отсчёта, любой ваш номер — просто "
            "второй якорь, и стол превращается в перетягивание каната.",
            "The number comes last. Until there is a shared frame, any number of yours is just a second "
            "anchor and the table becomes a tug of war."),
    },

    # ---------------- 7. logrolling ---------------------------------------
    {
        "id": "lr-01", "block": "logrolling", "lesson": 2, "type": "choice",
        "difficulty": 2, "xp": 15, "scenario_id": "supplier",
        "prompt": T("Годовой контракт: для Ирины ценность 0.85, вам стоит 0.2. Предоплата 30%: ценность 0.55, стоит 0.45. Что менять первым?",
                    "Annual commitment: worth 0.85 to Irina, costs you 0.2. 30% upfront: worth 0.55, costs 0.45. Which do you trade first?"),
        "options": [
            T("Предоплату — она проще в исполнении", "The upfront payment — it is simpler to execute"),
            T("Годовой контракт: максимум ценности для неё при минимуме затрат для вас",
              "The annual commitment: maximum value to her at minimum cost to you"),
            T("Обе сразу, чтобы показать добрую волю", "Both at once, to show good faith"),
            T("Ни одну — сначала выбить цену", "Neither — squeeze the price first"),
        ],
        "answer": 1,
        "explain": T(
            "Размен — это арифметика: уступать дешёвое для себя и дорогое для них. Пакетный балл "
            "10·0.85 − 6·0.2 = 7.3 против 2.8 у предоплаты, и уступка растёт сильнее.",
            "Logrolling is arithmetic: concede what is cheap for you and dear to them. Package score "
            "10·0.85 − 6·0.2 = 7.3 versus 2.8 for the prepayment, and the concession grows more."),
    },
    {
        "id": "lr-02", "block": "logrolling", "lesson": 3, "type": "numeric",
        "difficulty": 3, "xp": 15, "scenario_id": "supplier",
        "prompt": T("Вы разменяли ОБА вторичных вопроса. Сколько пакетный балл добавит к шкале «Приёмы»? Формула: 10·ценность_для_них − 6·стоимость_для_вас за каждый.",
                    "You traded BOTH secondary issues. How much does the package add to Technique? Formula: 10·value_to_them − 6·cost_to_you each."),
        "answer": {"value": 10.1, "tolerance": 0.2}, "unit": T("баллов", "points"),
        "explain": T(
            "(10·0.85 − 6·0.2) + (10·0.55 − 6·0.45) = 7.3 + 2.8 = 10.1. Потолок вклада +16, так что "
            "даже идеальный пакет не подменяет собой остальную технику.",
            "(10·0.85 − 6·0.2) + (10·0.55 − 6·0.45) = 7.3 + 2.8 = 10.1. The contribution is capped at "
            "+16, so even a perfect package cannot stand in for the rest of the technique."),
    },
    {
        "id": "lr-03", "block": "logrolling", "lesson": 4, "type": "freeform",
        "difficulty": 2, "xp": 15, "scenario_id": "sla_renewal",
        "prompt": T("Предложите Виктору связанный размен: длинный контракт против уровня SLA.",
                    "Offer Viktor a linked trade: a longer term against the SLA level."),
        "check": {"require_moves": ["tradeoff"], "forbid_moves": ["threat", "hostile"],
                  "min_arg": 38, "min_words": 8},
        "reference": T(
            "Если мы продлим на 3 года и введём ступенчатый SLA, сможете ли вы дать 99.8% со второго квартала?",
            "If we renew for 3 years with a phased SLA, can you move on uptime to 99.8% from Q2?"),
        "explain": T(
            "Ключ — связка «если … то». Без неё движок увидит уступку (вы просто отдали), а не размен "
            "(вы обменяли). Размен даёт доверие +6, напряжение −4 и открывает вторую ось движения.",
            "The key is the “if … then” link. Without it the engine sees a concession (you gave it away) "
            "rather than a trade (you exchanged it). A trade gives trust +6, tension −4 and opens a "
            "second axis of movement."),
    },
    {
        "id": "lr-04", "block": "logrolling", "lesson": 4, "type": "reaction",
        "difficulty": 1, "xp": 10, "scenario_id": "supplier", "seed_turn": 6,
        "opponent_line": T("Ниже 95 я не пойду, у меня своя маржа.",
                           "I will not go below 95, I have my own margin."),
        "player_line": T("Если мы дадим годовой контракт с гарантией объёма, сможете ли вы подвинуться по цене до 88?",
                         "If we give an annual volume commitment, can you move on price to 88?"),
        "answer": "collaborated",
        "prompt": T("Что произошло с Ириной?", "What happened to Irina?"),
        "explain": T(
            "Размен — единственный ход, дающий «готова сотрудничать». Он же двигает её цену сильнее "
            "всего в игре: к базовой уступке добавляется вклад годового контракта.",
            "A trade is the only move that yields “collaborated”. It also moves her price more than "
            "anything else in the game: the annual commitment stacks on the base concession."),
    },
    {
        "id": "lr-05", "block": "logrolling", "lesson": 2, "type": "match",
        "difficulty": 3, "xp": 15,
        "prompt": T("Соедините вторичный вопрос с интересом, который он закрывает.",
                    "Match each secondary issue to the interest it satisfies."),
        "left": [
            {"id": "annual_contract", **T("Годовой контракт с гарантией объёма (поставщик)",
                                          "Annual volume commitment (supplier)")},
            {"id": "board_seat", **T("Место в совете директоров (инвестор)", "Board seat (investor)")},
            {"id": "joint_status", **T("Совместный статус для руководства (конфликт)",
                                       "Joint status to leadership (conflict)")},
            {"id": "long_lease", **T("Договор на 11+ месяцев (аренда)", "11+ month lease (rent)")},
        ],
        "right": [
            {"id": "i_util", **T("Стабильная загрузка производства", "Stable factory utilization")},
            {"id": "i_control", **T("Контроль без изъятия доли фаундера", "Control without taking the founder's equity")},
            {"id": "i_blame", **T("Не выглядеть виноватым перед руководством", "Not look at fault to leadership")},
            {"id": "i_vacancy", **T("Избежать простоя и пустых месяцев", "Avoid vacancy and empty months")},
        ],
        "answer": {"annual_contract": "i_util", "board_seat": "i_control",
                   "joint_status": "i_blame", "long_lease": "i_vacancy"},
        "explain": T(
            "У каждой фишки ценность для оппонента 0.8–0.85 именно потому, что она бьёт прямо в "
            "скрытый интерес. Вторичные вопросы не выдуманы — они выведены из интересов.",
            "Every one of these chips is worth 0.8–0.85 to the counterpart precisely because it lands "
            "on a hidden interest. The secondary issues are not invented — they are derived from them."),
    },


    {
        "id": "lr-06", "block": "logrolling", "lesson": 1, "type": "freeform",
        "difficulty": 2, "xp": 15, "scenario_id": "supplier",
        "prompt": T("Спор идёт только про цену. Добавьте вторую ось: свяжите условие контракта с ценой.",
                    "The argument is about price only. Add a second axis: link a contract term to the price."),
        # Порог по аргументу низкий намеренно: урок про ВТОРУЮ ОСЬ, а не про
        # цифры. Связка «если … то» без числа и есть правильный ответ здесь,
        # а движок за отсутствие числа снимает прибавку за размен.
        "check": {"require_moves": ["tradeoff"], "forbid_moves": ["threat", "hostile"],
                  "min_arg": 26, "min_words": 8},
        "reference": T("Давайте свяжем срок контракта с ценой: если мы даём годовой объём, вы двигаетесь по цене?",
                       "Let us link the term to the price: if we give an annual volume, can you move on price?"),
        "explain": T(
            "Пока обсуждается одна цена, выигрыш одного равен проигрышу другого. Второй вопрос — "
            "срок, объём, график платежей — создаёт варианты, где выигрывают оба.",
            "While only price is on the table, one side's gain is the other's loss. A second issue — "
            "term, volume, payment schedule — creates options where both sides win."),
    },
    # ---------------- 8. pressure-defense ---------------------------------
    {
        "id": "pd-01", "block": "pressure-defense", "lesson": 1, "type": "choice",
        "difficulty": 2, "xp": 15, "scenario_id": "sla_renewal",
        "prompt": T("Виктор: «99.5% — потолок. Это не обсуждается». Ваш ход?",
                    "Viktor: “99.5% is the ceiling. Non-negotiable.” Your move?"),
        "options": [
            T("Тогда мы уходим к конкуренту, у них 99.7%.",
              "Then we go to your competitor, they offer 99.7%."),
            T("Понимаю, что вам важно не брать штрафы. Что именно делает 99.9% невозможным для вашей эксплуатации?",
              "I understand you must not take penalties. What exactly makes 99.9% impossible for your ops team?"),
            T("Всё обсуждается, не начинайте.", "Everything is negotiable, do not start."),
            T("Хорошо, пусть 99.5%.", "Fine, let us say 99.5%."),
        ],
        "answer": 1, "expect_moves": ["acknowledge"],
        "explain": T(
            "Ультиматум — это упаковка, внутри почти всегда страх. «Не брать штрафы, которые не "
            "вытянет эксплуатация» — реальный интерес Виктора. Первый вариант закрывает его: "
            "жёсткий стиль добавляет ещё +8 к напряжению.",
            "An ultimatum is packaging; a fear usually sits inside. “Avoid penalties the ops team "
            "cannot sustain” is Viktor's real interest. Option one hardens him: the tough style adds "
            "a further +8 tension."),
    },
    {
        "id": "pd-02", "block": "pressure-defense", "lesson": 1, "type": "freeform",
        "difficulty": 3, "xp": 20, "scenario_id": "sla_renewal",
        "prompt": T("Не отступите и не пригрозите: верните разговор к объективному критерию.",
                    "Do not retreat and do not threaten: bring the conversation back to an objective criterion."),
        "check": {"require_moves": ["objective_criteria"], "forbid_moves": ["threat", "hostile"],
                  "min_arg": 40, "min_words": 10},
        "reference": T(
            "Я слышу, что это ваше последнее слово. Давайте вернёмся к цифрам: отраслевой стандарт — 99.9%, и наш простой стоит 2.4 млн в час.",
            "I hear that this is your final word. Let us go back to the numbers: the industry standard is 99.9% and our downtime costs 2.4m an hour."),
        "explain": T(
            "Это гарвардское «джиу-джитсу»: не отвечать на атаку атакой, а переводить её в вопрос "
            "критерия. Реакция «убеждён данными», рычаг +16, напряжение не растёт. Ультиматум в ответ "
            "дал бы +30 к напряжению.",
            "This is Harvard negotiation jujitsu: do not answer an attack with an attack, redirect it "
            "into a question of criteria. Reaction “persuaded”, leverage +16, no rise in tension. A "
            "counter-ultimatum would have cost +30 tension."),
    },
    {
        "id": "pd-03", "block": "pressure-defense", "lesson": 3, "type": "numeric",
        "difficulty": 3, "xp": 15,
        "prompt": T("Ваша расчётная уступка на этом ходу — 0.40. Напряжение оппонента 80. Какой она станет фактически?",
                    "Your computed concession this turn is 0.40. The opponent's tension is 80. What does it actually become?"),
        "answer": {"value": 0.10, "tolerance": 0.005}, "unit": T("доли", "fraction"),
        "explain": T(
            "При напряжении выше 75 движок умножает уступку на 0.25: 0.40 × 0.25 = 0.10. Между 55 и 75 "
            "— на 0.6. Это цена давления в чистом виде: вы получаете рычаг и замораживаете возможность "
            "им воспользоваться.",
            "Above 75 tension the engine multiplies the concession by 0.25: 0.40 × 0.25 = 0.10. Between "
            "55 and 75 it is 0.6. This is the price of pressure in its purest form: you gain leverage "
            "and freeze your ability to use it."),
    },
    {
        "id": "pd-04", "block": "pressure-defense", "lesson": 4, "type": "spot_error",
        "difficulty": 2, "xp": 10, "scenario_id": "supplier",
        "prompt": T("Игрок отправил эту реплику ДВАЖДЫ подряд. В чём главная проблема второго раза?",
                    "The player sent this line TWICE in a row. What is the main problem with the second send?"),
        "bad_line": T("Рыночная цена на такие комплектующие — 88 ₽/шт, по трём независимым прайсам.",
                      "The market rate for these components is 88 per unit, from three independent price lists."),
        "options": [
            {"key": "claim_without_criteria", **T("Реплика без критерия", "The line has no criterion")},
            {"key": "repeat_same_line", **T(
                "Дословный повтор: движок опускает качество аргумента до 12 и режет уступку до 15% — настойчивость не равна аргументу",
                "A verbatim repeat: the engine drops argument quality to 12 and cuts the concession to 15% — persistence is not argument")},
            {"key": "threat", **T("Это звучит как ультиматум", "It sounds like an ultimatum")},
            {"key": "position_no_interest", **T("Не задан вопрос об интересе", "No interest question was asked")},
        ],
        "answer": 1, "fault_key": "repeat_same_line",
        "explain": T(
            "Первый раз эта реплика даёт «убеждена данными» и рычаг +16. Второй — качество аргумента "
            "≤12 и уступка ×0.15. Анти-гейминг встроен в движок: одно и то же, сказанное громче, не работает.",
            "The first send yields “persuaded” and leverage +16. The second: argument quality ≤12 and "
            "concession ×0.15. Anti-gaming is built into the engine: the same thing said louder does "
            "not work."),
    },
    {
        "id": "pd-05", "block": "pressure-defense", "lesson": 2, "type": "reaction",
        "difficulty": 2, "xp": 10, "scenario_id": "supplier", "seed_turn": 5,
        "opponent_line": T("95 — и это уже с уважением к вам.", "95 — and that is already out of respect for you."),
        "player_line": T("Это ваше последнее слово? Иначе мы уходим.", "Is that your final offer? Or else we walk."),
        "answer": "hardened",
        "prompt": T("Что произошло с Ириной?", "What happened to Irina?"),
        "explain": T(
            "Угроза: доверие вниз, напряжение вверх, цена почти не двигается — против заметного "
            "движения от размена. Угроза перебивает вопрос в определении реакции, потому что её блок "
            "выполняется позже.",
            "A threat: trust down, tension up, and the price barely moves — against a clear move from a "
            "trade. The threat overrides the question in the reaction, because its block runs later."),
    },

    # ---------------- 9. closing ------------------------------------------
    {
        "id": "cl-01", "block": "closing", "lesson": 1, "type": "numeric",
        "difficulty": 3, "xp": 20, "scenario_id": "supplier",
        "prompt": T("На столе: её 88, ваши 84. Гибкость 0.5. Точка встречи = её_цифра + (ваша − её) × (0.3 + 0.45 × гибкость). На чём закроется сделка?",
                    "On the table: hers 88, yours 84. Flexibility 0.5. Meeting point = theirs + (yours − theirs) × (0.3 + 0.45 × flex). Where does it close?"),
        "answer": {"value": 85.9, "tolerance": 0.1}, "unit": T("₽/шт", "/unit"),
        "explain": T(
            "w = 0.3 + 0.45 × 0.5 = 0.525; 88 + (84 − 88) × 0.525 = 85.9. При гибкости 0.7 было бы "
            "85.54. Всё, что вы делали десять ходов — доверие, информация, рычаг — окупается здесь.",
            "w = 0.3 + 0.45 × 0.5 = 0.525; 88 + (84 − 88) × 0.525 = 85.9. At flexibility 0.7 it would "
            "be 85.54. Everything you built over ten turns cashes out right here."),
    },
    {
        "id": "cl-02", "block": "closing", "lesson": 2, "type": "choice",
        "difficulty": 2, "xp": 10, "scenario_id": "supplier",
        "prompt": T("Дно Ирины — 84. Вы говорите «по рукам на 80». Что произойдёт?",
                    "Irina's floor is 84. You say “deal at 80”. What happens?"),
        "options": [
            T("Сделка закроется на 80 — вы же согласились", "The deal closes at 80 — you agreed, after all"),
            T("Сделка закроется на 84, её дне", "The deal closes at 84, her floor"),
            T("Сделки не будет: реакция «пока нет», стол остаётся открытым",
              "No deal: reaction “not yet”, the table stays open"),
            T("Переговоры сорвутся", "The talks collapse"),
        ],
        "answer": 2,
        "explain": T(
            "Первый инвариант движка: оппонент НИКОГДА не переходит своё дно. Точка встречи ниже 84 "
            "отклоняется, статус остаётся активным, реакция — «пока нет».",
            "Engine invariant one: the opponent NEVER crosses their floor. A meeting point below 84 is "
            "rejected, the status stays active, the reaction is “not yet”."),
    },
    {
        "id": "cl-03", "block": "closing", "lesson": 3, "type": "freeform",
        "difficulty": 2, "xp": 15, "scenario_id": "supplier",
        "prompt": T("Зафиксируйте сделку: цифра + условие пакета.",
                    "Lock the deal in: the number plus the package term."),
        "check": {"require_moves": ["accept"], "forbid_moves": ["threat", "hostile"],
                  "require_number": True, "min_words": 6},
        "reference": T("Тогда фиксируем: 88 ₽/шт при годовом контракте. По рукам?",
                       "Then we have a deal at 88 per unit with an annual volume commitment."),
        "explain": T(
            "Закрытие без цифры движок закроет на ЕЁ последнем номере — вы подарите весь остаток зоны. "
            "Цифра в закрывающей реплике стоит реальных денег.",
            "A close with no number settles at HER last number — you hand over the whole remaining "
            "zone. The figure in a closing line is worth real money."),
    },
    {
        "id": "cl-04", "block": "closing", "lesson": 4, "type": "numeric",
        "difficulty": 3, "xp": 20,
        "prompt": T("Экономика 95, Отношения 80, Приёмы 40. Посчитайте итог: 0.4·эко + 0.25·отн + 0.35·приёмы.",
                    "Economics 95, Relationship 80, Technique 40. Compute the overall: 0.4·eco + 0.25·rel + 0.35·tech."),
        "answer": {"value": 72, "tolerance": 0}, "unit": T("баллов", "points"),
        "explain": T(
            "0.4·95 + 0.25·80 + 0.35·40 = 38 + 20 + 14 = 72, то есть грейд B. НО: приёмы 40 < 45, "
            "поэтому потолок опускается до C. Отличная цена без метода не даёт A/B — это тезис "
            "Гарварда, зашитый в код.",
            "0.4·95 + 0.25·80 + 0.35·40 = 38 + 20 + 14 = 72, i.e. grade B. BUT: technique 40 < 45, so "
            "the ceiling drops to C. A great price bought without method never earns A/B — the Harvard "
            "thesis, written into the code."),
    },
    {
        "id": "cl-05", "block": "closing", "lesson": 4, "type": "drill",
        "difficulty": 3, "xp": 40, "scenario_id": "supplier", "max_turns": 6,
        "prompt": T("Капстоун. Закройте сделку не дороже 88 ₽/шт за 6 ходов, вскрыв минимум два интереса и не подняв напряжение выше 45.",
                    "Capstone. Close at 88/unit or better within 6 turns, uncovering at least two interests and never pushing tension above 45."),
        "goal": T("Сделка ≤ 88 · два интереса · напряжение ≤ 45",
                  "Deal ≤ 88 · two interests · tension ≤ 45"),
        "pass": [
            {"field": "status", "op": "==", "value": "agreement"},
            {"field": "deal", "op": "<=", "value": 88},
            {"field": "interests_found", "op": ">=", "value": 2},
            {"field": "tension", "op": "<=", "value": 45},
        ],
        "explain": T(
            "Все четыре условия одновременно достижимы только принципиальной игрой: вопросы дают "
            "Информацию, критерий даёт Рычаг, размен даёт вторую ось, слушание держит Напряжение.",
            "All four conditions hold together only under principled play: questions give Information, "
            "a criterion gives Leverage, a trade opens the second axis, listening keeps Tension down."),
    },
]

BY_ID: dict[str, dict] = {x["id"]: x for x in BANK}


def for_block(block_id: str) -> list[dict]:
    return [x for x in BANK if x["block"] == block_id]
