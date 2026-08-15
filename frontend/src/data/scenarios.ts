// scenarios.ts — scenario catalog. Ported from legacy-node/public/demo.html (SCEN).
// The rich ScenarioDef carries engine-only fields (open/floor/dir/interests/tradeoffs/style);
// toScenarioView() projects the public, protocol-facing subset (types.ts ScenarioView).
import type { Lang, ScenarioView } from "../types";

export type CounterpartStyle = "relationship" | "analytical" | "tough";
type L = Record<Lang, string>;
type LList = Record<Lang, string[]>;

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
  batna: L;
  interests: LList;
  tradeoffs: LList;
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
    unit: { ru: " ₽", en: "" }, open: 100, floor: 84, target: 86, resv: 92,
    batna: { ru: "Другой поставщик по 95, но с риском качества.", en: "Alternative supplier at 95, with quality risk." },
    interests: {
      ru: ["Стабильная загрузка", "Предоплата / денежный поток", "Долгосрочный контракт"],
      en: ["Stable utilization", "Upfront payment / cash flow", "Long-term contract"],
    },
    tradeoffs: { ru: ["годовой контракт", "предоплату 30%"], en: ["an annual contract", "30% upfront"] },
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
    unit: { ru: "k", en: "k" }, open: 180, floor: 240, target: 230, resv: 195,
    batna: { ru: "Второй оффер на 210, но проект слабее.", en: "A second offer at 210, weaker project." },
    interests: {
      ru: ["Удержать бюджет", "Быстро закрыть позицию", "Обосновать вилку финансам"],
      en: ["Keep the budget", "Close the role fast", "Justify the band to finance"],
    },
    tradeoffs: { ru: ["пересмотр через 6 мес по KPI", "подписной бонус"], en: ["a 6-month KPI review", "a signing bonus"] },
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
    unit: { ru: " дн", en: "d" }, open: 20, floor: 6, target: 5, resv: 12,
    batna: { ru: "Эскалация к директору — но испортит отношения.", en: "Escalate to the director — but it hurts the relationship." },
    interests: {
      ru: ["Не выглядеть виноватым", "Реальная нехватка людей", "Сохранить лицо"],
      en: ["Not look at fault", "A real staffing shortage", "Save face"],
    },
    tradeoffs: {
      ru: ["совместный статус руководству", "временно поделиться ресурсом"],
      en: ["a joint status update", "sharing a resource temporarily"],
    },
    brief: {
      ru: "Деньги ни при чём — важны эмоции. Отделите человека от проблемы, признайте его давление.",
      en: "Not about money — about emotion. Separate the person from the problem, acknowledge his pressure.",
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
    unit: { ru: "%", en: "%" }, open: 30, floor: 18, target: 15, resv: 24,
    batna: { ru: "Второй фонд обсуждает 20% — реальный рычаг.", en: "A second fund is discussing 20% — real leverage." },
    interests: {
      ru: ["Мотивированный фаундер", "Место в совете", "Скорость закрытия"],
      en: ["A motivated founder", "A board seat", "Speed of closing"],
    },
    tradeoffs: { ru: ["место в совете", "транши по метрикам"], en: ["a board seat", "milestone tranches"] },
    brief: {
      ru: "Сильная BATNA — козырь, но применяйте её аккуратно с объективными критериями.",
      en: "A strong BATNA is your trump card — wield it carefully with objective criteria.",
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
