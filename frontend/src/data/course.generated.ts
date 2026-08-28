// СГЕНЕРИРОВАНО. Не править руками.
// Источник: services/gateway/app/course/{blocks,bank}.py
// Обновить: cd services/gateway && python tools/sync_course.py
//
// Курс проверяется офлайн тем же движком-зеркалом, что и партия без сети,
// поэтому банк обязан быть здесь целиком. Правильность каждого пункта
// доказывается на стороне Python (tests/test_course_bank.py) — против
// настоящего analyze()/apply_move().

import type { CourseBlock, Exercise } from "../lib/courseTypes";

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
          "ru": "У каждого оппонента в тренажёре ровно три скрытых интереса. Они не выдуманы для красоты: из них выведены вторичные вопросы, которыми потом можно разменяться.\n\nУ Натальи из сценария «Аренда» деньги — не главное. Ей важны простой без жильца, тишина в доме и аккуратность. Ни один из трёх интересов не про цену, и именно поэтому спор о цене с ней бесполезен.",
          "en": "Every counterpart in the trainer holds exactly three hidden interests. They are not decoration: the tradeable secondary issues are derived from them.\n\nFor Natalia in the Rent scenario, money is not the point. She cares about vacancy, quiet and a careful tenant. Not one of the three is about price — which is exactly why arguing price with her goes nowhere."
        }
      },
      {
        "idx": 3,
        "title": {
          "ru": "Вопрос-открывашка",
          "en": "The opener question"
        },
        "body": {
          "ru": "Голое «почему?» звучит как допрос и почти ничего не вскрывает: движок засчитает его как открытый вопрос и не добавит информации.\n\nРаботает формулировка «что для вас важнее всего…», «что вас беспокоит…», «что стоит за этой цифрой». Она спрашивает про человека, а не про цифру, и потому получает ответ про интерес: +24 к шкале «Информация».",
          "en": "A bare “why?” sounds like an interrogation and surfaces almost nothing: the engine records an open question and adds no information.\n\nWhat works is “what matters most to you…”, “what concerns you…”, “what sits behind that number”. It asks about the person rather than the figure, and so it gets an answer about an interest: +24 on the Information meter."
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
          "ru": "Критерий — внешний, проверяемый источник с цифрой: обзор зарплат, рыночная медиана, прайс сопоставимых объявлений, отраслевой регламент.\n\n«Я стою больше», «это несправедливо», «у всех знакомых выше» — не критерии. Движок читает их как обычное заявление: качество аргумента 20, рычаг +0. И судья ставит ≥55 только там, где есть конкретное число или источник.",
          "en": "A criterion is an external, checkable source with a number: a salary survey, a market median, comparable listings, an industry regulation.\n\n“I am worth more”, “this is unfair”, “everyone I know earns more” are not criteria. The engine reads them as plain statements: argument quality 20, leverage +0. And the judge scores ≥55 only where a concrete number or source is present."
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
          "ru": "Голая цифра — это заявка на упрямство, и она приглашает такую же в ответ. Цифра, выведенная из внешнего источника, делает вашу систему координат общей.\n\nВ движке разница видна: голый контр-якорь даёт качество аргумента 26, тот же якорь с критерием — реакцию «принимает довод» и рычаг +16.",
          "en": "A bare number is a bid for stubbornness, and it invites the same in return. A number derived from an outside source makes your frame the shared one.\n\nThe engine shows the gap: a bare counter-anchor scores argument quality 26; the same anchor with a criterion yields “persuaded by data” and leverage +16."
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
  }
];

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
        "ru": "Наталья, что для вас важнее всего в жильце — и что вас беспокоит?",
        "en": "Natalia, what matters most to you in a tenant — and what concerns you?"
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
      "ru": "«75 тысяч» — позиция. Пока вы торгуетесь с ней, у стола одна ось и кто-то обязан проиграть. Вопрос про жильца вскрывает интерес — Информация +24, и цена поедет сама.",
      "en": "“75k” is a position. Haggle with it and the table has one axis and someone has to lose. The tenant question surfaces an interest — Information +24, and the price moves on its own."
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
      "ru": "Наталья, что для вас важнее всего в жильце — и что вас беспокоит?",
      "en": "Natalia, what matters most to you in a tenant — and what concerns you?"
    },
    "explain": {
      "ru": "Ключ — формулировка «что для вас важно / что вас беспокоит». Голое «почему?» движок засчитает как обычный открытый вопрос: ноль к Информации.",
      "en": "The key is “what matters to you / what concerns you”. A bare “why?” classifies as a plain open question: zero Information."
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
      "ru": "Наталья, что для вас важнее всего в жильце — и что вас беспокоит?",
      "en": "Natalia, what matters most to you in a tenant — and what concerns you?"
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
        "ru": "Сколько вы теряете, если линия стоит месяц?",
        "en": "What does that cost you when the line is idle for a month?"
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
      "ru": "К чему это приводит, когда линия простаивает месяц?",
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
      "en": "What difficulties do you hit when the load is uneven?"
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
      "ru": "Расскажите о вашем процессе: как сейчас устроены отгрузки и как часто вы отгружаете?",
      "en": "Tell me about your process: how do you currently plan shipments, and how often do you ship?"
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
      "ru": "Признать давление — не признать вину. Движок: доверие вверх, напряжение вниз, Информация +24, реакция «потеплел». Четвёртый вариант — грубость: доверие −22, напряжение +26.",
      "en": "Acknowledging the pressure is not admitting fault. Engine: trust up, tension down, Information +24, reaction “warmed”. Option four is rudeness: trust −22, tension +26."
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
      "ru": "Два приёма в одной реплике: активное слушание (напряжение −10) плюс вскрытие интереса (Информация +24). Именно эта пара даёт самую тёплую реакцию в шкале.",
      "en": "Two moves in one line: active listening (tension −10) plus an interest probe (Information +24). That pair yields the warmest rung on the scale."
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
      "ru": "ZOPA = [18, 24], ширина 6 процентных пунктов — весь торг про их деление. Открылся Павел с 30%, то есть на 12 пунктов ВЫШЕ своего дна: якорь и дно — разные числа, и первое ничего не говорит о втором.",
      "en": "ZOPA = [18, 24], six percentage points wide — the whole haggle is over splitting them. Pavel opened at 30%, i.e. 12 points ABOVE his floor: an anchor and a floor are different numbers, and the first says nothing about the second."
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
      "ru": "Павел держит 30% и не двигается. У вас есть второй фонд. Как назвать альтернативу?",
      "en": "Pavel holds 30% and will not move. You do have a second fund. How do you name the alternative?"
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
      "ru": "Альтернатива, названная без угрозы, даёт рычаг +10 и напряжение +14; та же альтернатива ультиматумом добавляет сверху доверие −14 и напряжение +22 — и уступки замерзают. У инвестора самая сильная BATNA в игре, так что пугать его своей особенно бессмысленно.",
      "en": "An alternative named without a threat grants leverage +10 and tension +14; the same alternative as an ultimatum adds trust −14 and tension +22 on top — and concessions freeze. The investor holds the strongest BATNA in the game, so frightening him with yours is especially pointless."
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
      "ru": "Дно Павла — 18%, ваша красная линия — 24%: вся партия про шесть пунктов. Жёсткая BATNA здесь стоит дорого — напряжение +14 за упоминание и +22 сверху, если оно прозвучало ультиматумом. Двадцать процентов берутся вопросами и разменом, а не второй фондом.",
      "en": "Pavel's floor is 18%, your red line 24%: the whole game is about six points. A hard BATNA is expensive here — tension +14 for naming it and +22 more if it came out as an ultimatum. Twenty percent is reached by questions and trades, not by the second fund."
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
      "ru": "Якорь без обоснования — просто цифра, и защищаться от него учат в следующем уроке. Якорь с критерием движок читает КАК критерий: рычаг +16 и реакция «убеждён». Первый вариант — цифра без единого основания, да ещё ультиматумом: доверие −14, напряжение +22.",
      "en": "An anchor with no grounding is just a number, and the next lesson teaches how to defuse one. An anchor with a criterion is read by the engine AS a criterion: leverage +16 and the reaction “persuaded”. Option one is a bare number with an ultimatum on top: trust −14, tension +22."
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
      "en": "If we renew for 3 years with a phased SLA, can you move on uptime to 99.8% from Q2?"
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
        "ru": "Тогда мы уходим к конкуренту, у них 99.7%.",
        "en": "Then we go to your competitor, they offer 99.7%."
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
      "ru": "Ультиматум — это упаковка, внутри почти всегда страх. «Не брать штрафы, которые не вытянет эксплуатация» — реальный интерес Виктора. Первый вариант закрывает его: жёсткий стиль добавляет ещё +8 к напряжению.",
      "en": "An ultimatum is packaging; a fear usually sits inside. “Avoid penalties the ops team cannot sustain” is Viktor's real interest. Option one hardens him: the tough style adds a further +8 tension."
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
  }
];

