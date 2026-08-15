// engine.ts — deterministic mock negotiation engine.
// Ported from legacy-node/public/demo.html; outputs are shaped to the protocol
// (types.ts): Analysis, Deltas, StateView, Debrief. This lets the MockServer
// behave like the real backend so the full UI works with no server running.
import type { Lang } from "../types";
import type { Analysis, Deltas, Debrief, StateView, Status, Tag } from "../types";
import { LEX, cnt, extractNum, has, norm } from "../lib/techniques";
import type { ScenarioDef } from "../data/scenarios";

const clamp = (v: number, lo = 0, hi = 100): number => Math.max(lo, Math.min(hi, v));

// ---------- analyze ----------
export interface RawAnalysis {
  moves: string[];
  primary: string;
  number: number | null;
  arg: number;
  spin: string | null;
  tags: Tag[];
}

export function analyze(raw: string): RawAnalysis {
  const t = norm(raw);
  const moves = new Set<string>();
  const tags: Tag[] = [];
  const addT = (key: string, label: string) => tags.push({ key, label });
  const q = t.includes("?");
  let spin: string | null = null;
  if (has(t, LEX.spinNeedPayoff)) { spin = "need-payoff"; moves.add("spin_needpayoff"); addT("spin", "SPIN · Need-payoff"); }
  else if (has(t, LEX.spinImplication)) { spin = "implication"; moves.add("spin_implication"); addT("spin", "SPIN · Implication"); }
  else if (has(t, LEX.spinProblem)) { spin = "problem"; moves.add("spin_problem"); addT("spin", "SPIN · Problem"); }
  else if (has(t, LEX.spinSituation)) { spin = "situation"; moves.add("spin_situation"); addT("spin", "SPIN · Situation"); }
  if (has(t, LEX.interestsProbe)) { moves.add("interests_probe"); addT("interests", "Интерес / Interest"); }
  if (has(t, LEX.acknowledge)) { moves.add("acknowledge"); addT("empathy", "Активное слушание"); }
  if (has(t, LEX.objectiveCriteria)) { moves.add("objective_criteria"); addT("criteria", "Объективный критерий"); }
  if (has(t, LEX.batna)) { moves.add("batna"); addT("batna", "BATNA / рычаг"); }
  if (has(t, LEX.tradeoff)) { moves.add("tradeoff"); addT("tradeoff", "Размен"); }
  if (has(t, LEX.threat)) { moves.add("threat"); addT("threat", "Давление"); }
  if (has(t, LEX.hostile)) { moves.add("hostile"); addT("hostile", "Грубость"); }
  if (has(t, LEX.concession)) { moves.add("concession"); addT("concession", "Уступка"); }
  if (has(t, LEX.anchor)) { moves.add("anchor"); addT("anchor", "Якорь"); }
  if (has(t, LEX.accept)) { moves.add("accept"); addT("accept", "Закрытие"); }
  if (has(t, LEX.rapport)) { moves.add("rapport"); addT("rapport", "Контакт"); }
  const number = extractNum(t);
  if (number !== null && !moves.has("accept") && !q) { moves.add("offer"); addT("offer", "Оффер / число"); }
  if (q && !spin && !moves.has("interests_probe")) { moves.add("open_question"); addT("spin", "Открытый вопрос"); }
  if (moves.size === 0) moves.add("statement");
  const words = t.split(" ").filter(Boolean).length;
  let arg = 20;
  arg += Math.min(20, cnt(t, LEX.rationale) * 12);
  if (moves.has("objective_criteria")) arg += 18;
  if (spin) arg += 14;
  if (moves.has("interests_probe")) arg += 12;
  if (moves.has("acknowledge")) arg += 10;
  if (moves.has("tradeoff")) arg += 10;
  if (number !== null) arg += 6;
  if (words >= 12 && words <= 60) arg += 8;
  if (words < 4) arg -= 15;
  if (moves.has("hostile")) arg -= 30;
  if (moves.has("threat") && !moves.has("objective_criteria") && !moves.has("batna")) arg -= 12;
  arg = Math.max(0, Math.min(100, Math.round(arg)));
  const pr = [
    "accept", "hostile", "threat", "tradeoff", "objective_criteria", "batna", "interests_probe",
    "spin_needpayoff", "spin_implication", "spin_problem", "spin_situation", "acknowledge",
    "concession", "offer", "anchor", "open_question", "rapport", "statement",
  ];
  const primary = pr.find((p) => moves.has(p)) || "statement";
  return { moves: [...moves], primary, number, arg, spin, tags };
}

