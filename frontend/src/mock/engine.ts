// engine.ts — deterministic mock negotiation engine.
// Ported from legacy-node/public/demo.html; outputs are shaped to the protocol
// (types.ts): Analysis, Deltas, StateView, Debrief. This lets the MockServer
// behave like the real backend so the full UI works with no server running.
import type { Lang } from "../types";
import type { Analysis, Deltas, Debrief, StateView, Status, Tag, WhatIfBranch } from "../types";
import { LEX, cnt, extractNum, has, norm } from "../lib/techniques"; // has/norm reused for secondary-issue detection
import type { CounterpartStyle, ScenarioDef } from "../data/scenarios";

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
  // `label` is a FALLBACK only — the client localizes tags from `key` via
  // lib/tagLabel.ts, because this engine and the Python one hardcode their
  // labels in different single languages. Keep the key stable; the string here
  // is what shows only if the key is unknown to the label table.
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
  // Anti-spam (director round-5 #2): a bare "рыночная цена" / "взамен" keyword
  // with no number and no rationale connector is trivially gameable, so the
  // objective-criteria / trade-off bonus is withheld unless the line carries
  // substance — a digit or a "потому что"/"because"-style connector. Lightweight
  // and deterministic; a genuinely-argued move (which cites data or a reason) is
  // unaffected. This intentionally hardens the mock beyond the keyword backend.
  const rationaleN = cnt(t, LEX.rationale);
  const substance = rationaleN > 0 || /\d/.test(t);
  let arg = 20;
  arg += Math.min(20, rationaleN * 12);
  if (moves.has("objective_criteria") && substance) arg += 18;
  if (spin) arg += 14;
  if (moves.has("interests_probe")) arg += 12;
  if (moves.has("acknowledge")) arg += 10;
  if (moves.has("tradeoff") && substance) arg += 10;
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
  // ids of secondary issues the player has traded (logrolling "package"), in the
  // order conceded. Mirrors the backend's terms_conceded; empty when a scenario
  // has no secondary issues (then the mock behaves exactly as before).
  termsConceded: string[];
  deal: number | null;
  status: Status;
  met: Metrics;
  // Anti-gaming: the normalized text of the LAST player line. Repeating the exact
  // same line barely moves the opponent (mirrors backend Session.last_player_norm).
  lastPlayerNorm: string;
}

export function newSession(sc: ScenarioDef, lang: Lang): Session {
  return {
    sc, lang, lowerBetter: sc.dir === "low", turn: 0, maxTurns: 12,
    // Seed leverage from BATNA strength (× 0.4) exactly like the backend engine.
    trust: 40, tension: 25, info: 0, leverage: sc.batnaStrength * 0.4,
    offerOpp: sc.open, offerPlayer: null, interests: [], tradeoffs: [], termsConceded: [], deal: null, status: "active",
    met: { argSum: 0, argN: 0, threats: 0, hostiles: 0, empathy: 0, crit: 0, spin: new Set(), probes: 0 },
    lastPlayerNorm: "",
  };
}

