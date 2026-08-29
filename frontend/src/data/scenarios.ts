// scenarios.ts — scenario catalog. Ported from backend/app/engine/scenarios.py
// (the source of truth) so the offline mock is at parity with the real engine.
// The rich ScenarioDef carries engine-only fields (open/floor/dir/interests/
// tradeoffs/style/secondaryIssues/hiddenInterestKeywords/batnaStrength);
// toScenarioView() projects the public, protocol-facing subset (types.ts ScenarioView).
import type { Lang, ScenarioView } from "../types";

export type CounterpartStyle = "relationship" | "analytical" | "tough";
type L = Record<Lang, string>;
type LList = Record<Lang, string[]>;

// A structured tradeable secondary issue (mirrors backend SecondaryIssue). Only
// `id`/`label` are public (see toScenarioView); `keywords` drive offline detection
// of the player offering it, and `oppValue`/`playerCost` make cross-issue trading
// a genuine second dimension (mirrors backend opp_value/player_cost):
//   - oppValue  (0..1): how much the OPPONENT wants it → extra price flexibility.
//   - playerCost(0..1): how much conceding it costs the PLAYER's package.
export interface SecondaryIssueDef {
  id: string;
  label: L;
  keywords: LList;
  oppValue: number;
  playerCost: number;
}

export interface ScenarioDef {
  id: string;
  icon: string;
  face: string;
  diff: number;
  dir: "low" | "high"; // "low" = player wants a lower number, "high" = higher
  title: L;
  role: L;
  cp: { nm: L; ps: L; style: CounterpartStyle };
  unit: L;
  open: number;
  floor: number;
  target: number;
  resv: number;
  // BATNA strength (0..100, mirrors backend player_batna.strength). Seeds the
  // opponent's initial leverage meter (× 0.4) exactly like the backend engine.
  batnaStrength: number;
  batna: L;
  interests: LList;
  tradeoffs: LList;
  // Structured logrolling axis (optional). Populated for scenarios that support
  // cross-issue trading — mirrors backend Scenario.secondary_issues.
  secondaryIssues?: SecondaryIssueDef[];
  // Per-interest probe keywords for HONEST offline interest-reveal (mirrors
  // backend hidden_interest_keywords). `lang → list of keyword-lists`, index-
  // aligned with `interests`. A probe whose text matches an unrevealed interest's
  // keywords uncovers THAT interest; a vague probe falls back to next-in-order.
  hiddenInterestKeywords?: Record<Lang, string[][]>;
  // ТЕМЫ переговоров — области, в которых лежат скрытые интересы (зеркало
  // backend Scenario.interest_topics), index-aligned с `interests`. Тема не
  // секрет: она говорит игроку, ГДЕ копать, и молчит о том, что там. Ярлык темы
  // одновременно и чип на столе, и то, по чему движок засчитывает попадание —
  // основы выводятся из самого ярлыка (mock/engine.ts::topicStems).
  interestTopics: Record<Lang, string[]>;
  brief: L;
}

