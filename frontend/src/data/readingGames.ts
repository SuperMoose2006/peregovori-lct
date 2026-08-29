// readingGames.ts — материал режима «Чтение стола»: ЧУЖИЕ партии, которые
// человек смотрит по ходам.
//
// НИ ОДНОЙ ПРИДУМАННОЙ РЕПЛИКИ. Всё, что здесь лежит, скопировано слово в слово
// из `frontend/test/fixtures/games.json` — из эталонных партий, которые уже
// читают ОБА движка (`test/games.test.ts` и
// `services/gateway/tests/test_reference_games.py`). Расхождение с фикстурой
// валит сборку: `test/reading.test.ts` сверяет каждую строку посимвольно.
//
// Копия, а не импорт, по одной причине: `test/` не входит в `tsconfig.app.json`
// и в сборку продукта не едет. Тащить фикстуру в бандл значило бы поменять
// местами источник и потребителя — тест начал бы обслуживать приложение.
// Сторож дешевле и честнее.
//
// ЧЕГО ЗДЕСЬ НЕТ — ни грейда, ни счёта, ни реакций. Всё это считает движок на
// лету (`lib/reading.ts`), потому что записанный ответ разошёлся бы с балансом
// молча — ровно та ошибка, ради которой курс не пишут, а доказывают.
//
// ОБЕ ПОЛОВИНЫ ЕСТЬ У ВСЕХ. Раньше лестница качества в фикстуре была
// одноязычной (`ladder.lang: "ru"`), и английский каталог состоял из девяти
// столов против двенадцати русских: англоговорящему были недоступны ровно те
// три партии, ради которых режим и заводился, — один стол, сыгранный тремя
// разными переговорщиками. Теперь лестница двуязычная
// (`ladder.langs: ["ru","en"]`), и её английские реплики не переведены, а
// написаны по-английски и доказаны прогоном движка: порядок качества
// (торг ниже базовой игры, базовая ниже хорошей) держится на обоих языках —
// services/gateway/tests/test_reference_games.py и test/games.test.ts.
// Каталог языка по-прежнему строит `readingGamesFor`.
import type { Lang } from "../types";

export interface ReadingGame {
  id: string;
  /** Стол, на котором игралась партия. */
  scenario: string;
  /** Реплики игрока по языкам. Языка нет — партии нет в его каталоге. */
  lines: Partial<Record<Lang, string[]>>;
}

/** Порядок — педагогический: сперва один стол, сыгранный тремя разными
 *  переговорщиками (лестница качества), затем девять столов принципиальной
 *  линией. Первое учит слышать РАЗНИЦУ, второе — переносить её на новый стол. */
