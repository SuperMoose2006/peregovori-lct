"""blocks.py — учебные блоки курса «Диалог».

ЧТО ЭТО. Девять блоков по одному навыку каждый, в порядке, где следующий
опирается на предыдущий: вопрос → эмоция → легитимность → сила → числа →
создание ценности → защита → закрытие. Внутри блока — короткие уроки (текст) и
упражнения (`bank.py`), в конце — экзамен блока (`exam.py`).

ПОЧЕМУ ТЕКСТ ЖИВЁТ ЗДЕСЬ, А НЕ ВО ФРОНТЕНДЕ. Ровно по той же причине, что и
сценарии: курс обязан ссылаться на НАСТОЯЩИЕ константы движка. Урок,
утверждающий «активное слушание снимает 10 напряжения», проверяется тестом
против `apply_move`. Зеркало для браузера ГЕНЕРИРУЕТСЯ (`tools/sync_course.py`),
поэтому разъехаться они не могут.

Билингвальность — как везде: `{"ru": ..., "en": ...}`.
"""

from __future__ import annotations

from dataclasses import dataclass


def T(ru: str, en: str) -> dict[str, str]:
    return {"ru": ru, "en": en}


@dataclass(frozen=True)
class Lesson:
    idx: int              # 1-based: на него ссылается упражнение (`lesson`)
    title: dict[str, str]
    body: dict[str, str]  # абзацы разделены "\n\n"


@dataclass(frozen=True)
class Block:
    id: str
    title: dict[str, str]
    skill: dict[str, str]       # одна строка: чему учит блок
    icon: str
    scenario_id: str            # сценарий, на котором блок тренируется
    lessons: list[Lesson]