export const SCENARIOS: ScenarioDef[] = [
  {
    id: "supplier", icon: "📦", face: "👩‍💼", diff: 2, dir: "low",
    title: { ru: "Контракт с поставщиком", en: "Supplier Contract" },
    role: {
      ru: "Вы — менеджер по закупкам: снизить цену, не потеряв надёжного поставщика.",
      en: "You are a buyer: cut the price without losing a reliable supplier.",
    },
    cp: {
      nm: { ru: "Ирина, глава продаж", en: "Irina, Head of Sales" },
      ps: { ru: "Опытная, ценит отношения, не любит давление.", en: "Experienced, relationship-oriented, dislikes pressure." },
      style: "relationship",
    },
    unit: { ru: " ₽", en: "" }, open: 100, floor: 84, target: 86, resv: 92, batnaStrength: 55,
    batna: { ru: "Другой поставщик по 95, но с риском качества.", en: "Alternative supplier at 95, with quality risk." },
    interests: {
      ru: ["Стабильная загрузка", "Предоплата / денежный поток", "Долгосрочный контракт"],
      en: ["Stable utilization", "Upfront payment / cash flow", "Long-term contract"],
    },
    hiddenInterestKeywords: {
      ru: [
        ["загрузк", "загруз производ", "стабильн загруз", "простой", "недозагруз", "объем производ", "заполнить производ"],
        ["денежн", "поток", "предоплат", "аванс", "кэшфлоу", "кассов разрыв", "оборотн средств", "деньги вперед", "ликвидн"],
        ["долгосрочн", "годов контракт", "на год", "длительн", "разов сделк", "постоянн сотрудни", "длинн контракт", "надолго"],
      ],
      en: [
        ["utilization", "factory", "capacity", "keep the line", "steady volume", "idle", "load the plant"],
        ["cash flow", "cashflow", "upfront", "prepay", "advance", "working capital", "liquidity"],
        ["long-term", "long term", "one-off", "ongoing", "multi-year", "lasting", "annual contract"],
      ],
    },
    interestTopics: {
      ru: ["Производство", "Оплата", "Срок контракта"],
      en: ["Production", "Payments", "Contract term"],
    },
    tradeoffs: {
      ru: ["годовой контракт", "предоплату 30%", "совместный прогноз спроса"],
      en: ["an annual contract", "30% upfront", "a joint demand forecast"],
    },
    secondaryIssues: [
      {
        id: "annual_contract",
        label: { ru: "Годовой контракт с гарантией объёма", en: "Annual volume commitment" },
        keywords: {
          ru: ["годов", "гарантия объем", "гарантию объем", "объем на год", "долгосрочн", "на год", "длительн контракт", "многолетн"],
          en: ["annual", "volume commitment", "long-term", "long term", "yearly", "multi-year", "year contract"],
        },
        oppValue: 0.85, playerCost: 0.2,
      },
      {
        id: "prepay",
        label: { ru: "Предоплата 30%", en: "30% upfront payment" },
        keywords: {
          ru: ["предоплат", "аванс", "вперед оплат", "оплата вперед", "предоплатим"],
          en: ["upfront", "prepay", "advance payment", "pay in advance", "cash upfront"],
        },
        oppValue: 0.55, playerCost: 0.45,
      },
    ],
    brief: {
      ru: "Цель: ≤86. Красная линия: 92. У поставщика скрытые интересы — вскройте их вопросами.",
      en: "Goal ≤86. Red line 92. The supplier has hidden interests — surface them with questions.",
    },
  },
  {
    id: "salary", icon: "💼", face: "🧔‍♂️", diff: 3, dir: "high",
    title: { ru: "Переговоры о зарплате", en: "Salary Negotiation" },
    role: {
      ru: "У вас есть оффер: повысить компенсацию, не отпугнув работодателя.",
      en: "You have an offer: raise the package without scaring off the employer.",
    },
    cp: {
      nm: { ru: "Дмитрий, директор", en: "Dmitry, Director" },
      ps: { ru: "Прагматичен, уважает рыночные данные.", en: "Pragmatic, respects market data." },
      style: "analytical",
    },
    unit: { ru: "k", en: "k" }, open: 180, floor: 240, target: 230, resv: 195, batnaStrength: 60,
    batna: { ru: "Второй оффер на 210, но проект слабее.", en: "A second offer at 210, but a weaker project." },
    interests: {
      ru: ["Удержать бюджет", "Быстро закрыть позицию", "Обосновать вилку финансам"],
      en: ["Keep the budget", "Close the role fast", "Justify the band to finance"],
    },
    hiddenInterestKeywords: {
      ru: [
        ["бюджет отдел", "бюджет команд", "бюджет в рамк", "рамки бюджет", "бюджет", "перерасход", "фонд оплаты"],
        ["быстро закр", "закрыть позиц", "сроки найм", "быстро выйти", "скорее выйти", "как быстро нужно", "скорее закрыть", "срочно нужен"],
        ["перед финанс", "обоснов вилк", "вилк", "перед финотдел", "объяснить финанс", "согласовать с финанс", "финанс"],
      ],
      en: [
        ["team budget", "budget", "within budget", "budget bounds", "budget cap", "headcount cost"],
        ["close the role", "fill the role", "start quickly", "how soon", "timeline to hire", "fill it quickly"],
        ["finance", "justify the band", "salary band", "band to finance", "cfo", "approve the band"],
      ],
    },
    interestTopics: {
      ru: ["Бюджет отдела", "Сроки найма", "Согласование с финансами"],
      en: ["Team budget", "Hiring timeline", "Finance approval"],
    },
    tradeoffs: {
      ru: ["пересмотр через 6 мес по KPI", "подписной бонус", "доп. отпуск и удалёнку"],
      en: ["a 6-month KPI review", "a signing bonus", "extra leave and remote days"],
    },
    secondaryIssues: [
      {
        id: "kpi_review",
        label: { ru: "Пересмотр через 6 месяцев по KPI", en: "6-month review tied to KPIs" },
        keywords: {
          ru: ["пересмотр", "через 6 месяц", "через полгода", "по kpi", "kpi", "ревью", "пересмотреть", "6 месяц"],
          en: ["6-month review", "kpi review", "kpi", "performance review", "revisit in", "review tied", "6 month", "review in six"],
        },
        oppValue: 0.75, playerCost: 0.25,
      },
      {
        id: "signing_bonus",
        label: { ru: "Подписной бонус вместо оклада", en: "Signing bonus instead of base" },
        keywords: {
          ru: ["подписн", "бонус вместо", "разов бонус", "единоразов", "единовремен бонус", "sign-on"],
          en: ["signing bonus", "sign-on", "one-time bonus", "bonus instead of base", "lump sum"],
        },
        oppValue: 0.55, playerCost: 0.45,
      },
    ],
    brief: {
      ru: "Цель: ≥230k. Красная линия: 195. Опирайтесь на рыночные данные, а не эмоции.",
      en: "Goal ≥230k. Red line 195. Anchor on market data, not emotion.",
    },
  },
  {
    id: "conflict", icon: "🤝", face: "😤", diff: 4, dir: "low",
    title: { ru: "Конфликт между отделами", en: "Cross-team Conflict" },
    role: {
      ru: "Вы — тимлид: смежный отдел сорвал сроки и обвиняет вас. Договоритесь, сохранив отношения.",
      en: "You are a lead: a partner team missed a deadline and blames you. Agree while keeping the relationship.",
    },
    cp: {
      nm: { ru: "Алексей, смежный отдел", en: "Alexey, Partner Lead" },
      ps: { ru: "Под давлением, раздражён, склонен обвинять.", en: "Under pressure, irritated, prone to blame." },
      style: "tough",
    },
    unit: { ru: " дн", en: "d" }, open: 20, floor: 6, target: 5, resv: 12, batnaStrength: 35,
    batna: { ru: "Эскалация к директору — но испортит отношения.", en: "Escalate to the director — but it hurts the relationship." },
    interests: {
      ru: ["Не выглядеть виноватым", "Реальная нехватка людей", "Сохранить лицо"],
      en: ["Not look at fault", "A real staffing shortage", "Save face"],
    },
    hiddenInterestKeywords: {
      ru: [
        ["виноват", "вина", "перед руководств", "выглядеть виноват", "свалить вину", "ответственн за срыв", "кто накосяч"],
        ["нехватк люд", "не хватает люд", "мало люд", "нехватк ресурс", "не хватает рук", "людей не хватает", "штат", "недостаток люд", "не хватает разработ"],
        ["сохранить лицо", "лицо", "репутац", "не потерять лицо", "самолюб", "достоинств"],
      ],
      en: [
        ["at fault", "blame", "look bad to leadership", "fault", "responsible for the slip", "who dropped the ball"],
        ["staffing", "short-staffed", "not enough people", "headcount", "understaffed", "shortage of people"],
        ["save face", "face", "reputation", "pride", "dignity"],
      ],
    },
    interestTopics: {
      ru: ["Разговор с руководством", "Ресурсы команды", "Репутация"],
      en: ["Leadership pressure", "Team resources", "Reputation"],
    },
    tradeoffs: {
      ru: ["совместный статус руководству", "временно поделиться ресурсом", "переразбить объём работ"],
      en: ["a joint status update", "sharing a resource temporarily", "re-scoping the workload"],
    },
    secondaryIssues: [
      {
        id: "joint_status",
        label: { ru: "Совместный статус для руководства", en: "Joint status to leadership" },
        keywords: {
          ru: ["совместный статус", "совместно доложим", "совместно отчита", "общий статус",
               "статус для руководств", "статус руководству", "вместе доложим", "вместе отчита",
               "доложим вместе", "совместный отчет", "совместно перед руководств"],
          en: ["joint status", "status to leadership", "status update to leadership",
               "report together", "joint update", "update leadership together", "joint report",
               "present together to leadership"],
        },
        oppValue: 0.8, playerCost: 0.2,
      },
      {
        id: "share_resource",
        label: { ru: "Временно поделиться ресурсом", en: "Temporarily share a resource" },
        keywords: {
          ru: ["поделит ресурс", "поделюсь ресурс", "поделиться ресурс", "выделю человек",
               "выделить человек", "выделю ресурс", "временно ресурс", "дам человек",
               "дам разработчик", "подкину ресурс", "поделимся людьми", "выделю людей",
               "временно поделит"],
          en: ["share a resource", "share resource", "lend a person", "temporarily share",
               "spare a person", "loan a developer", "share people", "share a developer"],
        },
        oppValue: 0.55, playerCost: 0.45,
      },
    ],
    // Цель (5 дней) стоит ЗА дном Алексея (6): бриф обязан об этом сказать,
    // иначе безупречная игра читается как неудача. Зеркало backend briefing.
    brief: {
      ru: "Цель — сдвиг не больше 5 дней, красная линия — 12. Цель амбициозна: столько Алексей может и не дать. Деньги ни при чём — важны эмоции. Отделите человека от проблемы, признайте его давление.",
      en: "Target: a slip of no more than 5 days; red line 12. The target is ambitious — Alexey may not be able to go that far. Not about money — about emotion. Separate the person from the problem, acknowledge his pressure.",
    },
  },
  {
    id: "investor", icon: "🚀", face: "👩‍💻", diff: 5, dir: "low",
    title: { ru: "Раунд с инвестором", en: "Investor Term Sheet" },
    role: {
      ru: "Вы — фаундер: инвестор хочет большую долю и жёсткие условия.",
      en: "You are a founder: the investor wants a big stake and tough terms.",
    },
    cp: {
      nm: { ru: "Марина, партнёр фонда", en: "Marina, VC Partner" },
      ps: { ru: "Аналитична, жёстка на цифрах, уважает сильную BATNA.", en: "Analytical, hard on numbers, respects a strong BATNA." },
      style: "analytical",
    },
    unit: { ru: "%", en: "%" }, open: 30, floor: 18, target: 15, resv: 24, batnaStrength: 70,
    batna: { ru: "Второй фонд обсуждает 20%, но закроется на два месяца позже.", en: "A second fund is discussing 20%, but it closes two months later." },
    interests: {
      ru: ["Мотивированный фаундер", "Место в совете", "Скорость закрытия"],
      en: ["A motivated founder", "A board seat", "Speed of closing"],
    },
    hiddenInterestKeywords: {
      ru: [
        ["мотивац фаундер", "мотивирован фаундер", "доля фаундер", "мотивац основател", "большая доля", "мотивирован основ", "заинтересован фаундер", "мотивац команд"],
        ["совет директор", "место в совете", "борд", "войти в совет", "кресло в совете", "правлен", "контроль над"],
        ["скорост закрыт", "быстро закрыть", "скорее закр", "сроки закрыт", "быстро закрыть раунд", "скорост сделк", "как быстро закр"],
      ],
      en: [
        ["motivated founder", "founder equity", "founder motivation", "meaningful equity", "skin in the game"],
        ["board seat", "board", "seat on the board", "governance", "board control"],
        ["speed of closing", "close quickly", "closing speed", "how fast", "time to close", "close fast"],
      ],
    },
    interestTopics: {
      ru: ["Мотивация фаундера", "Контроль и управление", "Сроки закрытия"],
      en: ["Founder motivation", "Control and governance", "Closing timeline"],
    },
    tradeoffs: {
      ru: ["место в совете", "транши по метрикам", "pro-rata в следующем раунде"],
      en: ["a board seat", "milestone tranches", "pro-rata rights next round"],
    },
    secondaryIssues: [
      {
        id: "board_seat",
        label: { ru: "Место в совете директоров", en: "Board seat" },
        keywords: {
          ru: ["место в совете", "место в борде", "кресло в совете", "совет директор",
               "войти в совет", "войдете в совет", "место в правлении", "дам место в совете",
               "место в board"],
          en: ["board seat", "seat on the board", "board observer", "place on the board",
               "join the board", "seat in the board"],
        },
        oppValue: 0.8, playerCost: 0.2,
      },
      {
        id: "tranches",
        label: { ru: "Транши по метрикам", en: "Milestone tranches" },
        keywords: {
          ru: ["транш", "по метрикам", "по вехам", "по milestone", "поэтапн финансир",
               "деньги траншами", "выплаты по метрикам", "привязать к метрикам",
               "финансирование траншами"],
          en: ["tranche", "tied to milestones", "milestone-based", "staged funding",
               "in tranches", "milestone tranches"],
        },
        oppValue: 0.55, playerCost: 0.45,
      },
    ],
    // Цель (15%) стоит ЗА дном Марины (18%) — то же предупреждение, что и на
    // `conflict`. Зеркало backend briefing.
    brief: {
      ru: "Цель — отдать не больше 15% доли, красная линия — 24%. Цель амбициозна: так низко Марина может и не опуститься. Сильная BATNA — козырь, но применяйте её аккуратно с объективными критериями.",
      en: "Target: give up no more than 15% equity; red line 24%. The target is ambitious — Marina may not go that low. A strong BATNA is your trump card — wield it carefully with objective criteria.",
    },
  },
  {
    id: "rent", icon: "🏠", face: "👩", diff: 2, dir: "low",
    title: { ru: "Аренда квартиры", en: "Apartment Rent" },
    role: {
      ru: "Вы — арендатор: снизить месячную плату, не потеряв удачную квартиру.",
      en: "You are a tenant: lower the monthly rent without losing a great flat.",
    },
    cp: {
      nm: { ru: "Наталья, собственница", en: "Natalia, the Landlady" },
      ps: { ru: "Доброжелательная, боится проблемных жильцов, ценит порядочность и покой.", en: "Warm, wary of troublesome tenants, values decency and a quiet life." },
      style: "relationship",
    },
    unit: { ru: "k", en: "k" }, open: 75, floor: 62, target: 64, resv: 70, batnaStrength: 45,
    batna: { ru: "Похожая квартира за 68, но на 40 минут дальше от работы.", en: "A similar flat at 68, but 40 minutes farther from work." },
    interests: {
      ru: ["Избежать простоя и пустых месяцев", "Аккуратный, тихий жилец без хлопот", "Стабильная оплата точно в срок"],
      en: ["Avoid vacancy and empty months", "A tidy, quiet tenant with no hassle", "Reliable payment exactly on time"],
    },
    hiddenInterestKeywords: {
      ru: [
        ["простой", "пуст месяц", "без жильц", "простаива", "пустует", "не пустовал", "чтобы не пустовал", "поиск жильц"],
        ["аккуратн жилец", "тих жилец", "без хлопот", "порядочн", "спокойн жилец", "надежн жилец", "проблемн жилец", "не буду шум", "тишин"],
        ["оплата в срок", "точно в срок", "вовремя плат", "стабильн оплат", "платить вовремя", "без задержек оплат", "исправно плат", "задержк оплат"],
      ],
      en: [
        ["vacancy", "empty months", "sit empty", "vacant", "no tenant", "gap between tenants"],
        ["quiet tenant", "tidy tenant", "no hassle", "reliable tenant", "no trouble", "decent tenant", "noise"],
        ["on time", "pay on time", "reliable payment", "timely payment", "pay promptly", "never late"],
      ],
    },
    interestTopics: {
      ru: ["Поиск жильцов", "Тишина и порядок", "Оплата"],
      // «Vacancy», а не «Finding tenants»: основа «tenan» перехватывала «quiet
      // tenant» и ещё три слова СОСЕДНЕГО интереса — вопрос про жильца вскрывал
      // простой. Разбор — в scenarios.py и tools/scenario_audit.py.
      en: ["Vacancy", "Peace and quiet", "Payments"],
    },
    tradeoffs: {
      ru: ["договор на 11+ месяцев", "депозит за 2 месяца вперёд", "мелкий ремонт на себя"],
      en: ["an 11+ month lease", "two months' deposit", "handling minor repairs myself"],
    },
    secondaryIssues: [
      {
        id: "long_lease",
        label: { ru: "Договор на 11+ месяцев", en: "11+ month lease" },
        keywords: {
          ru: ["договор на 11", "на 11 месяц", "длительн договор", "долгосрочн аренд",
               "долгий срок", "на год аренд", "год аренд", "останусь на год", "подпишу на 11",
               "длинн договор", "договор надолго", "на длительн срок"],
          en: ["11-month lease", "11 month lease", "long lease", "long-term lease",
               "sign for a year", "stay for a year", "longer lease", "year lease"],
        },
        oppValue: 0.8, playerCost: 0.2,
      },
      {
        id: "deposit",
        label: { ru: "Депозит за 2 месяца вперёд", en: "Two months' deposit" },
        keywords: {
          ru: ["депозит", "залог", "два месяца вперед", "оплата вперед", "депозит за 2",
               "залог за два месяца", "заплачу вперед", "внесу депозит", "аванс за два месяца"],
          en: ["deposit", "two months upfront", "two-month deposit", "pay upfront",
               "advance rent", "security deposit"],
        },
        oppValue: 0.55, playerCost: 0.45,
      },
    ],
    brief: {
      ru: "Цель: ≤64k. Красная линия: 70. Для собственницы деньги — не всё: спросите, что её беспокоит.",
      en: "Goal ≤64k. Red line 70. Money isn't everything to her — ask what worries her.",
    },
  },
  {
    id: "used_car", icon: "🚗", face: "🧔", diff: 3, dir: "low",
    title: { ru: "Покупка авто с рук", en: "Buying a Used Car" },
    role: {
      ru: "Вы — покупатель: торгуетесь с частным продавцом, чтобы сбить цену.",
      en: "You are the buyer, haggling with a private seller to bring down the price.",
    },
    cp: {
      nm: { ru: "Сергей, продавец", en: "Sergey, the Seller" },
      ps: { ru: "Упрямый, слегка на нервах, привязан к машине и не терпит критики.", en: "Stubborn, a bit on edge, attached to the car and hates hearing it trashed." },
      style: "tough",
    },
    unit: { ru: "k", en: "k" }, open: 1200, floor: 1040, target: 1060, resv: 1130, batnaStrength: 50,
    batna: { ru: "Такая же модель за 1150, но с большим пробегом.", en: "The same model at 1150, but with higher mileage." },
    interests: {
      ru: ["Нужны деньги быстро — присмотрел новую машину", "Хочет отдать авто в надёжные руки", "Устал от смотрящих — нужен серьёзный покупатель"],
      en: ["Needs the cash fast — already eyeing a new car", "Wants the car to go to a caring owner", "Tired of tire-kickers — wants a serious buyer"],
    },
    hiddenInterestKeywords: {
      ru: [
        ["деньги быстро", "нужны деньги", "срочно деньги", "быстро продать", "нужны средства", "деньги срочно", "как быстро нужны деньги", "новую машину", "торопитесь продать"],
        ["надежн руки", "хорош руки", "заботит машин", "берег машин", "хорош хозяин", "ухаживать за машин", "любит машин", "в добрые руки"],
        ["серьезн покупател", "без намерен", "смотрящ", "устал показыв", "реальн покупател", "не просто смотр", "намерен купить", "серьезно настроен"],
      ],
      en: [
        ["cash fast", "need the money", "quick sale", "need cash", "sell quickly", "money soon", "new car"],
        ["good hands", "caring owner", "look after the car", "take care of the car", "good home for the car"],
        ["serious buyer", "tire-kicker", "tire kicker", "just looking", "real buyer", "genuine buyer"],
      ],
    },
    interestTopics: {
      ru: ["Сроки продажи", "Будущий владелец", "Ваш покупатель"],
      en: ["Sale timing", "The next owner", "The buyer"],
    },
    tradeoffs: {
      ru: ["оплату наличными сразу", "перерегистрацию беру на себя", "забрать в течение 2 дней"],
      en: ["cash in full today", "handle the paperwork myself", "picking it up within 2 days"],
    },
    secondaryIssues: [
      {
        id: "cash_now",
        label: { ru: "Оплата наличными сразу", en: "Cash in full today" },
        keywords: {
          ru: ["налич", "оплачу сразу", "оплата сразу", "заплачу сегодня", "всю сумму сразу",
               "полностью сразу", "деньги сразу", "оплата полностью", "рассчитаюсь сегодня",
               "оплачу полностью", "всю сумму сегодня"],
          en: ["cash", "pay in full today", "pay today", "full amount now", "pay cash",
               "cash in full"],
        },
        oppValue: 0.8, playerCost: 0.2,
      },
      {
        id: "paperwork",
        label: { ru: "Перерегистрацию беру на себя", en: "I handle the paperwork" },
        keywords: {
          ru: ["переоформл", "перерегистрац", "оформлен беру", "документы беру", "оформлю сам",
               "оформление на себя", "бумаги оформлю", "займусь оформлением",
               "перерегистрацию беру", "документы на себя"],
          en: ["re-registration", "reregistration", "paperwork", "handle the paperwork",
               "registration myself", "transfer paperwork"],
        },
        oppValue: 0.55, playerCost: 0.45,
      },
    ],
    brief: {
      ru: "Цель: ≤1060k. Красная линия: 1130. Он на взводе — критика машины поднимет напряжение. Узнайте, почему он продаёт.",
      en: "Goal ≤1060k. Red line 1130. He's tense — bashing the car raises the heat. Find out why he's selling.",
    },
  },
  {
    id: "freelance_rate", icon: "💻", face: "🧑‍💻", diff: 4, dir: "high",
    title: { ru: "Ставка фрилансера", en: "Freelance Rate" },
    role: {
      ru: "Вы — независимый разработчик: поднять дневную ставку по проекту для стартапа.",
      en: "You are an independent developer: raise your project day rate with a startup.",
    },
    cp: {
      nm: { ru: "Павел, основатель стартапа", en: "Pavel, Startup Founder" },
      ps: { ru: "Считает каждый рубль, мыслит юнит-экономикой, убеждается цифрами.", en: "Counts every ruble, thinks in unit economics, persuaded by numbers." },
      style: "analytical",
    },
    unit: { ru: "k", en: "k" }, open: 12, floor: 20, target: 19, resv: 14, batnaStrength: 55,
    batna: { ru: "Другой клиент на 16/день, но скучная поддержка легаси.", en: "Another client at 16/day, but dull legacy maintenance." },
    interests: {
      ru: ["Предсказуемый бюджет без перерасхода", "Успеть к раунду — важна скорость", "Сеньорная экспертиза, чтобы не переделывать"],
      en: ["A predictable budget with no overruns", "Ship before the funding round — speed matters", "Senior expertise so nothing gets reworked"],
    },
    hiddenInterestKeywords: {
      ru: [
        ["предсказуем бюджет", "без перерасход", "перерасход", "уложиться в бюджет", "не выйти за бюджет", "предсказуем стоимост", "контроль бюджет", "юнит-экономик"],
        ["к раунду", "раунд инвестиц", "успеть к", "важна скорость", "быстрее запуст", "успеть к сроку", "скорее релиз", "до раунда"],
        ["сеньор", "экспертиз", "не переделыв", "качеств кода", "опыт разработ", "квалификац", "чтобы не переделыв", "senior"],
      ],
      en: [
        ["predictable budget", "no overruns", "overrun", "budget certainty", "stay in budget", "budget predictab", "unit economics"],
        ["funding round", "ship before", "speed matters", "time to market", "before the round", "ship fast"],
        ["senior expertise", "senior", "rework", "not redo", "quality code", "experience so nothing"],
      ],
    },
    interestTopics: {
      ru: ["Бюджет проекта", "Сроки и запуск", "Уровень команды"],
      en: ["The budget", "Timeline and launch", "Team seniority"],
    },
    tradeoffs: {
      ru: ["фикс-прайс за этап", "приоритет и сжатые сроки", "документацию и передачу знаний"],
      en: ["a fixed price per phase", "priority & a tighter timeline", "documentation and knowledge transfer"],
    },
    secondaryIssues: [
      {
        id: "fixed_price",
        label: { ru: "Фикс-прайс за этап", en: "Fixed price per phase" },
        keywords: {
          ru: ["фикс-прайс", "фикс прайс", "фиксированн цен", "фиксированн стоимост",
               "фикс за этап", "фиксированный бюджет", "фикс на этап", "по фиксу",
               "фиксирую цену", "оценка за этап", "фиксированная оценка"],
          en: ["fixed price", "fixed-price", "fixed cost", "fixed scope", "flat fee",
               "fixed bid"],
        },
        oppValue: 0.8, playerCost: 0.2,
      },
      {
        id: "priority_timeline",
        label: { ru: "Приоритет и сжатые сроки", en: "Priority & tighter timeline" },
        keywords: {
          ru: ["приоритетн доступ", "сжат срок", "сжатые сроки", "приоритет по времени",
               "быстрее срок", "приоритетн", "жест срок", "плотный график",
               "буду доступен приоритетно", "ускор срок"],
          en: ["priority availability", "tighter timeline", "faster timeline",
               "priority access", "tight deadline", "compressed timeline"],
        },
        oppValue: 0.55, playerCost: 0.45,
      },
    ],
    brief: {
      ru: "Цель: ≥19k/день. Красная линия: 14. Он верит цифрам: обоснуйте ставку рынком и сеньорностью, снимите страх перерасхода разменом.",
      en: "Goal ≥19k/day. Red line 14. He trusts numbers: justify the rate with market data and seniority, defuse the overrun fear by trading.",
    },
  },
  {
    id: "sla_renewal", icon: "🛰️", face: "🧑‍💼", diff: 5, dir: "high",
    title: { ru: "Продление SLA-контракта", en: "SLA Contract Renewal" },
    role: {
      ru: "Вы — ИТ-директор: продлеваете контракт с облачным вендором и хотите выше гарантию аптайма.",
      en: "You are an IT director: renewing a cloud vendor contract, you want a higher uptime guarantee.",
    },
    cp: {
      nm: { ru: "Виктор, вендор", en: "Viktor, Vendor Account Exec" },
      ps: { ru: "Жёсткий переговорщик, защищает маржу, не любит строгие штрафы.", en: "A hard bargainer, protects his margin, dislikes strict penalties." },
      style: "tough",
    },
    unit: { ru: "%", en: "%" }, open: 99.0, floor: 99.9, target: 99.8, resv: 99.4, batnaStrength: 60,
    batna: { ru: "Конкурент даёт 99.7%, но миграция — риск и время.", en: "A rival provider offers 99.7%, but migration is risk and time." },
    interests: {
      ru: ["Удержать клиента и многолетнюю выручку", "Не брать штрафы, которые не вытянет команда", "Показать руководству рост контракта"],
      en: ["Retain the account and years of revenue", "Avoid penalties his ops team can't sustain", "Show his leadership the contract grew"],
    },
    hiddenInterestKeywords: {
      ru: [
        ["удержать клиент", "многолетн выручк", "сохранить клиент", "долгосрочн выручк", "не потерять клиент", "продлить сотрудни", "лояльн клиент", "удержание"],
        ["штраф", "не вытянет команд", "команда эксплуатац", "пенальти", "жестк штраф", "не потянут штраф", "риск штраф", "команда не справ"],
        ["рост контракт", "показать руководств", "перед руководств", "увеличить контракт", "нарастить контракт", "апсейл", "рост сделк"],
      ],
      en: [
        ["retain the account", "recurring revenue", "keep the account", "retain the client", "long-term revenue", "renewal revenue"],
        ["penalt", "ops team", "can t sustain", "cannot sustain", "operations team", "penalty they can"],
        ["contract grew", "show leadership", "grow the contract", "upsell", "contract growth", "bigger deal"],
      ],
    },
    interestTopics: {
      ru: ["Продление и выручка", "Штрафы и эксплуатация", "Взгляд руководства"],
      en: ["Renewal and revenue", "Penalties and operations", "How leadership sees it"],
    },
    tradeoffs: {
      ru: ["продление на 3 года", "ступенчатый SLA по кварталам", "совместное дежурство"],
      en: ["a 3-year renewal", "a phased SLA by quarter", "joint on-call"],
    },
    secondaryIssues: [
      {
        id: "three_year",
        label: { ru: "Продление на 3 года", en: "3-year renewal" },
        keywords: {
          ru: ["на 3 года", "на три года", "трехлетн", "три года вместо", "продление на 3",
               "долгосрочн контракт", "многолетн контракт", "продлим на три", "контракт на 3 года",
               "продлим на 3 года"],
          en: ["3-year", "three-year", "three year", "3 year renewal", "multi-year",
               "longer term", "renew for three"],
        },
        oppValue: 0.8, playerCost: 0.2,
      },
      {
        id: "phased_sla",
        label: { ru: "Ступенчатый SLA", en: "Phased SLA" },
        keywords: {
          ru: ["ступенчат", "поэтапн sla", "по кварталам", "рост по кварталам", "постепенн рост",
               "фазами", "поэтапн внедрен", "наращивать по кварталам", "поэтапно повыш",
               "ступенчатый sla"],
          en: ["phased sla", "phased", "ramp up by quarter", "quarterly ramp", "step up",
               "gradual sla", "phased rollout"],
        },
        oppValue: 0.55, playerCost: 0.45,
      },
    ],
    brief: {
      ru: "Цель: ≥99.8%. Красная линия: 99.4%. Он бережёт маржу и боится штрафов — давите критериями и снижайте его риск длинным контрактом.",
      en: "Goal ≥99.8%. Red line 99.4%. He guards his margin and fears penalties — press with criteria and lower his risk with a longer term.",
    },
  },
  {
    id: "candidate_offer", icon: "✍️", face: "👨‍💼", diff: 2, dir: "low",
    title: { ru: "Оффер сильному кандидату", en: "Making the Offer" },
    role: {
      ru: "Вы нанимаете: бюджет с запасом, второго оффера у него нет. Пусть выйдет — и останется.",
      en: "You are hiring: the budget has room, he has no rival offer. Make him join — and stay.",
    },
    cp: {
      nm: { ru: "Тимур, кандидат", en: "Timur, the Candidate" },
      ps: { ru: "Сильный инженер, переезжает с семьёй. Открыт, от давления замыкается.", en: "A strong engineer relocating with his family. Open; pressure makes him shut down." },
      style: "relationship",
    },
    unit: { ru: "k", en: "k" }, open: 280, floor: 210, target: 230, resv: 260, batnaStrength: 80,
    batna: { ru: "В финале ещё двое, один выйдет через неделю.", en: "Two more finalists; one could start next week." },
    interests: {
      ru: ["Переезд семьи: жильё и подъёмные", "Рост до архитектора, а не легаси", "Уверенность после внезапного сокращения"],
      en: ["Relocating his family: housing and moving costs", "Growth toward architect, not legacy", "Security after being laid off without warning"],
    },
    hiddenInterestKeywords: {
      ru: [
        ["переезд", "переехать", "релокац", "жиль", "квартир", "подъемн", "семьи", "семьей", "семейн", "перевоз"],
        ["архитект", "вырасти", "развива", "развит", "легаси", "карьер", "ментор", "наставник", "стагнац"],
        ["сокращ", "испытательн", "стабильн", "гарант", "увольн", "уволил", "надежн", "уверенност", "не отзов"],
      ],
      en: [
        ["relocat", "housing", "family", "moving cost", "move his family", "apartment", "settle in"],
        ["architect", "grow", "legacy", "career", "mentor", "stagnat", "senior track"],
        ["laid off", "layoff", "job security", "probation", "guarantee", "let go", "without warning"],
      ],
    },
    interestTopics: {
      ru: ["Переезд и жильё", "Карьера и рост", "Стабильность"],
      en: ["Moving and housing", "Career growth", "Job security"],
    },
    tradeoffs: {
      ru: ["трек до архитектора", "подъёмные на переезд", "сокращённый испытательный срок"],
      en: ["an architect track", "a relocation package", "a shortened probation period"],
    },
    secondaryIssues: [
      {
        id: "growth_track",
        label: { ru: "Трек до архитектора и наставник", en: "Architect track with a mentor" },
        keywords: {
          ru: ["трек до архитект", "архитект", "наставник", "ментор", "план развит",
               "карьерн трек", "путь до архитект"],
          en: ["architect track", "architect", "mentor", "growth plan", "career track",
               "development plan"],
        },
        oppValue: 0.85, playerCost: 0.15,
      },
      {
        id: "relocation",
        label: { ru: "Подъёмные и жильё на три месяца", en: "Relocation package and housing" },
        keywords: {
          ru: ["подъемн", "жилье", "релокац", "оплатим переезд", "компенсируем переезд",
               "переезд за счет"],
          en: ["relocation package", "relocation", "housing", "cover the move",
               "moving costs", "pay for the move"],
        },
        oppValue: 0.6, playerCost: 0.5,
      },
    ],
    brief: {
      ru: "Цель: ≤230k. Красная линия: 260. Он подпишет и ниже, но ниже 230 вы не выигрываете ничего — а выжатый человек уходит в первый год.",
      en: "Goal ≤230k. Red line 260. He would sign for less, but below 230 you win nothing — and a squeezed hire leaves within the year.",
    },
  },
];