export const READING_GAMES: ReadingGame[] = [
  {
    id: "haggling",
    scenario: "supplier",
    lines: {
      ru: [
        "Наша цена 86.",
        "Мы предлагаем 87, это наша позиция.",
        "Наша цена 88, дальше не пойдём.",
        "Мы предлагаем 89.",
        "Наша цена 90.",
        "Договорились, 90.",
      ],
      en: [
        "Our price is 86.",
        "We propose 87, that is our position.",
        "Our price is 88, we will not go further.",
        "We propose 89.",
        "Our price is 90.",
        "We have a deal at 90.",
      ],
    },
  },
  {
    id: "basic",
    scenario: "supplier",
    lines: {
      ru: [
        "Почему для вас так важна стабильная загрузка производства?",
        "По рыночным данным медиана независимых прайсов 88, потому что это отраслевой стандарт.",
        "Наша цена 88, мы предлагаем сойтись на ней.",
        "Договорились.",
      ],
      en: [
        "Why is steady factory utilization so important to you?",
        "Independent market data puts the median at 88 per unit, because that is the industry standard.",
        "Our price is 88, we propose we settle there.",
        "We have a deal.",
      ],
    },
  },
  {
    id: "good",
    scenario: "supplier",
    lines: {
      ru: [
        "Почему для вас так важна стабильная загрузка производства?",
        "А почему для вас важен денежный поток и предоплата?",
        "По рыночным данным медиана независимых прайсов 87, потому что это отраслевой стандарт.",
        "Если мы дадим предоплату, сможете подвинуться к 87?",
        "Фиксируем пакет: предоплата — и цена 87. Договорились?",
      ],
      en: [
        "Why is steady factory utilization so important to you?",
        "And why are you so focused on cash flow and upfront payment?",
        "Independent market data puts the median at 87 per unit, because that is the industry standard.",
        "If we give you prepay, can you move down to 87?",
        "Let us fix the package: prepay — and a price of 87. Do we have a deal?",
      ],
    },
  },
  {
    id: "supplier",
    scenario: "supplier",
    lines: {
      ru: [
        "Здравствуйте! Почему для вас так важна стабильная загрузка производства?",
        "Понимаю вас. А почему для вас важен денежный поток и предоплата?",
        "Зачем вам разовый заказ, если можно долгосрочный годовой контракт?",
        "По рыночным данным медиана независимых прайсов 86, потому что это отраслевой стандарт.",
        "Если мы дадим годовой контракт с гарантией объёма и предоплату, сможете подвинуться к 86?",
        "Фиксируем пакет: годовой контракт, предоплата — и цена 86. Договорились?",
      ],
      en: [
        "Hello! Why is steady factory utilization so important to you?",
        "I hear you. Why are you so focused on cash flow and upfront payment?",
        "What matters to you more — a one-off order or a long-term annual contract?",
        "Independent market data puts the median at 86 per unit, because that is the industry standard.",
        "If we give you an annual contract with a volume commitment and prepay, can you move down to 86?",
        "Let us fix the package: annual contract, prepay — and a price of 86 per unit. Do we have a deal?",
      ],
    },
  },
  {
    id: "salary",
    scenario: "salary",
    lines: {
      ru: [
        "Почему для вас так важно удержать бюджет отдела в рамках?",
        "Как быстро нужно закрыть позицию и почему именно этот срок?",
        "Почему для вас важно обосновать вилку перед финансами?",
        "По обзору зарплат медиана по этой роли 230, потому что это рыночный стандарт.",
        "Если мы привяжем это к пересмотру по KPI через 6 месяцев, сможете выйти на 230?",
        "Фиксируем пакет: пересмотр по KPI через полгода и оклад 230. Договорились?",
      ],
      en: [
        "Why is it so important to you to keep the team budget within bounds?",
        "Why are you in a hurry to close the role — what is driving that timeline?",
        "What matters to you when you justify the band to finance?",
        "The salary survey puts the median for this role at 230, because that is the market rate.",
        "If we give you a KPI review in six months, can you move to 230?",
        "Let us fix the package: a KPI review in six months — and a base of 230. Do we have a deal?",
      ],
    },
  },
  {
    id: "conflict",
    scenario: "conflict",
    lines: {
      ru: [
        "Почему для вас важно не выглядеть виноватым перед руководством?",
        "Зачем вам сдвиг на три недели, если вам не хватает людей в команде?",
        "Почему для вас важно сохранить лицо в этой истории?",
        "По регламенту сопоставимые задержки закрываются за 5 дней, потому что это отраслевая практика.",
        "Если мы сделаем совместный статус для руководства, сможете уложиться в 5 дней?",
        "Фиксируем пакет: совместный статус руководству — и 5 дней. Договорились?",
      ],
      en: [
        "Why is it important to you not to look at fault in front of leadership?",
        "Why are you asking for three more weeks when you are short-staffed?",
        "What matters to you personally here — your reputation with the team?",
        "By the process guide, comparable slips are closed in 5 days, because that is standard practice.",
        "If we give leadership a joint status update, can you move to 5 days?",
        "Let us fix the package: a joint status update to leadership — and 5 days. Do we have a deal?",
      ],
    },
  },
  {
    id: "investor",
    scenario: "investor",
    lines: {
      ru: [
        "Почему для вас важна мотивация фаундера и его большая доля?",
        "Почему для вас важно место в совете директоров?",
        "Почему для вас важны сроки закрытия раунда?",
        "По сопоставимым раундам на этой стадии медиана 18%, потому что это рыночный стандарт.",
        "Если мы дадим вам место в совете директоров, сможете снизить долю до 18%?",
        "Фиксируем пакет: место в совете директоров — и доля 18%. Договорились?",
      ],
      en: [
        "Why is it important to you that the founder stays motivated with meaningful equity?",
        "Why are you asking for a board seat — what does governance give you here?",
        "What matters to you about the speed of closing this round?",
        "Comparable rounds at this stage price at 18% dilution, because that is the market benchmark.",
        "If we give you a seat on the board, can you move down to 18%?",
        "Let us fix the package: a seat on the board — and 18% equity. Do we have a deal?",
      ],
    },
  },
  {
    id: "rent",
    scenario: "rent",
    lines: {
      ru: [
        "Почему для вас важно, чтобы квартира не пустовала?",
        "Почему для вас важен аккуратный тихий жилец без хлопот?",
        "Почему для вас важна оплата в срок, без задержек?",
        "По рыночным данным сопоставимые квартиры идут по 64, потому что это медиана района.",
        "Если мы подпишем договор на 11 месяцев и внесём депозит, сможете снизить до 64?",
        "Фиксируем пакет: договор на 11 месяцев, депозит — и 64. Договорились?",
      ],
      en: [
        "Why is it important to you to avoid vacancy between tenants?",
        "Why are you looking for a quiet tenant who causes no hassle?",
        "What matters to you about getting the rent paid exactly on time?",
        "Comparable flats in this district go for 64 k, because that is the local market rate.",
        "If we give you an 11-month lease and a deposit upfront, can you move down to 64?",
        "Let us fix the package: an 11-month lease, a deposit — and 64 k a month. Do we have a deal?",
      ],
    },
  },
  {
    id: "used_car",
    scenario: "used_car",
    lines: {
      ru: [
        "Почему для вас важно получить деньги быстро — торопитесь продать?",
        "Почему для вас важно отдать её в добрые руки?",
        "Почему для вас важен серьёзный покупатель, а не смотрящие без намерений?",
        "По рыночным данным медиана по этой модели 1060, потому что это независимые прайсы.",
        "Если мы оплатим всю сумму сразу, сможете уступить до 1060?",
        "Фиксируем пакет: оплатим всю сумму сразу — и 1060. Договорились?",
      ],
      en: [
        "Why is it important to you to get the cash fast — are you eyeing a new car?",
        "Why are you keen for the car to end up in good hands?",
        "What matters to you about finding a serious buyer rather than another tire-kicker?",
        "Independent listings put the median for this model at 1060 k, because that is the market price.",
        "If we give you the full amount in cash today, can you move down to 1060?",
        "Let us fix the package: the full amount in cash today — and 1060. Do we have a deal?",
      ],
    },
  },
  {
    id: "freelance_rate",
    scenario: "freelance_rate",
    lines: {
      ru: [
        "Почему для вас важен предсказуемый бюджет без перерасхода?",
        "Почему для вас важно успеть к раунду инвестиций?",
        "Почему для вас важна сеньорная экспертиза, чтобы не переделывать?",
        "По рыночным данным ставка сеньора 19, потому что это медиана независимых обзоров.",
        "Если мы зафиксируем цену за этап по фикс-прайсу, сможете поднять ставку до 19?",
        "Фиксируем пакет: фикс-прайс за этап — и ставка 19. Договорились?",
      ],
      en: [
        "Why is it important to you to have a predictable budget with no overruns?",
        "Why are you pushing to ship before the funding round?",
        "What matters to you about senior expertise so nothing gets reworked?",
        "Independent rate surveys put the senior day rate at 19 k, because that is the market benchmark.",
        "If we give you a fixed price per milestone, can you move to 19?",
        "Let us fix the package: a fixed price per stage — and a rate of 19 k a day. Do we have a deal?",
      ],
    },
  },
  {
    id: "sla_renewal",
    scenario: "sla_renewal",
    lines: {
      ru: [
        "Почему для вас важно удержать клиента и многолетнюю выручку?",
        "Почему для вас важен риск штрафов, которые не вытянет команда эксплуатации?",
        "Почему для вас важно показать руководству рост контракта?",
        "По отраслевому стандарту сопоставимые SLA идут на 99.8, потому что это рыночная практика.",
        "Если мы продлим контракт на 3 года, сможете поднять аптайм до 99.8?",
        "Фиксируем пакет: контракт на 3 года — и аптайм 99.8. Договорились?",
      ],
      en: [
        "Why is it important to you to retain the account and its recurring revenue?",
        "Why are you so worried about penalties your ops team cannot sustain?",
        "What matters to you about showing leadership that the contract grew?",
        "Comparable SLAs in this industry run at 99.8, because that is the market standard.",
        "If we give you a three-year renewal, can you move to 99.8 uptime?",
        "Let us fix the package: a three-year renewal — and 99.8% uptime. Do we have a deal?",
      ],
    },
  },
  {
    id: "candidate_offer",
    scenario: "candidate_offer",
    lines: {
      ru: [
        "Почему для вас важен переезд с семьёй — жильё и подъёмные?",
        "Почему для вас важно вырасти до архитектора, а не сидеть на легаси?",
        "Почему для вас важна уверенность после внезапного сокращения на прошлом месте?",
        "По рынку сеньор вашего уровня стоит 230, потому что это медиана независимых обзоров зарплат.",
        "Если мы дадим трек до архитектора с наставником и закроем переезд подъёмными и жильём, вы выйдете на 230?",
        "Фиксируем пакет: трек до архитектора и наставник, подъёмные на переезд — и оклад 230. Договорились?",
      ],
      en: [
        "What matters to you most about relocating your family — the housing, the moving costs?",
        "Why is it important to you to grow into an architect rather than maintain legacy code?",
        "Why is it important to you to feel secure after being laid off without warning?",
        "The market median for a senior at your level is 230, because that is what the independent salary surveys show.",
        "If we set you on an architect track with a mentor and cover the relocation with a housing package, will you join at 230?",
        "Let us fix the package: an architect track with a mentor, a relocation package — and 230. Do we have a deal?",
      ],
    },
  },
];

/** Каталог одного языка: партии, у которых есть стенограмма на нём. */
export function readingGamesFor(lang: Lang): { id: string; scenario: string; lines: string[] }[] {
  const out: { id: string; scenario: string; lines: string[] }[] = [];
  for (const g of READING_GAMES) {
    const lines = g.lines[lang];
    if (lines) out.push({ id: g.id, scenario: g.scenario, lines });
  }
  return out;
}
