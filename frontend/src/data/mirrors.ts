// mirrors.ts — ЗЕРКАЛЬНЫЕ СТОЛЫ режима «Обратная сторона стола».
// Ported from services/gateway/app/engine/scenarios.py::MIRRORS (источник истины).
//
// ЗАЧЕМ ОТДЕЛЬНЫЙ ФАЙЛ, А НЕ ХВОСТ scenarios.ts. Две причины, и обе жёсткие.
//
// 1. `SCENARIOS` — это библиотека из девяти столов, и её ДЛИНА входит в
//    арифметику «стола дня» (`lib/daily.ts`: 9 столов и 4 условия взаимно
//    просты, поэтому пара повторяется через 36 дней, а не через 9). Десятая
//    запись в том списке сдвинула бы расписание всем и сломала бы взаимную
//    простоту — ровно так же, как на сервере.
// 2. Критический путь. `data/scenarios.ts` едет на первую отрисовку ради
//    карточек выбора и рейла; зеркала на домашнем экране не нужны никому, кто
//    в режим не нажал. Поэтому сюда ходят только отложенные модули —
//    офлайн-транспорт, переигровка и экран самого режима (`test/lazy.test.ts`).
//
// ЧИСЛА ВЗЯТЫ У ОРИГИНАЛА, А НЕ ПРИДУМАНЫ: дно игрока за зеркалом было дном
// персоны оригинала, дно оппонента — красной линией игрока оригинала. Сверяет
// это `services/gateway/tests/test_other_side.py`, а совпадение двух движков —
// `tests/test_scenario_mirror.py`.
import type { ScenarioDef } from "./scenarios";

