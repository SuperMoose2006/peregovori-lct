"""scenarios.py — faithful Python port of legacy-node/data/scenarios.js.

Each scenario is a self-contained negotiation "level". The design encodes the
Harvard distinction between POSITIONS (opening numbers) and INTERESTS (the
hidden reasons). Numbers are abstract "points" on a headline issue plus
secondary issues that enable trade-offs (logrolling / value creation).

ZOPA lies between the player's reservation and the opponent's reservation.
Every number below is EXACTLY as in the reference JS.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class Counterpart:
    name: dict[str, str]
    persona: dict[str, str]
    style: str  # relationship | tough | analytical
    #: Пол — для выбора голоса синтеза. Раньше он УГАДЫВАЛСЯ по окончанию
    #: строки имени, а строка это «Имя, должность»: догадка читала должность.
    #: «Ирина, глава продаж» кончается на «продаж» → мужской голос; «Павел,
    #: основатель стартапа» → на «стартапа» → женский. Половина оппонентов
    #: говорила чужим голосом.
    female: bool = True


@dataclass(frozen=True)
class Headline:
    unit: dict[str, str]
    dir: str  # lower_is_better | higher_is_better


@dataclass(frozen=True)
class Batna:
    strength: int
    note: dict[str, str]


@dataclass(frozen=True)
class SecondaryIssue:
    """A structured second axis for real logrolling (value creation).

    The player can concede this issue in a trade-off. Unlike the free-text
    `tradeoffs` (a flat prompt cue), a SecondaryIssue carries the two numbers
    that make cross-issue trading a genuine second dimension:
      - `opp_value` (0..1): how much the OPPONENT values getting this → how much
        EXTRA price flexibility it unlocks. High-value concessions move price more.
      - `player_cost` (0..1): how much conceding it costs the PLAYER's package.
    Good logrolling = concede an issue that is cheap for you (low player_cost) but
    valuable to them (high opp_value) in exchange for movement on the headline price.
    `keywords` drive OFFLINE detection of the player offering/conceding the issue;
    the semantic judge can name it by `id` instead (see engine.apply_move).
    """
    id: str
    label: dict[str, str]
    keywords: dict[str, list[str]]
    opp_value: float
    player_cost: float


@dataclass(frozen=True)
class Scenario:
    id: str
    icon: str
    difficulty: int
    title: dict[str, str]
    role: dict[str, str]
    counterpart: Counterpart
    headline: Headline
    opponent_open: float
    opponent_reservation: float
    player_target: float
    player_reservation: float
    player_batna: Batna
    hidden_interests: dict[str, list[str]]
    tradeoffs: dict[str, list[str]]
    briefing: dict[str, str]
    # Optional structured logrolling axis. Empty default ⇒ the scenario behaves
    # EXACTLY as before (flat tradeoff bonus, no package scoring). Populate to
    # enable real cross-issue value creation. See SecondaryIssue.
    secondary_issues: list[SecondaryIssue] = field(default_factory=list)
    # Per-interest probe keywords for HONEST offline interest-reveal. `lang → list
    # of 3 keyword-lists`, index-aligned with `hidden_interests`. When the semantic
    # judge is OFF, a probe whose text matches an unrevealed interest's keywords
    # uncovers THAT interest (not the next one in list order) so the opponent never
    # speaks to an interest the player didn't actually ask about. Empty default ⇒
    # pure next-in-order behaviour (unchanged). See engine._reveal_index_offline.
    hidden_interest_keywords: dict[str, list[list[str]]] = field(default_factory=dict)
    # ТЕМЫ переговоров — области, В КОТОРЫХ лежат скрытые интересы, по одной на
    # интерес (index-aligned с `hidden_interests`). Тема — не секрет: «производство»
    # не выдаёт «стабильную загрузку», но говорит игроку, ГДЕ копать. Без тем
    # офлайновое вскрытие было угадыванием — попасть можно было только назвав
    # содержание секрета, то есть зная ответ заранее.
    #
    # Ярлык темы ОДНОВРЕМЕННО и то, что игрок видит чипом на столе, и то, по чему
    # движок засчитывает попадание: основы для сравнения выводятся из самого
    # ярлыка (engine._topic_stems). Что написано на чипе — то и работает, и
    # разъехаться эти две вещи не могут по построению.
    interest_topics: dict[str, list[str]] = field(default_factory=dict)
    # ЗЕРКАЛЬНЫЙ СТОЛ: id того стола, ЗА КОТОРЫЙ этот сажает игрока с другой
    # стороны. Пусто у всех девяти столов библиотеки — они и есть «эта» сторона.
    #
    # Движок это поле НЕ ЧИТАЕТ и читать не может: он и так симметричен, потому
    # что вся асимметрия «кто игрок» лежит в шестнадцати полях записи, а не в
    # коде (`tests/test_other_side.py::test_the_engine_never_reads_mirror_of`).
    # Поле нужно РАЗБОРУ: три интереса, которые игрок за зеркальным столом
    # ЗАЩИЩАЛ, — это ровно `hidden_interests` того стола, откуда он пришёл.
    # Не отдельный текст рядом, который разъедется с оригиналом при первой
    # правке, а тот же самый — иначе карточка «что вы защищали» обещала бы
    # секреты, которых за оригинальным столом нет.
    mirror_of: str = ""


SCENARIOS: list[Scenario] = [
    Scenario(
        id="supplier",
        icon="📦",
        difficulty=2,
        title={"ru": "Контракт с поставщиком", "en": "Supplier Contract"},
        role={
            "ru": "Вы — менеджер по закупкам. Нужно снизить цену на комплектующие, не потеряв надёжного поставщика.",
            "en": "You are a procurement manager. Drive the component price down without losing a reliable supplier.",
        },
        counterpart=Counterpart(
            name={"ru": "Ирина, глава продаж", "en": "Irina, Head of Sales"},
            persona={
                "ru": "Опытная, ориентирована на отношения, не любит давление.",
                "en": "Experienced, relationship-oriented, dislikes pressure.",
            },
            female=True,
            style="relationship",
        ),
        headline=Headline(unit={"ru": "₽/шт", "en": "/unit"}, dir="lower_is_better"),
        opponent_open=100,
        opponent_reservation=84,
        player_target=86,
        player_reservation=92,
        player_batna=Batna(
            strength=55,
            note={
                "ru": "Есть другой поставщик по 95, но с рисками качества.",
                "en": "Alternative supplier at 95, but quality risk.",
            },
        ),
        hidden_interests={
            "ru": [
                "Стабильная загрузка производства",
                "Предоплата / денежный поток",
                "Долгосрочный контракт вместо разовой сделки",
            ],
            "en": [
                "Stable factory utilization",
                "Upfront payment / cash flow",
                "Long-term contract over one-off deal",
            ],
        },
        interest_topics={
            "ru": ["Производство", "Оплата", "Срок контракта"],
            "en": ["Production", "Payments", "Contract term"],
        },
        hidden_interest_keywords={
            "ru": [
                ["загрузк", "загруз производ", "стабильн загруз", "простой", "недозагруз", "объем производ", "заполнить производ"],
                ["денежн", "поток", "предоплат", "аванс", "кэшфлоу", "кассов разрыв", "оборотн средств", "деньги вперед", "ликвидн"],
                ["долгосрочн", "годов контракт", "на год", "длительн", "разов сделк", "постоянн сотрудни", "длинн контракт", "надолго"],
            ],
            "en": [
                ["utilization", "factory", "capacity", "keep the line", "steady volume", "idle", "load the plant"],
                ["cash flow", "cashflow", "upfront", "prepay", "advance", "working capital", "liquidity"],
                ["long-term", "long term", "one-off", "ongoing", "multi-year", "lasting", "annual contract"],
            ],
        },
        tradeoffs={
            "ru": ["Годовой контракт с гарантией объёма", "Предоплата 30%", "Совместный прогноз спроса"],
            "en": ["Annual volume commitment", "30% upfront payment", "Joint demand forecast"],
        },
        # Two structured issues promoted from the tradeoffs above. Annual volume
        # is what the supplier craves most (stable utilization + long-term deal =
        # two of their three interests) yet costs the buyer little → the ideal
        # logrolling chip. Upfront payment helps their cash flow but ties up the
        # buyer's working capital → moderate value, moderate cost.
        secondary_issues=[
            SecondaryIssue(
                id="annual_contract",
                label={"ru": "Годовой контракт с гарантией объёма", "en": "Annual volume commitment"},
                keywords={
                    "ru": ["годов", "гарантия объем", "гарантию объем", "объем на год", "долгосрочн", "на год", "длительн контракт", "многолетн"],
                    "en": ["annual", "volume commitment", "long-term", "long term", "yearly", "multi-year", "year contract"],
                },
                opp_value=0.85,
                player_cost=0.2,
            ),
            SecondaryIssue(
                id="prepay",
                label={"ru": "Предоплата 30%", "en": "30% upfront payment"},
                keywords={
                    "ru": ["предоплат", "аванс", "вперед оплат", "оплата вперед", "предоплатим"],
                    "en": ["upfront", "prepay", "advance payment", "pay in advance", "cash upfront"],
                },
                opp_value=0.55,
                player_cost=0.45,
            ),
        ],
        briefing={
            "ru": "Цель: цена ≤ 86 ₽/шт. Красная линия: 92. У поставщика есть скрытые интересы — узнайте их вопросами, и цена сдвинется без давления.",
            "en": "Goal: price ≤ 86/unit. Red line: 92. The supplier has hidden interests — surface them with questions and the price moves without pressure.",
        },
    ),
    Scenario(
        id="salary",
        icon="💼",
        difficulty=3,
        title={"ru": "Переговоры о зарплате", "en": "Salary Negotiation"},
        role={
            "ru": "Вы получили оффер и хотите повысить компенсацию, не отпугнув работодателя.",
            "en": "You have an offer and want to raise the package without scaring off the employer.",
        },
        counterpart=Counterpart(
            name={"ru": "Дмитрий, директор", "en": "Dmitry, Hiring Director"},
            persona={
                "ru": "Прагматичный, ценит цифры и рыночные данные.",
                "en": "Pragmatic, respects numbers and market data.",
            },
            female=False,
            style="analytical",
        ),
        headline=Headline(unit={"ru": "k ₽/мес", "en": "k/mo"}, dir="higher_is_better"),
        opponent_open=180,
        opponent_reservation=240,
        player_target=230,
        player_reservation=195,
        player_batna=Batna(
            strength=60,
            # Минус альтернативы обязан быть НАПИСАН, и на обоих языках. Красная
            # линия здесь (195) хуже второго оффера (210): без «но менее
            # интересный проект» записка говорит игроку «у тебя на руках 210» и
            # тем самым отменяет свою же красную линию. По-русски минус стоял,
            # по-английски пропал — половина стола объясняла игроку, почему он
            # не уходит, а половина нет.
            note={
                "ru": "Есть второй оффер на 210, но менее интересный проект.",
                "en": "A second offer at 210, but a less interesting project.",
            },
        ),
        hidden_interests={
            "ru": ["Удержать бюджет отдела в рамках", "Быстро закрыть позицию", "Обосновать вилку перед финансами"],
            "en": ["Keep the team budget in bounds", "Close the role quickly", "Justify the band to finance"],
        },
        interest_topics={
            "ru": ["Бюджет отдела", "Сроки найма", "Согласование с финансами"],
            "en": ["Team budget", "Hiring timeline", "Finance approval"],
        },
        hidden_interest_keywords={
            "ru": [
                ["бюджет отдел", "бюджет команд", "бюджет в рамк", "рамки бюджет", "бюджет", "перерасход", "фонд оплаты"],
                ["быстро закр", "закрыть позиц", "сроки найм", "быстро выйти", "скорее выйти", "как быстро нужно", "скорее закрыть", "срочно нужен"],
                ["перед финанс", "обоснов вилк", "вилк", "перед финотдел", "объяснить финанс", "согласовать с финанс", "финанс"],
            ],
            "en": [
                ["team budget", "budget", "within budget", "budget bounds", "budget cap", "headcount cost"],
                ["close the role", "fill the role", "start quickly", "how soon", "timeline to hire", "fill it quickly"],
                ["finance", "justify the band", "salary band", "band to finance", "cfo", "approve the band"],
            ],
        },
        tradeoffs={
            "ru": ["Пересмотр через 6 месяцев по KPI", "Подписной бонус вместо оклада", "Доп. отпуск / удалёнка"],
            "en": ["6-month review tied to KPIs", "Signing bonus instead of base", "Extra leave / remote days"],
        },
        # A KPI-tied review defers the raise off today's budget and is easy to
        # justify to finance (two of the director's interests) while costing the
        # candidate little — it's tied to their own performance → best chip. A
        # signing bonus is one-off cash that doesn't inflate the salary band, but
        # it trades recurring base for a lump sum → moderate value, moderate cost.
        secondary_issues=[
            SecondaryIssue(
                id="kpi_review",
                label={"ru": "Пересмотр через 6 месяцев по KPI", "en": "6-month review tied to KPIs"},
                keywords={
                    "ru": ["пересмотр", "через 6 месяц", "через полгода", "по kpi", "kpi", "ревью", "пересмотреть", "6 месяц"],
                    "en": ["6-month review", "kpi review", "kpi", "performance review", "revisit in", "review tied", "6 month", "review in six"],
                },
                opp_value=0.75,
                player_cost=0.25,
            ),
            SecondaryIssue(
                id="signing_bonus",
                label={"ru": "Подписной бонус вместо оклада", "en": "Signing bonus instead of base"},
                keywords={
                    "ru": ["подписн", "бонус вместо", "разов бонус", "единоразов", "единовремен бонус", "sign-on"],
                    "en": ["signing bonus", "sign-on", "one-time bonus", "bonus instead of base", "lump sum"],
                },
                opp_value=0.55,
                player_cost=0.45,
            ),
        ],
        briefing={
            "ru": "Цель: ≥ 230 k. Красная линия: 195. Работодатель уважает рыночные данные — используйте объективные критерии, а не эмоции.",
            "en": "Goal: ≥ 230k. Red line: 195. The employer respects market data — use objective criteria, not emotion.",
        },
    ),
    Scenario(
        id="conflict",
        icon="🤝",
        difficulty=4,
        title={"ru": "Конфликт между отделами", "en": "Cross-team Conflict"},
        role={
            "ru": "Вы — тимлид. Соседний отдел сорвал сроки и обвиняет вас. Нужно договориться о плане, сохранив отношения.",
            "en": "You are a team lead. A partner team missed a deadline and blames you. Agree on a plan while keeping the relationship.",
        },
        counterpart=Counterpart(
            name={"ru": "Алексей, руководитель смежного отдела", "en": "Alexey, Partner Team Lead"},
            persona={
                "ru": "Под давлением, раздражён, изначально настроен обвинять.",
                "en": "Under pressure, irritated, starts out blaming.",
            },
            female=False,
            style="tough",
        ),
        headline=Headline(unit={"ru": " дней сдвига", "en": " days of slip"}, dir="lower_is_better"),
        opponent_open=20,
        opponent_reservation=6,
        player_target=5,
        player_reservation=12,
        player_batna=Batna(
            strength=35,
            note={
                "ru": "Эскалация к директору — но это испортит отношения.",
                "en": "Escalate to the director — but it will damage the relationship.",
            },
        ),
        hidden_interests={
            "ru": ["Не выглядеть виноватым перед руководством", "Реальная нехватка людей в его команде", "Сохранить лицо"],
            "en": ["Not look at fault to leadership", "A real staffing shortage on his side", "Save face"],
        },
        interest_topics={
            "ru": ["Разговор с руководством", "Ресурсы команды", "Репутация"],
            "en": ["Leadership pressure", "Team resources", "Reputation"],
        },
        hidden_interest_keywords={
            "ru": [
                ["виноват", "вина", "перед руководств", "выглядеть виноват", "свалить вину", "ответственн за срыв", "кто накосяч"],
                ["нехватк люд", "не хватает люд", "мало люд", "нехватк ресурс", "не хватает рук", "людей не хватает", "штат", "недостаток люд", "не хватает разработ"],
                ["сохранить лицо", "лицо", "репутац", "не потерять лицо", "самолюб", "достоинств"],
            ],
            "en": [
                ["at fault", "blame", "look bad to leadership", "fault", "responsible for the slip", "who dropped the ball"],
                ["staffing", "short-staffed", "not enough people", "headcount", "understaffed", "shortage of people"],
                ["save face", "face", "reputation", "pride", "dignity"],
            ],
        },
        tradeoffs={
            "ru": ["Совместный статус для руководства", "Временно поделиться ресурсом", "Переразбить объём работ"],
            "en": ["Joint status update to leadership", "Temporarily share a resource", "Re-scope the workload"],
        },
        # A joint status update lets Alexey avoid looking at fault AND save face
        # (two of his three interests) at almost no cost to you — the ideal chip.
        # Sharing a resource genuinely eases his staffing shortage but costs you a
        # real body on your own deadline → moderate value, moderate cost.
        secondary_issues=[
            SecondaryIssue(
                id="joint_status",
                label={"ru": "Совместный статус для руководства", "en": "Joint status to leadership"},
                keywords={
                    "ru": ["совместный статус", "совместно доложим", "совместно отчита", "общий статус",
                           "статус для руководств", "статус руководству", "вместе доложим", "вместе отчита",
                           "доложим вместе", "совместный отчет", "совместно перед руководств"],
                    "en": ["joint status", "status to leadership", "status update to leadership",
                           "report together", "joint update", "update leadership together", "joint report",
                           "present together to leadership"],
                },
                opp_value=0.8,
                player_cost=0.2,
            ),
            SecondaryIssue(
                id="share_resource",
                label={"ru": "Временно поделиться ресурсом", "en": "Temporarily share a resource"},
                keywords={
                    "ru": ["поделит ресурс", "поделюсь ресурс", "поделиться ресурс", "выделю человек",
                           "выделить человек", "выделю ресурс", "временно ресурс", "дам человек",
                           "дам разработчик", "подкину ресурс", "поделимся людьми", "выделю людей",
                           "временно поделит"],
                    "en": ["share a resource", "share resource", "lend a person", "temporarily share",
                           "spare a person", "loan a developer", "share people", "share a developer"],
                },
                opp_value=0.55,
                player_cost=0.45,
            ),
        ],
        # Бриф называет цель и красную линию, как на семи других столах, И
        # честно предупреждает: цель тут АМБИЦИОЗНЕЕ того, на что Алексей
        # способен (его дно — 6 дней). Молчать об этом нельзя (принцип 2):
        # человек, который считает 5 дней достижимыми, весь стол принимает
        # неизбежное за собственную неудачу. Числа дна бриф не называет — его
        # ещё надо нащупать.
        briefing={
            "ru": "Ваша цель — сдвиг не больше 5 дней, красная линия — 12. Цель намеренно амбициозна: возможно, столько Алексей дать не сможет, и тогда выигрыш — выжать из него максимум возможного. Здесь деньги ни при чём — важны эмоции и интересы. Отделите человека от проблемы, признайте его давление, ищите общий план.",
            "en": "Your target is a slip of no more than 5 days; your red line is 12. The target is deliberately ambitious: Alexey may not be able to go that far, and then winning means getting the most he can give. This is not about money — it is about emotion and interests. Separate the person from the problem, acknowledge his pressure, find a shared plan.",
        },
    ),
    Scenario(
        id="investor",
        icon="🚀",
        difficulty=5,
        title={"ru": "Раунд с инвестором", "en": "Investor Term Sheet"},
        role={
            "ru": "Вы — фаундер. Инвестор предлагает деньги, но хочет большую долю и жёсткие условия.",
            "en": "You are a founder. The investor offers money but wants a large stake and tough terms.",
        },
        counterpart=Counterpart(
            name={"ru": "Марина, партнёр фонда", "en": "Marina, VC Partner"},
            persona={
                "ru": "Аналитична, жёсткая на цифрах, но ценит сильные BATNA.",
                "en": "Analytical, hard on numbers, respects a strong BATNA.",
            },
            female=True,
            style="analytical",
        ),
        headline=Headline(unit={"ru": "% доли", "en": "% equity"}, dir="lower_is_better"),
        opponent_open=30,
        opponent_reservation=18,
        player_target=15,
        player_reservation=24,
        player_batna=Batna(
            strength=70,
            # Записка называла 20% и НИ ОДНОГО минуса при красной линии 24%:
            # получалось, что фаундер держит на руках предложение лучше
            # собственной красной линии и всё равно торгуется. Тогда красная
            # линия перестаёт что-то значить, а «сильная BATNA» из брифа читается
            # как «просто уйди». Минус назван — рычаг остался рычагом (сила 70),
            # но причина не уходить теперь есть.
            note={
                "ru": "Второй фонд обсуждает 20%, но закроется на два месяца позже и без отраслевой экспертизы.",
                "en": "A second fund is discussing 20%, but it closes two months later and brings no industry expertise.",
            },
        ),
        hidden_interests={
            "ru": ["Мотивированный фаундер с большой долей", "Место в совете директоров", "Скорость закрытия сделки"],
            "en": ["A motivated founder with meaningful equity", "A board seat", "Speed of closing"],
        },
        interest_topics={
            "ru": ["Мотивация фаундера", "Контроль и управление", "Сроки закрытия"],
            "en": ["Founder motivation", "Control and governance", "Closing timeline"],
        },
        hidden_interest_keywords={
            "ru": [
                ["мотивац фаундер", "мотивирован фаундер", "доля фаундер", "мотивац основател", "большая доля", "мотивирован основ", "заинтересован фаундер", "мотивац команд"],
                ["совет директор", "место в совете", "борд", "войти в совет", "кресло в совете", "правлен", "контроль над"],
                ["скорост закрыт", "быстро закрыть", "скорее закр", "сроки закрыт", "быстро закрыть раунд", "скорост сделк", "как быстро закр"],
            ],
            "en": [
                ["motivated founder", "founder equity", "founder motivation", "meaningful equity", "skin in the game"],
                ["board seat", "board", "seat on the board", "governance", "board control"],
                ["speed of closing", "close quickly", "closing speed", "how fast", "time to close", "close fast"],
            ],
        },
        tradeoffs={
            "ru": ["Место в совете вместо доли", "Транши по метрикам", "Pro-rata права в следующем раунде"],
            "en": ["Board seat instead of equity", "Tranches tied to milestones", "Pro-rata rights next round"],
        },
        # A board seat is exactly one of Marina's stated interests and lets her
        # trade down on equity while keeping the founder motivated — cheap for you,
        # highly valuable to her. Milestone tranches de-risk her check but tie up
        # your runway → moderate value, moderate cost.
        secondary_issues=[
            SecondaryIssue(
                id="board_seat",
                label={"ru": "Место в совете директоров", "en": "Board seat"},
                keywords={
                    "ru": ["место в совете", "место в борде", "кресло в совете", "совет директор",
                           "войти в совет", "войдете в совет", "место в правлении", "дам место в совете",
                           "место в board"],
                    "en": ["board seat", "seat on the board", "board observer", "place on the board",
                           "join the board", "seat in the board"],
                },
                opp_value=0.8,
                player_cost=0.2,
            ),
            SecondaryIssue(
                id="tranches",
                label={"ru": "Транши по метрикам", "en": "Milestone tranches"},
                keywords={
                    "ru": ["транш", "по метрикам", "по вехам", "по milestone", "поэтапн финансир",
                           "деньги траншами", "выплаты по метрикам", "привязать к метрикам",
                           "финансирование траншами"],
                    "en": ["tranche", "tied to milestones", "milestone-based", "staged funding",
                           "in tranches", "milestone tranches"],
                },
                opp_value=0.55,
                player_cost=0.45,
            ),
        ],
        # Та же честность, что и на `conflict`: цель 15% лежит за дном Марины
        # (18%), и без предупреждения безупречная игра читается как провал.
        briefing={
            "ru": "Ваша цель — отдать не больше 15% доли, красная линия — 24%. Цель намеренно амбициозна: возможно, так низко Марина не опустится, и тогда выигрыш — забрать лучшее из возможного. Сильный BATNA — ваш козырь, но применяйте его аккуратно, подкрепляя объективными критериями оценки.",
            "en": "Your target is to give up no more than 15% equity; your red line is 24%. The target is deliberately ambitious: Marina may not go that low, and then winning means taking the best that is on offer. A strong BATNA is your trump card, but wield it carefully, backed by objective valuation criteria.",
        },
    ),
    Scenario(
        id="rent",
        icon="🏠",
        difficulty=2,
        title={"ru": "Аренда квартиры", "en": "Apartment Rent"},
        role={
            "ru": "Вы — арендатор. Хотите снизить месячную арендную плату, не потеряв удачную квартиру.",
            "en": "You are a tenant. You want to lower the monthly rent without losing a great flat.",
        },
        counterpart=Counterpart(
            name={"ru": "Наталья, собственница", "en": "Natalia, the Landlady"},
            persona={
                "ru": "Доброжелательная, боится проблемных жильцов, ценит порядочность и спокойствие.",
                "en": "Warm, wary of troublesome tenants, values decency and a quiet life.",
            },
            female=True,
            style="relationship",
        ),
        headline=Headline(unit={"ru": "k ₽/мес", "en": "k/mo"}, dir="lower_is_better"),
        opponent_open=75,
        opponent_reservation=62,
        player_target=64,
        player_reservation=70,
        player_batna=Batna(
            strength=45,
            note={
                "ru": "Похожая квартира за 68, но на 40 минут дальше от работы.",
                "en": "A similar flat at 68, but 40 minutes farther from work.",
            },
        ),
        hidden_interests={
            "ru": [
                "Избежать простоя и пустых месяцев",
                "Аккуратный, тихий жилец без хлопот",
                "Стабильная оплата точно в срок",
            ],
            "en": [
                "Avoid vacancy and empty months",
                "A tidy, quiet tenant with no hassle",
                "Reliable payment exactly on time",
            ],
        },
        interest_topics={
            # «Vacancy», а не «Finding tenants», и это не вкусовщина. Основы для
            # сравнения выводятся из САМОГО ярлыка, и «tenants» давало основу
            # «tenan», которая перехватывала половину словаря СОСЕДНЕГО интереса:
            # «quiet tenant», «tidy tenant», «reliable tenant», «decent tenant» —
            # четыре слова из семи — вскрывали простой вместо тишины. Спросив
            # по-английски про жильца, игрок получал секрет, о котором не
            # спрашивал. По-русски «жильцов» и «жилец» расходятся морфологией,
            # поэтому дефект был только на одном языке — и только перебором
            # словаря целиком он и виден (tools/scenario_audit.py).
            "ru": ["Поиск жильцов", "Тишина и порядок", "Оплата"],
            "en": ["Vacancy", "Peace and quiet", "Payments"],
        },
        hidden_interest_keywords={
            "ru": [
                ["простой", "пуст месяц", "без жильц", "простаива", "пустует", "не пустовал", "чтобы не пустовал", "поиск жильц"],
                ["аккуратн жилец", "тих жилец", "без хлопот", "порядочн", "спокойн жилец", "надежн жилец", "проблемн жилец", "не буду шум", "тишин"],
                ["оплата в срок", "точно в срок", "вовремя плат", "стабильн оплат", "платить вовремя", "без задержек оплат", "исправно плат", "задержк оплат"],
            ],
            "en": [
                ["vacancy", "empty months", "sit empty", "vacant", "no tenant", "gap between tenants"],
                ["quiet tenant", "tidy tenant", "no hassle", "reliable tenant", "no trouble", "decent tenant", "noise"],
                ["on time", "pay on time", "reliable payment", "timely payment", "pay promptly", "never late"],
            ],
        },
        tradeoffs={
            "ru": ["Договор на 11+ месяцев", "Депозит за 2 месяца вперёд", "Мелкий ремонт беру на себя"],
            "en": ["Sign an 11+ month lease", "Two months' deposit upfront", "Handle minor repairs myself"],
        },
        # A long lease directly removes Natalia's biggest fear — vacancy and empty
        # months — and costs the tenant nothing (they want to stay anyway): the
        # ideal chip. A two-month deposit reassures her on reliable payment but ties
        # up the tenant's cash → moderate value, moderate cost.
        secondary_issues=[
            SecondaryIssue(
                id="long_lease",
                label={"ru": "Договор на 11+ месяцев", "en": "11+ month lease"},
                keywords={
                    "ru": ["договор на 11", "на 11 месяц", "длительн договор", "долгосрочн аренд",
                           "долгий срок", "на год аренд", "год аренд", "останусь на год", "подпишу на 11",
                           "длинн договор", "договор надолго", "на длительн срок"],
                    "en": ["11-month lease", "11 month lease", "long lease", "long-term lease",
                           "sign for a year", "stay for a year", "longer lease", "year lease"],
                },
                opp_value=0.8,
                player_cost=0.2,
            ),
            SecondaryIssue(
                id="deposit",
                label={"ru": "Депозит за 2 месяца вперёд", "en": "Two months' deposit"},
                keywords={
                    "ru": ["депозит", "залог", "два месяца вперед", "оплата вперед", "депозит за 2",
                           "залог за два месяца", "заплачу вперед", "внесу депозит", "аванс за два месяца"],
                    "en": ["deposit", "two months upfront", "two-month deposit", "pay upfront",
                           "advance rent", "security deposit"],
                },
                opp_value=0.55,
                player_cost=0.45,
            ),
        ],
        briefing={
            "ru": "Цель: ≤ 64 k. Красная линия: 70. Для собственницы деньги — не всё: спросите, что её беспокоит, и предложите то, что снимет её тревоги.",
            "en": "Goal: ≤ 64k. Red line: 70. Money isn't everything to her — ask what worries her and offer what removes those worries.",
        },
    ),
    Scenario(
        id="used_car",
        icon="🚗",
        difficulty=3,
        title={"ru": "Покупка авто с рук", "en": "Buying a Used Car"},
        role={
            "ru": "Вы — покупатель. Торгуетесь с частным продавцом, чтобы сбить цену на подержанный автомобиль.",
            "en": "You are the buyer, haggling with a private seller to bring down the price of a used car.",
        },
        counterpart=Counterpart(
            name={"ru": "Сергей, продавец", "en": "Sergey, the Seller"},
            persona={
                "ru": "Упрямый, слегка на нервах, привязан к машине и не терпит, когда её ругают.",
                "en": "Stubborn, a bit on edge, attached to the car and hates hearing it trashed.",
            },
            female=False,
            style="tough",
        ),
        headline=Headline(unit={"ru": "k ₽", "en": "k"}, dir="lower_is_better"),
        opponent_open=1200,
        opponent_reservation=1040,
        player_target=1060,
        player_reservation=1130,
        player_batna=Batna(
            strength=50,
            note={
                "ru": "Такая же модель за 1150, но с большим пробегом.",
                "en": "The same model at 1150, but with higher mileage.",
            },
        ),
        hidden_interests={
            "ru": [
                "Нужны деньги быстро — уже присмотрел новую машину",
                "Хочет отдать авто в надёжные руки",
                "Устал от смотрящих без намерений — нужен серьёзный покупатель",
            ],
            "en": [
                "Needs the cash fast — already eyeing a new car",
                "Wants the car to go to a caring owner",
                "Tired of tire-kickers — wants a serious buyer",
            ],
        },
        interest_topics={
            "ru": ["Сроки продажи", "Будущий владелец", "Ваш покупатель"],
            "en": ["Sale timing", "The next owner", "The buyer"],
        },
        hidden_interest_keywords={
            "ru": [
                ["деньги быстро", "нужны деньги", "срочно деньги", "быстро продать", "нужны средства", "деньги срочно", "как быстро нужны деньги", "новую машину", "торопитесь продать"],
                ["надежн руки", "хорош руки", "заботит машин", "берег машин", "хорош хозяин", "ухаживать за машин", "любит машин", "в добрые руки"],
                ["серьезн покупател", "без намерен", "смотрящ", "устал показыв", "реальн покупател", "не просто смотр", "намерен купить", "серьезно настроен"],
            ],
            "en": [
                ["cash fast", "need the money", "quick sale", "need cash", "sell quickly", "money soon", "new car"],
                ["good hands", "caring owner", "look after the car", "take care of the car", "good home for the car"],
                ["serious buyer", "tire-kicker", "tire kicker", "just looking", "real buyer", "genuine buyer"],
            ],
        },
        tradeoffs={
            "ru": ["Оплата наличными сразу и полностью", "Оформление перерегистрации беру на себя", "Забираю в течение 2 дней"],
            "en": ["Pay cash in full today", "I handle the re-registration paperwork", "Pick it up within 2 days"],
        },
        # Cash in full today serves Sergey's top need (fast money) and proves you're
        # the serious buyer he's tired of missing — cheap for a buyer who's buying
        # anyway. Handling the re-registration paperwork is a convenience for him but
        # real hassle/cost for you → moderate value, moderate cost.
        secondary_issues=[
            SecondaryIssue(
                id="cash_now",
                label={"ru": "Оплата наличными сразу", "en": "Cash in full today"},
                keywords={
                    "ru": ["налич", "оплачу сразу", "оплата сразу", "заплачу сегодня", "всю сумму сразу",
                           "полностью сразу", "деньги сразу", "оплата полностью", "рассчитаюсь сегодня",
                           "оплачу полностью", "всю сумму сегодня"],
                    "en": ["cash", "pay in full today", "pay today", "full amount now", "pay cash",
                           "cash in full"],
                },
                opp_value=0.8,
                player_cost=0.2,
            ),
            SecondaryIssue(
                id="paperwork",
                label={"ru": "Перерегистрацию беру на себя", "en": "I handle the paperwork"},
                keywords={
                    "ru": ["переоформл", "перерегистрац", "оформлен беру", "документы беру", "оформлю сам",
                           "оформление на себя", "бумаги оформлю", "займусь оформлением",
                           "перерегистрацию беру", "документы на себя"],
                    "en": ["re-registration", "reregistration", "paperwork", "handle the paperwork",
                           "registration myself", "transfer paperwork"],
                },
                opp_value=0.55,
                player_cost=0.45,
            ),
        ],
        briefing={
            "ru": "Цель: ≤ 1060 k. Красная линия: 1130. Он на взводе — критика машины только поднимет напряжение. Узнайте, почему он продаёт, и дайте ему скорость и уверенность вместо давления.",
            "en": "Goal: ≤ 1060k. Red line: 1130. He's tense — bashing the car only raises the heat. Find out why he's selling and offer speed and certainty instead of pressure.",
        },
    ),
    Scenario(
        id="freelance_rate",
        icon="💻",
        difficulty=4,
        title={"ru": "Ставка фрилансера", "en": "Freelance Rate"},
        role={
            "ru": "Вы — независимый разработчик. Хотите поднять дневную ставку по проекту для стартапа.",
            "en": "You are an independent developer. You want to raise your project day rate with a startup.",
        },
        counterpart=Counterpart(
            name={"ru": "Павел, основатель стартапа", "en": "Pavel, Startup Founder"},
            persona={
                "ru": "Считает каждый рубль, мыслит юнит-экономикой, убеждается цифрами, а не эмоциями.",
                "en": "Counts every ruble, thinks in unit economics, persuaded by numbers, not emotion.",
            },
            female=False,
            style="analytical",
        ),
        headline=Headline(unit={"ru": "k ₽/день", "en": "k/day"}, dir="higher_is_better"),
        opponent_open=12,
        opponent_reservation=20,
        player_target=19,
        player_reservation=14,
        player_batna=Batna(
            strength=55,
            note={
                "ru": "Есть другой клиент на 16/день, но скучная поддержка легаси.",
                "en": "Another client at 16/day, but dull legacy maintenance.",
            },
        ),
        hidden_interests={
            "ru": [
                "Предсказуемый бюджет без перерасхода",
                "Успеть к раунду инвестиций — важна скорость",
                "Сеньорная экспертиза, чтобы не переделывать",
            ],
            "en": [
                "A predictable budget with no overruns",
                "Ship before the funding round — speed matters",
                "Senior expertise so nothing gets reworked",
            ],
        },
        interest_topics={
            "ru": ["Бюджет проекта", "Сроки и запуск", "Уровень команды"],
            "en": ["The budget", "Timeline and launch", "Team seniority"],
        },
        hidden_interest_keywords={
            "ru": [
                ["предсказуем бюджет", "без перерасход", "перерасход", "уложиться в бюджет", "не выйти за бюджет", "предсказуем стоимост", "контроль бюджет", "юнит-экономик"],
                ["к раунду", "раунд инвестиц", "успеть к", "важна скорость", "быстрее запуст", "успеть к сроку", "скорее релиз", "до раунда"],
                ["сеньор", "экспертиз", "не переделыв", "качеств кода", "опыт разработ", "квалификац", "чтобы не переделыв", "senior"],
            ],
            "en": [
                ["predictable budget", "no overruns", "overrun", "budget certainty", "stay in budget", "budget predictab", "unit economics"],
                ["funding round", "ship before", "speed matters", "time to market", "before the round", "ship fast"],
                ["senior expertise", "senior", "rework", "not redo", "quality code", "experience so nothing"],
            ],
        },
        tradeoffs={
            "ru": ["Фикс-прайс за чётко очерченный этап", "Приоритетная доступность и сжатые сроки", "Документация и передача знаний команде"],
            "en": ["Fixed price for a clearly scoped phase", "Priority availability and a tighter timeline", "Documentation and knowledge transfer to the team"],
        },
        # A fixed price for a scoped phase kills Pavel's top fear — budget overruns —
        # and for a senior dev, scoping is cheap: the ideal chip. Priority
        # availability and a tighter timeline serve his speed-to-funding need but
        # cost you flexibility with other clients → moderate value, moderate cost.
        secondary_issues=[
            SecondaryIssue(
                id="fixed_price",
                label={"ru": "Фикс-прайс за этап", "en": "Fixed price per phase"},
                keywords={
                    "ru": ["фикс-прайс", "фикс прайс", "фиксированн цен", "фиксированн стоимост",
                           "фикс за этап", "фиксированный бюджет", "фикс на этап", "по фиксу",
                           "фиксирую цену", "оценка за этап", "фиксированная оценка"],
                    "en": ["fixed price", "fixed-price", "fixed cost", "fixed scope", "flat fee",
                           "fixed bid"],
                },
                opp_value=0.8,
                player_cost=0.2,
            ),
            SecondaryIssue(
                id="priority_timeline",
                label={"ru": "Приоритет и сжатые сроки", "en": "Priority & tighter timeline"},
                keywords={
                    "ru": ["приоритетн доступ", "сжат срок", "сжатые сроки", "приоритет по времени",
                           "быстрее срок", "приоритетн", "жест срок", "плотный график",
                           "буду доступен приоритетно", "ускор срок"],
                    "en": ["priority availability", "tighter timeline", "faster timeline",
                           "priority access", "tight deadline", "compressed timeline"],
                },
                opp_value=0.55,
                player_cost=0.45,
            ),
        ],
        briefing={
            "ru": "Цель: ≥ 19 k/день. Красная линия: 14. Он верит цифрам: обоснуйте ставку рыночными данными и своей сеньорностью, снимите его страх перерасхода разменом по объёму и срокам.",
            "en": "Goal: ≥ 19k/day. Red line: 14. He trusts numbers: justify the rate with market data and your seniority, and defuse his overrun fear by trading on scope and timeline.",
        },
    ),
    Scenario(
        id="sla_renewal",
        icon="🛰️",
        difficulty=5,
        title={"ru": "Продление SLA-контракта", "en": "SLA Contract Renewal"},
        role={
            "ru": "Вы — ИТ-директор. Продлеваете контракт с облачным вендором и хотите более высокую гарантию аптайма.",
            "en": "You are an IT director. Renewing a cloud vendor contract, you want a higher uptime guarantee.",
        },
        counterpart=Counterpart(
            name={"ru": "Виктор, вендор", "en": "Viktor, Vendor Account Exec"},
            persona={
                "ru": "Жёсткий переговорщик, защищает маржу, не любит связывать себя строгими штрафами.",
                "en": "A hard bargainer, protects his margin, dislikes binding himself to strict penalties.",
            },
            female=False,
            style="tough",
        ),
        headline=Headline(unit={"ru": "% аптайм", "en": "% uptime"}, dir="higher_is_better"),
        opponent_open=99.0,
        opponent_reservation=99.9,
        player_target=99.8,
        player_reservation=99.4,
        player_batna=Batna(
            strength=60,
            note={
                "ru": "Конкурирующий провайдер даёт 99.7%, но миграция — это риск и время.",
                "en": "A rival provider offers 99.7%, but migration is risk and time.",
            },
        ),
        hidden_interests={
            "ru": [
                "Удержать клиента и многолетнюю выручку",
                "Не брать штрафы, которые не вытянет его команда эксплуатации",
                "Показать руководству рост контракта",
            ],
            "en": [
                "Retain the account and years of recurring revenue",
                "Avoid penalties his ops team can't sustain",
                "Show his leadership the contract grew",
            ],
        },
        interest_topics={
            "ru": ["Продление и выручка", "Штрафы и эксплуатация", "Взгляд руководства"],
            "en": ["Renewal and revenue", "Penalties and operations", "How leadership sees it"],
        },
        hidden_interest_keywords={
            "ru": [
                ["удержать клиент", "многолетн выручк", "сохранить клиент", "долгосрочн выручк", "не потерять клиент", "продлить сотрудни", "лояльн клиент", "удержание"],
                ["штраф", "не вытянет команд", "команда эксплуатац", "пенальти", "жестк штраф", "не потянут штраф", "риск штраф", "команда не справ"],
                # «рост выручк» отсюда убрано: тема ПЕРВОГО интереса — «Продление
                # и выручка», её основа «выруч» стоит выше по списку и забирала
                # это слово себе. Мёртвая запись выглядела как рабочая: словарь
                # богатый, а вскрывался чужой секрет. Выручка на этом столе
                # принадлежит первому интересу, рост контракта — третьему.
                ["рост контракт", "показать руководств", "перед руководств", "увеличить контракт", "нарастить контракт", "апсейл", "рост сделк"],
            ],
            "en": [
                ["retain the account", "recurring revenue", "keep the account", "retain the client", "long-term revenue", "renewal revenue"],
                # «can t sustain» пишется без апострофа НАМЕРЕННО: совпадение
                # ищется в уже нормализованной реплике, а `norm` меняет апостроф
                # на пробел. Запись «can't sustain» не совпадала ни с чем никогда
                # — словарь показывал слово, которого у стола не было.
                ["penalt", "ops team", "can t sustain", "cannot sustain", "operations team", "penalty they can"],
                ["contract grew", "show leadership", "grow the contract", "upsell", "contract growth", "bigger deal"],
            ],
        },
        tradeoffs={
            "ru": ["Продление на 3 года вместо года", "Ступенчатый SLA с ростом по кварталам", "Совместное дежурство и общий план инцидентов"],
            "en": ["A 3-year renewal instead of one", "A phased SLA that ramps up by quarter", "Joint on-call and a shared incident plan"],
        },
        # A 3-year renewal locks in Viktor's recurring revenue and lets him show
        # leadership the contract grew (two interests) at little cost to a client
        # who's staying anyway: the ideal chip. A phased SLA lowers his penalty fear
        # but delays your full uptime benefit → moderate value, moderate cost.
        secondary_issues=[
            SecondaryIssue(
                id="three_year",
                label={"ru": "Продление на 3 года", "en": "3-year renewal"},
                keywords={
                    "ru": ["на 3 года", "на три года", "трехлетн", "три года вместо", "продление на 3",
                           "долгосрочн контракт", "многолетн контракт", "продлим на три", "контракт на 3 года",
                           "продлим на 3 года"],
                    "en": ["3-year", "three-year", "three year", "3 year renewal", "multi-year",
                           "longer term", "renew for three"],
                },
                opp_value=0.8,
                player_cost=0.2,
            ),
            SecondaryIssue(
                id="phased_sla",
                label={"ru": "Ступенчатый SLA", "en": "Phased SLA"},
                keywords={
                    "ru": ["ступенчат", "поэтапн sla", "по кварталам", "рост по кварталам", "постепенн рост",
                           "фазами", "поэтапн внедрен", "наращивать по кварталам", "поэтапно повыш",
                           "ступенчатый sla"],
                    "en": ["phased sla", "phased", "ramp up by quarter", "quarterly ramp", "step up",
                           "gradual sla", "phased rollout"],
                },
                opp_value=0.55,
                player_cost=0.45,
            ),
        ],
        briefing={
            "ru": "Цель: ≥ 99.8%. Красная линия: 99.4%. Он бережёт маржу и боится штрафов — давите объективными критериями (отраслевые SLA, ваши потери от простоя) и снижайте его риск ступенчатым внедрением и длинным контрактом.",
            "en": "Goal: ≥ 99.8%. Red line: 99.4%. He guards his margin and fears penalties — press with objective criteria (industry SLAs, your downtime cost) and lower his risk with a phased rollout and a longer term.",
        },
    ),
    Scenario(
        id="candidate_offer",
        icon="✍️",
        difficulty=2,
        title={"ru": "Оффер сильному кандидату", "en": "Making the Offer"},
        role={
            "ru": "Вы — нанимающий руководитель. Бюджет утверждён с запасом, второго оффера у кандидата нет. Договоритесь так, чтобы он вышел — и остался.",
            "en": "You are the hiring manager. The budget has room, the candidate has no rival offer. Close it so he joins — and stays.",
        },
        counterpart=Counterpart(
            name={"ru": "Тимур, кандидат", "en": "Timur, the Candidate"},
            persona={
                "ru": "Сильный инженер, переезжает с семьёй, второго оффера нет. Открытый и доверчивый, от давления замыкается.",
                "en": "A strong engineer relocating with his family, no rival offer. Open and trusting; pressure makes him shut down.",
            },
            female=False,
            style="relationship",
        ),
        headline=Headline(unit={"ru": "k ₽/мес", "en": "k/mo"}, dir="lower_is_better"),
        # ЕДИНСТВЕННЫЙ стол, где сила у ИГРОКА: дно кандидата (210) лежит далеко
        # НИЖЕ цели (230), а не рядом с ней. Выжать можно — заработать нельзя:
        # `economic` считается от цели и на 230 уже равен 100. Ниже 230 игрок
        # платит отношениями (четверть оценки) буквально ни за что.
        opponent_open=280,
        opponent_reservation=210,
        player_target=230,
        player_reservation=260,
        player_batna=Batna(
            strength=80,
            note={
                "ru": "В финале ещё двое кандидатов, один готов выйти на следующей неделе.",
                "en": "Two more finalists are left; one could start next week.",
            },
        ),
        hidden_interests={
            "ru": [
                "Переезд семьи: жильё и подъёмные",
                "Рост до архитектора, а не поддержка легаси",
                "Уверенность после внезапного сокращения на прошлом месте",
            ],
            "en": [
                "Relocating his family: housing and moving costs",
                "Growth toward architect, not legacy maintenance",
                "Security after being laid off without warning",
            ],
        },
        interest_topics={
            "ru": ["Переезд и жильё", "Карьера и рост", "Стабильность"],
            "en": ["Moving and housing", "Career growth", "Job security"],
        },
        hidden_interest_keywords={
            "ru": [
                ["переезд", "переехать", "релокац", "жиль", "квартир", "подъемн", "семьи", "семьей", "семейн", "перевоз"],
                # «рост» намеренно НЕ ключ: после norm() он подстрока слова
                # «просто», и любая реплика с «просто» вскрывала бы интерес.
                ["архитект", "вырасти", "развива", "развит", "легаси", "карьер", "ментор", "наставник", "стагнац"],
                ["сокращ", "испытательн", "стабильн", "гарант", "увольн", "уволил", "надежн", "уверенност", "не отзов"],
            ],
            "en": [
                ["relocat", "housing", "family", "moving cost", "move his family", "apartment", "settle in"],
                ["architect", "grow", "legacy", "career", "mentor", "stagnat", "senior track"],
                ["laid off", "layoff", "job security", "probation", "guarantee", "let go", "without warning"],
            ],
        },
        tradeoffs={
            "ru": ["Трек до архитектора и наставник", "Подъёмные и жильё на три месяца", "Сокращённый испытательный срок"],
            "en": ["An architect track with a mentor", "A relocation package and housing", "A shortened probation period"],
        },
        # Трек до архитектора стоит компании подписи под планом развития, а для
        # Тимура это причина, по которой он вообще пришёл, — идеальная фишка.
        # Подъёмные и жильё он ценит почти так же, но это живые деньги из того
        # же бюджета: настоящая цена, а не бесплатный жест.
        secondary_issues=[
            SecondaryIssue(
                id="growth_track",
                label={"ru": "Трек до архитектора и наставник", "en": "Architect track with a mentor"},
                keywords={
                    "ru": ["трек до архитект", "архитект", "наставник", "ментор", "план развит",
                           "карьерн трек", "путь до архитект"],
                    "en": ["architect track", "architect", "mentor", "growth plan", "career track",
                           "development plan"],
                },
                opp_value=0.85,
                player_cost=0.15,
            ),
            SecondaryIssue(
                id="relocation",
                label={"ru": "Подъёмные и жильё на три месяца", "en": "Relocation package and housing"},
                keywords={
                    "ru": ["подъемн", "жилье", "релокац", "оплатим переезд", "компенсируем переезд",
                           "переезд за счет"],
                    "en": ["relocation package", "relocation", "housing", "cover the move",
                           "moving costs", "pay for the move"],
                },
                opp_value=0.6,
                player_cost=0.5,
            ),
        ],
        briefing={
            "ru": "Цель: ≤ 230 k ₽/мес. Красная линия: 260 — выше бюджета отдела нет. Сила на вашей стороне: другого оффера у него нет, и он подпишет заметно ниже 230. Только ниже 230 вы не выигрываете ничего, а выжатый на подписи человек уходит в первый год — и позицию вы открываете заново. Спросите, ради чего он идёт, и платите тем, что стоит вам дёшево.",
            "en": "Goal: ≤ 230k/mo. Red line: 260 — the team budget ends there. The power is yours: he has no rival offer and would sign well below 230. But below 230 you win nothing, and a hire squeezed at signing leaves within the year — and you reopen the role. Ask what he is coming for, and pay with what costs you little.",
        },
    ),
]


# -----------------------------------------------------------------------------
# ЗЕРКАЛЬНЫЕ СТОЛЫ — «Обратная сторона стола»
# -----------------------------------------------------------------------------
#
# ЗАЧЕМ. Гарвардский метод стоит на том, что за позицией собеседника лежат
# интересы, и увидеть их — работа. Быстрее всего этому учит не объяснение, а
# пересадка: получить свою красную линию, свои скрытые интересы и своё давление
# и обнаружить, что человек напротив не упрямится, а защищает то, чего ты не
# видишь.
#
# ПОЧЕМУ ЭТО ДАННЫЕ, А НЕ ВТОРОЙ ДВИЖОК. `apply_move` и `score_session` читают
# из сценария РОВНО ТРИНАДЦАТЬ полей, и ни одно из них не знает, кем работает
# игрок: четыре числа, направление и единица шкалы, интересы, темы, ключевые
# слова, вторичные фишки, размены, стиль персоны, сложность, сила BATNA. Вся
# асимметрия «кто здесь игрок» живёт в записи, и список полей заперт тестом
# (`tests/test_other_side.py`). Значит смена стороны — это НОВАЯ ЗАПИСЬ, а
# машина остаётся та же, до последней константы: тот же грейд по той же
# формуле, тот же порог доверия, тот же откат за хамство, тот же потолок
# техники. Оценка зеркального стола сравнима с оценкой обычного не по
# договорённости, а потому что считает её тот же `score_session`.
#
# ПОЧЕМУ ОНИ НЕ В `SCENARIOS`. Библиотека — это девять столов, и её длина
# входит в арифметику «стола дня» (`daily.py`: 9 столов и 4 условия взаимно
# просты, поэтому пара повторяется через 36 дней, а не через 9). Десятый стол в
# списке сдвинул бы расписание всем и сломал бы взаимную простоту. Зеркала —
# отдельный режим, а не пополнение библиотеки, поэтому у них свой список, а
# `by_id` смотрит в оба.
#
# ЧЕТЫРЕ ЧИСЛА КАЖДОГО ЗЕРКАЛА ВЗЯТЫ ИЗ ОРИГИНАЛА, А НЕ ПРИДУМАНЫ:
#
#     дно игрока      ←  дно оппонента оригинала   (её красная линия и была ею)
#     дно оппонента   ←  красная линия игрока      (дальше он не пойдёт)
#
# Придуманы только два: с чего вторая сторона начинает торг (в оригинале её
# первое число называет сам игрок, поэтому в записи его нет) и куда игрок
# метит. Цель ставится ДОСТИЖИМОЙ — за дно оппонента она не заходит, — чтобы
# `best_available` совпал с целью и экономика считалась ровно так же, как на
# семи столах из девяти (`tests/test_unreachable_target.py`).
#
# ЛИЦА. Набора состояний (`frontend/public/avatars/<стол>/`) у новых персон
# нет: он генерируется платной моделью и коммитится. `OpponentFace` молча
# уходит на рисованный портрет — так же, как на «своей сделке». Пустого
# прямоугольника не бывает, и ничего несуществующего экран не обещает.

MIRRORS: list[Scenario] = [
    Scenario(
        id="supplier_mirror",
        mirror_of="supplier",
        icon="🏭",
        difficulty=3,
        title={"ru": "Поставщик: другая сторона", "en": "Supplier: the other side"},
        role={
            "ru": "Вы — глава продаж поставщика. Тот же контракт, что и в «Контракте с поставщиком», только цену теперь защищаете вы.",
            "en": "You are the supplier's head of sales. The same contract as in Supplier Contract — except now the price is yours to defend.",
        },
        counterpart=Counterpart(
            name={"ru": "Родион, менеджер по закупкам", "en": "Rodion, Procurement Manager"},
            persona={
                "ru": "Сухой, считает по таблице, каждую уступку защищает перед финансами.",
                "en": "Dry, works from a spreadsheet, defends every concession to finance.",
            },
            female=False,
            style="analytical",
        ),
        headline=Headline(unit={"ru": "₽/шт", "en": "/unit"}, dir="higher_is_better"),
        opponent_open=76,
        opponent_reservation=92,
        player_target=90,
        player_reservation=84,
        player_batna=Batna(
            strength=45,
            note={
                "ru": "Есть второй заказчик, но объём вдвое меньше и цех недозагружен.",
                "en": "A second buyer exists, but at half the volume — the plant stays idle.",
            },
        ),
        hidden_interests={
            "ru": [
                "Годовой бюджет уже урезан, перерасход защищать у финансового директора",
                "Единственный поставщик — риск, за который его уже наказывали",
                "Линия встаёт через шесть недель, если контракт не подписан",
            ],
            "en": [
                "The annual budget is already cut; any overrun goes to the CFO",
                "A single source is a risk he has been punished for before",
                "The line stops in six weeks unless the contract is signed",
            ],
        },
        interest_topics={
            "ru": ["Бюджет", "Риск поставки", "Сроки запуска"],
            "en": ["Budget", "Supply risk", "Start date"],
        },
        hidden_interest_keywords={
            "ru": [
                ["бюджет", "смет", "перерасход", "лимит", "утвержденн сумм", "экономи", "финансов"],
                ["риск", "единственн", "второй поставщик", "запасной поставщик", "надежност", "подстрахов", "сорв поставк"],
                ["срок", "запуск", "график", "успет", "линия вста", "шесть недель", "остановк"],
            ],
            "en": [
                ["budget", "overrun", "cfo", "finance", "spend limit", "approved amount", "cost centre"],
                ["risk", "single source", "second supplier", "backup supplier", "supply failure", "reliability", "dual source"],
                ["deadline", "start date", "schedule", "when do you need", "in time", "line stops", "six weeks"],
            ],
        },
        tradeoffs={
            "ru": ["Первая отгрузка через две недели", "Платёж двумя кварталами", "Фиксированная цена на год"],
            "en": ["First shipment in two weeks", "Payment split over two quarters", "Price fixed for a year"],
        },
        secondary_issues=[
            SecondaryIssue(
                id="fast_start",
                label={"ru": "Первая отгрузка через две недели", "en": "First shipment in two weeks"},
                keywords={
                    "ru": ["две недел", "быстр отгруз", "отгрузим сраз", "первая партия", "срочн отгруз", "успеем к"],
                    "en": ["two weeks", "fast shipment", "ship immediately", "first batch", "rush the first"],
                },
                opp_value=0.85,
                player_cost=0.2,
            ),
            SecondaryIssue(
                id="split_payment",
                label={"ru": "Платёж двумя кварталами", "en": "Payment split over two quarters"},
                keywords={
                    "ru": ["двумя кварталами", "разобьем платеж", "части платеж", "рассрочк", "оплата частями", "следующ квартал"],
                    "en": ["two quarters", "split the payment", "in instalments", "instalment", "next quarter"],
                },
                opp_value=0.6,
                player_cost=0.45,
            ),
        ],
        briefing={
            "ru": "Цель: цена ≥ 90 ₽/шт. Красная линия: 84 — ниже вы работаете в минус. У закупщика три скрытых интереса, и ни один из них не про цену. Спросите — и он подвинется сам.",
            "en": "Goal: price ≥ 90/unit. Red line: 84 — below that you work at a loss. The buyer has three hidden interests, and none of them is the price. Ask, and he moves on his own.",
        },
    ),
    Scenario(
        id="investor_mirror",
        mirror_of="investor",
        icon="🏦",
        difficulty=5,
        title={"ru": "Инвестор: другая сторона", "en": "Investor: the other side"},
        role={
            "ru": "Вы — партнёр фонда. Тот же раунд, что и в «Раунде с инвестором», только долю теперь защищаете вы.",
            "en": "You are the fund partner. The same round as in Investor Round — except now the stake is yours to defend.",
        },
        counterpart=Counterpart(
            name={"ru": "Кирилл, основатель", "en": "Kirill, founder"},
            persona={
                "ru": "Резкий, держится за контроль, на давление отвечает давлением.",
                "en": "Blunt, clings to control, answers pressure with pressure.",
            },
            female=False,
            style="tough",
        ),
        headline=Headline(unit={"ru": "% доли", "en": "% equity"}, dir="higher_is_better"),
        opponent_open=12,
        opponent_reservation=24,
        player_target=22,
        player_reservation=18,
        player_batna=Batna(
            strength=65,
            note={
                "ru": "В воронке ещё две команды на этот же чек, но обе слабее по рынку.",
                "en": "Two other teams are in the pipeline for the same cheque, both weaker on market.",
            },
        ),
        hidden_interests={
            "ru": [
                "Денег в компании на четыре месяца, раунд нужен до этого",
                "Ключевой инженер уйдёт, если размоется его опцион",
                "Второй фонд уже прислал терм-шит, но требует место в совете",
            ],
            "en": [
                "The company has four months of cash; the round must close before that",
                "The lead engineer walks if his option package is diluted",
                "A second fund has already sent a term sheet, but wants a board seat",
            ],
        },
        interest_topics={
            "ru": ["Сроки закрытия", "Команда и опционы", "Другие инвесторы"],
            "en": ["Closing timeline", "Team and options", "Other investors"],
        },
        hidden_interest_keywords={
            "ru": [
                ["срок", "закрыт", "хватит денег", "деньги на счет", "рануэй", "кассов разрыв", "четыре месяца"],
                ["команд", "опцион", "инженер", "ключев", "размыт", "удержан", "мотиваци"],
                ["другой фонд", "другие инвестор", "терм-шит", "термшит", "альтернативн", "место в совете", "конкурирующ"],
            ],
            "en": [
                ["runway", "how long", "cash left", "when do you need to close", "four months", "burn rate"],
                ["team", "option", "engineer", "key hire", "dilution", "retain", "esop"],
                ["other fund", "other investor", "term sheet", "termsheet", "competing offer", "board seat", "alternative offer"],
            ],
        },
        tradeoffs={
            "ru": ["Закрытие за три недели", "Опционный пул сверх раунда", "Отказ от места в совете"],
            "en": ["Closing in three weeks", "Option pool on top of the round", "No board seat"],
        },
        secondary_issues=[
            SecondaryIssue(
                id="fast_close",
                label={"ru": "Закрытие сделки за три недели", "en": "Closing in three weeks"},
                keywords={
                    "ru": ["три недел", "быстр закр", "закроем сраз", "деньги на следующ недел", "ускор закрыт", "без длинн проверк"],
                    "en": ["three weeks", "close fast", "wire next week", "speed up closing", "skip the long diligence"],
                },
                opp_value=0.85,
                player_cost=0.2,
            ),
            SecondaryIssue(
                id="option_pool",
                label={"ru": "Опционный пул сверх раунда", "en": "Option pool on top of the round"},
                keywords={
                    "ru": ["опционный пул", "пул сверх", "опцион для команд", "пул за наш счет", "не размывая команд"],
                    "en": ["option pool", "pool on top", "pre-money pool", "options for the team", "we take the dilution"],
                },
                opp_value=0.6,
                player_cost=0.45,
            ),
        ],
        briefing={
            "ru": "Цель: доля ≥ 22 %. Красная линия: 18 — ниже фонд не заходит в такой риск. Основатель торгуется жёстко, но не потому, что жадный: у него три причины, и ни одна не названа вслух.",
            "en": "Goal: stake ≥ 22%. Red line: 18 — below that the fund will not take this risk. The founder bargains hard, and not out of greed: he has three reasons, none of them said out loud.",
        },
    ),
    Scenario(
        id="freelance_mirror",
        mirror_of="freelance_rate",
        icon="🧑‍💻",
        difficulty=3,
        title={"ru": "Ставка фрилансера: другая сторона", "en": "Freelance rate: the other side"},
        role={
            "ru": "Вы — основатель стартапа и платите за разработку. Тот же проект, что и в «Ставке фрилансера», только бюджет теперь защищаете вы.",
            "en": "You are the startup founder paying for the work. The same project as in Freelance Rate — except now the budget is yours to defend.",
        },
        counterpart=Counterpart(
            name={"ru": "Егор, независимый разработчик", "en": "Egor, independent developer"},
            persona={
                "ru": "Мягкий, дорожит отношениями, обиду держит молча.",
                "en": "Soft-spoken, values the relationship, holds a grudge quietly.",
            },
            female=False,
            style="relationship",
        ),
        headline=Headline(unit={"ru": "k ₽/день", "en": "k/day"}, dir="lower_is_better"),
        opponent_open=24,
        opponent_reservation=14,
        player_target=16,
        player_reservation=20,
        player_batna=Batna(
            strength=50,
            note={
                "ru": "Есть команда на аутсорсе дешевле, но без опыта в вашем домене.",
                "en": "A cheaper outsourcing team is available, but with no domain experience.",
            },
        ),
        hidden_interests={
            "ru": [
                "Прошлый заказчик задержал оплату на три месяца",
                "Нужен публичный кейс в портфолио, а не безымянная подработка",
                "Параллельно идёт второй проект, и сроки могут наложиться",
            ],
            "en": [
                "His previous client paid three months late",
                "He needs a public case for his portfolio, not anonymous piecework",
                "A second project is running in parallel and the schedules may collide",
            ],
        },
        interest_topics={
            "ru": ["Оплата", "Портфолио", "Загрузка"],
            "en": ["Payment", "Portfolio", "Workload"],
        },
        hidden_interest_keywords={
            "ru": [
                ["оплат", "платеж", "задержк", "постоплат", "предоплат", "вовремя", "счет закрыт"],
                ["портфоли", "кейс", "публичн", "рекомендац", "витрин", "имя автора", "покаж работ"],
                ["загруз", "занят", "параллельн", "второй проект", "график работ", "совмещ", "нагрузк"],
            ],
            "en": [
                ["payment", "paid late", "invoice", "when do you get paid", "net 60", "upfront", "on time"],
                ["portfolio", "case study", "public", "reference", "credit", "showcase", "name on it"],
                ["workload", "busy", "parallel", "second project", "schedule", "how many hours", "overlap"],
            ],
        },
        tradeoffs={
            "ru": ["Оплата раз в неделю", "Публичный кейс с вашим именем", "Гибкий график без ночных релизов"],
            "en": ["Weekly payment", "A public case study with your name", "Flexible schedule, no night releases"],
        },
        secondary_issues=[
            SecondaryIssue(
                id="weekly_pay",
                label={"ru": "Оплата раз в неделю", "en": "Weekly payment"},
                keywords={
                    "ru": ["раз в недел", "еженедельн", "недельн оплат", "плат каждую недел", "без постоплат", "деньги сраз"],
                    "en": ["weekly", "every week", "pay each week", "no net-60", "pay upfront"],
                },
                opp_value=0.85,
                player_cost=0.2,
            ),
            SecondaryIssue(
                id="public_case",
                label={"ru": "Публичный кейс с вашим именем", "en": "A public case study with your name"},
                keywords={
                    "ru": ["публичн", "кейс с вашим имен", "напишем кейс", "в портфолио", "укажем автор"],
                    "en": ["case study", "public case", "you can write it up", "credit you", "in your portfolio"],
                },
                opp_value=0.6,
                player_cost=0.35,
            ),
        ],
        briefing={
            "ru": "Цель: ставка ≤ 16 k ₽/день. Красная линия: 20 — выше проект не окупается. Разработчик держит цену не из принципа: у него три причины, и о них он молчит.",
            "en": "Goal: rate ≤ 16k/day. Red line: 20 — above that the project stops paying off. The developer holds his price for reasons, not out of stubbornness: he has three, and he keeps quiet about them.",
        },
    ),
]

# Runtime registry for generated ("custom") scenarios. These are ephemeral,
# session-scoped, and never mutate the static SCENARIOS catalog.
_RUNTIME: dict[str, Scenario] = {}


def register_runtime_scenario(scenario: Scenario) -> None:
    _RUNTIME[scenario.id] = scenario


def by_id(scenario_id: str) -> Scenario | None:
    # Зеркала ищутся ВТОРЫМИ и живут в своём списке: длина `SCENARIOS` входит в
    # арифметику «стола дня», и десятая запись там сдвинула бы расписание всем.
    for s in SCENARIOS:
        if s.id == scenario_id:
            return s
    for s in MIRRORS:
        if s.id == scenario_id:
            return s
    return _RUNTIME.get(scenario_id)