// Convert internal RawAnalysis into the protocol Analysis object.
export function toAnalysis(a: RawAnalysis, raw: string): Analysis {
  return {
    tags: a.tags,
    primary: a.primary,
    arg_quality: a.arg,
    spin: a.spin,
    flags: {
      hostile: a.moves.includes("hostile"),
      threat: a.moves.includes("threat"),
      question: norm(raw).includes("?"),
    },
  };
}

// ---------- session / state ----------
export interface Metrics {
  argSum: number;
  argN: number;
  threats: number;
  hostiles: number;
  empathy: number;
  crit: number;
  spin: Set<string>;
  probes: number;
}
export interface Session {
  sc: ScenarioDef;
  lang: Lang;
  lowerBetter: boolean;
  turn: number;
  maxTurns: number;
  trust: number;
  tension: number;
  info: number;
  leverage: number;
  offerOpp: number;
  offerPlayer: number | null;
  interests: number[];
  tradeoffs: number[];
  deal: number | null;
  status: Status;
  met: Metrics;
}

export function newSession(sc: ScenarioDef, lang: Lang): Session {
  return {
    sc, lang, lowerBetter: sc.dir === "low", turn: 0, maxTurns: 12,
    trust: 40, tension: 25, info: 0, leverage: sc.dir === "high" ? 12 : 11,
    offerOpp: sc.open, offerPlayer: null, interests: [], tradeoffs: [], deal: null, status: "active",
    met: { argSum: 0, argN: 0, threats: 0, hostiles: 0, empathy: 0, crit: 0, spin: new Set(), probes: 0 },
  };
}

export function flex(s: Session): number {
  const raw =
    0.45 * (s.trust / 100) + 0.3 * (s.info / 100) + 0.25 * (clamp(s.leverage) / 100) - 0.5 * (s.tension / 100);
  return clamp(raw, 0, 1);
}
function concede(s: Session, f: number): void {
  s.offerOpp = Math.round((s.offerOpp + (s.sc.floor - s.offerOpp) * f) * 100) / 100;
}
function acceptable(s: Session, n: number): boolean {
  return s.lowerBetter ? n >= s.sc.floor - 0.001 : n <= s.sc.floor + 0.001;
}

export interface MoveResult {
  reaction: string;
  deltas: Deltas;
  closed: boolean;
}