export const SCENARIO_MAP: Record<string, ScenarioDef> = Object.fromEntries(
  SCENARIOS.map((s) => [s.id, s]),
);

// Public protocol projection (mirrors backend, which would send this on `greeting`).
export function toScenarioView(def: ScenarioDef, lang: Lang): ScenarioView {
  return {
    id: def.id,
    icon: def.icon,
    difficulty: def.diff,
    title: def.title[lang],
    role: def.role[lang],
    counterpart_name: def.cp.nm[lang],
    counterpart_persona: def.cp.ps[lang],
    headline_unit: def.unit[lang],
    briefing: def.brief[lang],
    batna: def.batna[lang],
    target: def.target,
    reservation: def.resv,
    secondary_issues: (def.secondaryIssues ?? []).map((iss) => ({
      id: iss.id,
      label: iss.label[lang],
    })),
  };
}

// Catalog rows for the ScenarioPicker cards (a real backend would serve this over REST).
export interface CatalogItem {
  id: string;
  icon: string;
  difficulty: number;
  title: string;
  role: string;
}
export function catalog(lang: Lang): CatalogItem[] {
  return SCENARIOS.map((s) => ({
    id: s.id,
    icon: s.icon,
    difficulty: s.diff,
    title: s.title[lang],
    role: s.role[lang],
  }));
}