export const MIRRORS: ScenarioDef[] = [
  {
    id: "supplier_mirror", mirrorOf: "supplier", icon: "🏭", face: "👨‍💼", diff: 3, dir: "high",
    title: { ru: "Поставщик: другая сторона", en: "Supplier: the other side" },
    role: {
      ru: "Вы — глава продаж поставщика. Тот же контракт, только цену теперь защищаете вы.",
      en: "You are the supplier's head of sales. The same contract — but now the price is yours to defend.",
    },
    cp: {
      nm: { ru: "Родион, менеджер по закупкам", en: "Rodion, Procurement Manager" },
      ps: { ru: "Сухой, считает по таблице, каждую уступку защищает перед финансами.", en: "Dry, works from a spreadsheet, defends every concession to finance." },
      style: "analytical",
    },
    unit: { ru: " ₽", en: "" }, open: 76, floor: 92, target: 90, resv: 84, batnaStrength: 45,
    batna: { ru: "Второй заказчик есть, но объём вдвое меньше.", en: "A second buyer exists, but at half the volume." },
    interests: {
      ru: ["Урезанный бюджет закупки", "Единственный поставщик — риск", "Линия встаёт через шесть недель"],
      en: ["A cut procurement budget", "A single source is a risk", "The line stops in six weeks"],
    },
    hiddenInterestKeywords: {
      ru: [
        ["бюджет", "смет", "перерасход", "лимит", "утвержденн сумм", "экономи", "финансов"],
        ["риск", "единственн", "второй поставщик", "запасной поставщик", "надежност", "подстрахов", "сорв поставк"],
        ["срок", "запуск", "график", "успет", "линия вста", "шесть недель", "остановк"],
      ],
      en: [
        ["budget", "overrun", "cfo", "finance", "spend limit", "approved amount", "cost centre"],
        ["risk", "single source", "second supplier", "backup supplier", "supply failure", "reliability", "dual source"],
        ["deadline", "start date", "schedule", "when do you need", "in time", "line stops", "six weeks"],
      ],
    },
    interestTopics: {
      ru: ["Бюджет", "Риск поставки", "Сроки запуска"],
      en: ["Budget", "Supply risk", "Start date"],
    },
    tradeoffs: {
      ru: ["первую отгрузку через две недели", "платёж двумя кварталами", "фиксированную цену на год"],
      en: ["a first shipment in two weeks", "payment split over two quarters", "a price fixed for a year"],
    },
    secondaryIssues: [
      {
        id: "fast_start",
        label: { ru: "Первая отгрузка через две недели", en: "First shipment in two weeks" },
        keywords: {
          ru: ["две недел", "быстр отгруз", "отгрузим сраз", "первая партия", "срочн отгруз", "успеем к"],
          en: ["two weeks", "fast shipment", "ship immediately", "first batch", "rush the first"],
        },
        oppValue: 0.85, playerCost: 0.2,
      },
      {
        id: "split_payment",
        label: { ru: "Платёж двумя кварталами", en: "Payment split over two quarters" },
        keywords: {
          ru: ["двумя кварталами", "разобьем платеж", "части платеж", "рассрочк", "оплата частями", "следующ квартал"],
          en: ["two quarters", "split the payment", "in instalments", "instalment", "next quarter"],
        },
        oppValue: 0.6, playerCost: 0.45,
      },
    ],
    brief: {
      ru: "Цель: ≥90 ₽/шт. Красная линия: 84 — ниже вы работаете в минус. У закупщика три скрытых интереса, и ни один не про цену.",
      en: "Goal ≥90/unit. Red line 84 — below that you work at a loss. The buyer has three hidden interests, and none of them is the price.",
    },
  },
  {
    id: "investor_mirror", mirrorOf: "investor", icon: "🏦", face: "🧔", diff: 5, dir: "high",
    title: { ru: "Инвестор: другая сторона", en: "Investor: the other side" },
    role: {
      ru: "Вы — партнёр фонда. Тот же раунд, только долю теперь защищаете вы.",
      en: "You are the fund partner. The same round — but now the stake is yours to defend.",
    },
    cp: {
      nm: { ru: "Кирилл, основатель", en: "Kirill, founder" },
      ps: { ru: "Резкий, держится за контроль, на давление отвечает давлением.", en: "Blunt, clings to control, answers pressure with pressure." },
      style: "tough",
    },
    unit: { ru: " %", en: "%" }, open: 12, floor: 24, target: 22, resv: 18, batnaStrength: 65,
    batna: { ru: "В воронке ещё две команды на этот чек, но слабее.", en: "Two other teams are in the pipeline for the same cheque, both weaker." },
    interests: {
      ru: ["Денег на четыре месяца", "Опционы ключевого инженера", "Терм-шит от второго фонда"],
      en: ["Four months of cash left", "The lead engineer's options", "A term sheet from a second fund"],
    },
    hiddenInterestKeywords: {
      ru: [
        ["срок", "закрыт", "хватит денег", "деньги на счет", "рануэй", "кассов разрыв", "четыре месяца"],
        ["команд", "опцион", "инженер", "ключев", "размыт", "удержан", "мотиваци"],
        ["другой фонд", "другие инвестор", "терм-шит", "термшит", "альтернативн", "место в совете", "конкурирующ"],
      ],
      en: [
        ["runway", "how long", "cash left", "when do you need to close", "four months", "burn rate"],
        ["team", "option", "engineer", "key hire", "dilution", "retain", "esop"],
        ["other fund", "other investor", "term sheet", "termsheet", "competing offer", "board seat", "alternative offer"],
      ],
    },
    interestTopics: {
      ru: ["Сроки закрытия", "Команда и опционы", "Другие инвесторы"],
      en: ["Closing timeline", "Team and options", "Other investors"],
    },
    tradeoffs: {
      ru: ["закрытие за три недели", "опционный пул сверх раунда", "отказ от места в совете"],
      en: ["closing in three weeks", "an option pool on top of the round", "no board seat"],
    },
    secondaryIssues: [
      {
        id: "fast_close",
        label: { ru: "Закрытие сделки за три недели", en: "Closing in three weeks" },
        keywords: {
          ru: ["три недел", "быстр закр", "закроем сраз", "деньги на следующ недел", "ускор закрыт", "без длинн проверк"],
          en: ["three weeks", "close fast", "wire next week", "speed up closing", "skip the long diligence"],
        },
        oppValue: 0.85, playerCost: 0.2,
      },
      {
        id: "option_pool",
        label: { ru: "Опционный пул сверх раунда", en: "Option pool on top of the round" },
        keywords: {
          ru: ["опционный пул", "пул сверх", "опцион для команд", "пул за наш счет", "не размывая команд"],
          en: ["option pool", "pool on top", "pre-money pool", "options for the team", "we take the dilution"],
        },
        oppValue: 0.6, playerCost: 0.45,
      },
    ],
    brief: {
      ru: "Цель: ≥22 % доли. Красная линия: 18. Основатель торгуется жёстко не от жадности: у него три причины, и ни одна не названа вслух.",
      en: "Goal ≥22% equity. Red line 18. The founder bargains hard, and not out of greed: he has three reasons, none of them said out loud.",
    },
  },
  {
    id: "freelance_mirror", mirrorOf: "freelance_rate", icon: "🧑‍💻", face: "🧑‍🔧", diff: 3, dir: "low",
    title: { ru: "Ставка фрилансера: другая сторона", en: "Freelance rate: the other side" },
    role: {
      ru: "Вы — основатель стартапа и платите за разработку. Тот же проект, только бюджет теперь защищаете вы.",
      en: "You are the startup founder paying for the work. The same project — but now the budget is yours to defend.",
    },
    cp: {
      nm: { ru: "Егор, независимый разработчик", en: "Egor, independent developer" },
      ps: { ru: "Мягкий, дорожит отношениями, обиду держит молча.", en: "Soft-spoken, values the relationship, holds a grudge quietly." },
      style: "relationship",
    },
    unit: { ru: " k ₽", en: "k" }, open: 24, floor: 14, target: 16, resv: 20, batnaStrength: 50,
    batna: { ru: "Есть аутсорс дешевле, но без опыта в домене.", en: "A cheaper outsourcing team, but with no domain experience." },
    interests: {
      ru: ["Прошлый заказчик задержал оплату", "Нужен публичный кейс в портфолио", "Параллельно идёт второй проект"],
      en: ["His previous client paid three months late", "He needs a public portfolio case", "A second project runs in parallel"],
    },
    hiddenInterestKeywords: {
      ru: [
        ["оплат", "платеж", "задержк", "постоплат", "предоплат", "вовремя", "счет закрыт"],
        ["портфоли", "кейс", "публичн", "рекомендац", "витрин", "имя автора", "покаж работ"],
        ["загруз", "занят", "параллельн", "второй проект", "график работ", "совмещ", "нагрузк"],
      ],
      en: [
        ["payment", "paid late", "invoice", "when do you get paid", "net 60", "upfront", "on time"],
        ["portfolio", "case study", "public", "reference", "credit", "showcase", "name on it"],
        ["workload", "busy", "parallel", "second project", "schedule", "how many hours", "overlap"],
      ],
    },
    interestTopics: {
      ru: ["Оплата", "Портфолио", "Загрузка"],
      en: ["Payment", "Portfolio", "Workload"],
    },
    tradeoffs: {
      ru: ["оплату раз в неделю", "публичный кейс с вашим именем", "гибкий график"],
      en: ["weekly payment", "a public case study with your name", "a flexible schedule"],
    },
    secondaryIssues: [
      {
        id: "weekly_pay",
        label: { ru: "Оплата раз в неделю", en: "Weekly payment" },
        keywords: {
          ru: ["раз в недел", "еженедельн", "недельн оплат", "плат каждую недел", "без постоплат", "деньги сраз"],
          en: ["weekly", "every week", "pay each week", "no net-60", "pay upfront"],
        },
        oppValue: 0.85, playerCost: 0.2,
      },
      {
        id: "public_case",
        label: { ru: "Публичный кейс с вашим именем", en: "A public case study with your name" },
        keywords: {
          ru: ["публичн", "кейс с вашим имен", "напишем кейс", "в портфолио", "укажем автор"],
          en: ["case study", "public case", "you can write it up", "credit you", "in your portfolio"],
        },
        oppValue: 0.6, playerCost: 0.35,
      },
    ],
    brief: {
      ru: "Цель: ≤16 k ₽/день. Красная линия: 20 — выше проект не окупается. Разработчик держит цену не из принципа: причин три, и он о них молчит.",
      en: "Goal ≤16k/day. Red line 20 — above that the project stops paying off. The developer holds his price for reasons, not out of stubbornness: there are three, and he keeps quiet.",
    },
  },
];

export const MIRROR_MAP: Record<string, ScenarioDef> = Object.fromEntries(
  MIRRORS.map((s) => [s.id, s]),
);