export function applyMove(s: Session, a: RawAnalysis): MoveResult {
  const sc = s.sc;
  const style = sc.cp.style;
  const b = { trust: s.trust, tension: s.tension, info: s.info, leverage: s.leverage };
  const m = s.met;
  m.argSum += a.arg; m.argN++;
  if (a.spin) m.spin.add(a.spin);
  const H = (k: string) => a.moves.includes(k);
  let reaction = "neutral";
  let cf = 0;
  if (H("acknowledge")) { s.trust = clamp(s.trust + 8); s.tension = clamp(s.tension - 10); m.empathy++; reaction = "warmed"; }
  if (a.spin || H("interests_probe")) {
    const gb = a.spin === "implication" || a.spin === "need-payoff" ? 22 : 14;
    const g = gb + (H("interests_probe") ? 10 : 0);
    if (s.interests.length < sc.interests[s.lang].length && s.trust > 30) s.interests.push(s.interests.length);
    s.info = clamp(s.info + g); s.trust = clamp(s.trust + 4); s.tension = clamp(s.tension - 3);
    if (H("interests_probe")) m.probes++;
    if (reaction !== "warmed") reaction = "opened_up";
  }
  if (H("objective_criteria")) {
    s.leverage = clamp(s.leverage + 16); s.trust = clamp(s.trust + 3); m.crit++;
    if (style === "analytical") s.leverage = clamp(s.leverage + 6);
    reaction = "persuaded";
  }
  if (H("batna")) {
    const bk = H("objective_criteria") || a.arg > 55;
    s.leverage = clamp(s.leverage + (bk ? 18 : 10));
    s.tension = clamp(s.tension + (bk ? 4 : 14));
    if (style === "relationship") s.tension = clamp(s.tension + 6);
    reaction = "pressured";
  }
  if (H("tradeoff")) {
    s.trust = clamp(s.trust + 6); s.tension = clamp(s.tension - 4);
    cf += 0.12 + 0.18 * (s.info / 100);
    if (s.tradeoffs.length < sc.tradeoffs[s.lang].length) s.tradeoffs.push(s.tradeoffs.length);
    reaction = "collaborated";
  }
  if (H("threat")) {
    m.threats++; s.tension = clamp(s.tension + 22); s.trust = clamp(s.trust - 14); s.leverage = clamp(s.leverage + 6);
    if (style === "tough") s.tension = clamp(s.tension + 8);
    reaction = "hardened";
  }
  if (H("hostile")) { m.hostiles++; s.tension = clamp(s.tension + 26); s.trust = clamp(s.trust - 22); reaction = "offended"; }
  if (H("rapport")) { s.trust = clamp(s.trust + 5); s.tension = clamp(s.tension - 4); }
  if (a.number !== null && (H("offer") || H("anchor") || H("concession") || H("accept") || H("tradeoff")))
    s.offerPlayer = a.number;
  const fl = flex(s);
  cf += 0.1 + 0.34 * fl;
  if (H("objective_criteria")) cf += 0.12;
  if (a.spin || H("interests_probe")) cf += 0.05;
  if (H("acknowledge")) cf += 0.03;
  if (H("threat") && s.leverage > 45 && s.tension < 80) cf += 0.06;
  if (s.offerPlayer !== null) {
    const gap = s.lowerBetter ? s.offerOpp - s.offerPlayer : s.offerPlayer - s.offerOpp;
    if (gap > 0) cf += Math.min(0.08, gap * 0.01);
  }
  if (s.tension > 75) cf *= 0.25;
  else if (s.tension > 55) cf *= 0.6;
  cf = clamp(cf, 0, 0.7);
  if (cf > 0.01) concede(s, cf);
  let closed = false;
  if (H("accept")) {
    let meeting: number;
    if (s.offerPlayer !== null) {
      const w = 0.3 + 0.45 * fl;
      meeting = s.offerOpp + (s.offerPlayer - s.offerOpp) * w;
      meeting = s.lowerBetter ? Math.max(meeting, sc.floor) : Math.min(meeting, sc.floor);
      meeting = Math.round(meeting * 100) / 100;
    } else meeting = s.offerOpp;
    if (acceptable(s, meeting)) { s.deal = meeting; s.status = "agreement"; closed = true; }
    else reaction = "not_yet";
  }
  if (s.tension >= 100 || s.trust <= 3) { s.status = "breakdown"; closed = true; reaction = "walked_out"; }
  const deltas: Deltas = {
    trust: s.trust - b.trust,
    tension: s.tension - b.tension,
    info: s.info - b.info,
    leverage: s.leverage - b.leverage,
  };
  return { reaction, deltas, closed };
}

