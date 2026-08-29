// СГЕНЕРИРОВАНО. Не править руками.
// Источник: services/gateway/app/course/{blocks,bank}.py
// Обновить: cd services/gateway && python tools/sync_course.py
//
// ЗДЕСЬ БАНК УПРАЖНЕНИЙ. Курс проверяется офлайн тем же движком-зеркалом, что и
// партия без сети, поэтому банк обязан быть здесь целиком. Правильность каждого
// пункта доказывается на стороне Python (tests/test_course_bank.py) — против
// настоящего analyze()/apply_move().

import type { Exercise } from "../lib/courseTypes";

export const COURSE_BANK: Exercise[] = [
  {
    "id": "fo-01",
    "block": "foundations",
    "lesson": 1,
    "type": "choice",
    "difficulty": 1,
    "xp": 10,
    "scenario_id": "rent",
    "prompt": {
      "ru": "Наталья: «75 тысяч, и это окончательная цена». Ваш ход?",
      "en": "Natalia: “75k, and that is final.” Your move?"
    },
    "options": [
      {
        "ru": "А если 65? Мне это дорого.",
        "en": "What about 65? That is too much for me."
      },
      {
        "ru": "Наталья, что для вас важнее всего — чтобы квартира не пустовала, или чтобы жилец был тихий и без хлопот?",
        "en": "Natalia, what matters most to you — avoiding vacancy between tenants, or a quiet tenant with no hassle?"
      },
      {
        "ru": "У меня есть другая квартира за 68, я подумаю.",
        "en": "I have another flat at 68, I will think about it."
      },
      {
        "ru": "Окончательных цен не бывает.",
        "en": "There is no such thing as a final price."
      }
    ],
    "answer": 1,
    "expect_moves": [
      "interests_probe"
    ],
    "explain": {
      "ru": "«75 тысяч» — позиция. Пока вы торгуетесь с ней, у стола одна ось и кто-то обязан проиграть. Вопрос назвал тему — простой и тихого жильца, — поэтому интерес вскрылся: Информация +24, и цена поедет сама.",
      "en": "“75k” is a position. Haggle with it and the table has one axis and someone has to lose. The question named a topic — vacancy and a quiet tenant — so the interest opened: Information +24, and the price moves on its own."
    }
  },
  {
    "id": "fo-02",
    "block": "foundations",
    "lesson": 1,
    "type": "spot_error",
    "difficulty": 1,
    "xp": 10,
    "scenario_id": "rent",
    "prompt": {
      "ru": "Что здесь не так?",
      "en": "What is wrong here?"
    },
    "bad_line": {
      "ru": "Мне это дорого, скиньте 10 тысяч.",
      "en": "That is too expensive, knock ten thousand off."
    },
    "options": [
      {
        "key": "hostile",
        "ru": "Реплика груба",
        "en": "The line is rude"
      },
      {
        "key": "position_no_interest",
        "ru": "Это позиция без интереса и без обоснования: нет ни одной причины, почему она должна согласиться",
        "en": "A position with no interest and no grounding: not one reason why she should agree"
      },
      {
        "key": "threat",
        "ru": "Это ультиматум",
        "en": "It is an ultimatum"
      },
      {
        "key": "anchor_without_rationale",
        "ru": "Слишком низкий якорь",
        "en": "The anchor is too low"
      }
    ],
    "answer": 1,
    "fault_key": "position_no_interest",
    "explain": {
      "ru": "Движок видит здесь только предложение цены — ни вопроса, ни критерия, ни эмпатии. Реакция нейтральная, шкалы не двигаются. «Дорого» — это про вас, а не про неё.",
      "en": "The engine sees only a price offer — no question, no criterion, no empathy. The reaction is neutral and the meters do not move. “Expensive” is about you, not about her."
    }
  },
  {
    "id": "fo-03",
    "block": "foundations",
    "lesson": 2,
    "type": "order",
    "difficulty": 2,
    "xp": 15,
    "prompt": {
      "ru": "Расставьте четыре принципа Гарвардского метода в порядке, в котором их применяют за столом.",
      "en": "Put the four Harvard principles in the order you apply them at the table."
    },
    "items": [
      {
        "id": "people",
        "ru": "Отделить человека от проблемы",
        "en": "Separate the people from the problem"
      },
      {
        "id": "interests",
        "ru": "Смотреть на интересы, а не на позиции",
        "en": "Focus on interests, not positions"
      },
      {
        "id": "options",
        "ru": "Изобрести варианты к взаимной выгоде",
        "en": "Invent options for mutual gain"
      },
      {
        "id": "criteria",
        "ru": "Настаивать на объективных критериях",
        "en": "Insist on objective criteria"
      }
    ],
    "answer": [
      "people",
      "interests",
      "options",
      "criteria"
    ],
    "explain": {
      "ru": "Порядок не декоративный. Пока человек защищается, он не расскажет интерес. Пока интересы скрыты, изобретать нечего. Пока вариантов нет, критерий нечем применить.",
      "en": "The order is not decorative. While a person is defending themselves they will not name an interest. While interests are hidden there is nothing to invent. With no options there is nothing to apply a criterion to."
    }
  },
  {
    "id": "fo-04",
    "block": "foundations",
    "lesson": 3,
    "type": "freeform",
    "difficulty": 2,
    "xp": 15,
    "scenario_id": "rent",
    "prompt": {
      "ru": "Задайте Наталье вопрос, который вскроет её настоящий интерес. Не про цену.",
      "en": "Ask Natalia a question that surfaces her real interest. Not about price."
    },
    "check": {
      "require_moves": [
        "interests_probe"
      ],
      "forbid_moves": [
        "threat",
        "hostile"
      ],
      "min_arg": 30,
      "min_words": 5
    },
    "reference": {
      "ru": "Наталья, что для вас важнее всего — чтобы квартира не пустовала, или чтобы жилец был тихий и без хлопот?",
      "en": "Natalia, what matters most to you — avoiding vacancy between tenants, or a quiet tenant with no hassle?"
    },
    "explain": {
      "ru": "Условий два. Формулировка «что для вас важно» — голое «почему?» движок засчитает как обычный открытый вопрос, ноль к Информации. И названная ТЕМА: вопрос обязан попасть в слова ещё не вскрытого интереса — простой, тишина, оплата в срок. Не попал — Наталья переспросит, а Информация вырастет на 5 вместо 24.",
      "en": "Two conditions. The wording — “what matters to you”; a bare “why?” classifies as a plain open question, zero Information. And a named TOPIC: the question has to land on the words of an interest that is still hidden — vacancy, quiet, payment on time. Miss it, and Natalia asks back while Information rises by 5 instead of 24."
    }
  },
  {
    "id": "fo-05",
    "block": "foundations",
    "lesson": 2,
    "type": "match",
    "difficulty": 2,
    "xp": 15,
    "prompt": {
      "ru": "Соедините позицию с интересом, который за ней стоит.",
      "en": "Match each position to the interest behind it."
    },
    "left": [
      {
        "id": "p_rent",
        "ru": "«75 тысяч, и это окончательно» (аренда)",
        "en": "“75k and that is final” (rent)"
      },
      {
        "id": "p_supplier",
        "ru": "«100 ₽ за штуку, дешевле не работаем» (поставщик)",
        "en": "“100 per unit, no lower” (supplier)"
      },
      {
        "id": "p_conflict",
        "ru": "«Это вы сорвали сроки» (смежный отдел)",
        "en": "“You are the ones who missed the deadline” (partner team)"
      }
    ],
    "right": [
      {
        "id": "i_vacancy",
        "ru": "Страх простоя и пустых месяцев",
        "en": "Fear of vacancy and empty months"
      },
      {
        "id": "i_utilization",
        "ru": "Стабильная загрузка производства",
        "en": "Stable factory utilization"
      },
      {
        "id": "i_face",
        "ru": "Не выглядеть виноватым перед руководством",
        "en": "Not look at fault to leadership"
      }
    ],
    "answer": {
      "p_rent": "i_vacancy",
      "p_supplier": "i_utilization",
      "p_conflict": "i_face"
    },
    "explain": {
      "ru": "Все три интереса — настоящие, из скрытых интересов этих сценариев. Позиция всегда громче интереса, поэтому её слышно, а его — нет.",
      "en": "All three interests are real, taken from these scenarios' hidden interests. A position is always louder than an interest — that is why you hear one and not the other."
    }
  },
  {
    "id": "fo-06",
    "block": "foundations",
    "lesson": 4,
    "type": "meters",
    "difficulty": 2,
    "xp": 10,
    "scenario_id": "rent",
    "state": {
      "trust": 40,
      "tension": 25,
      "info": 0,
      "leverage": 12,
      "turn": 2
    },
    "player_line": {
      "ru": "Наталья, что для вас важнее всего — чтобы квартира не пустовала, или чтобы жилец был тихий и без хлопот?",
      "en": "Natalia, what matters most to you — avoiding vacancy between tenants, or a quiet tenant with no hassle?"
    },
    "ask": "largest_delta",
    "answer": "info",
    "prompt": {
      "ru": "Какая шкала сдвинется сильнее всего?",
      "en": "Which meter moves the most?"
    },
    "explain": {
      "ru": "Информация +24 — больше, чем даёт любой другой ход. Доверие тоже подрастает, но заметно меньше: вопрос про интерес нужен ради того, что вы УЗНАЁТЕ, а не ради тепла.",
      "en": "Information +24 — more than any other move grants. Trust rises too, but far less: an interest question is for what you LEARN, not for warmth."
    }
  },
  {
    "id": "fo-07",
    "block": "foundations",
    "lesson": 4,
    "type": "drill",
    "difficulty": 2,
    "xp": 40,
    "scenario_id": "rent",
    "max_turns": 6,
    "prompt": {
      "ru": "Капстоун. Снимите квартиру не дороже 68k ₽/мес за 6 ходов, вскрыв минимум два интереса Натальи.",
      "en": "Capstone. Rent the flat at 68k/mo or less within 6 turns, having uncovered at least two of Natalia's interests."
    },
    "goal": {
      "ru": "Сделка ≤ 68k · два интереса",
      "en": "Deal ≤ 68k · two interests"
    },
    "pass": [
      {
        "field": "status",
        "op": "==",
        "value": "agreement"
      },
      {
        "field": "interests_found",
        "op": ">=",
        "value": 2
      },
      {
        "field": "deal",
        "op": "<=",
        "value": 68
      }
    ],
    "explain": {
      "ru": "Ни один из трёх интересов Натальи не про деньги — поэтому спор о цене её не двигает. Цена поехала ровно тогда, когда вы спросили про жильца: это и есть весь блок, проверенный не узнаванием, а партией.",
      "en": "Not one of Natalia's three interests is about money — which is why arguing price does not move her. The price moved the moment you asked about the tenant: that is the whole block, checked by playing rather than by recognising."
    }
  },
  {
    "id": "fo-08",
    "block": "foundations",
    "lesson": 5,
    "type": "meters",
    "difficulty": 3,
    "xp": 15,
    "scenario_id": "rent",
    "state": {
      "trust": 18,
      "tension": 45,
      "info": 8,
      "leverage": 10,
      "turn": 3
    },
    "player_line": {
      "ru": "Понимаю, что для вас это непросто. Наталья, что для вас важнее всего — чтобы квартира не пустовала, или чтобы жилец был тихий и без хлопот?",
      "en": "I understand this is not easy for you. Natalia, what matters most to you — avoiding vacancy between tenants, or a quiet tenant with no hassle?"
    },
    "ask": "largest_delta",
    "answer": "tension",
    "prompt": {
      "ru": "Доверие 18 — ниже порога вскрытия. Вы отражаете чувство и задаёте ТОТ ЖЕ вопрос про жильца. Какая шкала сдвинется сильнее всего?",
      "en": "Trust is 18 — below the reveal gate. You name the feeling and ask the SAME tenant question. Which meter moves the most?"
    },
    "explain": {
      "ru": "Не Информация: она выросла на 5, а не на 24. Интерес не вскрылся, потому что доверие 18 ниже порога 30, и вопрос вернулся переспросом. Сильнее всего сдвинулось напряжение (−13): отражение чувства снимает 10, вопрос ещё 3. Это и есть правильный ход — доверие стало 30, а порог нужно ПЕРЕЙТИ, поэтому следующая тёплая реплика откроет дверь.",
      "en": "Not Information: it rose by 5, not by 24. The interest did not open because trust of 18 is below the gate of 30, and the question came back as a query. What moved most is tension (−13): naming the feeling takes off 10, the question another 3. And that is the right move — trust is now 30, and the gate has to be CROSSED, so one more warm line opens the door."
    }
  },
  {
    "id": "fo-09",
    "block": "foundations",
    "lesson": 5,
    "type": "choice",
    "difficulty": 3,
    "xp": 15,
    "scenario_id": "rent",
    "prompt": {
      "ru": "Разговор пошёл криво: доверие 18, напряжение 45. На вопрос про жильца Наталья ответила «а что именно вас интересует?». Ваш ход?",
      "en": "The conversation soured: trust 18, tension 45. To the tenant question Natalia replied “what exactly are you asking about?”. Your move?"
    },
    "options": [
      {
        "ru": "Наталья, что для вас важнее всего — чтобы квартира не пустовала, или чтобы жилец был тихий и без хлопот?",
        "en": "Natalia, what matters most to you — avoiding vacancy between tenants, or a quiet tenant with no hassle?"
      },
      {
        "ru": "Мы предлагаем 60, это наша цена.",
        "en": "We propose 60, that is our price."
      },
      {
        "ru": "Понимаю: пустая квартира — это реальные потери, и осторожность тут естественна.",
        "en": "I understand: an empty flat is a real loss, and being careful is only natural."
      },
      {
        "ru": "Либо 65, либо я снимаю у соседей — решайте.",
        "en": "Either 65, or I rent from the neighbours — your call."
      }
    ],
    "answer": 2,
    "expect_moves": [
      "acknowledge"
    ],
    "explain": {
      "ru": "Повторить вопрос — получить тот же переспрос: под порогом доверия он не вскрывает ничего, а движок ещё и режет прибавку к Информации до 5. Сначала доверие: отражение чувства даёт +8 и снимает 10 напряжения — и только потом тот же самый вопрос.",
      "en": "Repeat the question and you get the same query back: below the trust gate it opens nothing, and the engine caps the Information gain at 5. Trust first: naming the feeling adds 8 and takes 10 off tension — and only then the very same question."
    }
  },
  {
    "id": "fo-10",
    "block": "foundations",
    "lesson": 1,
    "type": "reaction",
    "difficulty": 1,
    "xp": 10,
    "scenario_id": "rent",
    "seed_turn": 2,
    "player_line": {
      "ru": "Мне это дорого, скиньте 10 тысяч.",
      "en": "That is too expensive, knock ten thousand off."
    },
    "answer": "neutral",
    "prompt": {
      "ru": "Как отреагирует Наталья?",
      "en": "How will Natalia react?"
    },
    "explain": {
      "ru": "Никак — и это ответ. Позиция без интереса и без обоснования не двигает ни одной шкалы: ни вопроса, ни критерия, ни эмпатии движок здесь не видит. Нейтральная реакция — не «пронесло», а потерянный ход.",
      "en": "She does not — and that is the answer. A position with no interest and no grounding moves no meter at all: the engine sees no question, no criterion, no empathy. A neutral reaction is not “got away with it”, it is a turn spent on nothing."
    }
  },
  {
    "id": "sp-01",
    "block": "spin-ladder",
    "lesson": 1,
    "type": "order",
    "difficulty": 1,
    "xp": 10,
    "prompt": {
      "ru": "Расставьте ступени SPIN.",
      "en": "Order the SPIN stages."
    },
    "items": [
      {
        "id": "s",
        "ru": "Ситуация: как всё устроено сейчас",
        "en": "Situation: how things work today"
      },
      {
        "id": "p",
        "ru": "Проблема: что мешает",
        "en": "Problem: what gets in the way"
      },
      {
        "id": "i",
        "ru": "Последствия: чем это грозит",
        "en": "Implication: what it costs"
      },
      {
        "id": "n",
        "ru": "Выгода: что даст решение",
        "en": "Need-payoff: what solving it is worth"
      }
    ],
    "answer": [
      "s",
      "p",
      "i",
      "n"
    ],
    "explain": {
      "ru": "Порядок работает как лестница: без фактов не найти боль, без боли последствия звучат как манипуляция, без последствий выгода не имеет цены.",
      "en": "The order is a ladder: with no facts you cannot find the pain, with no pain implications sound like manipulation, with no implications the payoff is worth nothing."
    }
  },
  {
    "id": "sp-02",
    "block": "spin-ladder",
    "lesson": 3,
    "type": "choice",
    "difficulty": 2,
    "xp": 10,
    "scenario_id": "supplier",
    "prompt": {
      "ru": "Какой из вопросов — ступень I (Последствия)?",
      "en": "Which question is stage I (Implication)?"
    },
    "options": [
      {
        "ru": "Расскажите о вашем производственном цикле — как он устроен?",
        "en": "Tell me about your production cycle — how is it set up?"
      },
      {
        "ru": "С какими сложностями вы сталкиваетесь при неравномерной загрузке?",
        "en": "What difficulties do you hit when the load is uneven?"
      },
      {
        "ru": "Сколько вы теряете, если загрузка производства падает на месяц?",
        "en": "What does that cost you when factory utilization drops for a month?"
      },
      {
        "ru": "Насколько важно было бы закрыть загрузку на год вперёд?",
        "en": "How valuable would it be to lock the whole year's utilization now?"
      }
    ],
    "answer": 2,
    "expect_moves": [
      "spin_implication"
    ],
    "explain": {
      "ru": "I-вопрос переводит проблему в цифру потерь. В движке он дороже остальных: +22 к Информации против +14 у ситуации и проблемы.",
      "en": "An I-question turns a problem into a number. The engine prices it higher: +22 Information versus +14 for situation and problem."
    }
  },
  {
    "id": "sp-03",
    "block": "spin-ladder",
    "lesson": 3,
    "type": "freeform",
    "difficulty": 2,
    "xp": 15,
    "scenario_id": "supplier",
    "prompt": {
      "ru": "Ирина сказала, что заказы приходят рывками. Задайте вопрос ступени I.",
      "en": "Irina said orders arrive in bursts. Ask a stage-I question."
    },
    "check": {
      "require_moves": [
        "spin_implication"
      ],
      "forbid_moves": [
        "threat",
        "hostile"
      ],
      "min_arg": 30,
      "min_words": 5
    },
    "reference": {
      "ru": "Чем это грозит вам, когда загрузка производства падает на месяц?",
      "en": "What happens if the line sits idle for a month?"
    },
    "explain": {
      "ru": "Движок ловит I по маркерам «к чему это приводит / сколько вы теряете / чем это грозит». «Это плохо?» — не I, это просто открытый вопрос.",
      "en": "The engine detects I from markers like “what happens if / what does that cost / how does that affect”. “Is that bad?” is not I — it is a plain open question."
    }
  },
  {
    "id": "sp-04",
    "block": "spin-ladder",
    "lesson": 3,
    "type": "reaction",
    "difficulty": 2,
    "xp": 10,
    "scenario_id": "supplier",
    "seed_turn": 3,
    "opponent_line": {
      "ru": "Мы держим цену 100, это наша политика.",
      "en": "We hold at 100, that is our policy."
    },
    "player_line": {
      "ru": "К чему это приводит, когда загрузка производства падает на месяц?",
      "en": "What happens if the line sits idle for a month?"
    },
    "answer": "opened_up",
    "prompt": {
      "ru": "Что произошло с Ириной?",
      "en": "What happened to Irina?"
    },
    "explain": {
      "ru": "SPIN-вопрос вскрывает интерес: Информация +22, доверие вверх, напряжение вниз. Это «приоткрывается» — не «теплеет» (для этого нужно активное слушание) и не «принимает довод» (для этого нужен критерий).",
      "en": "A SPIN question uncovers an interest: Information +22, trust up, tension down. That is “opened up” — not “warmed” (that needs active listening) and not “persuaded” (that needs a criterion)."
    }
  },
  {
    "id": "sp-05",
    "block": "spin-ladder",
    "lesson": 5,
    "type": "spot_error",
    "difficulty": 3,
    "xp": 15,
    "scenario_id": "supplier",
    "prompt": {
      "ru": "Первый ход переговоров. Что не так?",
      "en": "First move of the negotiation. What is wrong?"
    },
    "bad_line": {
      "ru": "Насколько важно для вас было бы закрыть загрузку на весь год вперёд?",
      "en": "How valuable would it be to lock the whole year's utilization now?"
    },
    "options": [
      {
        "key": "hostile",
        "ru": "Вопрос звучит грубо",
        "en": "The question sounds rude"
      },
      {
        "key": "question_too_vague",
        "ru": "Вопрос слишком расплывчатый",
        "en": "The question is too vague"
      },
      {
        "key": "spin_out_of_order",
        "ru": "N-вопрос задан до S/P/I: предлагается ценность решения проблемы, которую вы ещё не назвали вместе",
        "en": "An N-question before S/P/I: you offer the value of solving a problem the two of you have not named"
      },
      {
        "key": "anchor_without_rationale",
        "ru": "Нет цифры",
        "en": "There is no number"
      }
    ],
    "answer": 2,
    "fault_key": "spin_out_of_order",
    "explain": {
      "ru": "Формально движок засчитает need-payoff и даст +22. Но на первом ходу Ирина ещё не признала боль, поэтому вопрос читается как заготовка продавца. Лестница SPIN — про порядок, а не про набор.",
      "en": "Formally the engine scores need-payoff and grants +22. But on turn one Irina has not admitted the pain, so the question reads as a sales script. The SPIN ladder is about sequence, not a checklist."
    }
  },
  {
    "id": "sp-06",
    "block": "spin-ladder",
    "lesson": 2,
    "type": "freeform",
    "difficulty": 2,
    "xp": 15,
    "scenario_id": "supplier",
    "prompt": {
      "ru": "Ирина рассказала, как устроено производство. Задайте вопрос ступени P — про то, что мешает.",
      "en": "Irina described how production runs. Ask a stage-P question — about what gets in the way."
    },
    "check": {
      "require_moves": [
        "spin_problem"
      ],
      "forbid_moves": [
        "threat",
        "hostile"
      ],
      "min_arg": 30,
      "min_words": 5
    },
    "reference": {
      "ru": "С какими сложностями вы сталкиваетесь при неравномерной загрузке?",
      "en": "What difficulties do you hit when factory utilization is uneven?"
    },
    "explain": {
      "ru": "P — первый вопрос, где собеседник произносит вслух то, что ему не нравится. С этого момента разговор уже не про вашу цену, а про его положение.",
      "en": "P is the first question where the other side says out loud what they do not like. From that moment the conversation is about their position, not your price."
    }
  },
  {
    "id": "sp-07",
    "block": "spin-ladder",
    "lesson": 4,
    "type": "choice",
    "difficulty": 2,
    "xp": 10,
    "scenario_id": "supplier",
    "prompt": {
      "ru": "Ирина признала, что простои дорого обходятся. Какой вопрос — ступень N?",
      "en": "Irina admitted idle time is costly. Which question is stage N?"
    },
    "options": [
      {
        "ru": "Насколько важно было бы закрыть загрузку на год вперёд?",
        "en": "How valuable would it be to lock the year's utilization now?"
      },
      {
        "ru": "Сколько вы теряете, если линия стоит месяц?",
        "en": "What does that cost you when the line is idle for a month?"
      },
      {
        "ru": "Как сейчас устроено планирование заказов?",
        "en": "How is order planning set up today?"
      },
      {
        "ru": "Мы предлагаем 88 ₽ за штуку.",
        "en": "We propose 88 per unit."
      }
    ],
    "answer": 0,
    "expect_moves": [
      "spin_needpayoff"
    ],
    "explain": {
      "ru": "N — единственный вопрос, где выгоду формулирует не вы, а собеседник. То, что человек сказал сам, он потом не оспаривает: в этом вся хитрость четвёртой ступени.",
      "en": "N is the one question where the value is spoken by the other side, not by you. What people say themselves they do not argue with later — that is the trick of the fourth rung."
    }
  },
  {
    "id": "sp-08",
    "block": "spin-ladder",
    "lesson": 1,
    "type": "freeform",
    "difficulty": 1,
    "xp": 10,
    "scenario_id": "supplier",
    "prompt": {
      "ru": "Разговор только начался. Задайте вопрос ступени S — про то, как всё устроено сейчас.",
      "en": "The conversation has just started. Ask a stage-S question — about how things work today."
    },
    "check": {
      "require_moves": [
        "spin_situation"
      ],
      "forbid_moves": [
        "threat",
        "hostile",
        "offer"
      ],
      "min_words": 5
    },
    "reference": {
      "ru": "Расскажите, как сейчас устроена загрузка производства: как планируете отгрузки и как часто отгружаете?",
      "en": "Tell me how factory utilization works today: how do you plan shipments, and how often do you ship?"
    },
    "explain": {
      "ru": "S — единственная ступень, которую движок оценивает скромно (+14 к Информации) и которую всё равно нельзя пропустить: без фактов следующий вопрос про боль звучит как догадка. Цифра в первой реплике превращает вопрос в предложение — поэтому она запрещена.",
      "en": "S is the one rung the engine pays modestly for (+14 Information) and still cannot be skipped: with no facts, the next question about pain sounds like a guess. A number in the opening line turns the question into an offer — which is why it is forbidden here."
    }
  },
  {
    "id": "sp-09",
    "block": "spin-ladder",
    "lesson": 5,
    "type": "drill",
    "difficulty": 3,
    "xp": 40,
    "scenario_id": "supplier",
    "max_turns": 6,
    "prompt": {
      "ru": "Капстоун. Пройдите лестницу и закройтесь не дороже 90 ₽/шт за 6 ходов, доведя Информацию до 40 и вскрыв два интереса.",
      "en": "Capstone. Walk the ladder and close at 90/unit or better within 6 turns, taking Information to 40 and uncovering two interests."
    },
    "goal": {
      "ru": "Сделка ≤ 90 · Информация ≥ 40 · два интереса",
      "en": "Deal ≤ 90 · Information ≥ 40 · two interests"
    },
    "pass": [
      {
        "field": "status",
        "op": "==",
        "value": "agreement"
      },
      {
        "field": "info",
        "op": ">=",
        "value": 40
      },
      {
        "field": "interests_found",
        "op": ">=",
        "value": 2
      },
      {
        "field": "deal",
        "op": "<=",
        "value": 90
      }
    ],
    "explain": {
      "ru": "Информацию двигают ТОЛЬКО вопросы: заявления и встречные цифры не дают ни очка. Порог 40 нельзя взять разговором о цене — его берут ступенями S → P → I → N.",
      "en": "Only questions move Information: statements and counter-numbers earn nothing at all. The 40 threshold cannot be reached by talking price — it is reached by S → P → I → N."
    }
  },
  {
    "id": "al-01",
    "block": "active-listening",
    "lesson": 1,
    "type": "choice",
    "difficulty": 1,
    "xp": 10,
    "scenario_id": "conflict",
    "prompt": {
      "ru": "Алексей: «Это вы сорвали сроки, а теперь мне объясняться перед директором». Ваш ход?",
      "en": "Alexey: “You missed the deadline and now I have to explain it to the director.” Your move?"
    },
    "options": [
      {
        "ru": "Это не наша вина, посмотрите на факты.",
        "en": "That is not our fault, look at the facts."
      },
      {
        "ru": "Алексей, я вас слышу: на вас давит руководство. Что для вас важнее всего в этом статусе?",
        "en": "Alexey, I hear you: leadership is pressing you. What matters most to you in that status update?"
      },
      {
        "ru": "Давайте эскалируем директору, пусть он решит.",
        "en": "Let us escalate to the director and let him decide."
      },
      {
        "ru": "Вы не понимаете, как устроен наш процесс.",
        "en": "You do not understand how our process works."
      }
    ],
    "answer": 1,
    "expect_moves": [
      "acknowledge",
      "interests_probe"
    ],
    "explain": {
      "ru": "Признать давление — не признать вину: доверие +8, напряжение −10, реакция «теплеет». Информация при этом растёт всего на 5 — вопрос «в этом статусе» не назвал ни одной темы его интересов, и Алексей переспросит. Назовите тему («выглядеть виноватым перед руководством») — и та же реплика даст +24; это следующее упражнение. Четвёртый вариант — грубость: доверие −22, напряжение +26.",
      "en": "Acknowledging the pressure is not admitting fault: trust +8, tension −10, reaction “warmed”. Information rises by just 5 — “that status update” names none of his interests, so Alexey asks back. Name the topic (“looking at fault to leadership”) and the same line gives +24; that is the next exercise. Option four is rudeness: trust −22, tension +26."
    }
  },
  {
    "id": "al-02",
    "block": "active-listening",
    "lesson": 2,
    "type": "freeform",
    "difficulty": 2,
    "xp": 15,
    "scenario_id": "conflict",
    "prompt": {
      "ru": "Отразите позицию Алексея и спросите, что за ней стоит. Без согласия с обвинением.",
      "en": "Reflect Alexey's position back and ask what is behind it. Without agreeing with the accusation."
    },
    "check": {
      "require_moves": [
        "acknowledge"
      ],
      "require_any": [
        "interests_probe",
        "spin_problem"
      ],
      "forbid_moves": [
        "threat",
        "hostile"
      ],
      "min_arg": 38,
      "min_words": 8
    },
    "reference": {
      "ru": "Понимаю, что вам важно не выглядеть виноватым перед руководством. Что для вас важнее — сроки или как это будет подано наверх?",
      "en": "I understand you must not look at fault to leadership. What matters more to you — the dates, or how this is framed upwards?"
    },
    "explain": {
      "ru": "Два приёма в одной реплике: активное слушание (напряжение −10) плюс вскрытие интереса (Информация +24). Реакция при этом не «теплеет», а «приоткрывается»: вскрытие в движке старше теплоты и перезаписывает её — секрет важнее комплимента.",
      "en": "Two moves in one line: active listening (tension −10) plus an interest probe (Information +24). The reaction is not “warmed” but “opened up”: in the engine a reveal outranks warmth and overwrites it — the secret matters more than the compliment."
    }
  },
  {
    "id": "al-03",
    "block": "active-listening",
    "lesson": 4,
    "type": "reaction",
    "difficulty": 2,
    "xp": 10,
    "scenario_id": "used_car",
    "seed_turn": 4,
    "opponent_line": {
      "ru": "Машина в идеале, я за ней следил каждый день.",
      "en": "The car is immaculate, I looked after it every single day."
    },
    "player_line": {
      "ru": "1200? Да она столько не стоит, это смешно.",
      "en": "1200? The car is not worth that, this is a joke."
    },
    "answer": "offended",
    "prompt": {
      "ru": "Что сейчас с Сергеем?",
      "en": "Where is Sergey now?"
    },
    "explain": {
      "ru": "Грубость: доверие −22, напряжение +26. Сергей привязан к машине — критика авто читается как критика его самого. Худшая реакция после ухода из-за стола.",
      "en": "Rudeness: trust −22, tension +26. Sergey is attached to the car — criticising it reads as criticising him. The worst rung short of walking out."
    }
  },
  {
    "id": "al-04",
    "block": "active-listening",
    "lesson": 3,
    "type": "match",
    "difficulty": 2,
    "xp": 15,
    "prompt": {
      "ru": "Соедините ход игрока с реакцией, которую даст движок.",
      "en": "Match each player move to the reaction the engine returns."
    },
    "left": [
      {
        "id": "acknowledge",
        "ru": "Активное слушание",
        "en": "Active listening"
      },
      {
        "id": "objective_criteria",
        "ru": "Объективный критерий",
        "en": "Objective criterion"
      },
      {
        "id": "batna",
        "ru": "Упоминание альтернативы",
        "en": "Naming your alternative"
      },
      {
        "id": "tradeoff",
        "ru": "Размен по вопросам",
        "en": "A cross-issue trade"
      },
      {
        "id": "threat",
        "ru": "Ультиматум",
        "en": "An ultimatum"
      }
    ],
    "right": [
      {
        "id": "warmed",
        "ru": "Потеплела",
        "en": "Warmed up"
      },
      {
        "id": "persuaded",
        "ru": "Убеждена данными",
        "en": "Persuaded by data"
      },
      {
        "id": "pressured",
        "ru": "Под давлением",
        "en": "Pressured"
      },
      {
        "id": "collaborated",
        "ru": "Готова сотрудничать",
        "en": "Ready to cooperate"
      },
      {
        "id": "hardened",
        "ru": "Закрылась",
        "en": "Closed off"
      }
    ],
    "answer": {
      "acknowledge": "warmed",
      "objective_criteria": "persuaded",
      "batna": "pressured",
      "tradeoff": "collaborated",
      "threat": "hardened"
    },
    "explain": {
      "ru": "Это буквальная карта движка. Важно: если в одной реплике и критерий, и альтернатива — победит «под давлением», потому что блок альтернативы перезаписывает реакцию позже.",
      "en": "This is the literal map inside the engine. Note: if one line carries both a criterion and an alternative, “pressured” wins — the alternative block overwrites the reaction later."
    }
  },
  {
    "id": "al-05",
    "block": "active-listening",
    "lesson": 1,
    "type": "meters",
    "difficulty": 3,
    "xp": 15,
    "scenario_id": "conflict",
    "state": {
      "trust": 35,
      "tension": 60,
      "info": 20,
      "leverage": 20,
      "turn": 5
    },
    "player_line": {
      "ru": "Понимаю, что вам важно не выглядеть виноватым перед руководством.",
      "en": "I understand you must not look at fault to leadership."
    },
    "ask": "largest_delta",
    "answer": "tension",
    "prompt": {
      "ru": "Какая шкала сдвинется сильнее всего?",
      "en": "Which meter moves the most?"
    },
    "explain": {
      "ru": "Активное слушание даёт доверие +8 и напряжение −10 — по модулю напряжение сильнее. И это важно на 60: пока напряжение выше 55, уступки режутся на 40%.",
      "en": "Active listening gives trust +8 and tension −10 — tension moves more in absolute terms. That matters at 60: above 55, concessions are cut by 40%."
    }
  },
  {
    "id": "al-06",
    "block": "active-listening",
    "lesson": 3,
    "type": "face",
    "difficulty": 2,
    "xp": 10,
    "scenario_id": "sla_renewal",
    "answer": "pressured",
    "prompt": {
      "ru": "Виктор откинулся назад. Что с ним произошло?",
      "en": "Viktor has leaned back. What just happened to him?"
    },
    "explain": {
      "ru": "Отстранение — реакция на давление: вы назвали альтернативу или надавили, и он прибавил дистанцию. Рычаг у вас вырос, но и напряжение тоже — а выше 55 оно режет уступки на 40%.",
      "en": "Pulling back is the reaction to pressure: you named an alternative or pushed, and he added distance. Your leverage grew — so did tension, and above 55 it cuts concessions by 40%."
    }
  },
  {
    "id": "al-07",
    "block": "active-listening",
    "lesson": 1,
    "type": "meters",
    "difficulty": 1,
    "xp": 10,
    "scenario_id": "conflict",
    "state": {
      "trust": 40,
      "tension": 30,
      "info": 0,
      "leverage": 10,
      "turn": 1
    },
    "player_line": {
      "ru": "Рад встрече! Как ваши дела?",
      "en": "Good to see you. How are you?"
    },
    "ask": "largest_delta",
    "answer": "trust",
    "prompt": {
      "ru": "Какая шкала сдвинется сильнее всего?",
      "en": "Which meter moves the most?"
    },
    "explain": {
      "ru": "Приветствие — единственный ход, за который движок платит, ничего не требуя взамен: доверие +5, напряжение −4. Мало, но бесплатно, и на первом ходу это всё, что у вас есть. Отражение чувства (+8 / −10) сильнее — но ему нужно чувство, которое уже названо.",
      "en": "A greeting is the one move the engine pays for while asking nothing in return: trust +5, tension −4. Little, but free — and on turn one it is all you have. Reflecting a feeling (+8 / −10) is stronger, but it needs a feeling that has already been voiced."
    }
  },
  {
    "id": "al-08",
    "block": "active-listening",
    "lesson": 4,
    "type": "drill",
    "difficulty": 3,
    "xp": 40,
    "scenario_id": "conflict",
    "max_turns": 6,
    "prompt": {
      "ru": "Капстоун. Договоритесь о сдвиге не больше 8 дней за 6 ходов, удержав напряжение ≤ 25 и доверие ≥ 60.",
      "en": "Capstone. Settle on a slip of 8 days or less within 6 turns, keeping tension ≤ 25 and trust ≥ 60."
    },
    "goal": {
      "ru": "Сдвиг ≤ 8 дней · напряжение ≤ 25 · доверие ≥ 60",
      "en": "Slip ≤ 8 days · tension ≤ 25 · trust ≥ 60"
    },
    "pass": [
      {
        "field": "status",
        "op": "==",
        "value": "agreement"
      },
      {
        "field": "deal",
        "op": "<=",
        "value": 8
      },
      {
        "field": "tension",
        "op": "<=",
        "value": 25
      },
      {
        "field": "trust",
        "op": ">=",
        "value": 60
      }
    ],
    "explain": {
      "ru": "Стол жёсткий, и соблазн додавить здесь сильнее всего. Но выше 55 напряжения уступки режутся на 40%: давление и получает рычаг, и тут же замораживает его. Проходится это только отражением — оно снимает по 10 напряжения за ход и ничего вам не стоит.",
      "en": "This table is a tough one, and the pull to push through is strongest here. But above 55 tension concessions are cut by 40%: pressure buys leverage and freezes it in the same move. The only way through is reflecting — it takes 10 tension off per turn and costs you nothing."
    }
  },
  {
    "id": "al-09",
    "block": "active-listening",
    "lesson": 1,
    "type": "reaction",
    "difficulty": 1,
    "xp": 10,
    "scenario_id": "conflict",
    "seed_turn": 3,
    "player_line": {
      "ru": "Вижу, что для вас это неприятная история, и понимаю почему.",
      "en": "I can see this is an unpleasant story for you, and I understand why."
    },
    "answer": "warmed",
    "prompt": {
      "ru": "Как отреагирует Алексей?",
      "en": "How will Alexey react?"
    },
    "explain": {
      "ru": "«Теплеет» — самая верхняя ступень шкалы, и попасть на неё дешевле всего именно отражением: доверие +8, напряжение −10, и ни одной уступки по существу. Обратите внимание, что согласия с претензией здесь нет — названо чувство, а не правота.",
      "en": "“Warmed” is the top rung of the scale, and reflecting is the cheapest way onto it: trust +8, tension −10, and not one concession on the substance. Note that nothing here agrees with the accusation — it names the feeling, not the verdict."
    }
  },
  {
    "id": "oc-01",
    "block": "objective-criteria",
    "lesson": 2,
    "type": "choice",
    "difficulty": 2,
    "xp": 10,
    "scenario_id": "salary",
    "prompt": {
      "ru": "Что здесь — настоящий объективный критерий?",
      "en": "Which of these is a real objective criterion?"
    },
    "options": [
      {
        "ru": "Я стою больше, поверьте мне.",
        "en": "I am worth more than that, trust me."
      },
      {
        "ru": "Отраслевой обзор зарплат по этой роли даёт 225k — вот три независимых источника.",
        "en": "The industry salary survey for this role gives 225k — here are three independent sources."
      },
      {
        "ru": "У всех моих знакомых платят выше.",
        "en": "Everyone I know is paid more than that."
      },
      {
        "ru": "Это несправедливо по отношению ко мне.",
        "en": "This is simply unfair to me."
      }
    ],
    "answer": 1,
    "expect_moves": [
      "objective_criteria"
    ],
    "explain": {
      "ru": "Критерий — это внешний, проверяемый источник с цифрой. Остальные три движок читает как обычные заявления: рычаг +0. Критерий даёт рычаг +16, а Дмитрий аналитик — ещё +6.",
      "en": "A criterion is an external, checkable source with a number. The other three read as plain statements: leverage +0. A criterion gives leverage +16 — and Dmitry is analytical, so another +6."
    }
  },
  {
    "id": "oc-02",
    "block": "objective-criteria",
    "lesson": 2,
    "type": "freeform",
    "difficulty": 2,
    "xp": 15,
    "scenario_id": "salary",
    "prompt": {
      "ru": "Обоснуйте 230k объективным критерием. Нужна цифра и источник.",
      "en": "Justify 230k with an objective criterion. A number and a source are required."
    },
    "check": {
      "require_moves": [
        "objective_criteria"
      ],
      "forbid_moves": [
        "threat",
        "hostile"
      ],
      "require_number": true,
      "min_arg": 38,
      "min_words": 7
    },
    "reference": {
      "ru": "Отраслевой стандарт для этой роли — 225–235k, вот независимая оценка по трём обзорам.",
      "en": "The market rate for this role is 225–235k — here is independent benchmark data from three surveys."
    },
    "explain": {
      "ru": "Судья ставит высокий балл только там, где есть конкретное число или источник; без них «рынок» и «стандарт индустрии» — это спам, а не аргумент. Офлайновая проверка требует того же: критерий плюс число.",
      "en": "The judge scores high only where a concrete number or source is present; without them “market” and “industry standard” are spam, not argument. The offline check demands the same: a criterion plus a number."
    }
  },
  {
    "id": "oc-03",
    "block": "objective-criteria",
    "lesson": 3,
    "type": "spot_error",
    "difficulty": 2,
    "xp": 10,
    "scenario_id": "freelance_rate",
    "prompt": {
      "ru": "Что не так с этим обоснованием ставки?",
      "en": "What is wrong with this rate justification?"
    },
    "bad_line": {
      "ru": "Моя ставка 19k в день, у меня большой опыт.",
      "en": "My rate is 19k a day, I have a lot of experience."
    },
    "options": [
      {
        "key": "threat",
        "ru": "Это давление",
        "en": "It is pressure"
      },
      {
        "key": "claim_without_criteria",
        "ru": "Утверждение без внешнего критерия: «большой опыт» нельзя проверить и нечем оспорить, значит нечем и убедить",
        "en": "A claim with no external criterion: “a lot of experience” cannot be checked, so it cannot convince"
      },
      {
        "key": "position_no_interest",
        "ru": "Не спрошен интерес",
        "en": "The interest was not probed"
      },
      {
        "key": "concession_without_trade",
        "ru": "Уступка без размена",
        "en": "A concession with no trade"
      }
    ],
    "answer": 1,
    "fault_key": "claim_without_criteria",
    "explain": {
      "ru": "Павел — аналитик, он убеждается цифрами. «Большой опыт» движок читает как предложение без критерия: рычаг +0. Замените на «отраслевой стандарт для сеньора на этом стеке — 19k, вот данные двух обзоров» → рычаг +16.",
      "en": "Pavel is analytical — he is convinced by numbers. “A lot of experience” reads as an offer with no criterion: leverage +0. Swap it for “industry standard for a senior on this stack is 19k, here is data from two surveys” → leverage +16."
    }
  },
  {
    "id": "oc-04",
    "block": "objective-criteria",
    "lesson": 4,
    "type": "meters",
    "difficulty": 2,
    "xp": 10,
    "scenario_id": "salary",
    "state": {
      "trust": 45,
      "tension": 30,
      "info": 30,
      "leverage": 24,
      "turn": 4
    },
    "player_line": {
      "ru": "Отраслевой обзор зарплат по этой роли даёт 225k — вот три независимых источника.",
      "en": "The industry salary survey for this role gives 225k — here are three independent sources."
    },
    "ask": "largest_delta",
    "answer": "leverage",
    "prompt": {
      "ru": "Какая шкала сдвинется сильнее всего?",
      "en": "Which meter moves the most?"
    },
    "explain": {
      "ru": "Критерий: рычаг +16, плюс +6 за аналитический стиль. Доверие всего +3. Критерий — это про силу позиции, а не про тепло.",
      "en": "The criterion gives leverage +16, plus +6 for the analytical style. Trust only +3. A criterion buys standing, not warmth."
    }
  },
  {
    "id": "oc-05",
    "block": "objective-criteria",
    "lesson": 4,
    "type": "numeric",
    "difficulty": 3,
    "xp": 15,
    "scenario_id": "salary",
    "prompt": {
      "ru": "Ваша цель 230k, красная линия 195k. Вы закрылись на 213k. Какой экономический балл поставит движок?",
      "en": "Your target is 230k, your red line 195k. You closed at 213k. What economic score does the engine give?"
    },
    "answer": {
      "value": 51,
      "tolerance": 1
    },
    "unit": {
      "ru": "баллов",
      "en": "points"
    },
    "explain": {
      "ru": "Экономика = (сделка − красная линия) / (цель − красная линия) × 100 = (213 − 195)/(230 − 195) × 100 ≈ 51. Не «сколько вы получили», а «какую долю пути от красной линии до цели вы прошли».",
      "en": "Economics = (deal − reservation)/(target − reservation) × 100 = (213 − 195)/(230 − 195) × 100 ≈ 51. Not “how much you got”, but “how far you travelled from your red line to your target”."
    }
  },
  {
    "id": "oc-06",
    "block": "objective-criteria",
    "lesson": 1,
    "type": "choice",
    "difficulty": 2,
    "xp": 10,
    "scenario_id": "salary",
    "prompt": {
      "ru": "Дмитрий: «У нас в компании такие бюджеты, и точка». Что переводит спор из мнений в критерии?",
      "en": "Dmitry: “These are our budgets, full stop.” What turns a clash of opinions into a clash of criteria?"
    },
    "options": [
      {
        "ru": "Бюджеты у всех, а я стою больше.",
        "en": "Everyone has budgets, and I am worth more."
      },
      {
        "ru": "Отраслевой обзор зарплат по этой роли даёт медиану 225k — вот три независимых источника.",
        "en": "The industry salary survey puts the median for this role at 225k — three independent sources."
      },
      {
        "ru": "Тогда я поищу другое место.",
        "en": "Then I will look elsewhere."
      },
      {
        "ru": "Хорошо, я согласен на ваш бюджет.",
        "en": "Fine, I accept your budget."
      }
    ],
    "answer": 1,
    "expect_moves": [
      "objective_criteria"
    ],
    "explain": {
      "ru": "Спор двух мнений выигрывает упрямый; спор двух критериев — тот, чей критерий уместнее. И проигравшему не приходится капитулировать: он уступает стандарту, а не человеку.",
      "en": "A clash of opinions is won by the stubborn one; a clash of criteria by whoever's standard fits better. And the loser never capitulates: they yield to a standard, not to a person."
    }
  },
  {
    "id": "oc-07",
    "block": "objective-criteria",
    "lesson": 4,
    "type": "drill",
    "difficulty": 3,
    "xp": 40,
    "scenario_id": "salary",
    "max_turns": 6,
    "prompt": {
      "ru": "Капстоун. Выторгуйте оклад не ниже 225k ₽/мес за 6 ходов, ни разу не подняв напряжение выше 30.",
      "en": "Capstone. Land a base of 225k/mo or more within 6 turns, never pushing tension above 30."
    },
    "goal": {
      "ru": "Оклад ≥ 225k · напряжение ≤ 30",
      "en": "Base ≥ 225k · tension ≤ 30"
    },
    "pass": [
      {
        "field": "status",
        "op": "==",
        "value": "agreement"
      },
      {
        "field": "deal",
        "op": ">=",
        "value": 225
      },
      {
        "field": "tension",
        "op": "<=",
        "value": 30
      }
    ],
    "explain": {
      "ru": "Потолок напряжения — это и есть проверка блока: «я стою больше» поднимает его, обзор зарплат не поднимает вовсе. Критерий даёт рычаг +16 и реакцию «убеждён» вместо «под давлением», а уступка растёт ещё и оттого, что оппонент здесь аналитик.",
      "en": "The tension ceiling IS the block's test: “I am worth more” raises it, a salary survey does not raise it at all. A criterion grants leverage +16 and the reaction “persuaded” instead of “pressured” — and the concession grows further because this counterpart is an analyst."
    }
  },
  {
    "id": "oc-08",
    "block": "objective-criteria",
    "lesson": 2,
    "type": "reaction",
    "difficulty": 2,
    "xp": 10,
    "scenario_id": "salary",
    "seed_turn": 5,
    "player_line": {
      "ru": "Медиана по независимым обзорам для этой роли 230k, потому что это рынок, а не моё желание.",
      "en": "The median in independent surveys for this role is 230k, because that is the market, not my wish."
    },
    "answer": "persuaded",
    "prompt": {
      "ru": "Как отреагирует Дмитрий?",
      "en": "How will Dmitry react?"
    },
    "explain": {
      "ru": "«Принимает довод» — единственная реакция, которую нельзя получить нажимом: её даёт только объективный критерий. Рычаг +22 (шестнадцать плюс шесть за аналитический стиль), напряжение не растёт вовсе. Ключевое здесь «потому что»: без опоры движок читает «рынок» как слово, а не как критерий.",
      "en": "“Persuaded” is the one reaction pressure cannot buy: only an objective criterion produces it. Leverage +22 (sixteen plus six for the analytical style), and tension does not rise at all. The load-bearing word is “because”: with no grounding the engine reads “the market” as a word, not as a criterion."
    }
  },
  {
    "id": "bz-01",
    "block": "batna-zopa",
    "lesson": 1,
    "type": "numeric",
    "difficulty": 1,
    "xp": 10,
    "scenario_id": "supplier",
    "derive": "zopa_width",
    "prompt": {
      "ru": "Поставщик не пойдёт ниже 84 ₽/шт. Вы не заплатите больше 92. Какова ширина ZOPA?",
      "en": "The supplier will not go below 84/unit. You will not pay above 92. How wide is the ZOPA?"
    },
    "answer": {
      "value": 8,
      "tolerance": 0
    },
    "unit": {
      "ru": "₽/шт",
      "en": "/unit"
    },
    "explain": {
      "ru": "ZOPA = [84, 92], ширина 8. Всё, о чём вы торгуетесь, — это распределение этих восьми рублей. Всё, что вне, — не сделка ни для кого.",
      "en": "ZOPA = [84, 92], width 8. Everything you haggle over is the split of those eight. Anything outside is not a deal for anyone."
    }
  },
  {
    "id": "bz-02",
    "block": "batna-zopa",
    "lesson": 1,
    "type": "numeric",
    "difficulty": 2,
    "xp": 10,
    "scenario_id": "sla_renewal",
    "derive": "zopa_width",
    "prompt": {
      "ru": "Вендор физически не даст больше 99.9%. Вам не подходит ниже 99.4%. Какова ширина ZOPA в процентных пунктах?",
      "en": "The vendor cannot go above 99.9%. You cannot accept below 99.4%. How wide is the ZOPA in percentage points?"
    },
    "answer": {
      "value": 0.5,
      "tolerance": 0.01
    },
    "unit": {
      "ru": "п.п.",
      "en": "pp"
    },
    "explain": {
      "ru": "Полпроцентного пункта — самая узкая ZOPA в игре. Отсюда правило блока про давление: в узкой зоне оно обходится дороже всего, потому что уступать почти нечем.",
      "en": "Half a percentage point — the narrowest ZOPA in the game. Hence the rule about pressure: in a narrow zone it costs the most, because there is barely anything to concede."
    }
  },
  {
    "id": "bz-03",
    "block": "batna-zopa",
    "lesson": 2,
    "type": "choice",
    "difficulty": 3,
    "xp": 15,
    "scenario_id": "supplier",
    "prompt": {
      "ru": "Ваша альтернатива — другой поставщик по 95, но с рисками качества. При этом ваша красная линия 92, то есть СТРОЖЕ альтернативы. Почему это рационально?",
      "en": "Your alternative is another supplier at 95, but with quality risk. Yet your red line is 92 — STRICTER than the alternative. Why is that rational?"
    },
    "options": [
      {
        "ru": "Это ошибка в брифинге: красная линия должна быть 95.",
        "en": "It is a briefing error: the red line should be 95."
      },
      {
        "ru": "Риск качества снижает реальную ценность альтернативы: платить 92 здесь выгоднее, чем 95 там.",
        "en": "Quality risk lowers the alternative's real value: paying 92 here beats 95 there."
      },
      {
        "ru": "Красная линия всегда строже альтернативы.",
        "en": "A red line is always stricter than the alternative."
      },
      {
        "ru": "Красная линия ставится по цели, а не по альтернативе.",
        "en": "The red line is set from the target, not the alternative."
      }
    ],
    "answer": 1,
    "explain": {
      "ru": "Правило: красная линия = ценность альтернативы ± стоимость переключения. У поставщика риск вычитается (92 < 95). В аренде наоборот: альтернатива 68, но +40 минут дороги, поэтому красная линия мягче — 70.",
      "en": "The rule: red line = the alternative's value ± switching cost. With the supplier the risk is subtracted (92 < 95). In the rent case it is the reverse: the alternative is 68 but 40 minutes farther, so the red line is looser — 70."
    }
  },
  {
    "id": "bz-04",
    "block": "batna-zopa",
    "lesson": 3,
    "type": "freeform",
    "difficulty": 3,
    "xp": 20,
    "scenario_id": "salary",
    "prompt": {
      "ru": "Назовите свой второй оффер так, чтобы это был рычаг, а не угроза.",
      "en": "Name your second offer so that it reads as leverage, not as a threat."
    },
    "check": {
      "require_moves": [
        "batna"
      ],
      "forbid_moves": [
        "threat",
        "hostile"
      ],
      "min_arg": 30,
      "min_words": 8
    },
    "reference": {
      "ru": "У меня есть альтернативное предложение на 210k, но ваш проект мне интереснее — давайте искать решение здесь.",
      "en": "I have an alternative offer at 210k, but your project interests me more — let us find a solution here."
    },
    "explain": {
      "ru": "Альтернатива без подкрепления: рычаг +10, напряжение +14. С подкреплением: рычаг +18, напряжение всего +4. Разница — в том, сообщаете вы факт или угрожаете им.",
      "en": "An unbacked alternative: leverage +10, tension +14. Backed: leverage +18, tension only +4. The difference is whether you are reporting a fact or brandishing it."
    }
  },
  {
    "id": "bz-05",
    "block": "batna-zopa",
    "lesson": 3,
    "type": "spot_error",
    "difficulty": 2,
    "xp": 10,
    "scenario_id": "salary",
    "prompt": {
      "ru": "Что не так с этой подачей альтернативы?",
      "en": "What is wrong with this BATNA delivery?"
    },
    "bad_line": {
      "ru": "Или вы даёте 230k, или я ухожу к конкуренту.",
      "en": "Either you give me 230k or I walk to your competitor."
    },
    "options": [
      {
        "key": "claim_without_criteria",
        "ru": "Нет объективного критерия под цифрой 230k",
        "en": "No objective criterion under the 230k figure"
      },
      {
        "key": "batna_as_club",
        "ru": "Альтернатива подана как дубина: она превращена в ультиматум, и теперь любое движение оппонента = его капитуляция",
        "en": "The alternative is wielded as a club: it became an ultimatum, so any movement now reads as surrender"
      },
      {
        "key": "position_no_interest",
        "ru": "Не вскрыт интерес работодателя",
        "en": "The employer's interest was not surfaced"
      },
      {
        "key": "repeat_same_line",
        "ru": "Повтор предыдущей реплики",
        "en": "A repeat of the previous line"
      }
    ],
    "answer": 1,
    "fault_key": "batna_as_club",
    "explain": {
      "ru": "Движок здесь видит и альтернативу, и угрозу разом: доверие вниз, напряжение вверх. Тот же факт, сказанный без ультиматума, дал бы рычаг и почти не поднял напряжение.",
      "en": "The engine sees both an alternative and a threat at once: trust down, tension up. The same fact stated without the ultimatum would give leverage and barely raise tension."
    }
  },
  {
    "id": "bz-06",
    "block": "batna-zopa",
    "lesson": 4,
    "type": "meters",
    "difficulty": 2,
    "xp": 10,
    "scenario_id": "salary",
    "state": {
      "trust": 45,
      "tension": 30,
      "info": 20,
      "leverage": 30,
      "turn": 4
    },
    "player_line": {
      "ru": "Или вы даёте 230k, или я ухожу к конкуренту.",
      "en": "Either you give me 230k or I walk to your competitor."
    },
    "ask": "sign_of:trust",
    "answer": "down",
    "prompt": {
      "ru": "Что произойдёт с доверием?",
      "en": "What happens to trust?"
    },
    "explain": {
      "ru": "Доверие −14, напряжение вверх сразу на треть шкалы. Альтернатива, поданная как ультиматум, делает любое движение оппонента капитуляцией — а человеку, который отчитывается перед кем-то, капитулировать нельзя.",
      "en": "Trust −14 and tension up by a third of the scale at once. An alternative delivered as an ultimatum turns any movement into a surrender — and someone who reports to a boss cannot afford to surrender."
    }
  },
  {
    "id": "bz-07",
    "block": "batna-zopa",
    "lesson": 1,
    "type": "numeric",
    "difficulty": 2,
    "xp": 10,
    "scenario_id": "investor",
    "derive": "zopa_width",
    "prompt": {
      "ru": "Стол этого блока: инвестор не возьмёт меньше 18% доли, вы не отдадите больше 24%. Какова ширина ZOPA?",
      "en": "This block's table: the investor will not take less than 18% equity, you will not give more than 24%. How wide is the ZOPA?"
    },
    "answer": {
      "value": 6,
      "tolerance": 0
    },
    "unit": {
      "ru": "% доли",
      "en": "% equity"
    },
    "explain": {
      "ru": "ZOPA = [18, 24], ширина 6 процентных пунктов — весь торг про их деление. Открылась Марина с 30%, то есть на 12 пунктов ВЫШЕ своего дна: якорь и дно — разные числа, и первое ничего не говорит о втором.",
      "en": "ZOPA = [18, 24], six percentage points wide — the whole haggle is over splitting them. Marina opened at 30%, i.e. 12 points ABOVE her floor: an anchor and a floor are different numbers, and the first says nothing about the second."
    }
  },
  {
    "id": "bz-08",
    "block": "batna-zopa",
    "lesson": 3,
    "type": "choice",
    "difficulty": 3,
    "xp": 15,
    "scenario_id": "investor",
    "prompt": {
      "ru": "Марина держит 30% и не двигается. У вас есть второй фонд. Как назвать альтернативу?",
      "en": "Marina holds 30% and will not move. You do have a second fund. How do you name the alternative?"
    },
    "options": [
      {
        "ru": "Либо вы соглашаетесь на 18%, либо мы прекращаем разговор.",
        "en": "Either you take 18% or we walk."
      },
      {
        "ru": "У нас есть альтернативное предложение с меньшей долей — но закрыть мы хотим с вами, поэтому давайте искать конструкцию.",
        "en": "We have an alternative offer at a lower equity — but we would rather close with you, so let us find a structure."
      },
      {
        "ru": "Мы никуда не торопимся и подождём.",
        "en": "We are in no hurry and can wait."
      },
      {
        "ru": "30% — это слишком много.",
        "en": "30% is far too much."
      }
    ],
    "answer": 1,
    "expect_moves": [
      "batna"
    ],
    "explain": {
      "ru": "Альтернатива, названная без угрозы, даёт рычаг +10 и напряжение +14; та же альтернатива ультиматумом добавляет сверху доверие −14 и напряжение +22 — и уступки замерзают. У вас здесь сильная альтернатива — второй фонд, — но дно Марины 18% не двигается ни от какого давления. Поэтому альтернативу НАЗЫВАЮТ, а не заносят над столом.",
      "en": "An alternative named without a threat grants leverage +10 and tension +14; the same alternative as an ultimatum adds trust −14 and tension +22 on top — and concessions freeze. You do hold a strong alternative here — the second fund — but Marina's floor of 18% does not move under any pressure. So you NAME the alternative; you do not brandish it."
    }
  },
  {
    "id": "bz-09",
    "block": "batna-zopa",
    "lesson": 4,
    "type": "drill",
    "difficulty": 3,
    "xp": 40,
    "scenario_id": "investor",
    "max_turns": 7,
    "prompt": {
      "ru": "Капстоун. Закройте раунд на доле не выше 20% за 7 ходов, вскрыв минимум два интереса и не подняв напряжение выше 50.",
      "en": "Capstone. Close the round at 20% equity or less within 7 turns, uncovering at least two interests and never pushing tension above 50."
    },
    "goal": {
      "ru": "Доля ≤ 20% · два интереса · напряжение ≤ 50",
      "en": "Equity ≤ 20% · two interests · tension ≤ 50"
    },
    "pass": [
      {
        "field": "status",
        "op": "==",
        "value": "agreement"
      },
      {
        "field": "deal",
        "op": "<=",
        "value": 20
      },
      {
        "field": "interests_found",
        "op": ">=",
        "value": 2
      },
      {
        "field": "tension",
        "op": "<=",
        "value": 50
      }
    ],
    "explain": {
      "ru": "Дно Марины — 18%, ваша красная линия — 24%: вся партия про шесть пунктов. Жёсткая BATNA здесь стоит дорого — напряжение +14 за упоминание и +22 сверху, если оно прозвучало ультиматумом. Двадцать процентов берутся вопросами и разменом, а не второй фондом.",
      "en": "Marina's floor is 18%, your red line 24%: the whole game is about six points. A hard BATNA is expensive here — tension +14 for naming it and +22 more if it came out as an ultimatum. Twenty percent is reached by questions and trades, not by the second fund."
    }
  },
  {
    "id": "bz-10",
    "block": "batna-zopa",
    "lesson": 4,
    "type": "reaction",
    "difficulty": 2,
    "xp": 10,
    "scenario_id": "supplier",
    "seed_turn": 4,
    "player_line": {
      "ru": "У нас есть альтернатива: другой поставщик готов работать по 88.",
      "en": "We have an alternative: another supplier is ready to work at 88."
    },
    "answer": "pressured",
    "prompt": {
      "ru": "Как отреагирует Ирина?",
      "en": "How will Irina react?"
    },
    "explain": {
      "ru": "«Под давлением» — не «убеждена»: голая альтернатива без опоры даёт рычаг всего +10 и напряжение +20 (четырнадцать плюс шесть, потому что Ирина держится за отношения). Подкрепите её критерием — и рычаг станет +18, а напряжение всего +10.",
      "en": "“Pressured”, not “persuaded”: a bare alternative with no grounding gives only +10 leverage and +20 tension (fourteen plus six, because Irina is a relationship type). Ground it with a criterion and leverage becomes +18 while tension is only +10."
    }
  },
  {
    "id": "an-01",
    "block": "anchoring",
    "lesson": 1,
    "type": "numeric",
    "difficulty": 1,
    "xp": 10,
    "scenario_id": "used_car",
    "derive": "anchor_gap",
    "prompt": {
      "ru": "Сергей открылся на 1200k. Его настоящее дно — 1040k. На сколько якорь выше дна?",
      "en": "Sergey opened at 1200k. His real floor is 1040k. How far above the floor is the anchor?"
    },
    "answer": {
      "value": 160,
      "tolerance": 0
    },
    "unit": {
      "ru": "k ₽",
      "en": "k"
    },
    "explain": {
      "ru": "160 тысяч — это не цена, это переговорный воздух. Именно поэтому первый номер нельзя принимать за точку отсчёта: он выбран так, чтобы утянуть ваши ожидания.",
      "en": "160k is not price, it is negotiating air. That is exactly why a first number must not become your reference point: it was chosen to drag your expectations."
    }
  },
  {
    "id": "an-02",
    "block": "anchoring",
    "lesson": 3,
    "type": "choice",
    "difficulty": 2,
    "xp": 15,
    "scenario_id": "used_car",
    "prompt": {
      "ru": "Сергей: «1200, и я уже скинул». Лучший ответ?",
      "en": "Sergey: “1200, and I already came down.” Best response?"
    },
    "options": [
      {
        "ru": "900, и то много.",
        "en": "900, and that is generous."
      },
      {
        "ru": "По объявлениям на такую же модель с этим пробегом рыночная цена 1080 — давайте отталкиваться от неё.",
        "en": "Comparable listings for the same model at this mileage put the market price at 1080 — let us start there."
      },
      {
        "ru": "1200? Да она столько не стоит, это смешно.",
        "en": "1200? The car is not worth that, this is a joke."
      },
      {
        "ru": "Хорошо, 1150 — моё последнее слово.",
        "en": "Fine, 1150, that is my final word."
      }
    ],
    "answer": 1,
    "expect_moves": [
      "objective_criteria"
    ],
    "explain": {
      "ru": "Защита от якоря — не контр-цифра, а другая система координат. Второй вариант даёт «убеждён данными» и рычаг +16. Третий — обиду. Четвёртый — вы уже внутри его якоря.",
      "en": "Defending against an anchor is not a counter-number, it is a different frame. Option two yields “persuaded” and leverage +16. Option three offends. Option four leaves you anchored."
    }
  },
  {
    "id": "an-03",
    "block": "anchoring",
    "lesson": 2,
    "type": "freeform",
    "difficulty": 3,
    "xp": 20,
    "scenario_id": "used_car",
    "prompt": {
      "ru": "Поставьте встречный якорь 1080 и подкрепите его критерием.",
      "en": "Set a counter-anchor at 1080 and back it with a criterion."
    },
    "check": {
      "require_moves": [
        "objective_criteria"
      ],
      "forbid_moves": [
        "threat",
        "hostile"
      ],
      "require_number": true,
      "min_arg": 40,
      "min_words": 8
    },
    "reference": {
      "ru": "По объявлениям на такую же модель с этим пробегом рыночная цена — 1080, давайте отталкиваться от неё.",
      "en": "Comparable listings for the same model at this mileage put the market price at 1080 — let us start there."
    },
    "explain": {
      "ru": "Голый встречный якорь — это война цифр. Тот же якорь с критерием даёт «убеждён данными», рычаг +16 и делает вашу цифру той, от которой считают.",
      "en": "A bare counter-anchor is a war of numbers. The same anchor with a criterion yields “persuaded”, leverage +16, and makes YOUR number the one people count from."
    }
  },
  {
    "id": "an-04",
    "block": "anchoring",
    "lesson": 4,
    "type": "meters",
    "difficulty": 3,
    "xp": 15,
    "scenario_id": "used_car",
    "state": {
      "trust": 40,
      "tension": 25,
      "info": 0,
      "leverage": 20,
      "turn": 2
    },
    "player_line": {
      "ru": "1200? Да она столько не стоит, это смешно.",
      "en": "1200? The car is not worth that, this is a joke."
    },
    "ask": "sign_of:tension",
    "answer": "up",
    "prompt": {
      "ru": "Напряжение вырастет или упадёт?",
      "en": "Does tension rise or fall?"
    },
    "explain": {
      "ru": "Напряжение +26, доверие −22. А дальше механика мстит: при напряжении выше 55 уступки режутся на 40%, выше 75 — на 75%. Оскорбительный контр-якорь закрывает ту самую дверь, ради которой вы его ставили.",
      "en": "Tension +26, trust −22. Then the mechanics take revenge: above 55 concessions are cut by 40%, above 75 by 75%. An insulting counter-anchor shuts the very door you set it to open."
    }
  },
  {
    "id": "an-05",
    "block": "anchoring",
    "lesson": 3,
    "type": "order",
    "difficulty": 2,
    "xp": 10,
    "prompt": {
      "ru": "Расставьте шаги защиты от экстремального якоря.",
      "en": "Order the steps for defusing an extreme anchor."
    },
    "items": [
      {
        "id": "notice",
        "ru": "Назвать якорь якорем, не отвечая цифрой",
        "en": "Name the anchor as an anchor, without answering with a number"
      },
      {
        "id": "interests",
        "ru": "Спросить, что стоит за его цифрой",
        "en": "Ask what sits behind their number"
      },
      {
        "id": "criteria",
        "ru": "Предложить внешний критерий как систему отсчёта",
        "en": "Offer an external criterion as the frame"
      },
      {
        "id": "counter",
        "ru": "Поставить свою цифру ВНУТРИ этого критерия",
        "en": "Put your number INSIDE that criterion"
      }
    ],
    "answer": [
      "notice",
      "interests",
      "criteria",
      "counter"
    ],
    "explain": {
      "ru": "Цифру называют последней. Пока не найдена общая система отсчёта, любой ваш номер — просто второй якорь, и стол превращается в перетягивание каната.",
      "en": "The number comes last. Until there is a shared frame, any number of yours is just a second anchor and the table becomes a tug of war."
    }
  },
  {
    "id": "an-06",
    "block": "anchoring",
    "lesson": 4,
    "type": "face",
    "difficulty": 1,
    "xp": 10,
    "scenario_id": "used_car",
    "answer": "offended",
    "prompt": {
      "ru": "Вы сказали, что машина столько не стоит. Что теперь с Сергеем?",
      "en": "You said the car is not worth that. Where is Sergey now?"
    },
    "explain": {
      "ru": "Он привязан к машине: критика вещи прочитана как критика его самого. Доверие −22, напряжение +26 — и дальше механика мстит, потому что уступки уже урезаны.",
      "en": "He is attached to the car: criticising the object read as criticising him. Trust −22, tension +26 — and the mechanics take revenge, because concessions are already cut."
    }
  },
  {
    "id": "an-07",
    "block": "anchoring",
    "lesson": 2,
    "type": "choice",
    "difficulty": 2,
    "xp": 15,
    "scenario_id": "used_car",
    "prompt": {
      "ru": "Вы приехали первым и говорите первым. Как поставить свой якорь?",
      "en": "You arrived first and you speak first. How do you set your anchor?"
    },
    "options": [
      {
        "ru": "900 — и это моё последнее слово.",
        "en": "900 — and that is my final offer."
      },
      {
        "ru": "Мы предлагаем 1080, и вот на чём это основано: по трём объявлениям на такой же пробег медиана рынка именно такая.",
        "en": "We propose 1080, and here is the basis: across three comparable listings at the same mileage the market rate is exactly that."
      },
      {
        "ru": "А какую цифру вы хотели бы услышать?",
        "en": "What figure would you like to hear?"
      },
      {
        "ru": "Давайте вы назовёте цифру первым.",
        "en": "Let us have you name a figure first."
      }
    ],
    "answer": 1,
    "expect_moves": [
      "anchor",
      "objective_criteria"
    ],
    "explain": {
      "ru": "Якорь без обоснования — просто цифра, и защищаться от него учат в следующем уроке. Якорь с критерием движок читает КАК критерий: рычаг +16 и реакция «убеждён». Первый вариант — цифра без единого основания, да ещё ультиматумом: доверие −14 и напряжение +30, потому что Сергей жёсткий и его стиль добавляет к ультиматуму ещё +8.",
      "en": "An anchor with no grounding is just a number, and the next lesson teaches how to defuse one. An anchor with a criterion is read by the engine AS a criterion: leverage +16 and the reaction “persuaded”. Option one is a bare number with an ultimatum on top: trust −14 and tension +30, because Sergey is a tough type and his style adds 8 more to an ultimatum."
    }
  },
  {
    "id": "an-08",
    "block": "anchoring",
    "lesson": 4,
    "type": "drill",
    "difficulty": 3,
    "xp": 40,
    "scenario_id": "used_car",
    "max_turns": 6,
    "prompt": {
      "ru": "Капстоун. Сбейте якорь 1200k и купите не дороже 1080k за 6 ходов, удержав напряжение ≤ 40.",
      "en": "Capstone. Defuse the 1200k anchor and buy at 1080k or less within 6 turns, keeping tension ≤ 40."
    },
    "goal": {
      "ru": "Сделка ≤ 1080k · напряжение ≤ 40",
      "en": "Deal ≤ 1080k · tension ≤ 40"
    },
    "pass": [
      {
        "field": "status",
        "op": "==",
        "value": "agreement"
      },
      {
        "field": "deal",
        "op": "<=",
        "value": 1080
      },
      {
        "field": "tension",
        "op": "<=",
        "value": 40
      }
    ],
    "explain": {
      "ru": "Сергей открылся на 160k выше своего дна, и оскорбительная встречная цифра эти 160k не отыгрывает: он привязан к машине, критика вещи читается как критика его самого. Потолок напряжения и есть запрет на контр-якорь — остаётся критерий.",
      "en": "Sergey opened 160k above his floor, and an insulting counter-number does not win those 160k back: he is attached to the car, and criticising the object reads as criticising him. The tension ceiling IS the ban on a counter-anchor — what is left is a criterion."
    }
  },
  {
    "id": "an-09",
    "block": "anchoring",
    "lesson": 3,
    "type": "reaction",
    "difficulty": 2,
    "xp": 10,
    "scenario_id": "used_car",
    "seed_turn": 4,
    "player_line": {
      "ru": "По рукам — 800 тысяч, и закрываем.",
      "en": "Deal at 800 thousand, let us close it."
    },
    "answer": "not_yet",
    "prompt": {
      "ru": "Как отреагирует Сергей?",
      "en": "How will Sergey react?"
    },
    "explain": {
      "ru": "«Пока не соглашается» — реакция на закрытие цифрой ниже дна: 800 меньше 1040, и пол оппонента непробиваем. Обиды нет, но напряжение +8: несостоявшееся рукопожатие стоит нервов обеим сторонам, а ход потрачен.",
      "en": "“Not yet” is the reaction to closing on a number below the floor: 800 is under 1040, and their floor does not move. No offence taken, but tension +8: a handshake that did not happen costs both sides, and the turn is gone."
    }
  },
  {
    "id": "lr-01",
    "block": "logrolling",
    "lesson": 2,
    "type": "choice",
    "difficulty": 2,
    "xp": 15,
    "scenario_id": "supplier",
    "prompt": {
      "ru": "Годовой контракт: для Ирины ценность 0.85, вам стоит 0.2. Предоплата 30%: ценность 0.55, стоит 0.45. Что менять первым?",
      "en": "Annual commitment: worth 0.85 to Irina, costs you 0.2. 30% upfront: worth 0.55, costs 0.45. Which do you trade first?"
    },
    "options": [
      {
        "ru": "Предоплату — она проще в исполнении",
        "en": "The upfront payment — it is simpler to execute"
      },
      {
        "ru": "Годовой контракт: максимум ценности для неё при минимуме затрат для вас",
        "en": "The annual commitment: maximum value to her at minimum cost to you"
      },
      {
        "ru": "Обе сразу, чтобы показать добрую волю",
        "en": "Both at once, to show good faith"
      },
      {
        "ru": "Ни одну — сначала выбить цену",
        "en": "Neither — squeeze the price first"
      }
    ],
    "answer": 1,
    "explain": {
      "ru": "Размен — это арифметика: уступать дешёвое для себя и дорогое для них. Пакетный балл 10·0.85 − 6·0.2 = 7.3 против 2.8 у предоплаты, и уступка растёт сильнее.",
      "en": "Logrolling is arithmetic: concede what is cheap for you and dear to them. Package score 10·0.85 − 6·0.2 = 7.3 versus 2.8 for the prepayment, and the concession grows more."
    }
  },
  {
    "id": "lr-02",
    "block": "logrolling",
    "lesson": 3,
    "type": "numeric",
    "difficulty": 3,
    "xp": 15,
    "scenario_id": "supplier",
    "prompt": {
      "ru": "Вы разменяли ОБА вторичных вопроса. Сколько пакетный балл добавит к шкале «Приёмы»? Формула: 10·ценность_для_них − 6·стоимость_для_вас за каждый.",
      "en": "You traded BOTH secondary issues. How much does the package add to Technique? Formula: 10·value_to_them − 6·cost_to_you each."
    },
    "answer": {
      "value": 10.1,
      "tolerance": 0.2
    },
    "unit": {
      "ru": "баллов",
      "en": "points"
    },
    "explain": {
      "ru": "(10·0.85 − 6·0.2) + (10·0.55 − 6·0.45) = 7.3 + 2.8 = 10.1. Потолок вклада +16, так что даже идеальный пакет не подменяет собой остальную технику.",
      "en": "(10·0.85 − 6·0.2) + (10·0.55 − 6·0.45) = 7.3 + 2.8 = 10.1. The contribution is capped at +16, so even a perfect package cannot stand in for the rest of the technique."
    }
  },
  {
    "id": "lr-03",
    "block": "logrolling",
    "lesson": 4,
    "type": "freeform",
    "difficulty": 2,
    "xp": 15,
    "scenario_id": "sla_renewal",
    "prompt": {
      "ru": "Предложите Виктору связанный размен: длинный контракт против уровня SLA.",
      "en": "Offer Viktor a linked trade: a longer term against the SLA level."
    },
    "check": {
      "require_moves": [
        "tradeoff"
      ],
      "forbid_moves": [
        "threat",
        "hostile"
      ],
      "min_arg": 38,
      "min_words": 8
    },
    "reference": {
      "ru": "Если мы продлим на 3 года и введём ступенчатый SLA, сможете ли вы дать 99.8% со второго квартала?",
      "en": "If we renew for three years with a phased SLA, can you move on uptime to 99.8% from Q2?"
    },
    "explain": {
      "ru": "Ключ — связка «если … то». Без неё движок увидит уступку (вы просто отдали), а не размен (вы обменяли). Размен даёт доверие +6, напряжение −4 и открывает вторую ось движения.",
      "en": "The key is the “if … then” link. Without it the engine sees a concession (you gave it away) rather than a trade (you exchanged it). A trade gives trust +6, tension −4 and opens a second axis of movement."
    }
  },
  {
    "id": "lr-04",
    "block": "logrolling",
    "lesson": 4,
    "type": "reaction",
    "difficulty": 1,
    "xp": 10,
    "scenario_id": "supplier",
    "seed_turn": 6,
    "opponent_line": {
      "ru": "Ниже 95 я не пойду, у меня своя маржа.",
      "en": "I will not go below 95, I have my own margin."
    },
    "player_line": {
      "ru": "Если мы дадим годовой контракт с гарантией объёма, сможете ли вы подвинуться по цене до 88?",
      "en": "If we give an annual volume commitment, can you move on price to 88?"
    },
    "answer": "collaborated",
    "prompt": {
      "ru": "Что произошло с Ириной?",
      "en": "What happened to Irina?"
    },
    "explain": {
      "ru": "Размен — единственный ход, дающий «идёт навстречу». Он же двигает её цену сильнее всего в игре: к базовой уступке добавляется вклад годового контракта.",
      "en": "A trade is the only move that yields “collaborated”. It also moves her price more than anything else in the game: the annual commitment stacks on the base concession."
    }
  },
  {
    "id": "lr-05",
    "block": "logrolling",
    "lesson": 2,
    "type": "match",
    "difficulty": 3,
    "xp": 15,
    "prompt": {
      "ru": "Соедините вторичный вопрос с интересом, который он закрывает.",
      "en": "Match each secondary issue to the interest it satisfies."
    },
    "left": [
      {
        "id": "annual_contract",
        "ru": "Годовой контракт с гарантией объёма (поставщик)",
        "en": "Annual volume commitment (supplier)"
      },
      {
        "id": "board_seat",
        "ru": "Место в совете директоров (инвестор)",
        "en": "Board seat (investor)"
      },
      {
        "id": "joint_status",
        "ru": "Совместный статус для руководства (конфликт)",
        "en": "Joint status to leadership (conflict)"
      },
      {
        "id": "long_lease",
        "ru": "Договор на 11+ месяцев (аренда)",
        "en": "11+ month lease (rent)"
      }
    ],
    "right": [
      {
        "id": "i_util",
        "ru": "Стабильная загрузка производства",
        "en": "Stable factory utilization"
      },
      {
        "id": "i_control",
        "ru": "Контроль без изъятия доли фаундера",
        "en": "Control without taking the founder's equity"
      },
      {
        "id": "i_blame",
        "ru": "Не выглядеть виноватым перед руководством",
        "en": "Not look at fault to leadership"
      },
      {
        "id": "i_vacancy",
        "ru": "Избежать простоя и пустых месяцев",
        "en": "Avoid vacancy and empty months"
      }
    ],
    "answer": {
      "annual_contract": "i_util",
      "board_seat": "i_control",
      "joint_status": "i_blame",
      "long_lease": "i_vacancy"
    },
    "explain": {
      "ru": "У каждой фишки ценность для оппонента 0.8–0.85 именно потому, что она бьёт прямо в скрытый интерес. Вторичные вопросы не выдуманы — они выведены из интересов.",
      "en": "Every one of these chips is worth 0.8–0.85 to the counterpart precisely because it lands on a hidden interest. The secondary issues are not invented — they are derived from them."
    }
  },
  {
    "id": "lr-06",
    "block": "logrolling",
    "lesson": 1,
    "type": "freeform",
    "difficulty": 2,
    "xp": 15,
    "scenario_id": "supplier",
    "prompt": {
      "ru": "Спор идёт только про цену. Добавьте вторую ось: свяжите условие контракта с ценой.",
      "en": "The argument is about price only. Add a second axis: link a contract term to the price."
    },
    "check": {
      "require_moves": [
        "tradeoff"
      ],
      "forbid_moves": [
        "threat",
        "hostile"
      ],
      "min_arg": 26,
      "min_words": 8
    },
    "reference": {
      "ru": "Давайте свяжем срок контракта с ценой: если мы даём годовой объём, вы двигаетесь по цене?",
      "en": "Let us link the term to the price: if we give an annual volume, can you move on price?"
    },
    "explain": {
      "ru": "Пока обсуждается одна цена, выигрыш одного равен проигрышу другого. Второй вопрос — срок, объём, график платежей — создаёт варианты, где выигрывают оба.",
      "en": "While only price is on the table, one side's gain is the other's loss. A second issue — term, volume, payment schedule — creates options where both sides win."
    }
  },
  {
    "id": "lr-07",
    "block": "logrolling",
    "lesson": 4,
    "type": "freeform",
    "difficulty": 3,
    "xp": 20,
    "scenario_id": "supplier",
    "prompt": {
      "ru": "Свяжите цену с ГОДОВЫМ КОНТРАКТОМ — назовите условие прямо, а не «пойдём навстречу».",
      "en": "Link the price to the ANNUAL COMMITMENT — name the term outright, not “we will meet you halfway”."
    },
    "check": {
      "require_moves": [
        "tradeoff"
      ],
      "forbid_moves": [
        "concession",
        "threat",
        "hostile"
      ],
      "require_secondary": "annual_contract",
      "min_words": 8
    },
    "reference": {
      "ru": "Если мы дадим годовой контракт с гарантией объёма на весь год, сможете подвинуться по цене за штуку?",
      "en": "If we commit to an annual volume commitment for the whole year, can you move down on the price per unit?"
    },
    "explain": {
      "ru": "Движок считает пакет по НАЗВАННОМУ условию: годовой контракт стоит ей 0.85, то есть добавляет к уступке 0.10 + 0.30·0.85 = 0.355. Безымянное «пойдём навстречу» — уступка (`concession`), а не размен: вы отдали, ничего не получив, и второй оси не появилось.",
      "en": "The engine scores the package by the term you NAME: the annual commitment is worth 0.85 to her, i.e. it adds 0.10 + 0.30·0.85 = 0.355 to the concession. A nameless “we will meet you halfway” is a `concession`, not a trade: you gave something away for nothing, and no second axis appeared."
    }
  },
  {
    "id": "lr-08",
    "block": "logrolling",
    "lesson": 3,
    "type": "freeform",
    "difficulty": 3,
    "xp": 20,
    "scenario_id": "supplier",
    "prompt": {
      "ru": "Тот же приём на второй фишке: свяжите цену с ПРЕДОПЛАТОЙ.",
      "en": "The same move on the second chip: link the price to the UPFRONT PAYMENT."
    },
    "check": {
      "require_moves": [
        "tradeoff"
      ],
      "forbid_moves": [
        "threat",
        "hostile"
      ],
      "require_secondary": "prepay",
      "min_words": 8
    },
    "reference": {
      "ru": "Если мы внесём предоплату 30% в момент подписания, сможете подвинуться по цене за штуку?",
      "en": "If we pay 30% upfront at signing, can you move down on the price per unit?"
    },
    "explain": {
      "ru": "Предоплата стоит Ирине 0.55 против 0.85 у годового контракта — уступка меньше (0.265 против 0.355), а вам она обходится дороже (0.45 против 0.2). Порядок разменов не декоративен: сначала дешёвое вам и дорогое им.",
      "en": "The prepayment is worth 0.55 to Irina against 0.85 for the annual commitment — a smaller concession (0.265 vs 0.355) and a costlier one for you (0.45 vs 0.2). The order of trades is not decorative: cheap-for-you and dear-to-them goes first."
    }
  },
  {
    "id": "lr-09",
    "block": "logrolling",
    "lesson": 4,
    "type": "drill",
    "difficulty": 3,
    "xp": 40,
    "scenario_id": "supplier",
    "max_turns": 6,
    "prompt": {
      "ru": "Капстоун. Соберите пакет: закройтесь не дороже 87 ₽/шт за 6 ходов, доведя доверие до 70.",
      "en": "Capstone. Build the package: close at 87/unit or better within 6 turns, taking trust to 70."
    },
    "goal": {
      "ru": "Сделка ≤ 87 · доверие ≥ 70",
      "en": "Deal ≤ 87 · trust ≥ 70"
    },
    "pass": [
      {
        "field": "status",
        "op": "==",
        "value": "agreement"
      },
      {
        "field": "deal",
        "op": "<=",
        "value": 87
      },
      {
        "field": "trust",
        "op": ">=",
        "value": 70
      }
    ],
    "explain": {
      "ru": "Доверие 70 на этом столе одним слушанием не набирается: каждая названная фишка добавляет сверху 3 + 4·ценность, и обе вместе с самим разменом дают почти восемнадцать пунктов. Порог доверия здесь — способ проверить, что пакет был СОБРАН, а не обещан словами.",
      "en": "Trust of 70 is not reachable on this table by listening alone: every named chip adds 3 + 4·value on top, and both together with the trade itself give almost eighteen points. The trust threshold is how this checks that the package was actually BUILT, not merely promised in words."
    }
  },
  {
    "id": "pd-01",
    "block": "pressure-defense",
    "lesson": 1,
    "type": "choice",
    "difficulty": 2,
    "xp": 15,
    "scenario_id": "sla_renewal",
    "prompt": {
      "ru": "Виктор: «99.5% — потолок. Это не обсуждается». Ваш ход?",
      "en": "Viktor: “99.5% is the ceiling. Non-negotiable.” Your move?"
    },
    "options": [
      {
        "ru": "Или вы даёте 99.9%, или мы уходим к конкуренту — это наше последнее слово.",
        "en": "Either you give us 99.9%, or we walk to your competitor — that is our final word."
      },
      {
        "ru": "Понимаю, что вам важно не брать штрафы. Что именно делает 99.9% невозможным для вашей эксплуатации?",
        "en": "I understand you must not take penalties. What exactly makes 99.9% impossible for your ops team?"
      },
      {
        "ru": "Всё обсуждается, не начинайте.",
        "en": "Everything is negotiable, do not start."
      },
      {
        "ru": "Хорошо, пусть 99.5%.",
        "en": "Fine, let us say 99.5%."
      }
    ],
    "answer": 1,
    "expect_moves": [
      "acknowledge"
    ],
    "explain": {
      "ru": "Ультиматум — это упаковка, внутри почти всегда страх. «Не брать штрафы, которые не вытянет эксплуатация» — реальный интерес Виктора. Первый вариант закрывает его: альтернатива плюс ультиматум дают −14 доверия и +44 напряжения разом, потому что жёсткий стиль добавляет к ультиматуму ещё +8.",
      "en": "An ultimatum is packaging; a fear usually sits inside. “Avoid penalties the ops team cannot sustain” is Viktor's real interest. Option one hardens him: an alternative plus an ultimatum costs −14 trust and +44 tension at once, because the tough style adds a further +8 to an ultimatum."
    }
  },
  {
    "id": "pd-02",
    "block": "pressure-defense",
    "lesson": 1,
    "type": "freeform",
    "difficulty": 3,
    "xp": 20,
    "scenario_id": "sla_renewal",
    "prompt": {
      "ru": "Не отступите и не пригрозите: верните разговор к объективному критерию.",
      "en": "Do not retreat and do not threaten: bring the conversation back to an objective criterion."
    },
    "check": {
      "require_moves": [
        "objective_criteria"
      ],
      "forbid_moves": [
        "threat",
        "hostile"
      ],
      "min_arg": 40,
      "min_words": 10
    },
    "reference": {
      "ru": "Я слышу, что это ваше последнее слово. Давайте вернёмся к цифрам: отраслевой стандарт — 99.9%, и наш простой стоит 2.4 млн в час.",
      "en": "I hear that this is your final word. Let us go back to the numbers: the industry standard is 99.9% and our downtime costs 2.4m an hour."
    },
    "explain": {
      "ru": "Это гарвардское «джиу-джитсу»: не отвечать на атаку атакой, а переводить её в вопрос критерия. Реакция «убеждён данными», рычаг +16, напряжение не растёт. Ультиматум в ответ дал бы +30 к напряжению.",
      "en": "This is Harvard negotiation jujitsu: do not answer an attack with an attack, redirect it into a question of criteria. Reaction “persuaded”, leverage +16, no rise in tension. A counter-ultimatum would have cost +30 tension."
    }
  },
  {
    "id": "pd-03",
    "block": "pressure-defense",
    "lesson": 3,
    "type": "numeric",
    "difficulty": 3,
    "xp": 15,
    "prompt": {
      "ru": "Ваша расчётная уступка на этом ходу — 0.40. Напряжение оппонента 80. Какой она станет фактически?",
      "en": "Your computed concession this turn is 0.40. The opponent's tension is 80. What does it actually become?"
    },
    "answer": {
      "value": 0.1,
      "tolerance": 0.005
    },
    "unit": {
      "ru": "доли",
      "en": "fraction"
    },
    "explain": {
      "ru": "При напряжении выше 75 движок умножает уступку на 0.25: 0.40 × 0.25 = 0.10. Между 55 и 75 — на 0.6. Это цена давления в чистом виде: вы получаете рычаг и замораживаете возможность им воспользоваться.",
      "en": "Above 75 tension the engine multiplies the concession by 0.25: 0.40 × 0.25 = 0.10. Between 55 and 75 it is 0.6. This is the price of pressure in its purest form: you gain leverage and freeze your ability to use it."
    }
  },
  {
    "id": "pd-04",
    "block": "pressure-defense",
    "lesson": 4,
    "type": "spot_error",
    "difficulty": 2,
    "xp": 10,
    "scenario_id": "supplier",
    "prompt": {
      "ru": "Игрок отправил эту реплику ДВАЖДЫ подряд. В чём главная проблема второго раза?",
      "en": "The player sent this line TWICE in a row. What is the main problem with the second send?"
    },
    "bad_line": {
      "ru": "Рыночная цена на такие комплектующие — 88 ₽/шт, по трём независимым прайсам.",
      "en": "The market rate for these components is 88 per unit, from three independent price lists."
    },
    "options": [
      {
        "key": "claim_without_criteria",
        "ru": "Реплика без критерия",
        "en": "The line has no criterion"
      },
      {
        "key": "repeat_same_line",
        "ru": "Дословный повтор: движок опускает качество аргумента до 12 и режет уступку до 15% — настойчивость не равна аргументу",
        "en": "A verbatim repeat: the engine drops argument quality to 12 and cuts the concession to 15% — persistence is not argument"
      },
      {
        "key": "threat",
        "ru": "Это звучит как ультиматум",
        "en": "It sounds like an ultimatum"
      },
      {
        "key": "position_no_interest",
        "ru": "Не задан вопрос об интересе",
        "en": "No interest question was asked"
      }
    ],
    "answer": 1,
    "fault_key": "repeat_same_line",
    "explain": {
      "ru": "Первый раз эта реплика даёт «принимает довод» и рычаг +16. Второй — качество аргумента ≤12 и уступка ×0.15. Анти-гейминг встроен в движок: одно и то же, сказанное громче, не работает.",
      "en": "The first send yields “persuaded” and leverage +16. The second: argument quality ≤12 and concession ×0.15. Anti-gaming is built into the engine: the same thing said louder does not work."
    }
  },
  {
    "id": "pd-05",
    "block": "pressure-defense",
    "lesson": 2,
    "type": "reaction",
    "difficulty": 2,
    "xp": 10,
    "scenario_id": "supplier",
    "seed_turn": 5,
    "opponent_line": {
      "ru": "95 — и это уже с уважением к вам.",
      "en": "95 — and that is already out of respect for you."
    },
    "player_line": {
      "ru": "Это ваше последнее слово? Иначе мы уходим.",
      "en": "Is that your final offer? Or else we walk."
    },
    "answer": "hardened",
    "prompt": {
      "ru": "Что произошло с Ириной?",
      "en": "What happened to Irina?"
    },
    "explain": {
      "ru": "Угроза: доверие вниз, напряжение вверх, цена почти не двигается — против заметного движения от размена. Угроза перебивает вопрос в определении реакции, потому что её блок выполняется позже.",
      "en": "A threat: trust down, tension up, and the price barely moves — against a clear move from a trade. The threat overrides the question in the reaction, because its block runs later."
    }
  },
  {
    "id": "pd-06",
    "block": "pressure-defense",
    "lesson": 4,
    "type": "face",
    "difficulty": 3,
    "xp": 15,
    "scenario_id": "conflict",
    "answer": "walked_out",
    "prompt": {
      "ru": "Что означает это лицо и почему партия на этом заканчивается?",
      "en": "What does this face mean, and why does the negotiation end here?"
    },
    "explain": {
      "ru": "Он встал из-за стола. Движок закрывает партию, когда напряжение доходит до предела или доверие падает почти до нуля: за этой точкой переговоров уже нет — ни при какой аргументации.",
      "en": "He has got up to leave. The engine ends the session when tension hits the ceiling or trust falls to almost nothing: past that point there is no negotiation left, whatever the argument."
    }
  },
  {
    "id": "pd-07",
    "block": "pressure-defense",
    "lesson": 4,
    "type": "drill",
    "difficulty": 3,
    "xp": 40,
    "scenario_id": "sla_renewal",
    "max_turns": 6,
    "prompt": {
      "ru": "Капстоун. Дожмите аптайм до 99.7% за 6 ходов, удержав напряжение ≤ 30 и доверие ≥ 65.",
      "en": "Capstone. Push uptime to 99.7% within 6 turns, keeping tension ≤ 30 and trust ≥ 65."
    },
    "goal": {
      "ru": "Аптайм ≥ 99.7% · напряжение ≤ 30 · доверие ≥ 65",
      "en": "Uptime ≥ 99.7% · tension ≤ 30 · trust ≥ 65"
    },
    "pass": [
      {
        "field": "status",
        "op": "==",
        "value": "agreement"
      },
      {
        "field": "deal",
        "op": ">=",
        "value": 99.7
      },
      {
        "field": "tension",
        "op": "<=",
        "value": 30
      },
      {
        "field": "trust",
        "op": ">=",
        "value": 65
      }
    ],
    "explain": {
      "ru": "Оппонент здесь давит сам, и зеркальный ультиматум стоит дороже, чем кажется: этот стиль «жёсткий», поэтому к напряжению прибавляется ещё +8 сверх обычных +22. Оба порога держатся тем, что возражение разбирают как интерес, а не как атаку.",
      "en": "This counterpart applies the pressure, and mirroring the ultimatum costs more than it looks: the style is “tough”, so tension takes another +8 on top of the usual +22. Both thresholds hold only if the objection is unpacked as an interest rather than met as an attack."
    }
  },
  {
    "id": "cl-01",
    "block": "closing",
    "lesson": 1,
    "type": "numeric",
    "difficulty": 3,
    "xp": 20,
    "scenario_id": "supplier",
    "prompt": {
      "ru": "На столе: её 88, ваши 84. Гибкость 0.5. Точка встречи = её_цифра + (ваша − её) × (0.3 + 0.45 × гибкость). На чём закроется сделка?",
      "en": "On the table: hers 88, yours 84. Flexibility 0.5. Meeting point = theirs + (yours − theirs) × (0.3 + 0.45 × flex). Where does it close?"
    },
    "answer": {
      "value": 85.9,
      "tolerance": 0.1
    },
    "unit": {
      "ru": "₽/шт",
      "en": "/unit"
    },
    "explain": {
      "ru": "w = 0.3 + 0.45 × 0.5 = 0.525; 88 + (84 − 88) × 0.525 = 85.9. При гибкости 0.7 было бы 85.54. Всё, что вы делали десять ходов — доверие, информация, рычаг — окупается здесь.",
      "en": "w = 0.3 + 0.45 × 0.5 = 0.525; 88 + (84 − 88) × 0.525 = 85.9. At flexibility 0.7 it would be 85.54. Everything you built over ten turns cashes out right here."
    }
  },
  {
    "id": "cl-02",
    "block": "closing",
    "lesson": 2,
    "type": "choice",
    "difficulty": 2,
    "xp": 10,
    "scenario_id": "supplier",
    "prompt": {
      "ru": "Дно Ирины — 84. Вы говорите «по рукам на 80». Что произойдёт?",
      "en": "Irina's floor is 84. You say “deal at 80”. What happens?"
    },
    "options": [
      {
        "ru": "Сделка закроется на 80 — вы же согласились",
        "en": "The deal closes at 80 — you agreed, after all"
      },
      {
        "ru": "Сделка закроется на 84, её дне",
        "en": "The deal closes at 84, her floor"
      },
      {
        "ru": "Сделки не будет: реакция «пока нет», стол остаётся открытым",
        "en": "No deal: reaction “not yet”, the table stays open"
      },
      {
        "ru": "Переговоры сорвутся",
        "en": "The talks collapse"
      }
    ],
    "answer": 2,
    "explain": {
      "ru": "Первый инвариант движка: оппонент НИКОГДА не переходит своё дно. Точка встречи ниже 84 отклоняется, статус остаётся активным, реакция — «пока нет».",
      "en": "Engine invariant one: the opponent NEVER crosses their floor. A meeting point below 84 is rejected, the status stays active, the reaction is “not yet”."
    }
  },
  {
    "id": "cl-03",
    "block": "closing",
    "lesson": 3,
    "type": "freeform",
    "difficulty": 2,
    "xp": 15,
    "scenario_id": "supplier",
    "prompt": {
      "ru": "Зафиксируйте сделку: цифра + условие пакета.",
      "en": "Lock the deal in: the number plus the package term."
    },
    "check": {
      "require_moves": [
        "accept"
      ],
      "forbid_moves": [
        "threat",
        "hostile"
      ],
      "require_number": true,
      "min_words": 6
    },
    "reference": {
      "ru": "Тогда фиксируем: 88 ₽/шт при годовом контракте. По рукам?",
      "en": "Then we have a deal at 88 per unit with an annual volume commitment."
    },
    "explain": {
      "ru": "Закрытие без цифры движок закроет на ЕЁ последнем номере — вы подарите весь остаток зоны. Цифра в закрывающей реплике стоит реальных денег.",
      "en": "A close with no number settles at HER last number — you hand over the whole remaining zone. The figure in a closing line is worth real money."
    }
  },
  {
    "id": "cl-04",
    "block": "closing",
    "lesson": 4,
    "type": "numeric",
    "difficulty": 3,
    "xp": 20,
    "prompt": {
      "ru": "Экономика 95, Отношения 80, Приёмы 40. Посчитайте итог: 0.4·эко + 0.25·отн + 0.35·приёмы.",
      "en": "Economics 95, Relationship 80, Technique 40. Compute the overall: 0.4·eco + 0.25·rel + 0.35·tech."
    },
    "answer": {
      "value": 72,
      "tolerance": 0
    },
    "unit": {
      "ru": "баллов",
      "en": "points"
    },
    "explain": {
      "ru": "0.4·95 + 0.25·80 + 0.35·40 = 38 + 20 + 14 = 72, то есть грейд B. НО: приёмы 40 < 45, поэтому потолок опускается до C. Отличная цена без метода не даёт A/B — это тезис Гарварда, зашитый в код.",
      "en": "0.4·95 + 0.25·80 + 0.35·40 = 38 + 20 + 14 = 72, i.e. grade B. BUT: technique 40 < 45, so the ceiling drops to C. A great price bought without method never earns A/B — the Harvard thesis, written into the code."
    }
  },
  {
    "id": "cl-05",
    "block": "closing",
    "lesson": 4,
    "type": "drill",
    "difficulty": 3,
    "xp": 40,
    "scenario_id": "supplier",
    "max_turns": 6,
    "prompt": {
      "ru": "Капстоун. Закройте сделку не дороже 88 ₽/шт за 6 ходов, вскрыв минимум два интереса и не подняв напряжение выше 45.",
      "en": "Capstone. Close at 88/unit or better within 6 turns, uncovering at least two interests and never pushing tension above 45."
    },
    "goal": {
      "ru": "Сделка ≤ 88 · два интереса · напряжение ≤ 45",
      "en": "Deal ≤ 88 · two interests · tension ≤ 45"
    },
    "pass": [
      {
        "field": "status",
        "op": "==",
        "value": "agreement"
      },
      {
        "field": "deal",
        "op": "<=",
        "value": 88
      },
      {
        "field": "interests_found",
        "op": ">=",
        "value": 2
      },
      {
        "field": "tension",
        "op": "<=",
        "value": 45
      }
    ],
    "explain": {
      "ru": "Все четыре условия одновременно достижимы только принципиальной игрой: вопросы дают Информацию, критерий даёт Рычаг, размен даёт вторую ось, слушание держит Напряжение.",
      "en": "All four conditions hold together only under principled play: questions give Information, a criterion gives Leverage, a trade opens the second axis, listening keeps Tension down."
    }
  },
  {
    "id": "st-01",
    "block": "styles",
    "lesson": 1,
    "type": "choice",
    "difficulty": 2,
    "xp": 10,
    "prompt": {
      "ru": "Первая реплика оппонента. По какой из них видно ЖЁСТКИЙ стиль?",
      "en": "Their opening line. Which one shows the TOUGH style?"
    },
    "options": [
      {
        "ru": "Покажите расчёт — на чём основана ваша цифра?",
        "en": "Show me the calculation — what is your number based on?"
      },
      {
        "ru": "Давайте по-человечески: мы с вами работаем не первый год.",
        "en": "Let us keep this human: you and I have worked together for years."
      },
      {
        "ru": "Условия такие. Не устраивает — на этом и закончим.",
        "en": "These are the terms. If they do not suit you, we are done here."
      },
      {
        "ru": "Мне надо посоветоваться с коллегами, я не решаю один.",
        "en": "I need to check with my colleagues, this is not my call alone."
      }
    ],
    "answer": 2,
    "explain": {
      "ru": "Жёсткий сразу ставит рамку и обозначает выход. Первая реплика — аналитик (просит обоснование), вторая — «отношенец» (говорит про людей), четвёртая — не стиль вовсе, а отсылка к чужому решению. Стилей в игре ровно три, и у каждого стола он один и не меняется по ходу партии.",
      "en": "The tough one sets a frame and points at the exit straight away. The first line is the analytical type (asking for grounding), the second the relationship type (talking about people), the fourth is not a style at all but a deferral to someone else. The game has exactly three styles, one per table, and it never changes mid-game."
    }
  },
  {
    "id": "st-02",
    "block": "styles",
    "lesson": 2,
    "type": "match",
    "difficulty": 3,
    "xp": 15,
    "prompt": {
      "ru": "Соедините стиль с надбавкой, которую он даёт в шкалах движка.",
      "en": "Match each style to the modifier it applies on the engine's meters."
    },
    "left": [
      {
        "id": "analytical",
        "ru": "Аналитик (Дмитрий, Марина, Павел)",
        "en": "Analytical (Dmitry, Marina, Pavel)"
      },
      {
        "id": "relationship",
        "ru": "«Отношенец» (Ирина, Наталья, Тимур)",
        "en": "Relationship (Irina, Natalia, Timur)"
      },
      {
        "id": "tough",
        "ru": "Жёсткий (Алексей, Сергей, Виктор)",
        "en": "Tough (Alexey, Sergey, Viktor)"
      }
    ],
    "right": [
      {
        "id": "m_criteria",
        "ru": "Объективный критерий: рычаг +6 сверх обычных 16",
        "en": "An objective criterion: leverage +6 on top of the usual 16"
      },
      {
        "id": "m_batna",
        "ru": "Названная альтернатива: напряжение +6 сверх обычного",
        "en": "Naming your alternative: tension +6 on top of the usual"
      },
      {
        "id": "m_threat",
        "ru": "Ультиматум: напряжение +8 сверх обычных 22",
        "en": "An ultimatum: tension +8 on top of the usual 22"
      }
    ],
    "answer": {
      "analytical": "m_criteria",
      "relationship": "m_batna",
      "tough": "m_threat"
    },
    "explain": {
      "ru": "Три надбавки — и все три штрафные, кроме первой: аналитику те же данные стоят дороже в вашу пользу, «отношенцу» альтернатива обходится на +6 напряжения дороже (10 вместо 4 с опорой, 20 вместо 14 без), жёсткому ультиматум даёт 30 напряжения вместо 22. Скидки за стиль в движке нет ни одной.",
      "en": "Three modifiers, and all but the first are penalties: with the analyst the same data is worth more in your favour; with the relationship type an alternative costs 6 more tension (10 instead of 4 when grounded, 20 instead of 14 when not); with the tough one an ultimatum means 30 tension instead of 22. The engine has no style discounts at all."
    }
  },
  {
    "id": "st-03",
    "block": "styles",
    "lesson": 2,
    "type": "reaction",
    "difficulty": 3,
    "xp": 10,
    "scenario_id": "conflict",
    "seed_turn": 4,
    "player_line": {
      "ru": "Это ваше последнее слово? Иначе мы эскалируем к директору и уходим.",
      "en": "Is that your final word? Otherwise we escalate to the director and walk."
    },
    "answer": "hardened",
    "prompt": {
      "ru": "Стол жёсткого стиля. Как отреагирует Алексей?",
      "en": "A tough-style table. How will Alexey react?"
    },
    "explain": {
      "ru": "«Закрывается». Ультиматум и так стоит 22 напряжения и −14 доверия, а жёсткий стиль добавляет ещё +8: тридцать за один ход. Выше 55 движок режет уступку до 60 %, выше 75 — до 25 %, так что рычаг +6 вы получили и тут же заморозили. Вторая угроза подряд отматывает цену назад.",
      "en": "“Hardened”. An ultimatum already costs 22 tension and −14 trust, and the tough style adds 8 more: thirty in a single turn. Above 55 the engine cuts concessions to 60 %, above 75 to 25 % — so the +6 leverage you bought is frozen the moment you buy it. A second threat walks the price back."
    }
  },
  {
    "id": "st-04",
    "block": "styles",
    "lesson": 3,
    "type": "choice",
    "difficulty": 3,
    "xp": 15,
    "scenario_id": "investor",
    "prompt": {
      "ru": "Марина — аналитик и просит обосновать долю. С чего начать разговор про 20%?",
      "en": "Marina is an analyst and wants the equity split grounded. How do you open on 20%?"
    },
    "options": [
      {
        "ru": "Или 20%, или мы идём в другой фонд.",
        "en": "Either 20%, or we go to another fund."
      },
      {
        "ru": "По медиане раундов этой стадии доля 20%, потому что так считают независимые обзоры рынка.",
        "en": "The median for this stage is 20% equity, because that is what independent market reviews show."
      },
      {
        "ru": "Мне кажется, что 30% — это несправедливо по отношению ко мне.",
        "en": "I feel that 30% is simply unfair to me."
      },
      {
        "ru": "Хорошо, давайте посередине — 24%.",
        "en": "Fine, let us split it — 24%."
      }
    ],
    "answer": 1,
    "expect_moves": [
      "objective_criteria"
    ],
    "explain": {
      "ru": "С аналитиком критерий идёт РАНЬШЕ размена и тем более раньше давления: рычаг +22 вместо +16 и реакция «принимает довод». Ощущение несправедливости для него не аргумент, а «посередине» — уступка без повода: движок не начислит за неё ничего.",
      "en": "With an analyst the criterion comes BEFORE the trade, and long before any pressure: leverage +22 instead of +16 and the reaction “persuaded”. A sense of unfairness is not an argument to him, and “let us split it” is a concession with no reason — the engine grants nothing for it."
    }
  },
  {
    "id": "st-05",
    "block": "styles",
    "lesson": 4,
    "type": "numeric",
    "difficulty": 2,
    "xp": 10,
    "scenario_id": "candidate_offer",
    "derive": "target_slack",
    "prompt": {
      "ru": "Стол этого блока: дно Тимура 210k, ваша цель 230k. На сколько ниже цели он готов подписать — то есть сколько можно выжать, не получив за это ни балла?",
      "en": "This block's table: Timur's floor is 210k, your target 230k. How far below your target would he still sign — that is, how much can you squeeze out for zero points?"
    },
    "answer": {
      "value": 20,
      "tolerance": 0
    },
    "unit": {
      "ru": "k ₽/мес",
      "en": "k/mo"
    },
    "explain": {
      "ru": "Двадцать тысяч запаса — и они ничего не стоят. Экономика считается как доля пути от красной линии (260) до цели (230) и на 230 уже равна 100: ниже потолка нет. Зато отношения — четверть итога, и каждый выжатый пункт платится оттуда.",
      "en": "Twenty thousand of slack — and it is worth nothing. Economics is the share of the distance from your red line (260) to your target (230), and at 230 it is already 100: there is no ceiling above it. Relationship, though, is a quarter of the score, and every squeezed point is paid out of it."
    }
  },
  {
    "id": "st-06",
    "block": "styles",
    "lesson": 4,
    "type": "choice",
    "difficulty": 3,
    "xp": 15,
    "scenario_id": "candidate_offer",
    "prompt": {
      "ru": "Тимур просит 280. Второго оффера у него нет, и вы это знаете. Ваш ход?",
      "en": "Timur asks for 280. He has no rival offer, and you know it. Your move?"
    },
    "options": [
      {
        "ru": "Других офферов у вас нет, поэтому мы предлагаем 212, и это наша цена.",
        "en": "You have no other offers, so we propose 212, and that is our price."
      },
      {
        "ru": "Хорошо, давайте 260, лишь бы вы вышли.",
        "en": "Fine, let us do 260, just so you join."
      },
      {
        "ru": "Тимур, что для вас важнее всего в этом переходе — переезд семьи, рост, что-то ещё?",
        "en": "Timur, what matters most to you in this move — relocating your family, growth, something else?"
      },
      {
        "ru": "Либо выходите на 215, либо мы берём другого финалиста — это ультиматум.",
        "en": "Either you come in at 215, or we take another finalist — that is our final word."
      }
    ],
    "answer": 2,
    "expect_moves": [
      "interests_probe"
    ],
    "explain": {
      "ru": "Сила здесь нужна не для того, чтобы выжимать: 212 не добавит ни балла к экономике, зато Тимур — «отношенец», и названная альтернатива стоит с ним на +6 напряжения дороже. Вопрос про переход даёт +24 к Информации и открывает то, чем можно заплатить дёшево: трек до архитектора стоит компании подписи, а для него это причина всего перехода.",
      "en": "Power here is not for squeezing: 212 adds nothing to the economics, while Timur is a relationship type, so naming an alternative costs +6 more tension with him. The question about the move gives +24 Information and opens what you can pay with cheaply: an architect track costs the company a signature, and for him it is the whole reason he came."
    }
  },
  {
    "id": "st-07",
    "block": "styles",
    "lesson": 4,
    "type": "freeform",
    "difficulty": 3,
    "xp": 20,
    "scenario_id": "candidate_offer",
    "prompt": {
      "ru": "Предложите Тимуру размен: назовите КОНКРЕТНУЮ вещь, которая стоит вам дёшево, и свяжите её с выходом на 230.",
      "en": "Offer Timur a trade: name a CONCRETE thing that is cheap for you and link it to joining at 230."
    },
    "check": {
      "require_moves": [
        "tradeoff"
      ],
      "forbid_moves": [
        "threat",
        "hostile"
      ],
      "require_secondary": "growth_track",
      "min_words": 8
    },
    "reference": {
      "ru": "Если мы дадим трек до архитектора с наставником, вы выйдете на 230?",
      "en": "If we give you an architect track with a mentor, can you move to 230?"
    },
    "explain": {
      "ru": "Названная фишка двигает цену на 0.10 + 0.30·ценность и добавляет доверие 3 + 4·ценность; у трека до архитектора ценность 0.85 при вашей цене 0.15 — лучший размен стола. Безымянное «пойдём навстречу» не двигает цену вовсе: это уступка, а не размен.",
      "en": "A named issue moves the price by 0.10 + 0.30·value and adds 3 + 4·value trust; the architect track is worth 0.85 to him and costs you 0.15 — the best trade at this table. An unnamed “we will meet you halfway” moves nothing: that is a concession, not a trade."
    }
  },
  {
    "id": "st-08",
    "block": "styles",
    "lesson": 4,
    "type": "drill",
    "difficulty": 3,
    "xp": 40,
    "scenario_id": "candidate_offer",
    "max_turns": 6,
    "prompt": {
      "ru": "Капстоун. Закройте оффер на цели — 230k, НЕ НИЖЕ — за 6 ходов, вскрыв минимум два интереса и удержав доверие ≥ 70.",
      "en": "Capstone. Close the offer at your target — 230k, NOT below — within 6 turns, uncovering at least two interests and keeping trust ≥ 70."
    },
    "goal": {
      "ru": "Сделка 230–240k · два интереса · доверие ≥ 70",
      "en": "Deal 230–240k · two interests · trust ≥ 70"
    },
    "pass": [
      {
        "field": "status",
        "op": "==",
        "value": "agreement"
      },
      {
        "field": "deal",
        "op": ">=",
        "value": 230
      },
      {
        "field": "deal",
        "op": "<=",
        "value": 240
      },
      {
        "field": "interests_found",
        "op": ">=",
        "value": 2
      },
      {
        "field": "trust",
        "op": ">=",
        "value": 70
      }
    ],
    "explain": {
      "ru": "Единственный капстоун курса с НИЖНЕЙ границей по цене. Тимур подписал бы и 210, но за эти двадцать тысяч не начисляют ничего, а доверие 70 после выжимания не собрать: названная «отношенцу» альтернатива стоит на +6 напряжения дороже. Сила проверяется тем, от чего вы отказались, а не тем, что взяли.",
      "en": "The only capstone in the course with a LOWER price bound. Timur would sign at 210, but those twenty thousand earn nothing, and trust of 70 cannot survive the squeeze: naming an alternative to a relationship type costs +6 more tension. Power is measured by what you declined to take, not by what you took."
    }
  }
];