// Which hidden interest does an OFFLINE probe uncover? Honesty first (mirrors
// backend _reveal_index_offline): if the player's words match the keywords of an
// interest that is still hidden, uncover THAT interest — so the opponent only
// ever speaks to what was actually asked. A generic probe (no keyword hit) falls
// back to the smallest still-hidden index (next-in-order). Returns null when all
// interests are already uncovered.
function revealIndexOffline(sc: ScenarioDef, curNorm: string, lang: Lang, found: number[]): number | null {
  const total = sc.interests[lang].length;
  const kw = sc.hiddenInterestKeywords?.[lang];
  if (kw) {
    for (let i = 0; i < Math.min(total, kw.length); i++) {
      if (found.includes(i)) continue;
      if (has(curNorm, kw[i])) return i;
    }
  }
  for (let i = 0; i < total; i++) if (!found.includes(i)) return i;
  return null;
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

// `rawText` (the player's untouched line) is optional but required for structured
// logrolling: it lets us detect WHICH secondary issue the player offered by
// keyword, mirroring the backend's per-issue terms_conceded tracking.
export function applyMove(s: Session, a: RawAnalysis, rawText = ""): MoveResult {
  const sc = s.sc;
  const style = sc.cp.style;
  const curNorm = norm(rawText);
  // Anti-gaming (mirrors backend): repeating the exact same line barely works —
  // the opponent notices, and it stops padding the technique score.
  const repeated = curNorm !== "" && curNorm === s.lastPlayerNorm;
  s.lastPlayerNorm = curNorm;
  if (repeated) a.arg = Math.min(a.arg, 12);
  const b = { trust: s.trust, tension: s.tension, info: s.info, leverage: s.leverage };
  const m = s.met;
  m.argSum += a.arg; m.argN++;
  if (a.spin) m.spin.add(a.spin);
  const H = (k: string) => a.moves.includes(k);
  let reaction = "neutral";
  let cf = 0;
  if (H("acknowledge")) { s.trust = clamp(s.trust + 8); s.tension = clamp(s.tension - 10); m.empathy++; reaction = "warmed"; }
  if ((a.spin || H("interests_probe")) && !repeated) {
    const gb = a.spin === "implication" || a.spin === "need-payoff" ? 22 : 14;
    const g = gb + (H("interests_probe") ? 10 : 0);
    // Honest reveal: uncover the interest the probe ACTUALLY targets by keyword;
    // a vague probe falls back to next-in-order. Reveal gated on trust, like info.
    if (s.trust > 30) {
      const idx = revealIndexOffline(sc, curNorm, s.lang, s.interests);
      if (idx !== null) s.interests.push(idx);
    }
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
    // Structured logrolling (mirrors backend): trading a concrete issue the
    // opponent values unlocks a genuine SECOND axis of price movement, scaled by
    // how much they want it (oppValue). Cheap-for-you / valuable-for-them trades
    // are the whole point. Detection is keyword-based here.
    for (const iss of sc.secondaryIssues ?? []) {
      if (s.termsConceded.includes(iss.id)) continue;
      if (has(curNorm, iss.keywords[s.lang])) {
        s.termsConceded.push(iss.id);
        cf += 0.1 + 0.3 * iss.oppValue;
        s.trust = clamp(s.trust + 3 + 4 * iss.oppValue);
      }
    }
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
  if (repeated) cf *= 0.15; // repeating the same line won't move them
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
// Templated reaction banks (ported from backend engine.LINES). Each reaction maps
// to a "base" bank (neutral-but-in-character, always present) plus OPTIONAL per-
// persona-style variants keyed by counterpart style. reactionBank() pools the
// style variants IN FRONT of the base so a warm sales head, a blunt hard bargainer
// and a dry numbers person sound different for the SAME reaction, while the base
// guarantees a fallback and extra variety (no reaction ever loops between two
// lines). Placeholders: {o}{u} = offer+unit, {d}{u} = deal+unit, {i} = interest.
type ReactionEntry = { base: string[] } & Partial<Record<CounterpartStyle, string[]>>;
type LineBank = Record<string, ReactionEntry>;
const LINES: Record<Lang, LineBank> = {
  ru: {
    warmed: {
      base: [
        "Приятно, что вы это понимаете. Тогда давайте по делу.",
        "Спасибо, редко кто слышит нашу сторону. Продолжим.",
        "Вот с этого и стоило начинать — так гораздо проще разговаривать.",
        "Хорошо, что мы друг друга слышим. Идём дальше.",
        "Уже теплее. С таким настроем и договориться реально.",
        "Ценю, что вы вникаете в нашу ситуацию. Продолжайте.",
      ],
      relationship: [
        "Как приятно иметь дело с понимающим человеком. Давайте всё решим по-хорошему.",
        "Вот за это я и люблю нормальные переговоры. Спасибо, что услышали.",
      ],
      tough: ["Ладно, уже без наездов. Так и быть, продолжим.", "Хорошо, хоть по-деловому заговорили. Дальше."],
      analytical: ["Разумно. Раз мы сходимся по фактам — двигаемся дальше.", "Логично. С таким подходом можно работать."],
    },
    opened_up: {
      base: [
        "Хороший вопрос… Честно говоря, для нас критично {i}.",
        "Раз уж вы спросили — нас правда беспокоит {i}.",
        "Скажу как есть: больше всего нас волнует {i}.",
        "Если по-честному, то главный вопрос для нас — {i}.",
        "Тут вы попали в точку. Для нас важно именно {i}.",
        "Не буду скрывать: за этим стоит {i}.",
      ],
      relationship: ["Раз уж по-доброму спрашиваете — по-человечески нам важно {i}.", "Вам скажу откровенно: для нас это про {i}."],
      tough: ["Ладно. Коротко: нам нужно {i}. Вот и весь секрет.", "Скажу прямо, без обёртки: дело в {i}."],
      analytical: ["Если разложить по сути — ключевой фактор для нас {i}.", "По факту всё упирается в {i}."],
    },
    persuaded: {
      base: [
        "С такими данными спорить сложно. Могу подвинуться — сейчас {o}{u}.",
        "Ладно, цифры говорят сами за себя. Пусть будет {o}{u}.",
        "Аргумент принят. Готов пересмотреть — {o}{u}.",
        "Убедили. Тогда моё предложение {o}{u}.",
        "Против фактов не пойду. Сдвигаюсь к {o}{u}.",
        "Справедливо. Пойду вам навстречу — {o}{u}.",
      ],
      relationship: ["Вы меня по-хорошему убедили. Так и быть, {o}{u}.", "Ради нормальных отношений подвинусь — {o}{u}."],
      tough: ["Ладно. Цифра бьёт — {o}{u}. Дальше.", "Принято, крыть нечем. {o}{u}."],
      analytical: ["Расчёт корректный. Пересчитал — {o}{u}.", "Данные сходятся. По ним получается {o}{u}."],
    },
    pressured: {
      base: [
        "Слышал про ваши альтернативы. Но давайте без ультиматумов — {o}{u}.",
        "Понимаю, что у вас есть варианты. Готов обсуждать, {o}{u}.",
        "Рычаг у вас есть, не спорю. И всё же {o}{u}.",
        "Давайте не мериться силами. По цене — {o}{u}.",
        "Ваши козыри вижу. Но моя цифра пока {o}{u}.",
        "Угрозы лишние, у нас и так есть о чём говорить. {o}{u}.",
      ],
      relationship: ["Зачем же так резко? Мы ведь по-хорошему можем. {o}{u}.", "Не надо давить, я и так к вам расположена. {o}{u}."],
      tough: ["Давите? Давите. Меня этим не сдвинуть. {o}{u}.", "Альтернативы — это ваше дело. Моё — {o}{u}."],
      analytical: ["Ваша BATNA — это тоже цифра, давайте её и обсудим. Пока {o}{u}.", "Хорошо, сравним варианты по фактам. У меня {o}{u}."],
    },
    collaborated: {
      base: [
        "Вот это уже интересно. Если так, то {o}{u} — реально.",
        "Такой размен нам подходит. Тогда {o}{u}.",
        "О, это меняет дело. Давайте под это {o}{u}.",
        "Если вы про это всерьёз — я готов на {o}{u}.",
        "Хороший пакет. При таком раскладе {o}{u}.",
        "Вот теперь мы создаём ценность, а не делим её. {o}{u}.",
      ],
      relationship: ["Вот это по-партнёрски! На таких условиях с радостью — {o}{u}.", "Люблю, когда ищут общий интерес. Тогда {o}{u}."],
      tough: ["Годится. Даёте это — беру {o}{u}. Почти по рукам.", "Вот это конкретика. За такое — {o}{u}."],
      analytical: ["Сходится: ваша уступка компенсирует мою. Тогда {o}{u}.", "По балансу выгод это работает. {o}{u}."],
    },
    hardened: {
      base: [
        "Давление здесь не поможет. Моя позиция прежняя — {o}{u}.",
        "В таком тоне мне сложно двигаться. Остаюсь на {o}{u}.",
        "Так вопрос не решается. Цифра прежняя — {o}{u}.",
        "Нет. На угрозы я не реагирую. {o}{u}.",
        "Это только всё портит. Я на {o}{u} и остаюсь.",
        "Чем сильнее давите, тем меньше желания двигаться. {o}{u}.",
      ],
      relationship: ["Мне неприятен такой напор. Так я уступать не готова — {o}{u}.", "Жаль, что вы так. По-хорошему было бы проще. {o}{u}."],
      tough: ["Не пройдёт. {o}{u}, и точка.", "Меня на испуг не возьмёшь. {o}{u}."],
      analytical: ["Эмоции — не аргумент. Пока цифры прежние: {o}{u}.", "Без фактов это просто давление. {o}{u}."],
    },
    offended: {
      base: [
        "Я бы попросил без перехода на личности.",
        "Так мы точно ни о чём не договоримся.",
        "Это уже лишнее. Давайте держаться в рамках.",
        "Не надо так со мной разговаривать.",
        "Подобный тон я терпеть не обязан.",
        "Ещё одно такое слово — и разговор закончен.",
      ],
      relationship: ["Мне правда обидно это слышать. Я так не привыкла.", "Зачем же так? Я ведь к вам со всей душой."],
      tough: ["Полегче. Ещё раз так — и разошлись.", "Аккуратнее в выражениях со мной."],
      analytical: ["Эмоции оставим за скобками, это непродуктивно.", "Переход на личности к сути отношения не имеет."],
    },
    neutral: {
      base: [
        "Хорошо, я вас понял. Пока моё предложение — {o}{u}.",
        "Принято. На данный момент — {o}{u}.",
        "Ясно. Пока остаёмся на {o}{u}.",
        "Понял вас. Моя цифра сейчас — {o}{u}.",
        "Ок, услышал. Пока что {o}{u}.",
        "Давайте зафиксируем: сейчас на столе {o}{u}.",
      ],
      relationship: ["Хорошо, пока пусть будет {o}{u}, а там посмотрим.", "Понимаю вас. Пока остановимся на {o}{u}."],
      tough: ["Так. Пока {o}{u}. Что дальше?", "Ясно. {o}{u}. Не тянем."],
      analytical: ["Фиксирую: текущая цифра {o}{u}.", "По состоянию на сейчас — {o}{u}."],
    },
    not_yet: {
      base: [
        "Пока рано пожимать руки — {o}{u} моё текущее предложение.",
        "Ещё не сходимся. Сейчас у меня {o}{u}.",
        "Рановато. До {o}{u} я дошёл, дальше пока нет.",
        "Не спешите. Пока это {o}{u}.",
        "Мы близко, но ещё не там. {o}{u}.",
        "Руку жать пока не за что — {o}{u}.",
      ],
      relationship: ["Не будем спешить, хорошо? Пока {o}{u}.", "Мне бы хотелось договориться, но пока рано — {o}{u}."],
      tough: ["Нет. Пока нет. {o}{u}.", "Рано. {o}{u}, и не торопите."],
      analytical: ["По цифрам мы ещё не сошлись: {o}{u}.", "Разрыв пока есть. {o}{u}."],
    },
    walked_out: {
      base: [
        "Знаете, наверное, нам стоит взять паузу. На этом остановимся.",
        "Боюсь, продолжать в таком ключе бессмысленно. Всего доброго.",
        "Пожалуй, на сегодня достаточно. Я выхожу.",
        "Так дела не делаются. Разговор окончен.",
        "Мы зашли в тупик. Дальше нет смысла.",
        "Всё, я не готов это продолжать. До свидания.",
      ],
      relationship: ["Мне жаль, но так я больше не могу. Давайте на этом закончим.", "Обидно, что так вышло. Всего вам доброго."],
      tough: ["Всё, хватит. Я закончил.", "Разговор окончен. Ищите другого."],
      analytical: ["Дальнейший разговор непродуктивен. Закрываем.", "Смысла продолжать нет. Расходимся."],
    },
    agreement: {
      base: [
        "По рукам! Договорились на {d}{u}. Рад иметь с вами дело.",
        "Отлично, фиксируем {d}{u}. Было приятно вести переговоры.",
        "Идёт! {d}{u} — и по рукам.",
        "Договорились на {d}{u}. Хорошая работа с обеих сторон.",
        "Пусть будет {d}{u}. Ударили по рукам.",
        "Согласен, {d}{u}. Оформляем.",
      ],
      relationship: ["Вот и славно! {d}{u} — и работаем дальше. Рада сделке.", "По рукам, {d}{u}! Приятно, когда всё по-человечески."],
      tough: ["Идёт. {d}{u}. По рукам, не будем тянуть.", "Ок, {d}{u}. Договорились."],
      analytical: ["Цифра сходится: {d}{u}. Фиксируем в договоре.", "{d}{u} — по расчётам всех устраивает. Договорились."],
    },
  },
  en: {
    warmed: {
      base: [
        "I appreciate that you get it. Let's get to business.",
        "Thanks — few people hear our side. Go on.",
        "That's the right way to start. Much easier to talk like this.",
        "Good, we're hearing each other. Let's move on.",
        "That's warmer already. With that attitude we can make a deal.",
        "I appreciate you engaging with our situation. Please continue.",
      ],
      relationship: ["It's a pleasure dealing with someone who understands. Let's sort this out the good way.", "This is why I like a civil negotiation. Thanks for listening."],
      tough: ["Alright, no more jabs. Fine, let's keep going.", "Good, now you're talking business. Next."],
      analytical: ["Reasonable. Since we agree on the facts, let's move on.", "Logical. I can work with that approach."],
    },
    opened_up: {
      base: [
        "Good question… Honestly, what matters to us is {i}.",
        "Since you ask — we really care about {i}.",
        "I'll be straight: what worries us most is {i}.",
        "Honestly, the real issue for us is {i}.",
        "You've hit it. For us it's exactly {i}.",
        "I won't hide it: behind this is {i}.",
      ],
      relationship: ["Since you ask so kindly — on a human level, {i} matters to us.", "I'll be open with you: for us this is about {i}."],
      tough: ["Fine. Short version: we need {i}. That's the whole story.", "I'll say it plainly: it comes down to {i}."],
      analytical: ["If we break it down — the key factor for us is {i}.", "In effect it all reduces to {i}."],
    },
    persuaded: {
      base: [
        "Hard to argue with those numbers. I can move — {o}{u} now.",
        "Fair, the data speaks for itself. Let's say {o}{u}.",
        "Point taken. I'm willing to revise — {o}{u}.",
        "You've convinced me. Then my offer is {o}{u}.",
        "I won't argue against facts. Moving to {o}{u}.",
        "That's fair. I'll meet you — {o}{u}.",
      ],
      relationship: ["You've won me over the decent way. Alright, {o}{u}.", "For the sake of a good relationship I'll move — {o}{u}."],
      tough: ["Fine. The number lands — {o}{u}. Next.", "Taken, nothing to add. {o}{u}."],
      analytical: ["The math checks out. Recalculated — {o}{u}.", "The data lines up. It comes to {o}{u}."],
    },
    pressured: {
      base: [
        "I hear you have alternatives. But no ultimatums — {o}{u}.",
        "I know you have options. Happy to talk, {o}{u}.",
        "You've got leverage, I won't deny it. Still, {o}{u}.",
        "Let's not measure muscle. On price — {o}{u}.",
        "I see your cards. But my number is still {o}{u}.",
        "Threats are unnecessary, we have plenty to discuss. {o}{u}.",
      ],
      relationship: ["Why so sharp? We can do this the friendly way. {o}{u}.", "No need to push, I'm already on your side. {o}{u}."],
      tough: ["Push all you like. It won't move me. {o}{u}.", "Your alternatives are your business. Mine is {o}{u}."],
      analytical: ["Your BATNA is a number too — let's discuss that. For now {o}{u}.", "Fine, let's compare options on the facts. I'm at {o}{u}."],
    },
    collaborated: {
      base: [
        "Now that's interesting. On those terms, {o}{u} is doable.",
        "That trade works for us. Then {o}{u}.",
        "That changes things. Under that, {o}{u}.",
        "If you mean that seriously — I can do {o}{u}.",
        "Good package. In that case {o}{u}.",
        "Now we're creating value, not just splitting it. {o}{u}.",
      ],
      relationship: ["Now that's a partnership! On those terms, gladly — {o}{u}.", "I love it when we find the shared interest. Then {o}{u}."],
      tough: ["Works. You give that, I take {o}{u}. Almost a deal.", "Now that's concrete. For that — {o}{u}."],
      analytical: ["It nets out: your concession offsets mine. Then {o}{u}.", "On the balance of value, that works. {o}{u}."],
    },
    hardened: {
      base: [
        "Pressure won't help here. My position stands — {o}{u}.",
        "I can't move in that tone. Staying at {o}{u}.",
        "That's not how this gets solved. Number stands — {o}{u}.",
        "No. I don't respond to threats. {o}{u}.",
        "This only makes it worse. I'm staying at {o}{u}.",
        "The harder you push, the less I want to move. {o}{u}.",
      ],
      relationship: ["I don't like this pressure. I won't concede like this — {o}{u}.", "A shame you're taking this tack. It'd be easier the nice way. {o}{u}."],
      tough: ["Not happening. {o}{u}, period.", "You won't scare me. {o}{u}."],
      analytical: ["Emotion isn't an argument. Numbers stand: {o}{u}.", "Without facts this is just noise. {o}{u}."],
    },
    offended: {
      base: [
        "I'd ask you to keep this professional.",
        "This isn't going anywhere like that.",
        "That's out of line. Let's stay within bounds.",
        "Don't talk to me like that.",
        "I don't have to put up with that tone.",
        "One more remark like that and we're done.",
      ],
      relationship: ["That genuinely hurts to hear. I'm not used to this.", "Why be like that? I've been nothing but fair with you."],
      tough: ["Easy. One more like that and we're through.", "Watch your tone with me."],
      analytical: ["Let's leave emotion out of it, it's unproductive.", "Personal attacks have no bearing on the substance."],
    },
    neutral: {
      base: [
        "Understood. For now my offer is {o}{u}.",
        "Noted. At this point — {o}{u}.",
        "Clear. We're staying at {o}{u} for now.",
        "Got it. My number right now is {o}{u}.",
        "Okay, heard you. For now {o}{u}.",
        "Let's log it: {o}{u} is on the table.",
      ],
      relationship: ["Alright, let's leave it at {o}{u} for now and see.", "I hear you. Let's rest at {o}{u}."],
      tough: ["Right. {o}{u} for now. What's next?", "Clear. {o}{u}. Let's not drag this."],
      analytical: ["Logged: current figure {o}{u}.", "As of now — {o}{u}."],
    },
    not_yet: {
      base: [
        "Too early to shake hands — {o}{u} is where I am.",
        "We're not there yet. Right now I'm at {o}{u}.",
        "Bit soon. I've come to {o}{u}, no further yet.",
        "No rush. For now it's {o}{u}.",
        "We're close, but not there. {o}{u}.",
        "Nothing to shake on yet — {o}{u}.",
      ],
      relationship: ["Let's not rush it, okay? For now {o}{u}.", "I'd like to get there, but it's early — {o}{u}."],
      tough: ["No. Not yet. {o}{u}.", "Too soon. {o}{u}, and don't rush me."],
      analytical: ["On the numbers we haven't converged: {o}{u}.", "There's still a gap. {o}{u}."],
    },
    walked_out: {
      base: [
        "You know, maybe we should take a break. Let's stop here.",
        "I'm afraid there's no point continuing like this. Good day.",
        "That's enough for today. I'm out.",
        "This isn't how business is done. We're finished.",
        "We've hit a wall. No sense going on.",
        "That's it, I'm not continuing this. Goodbye.",
      ],
      relationship: ["I'm sorry, but I can't do this anymore. Let's end here.", "It pains me it came to this. All the best to you."],
      tough: ["That's it. I'm done.", "This conversation is over. Find someone else."],
      analytical: ["Continuing is unproductive. We're closing this.", "No point going further. We're done here."],
    },
    agreement: {
      base: [
        "Deal! {d}{u} it is. A pleasure doing business.",
        "Great, we lock {d}{u}. Good negotiating with you.",
        "Done! {d}{u} — let's shake on it.",
        "Agreed at {d}{u}. Good work on both sides.",
        "Let's call it {d}{u}. Hands on it.",
        "I'm in at {d}{u}. Let's paper it.",
      ],
      relationship: ["Wonderful! {d}{u} — and let's keep working together. Glad we did this.", "Deal, {d}{u}! It's nice when it's done the human way."],
      tough: ["Done. {d}{u}. Shake on it, let's not drag it.", "Okay, {d}{u}. We've got a deal."],
      analytical: ["The number works: {d}{u}. Let's put it in the contract.", "{d}{u} — it pencils out for everyone. Agreed."],
    },
  },
};

// A deterministic seed that changes across turns AND as the game develops, so a
// single game doesn't cycle the same reaction line (mirrors backend _line_seed).
// Pure function of session state (no time/random) → what-if replay stays
// reproducible. Progress signals (interests/tradeoffs/terms) reshuffle the pick.
function lineSeed(s: Session): number {
  return s.turn * 7 + s.interests.length * 3 + s.tradeoffs.length * 5 + s.termsConceded.length * 11;
}

// Pool the persona-style variants (if this persona has any for this reaction) in
// front of the shared base bank, so style lines are picked first for low seeds and
// the base always supplies a fallback and extra variety (no two-line loops).
function reactionBank(lang: Lang, key: string, style: CounterpartStyle): string[] {
  const entry = LINES[lang][key] ?? LINES[lang].neutral;
  const variants = entry[style];
  return variants ? [...variants, ...entry.base] : entry.base;
}

export function renderLine(s: Session, reaction: string, closed: boolean): string {
  const u = s.sc.unit[s.lang];
  const style = s.sc.cp.style;
  let key = reaction;
  if (closed && s.status === "agreement") key = "agreement";
  if (closed && s.status === "breakdown") key = "walked_out";
  const arr = reactionBank(s.lang, key, style);
  const l = arr[lineSeed(s) % arr.length];
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
    terms_conceded: [...s.termsConceded],
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
  // Package signal (mirrors backend) — ONLY for scenarios with a structured
  // logrolling axis, so scoring is identical for scenarios without secondary
  // issues. Reward trading issues the opponent values (high oppValue) and lightly
  // discount giving away things costly to the player. Capped so it can't dominate.
  if (sc.secondaryIssues && sc.secondaryIssues.length) {
    let pkg = 0;
    for (const iss of sc.secondaryIssues) {
      if (s.termsConceded.includes(iss.id)) pkg += 10 * iss.oppValue - 6 * iss.playerCost;
    }
    technique += clamp(pkg, -10, 16);
  }
  technique = clamp(Math.round(technique));
  const overall = clamp(Math.round(0.4 * economic + 0.25 * relationship + 0.35 * technique));
  let grade = overall >= 85 ? "A" : overall >= 70 ? "B" : overall >= 55 ? "C" : overall >= 40 ? "D" : "F";
  // Technique floor (mirrors backend): A/B must be EARNED with method, not bought
  // with a good number. Landing a great price while ignoring interests/criteria/
  // trade-offs (technique < 45) caps the grade at C — the Harvard thesis.
  if (technique < 45 && (grade === "A" || grade === "B")) grade = "C";
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
    // The debrief's reveal — mirrors the backend's `interests` (engine.py
    // score_session). Deterministic, so the offline demo lifts the same curtain.
    interests: sc.interests[lang].map((text, i) => ({ text, found: s.interests.includes(i) })),
    spin_stages: spinC, objective_criteria: m.crit, empathy: m.empathy,
    threats: m.threats, tradeoffs: s.tradeoffs.length, avg_arg: Math.round(avgArg), tips,
  };
}

// ---------- "А что если…" replay (offline mirror of backend _whatif_branch) ----------
// Replay `prefix` on a FRESH session, then apply one `branchText` move and capture
// the outcome. A fresh session per branch guarantees the two branches share no
// state — determinism by construction. The per-turn sequence (increment turn →
// analyze → applyMove → renderLine) mirrors the MockServer loop exactly, so a
// branch re-using the original text reproduces the real play bit-for-bit.
export function whatIfBranch(def: ScenarioDef, lang: Lang, prefix: string[], branchText: string): WhatIfBranch {
  const s = newSession(def, lang);
  for (const tx of prefix) {
    s.turn += 1;
    applyMove(s, analyze(tx), tx);
  }
  s.turn += 1;
  const raw = analyze(branchText);
  const result = applyMove(s, raw, branchText);
  const line = renderLine(s, result.reaction, result.closed);
  return {
    text: branchText,
    analysis: toAnalysis(raw, branchText),
    deltas: result.deltas,
    state: stateView(s),
    opponent_line: line,
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
// The worked example that goes with the hint — offline parity for the backend's
// AI coach. Deterministic phrasings (the mock has no model), but the same
// contract: a line the player can send as-is. Uses the scenario's own tradeable
// item where the situation calls for one, so it is never generic filler.
export function hintLine(s: Session): string {
  const L = HINT_LINES[s.lang];
  if (s.info < 40) return L.info;
  if (s.tension > 60) return L.tension;
  if (s.met.crit === 0) return L.crit;
  if (s.tradeoffs.length === 0 && s.info > 40) {
    const item = (s.sc.tradeoffs[s.lang][0] ?? "").toLowerCase();
    return L.trade.replace("{item}", item);
  }
  return L.close;
}
const HINT_LINES: Record<Lang, Record<string, string>> = {
  ru: {
    info: "Что для вас важнее всего в этой сделке и почему именно это?",
    tension: "Понимаю, откуда вы идёте. Давайте вернёмся к сути — что для вас критично?",
    crit: "По рынку сопоставимые условия идут в другом диапазоне. Давайте опираться на этот ориентир, а не на позиции.",
    trade: "Если мы дадим {item}, сможете подвинуться по цене?",
    close: "Тогда фиксируем: условия, о которых договорились, и цена. Подписываем?",
  },
  en: {
    info: "What matters most to you in this deal, and why exactly that?",
    tension: "I understand where you're coming from. Let's get back to substance — what is critical for you?",
    crit: "Comparable terms on the market sit in a different range. Let's anchor on that benchmark rather than positions.",
    trade: "If we give you {item}, can you move on price?",
    close: "Then let's lock it: the terms we agreed plus the price. Shall we sign?",
  },
};
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