// ---------- opponent lines ----------
type LineBank = Record<string, string[]>;
const LINES: Record<Lang, LineBank> = {
  ru: {
    warmed: ["Приятно, что вы это понимаете. Тогда по делу.", "Спасибо, редко кто слышит нашу сторону."],
    opened_up: ["Хороший вопрос… Честно, для нас критично {i}.", "Раз спросили — нас правда беспокоит {i}."],
    persuaded: ["С такими данными спорить сложно. Сейчас {o}{u}.", "Цифры говорят сами за себя. Пусть {o}{u}."],
    pressured: ["Слышал про ваши альтернативы. Но без ультиматумов — {o}{u}.", "Понимаю, у вас есть варианты. Обсудим, {o}{u}."],
    collaborated: ["Вот это интересно. Тогда {o}{u} — реально.", "Такой размен подходит. Значит {o}{u}."],
    hardened: ["Давление не поможет. Позиция прежняя — {o}{u}.", "В таком тоне двигаться сложно. Остаюсь на {o}{u}."],
    offended: ["Я бы попросил без перехода на личности.", "Так мы ни о чём не договоримся."],
    neutral: ["Хорошо, понял. Пока моё предложение — {o}{u}.", "Принято. На данный момент — {o}{u}."],
    not_yet: ["Пока рано жать руки — {o}{u} моё текущее.", "Ещё не сходимся. Сейчас {o}{u}."],
    walked_out: ["Наверное, стоит взять паузу. На этом остановимся.", "Продолжать в таком ключе бессмысленно. Всего доброго."],
    agreement: ["По рукам! Договорились на {d}{u}. Рад иметь с вами дело.", "Отлично, фиксируем {d}{u}. Было приятно."],
  },
  en: {
    warmed: ["I appreciate that you get it. To business.", "Thanks — few people hear our side."],
    opened_up: ["Good question… honestly, {i} is critical for us.", "Since you ask — we really care about {i}."],
    persuaded: ["Hard to argue with that data. {o}{u} now.", "The numbers speak for themselves. {o}{u}."],
    pressured: ["I hear you have alternatives. But no ultimatums — {o}{u}.", "I know you have options. Let's talk, {o}{u}."],
    collaborated: ["Now that's interesting. Then {o}{u} is doable.", "That trade works. So {o}{u}."],
    hardened: ["Pressure won't help. My position stands — {o}{u}.", "I can't move in that tone. Staying at {o}{u}."],
    offended: ["I'd ask you to keep it professional.", "This isn't going anywhere like that."],
    neutral: ["Understood. For now my offer is {o}{u}.", "Noted. At this point — {o}{u}."],
    not_yet: ["Too early to shake hands — {o}{u}.", "We're not there yet. Right now {o}{u}."],
    walked_out: ["Maybe we should take a break. Let's stop here.", "No point continuing like this. Good day."],
    agreement: ["Deal! {d}{u} it is. A pleasure.", "Great, we lock {d}{u}. Good negotiating."],
  },
};

export function renderLine(s: Session, reaction: string, closed: boolean): string {
  const u = s.sc.unit[s.lang];
  const bank = LINES[s.lang];
  let key = reaction;
  if (closed && s.status === "agreement") key = "agreement";
  if (closed && s.status === "breakdown") key = "walked_out";
  const arr = bank[key] || bank.neutral;
  const l = arr[(s.turn + s.interests.length) % arr.length];
  const ilist = s.sc.interests[s.lang];
  const li = s.interests.length ? ilist[s.interests[s.interests.length - 1]] : ilist[0];
  return l
    .replace("{o}", String(s.offerOpp))
    .replace("{d}", String(s.deal != null ? s.deal : s.offerOpp))
    .replace("{u}", u)
    .replace("{i}", (li || "").toLowerCase());
}

export function greetingText(s: Session): string {
  const sc = s.sc;
  return s.lang === "ru"
    ? `Здравствуйте. Я ${sc.cp.nm.ru}. Наше стартовое предложение — ${s.offerOpp}${sc.unit.ru}. С чего начнём?`
    : `Hello. I'm ${sc.cp.nm.en}. Our opening position is ${s.offerOpp}${sc.unit.en}. Where shall we start?`;
}

// ---------- state view (protocol) ----------
export function stateView(s: Session): StateView {
  return {
    trust: Math.round(s.trust),
    tension: Math.round(s.tension),
    info: Math.round(s.info),
    leverage: Math.round(flex(s) * 100),
    offer_opp: s.offerOpp,
    offer_player: s.offerPlayer,
    interests_found: s.interests.length,
    interests_total: s.sc.interests[s.lang].length,
    status: s.status,
    turn: s.turn,
    max_turns: s.maxTurns,
  };
}