// Экзамен мастера: три настоящие партии подряд на столах, которых нет в блоках.
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
    "max_turns": 10,
    "xp": 60,
    "prompt": {
      "ru": "Закройтесь на доле не выше 22%, вскрыв минимум два интереса инвестора.",
      "en": "Close at 22% equity or less, having uncovered at least two of the investor's interests."
    },
    "goal": {
      "ru": "Доля ≤ 22% · два интереса",
      "en": "Equity ≤ 22% · two interests"
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
        "value": 22
      },
      {
        "field": "interests_found",
        "op": ">=",
        "value": 2
      }
    ],
    "explain": {
      "ru": "У инвестора самая сильная альтернатива в игре, и давить бесполезно. Работает только то, что вы отрабатывали в блоках: вопросы, критерии, размен вторичных условий.",
      "en": "The investor holds the strongest alternative in the game, so pressure goes nowhere. Only what the blocks trained works: questions, criteria, trading secondary terms."
    }
  },
  {
    "id": "ms-03",
    "type": "drill",
    "scenario_id": "used_car",
    "max_turns": 8,
    "xp": 60,
    "prompt": {
      "ru": "Купите не дороже 1100k, ни разу не подняв напряжение выше 45.",
      "en": "Buy at 1100k or less, never pushing tension above 45."
    },
    "goal": {
      "ru": "Сделка ≤ 1100k · напряжение ≤ 45",
      "en": "Deal ≤ 1100k · tension ≤ 45"
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
        "value": 1100
      },
      {
        "field": "tension",
        "op": "<=",
        "value": 45
      }
    ],
    "explain": {
      "ru": "Продавец привязан к машине: любая критика вещи читается как критика его самого. Якорь сбивается критерием, а не встречной цифрой.",
      "en": "The seller is attached to the car: criticising the object reads as criticising him. An anchor is defused by a criterion, not by a counter-number."
    }
  }
];
export const MASTER_PASS_MARK = 2;
