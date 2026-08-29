// СГЕНЕРИРОВАНО. Не править руками.
// Источник: services/gateway/app/course/{blocks,bank}.py
// Обновить: cd services/gateway && python tools/sync_course.py
//
// ЗДЕСЬ ТОЛЬКО БЛОКИ И УРОКИ. Их знает домашний экран — ради счётчика
// пройденного и подбора следующего шага. Банк упражнений лежит отдельно
// (course.generated.ts) и на главную не едет: он нужен тому, кто открыл курс.

import type { CourseBlock } from "../lib/courseTypes";

export const COURSE_BLOCKS: CourseBlock[] = [
  {
    "id": "foundations",
    "title": {
      "ru": "Позиции и интересы",
      "en": "Positions & Interests"
    },
    "skill": {
      "ru": "Отличать позицию от интереса и вскрывать второе вопросом, а не догадкой.",
      "en": "Tell a position from an interest, and surface the interest by asking."
    },
    "icon": "🎯",
    "scenario_id": "rent",
    "lessons": [
      {
        "idx": 1,
        "title": {
          "ru": "Позиция — это ещё не человек",
          "en": "A position is not the person"
        },
        "body": {
          "ru": "«75 тысяч, и это окончательно» — позиция. Названное требование, вершина айсберга. Интерес — причина, по которой человек этого требует: страх простоя, желание спокойствия, необходимость отчитаться перед начальством.\n\nПока за столом одни позиции, у спора одна ось — цена, — и кто-то обязан проиграть. Интересов всегда несколько, и почти всегда среди них есть те, что не конфликтуют.",
          "en": "“75k and that is final” is a position: a stated demand, the tip of the iceberg. The interest is the reason behind the demand — fear of vacancy, a wish for quiet, the need to look good to leadership.\n\nWhile the table holds only positions, the argument has one axis — price — and someone has to lose. Interests are plural, and some of them never conflict at all."
        }
      },
      {
        "idx": 2,
        "title": {
          "ru": "Три интереса за одной цифрой",
          "en": "Three interests behind one number"
        },
        "body": {
          "ru": "У каждого оппонента в тренажёре ровно три скрытых интереса. Они не выдуманы для красоты: из них выведены вторичные вопросы, которыми потом можно разменяться.\n\nУ Натальи из сценария «Аренда» цена — не главное. Её три интереса: простой без жильца, аккуратный тихий жилец без хлопот и оплата точно в срок. Ни один из них не про размер платы, и именно поэтому спор о цене с ней бесполезен.",
          "en": "Every counterpart in the trainer holds exactly three hidden interests. They are not decoration: the tradeable secondary issues are derived from them.\n\nFor Natalia in the Rent scenario, the price is not the point. Her three interests: vacancy, a tidy quiet tenant with no hassle, and rent paid exactly on time. Not one of them is about the size of the rent — which is exactly why arguing price with her goes nowhere."
        }
      },
      {
        "idx": 3,
        "title": {
          "ru": "Вопрос-открывашка",
          "en": "The opener question"
        },
        "body": {
          "ru": "Голое «почему?» звучит как допрос и почти ничего не вскрывает: движок засчитает его как открытый вопрос и не добавит информации.\n\nРаботает формулировка «что для вас важнее всего…», «что вас беспокоит…», «что стоит за этой цифрой» — и обязательно с НАЗВАННОЙ темой: «чтобы квартира не пустовала», «чтобы жилец был тихий». Она спрашивает про человека, а не про цифру, и потому получает ответ про интерес: +24 к шкале «Информация». Формулировка без темы вернётся переспросом и даст только 5 — почему, разбирает урок 5.",
          "en": "A bare “why?” sounds like an interrogation and surfaces almost nothing: the engine records an open question and adds no information.\n\nWhat works is “what matters most to you…”, “what concerns you…”, “what sits behind that number” — and always with a NAMED topic: “so the flat is not sitting empty”, “a quiet tenant”. It asks about the person rather than the figure, and so it gets an answer about an interest: +24 on the Information meter. The same wording with no topic comes back as a query and pays only 5 — lesson 5 explains why."
        }
      },
      {
        "idx": 4,
        "title": {
          "ru": "Шкала «Информация»",
          "en": "The Information meter"
        },
        "body": {
          "ru": "Информация растёт только от вопросов, которые действительно метят в скрытый интерес: вскрытие интереса +24, SPIN-последствие +22, ситуация и проблема +14.\n\nЗаявления, встречные цифры и давление не двигают её вовсе. Это не штраф — это напоминание: пока вы говорите, вы не узнаёте ничего нового.",
          "en": "Information grows only from questions that genuinely aim at a hidden interest: an interest probe +24, a SPIN implication +22, situation and problem +14.\n\nStatements, counter-numbers and pressure do not move it at all. That is not a penalty — it is a reminder: while you are talking, you are learning nothing."
        }
      },
      {
        "idx": 5,
        "title": {
          "ru": "Интерес открывается на доверии",
          "en": "An interest opens on trust"
        },
        "body": {
          "ru": "Самое контринтуитивное правило движка: идеальный вопрос на холодном столе не вскрывает ничего. Интерес открывается, только если доверие ВЫШЕ порога — 30 у самого лёгкого стола и по +2 за каждую ступень сложности: 32 у зарплаты, 34 у конфликта, 36 у инвестора. Стартовое доверие 40, поэтому первый же вопрос по теме работает; а вот после грубости (−22) или ультиматума (−14) вы проваливаетесь под порог, и тот же вопрос перестаёт работать.\n\nЧто видно на экране: Информация растёт не на 24, а на 5 — это потолок для вопроса, который ничего не вскрыл. Оппонент не выдаёт следующий секрет по списку, а переспрашивает: «а что именно вас интересует?». Эта реакция называется probe_vague, и её нет на шкале теплоты — это не настроение, а просьба уточнить.\n\nТот же переспрос приходит и по второй причине: вопрос обязан попасть В ТЕМУ ещё не вскрытого интереса. Три одинаковых «А почему для вас это важно?» не вскроют три интереса — не совпало со словами интереса, значит не вскрыли. Лечится одинаково: сначала отражение чувства (доверие +8, напряжение −10) или пара тёплых фраз, потом конкретный вопрос про конкретную вещь.",
          "en": "The engine's most counter-intuitive rule: a perfect question at a cold table opens nothing. An interest opens only when trust is ABOVE the gate — 30 at the easiest table, plus 2 for every step of difficulty: 32 for the salary table, 34 for the conflict, 36 for the investor. You start at 40, so the very first on-topic question works; but after rudeness (−22) or an ultimatum (−14) you drop under the gate and the same question stops working.\n\nWhat you see on screen: Information rises by 5 instead of 24 — that is the ceiling for a question that uncovered nothing. The counterpart does not hand over the next secret on the list; they ask back: “what exactly are you asking about?”. That reaction is called probe_vague, and it is not on the warmth scale — it is not a mood, it is a request to be specific.\n\nThe same query comes back for a second reason: the question has to hit the TOPIC of an interest that is still hidden. Three identical “why does that matter to you?” will not open three interests — no match with the interest's own words means no reveal. The cure is the same either way: name the feeling first (trust +8, tension −10), or a couple of warm lines, and only then ask about one concrete thing."
        }
      }
    ]
  },
  {
    "id": "spin-ladder",
    "title": {
      "ru": "Лестница SPIN",
      "en": "The SPIN Ladder"
    },
    "skill": {
      "ru": "Вести собеседника по S → P → I → N, а не задавать вопросы вразнобой.",
      "en": "Walk your counterpart up S → P → I → N instead of asking questions at random."
    },
    "icon": "🪜",
    "scenario_id": "supplier",
    "lessons": [
      {
        "idx": 1,
        "title": {
          "ru": "Четыре ступени",
          "en": "Four rungs"
        },
        "body": {
          "ru": "S — Situation: как всё устроено сейчас. P — Problem: что мешает. I — Implication: чем это грозит. N — Need-payoff: что даст решение.\n\nПорядок не декоративный. Без фактов не найти боль. Без боли последствия звучат как манипуляция. Без последствий выгода не имеет цены.",
          "en": "S — Situation: how things work today. P — Problem: what gets in the way. I — Implication: what it costs. N — Need-payoff: what solving it is worth.\n\nThe order is not decorative. With no facts you cannot find the pain. With no pain, implications sound like manipulation. With no implications, the payoff is worth nothing."
        }
      },
      {
        "idx": 2,
        "title": {
          "ru": "S и P: факты и боль",
          "en": "S and P: facts and pain"
        },
        "body": {
          "ru": "Ситуационные вопросы дёшевы для собеседника и дороги для вас: их легко задать, но много подряд утомляют. Два-три — и переходите к проблеме.\n\nПроблемный вопрос — первый, где собеседник произносит вслух то, что ему не нравится. С этого момента разговор уже не про вашу цену, а про его положение.",
          "en": "Situation questions are cheap for your counterpart and expensive for you: easy to ask, tiring in a row. Two or three, then move to the problem.\n\nA problem question is the first one where the other side says out loud what they do not like. From that moment the conversation is about their position, not your price."
        }
      },
      {
        "idx": 3,
        "title": {
          "ru": "I — самая дорогая ступень",
          "en": "I — the most valuable rung"
        },
        "body": {
          "ru": "Вопрос о последствиях переводит проблему в цифру потерь: «сколько вы теряете, если линия стоит месяц». Движок оценивает его дороже остальных: +22 против +14.\n\nПричина простая: пока проблема не измерена, она не стоит денег. После I-вопроса ваше предложение сравнивается не с нулём, а с ценой бездействия.",
          "en": "An implication question turns a problem into a number: “what does it cost you when the line sits idle for a month”. The engine prices it above the rest: +22 versus +14.\n\nThe reason is simple: an unmeasured problem is worth no money. After an I-question your proposal is compared not with zero, but with the price of doing nothing."
        }
      },
      {
        "idx": 4,
        "title": {
          "ru": "N — пусть ценность назовёт собеседник",
          "en": "N — let them name the value"
        },
        "body": {
          "ru": "Need-payoff — единственный вопрос, где выгоду формулирует не продавец, а сам собеседник: «насколько важно было бы закрыть загрузку на год вперёд».\n\nТо, что человек сказал сам, он потом не оспаривает. Это и есть вся хитрость четвёртой ступени.",
          "en": "Need-payoff is the one question where the value is spoken by the other side, not by you: “how valuable would it be to lock the year's utilization now”.\n\nWhat people say themselves, they do not argue with later. That is the whole trick of the fourth rung."
        }
      },
      {
        "idx": 5,
        "title": {
          "ru": "Частая ошибка: сразу N",
          "en": "The common error: straight to N"
        },
        "body": {
          "ru": "Формально движок засчитает N-вопрос на первом ходу и даже даст +22. Но собеседник ещё не признал никакой боли, поэтому вопрос читается как заготовка продавца.\n\nЛестница SPIN — про порядок, а не про набор. Пропущенная ступень не ускоряет разговор, она делает следующий вопрос неуместным.",
          "en": "Formally the engine will score an N-question on turn one and even grant +22. But the other side has admitted no pain yet, so the question reads as a sales script.\n\nThe SPIN ladder is about sequence, not about a checklist. A skipped rung does not speed the conversation up — it makes the next question land wrong."
        }
      }
    ]
  },
  {
    "id": "active-listening",
    "title": {
      "ru": "Слушание и деэскалация",
      "en": "Listening & De-escalation"
    },
    "skill": {
      "ru": "Снимать напряжение отражением и отделять человека от проблемы.",
      "en": "Take tension down by reflecting, and separate the people from the problem."
    },
    "icon": "🤝",
    "scenario_id": "conflict",
    "lessons": [
      {
        "idx": 1,
        "title": {
          "ru": "Назвать чувство, не соглашаясь",
          "en": "Name the feeling without agreeing"
        },
        "body": {
          "ru": "«Я вижу, что на вас давит руководство» — это не признание вины. Вы называете то, что и так очевидно обоим, и человек перестаёт доказывать, что ему тяжело.\n\nДвижок за такой ход даёт доверие +8 и напряжение −10. Это самый дешёвый способ вернуть разговор в рабочее русло: он ничего вам не стоит.",
          "en": "“I can see leadership is pressing you” is not an admission of fault. You name what is already obvious to both, and the other side stops proving that it is hard.\n\nThe engine grants trust +8 and tension −10 for that move. It is the cheapest way back to a working conversation: it costs you nothing."
        }
      },
      {
        "idx": 2,
        "title": {
          "ru": "Отражение смысла",
          "en": "Reflecting the meaning"
        },
        "body": {
          "ru": "«Правильно ли я понял, что для вас критичны не сроки, а то, как это подадут наверх?» — вы возвращаете человеку его же мысль, очищенную от эмоции.\n\nДва эффекта сразу: он слышит себя со стороны и поправляет вас, если вы ошиблись. Ошибка здесь ценнее правоты — она вскрывает настоящий интерес.",
          "en": "“So if I understand it right, what matters is not the dates but how this is framed upwards?” — you hand back their own thought with the emotion stripped out.\n\nTwo effects at once: they hear themselves from outside, and they correct you if you got it wrong. Being wrong here is worth more than being right — it surfaces the real interest."
        }
      },
      {
        "idx": 3,
        "title": {
          "ru": "Лестница реакций",
          "en": "The reaction ladder"
        },
        "body": {
          "ru": "Оппонент всегда находится в одном из десяти состояний: встаёт из-за стола · принимает на свой счёт · закрывается · под давлением · пока не соглашается · держит нейтралитет · идёт навстречу · принимает довод · приоткрывается · теплеет. Теми же словами они подписаны в игре и в заданиях — чтобы урок и стол говорили на одном языке.\n\nЧитать это состояние — отдельный навык. Одна и та же ваша реплика на «теплеет» и на «принимает на свой счёт» даёт разный результат, потому что уступки режутся напряжением.",
          "en": "Your counterpart is always in one of ten states: walked out · offended · hardened · pressured · not yet · neutral · collaborated · persuaded · opened up · warmed. The same words label the states at the table and in the exercises, so the lesson and the game speak one language.\n\nReading that state is a skill of its own. The same line of yours lands differently on “warmed” and on “offended”, because tension cuts concessions."
        }
      },
      {
        "idx": 4,
        "title": {
          "ru": "Что взрывает стол",
          "en": "What blows the table up"
        },
        "body": {
          "ru": "Грубость: доверие −22, напряжение +26. Ультиматум: доверие −14, напряжение +22. Дословный повтор своей же реплики: качество аргумента падает до 12.\n\nИ главная ловушка: при напряжении выше 55 уступки режутся на 40%, выше 75 — на 75%. Давление даёт вам рычаг и одновременно замораживает возможность им воспользоваться.",
          "en": "Rudeness: trust −22, tension +26. An ultimatum: trust −14, tension +22. A verbatim repeat of your own line: argument quality drops to 12.\n\nAnd the main trap: above 55 tension concessions are cut by 40%, above 75 by 75%. Pressure hands you leverage and freezes your ability to use it in the same move."
        }
      }
    ]
  },
  {
    "id": "objective-criteria",
    "title": {
      "ru": "Объективные критерии",
      "en": "Objective Criteria"
    },
    "skill": {
      "ru": "Заменять «я так считаю» внешним стандартом, который трудно оспорить.",
      "en": "Replace “because I say so” with an external standard that is hard to dispute."
    },
    "icon": "📊",
    "scenario_id": "salary",
    "lessons": [
      {
        "idx": 1,
        "title": {
          "ru": "Столкновение мнений против столкновения критериев",
          "en": "Clash of opinions vs clash of criteria"
        },
        "body": {
          "ru": "Спор двух мнений выигрывает тот, кто упрямее. Спор двух критериев выигрывает тот, чей критерий уместнее, — и проигравшему не приходится капитулировать.\n\nЭто четвёртый принцип Гарвардского метода и единственный способ уступить, не потеряв лицо: вы уступаете не человеку, а стандарту.",
          "en": "A clash of opinions is won by whoever is more stubborn. A clash of criteria is won by whoever's standard fits better — and the loser never has to capitulate.\n\nThis is the fourth Harvard principle, and the only way to concede without losing face: you are yielding to a standard, not to a person."
        }
      },
      {
        "idx": 2,
        "title": {
          "ru": "Что считается критерием",
          "en": "What counts as a criterion"
        },
        "body": {
          "ru": "Критерий — внешний, проверяемый источник с цифрой: обзор зарплат, рыночная медиана, прайс сопоставимых объявлений, отраслевой регламент.\n\n«Я стою больше», «это несправедливо», «у всех знакомых выше» — не критерии. Движок читает их как обычное заявление: качество аргумента 20, рычаг +0. А судья обязан поставить ≥55 везде, где есть конкретное число или источник, — и читает как спам (0–20) те же слова без цифр.",
          "en": "A criterion is an external, checkable source with a number: a salary survey, a market median, comparable listings, an industry regulation.\n\n“I am worth more”, “this is unfair”, “everyone I know earns more” are not criteria. The engine reads them as plain statements: argument quality 20, leverage +0. And the judge must score ≥55 wherever a concrete number or source is present — while reading the same words with no figures as spam (0–20)."
        }
      },
      {
        "idx": 3,
        "title": {
          "ru": "Критерий как броня для уступки",
          "en": "A criterion as armour for a concession"
        },
        "body": {
          "ru": "Если вы двигаетесь без объяснения, оппонент читает это как «можно давить ещё». Если вы двигаетесь к цифре из внешнего источника, это выглядит как переход к точности.\n\nПоэтому критерий полезен обеим сторонам: он даёт им повод согласиться, не признавая поражения.",
          "en": "Move without an explanation and the other side reads it as “push harder”. Move to a number from an outside source and it reads as getting more precise.\n\nThat is why a criterion helps both sides: it gives them a reason to agree without admitting defeat."
        }
      },
      {
        "idx": 4,
        "title": {
          "ru": "Шкала «Рычаг»",
          "en": "The Leverage meter"
        },
        "body": {
          "ru": "Критерий даёт рычаг +16, а с аналитическим собеседником ещё +6 сверху. Альтернатива без подкрепления — всего +10 и напряжение +14; та же альтернатива с критерием — +18 и напряжение всего +4.\n\nРычаг — не про громкость. Это про то, насколько тяжело вам возразить.",
          "en": "A criterion grants leverage +16, and another +6 with an analytical counterpart. An unbacked alternative gives only +10 and tension +14; the same alternative backed by a criterion gives +18 and tension of just +4.\n\nLeverage is not about volume. It is about how hard you are to argue with."
        }
      }
    ]
  },
  {
    "id": "batna-zopa",
    "title": {
      "ru": "BATNA и ZOPA",
      "en": "BATNA & ZOPA"
    },
    "skill": {
      "ru": "Считать зону сделки и опираться на альтернативу как на спокойствие, а не как на дубину.",
      "en": "Compute the deal zone and lean on your alternative as calm, not as a club."
    },
    "icon": "🛡",
    "scenario_id": "investor",
    "lessons": [
      {
        "idx": 1,
        "title": {
          "ru": "ZOPA: где она есть",
          "en": "ZOPA: where it exists"
        },
        "body": {
          "ru": "Зона возможного соглашения — отрезок между вашей красной линией и красной линией оппонента. Всё, о чём вы торгуетесь, — это распределение внутри отрезка.\n\nЕсли отрезка нет, сделки нет ни при каком мастерстве. Умение вовремя это увидеть экономит больше, чем любая техника давления.",
          "en": "The zone of possible agreement is the segment between your red line and theirs. Everything you haggle over is the split inside that segment.\n\nIf there is no segment, there is no deal at any level of skill. Seeing that early saves more than any pressure technique."
        }
      },
      {
        "idx": 2,
        "title": {
          "ru": "BATNA ≠ красная линия",
          "en": "BATNA is not the red line"
        },
        "body": {
          "ru": "Красная линия = ценность альтернативы ± стоимость переключения. У поставщика альтернатива 95, но с риском качества — красная линия строже, 92. В аренде альтернатива 68, но плюс сорок минут дороги — красная линия мягче, 70.\n\nЭто одна формула, а не разнобой авторов. Проверьте её на любом сценарии тренажёра.",
          "en": "Red line = the value of your alternative ± the cost of switching. With the supplier the alternative is 95 but carries quality risk — the red line is stricter, 92. In the rent case the alternative is 68 but adds forty minutes of commute — the red line is looser, 70.\n\nOne formula, not authorial whim. Check it against any scenario in the trainer."
        }
      },
      {
        "idx": 3,
        "title": {
          "ru": "Назвать альтернативу, не пригрозив",
          "en": "Name the alternative without threatening"
        },
        "body": {
          "ru": "«У меня есть предложение на 210, но ваш проект мне интереснее — давайте искать решение здесь» — это факт плюс намерение договориться.\n\n«Или 230, или я ухожу» — тот же факт, превращённый в ультиматум. Разница в движке: первое даёт рычаг +18 при напряжении +4, второе — доверие −14 и напряжение +22.",
          "en": "“I have an offer at 210, but your project interests me more — let us find a solution here” is a fact plus an intention to agree.\n\n“Either 230 or I walk” is the same fact turned into an ultimatum. In the engine: the first gives leverage +18 at tension +4, the second gives trust −14 and tension +22."
        }
      },
      {
        "idx": 4,
        "title": {
          "ru": "Цена жёсткой BATNA",
          "en": "The price of a hard BATNA"
        },
        "body": {
          "ru": "Альтернатива, поданная как угроза, делает любое движение оппонента капитуляцией. Человеку, который отчитывается перед кем-то, капитулировать нельзя.\n\nС собеседником, для которого важны отношения, штраф ещё выше: +6 к напряжению сверху. Сила, которую нельзя применить, — не сила.",
          "en": "An alternative delivered as a threat turns any movement by the other side into a surrender. Someone who reports to a boss cannot afford to surrender.\n\nWith a relationship-driven counterpart the penalty is higher still: +6 tension on top. Power you cannot use is not power."
        }
      }
    ]
  },
  {
    "id": "anchoring",
    "title": {
      "ru": "Якорь и защита от него",
      "en": "Anchoring & Counter-anchoring"
    },
    "skill": {
      "ru": "Ставить обоснованный первый номер и не давать чужому якорю задать рамку.",
      "en": "Set a grounded first number, and refuse to let their anchor set the frame."
    },
    "icon": "⚓",
    "scenario_id": "used_car",
    "lessons": [
      {
        "idx": 1,
        "title": {
          "ru": "Эффект якоря",
          "en": "The anchoring effect"
        },
        "body": {
          "ru": "Первый названный номер тянет исход к себе, даже когда обе стороны знают, что он завышен. Продавец машины открывается на 1200 при настоящем дне 1040: сто шестьдесят тысяч — это не цена, это переговорный воздух.\n\nПоэтому чужой первый номер нельзя брать за точку отсчёта. Он выбран так, чтобы утянуть ваши ожидания.",
          "en": "The first number named drags the outcome toward itself, even when both sides know it is inflated. The car seller opens at 1200 with a real floor of 1040: a hundred and sixty thousand of negotiating air, not price.\n\nThat is why their first number must never become your reference point. It was picked to drag your expectations."
        }
      },
      {
        "idx": 2,
        "title": {
          "ru": "Ставить якорь: только с критерием",
          "en": "Anchor only with a criterion"
        },
        "body": {
          "ru": "Голая цифра — это заявка на упрямство, и она приглашает такую же в ответ. Цифра, выведенная из внешнего источника, делает вашу систему координат общей.\n\nВ движке разница видна: голый контр-якорь даёт качество аргумента 26, тот же якорь с критерием — реакцию «принимает довод» и рычаг +16.\n\nИ у первого слова есть цена. Оппонент за столом здоровается, но своей цифры не называет — он предлагает начать вам. Обоснованный якорь, поставленный ДО его числа, двигает не только текущую цену, но и саму рамку: у Сергея это 1200 → 1170 ещё до всякой уступки, и весь дальнейший торг считается уже от 1170. Голая цифра рамку не двигает — двигает цифра, стоящая на критерии.\n\nСдвиг ограничен пятой частью размаха, и это осознанно: «мы предлагаем 700» тянет рамку ровно настолько же, насколько обоснованные 1080. Наглость не выигрывает у обоснованности, а первое слово тратится один раз за партию.",
          "en": "A bare number is a bid for stubbornness, and it invites the same in return. A number derived from an outside source makes your frame the shared one.\n\nThe engine shows the gap: a bare counter-anchor scores argument quality 26; the same anchor with a criterion yields “persuaded by data” and leverage +16.\n\nAnd the first word costs them something. Your counterpart opens with a greeting but no figure — they invite you to start. A grounded anchor placed BEFORE their number moves not just the current price but the frame itself: with Sergey that is 1200 → 1170 before any concession, and every later move is counted from 1170. A bare number does not move the frame; a number standing on a criterion does.\n\nThe shift is capped at a fifth of the range, deliberately: “we propose 700” drags the frame exactly as far as a grounded 1080 does. Nerve does not beat grounding, and the first word is spent once per game."
        }
      },
      {
        "idx": 3,
        "title": {
          "ru": "Защита: не контр-цифра",
          "en": "Defence is not a counter-number"
        },
        "body": {
          "ru": "Ответить своей крайней цифрой — значит согласиться играть в перетягивание каната, где выигрывает не правый, а упорный.\n\nРаботает другое: назвать якорь якорем, спросить, что за ним стоит, предложить внешний критерий — и только потом поставить свою цифру ВНУТРИ этого критерия.",
          "en": "Answering with your own extreme number means agreeing to a tug of war, where the winner is the stubborn one, not the right one.\n\nWhat works: name the anchor as an anchor, ask what sits behind it, offer an external criterion — and only then put your number INSIDE that criterion."
        }
      },
      {
        "idx": 4,
        "title": {
          "ru": "Цена оскорбительного контр-якоря",
          "en": "The price of an insulting counter-anchor"
        },
        "body": {
          "ru": "«Да она столько не стоит, это смешно» — доверие −22, напряжение +26. Продавец привязан к машине: критика вещи читается как критика его самого.\n\nДальше мстит механика: при напряжении выше 55 уступки режутся на 40%. Вы закрываете ровно ту дверь, ради которой ставили якорь.",
          "en": "“It is not worth that, this is a joke” — trust −22, tension +26. The seller is attached to the car: criticising the object reads as criticising him.\n\nThen the mechanics take revenge: above 55 tension concessions are cut by 40%. You shut the very door the anchor was meant to open."
        }
      }
    ]
  },
  {
    "id": "logrolling",
    "title": {
      "ru": "Размен и создание ценности",
      "en": "Logrolling & Value Creation"
    },
    "skill": {
      "ru": "Находить, что дёшево для вас и дорого для них, и связывать вопросы в пакет.",
      "en": "Find what is cheap for you and dear to them, and bundle issues into a package."
    },
    "icon": "🔄",
    "scenario_id": "supplier",
    "lessons": [
      {
        "idx": 1,
        "title": {
          "ru": "Одна ось — торг, две — сделка",
          "en": "One axis is haggling, two is a deal"
        },
        "body": {
          "ru": "Пока обсуждается только цена, выигрыш одного равен проигрышу другого. Стоит добавить второй вопрос — срок, объём, график платежей — и появляются варианты, где выигрывают оба.\n\nВторичные вопросы в тренажёре не декоративны: у каждого есть ценность для оппонента и стоимость для вас, и обе цифры настоящие.",
          "en": "While only price is on the table, one side's gain is the other's loss. Add a second issue — term, volume, payment schedule — and options appear where both sides win.\n\nThe secondary issues in the trainer are not decoration: each carries a value to the counterpart and a cost to you, and both numbers are real."
        }
      },
      {
        "idx": 2,
        "title": {
          "ru": "Матрица «дёшево мне / дорого им»",
          "en": "The cheap-to-me / dear-to-them matrix"
        },
        "body": {
          "ru": "Годовой контракт стоит вам 0.2, а для поставщика он стоит 0.85 — идеальная фишка. Предоплата 30% обходится вам в 0.45, а ценится всего в 0.55 — посредственная.\n\nПорядок размена именно такой: сперва то, где разрыв больше. Отдать сначала дорогое для себя — значит потратить всю доброжелательность на полдороге.",
          "en": "An annual commitment costs you 0.2 and is worth 0.85 to the supplier — a perfect chip. A 30% prepayment costs you 0.45 and is worth 0.55 — a mediocre one.\n\nTrade in that order: the widest gap first. Giving away what is expensive to you first spends all the goodwill halfway."
        }
      },
      {
        "idx": 3,
        "title": {
          "ru": "Формула пакета",
          "en": "The package formula"
        },
        "body": {
          "ru": "Вклад размена в шкалу «Приёмы» движок считает как 10·ценность_для_них − 6·стоимость_для_вас за каждый вопрос, с потолком +16 на всю партию.\n\nПотолок стоит там намеренно: даже идеальный пакет не заменяет вопросы, критерии и слушание. Размен — часть техники, а не её обход.",
          "en": "The engine scores a trade's contribution to Technique as 10·value_to_them − 6·cost_to_you per issue, capped at +16 for the whole session.\n\nThe cap is deliberate: even a perfect package does not replace questions, criteria and listening. Logrolling is part of the technique, not a way around it."
        }
      },
      {
        "idx": 4,
        "title": {
          "ru": "Связывать, а не раздавать",
          "en": "Link it, do not give it away"
        },
        "body": {
          "ru": "«Если мы дадим годовой контракт, сможете ли вы подвинуться до 88?» — размен: доверие +6, напряжение −4, и цена двигается сильнее всего в игре.\n\n«Хорошо, давайте годовой контракт» без связки — уступка. Движок засчитает её как уступку и ничего не даст: вы отдали фишку, не купив на неё ничего.",
          "en": "“If we commit for a year, can you move to 88?” is a trade: trust +6, tension −4, and the price moves more than from anything else in the game.\n\n“Fine, let us do the annual contract” with no link is a concession. The engine scores it as one and grants nothing: you spent the chip and bought nothing with it."
        }
      }
    ]
  },
  {
    "id": "pressure-defense",
    "title": {
      "ru": "Давление и возражения",
      "en": "Pressure & Objections"
    },
    "skill": {
      "ru": "Не отвечать на ультиматум ультиматумом и переводить атаку обратно в критерии.",
      "en": "Never answer an ultimatum with an ultimatum; redirect the attack into criteria."
    },
    "icon": "🧱",
    "scenario_id": "sla_renewal",
    "lessons": [
      {
        "idx": 1,
        "title": {
          "ru": "Три ответа на ультиматум",
          "en": "Three answers to an ultimatum"
        },
        "body": {
          "ru": "Назвать: «я слышу, что это ваше последнее слово». Проигнорировать: продолжить разговор так, будто ультиматума не было. Вернуть к критерию: «давайте вернёмся к цифрам».\n\nЧетвёртого ответа — своего ультиматума — не существует. Он не добавляет вам силы, он лишает обе стороны пространства для движения.",
          "en": "Name it: “I hear that this is your final word.” Ignore it: keep the conversation going as if it had not happened. Return to the criterion: “let us go back to the numbers.”\n\nThere is no fourth answer — your own ultimatum is not one. It adds no strength; it removes both sides' room to move."
        }
      },
      {
        "idx": 2,
        "title": {
          "ru": "Возражение как скрытый интерес",
          "en": "An objection is a hidden interest"
        },
        "body": {
          "ru": "«99.9% невозможно» — это упаковка. Внутри почти всегда страх: штрафы, которые не вытянет команда эксплуатации.\n\nВопрос «что именно делает 99.9% невозможным» превращает стену в информацию. Возражение — единственный подарок, который оппонент делает добровольно.",
          "en": "“99.9% is impossible” is packaging. A fear usually sits inside: penalties the ops team cannot sustain.\n\nThe question “what exactly makes 99.9% impossible” turns a wall into information. An objection is the one gift the other side hands you voluntarily."
        }
      },
      {
        "idx": 3,
        "title": {
          "ru": "Термостат напряжения",
          "en": "The tension thermostat"
        },
        "body": {
          "ru": "Напряжение выше 55 режет уступки на 40%, выше 75 — на 75%. Уступка 0.40 при напряжении 80 превращается в 0.10.\n\nОтсюда практический вывод: перед тем как просить движения, потратьте ход на снижение напряжения. Он окупится больше, чем ещё один аргумент.",
          "en": "Tension above 55 cuts concessions by 40%, above 75 by 75%. A 0.40 concession at tension 80 becomes 0.10.\n\nThe practical consequence: before asking for movement, spend a turn lowering tension. It pays back more than one more argument would."
        }
      },
      {
        "idx": 4,
        "title": {
          "ru": "Анти-гейминг",
          "en": "Anti-gaming"
        },
        "body": {
          "ru": "Повтор той же реплики опускает качество аргумента до 12 и режет уступку до 15%. Настойчивость не равна аргументу — движок различает их специально.\n\nЕсли вас не услышали, меняйте не громкость, а тип хода: вопрос вместо заявления, критерий вместо цифры, размен вместо просьбы.",
          "en": "Repeating the same line drops argument quality to 12 and cuts the concession to 15%. Persistence is not argument — the engine tells them apart on purpose.\n\nIf you were not heard, change the kind of move, not the volume: a question instead of a statement, a criterion instead of a number, a trade instead of a request."
        }
      }
    ]
  },
  {
    "id": "closing",
    "title": {
      "ru": "Закрытие и фиксация",
      "en": "Closing & Commitment"
    },
    "skill": {
      "ru": "Понимать, когда закрывать, чем закрывать и на чём сделка фиксируется.",
      "en": "Know when to close, what to close with, and where the deal actually settles."
    },
    "icon": "🏁",
    "scenario_id": "supplier",
    "lessons": [
      {
        "idx": 1,
        "title": {
          "ru": "Точка встречи",
          "en": "The meeting point"
        },
        "body": {
          "ru": "Сделка закрывается не на последней цифре оппонента, а в точке\nих цифра + (ваша цифра − их цифра) · (0.3 + 0.45 · гибкость).\n\nГибкость собрана из доверия, информации и рычага — из всего, что вы делали предыдущие десять ходов. Именно здесь эта работа превращается в деньги.",
          "en": "The deal does not settle at their last number, but at offer_opp + (offer_player − offer_opp) · (0.3 + 0.45 · flexibility).\n\nFlexibility is built from trust, information and leverage — from everything you did over the previous ten turns. This is where that work turns into money."
        }
      },
      {
        "idx": 2,
        "title": {
          "ru": "Пол оппонента непробиваем",
          "en": "Their floor does not move"
        },
        "body": {
          "ru": "Ниже своей красной линии оппонент не пойдёт ни при каком доверии и ни при каком давлении. Предложение ниже пола даёт реакцию «пока нет», а не сделку.\n\nЭто первый инвариант тренажёра. Он же — главная причина, почему давление в переговорах переоценено: за полом ничего нет.",
          "en": "Below their red line the other side will not go, at any level of trust or pressure. An offer under the floor yields “not yet”, not a deal.\n\nThat is the trainer's first invariant. It is also the main reason pressure is overrated: there is nothing behind the floor."
        }
      },
      {
        "idx": 3,
        "title": {
          "ru": "Закрывать с цифрой",
          "en": "Close with a number"
        },
        "body": {
          "ru": "Закрытие без числа движок фиксирует на ЕЁ последнем номере — вы дарите весь остаток зоны просто потому, что не назвали цифру в закрывающей реплике.\n\nПравильное закрытие короткое и полное: число, условие пакета, вопрос-подтверждение. «Фиксируем: 88 при годовом контракте. По рукам?»",
          "en": "A close with no number settles at THEIR last figure — you hand over the rest of the zone simply for not naming one in the closing line.\n\nA good close is short and complete: the number, the package term, a confirming question. “Locking it in: 88 with the annual commitment. Deal?”"
        }
      },
      {
        "idx": 4,
        "title": {
          "ru": "Счёт и потолок «C»",
          "en": "The score and the C ceiling"
        },
        "body": {
          "ru": "Итог = 0.4·экономика + 0.25·отношения + 0.35·приёмы. Экономика считается не как «сколько получил», а как доля пути от красной линии до цели.\n\nИ главное: при технике ниже 45 грейд не поднимается выше C, какой бы ни была цена. Отличная сделка, купленная без метода, не воспроизводима — а тренажёр учит методу.",
          "en": "Overall = 0.4·economics + 0.25·relationship + 0.35·technique. Economics is not “how much you got” but the share of the distance from your red line to your target.\n\nAnd crucially: with technique below 45 the grade never rises above C, whatever the price. A great deal bought without method does not repeat — and method is what the trainer teaches."
        }
      }
    ]
  },
  {
    "id": "styles",
    "title": {
      "ru": "Стиль собеседника",
      "en": "Their Style"
    },
    "skill": {
      "ru": "Узнавать стиль оппонента и платить за приём ту цену, которую он стоит именно с ним.",
      "en": "Read the counterpart's style and pay the price each technique actually costs with them."
    },
    "icon": "🎭",
    "scenario_id": "candidate_offer",
    "lessons": [
      {
        "idx": 1,
        "title": {
          "ru": "Три стиля за столом",
          "en": "Three styles at the table"
        },
        "body": {
          "ru": "У каждого оппонента в игре ровно один из трёх стилей, и он не меняется по ходу партии. Аналитик (Дмитрий, Марина, Павел) верит цифрам и источникам. «Отношенец» (Ирина, Наталья, Тимур) держится за отношения и читает нажим как разрыв. Жёсткий (Алексей, Сергей, Виктор) уважает силу и не прощает ультиматума.\n\nСтиль — не косметика: он меняет и слова ответа, и ЦЕНУ ваших приёмов в шкалах. Опознаётся с первой реплики: аналитик просит обоснование, «отношенец» говорит про людей и доверие, жёсткий сразу ставит рамку.",
          "en": "Every counterpart in the game has exactly one of three styles, and it never changes mid-game. The analytical one (Dmitry, Marina, Pavel) trusts numbers and sources. The relationship one (Irina, Natalia, Timur) holds on to the relationship and reads pressure as a breach. The tough one (Alexey, Sergey, Viktor) respects strength and never forgives an ultimatum.\n\nStyle is not decoration: it changes both the wording of their replies and the PRICE your techniques pay on the meters. You can spot it from their first line: the analytical asks for grounding, the relationship one talks about people and trust, the tough one sets a frame straight away."
        }
      },
      {
        "idx": 2,
        "title": {
          "ru": "Что стиль удорожает и что удешевляет",
          "en": "What a style makes cheap, and what it makes expensive"
        },
        "body": {
          "ru": "Три надбавки, и все три — настоящие числа движка.\n\nАналитику объективный критерий даёт рычаг не +16, а +22: те же данные с ним стоят дороже. «Отношенцу» названная альтернатива добавляет напряжение +6 сверх обычного: обоснованная BATNA поднимает напряжение не на 4, а на 10, необоснованная — не на 14, а на 20. Жёсткому ультиматум добавляет +8: не 22 напряжения, а 30 — и всё это сверх минус 14 доверия и отката цены на второй угрозе.\n\nЗаметьте, чего в списке нет: скидки за стиль. Стиль делает приём дороже там, где он не к месту, и не делает дешевле там, где он к месту.",
          "en": "Three modifiers, and all three are real engine numbers.\n\nWith the analytical counterpart an objective criterion gives leverage +22 rather than +16: the same data is worth more to them. With the relationship one, naming your alternative adds +6 tension on top: a grounded BATNA raises tension by 10 instead of 4, an ungrounded one by 20 instead of 14. With the tough one an ultimatum adds +8: 30 tension instead of 22 — on top of the usual −14 trust and the price rollback on a second threat.\n\nNotice what is not on the list: a discount. A style makes a technique more expensive where it does not belong; it never makes one cheaper where it does."
        }
      },
      {
        "idx": 3,
        "title": {
          "ru": "Подстройка — это порядок, а не маска",
          "en": "Adapting is about order, not about masks"
        },
        "body": {
          "ru": "Подстройка не значит «стать другим человеком». Меняется порядок ходов.\n\nС аналитиком критерий идёт РАНЬШЕ размена: сначала данные, потом пакет. С «отношенцем» альтернативу лучше не называть вовсе, пока не собран пакет: она стоит на +6 напряжения дороже, а на тёплом столе цена и так поедет от размена. С жёстким ультиматум не работает никогда — работает встречный объективный критерий и спокойное «пока нет».\n\nПроверить себя просто: если приём поднимает напряжение выше 55, движок режет уступку до 60 %, а выше 75 — до 25 %. Стиль — самый быстрый способ туда попасть, не заметив этого.",
          "en": "Adapting does not mean becoming someone else. What changes is the order of moves.\n\nWith the analytical one the criterion comes BEFORE the trade: data first, package second. With the relationship one, better not to name your alternative at all until the package is built: it costs 6 more tension, and at a warm table the price moves from the trade anyway. With the tough one an ultimatum never works — a counter criterion and a calm “not yet” do.\n\nThe self-check is simple: once a technique pushes tension above 55 the engine cuts any concession to 60 %, and above 75 to 25 %. Style is the fastest way to get there without noticing."
        }
      },
      {
        "idx": 4,
        "title": {
          "ru": "Когда сила у вас",
          "en": "When the power is yours"
        },
        "body": {
          "ru": "Стол этого блока — «Оффер сильному кандидату», и он единственный, где сила у ИГРОКА. У Тимура нет второго оффера, его дно 210, а ваша цель — 230. Выжать ниже можно.\n\nИ за это не начисляют ничего. Экономика считается как доля пути от красной линии (260) до цели (230) и на 230 уже равна 100 — ниже потолка нет. Зато отношения — это четверть итогового балла, а Тимур «отношенец»: названная альтернатива стоит с ним на +6 напряжения дороже обычного. Выжатый на подписи человек уходит в первый год, и позицию открывают заново — в брифинге это сказано прямо.\n\nПравило блока в одну строку: сила нужна, чтобы НЕ торговаться, а спросить, ради чего он идёт, и заплатить тем, что стоит вам дёшево. Трек до архитектора стоит компании подписи под планом развития, а для него это причина всего перехода.",
          "en": "This block's table is “Making the Offer”, and it is the only one where the PLAYER holds the power. Timur has no rival offer, his floor is 210, and your target is 230. Squeezing him lower is possible.\n\nAnd it earns you nothing. Economics is the share of the distance from your red line (260) to your target (230), and at 230 it is already 100 — there is no ceiling above. Relationship, meanwhile, is a quarter of the final score, and Timur is a relationship type: naming an alternative costs +6 tension more with him. A hire squeezed at signing leaves within the year and you reopen the role — the briefing says so outright.\n\nThe block's rule in one line: power is there so that you do NOT haggle — you ask what he is coming for and pay with what is cheap for you. An architect track costs the company a signature under a development plan; for him it is the whole reason he came."
        }
      }
    ]
  },
  {
    "id": "preparation",
    "title": {
      "ru": "Подготовка к столу",
      "en": "Preparing for the Table"
    },
    "skill": {
      "ru": "Приходить с целью, красной линией, альтернативой и готовым разменом — а не искать их в разговоре.",
      "en": "Arrive with a target, a red line, an alternative and a ready trade — instead of hunting for them mid-conversation."
    },
    "icon": "📋",
    "scenario_id": "salary",
    "lessons": [
      {
        "idx": 1,
        "title": {
          "ru": "Лист подготовки: четыре строки",
          "en": "The prep sheet: four lines"
        },
        "body": {
          "ru": "Подготовка — это не «настроиться». Это четыре строки, написанные до того, как вы сели: цель, красная линия, ваша альтернатива и темы, в которых лежат чужие интересы. У стола этого блока все четыре уже есть: цель 230k, красная линия 195k, второй оффер на 210k и три темы на чипах.\n\nКрасная линия — не «ещё приемлемо». Это НОЛЬ. Экономика партии считается как доля пути от красной линии до цели: (сделка − 195) / (230 − 195) × 100. Сделка ровно на красной линии даёт 0 очков экономики, на цели — 100, и между ними лежат 35 тысяч, внутри которых идёт весь разговор: каждая тысяча стоит около трёх очков.\n\nОтсюда правило, которое нарушают чаще прочих: красная линия назначается ДО стола и за столом не двигается. Если её можно подвинуть в разговоре — это была не красная линия, а настроение.",
          "en": "Preparation is not “getting in the right frame of mind”. It is four lines written before you sit down: your target, your red line, your alternative, and the topics the other side's interests sit in. At this block's table all four are already given: target 230k, red line 195k, a second offer at 210k, and three topics on the chips.\n\nA red line is not “still acceptable”. It is ZERO. The economic score is the share of the distance from your red line to your target: (deal − 195) / (230 − 195) × 100. A deal exactly on the red line scores 0 on economics, one on target scores 100, and between them lie 35 thousand inside which the whole conversation happens: each thousand is worth about three points.\n\nHence the rule broken more often than any other: a red line is set BEFORE the table and does not move at it. If it can be moved mid-conversation, it was never a red line — it was a mood."
        }
      },
      {
        "idx": 2,
        "title": {
          "ru": "BATNA работает до стола",
          "en": "Your BATNA works before the table"
        },
        "body": {
          "ru": "У альтернативы есть сила — число от 0 до 100, и вслух оно не произносится. Оно превращается в стартовый рычаг: 0.4 × сила. Здесь сила 60, и партия начинается с рычагом 24 — до вашей первой реплики.\n\nЗа столом альтернатива стоит одинаково на любом столе. Названная без опоры — рычаг +10 и напряжение +14. С опорой, то есть вместе с объективным критерием или доводом качеством выше 55, — рычаг +18 и напряжение всего +4, и это её собственные числа: критерий добавляет свои +16 сверху, а с аналитиком +22. Сила альтернативы ни одного из них не меняет — она уже отработала, до разговора.\n\nПрактический вывод: усиливают BATNA заранее — вторым оффером, вторым поставщиком, запасным планом, — а за столом её достаточно один раз НАЗВАТЬ, и лучше сразу с опорой. Реакция на неё всегда одна и та же — «под давлением», даже если вы были предельно вежливы.",
          "en": "An alternative has a strength — a number from 0 to 100 that is never said out loud. It turns into your starting leverage: 0.4 × strength. Here the strength is 60, so the round opens with 24 points of leverage, before your first line.\n\nAt the table an alternative costs the same everywhere. Named with nothing behind it: leverage +10 and tension +14. Named with backing — an objective criterion, or an argument scoring above 55 — leverage +18 and tension only +4, and those are the alternative's own numbers: the criterion adds its own +16 on top, +22 with an analytical counterpart. The strength of the alternative changes none of them — it has already done its work, before the conversation.\n\nThe practical consequence: you strengthen a BATNA in advance — a second offer, a second supplier, a fallback plan — and at the table you only need to NAME it once, preferably with backing. The reaction is always the same, “pressured”, however politely you put it."
        }
      },
      {
        "idx": 3,
        "title": {
          "ru": "Гипотезы пишутся до стола",
          "en": "Hypotheses are written beforehand"
        },
        "body": {
          "ru": "Интересы скрыты, а ТЕМЫ — нет. Три темы этого стола видны ещё до первой реплики: «Бюджет отдела», «Сроки найма», «Согласование с финансами». Тема не выдаёт секрет, но говорит, где копать.\n\nПодготовка — по одной письменной гипотезе на тему: «бюджет отдела — вероятно, вилку уже согласовали, и перерасход придётся объяснять»; «сроки найма — вероятно, позиция горит». Гипотеза не диагноз: за столом она проверяется вопросом и либо подтверждается, либо заменяется.\n\nПочему это надо написать заранее: вопрос вскрывает интерес, только если попал в слова ТЕМЫ. Попал — Информация +24 и «приоткрывается». Не попал — переспрос и +5. Придумывать формулировку в живом разговоре, когда напротив сидит человек, — самый дорогой способ получить эти пять очков.",
          "en": "Interests are hidden; TOPICS are not. This table's three topics are visible before the first line: “Team budget”, “Hiring timeline”, “Finance approval”. A topic gives away no secret, but it tells you where to dig.\n\nPreparation means one written hypothesis per topic: “team budget — the band has probably been signed off already, and an overrun will have to be explained”; “hiring timeline — the role is probably urgent”. A hypothesis is not a diagnosis: at the table you test it with a question, and it is either confirmed or replaced.\n\nWhy write them down in advance: a question uncovers an interest only when it lands on the words of a TOPIC. Landing pays Information +24 and “opened up”. Missing gets you a query back and +5. Composing the wording live, with a person sitting across from you, is the most expensive way to earn those five points."
        }
      },
      {
        "idx": 4,
        "title": {
          "ru": "Кто называет цифру первым",
          "en": "Who names a number first"
        },
        "body": {
          "ru": "Оппонент здоровается, но цифры не называет: первое слово ваше, и решение, взять его или отдать, принимается до стола.\n\nБерут его так: цифра и критерий, на котором она стоит, в одной первой реплике. Тогда движок засчитывает право первого слова — рамка стола едет к вам ещё до всякой уступки. Здесь первый ход «230, потому что медиана независимых обзоров» двигает позицию работодателя со 180 сразу на 205, тогда как та же реплика вторым ходом даёт 200. Пять тысяч — это и есть цена первого слова, и платится она один раз; сверху приём стоит +6 к шкале «Приёмы».\n\nУсловие ровно одно, и готовится оно заранее: качество довода не ниже 35. Голая цифра рамку не двигает вовсе. Значит вопрос подготовки звучит не «называть ли первым», а «есть ли у меня критерий, на который эту цифру поставить». Критерия нет — отдайте первое слово: это дешевле, чем якорь, который никуда не тянет.",
          "en": "The counterpart greets you without naming a figure: the first word is yours, and whether to take it or hand it over is decided before the table.\n\nYou take it like this: the number and the criterion it stands on, in one opening line. The engine then counts the first word — the frame of the table moves your way before any concession. Here an opening “230, because that is the median of the independent surveys” moves the employer's position from 180 straight to 205, while the same line played second gets 200. Five thousand is the price of the first word, and it is paid once; on top of that the move is worth +6 on the Technique meter.\n\nThere is exactly one condition, and it is prepared in advance: argument quality of at least 35. A bare number moves the frame not at all. So the question to settle beforehand is not “should I open?” but “do I have a criterion to stand the number on?”. If you do not, hand the first word over — that is cheaper than an anchor that pulls nothing."
        }
      },
      {
        "idx": 5,
        "title": {
          "ru": "Размен готовят заранее",
          "en": "A trade is prepared in advance"
        },
        "body": {
          "ru": "Последняя строка листа — размен. У каждого стола две вторичные фишки, и у каждой два числа: сколько она стоит ВАМ и сколько она стоит ИМ. Здесь пересмотр по KPI через полгода стоит вам 0.25 и ценится в 0.75; подписной бонус вместо оклада — 0.45 и 0.55.\n\nРазницу считает движок, а не автор урока. В «Приёмы» фишка приносит 10 × ценность − 6 × стоимость: 6.0 у пересмотра против 2.8 у бонуса. Цену она двигает на 0.10 + 0.30 × ценность: 0.325 против 0.265. Доверие поднимает на 3 + 4 × ценность: 6 против 5.2.\n\nПоэтому лист заканчивается порядком: сначала то, где разрыв «дёшево мне / дорого им» шире. И фишку надо НАЗВАТЬ вслух — «пересмотр по KPI», а не «пойдём навстречу»: движок платит за названное условие, а безымянная доброжелательность остаётся уступкой, за которую не платят ничего.",
          "en": "The last line of the sheet is the trade. Every table has two secondary chips, and each carries two numbers: what it costs YOU and what it is worth to THEM. Here a six-month KPI review costs you 0.25 and is worth 0.75; a signing bonus instead of base costs 0.45 and is worth 0.55.\n\nThe difference is computed by the engine, not by the author of the lesson. On Technique a chip pays 10 × value − 6 × cost: 6.0 for the review against 2.8 for the bonus. It moves the price by 0.10 + 0.30 × value: 0.325 against 0.265. It lifts trust by 3 + 4 × value: 6 against 5.2.\n\nSo the sheet ends with an order: the widest cheap-to-me / dear-to-them gap goes first. And the chip has to be NAMED out loud — “a KPI review”, not “we can be flexible”: the engine pays for a named term, while nameless goodwill stays a concession, and a concession buys nothing."
        }
      }
    ]
  }
];

/** Число упражнений в блоке. Считает генератор — банк для этого
 *  грузить не нужно. */
export const COURSE_BLOCK_SIZES: Record<string, number> = {
  "foundations": 11,
  "spin-ladder": 10,
  "active-listening": 10,
  "objective-criteria": 8,
  "batna-zopa": 10,
  "anchoring": 10,
  "logrolling": 9,
  "pressure-defense": 8,
  "closing": 5,
  "styles": 9,
  "preparation": 11
};