BLOCKS: list[Block] = [
    Block(
        id="foundations",
        icon="🎯",
        title=T("Позиции и интересы", "Positions & Interests"),
        skill=T(
            "Отличать позицию от интереса и вскрывать второе вопросом, а не догадкой.",
            "Tell a position from an interest, and surface the interest by asking.",
        ),
        scenario_id="rent",
        lessons=[
            Lesson(1, T("Позиция — это ещё не человек", "A position is not the person"), T(
                "«75 тысяч, и это окончательно» — позиция. Названное требование, вершина айсберга. "
                "Интерес — причина, по которой человек этого требует: страх простоя, желание "
                "спокойствия, необходимость отчитаться перед начальством.\n\n"
                "Пока за столом одни позиции, у спора одна ось — цена, — и кто-то обязан проиграть. "
                "Интересов всегда несколько, и почти всегда среди них есть те, что не конфликтуют.",
                "“75k and that is final” is a position: a stated demand, the tip of the iceberg. "
                "The interest is the reason behind the demand — fear of vacancy, a wish for quiet, "
                "the need to look good to leadership.\n\n"
                "While the table holds only positions, the argument has one axis — price — and "
                "someone has to lose. Interests are plural, and some of them never conflict at all.",
            )),
            Lesson(2, T("Три интереса за одной цифрой", "Three interests behind one number"), T(
                "У каждого оппонента в тренажёре ровно три скрытых интереса. Они не выдуманы для "
                "красоты: из них выведены вторичные вопросы, которыми потом можно разменяться.\n\n"
                "У Натальи из сценария «Аренда» деньги — не главное. Ей важны простой без жильца, "
                "тишина в доме и аккуратность. Ни один из трёх интересов не про цену, и именно "
                "поэтому спор о цене с ней бесполезен.",
                "Every counterpart in the trainer holds exactly three hidden interests. They are not "
                "decoration: the tradeable secondary issues are derived from them.\n\n"
                "For Natalia in the Rent scenario, money is not the point. She cares about vacancy, "
                "quiet and a careful tenant. Not one of the three is about price — which is exactly "
                "why arguing price with her goes nowhere.",
            )),
            Lesson(3, T("Вопрос-открывашка", "The opener question"), T(
                "Голое «почему?» звучит как допрос и почти ничего не вскрывает: движок засчитает его "
                "как открытый вопрос и не добавит информации.\n\n"
                "Работает формулировка «что для вас важнее всего…», «что вас беспокоит…», «что стоит "
                "за этой цифрой». Она спрашивает про человека, а не про цифру, и потому получает "
                "ответ про интерес: +24 к шкале «Информация».",
                "A bare “why?” sounds like an interrogation and surfaces almost nothing: the engine "
                "records an open question and adds no information.\n\n"
                "What works is “what matters most to you…”, “what concerns you…”, “what sits behind "
                "that number”. It asks about the person rather than the figure, and so it gets an "
                "answer about an interest: +24 on the Information meter.",
            )),
            Lesson(4, T("Шкала «Информация»", "The Information meter"), T(
                "Информация растёт только от вопросов, которые действительно метят в скрытый "
                "интерес: вскрытие интереса +24, SPIN-последствие +22, ситуация и проблема +14.\n\n"
                "Заявления, встречные цифры и давление не двигают её вовсе. Это не штраф — это "
                "напоминание: пока вы говорите, вы не узнаёте ничего нового.",
                "Information grows only from questions that genuinely aim at a hidden interest: "
                "an interest probe +24, a SPIN implication +22, situation and problem +14.\n\n"
                "Statements, counter-numbers and pressure do not move it at all. That is not a "
                "penalty — it is a reminder: while you are talking, you are learning nothing.",
            )),
        ],
    ),
    Block(
        id="spin-ladder",
        icon="🪜",
        title=T("Лестница SPIN", "The SPIN Ladder"),
        skill=T(
            "Вести собеседника по S → P → I → N, а не задавать вопросы вразнобой.",
            "Walk your counterpart up S → P → I → N instead of asking questions at random.",
        ),
        scenario_id="supplier",
        lessons=[
            Lesson(1, T("Четыре ступени", "Four rungs"), T(
                "S — Situation: как всё устроено сейчас. P — Problem: что мешает. "
                "I — Implication: чем это грозит. N — Need-payoff: что даст решение.\n\n"
                "Порядок не декоративный. Без фактов не найти боль. Без боли последствия звучат как "
                "манипуляция. Без последствий выгода не имеет цены.",
                "S — Situation: how things work today. P — Problem: what gets in the way. "
                "I — Implication: what it costs. N — Need-payoff: what solving it is worth.\n\n"
                "The order is not decorative. With no facts you cannot find the pain. With no pain, "
                "implications sound like manipulation. With no implications, the payoff is worth nothing.",
            )),
            Lesson(2, T("S и P: факты и боль", "S and P: facts and pain"), T(
                "Ситуационные вопросы дёшевы для собеседника и дороги для вас: их легко задать, но "
                "много подряд утомляют. Два-три — и переходите к проблеме.\n\n"
                "Проблемный вопрос — первый, где собеседник произносит вслух то, что ему не нравится. "
                "С этого момента разговор уже не про вашу цену, а про его положение.",
                "Situation questions are cheap for your counterpart and expensive for you: easy to "
                "ask, tiring in a row. Two or three, then move to the problem.\n\n"
                "A problem question is the first one where the other side says out loud what they do "
                "not like. From that moment the conversation is about their position, not your price.",
            )),
            Lesson(3, T("I — самая дорогая ступень", "I — the most valuable rung"), T(
                "Вопрос о последствиях переводит проблему в цифру потерь: «сколько вы теряете, если "
                "линия стоит месяц». Движок оценивает его дороже остальных: +22 против +14.\n\n"
                "Причина простая: пока проблема не измерена, она не стоит денег. После I-вопроса ваше "
                "предложение сравнивается не с нулём, а с ценой бездействия.",
                "An implication question turns a problem into a number: “what does it cost you when "
                "the line sits idle for a month”. The engine prices it above the rest: +22 versus +14.\n\n"
                "The reason is simple: an unmeasured problem is worth no money. After an I-question "
                "your proposal is compared not with zero, but with the price of doing nothing.",
            )),
            Lesson(4, T("N — пусть ценность назовёт собеседник", "N — let them name the value"), T(
                "Need-payoff — единственный вопрос, где выгоду формулирует не продавец, а сам "
                "собеседник: «насколько важно было бы закрыть загрузку на год вперёд».\n\n"
                "То, что человек сказал сам, он потом не оспаривает. Это и есть вся хитрость "
                "четвёртой ступени.",
                "Need-payoff is the one question where the value is spoken by the other side, not by "
                "you: “how valuable would it be to lock the year's utilization now”.\n\n"
                "What people say themselves, they do not argue with later. That is the whole trick "
                "of the fourth rung.",
            )),
            Lesson(5, T("Частая ошибка: сразу N", "The common error: straight to N"), T(
                "Формально движок засчитает N-вопрос на первом ходу и даже даст +22. Но собеседник "
                "ещё не признал никакой боли, поэтому вопрос читается как заготовка продавца.\n\n"
                "Лестница SPIN — про порядок, а не про набор. Пропущенная ступень не ускоряет "
                "разговор, она делает следующий вопрос неуместным.",
                "Formally the engine will score an N-question on turn one and even grant +22. But the "
                "other side has admitted no pain yet, so the question reads as a sales script.\n\n"
                "The SPIN ladder is about sequence, not about a checklist. A skipped rung does not "
                "speed the conversation up — it makes the next question land wrong.",
            )),
        ],
    ),
    Block(
        id="active-listening",
        icon="🤝",
        title=T("Слушание и деэскалация", "Listening & De-escalation"),
        skill=T(
            "Снимать напряжение отражением и отделять человека от проблемы.",
            "Take tension down by reflecting, and separate the people from the problem.",
        ),
        scenario_id="conflict",
        lessons=[
            Lesson(1, T("Назвать чувство, не соглашаясь", "Name the feeling without agreeing"), T(
                "«Я вижу, что на вас давит руководство» — это не признание вины. Вы называете то, "
                "что и так очевидно обоим, и человек перестаёт доказывать, что ему тяжело.\n\n"
                "Движок за такой ход даёт доверие +8 и напряжение −10. Это самый дешёвый способ "
                "вернуть разговор в рабочее русло: он ничего вам не стоит.",
                "“I can see leadership is pressing you” is not an admission of fault. You name what "
                "is already obvious to both, and the other side stops proving that it is hard.\n\n"
                "The engine grants trust +8 and tension −10 for that move. It is the cheapest way "
                "back to a working conversation: it costs you nothing.",
            )),
            Lesson(2, T("Отражение смысла", "Reflecting the meaning"), T(
                "«Правильно ли я понял, что для вас критичны не сроки, а то, как это подадут "
                "наверх?» — вы возвращаете человеку его же мысль, очищенную от эмоции.\n\n"
                "Два эффекта сразу: он слышит себя со стороны и поправляет вас, если вы ошиблись. "
                "Ошибка здесь ценнее правоты — она вскрывает настоящий интерес.",
                "“So if I understand it right, what matters is not the dates but how this is framed "
                "upwards?” — you hand back their own thought with the emotion stripped out.\n\n"
                "Two effects at once: they hear themselves from outside, and they correct you if you "
                "got it wrong. Being wrong here is worth more than being right — it surfaces the "
                "real interest.",
            )),
            Lesson(3, T("Лестница реакций", "The reaction ladder"), T(
                "Оппонент всегда находится в одном из десяти состояний: встаёт из-за стола · "
                "принимает на свой счёт · закрывается · под давлением · пока не соглашается · "
                "держит нейтралитет · идёт навстречу · принимает довод · приоткрывается · теплеет. "
                "Теми же словами они подписаны в игре и в заданиях — чтобы урок и стол говорили "
                "на одном языке.\n\n"
                "Читать это состояние — отдельный навык. Одна и та же ваша реплика на «теплеет» и "
                "на «принимает на свой счёт» даёт разный результат, потому что уступки режутся "
                "напряжением.",
                "Your counterpart is always in one of ten states: walked out · offended · hardened · "
                "pressured · neutral · not yet · opened up · persuaded · collaborated · warmed.\n\n"
                "Reading that state is a skill of its own. The same line of yours lands differently "
                "on “warmed” and on “offended”, because tension cuts concessions.",
            )),
            Lesson(4, T("Что взрывает стол", "What blows the table up"), T(
                "Грубость: доверие −22, напряжение +26. Ультиматум: доверие −14, напряжение +22. "
                "Дословный повтор своей же реплики: качество аргумента падает до 12.\n\n"
                "И главная ловушка: при напряжении выше 55 уступки режутся на 40%, выше 75 — на 75%. "
                "Давление даёт вам рычаг и одновременно замораживает возможность им воспользоваться.",
                "Rudeness: trust −22, tension +26. An ultimatum: trust −14, tension +22. A verbatim "
                "repeat of your own line: argument quality drops to 12.\n\n"
                "And the main trap: above 55 tension concessions are cut by 40%, above 75 by 75%. "
                "Pressure hands you leverage and freezes your ability to use it in the same move.",
            )),
        ],
    ),
    Block(
        id="objective-criteria",
        icon="📊",
        title=T("Объективные критерии", "Objective Criteria"),
        skill=T(
            "Заменять «я так считаю» внешним стандартом, который трудно оспорить.",
            "Replace “because I say so” with an external standard that is hard to dispute.",
        ),
        scenario_id="salary",
        lessons=[
            Lesson(1, T("Столкновение мнений против столкновения критериев",
                        "Clash of opinions vs clash of criteria"), T(
                "Спор двух мнений выигрывает тот, кто упрямее. Спор двух критериев выигрывает тот, "
                "чей критерий уместнее, — и проигравшему не приходится капитулировать.\n\n"
                "Это четвёртый принцип Гарвардского метода и единственный способ уступить, не "
                "потеряв лицо: вы уступаете не человеку, а стандарту.",
                "A clash of opinions is won by whoever is more stubborn. A clash of criteria is won "
                "by whoever's standard fits better — and the loser never has to capitulate.\n\n"
                "This is the fourth Harvard principle, and the only way to concede without losing "
                "face: you are yielding to a standard, not to a person.",
            )),
            Lesson(2, T("Что считается критерием", "What counts as a criterion"), T(
                "Критерий — внешний, проверяемый источник с цифрой: обзор зарплат, рыночная медиана, "
                "прайс сопоставимых объявлений, отраслевой регламент.\n\n"
                "«Я стою больше», «это несправедливо», «у всех знакомых выше» — не критерии. Движок "
                "читает их как обычное заявление: качество аргумента 20, рычаг +0. И судья ставит "
                "≥55 только там, где есть конкретное число или источник.",
                "A criterion is an external, checkable source with a number: a salary survey, a "
                "market median, comparable listings, an industry regulation.\n\n"
                "“I am worth more”, “this is unfair”, “everyone I know earns more” are not criteria. "
                "The engine reads them as plain statements: argument quality 20, leverage +0. And "
                "the judge scores ≥55 only where a concrete number or source is present.",
            )),
            Lesson(3, T("Критерий как броня для уступки", "A criterion as armour for a concession"), T(
                "Если вы двигаетесь без объяснения, оппонент читает это как «можно давить ещё». Если "
                "вы двигаетесь к цифре из внешнего источника, это выглядит как переход к точности.\n\n"
                "Поэтому критерий полезен обеим сторонам: он даёт им повод согласиться, не признавая "
                "поражения.",
                "Move without an explanation and the other side reads it as “push harder”. Move to a "
                "number from an outside source and it reads as getting more precise.\n\n"
                "That is why a criterion helps both sides: it gives them a reason to agree without "
                "admitting defeat.",
            )),
            Lesson(4, T("Шкала «Рычаг»", "The Leverage meter"), T(
                "Критерий даёт рычаг +16, а с аналитическим собеседником ещё +6 сверху. Альтернатива "
                "без подкрепления — всего +10 и напряжение +14; та же альтернатива с критерием — "
                "+18 и напряжение всего +4.\n\n"
                "Рычаг — не про громкость. Это про то, насколько тяжело вам возразить.",
                "A criterion grants leverage +16, and another +6 with an analytical counterpart. An "
                "unbacked alternative gives only +10 and tension +14; the same alternative backed by "
                "a criterion gives +18 and tension of just +4.\n\n"
                "Leverage is not about volume. It is about how hard you are to argue with.",
            )),
        ],
    ),
    Block(
        id="batna-zopa",
        icon="🛡",
        title=T("BATNA и ZOPA", "BATNA & ZOPA"),
        skill=T(
            "Считать зону сделки и опираться на альтернативу как на спокойствие, а не как на дубину.",
            "Compute the deal zone and lean on your alternative as calm, not as a club.",
        ),
        scenario_id="investor",
        lessons=[
            Lesson(1, T("ZOPA: где она есть", "ZOPA: where it exists"), T(
                "Зона возможного соглашения — отрезок между вашей красной линией и красной линией "
                "оппонента. Всё, о чём вы торгуетесь, — это распределение внутри отрезка.\n\n"
                "Если отрезка нет, сделки нет ни при каком мастерстве. Умение вовремя это увидеть "
                "экономит больше, чем любая техника давления.",
                "The zone of possible agreement is the segment between your red line and theirs. "
                "Everything you haggle over is the split inside that segment.\n\n"
                "If there is no segment, there is no deal at any level of skill. Seeing that early "
                "saves more than any pressure technique.",
            )),
            Lesson(2, T("BATNA ≠ красная линия", "BATNA is not the red line"), T(
                "Красная линия = ценность альтернативы ± стоимость переключения. У поставщика "
                "альтернатива 95, но с риском качества — красная линия строже, 92. В аренде "
                "альтернатива 68, но плюс сорок минут дороги — красная линия мягче, 70.\n\n"
                "Это одна формула, а не разнобой авторов. Проверьте её на любом сценарии тренажёра.",
                "Red line = the value of your alternative ± the cost of switching. With the supplier "
                "the alternative is 95 but carries quality risk — the red line is stricter, 92. In "
                "the rent case the alternative is 68 but adds forty minutes of commute — the red "
                "line is looser, 70.\n\n"
                "One formula, not authorial whim. Check it against any scenario in the trainer.",
            )),
            Lesson(3, T("Назвать альтернативу, не пригрозив", "Name the alternative without threatening"), T(
                "«У меня есть предложение на 210, но ваш проект мне интереснее — давайте искать "
                "решение здесь» — это факт плюс намерение договориться.\n\n"
                "«Или 230, или я ухожу» — тот же факт, превращённый в ультиматум. Разница в движке: "
                "первое даёт рычаг +18 при напряжении +4, второе — доверие −14 и напряжение +22.",
                "“I have an offer at 210, but your project interests me more — let us find a solution "
                "here” is a fact plus an intention to agree.\n\n"
                "“Either 230 or I walk” is the same fact turned into an ultimatum. In the engine: the "
                "first gives leverage +18 at tension +4, the second gives trust −14 and tension +22.",
            )),
            Lesson(4, T("Цена жёсткой BATNA", "The price of a hard BATNA"), T(
                "Альтернатива, поданная как угроза, делает любое движение оппонента капитуляцией. "
                "Человеку, который отчитывается перед кем-то, капитулировать нельзя.\n\n"
                "С собеседником, для которого важны отношения, штраф ещё выше: +6 к напряжению "
                "сверху. Сила, которую нельзя применить, — не сила.",
                "An alternative delivered as a threat turns any movement by the other side into a "
                "surrender. Someone who reports to a boss cannot afford to surrender.\n\n"
                "With a relationship-driven counterpart the penalty is higher still: +6 tension on "
                "top. Power you cannot use is not power.",
            )),
        ],
    ),
    Block(
        id="anchoring",
        icon="⚓",
        title=T("Якорь и защита от него", "Anchoring & Counter-anchoring"),
        skill=T(
            "Ставить обоснованный первый номер и не давать чужому якорю задать рамку.",
            "Set a grounded first number, and refuse to let their anchor set the frame.",
        ),
        scenario_id="used_car",
        lessons=[
            Lesson(1, T("Эффект якоря", "The anchoring effect"), T(
                "Первый названный номер тянет исход к себе, даже когда обе стороны знают, что он "
                "завышен. Продавец машины открывается на 1200 при настоящем дне 1040: сто шестьдесят "
                "тысяч — это не цена, это переговорный воздух.\n\n"
                "Поэтому чужой первый номер нельзя брать за точку отсчёта. Он выбран так, чтобы "
                "утянуть ваши ожидания.",
                "The first number named drags the outcome toward itself, even when both sides know it "
                "is inflated. The car seller opens at 1200 with a real floor of 1040: a hundred and "
                "sixty thousand of negotiating air, not price.\n\n"
                "That is why their first number must never become your reference point. It was "
                "picked to drag your expectations.",
            )),
            Lesson(2, T("Ставить якорь: только с критерием", "Anchor only with a criterion"), T(
                "Голая цифра — это заявка на упрямство, и она приглашает такую же в ответ. Цифра, "
                "выведенная из внешнего источника, делает вашу систему координат общей.\n\n"
                "В движке разница видна: голый контр-якорь даёт качество аргумента 26, тот же якорь "
                "с критерием — реакцию «принимает довод» и рычаг +16.",
                "A bare number is a bid for stubbornness, and it invites the same in return. A number "
                "derived from an outside source makes your frame the shared one.\n\n"
                "The engine shows the gap: a bare counter-anchor scores argument quality 26; the same "
                "anchor with a criterion yields “persuaded by data” and leverage +16.",
            )),
            Lesson(3, T("Защита: не контр-цифра", "Defence is not a counter-number"), T(
                "Ответить своей крайней цифрой — значит согласиться играть в перетягивание каната, "
                "где выигрывает не правый, а упорный.\n\n"
                "Работает другое: назвать якорь якорем, спросить, что за ним стоит, предложить "
                "внешний критерий — и только потом поставить свою цифру ВНУТРИ этого критерия.",
                "Answering with your own extreme number means agreeing to a tug of war, where the "
                "winner is the stubborn one, not the right one.\n\n"
                "What works: name the anchor as an anchor, ask what sits behind it, offer an external "
                "criterion — and only then put your number INSIDE that criterion.",
            )),
            Lesson(4, T("Цена оскорбительного контр-якоря", "The price of an insulting counter-anchor"), T(
                "«Да она столько не стоит, это смешно» — доверие −22, напряжение +26. Продавец "
                "привязан к машине: критика вещи читается как критика его самого.\n\n"
                "Дальше мстит механика: при напряжении выше 55 уступки режутся на 40%. Вы закрываете "
                "ровно ту дверь, ради которой ставили якорь.",
                "“It is not worth that, this is a joke” — trust −22, tension +26. The seller is "
                "attached to the car: criticising the object reads as criticising him.\n\n"
                "Then the mechanics take revenge: above 55 tension concessions are cut by 40%. You "
                "shut the very door the anchor was meant to open.",
            )),
        ],
    ),
    Block(
        id="logrolling",
        icon="🔄",
        title=T("Размен и создание ценности", "Logrolling & Value Creation"),
        skill=T(
            "Находить, что дёшево для вас и дорого для них, и связывать вопросы в пакет.",
            "Find what is cheap for you and dear to them, and bundle issues into a package.",
        ),
        scenario_id="supplier",
        lessons=[
            Lesson(1, T("Одна ось — торг, две — сделка", "One axis is haggling, two is a deal"), T(
                "Пока обсуждается только цена, выигрыш одного равен проигрышу другого. Стоит "
                "добавить второй вопрос — срок, объём, график платежей — и появляются варианты, где "
                "выигрывают оба.\n\n"
                "Вторичные вопросы в тренажёре не декоративны: у каждого есть ценность для оппонента "
                "и стоимость для вас, и обе цифры настоящие.",
                "While only price is on the table, one side's gain is the other's loss. Add a second "
                "issue — term, volume, payment schedule — and options appear where both sides win.\n\n"
                "The secondary issues in the trainer are not decoration: each carries a value to the "
                "counterpart and a cost to you, and both numbers are real.",
            )),
            Lesson(2, T("Матрица «дёшево мне / дорого им»", "The cheap-to-me / dear-to-them matrix"), T(
                "Годовой контракт стоит вам 0.2, а для поставщика он стоит 0.85 — идеальная фишка. "
                "Предоплата 30% обходится вам в 0.45, а ценится всего в 0.55 — посредственная.\n\n"
                "Порядок размена именно такой: сперва то, где разрыв больше. Отдать сначала дорогое "
                "для себя — значит потратить всю доброжелательность на полдороге.",
                "An annual commitment costs you 0.2 and is worth 0.85 to the supplier — a perfect "
                "chip. A 30% prepayment costs you 0.45 and is worth 0.55 — a mediocre one.\n\n"
                "Trade in that order: the widest gap first. Giving away what is expensive to you "
                "first spends all the goodwill halfway.",
            )),
            Lesson(3, T("Формула пакета", "The package formula"), T(
                "Вклад размена в шкалу «Приёмы» движок считает как 10·ценность_для_них − "
                "6·стоимость_для_вас за каждый вопрос, с потолком +16 на всю партию.\n\n"
                "Потолок стоит там намеренно: даже идеальный пакет не заменяет вопросы, критерии и "
                "слушание. Размен — часть техники, а не её обход.",
                "The engine scores a trade's contribution to Technique as 10·value_to_them − "
                "6·cost_to_you per issue, capped at +16 for the whole session.\n\n"
                "The cap is deliberate: even a perfect package does not replace questions, criteria "
                "and listening. Logrolling is part of the technique, not a way around it.",
            )),
            Lesson(4, T("Связывать, а не раздавать", "Link it, do not give it away"), T(
                "«Если мы дадим годовой контракт, сможете ли вы подвинуться до 88?» — размен: "
                "доверие +6, напряжение −4, и цена двигается сильнее всего в игре.\n\n"
                "«Хорошо, давайте годовой контракт» без связки — уступка. Движок засчитает её как "
                "уступку и ничего не даст: вы отдали фишку, не купив на неё ничего.",
                "“If we commit for a year, can you move to 88?” is a trade: trust +6, tension −4, and "
                "the price moves more than from anything else in the game.\n\n"
                "“Fine, let us do the annual contract” with no link is a concession. The engine scores "
                "it as one and grants nothing: you spent the chip and bought nothing with it.",
            )),
        ],
    ),
    Block(
        id="pressure-defense",
        icon="🧱",
        title=T("Давление и возражения", "Pressure & Objections"),
        skill=T(
            "Не отвечать на ультиматум ультиматумом и переводить атаку обратно в критерии.",
            "Never answer an ultimatum with an ultimatum; redirect the attack into criteria.",
        ),
        scenario_id="sla_renewal",
        lessons=[
            Lesson(1, T("Три ответа на ультиматум", "Three answers to an ultimatum"), T(
                "Назвать: «я слышу, что это ваше последнее слово». Проигнорировать: продолжить "
                "разговор так, будто ультиматума не было. Вернуть к критерию: «давайте вернёмся к "
                "цифрам».\n\n"
                "Четвёртого ответа — своего ультиматума — не существует. Он не добавляет вам силы, "
                "он лишает обе стороны пространства для движения.",
                "Name it: “I hear that this is your final word.” Ignore it: keep the conversation "
                "going as if it had not happened. Return to the criterion: “let us go back to the "
                "numbers.”\n\n"
                "There is no fourth answer — your own ultimatum is not one. It adds no strength; it "
                "removes both sides' room to move.",
            )),
            Lesson(2, T("Возражение как скрытый интерес", "An objection is a hidden interest"), T(
                "«99.9% невозможно» — это упаковка. Внутри почти всегда страх: штрафы, которые не "
                "вытянет команда эксплуатации.\n\n"
                "Вопрос «что именно делает 99.9% невозможным» превращает стену в информацию. "
                "Возражение — единственный подарок, который оппонент делает добровольно.",
                "“99.9% is impossible” is packaging. A fear usually sits inside: penalties the ops "
                "team cannot sustain.\n\n"
                "The question “what exactly makes 99.9% impossible” turns a wall into information. An "
                "objection is the one gift the other side hands you voluntarily.",
            )),
            Lesson(3, T("Термостат напряжения", "The tension thermostat"), T(
                "Напряжение выше 55 режет уступки на 40%, выше 75 — на 75%. Уступка 0.40 при "
                "напряжении 80 превращается в 0.10.\n\n"
                "Отсюда практический вывод: перед тем как просить движения, потратьте ход на "
                "снижение напряжения. Он окупится больше, чем ещё один аргумент.",
                "Tension above 55 cuts concessions by 40%, above 75 by 75%. A 0.40 concession at "
                "tension 80 becomes 0.10.\n\n"
                "The practical consequence: before asking for movement, spend a turn lowering "
                "tension. It pays back more than one more argument would.",
            )),
            Lesson(4, T("Анти-гейминг", "Anti-gaming"), T(
                "Повтор той же реплики опускает качество аргумента до 12 и режет уступку до 15%. "
                "Настойчивость не равна аргументу — движок различает их специально.\n\n"
                "Если вас не услышали, меняйте не громкость, а тип хода: вопрос вместо заявления, "
                "критерий вместо цифры, размен вместо просьбы.",
                "Repeating the same line drops argument quality to 12 and cuts the concession to 15%. "
                "Persistence is not argument — the engine tells them apart on purpose.\n\n"
                "If you were not heard, change the kind of move, not the volume: a question instead "
                "of a statement, a criterion instead of a number, a trade instead of a request.",
            )),
        ],
    ),
    Block(
        id="closing",
        icon="🏁",
        title=T("Закрытие и фиксация", "Closing & Commitment"),
        skill=T(
            "Понимать, когда закрывать, чем закрывать и на чём сделка фиксируется.",
            "Know when to close, what to close with, and where the deal actually settles.",
        ),
        scenario_id="supplier",
        lessons=[
            Lesson(1, T("Точка встречи", "The meeting point"), T(
                "Сделка закрывается не на последней цифре оппонента, а в точке\n"
                "их цифра + (ваша цифра − их цифра) · (0.3 + 0.45 · гибкость).\n\n"
                "Гибкость собрана из доверия, информации и рычага — из всего, что вы делали "
                "предыдущие десять ходов. Именно здесь эта работа превращается в деньги.",
                "The deal does not settle at their last number, but at "
                "offer_opp + (offer_player − offer_opp) · (0.3 + 0.45 · flexibility).\n\n"
                "Flexibility is built from trust, information and leverage — from everything you did "
                "over the previous ten turns. This is where that work turns into money.",
            )),
            Lesson(2, T("Пол оппонента непробиваем", "Their floor does not move"), T(
                "Ниже своей красной линии оппонент не пойдёт ни при каком доверии и ни при каком "
                "давлении. Предложение ниже пола даёт реакцию «пока нет», а не сделку.\n\n"
                "Это первый инвариант тренажёра. Он же — главная причина, почему давление в "
                "переговорах переоценено: за полом ничего нет.",
                "Below their red line the other side will not go, at any level of trust or pressure. "
                "An offer under the floor yields “not yet”, not a deal.\n\n"
                "That is the trainer's first invariant. It is also the main reason pressure is "
                "overrated: there is nothing behind the floor.",
            )),
            Lesson(3, T("Закрывать с цифрой", "Close with a number"), T(
                "Закрытие без числа движок фиксирует на ЕЁ последнем номере — вы дарите весь "
                "остаток зоны просто потому, что не назвали цифру в закрывающей реплике.\n\n"
                "Правильное закрытие короткое и полное: число, условие пакета, вопрос-подтверждение. "
                "«Фиксируем: 88 при годовом контракте. По рукам?»",
                "A close with no number settles at THEIR last figure — you hand over the rest of the "
                "zone simply for not naming one in the closing line.\n\n"
                "A good close is short and complete: the number, the package term, a confirming "
                "question. “Locking it in: 88 with the annual commitment. Deal?”",
            )),
            Lesson(4, T("Счёт и потолок «C»", "The score and the C ceiling"), T(
                "Итог = 0.4·экономика + 0.25·отношения + 0.35·приёмы. Экономика считается не как "
                "«сколько получил», а как доля пути от красной линии до цели.\n\n"
                "И главное: при технике ниже 45 грейд не поднимается выше C, какой бы ни была цена. "
                "Отличная сделка, купленная без метода, не воспроизводима — а тренажёр учит методу.",
                "Overall = 0.4·economics + 0.25·relationship + 0.35·technique. Economics is not “how "
                "much you got” but the share of the distance from your red line to your target.\n\n"
                "And crucially: with technique below 45 the grade never rises above C, whatever the "
                "price. A great deal bought without method does not repeat — and method is what the "
                "trainer teaches.",
            )),
        ],
    ),
]

BY_ID: dict[str, Block] = {b.id: b for b in BLOCKS}
