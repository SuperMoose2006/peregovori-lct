// customScenario.ts — MockServer's local stand-in for the backend scenario
// generator (backend/app/ai/scenario_gen.py). The real backend asks an LLM to
// design the persona/ZOPA/interests; with no backend running we synthesize a
// plausible, GUARANTEED-PLAYABLE scenario from the user's free-text situation so
// the "Своя сделка" flow demos end-to-end. Keyword heuristics pick a sensible
// unit/direction; the rest is a solid generic template that echoes the situation.
import type { Lang } from "../types";
import type { ScenarioDef } from "../data/scenarios";

type L = Record<Lang, string>;

// One "kind" of deal: its headline unit, bargaining direction and a valid ZOPA.
// Numbers obey the engine's ordering invariant per direction:
//   dir "low"  (player wants a smaller number): floor < target < resv < open
//   dir "high" (player wants a bigger number):  open  < resv   < target < floor
interface DealKind {
  match: RegExp;
  dir: "low" | "high";
  unit: L;
  open: number; floor: number; target: number; resv: number;
}

const KINDS: DealKind[] = [
  {
    // Compensation / salary / rate — player pushes the number UP.
    match: /зарплат|оклад|компенсац|ставк|гонорар|salary|compensation|wage|raise|\brate\b|\bfee\b/i,
    dir: "high", unit: { ru: "k", en: "k" }, open: 180, floor: 250, target: 235, resv: 195,
  },
  {
    // Equity / share / percentage — player wants a SMALLER give-away.
    match: /дол[яию]|процент|%|equity|stake|share|percent|ownership/i,
    dir: "low", unit: { ru: "%", en: "%" }, open: 30, floor: 14, target: 16, resv: 24,
  },
  {
    // Timeline / deadline / days — player wants FEWER days.
    match: /срок|дедлайн|дн[ей|я]|недел|deadline|timeline|\bdays?\b|\bweeks?\b|schedule/i,
    dir: "low", unit: { ru: " дн", en: " d" }, open: 20, floor: 6, target: 8, resv: 14,
  },
];

// Default: a price/cost deal — player wants a LOWER number.
const DEFAULT_KIND: DealKind = {
  match: /.*/, dir: "low", unit: { ru: " ₽", en: "$" }, open: 100, floor: 72, target: 76, resv: 90,
};

function pickKind(text: string): DealKind {
  return KINDS.find((k) => k.match.test(text)) ?? DEFAULT_KIND;
}

// Aggressive wording → a tougher persona; partnership wording → relationship.
function pickStyle(text: string): ScenarioDef["cp"]["style"] {
  if (/ультиматум|давлен|угроз|жёстк|агресс|threat|ultimatum|aggressive|hardball/i.test(text)) return "tough";
  if (/партнёр|долгосроч|отношени|вместе|partner|long-term|relationship|ongoing/i.test(text)) return "relationship";
  return "analytical";
}

function snippet(situation: string, n = 60): string {
  const s = situation.trim().replace(/\s+/g, " ");
  return s.length <= n ? s : s.slice(0, n).replace(/\s+\S*$/, "") + "…";
}

export function synthCustomScenario(situation: string, lang: Lang): ScenarioDef {
  const raw = (situation || "").trim();
  const text = raw || (lang === "ru" ? "переговоры" : "a negotiation");
  const kind = pickKind(text);
  const style = pickStyle(text);
  const snip = snippet(text);

  const title: L = {
    ru: `Своя сделка: ${snip}`,
    en: `Custom deal: ${snip}`,
  };
  const role: L = {
    ru: "Вы отстаиваете свои интересы в описанной ситуации — добейтесь выгодного исхода, сохранив отношения.",
    en: "You are advocating for yourself in the situation you described — secure a good outcome while keeping the relationship.",
  };
  const cp = {
    nm: { ru: "Вторая сторона", en: "The counterpart" } as L,
    ps: {
      ru:
        style === "tough" ? "Напориста, торгуется жёстко, уважает силу аргумента."
        : style === "relationship" ? "Ценит отношения и долгую игру, не любит давления."
        : "Прагматична, опирается на цифры и объективные критерии.",
      en:
        style === "tough" ? "Pushy, bargains hard, respects a strong argument."
        : style === "relationship" ? "Values the relationship and the long game, dislikes pressure."
        : "Pragmatic, leans on numbers and objective criteria.",
    } as L,
    style,
  };
  const brief: L = {
    ru: `Ваша ситуация: «${snip}». Вскройте скрытые интересы второй стороны вопросами, опирайтесь на объективные критерии и создавайте ценность разменом.`,
    en: `Your situation: “${snip}”. Surface the counterpart's hidden interests with questions, anchor on objective criteria and create value by trading.`,
  };

  return {
    id: "custom_mock",
    icon: "🎯",
    face: "🧑‍💼",
    diff: 3,
    dir: kind.dir,
    title,
    role,
    cp,
    unit: kind.unit,
    open: kind.open, floor: kind.floor, target: kind.target, resv: kind.resv,
    batnaStrength: 50,
    batna: {
      ru: "У вас есть запасной вариант — используйте его как рычаг, но аккуратно.",
      en: "You have a fallback option — use it as leverage, but carefully.",
    },
    interests: {
      ru: ["Не потерять лицо и репутацию", "Уложиться в бюджет и сроки", "Сохранить отношения на будущее"],
      en: ["Save face and reputation", "Stay within budget and timeline", "Preserve the relationship for the future"],
    },
    tradeoffs: {
      ru: ["гибкость по срокам", "объём или долгосрочность сотрудничества"],
      en: ["flexibility on timing", "volume or a longer-term commitment"],
    },
    brief,
  };
}
