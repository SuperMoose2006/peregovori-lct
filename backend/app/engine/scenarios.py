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
            style="analytical",
        ),
        headline=Headline(unit={"ru": "k ₽/мес", "en": "k/mo"}, dir="higher_is_better"),
        opponent_open=180,
        opponent_reservation=240,
        player_target=230,
        player_reservation=195,
        player_batna=Batna(
            strength=60,
            note={
                "ru": "Есть второй оффер на 210, но менее интересный проект.",
                "en": "A second offer at 210, less interesting project.",
            },
        ),
        hidden_interests={
            "ru": ["Удержать бюджет отдела в рамках", "Быстро закрыть позицию", "Обосновать вилку перед финансами"],
            "en": ["Keep the team budget in bounds", "Close the role quickly", "Justify the band to finance"],
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
            style="tough",
        ),
        headline=Headline(unit={"ru": "дней сдвига", "en": "days of slip"}, dir="lower_is_better"),
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
        tradeoffs={
            "ru": ["Совместный статус для руководства", "Временно поделиться ресурсом", "Переразбить объём работ"],
            "en": ["Joint status update to leadership", "Temporarily share a resource", "Re-scope the workload"],
        },
        briefing={
            "ru": "Здесь деньги ни при чём — важны эмоции и интересы. Отделите человека от проблемы, признайте его давление, ищите общий план.",
            "en": "This is not about money — it is about emotion and interests. Separate the person from the problem, acknowledge his pressure, find a shared plan.",
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
            style="analytical",
        ),
        headline=Headline(unit={"ru": "% доли", "en": "% equity"}, dir="lower_is_better"),
        opponent_open=30,
        opponent_reservation=18,
        player_target=15,
        player_reservation=24,
        player_batna=Batna(
            strength=70,
            note={
                "ru": "Второй фонд обсуждает 20% — реальный рычаг.",
                "en": "A second fund is discussing 20% — real leverage.",
            },
        ),
        hidden_interests={
            "ru": ["Мотивированный фаундер с большой долей", "Место в совете директоров", "Скорость закрытия сделки"],
            "en": ["A motivated founder with meaningful equity", "A board seat", "Speed of closing"],
        },
        tradeoffs={
            "ru": ["Место в совете вместо доли", "Транши по метрикам", "Pro-rata права в следующем раунде"],
            "en": ["Board seat instead of equity", "Tranches tied to milestones", "Pro-rata rights next round"],
        },
        briefing={
            "ru": "Сильный BATNA — ваш козырь, но применяйте его аккуратно, подкрепляя объективными критериями оценки.",
            "en": "A strong BATNA is your trump card, but wield it carefully, backed by objective valuation criteria.",
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
        tradeoffs={
            "ru": ["Договор на 11+ месяцев", "Депозит за 2 месяца вперёд", "Мелкий ремонт беру на себя"],
            "en": ["Sign an 11+ month lease", "Two months' deposit upfront", "Handle minor repairs myself"],
        },
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
        tradeoffs={
            "ru": ["Оплата наличными сразу и полностью", "Оформление перерегистрации беру на себя", "Забираю в течение 2 дней"],
            "en": ["Pay cash in full today", "I handle the re-registration paperwork", "Pick it up within 2 days"],
        },
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
        tradeoffs={
            "ru": ["Фикс-прайс за чётко очерченный этап", "Приоритетная доступность и сжатые сроки", "Документация и передача знаний команде"],
            "en": ["Fixed price for a clearly scoped phase", "Priority availability and a tighter timeline", "Documentation and knowledge transfer to the team"],
        },
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
        tradeoffs={
            "ru": ["Продление на 3 года вместо года", "Ступенчатый SLA с ростом по кварталам", "Совместное дежурство и общий план инцидентов"],
            "en": ["A 3-year renewal instead of one", "A phased SLA that ramps up by quarter", "Joint on-call and a shared incident plan"],
        },
        briefing={
            "ru": "Цель: ≥ 99.8%. Красная линия: 99.4%. Он бережёт маржу и боится штрафов — давите объективными критериями (отраслевые SLA, ваши потери от простоя) и снижайте его риск ступенчатым внедрением и длинным контрактом.",
            "en": "Goal: ≥ 99.8%. Red line: 99.4%. He guards his margin and fears penalties — press with objective criteria (industry SLAs, your downtime cost) and lower his risk with a phased rollout and a longer term.",
        },
    ),
]


# Runtime registry for generated ("custom") scenarios. These are ephemeral,
# session-scoped, and never mutate the static SCENARIOS catalog.
_RUNTIME: dict[str, Scenario] = {}


def register_runtime_scenario(scenario: Scenario) -> None:
    _RUNTIME[scenario.id] = scenario


def by_id(scenario_id: str) -> Scenario | None:
    for s in SCENARIOS:
        if s.id == scenario_id:
            return s
    return _RUNTIME.get(scenario_id)