// Экзамен мастера: три настоящие партии подряд.
export const COURSE_MASTER: Exercise[] = [
  {
    "id": "ms-01",
    "type": "drill",
    "scenario_id": "freelance_rate",
    "max_turns": 8,
    "xp": 60,
    "prompt": {
      "ru": "Поднимите ставку до 17k в день, не подняв напряжение выше 50.",
      "en": "Raise your rate to 17k a day without pushing tension above 50."
    },
    "goal": {
      "ru": "Сделка ≥ 17k · напряжение ≤ 50",
      "en": "Deal ≥ 17k · tension ≤ 50"
    },
    "pass": [
      {
        "field": "status",
        "op": "==",
        "value": "agreement"
      },
      {
        "field": "deal",
        "op": ">=",
        "value": 17
      },
      {
        "field": "tension",
        "op": "<=",
        "value": 50
      }
    ],
    "explain": {
      "ru": "Направление здесь обратное: выше — лучше. Тот же метод работает и в эту сторону — критерий вместо «я стою больше», размен вместо давления.",
      "en": "The direction is reversed here: higher is better. The same method works this way too — a criterion instead of “I am worth more”, a trade instead of pressure."
    }
  },
  {
    "id": "ms-02",
    "type": "drill",
    "scenario_id": "investor",
    "max_turns": 7,
    "xp": 60,
    "prompt": {
      "ru": "Закройтесь на доле не выше 19%, вскрыв все три интереса инвестора и не подняв напряжение выше 50.",
      "en": "Close at 19% equity or less, having uncovered all three of the investor's interests, without pushing tension above 50."
    },
    "goal": {
      "ru": "Доля ≤ 19% · три интереса · напряжение ≤ 50",
      "en": "Equity ≤ 19% · three interests · tension ≤ 50"
    },
    "pass": [
      {
        "field": "status",
        "op": "==",
        "value": "agreement"
      },
      {
        "field": "deal",
        "op": "<=",
        "value": 19
      },
      {
        "field": "interests_found",
        "op": ">=",
        "value": 3
      },
      {
        "field": "tension",
        "op": "<=",
        "value": 50
      }
    ],
    "explain": {
      "ru": "Самый трудный стол курса: дно Марины 18% не двигается ни от какого давления. Работает только то, что вы отрабатывали в блоках: вопросы, критерии, размен вторичных условий.",
      "en": "The hardest table in the course: Marina's floor of 18% does not move under any pressure. Only what the blocks trained works: questions, criteria, trading secondary terms."
    }
  },
  {
    "id": "ms-03",
    "type": "drill",
    "scenario_id": "used_car",
    "max_turns": 6,
    "xp": 60,
    "prompt": {
      "ru": "Купите не дороже 1070k, ни разу не подняв напряжение выше 40.",
      "en": "Buy at 1070k or less, never pushing tension above 40."
    },
    "goal": {
      "ru": "Сделка ≤ 1070k · напряжение ≤ 40",
      "en": "Deal ≤ 1070k · tension ≤ 40"
    },
    "pass": [
      {
        "field": "status",
        "op": "==",
        "value": "agreement"
      },
      {
        "field": "deal",
        "op": "<=",
        "value": 1070
      },
      {
        "field": "tension",
        "op": "<=",
        "value": 40
      }
    ],
    "explain": {
      "ru": "Продавец привязан к машине: любая критика вещи читается как критика его самого. Якорь сбивается критерием, а не встречной цифрой.",
      "en": "The seller is attached to the car: criticising the object reads as criticising him. An anchor is defused by a criterion, not by a counter-number."
    }
  }
];
export const MASTER_PASS_MARK = 2;
