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