// ---------- scoring / debrief ----------
export function scoreSession(s: Session): Debrief {
  const sc = s.sc, m = s.met, lang = s.lang, u = sc.unit[lang];
  let economic = 0;
  let dealText: string;
  if (s.status === "agreement" && s.deal != null) {
    const r = sc.resv, t = sc.target;
    economic = clamp(Math.round(((s.deal - r) / (t - r)) * 100));
    dealText = s.deal + u;
  } else if (s.status === "breakdown") {
    economic = 0;
    dealText = lang === "ru" ? "Сделка сорвалась" : "Deal broke down";
  } else {
    economic = 10;
    dealText = lang === "ru" ? "Без соглашения" : "No agreement";
  }
  const relationship = clamp(Math.round(s.trust - s.tension * 0.6 + 30));
  const spinC = m.spin.size;
  const avgArg = m.argN ? m.argSum / m.argN : 0;
  let technique = 0;
  technique += Math.min(24, spinC * 8);
  technique += m.crit > 0 ? 16 : 0;
  technique += m.probes > 0 ? 14 : 0;
  technique += s.interests.length >= sc.interests[lang].length ? 12 : s.interests.length * 4;
  technique += s.tradeoffs.length > 0 ? 12 : 0;
  technique += m.empathy > 0 ? 8 : 0;
  technique += Math.round((avgArg / 100) * 14);
  technique -= m.hostiles * 12;
  technique -= Math.max(0, m.threats - 1) * 6;
  technique = clamp(Math.round(technique));
  const overall = clamp(Math.round(0.4 * economic + 0.25 * relationship + 0.35 * technique));
  const grade = overall >= 85 ? "A" : overall >= 70 ? "B" : overall >= 55 ? "C" : overall >= 40 ? "D" : "F";
  const tips: string[] = [];
  const T = (ru: string, en: string) => tips.push(lang === "ru" ? ru : en);
  if (spinC < 2)
    T("Задавайте больше вопросов по SPIN (Проблема → Последствия), чтобы вскрыть боль второй стороны.",
      "Ask more SPIN questions (Problem → Implication) to surface their pain.");
  if (m.crit === 0)
    T("Опирайтесь на объективные критерии — это легитимный рычаг по Гарвардскому методу.",
      "Anchor on objective criteria — legitimate leverage per the Harvard method.");
  if (s.interests.length < sc.interests[lang].length)
    T("Вы вскрыли не все скрытые интересы. За позициями всегда стоят интересы.",
      "You didn't surface every hidden interest. Behind positions lie interests.");
  if (s.tradeoffs.length === 0)
    T("Создавайте ценность разменом по нескольким вопросам, а не только торгом по цене.",
      "Create value by trading across issues, not just price haggling.");
  if (m.empathy === 0)
    T("Используйте активное слушание — отражайте слова оппонента, снижая напряжение.",
      "Use active listening — paraphrase them to lower tension.");
  if (m.threats > 1 || m.hostiles > 0)
    T("Меньше давления: напряжение замораживает уступки.", "Less pressure: tension freezes concessions.");
  if (tips.length === 0)
    T("Отличная работа — чистое применение принципиальных переговоров.",
      "Excellent — clean principled negotiation.");
  return {
    overall, grade, economic, relationship, technique,
    deal_text: dealText, status: s.status,
    interests_found: s.interests.length, interests_total: sc.interests[lang].length,
    spin_stages: spinC, objective_criteria: m.crit, empathy: m.empathy,
    threats: m.threats, tradeoffs: s.tradeoffs.length, avg_arg: Math.round(avgArg), tips,
  };
}

// Coaching hint (mirrors the demo's hint() heuristic).
export function hintText(s: Session): string {
  const H = HINTS[s.lang];
  if (s.info < 40) return H.info;
  if (s.tension > 60) return H.tension;
  if (s.met.crit === 0) return H.crit;
  if (s.tradeoffs.length === 0 && s.info > 40) return H.trade;
  return H.close;
}
const HINTS: Record<Lang, Record<string, string>> = {
  ru: {
    info: "Вы почти не знаете, что движет оппонентом. Спросите: «Что для вас важнее всего и почему?»",
    tension: "Напряжение высокое — уступки заморожены. Признайте: «Понимаю, откуда вы идёте…»",
    crit: "Подкрепите позицию объективным критерием — сошлитесь на рыночные данные.",
    trade: "Вы знаете их интересы — предложите размен.",
    close: "Хорошая траектория. Назовите число и предложите зафиксировать сделку.",
  },
  en: {
    info: 'You barely know what drives them. Ask: "What matters most to you, and why?"',
    tension: 'Tension is high — concessions are frozen. Acknowledge: "I understand where you\'re coming from…"',
    crit: "Back your position with an objective criterion — cite market data.",
    trade: "You know their interests — propose a trade.",
    close: "Good trajectory. Name a number and propose to lock the deal.",
  },
};
