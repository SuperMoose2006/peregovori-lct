// engine.ts — deterministic mock negotiation engine.
// Ported from legacy-node/public/demo.html; outputs are shaped to the protocol
// (types.ts): Analysis, Deltas, StateView, Debrief. This lets the MockServer
// behave like the real backend so the full UI works with no server running.
import type { Lang } from "../types";
import type { Analysis, Deltas, Debrief, HerSide, HerSideTurn, StateView, Status, Tag, WhatIfBranch } from "../types";
import { LEX, cnt, has, norm, offerNumber } from "../lib/techniques"; // has/norm reused for secondary-issue detection
import { formatDeal, formatNumber } from "../lib/format";
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
  // Число становится офертой только при намерении назвать цену — зеркало
  // techniques.py::offer_number. Порядок важен: приёмы уже собраны выше.
  const number = offerNumber(t, moves);
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
  /** Сумма сходства ходов с уже сказанным (сверх мягкого порога) и число ходов —
   *  доля партии, потраченная на повторы. Техника считает её в минус. */
  repeatSum: number;
  repeatN: number;
  /** Игрок назвал обоснованную цифру ПЕРВЫМ — до того, как оппонент положил
   *  свою на стол. Зеркало backend Metrics.opening_anchor. */
  openingAnchor: boolean;
}
export interface Session {
  sc: ScenarioDef;
  lang: Lang;
  lowerBetter: boolean;
  /** Сложность стола (1..5) — та самая, что рисуется точками на карточке выбора.
   *  Живёт на СЕССИИ, а не читается из сценария на каждом ходу: партия может
   *  быть заведена с подменённой сложностью, и тогда всё поведение обязано
   *  пересчитаться из одного места. Зеркало backend Session.difficulty. */
  difficulty: number;
  turn: number;
  maxTurns: number;
  trust: number;
  tension: number;
  info: number;
  leverage: number;
  offerOpp: number;
  offerPlayer: number | null;
  /** Рамка стола — якорь, к которому возвращает откат. Совпадает с `sc.open`,
   *  пока ПЕРВОЕ число не назвал игрок. Зеркало backend GameState.frame_open. */
  frameOpen: number;
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
  // Анти-гейминг с памятью на ВСЮ партию: слова и приёмы каждого хода игрока.
  // Памяти на одну прошлую реплику не хватало — чередование A,B,A,B обходило
  // проверку целиком. Зеркало backend Session.move_history.
  moveHistory: { tokens: Set<string>; moves: Set<string> }[];
  /** Хроника хода ГЛАЗАМИ ОППОНЕНТА — по записи на каждый applyMove с тем, что
   *  движок уже посчитал. НОВЫХ СИГНАЛОВ ЗДЕСЬ НЕТ: только те, что уже
   *  поучаствовали в ходе, и в scoreSession ничего из этого не заходит
   *  (инвариант 6). Зеркало backend Session.ledger. */
  ledger: LedgerEntry[];
}

/** Одна запись хроники. Голые факты движка; прозу по ним собирает herSide().
 *  Зеркало записи, которую кладёт engine.py::apply_move. */
export interface LedgerEntry {
  turn: number;
  text: string;
  reaction: string;
  moves: string[];
  deltas: Deltas;
  events: string[];
  rollback: number;
  repeat: number;
  /** Индекс интереса, вскрытого ЭТИМ ходом, или null. */
  revealed: number | null;
  /** Вопрос задан, но доверия не хватило до порога вскрытия. */
  gated: boolean;
  offerBefore: number;
  offerAfter: number;
  closed: boolean;
  status: Status;
}

export function newSession(sc: ScenarioDef, lang: Lang): Session {
  return {
    sc, lang, lowerBetter: sc.dir === "low", difficulty: sc.diff, turn: 0, maxTurns: 12,
    // Seed leverage from BATNA strength (× 0.4) exactly like the backend engine.
    trust: 40, tension: 25, info: 0, leverage: sc.batnaStrength * 0.4,
    offerOpp: sc.open, offerPlayer: null, frameOpen: sc.open,
    interests: [], tradeoffs: [], termsConceded: [], deal: null, status: "active",
    met: {
      argSum: 0, argN: 0, threats: 0, hostiles: 0, empathy: 0, crit: 0,
      spin: new Set(), probes: 0, repeatSum: 0, repeatN: 0, openingAnchor: false,
    },
    lastPlayerNorm: "",
    moveHistory: [],
    ledger: [],
  };
}

// Which hidden interest does an OFFLINE probe uncover? Интерес вскрывается ТОЛЬКО
// по теме вопроса (зеркало backend _reveal_index_offline). Прежде здесь стоял
// запасной ход «не совпало — отдай следующий по списку», и три одинаковых общих
// «Почему?» вскрывали все три интереса: главный тезис продукта выполнялся
// троекратным нажатием подсказанной кнопки. Не совпало — не вскрыли.
// Слово темы короче четырёх букв в основы не идёт: «в», «и», «с» совпадут с чем
// угодно. Хвост в две буквы срезается ради русской морфологии — «оплата» обязана
// ловить «оплате» и «оплату», иначе тема, написанная на чипе, не работала бы в
// той форме, в какой её произносит человек. Зеркало engine.py::_TOPIC_MIN_WORD.
const TOPIC_MIN_WORD = 4;

/** Основы, по которым засчитывается попадание ПО ТЕМЕ. Выводятся из самого
 *  ярлыка темы — того, что игрок читает чипом на столе: что написано на чипе, то
 *  и работает, и разъехаться эти две вещи не могут по построению.
 *  Зеркало engine.py::_topic_stems. */
export function topicStems(label: string): string[] {
  const out: string[] = [];
  for (const w of norm(label).split(" ")) {
    if (w.length < TOPIC_MIN_WORD) continue;
    out.push(w.slice(0, Math.max(TOPIC_MIN_WORD, w.length - 2)));
  }
  return out;
}

// ПОПАДАНИЕ ПО НАЗВАНИЮ ТЕМЫ РАВНО ПОПАДАНИЮ ПО КЛЮЧЕВОМУ СЛОВУ. Один
// keyword-путь требовал НАЗВАТЬ СОДЕРЖАНИЕ СЕКРЕТА, чтобы секрет открылся:
// «что для вас важнее всего в этой сделке?» давало probe_vague, а «что для вас
// важно в загрузке производства?» — вскрытие. Темы игрок видит на столе, значит
// вопрос по теме это ВЫБОР, а не угадывание. Зеркало engine.py.
function revealIndexOffline(sc: ScenarioDef, curNorm: string, lang: Lang, found: number[]): number | null {
  const total = sc.interests[lang].length;
  const kw = sc.hiddenInterestKeywords?.[lang] ?? [];
  const topics = sc.interestTopics?.[lang] ?? [];
  if (!kw.length && !topics.length) return null;
  for (let i = 0; i < total; i++) {
    if (found.includes(i)) continue;
    if (i < kw.length && has(curNorm, kw[i])) return i;
    if (i < topics.length && has(curNorm, topicStems(topics[i]))) return i;
  }
  return null;
}

/** Слова реплики без краевой пунктуации — основа лексической близости.
 *  Зеркало engine.py::_tokens. */
function tokensOf(curNorm: string): Set<string> {
  const out = new Set<string>();
  for (const raw of curNorm.split(" ")) {
    const w = raw.replace(/^[.,?!-]+|[.,?!-]+$/g, "");
    if (w) out.add(w);
  }
  return out;
}

/** Порог «это та же реплика»: жёсткий штраф (как за дословный повтор). */
export const REPEAT_HARD = 0.85;
/** Порог «это перепев»: мягкий штраф, растущий со сходством. */
export const REPEAT_SOFT = 0.5;

/** Насколько сильно ход повторяет ЛЮБОЙ прошлый ход этой партии (0..1).
 *  Мера — Жаккар по словам, поднятый на 0.15 при совпадении множества приёмов.
 *  Зеркало engine.py::_repeat_strength. */
function repeatStrength(s: Session, tokens: Set<string>, moves: Set<string>): number {
  let best = 0;
  for (const prev of s.moveHistory) {
    const union = new Set([...tokens, ...prev.tokens]);
    if (union.size === 0) continue;
    let inter = 0;
    for (const w of tokens) if (prev.tokens.has(w)) inter++;
    let j = inter / union.size;
    if (moves.size && sameSet(moves, prev.moves)) j = Math.min(1, j + 0.15);
    if (j > best) best = j;
  }
  return best;
}

function sameSet(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

/** Цена это или просто число? Возвращает цену в единицах сценария либо null.
 *  Коридор — [0.5×, 2×] от масштаба сценария; ветка ×1000 оставлена только для
 *  единиц самого сценария. Зеркало engine.py::_plausible_offer. */
function plausibleOffer(sc: ScenarioDef, n: number): number | null {
  const corners = [sc.open, sc.floor, sc.target, sc.resv];
  const scale = (sc.open + sc.floor + sc.target + sc.resv) / 4;
  if (scale <= 0) return n;
  // Собственные числа стола всегда правдоподобны: на «Конфликте отделов» углы
  // 20/6/5/12 дают коридор [5.38, 21.5], и цель игрока из брифа (5) переставала
  // быть офертой. Зеркало engine.py::_plausible_offer.
  const lo = Math.min(0.5 * scale, Math.min(...corners));
  const hi = Math.max(2 * scale, Math.max(...corners));
  if (n >= lo && n <= hi) return n;
  // Оба направления пересчёта, и оба — единицы САМОГО сценария. «1040», когда
  // стол считает тысячами, и «70 тысяч» на столе, который считает тысячами:
  // человек назвал ту же величину в другой записи, а не другое число.
  for (const c of [n * 1000, n / 1000]) {
    if (c >= lo && c <= hi) return Math.round(c * 100) / 100;
  }
  return null;
}

/** Середина шкалы сложности (2..5 у восьми готовых столов; своя сделка может
 *  прислать 1). Множитель сопротивления считается ОТ НЕЁ, а не от самого лёгкого
 *  стола: иначе «привязать сложность» означало бы «сделать всем хуже, кроме
 *  двойки». Зеркало engine.py::DIFFICULTY_MID. */
export const DIFFICULTY_MID = 3.5;
/** Шаг сопротивления на единицу сложности: путь от 2 к 5 меняет заработанную
 *  уступку на ±9 % от середины. Зеркало engine.py::DIFFICULTY_CONCESSION_K. */
export const DIFFICULTY_CONCESSION_K = 0.06;
/** Прибавка к порогу доверия за единицу сложности сверх двойки.
 *  Зеркало engine.py::DIFFICULTY_TRUST_GATE_STEP. */
export const DIFFICULTY_TRUST_GATE_STEP = 2;
/** Порог доверия для вскрытия интереса у самого лёгкого стола. */
export const REVEAL_TRUST_GATE_BASE = 30;

/** Сложность сессии, зажатая в шкалу карточки (1..5). */
function difficultyOf(s: Session): number {
  return Math.max(1, Math.min(5, s.difficulty));
}

/** Во сколько раз сложность стола меняет ЗАРАБОТАННУЮ уступку.
 *  Множитель, а не прибавка: инвариант 1 держится тем, что уступка — доля
 *  оставшегося пути до дна. Трудный собеседник не отказывается двигаться, он
 *  двигается скупее на то же событие; лёгкий, наоборот, щедрее.
 *  Зеркало engine.py::resistance. */
export function resistance(s: Session): number {
  return 1 + DIFFICULTY_CONCESSION_K * (DIFFICULTY_MID - difficultyOf(s));
}

/** Порог доверия, ниже которого интерес не вскрывается: у трудного собеседника
 *  открыться должно быть труднее. Зеркало engine.py::reveal_trust_gate. */
export function revealTrustGate(s: Session): number {
  return REVEAL_TRUST_GATE_BASE + DIFFICULTY_TRUST_GATE_STEP * (difficultyOf(s) - 2);
}

export function flex(s: Session): number {
  const raw =
    0.45 * (s.trust / 100) + 0.3 * (s.info / 100) + 0.25 * (clamp(s.leverage) / 100) - 0.5 * (s.tension / 100);
  return clamp(raw, 0, 1);
}
/** Из каких шагов выбирается шаг цены: живые люди двигаются на 5, на 0.5, на 1 —
 *  но не на 1.37. Зеркало engine.py::_NICE_STEPS. */
const NICE_STEPS = [0.01, 0.02, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 25, 50];

/** Шаг цены выводится из размаха шкалы, а не вписывается числом: шкалы девяти
 *  столов отличаются в двести раз, а «своя сделка» генерируется на ходу.
 *  Зеркало engine.py::price_step. */
export function priceStep(sc: ScenarioDef): number {
  const span = Math.abs(sc.open - sc.floor);
  if (span <= 0) return 0.01;
  const target = span / 16;
  return NICE_STEPS.reduce((a, b) => (Math.abs(b - target) < Math.abs(a - target) ? b : a));
}

function concede(s: Session, f: number): void {
  const moved = s.offerOpp + (s.sc.floor - s.offerOpp) * f;
  const step = priceStep(s.sc);
  // Округляем ПРОТИВ движения: оппонент уступает ровно на человеческий шаг и ни
  // копейкой больше, поэтому дно от округления только дальше (инвариант 1).
  const units = moved / step;
  let snapped = (s.sc.floor < s.offerOpp ? Math.ceil(units) : Math.floor(units)) * step;
  // Шаг не должен съесть уступку целиком.
  const dist = (s.sc.floor - s.offerOpp) * f;
  if (Math.abs(snapped - s.offerOpp) < step / 2 && Math.abs(dist) > step / 2) {
    snapped = s.offerOpp + (s.sc.floor < s.offerOpp ? -step : step);
  }
  s.offerOpp = Math.round(snapped * 100) / 100;
}
// Обратный ход: оппонент снимает часть уже данной уступки, цена уходит назад к
// РАМКЕ стола. Наказание, которого не видно в цифре, — не наказание. Рамку мог
// сдвинуть первый якорь игрока (см. anchorFrame), поэтому здесь frameOpen, а не
// sc.open: иначе одна грубость возвращала бы стол к цифре, которую оппонент так
// и не произнёс. Зеркало engine.py::_retract.
function retract(s: Session, f: number): void {
  s.offerOpp = Math.round((s.offerOpp + (s.frameOpen - s.offerOpp) * f) * 100) / 100;
}

/** Доля расстояния до якоря игрока, на которую сдвигается рамка стола, и
 *  потолок сдвига в долях размаха «открытие ↔ дно». Потолок нужен затем, чтобы
 *  наглый якорь не тянул сильнее обоснованного: иначе урок «цифра стоит на
 *  критерии» превращался бы в «называй меньше». Зеркало engine.py. */
const FIRST_WORD_PULL = 0.25;
const FIRST_WORD_CAP = 0.2;
/** Порог качества довода, на котором критерий засчитывается СОБЫТИЕМ. */
const CRITERIA_EVENT_MIN = 35;

/** Первое названное число задаёт рамку: позиция оппонента едет к игроку.
 *  Сдвиг идёт ТОЛЬКО в сторону игрока, ограничен долей размаха и никогда не
 *  переходит дно (инвариант 1). Зеркало engine.py::_anchor_frame. */
function anchorFrame(s: Session, anchor: number): boolean {
  const floor = s.sc.floor;
  const span = Math.abs(s.sc.open - floor);
  const gap = anchor - s.offerOpp;
  const towardPlayer = s.lowerBetter ? gap < 0 : gap > 0;
  if (span <= 0 || !towardPlayer) return false;
  const shift = Math.min(Math.abs(gap) * FIRST_WORD_PULL, span * FIRST_WORD_CAP);
  const moved = s.offerOpp + Math.sign(gap) * shift;
  const step = priceStep(s.sc);
  const units = moved / step;
  let snapped = (floor < s.offerOpp ? Math.ceil(units) : Math.floor(units)) * step;
  snapped = floor < s.offerOpp ? Math.max(snapped, floor) : Math.min(snapped, floor);
  if (Math.abs(snapped - s.offerOpp) < 1e-9) return false;
  s.offerOpp = Math.round(snapped * 100) / 100;
  s.frameOpen = s.offerOpp;
  return true;
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
  // Анти-гейминг с памятью на всю партию (зеркало backend). Точное равенство с
  // ОДНОЙ прошлой репликой ловило только самый ленивый спам: чередование
  // A,B,A,B проходило насквозь, а тот же абзац с переставленной цифрой — тем
  // более. Считаем сходство со всеми ходами партии и штрафуем непрерывно.
  const curTokens = tokensOf(curNorm);
  const curMoves = new Set(a.moves);
  const repeat = curNorm ? repeatStrength(s, curTokens, curMoves) : 0;
  s.moveHistory.push({ tokens: curTokens, moves: curMoves });
  s.lastPlayerNorm = curNorm;
  const repeated = repeat >= REPEAT_HARD;
  if (repeated) a.arg = Math.min(a.arg, 12);
  else if (repeat >= REPEAT_SOFT) a.arg = Math.min(a.arg, Math.round(100 * (1 - repeat)));
  const b = { trust: s.trust, tension: s.tension, info: s.info, leverage: s.leverage, offerOpp: s.offerOpp };
  const m = s.met;
  m.argSum += a.arg; m.argN++;
  // В счёт идёт только сходство ВЫШЕ мягкого порога: живая партия неизбежно
  // повторяет слова, и штрафовать за это нельзя.
  m.repeatSum += Math.max(0, repeat - REPEAT_SOFT) / (1 - REPEAT_SOFT); m.repeatN++;
  if (a.spin) m.spin.add(a.spin);
  const H = (k: string) => a.moves.includes(k);
  let reaction = "neutral";
  let cf = 0;
  // Что в ЭТОМ ходе заработало движение цены. Пусто — оппонент не двигается.
  // Раньше к дроби уступки безусловно прибавлялась база 0.10 + 0.34·flex, и цена
  // капала сама: двенадцать пустых реплик проходили почти весь путь до дна.
  const events: string[] = [];
  // Обратный ход: доля уже данной уступки, которую оппонент снимает.
  let rollback = 0;
  // Для хроники (s.ledger): КАКОЙ интерес вскрыт этим ходом и был ли вопрос
  // закрыт порогом доверия. Обе величины движок и так вычисляет ниже.
  let revealedIdx: number | null = null;
  let probeGated = false;
  // Повтор не слушают — его вставляют. Отражение чужих слов работает один раз.
  if (H("acknowledge") && !repeated) { s.trust = clamp(s.trust + 8); s.tension = clamp(s.tension - 10); m.empathy++; reaction = "warmed"; }
  if ((a.spin || H("interests_probe")) && !repeated) {
    const gb = a.spin === "implication" || a.spin === "need-payoff" ? 22 : 14;
    let g = gb + (H("interests_probe") ? 10 : 0);
    // Honest reveal: вскрывается только тот интерес, в который вопрос попал по
    // теме. Reveal gated on trust, like info.
    let revealed = false;
    probeGated = s.trust <= revealTrustGate(s);
    if (s.trust > revealTrustGate(s)) {
      const idx = revealIndexOffline(sc, curNorm, s.lang, s.interests);
      if (idx !== null) { s.interests.push(idx); revealed = true; revealedIdx = idx; }
    }
    // Общий вопрос, не попавший ни в один живой интерес, приносит крохи: `info`
    // это доля ВСКРЫТОГО, а не число заданных вопросов.
    if (!revealed) g = Math.min(g, 5);
    s.info = clamp(s.info + g); s.trust = clamp(s.trust + 4); s.tension = clamp(s.tension - 3);
    if (H("interests_probe")) m.probes++;
    if (revealed) {
      events.push("interest");
      // Вскрытие главнее теплоты: реплика, соединившая эмпатию с вопросом об
      // интересе, получала «вот за это я и люблю нормальный разговор» и секрет
      // не называла — при том что счётчик писал «вскрыто 1 из 3». Зеркало
      // engine.py.
      reaction = "opened_up";
    } else if (reaction !== "warmed") {
      // «Почему?» — а что именно вас интересует? Отдельная реакция обязательна:
      // opened_up подставляет в реплику текст интереса, и на невскрытом вопросе
      // это была бы выдача секрета за спиной у счётчика.
      reaction = "probe_vague";
    }
  }
  // ПОЧЕМУ ЗДЕСЬ НЕТ ВЕТО СУДЬИ. На сервере живой судья может снять начисление
  // за критерий, размен и BATNA (criteria_legitimate / tradeoff_real /
  // batna_real = false): он читает смысл, а не словарь. У офлайн-ядра источника
  // такого вето нет и быть не может — судья это сетевой вызов, а инвариант 5
  // требует полной играбельности без сети. Поэтому зеркало повторяет ровно
  // keyword-путь сервера, то есть путь `judge is None`, — и паритет (инвариант
  // 8) держится именно на том, что серверное вето включается ТОЛЬКО при живом
  // судье. Появится вето здесь — разъедутся оба ядра.
  if (H("objective_criteria")) {
    s.leverage = clamp(s.leverage + 16); s.trust = clamp(s.trust + 3); m.crit++;
    if (style === "analytical") s.leverage = clamp(s.leverage + 6);
    // Критерий засчитан событием только с опорой: голое слово «рынок» без цифры
    // и без «потому что» — это не критерий, а его имитация.
    if (a.arg >= CRITERIA_EVENT_MIN) events.push("criteria");
    reaction = "persuaded";
  }
  if (H("batna")) {
    const bk = H("objective_criteria") || a.arg > 55;
    s.leverage = clamp(s.leverage + (bk ? 18 : 10));
    s.tension = clamp(s.tension + (bk ? 4 : 14));
    if (style === "relationship") s.tension = clamp(s.tension + 6);
    // Двигает цену ОБОСНОВАННАЯ альтернатива, названная вслух — только напряжение.
    if (bk) events.push("batna");
    reaction = "pressured";
  }
  if (H("tradeoff")) {
    s.trust = clamp(s.trust + 6); s.tension = clamp(s.tension - 4);
    cf += 0.12 + 0.18 * (s.info / 100);
    events.push("tradeoff");
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
        events.push("term:" + iss.id);
        s.trust = clamp(s.trust + 3 + 4 * iss.oppValue);
      }
    }
  }
  if (H("threat")) {
    m.threats++; s.tension = clamp(s.tension + 22); s.trust = clamp(s.trust - 14); s.leverage = clamp(s.leverage + 6);
    if (style === "tough") s.tension = clamp(s.tension + 8);
    // Повторная угроза — обратный ход: один ультиматум ещё можно списать на
    // нервы, второй — это стиль.
    if (m.threats >= 2) rollback = Math.max(rollback, 0.2);
    reaction = "hardened";
  }
  if (H("hostile")) {
    m.hostiles++; s.tension = clamp(s.tension + 26); s.trust = clamp(s.trust - 22);
    // Хамство откатывает цену назад, к стартовому якорю.
    rollback = Math.max(rollback, 0.35);
    reaction = "offended";
  }
  if (H("rapport") && !repeated) { s.trust = clamp(s.trust + 5); s.tension = clamp(s.tension - 4); }
  // Намерение назвать цену — необходимое условие, но не достаточное: число
  // обязано попасть в коридор масштаба сценария (зеркало backend).
  let priced: number | null = null;
  if (a.number !== null && (H("offer") || H("anchor") || H("concession") || H("accept") || H("tradeoff"))) {
    priced = plausibleOffer(sc, a.number);
    if (priced !== null) {
      s.offerPlayer = priced;
      // Показанное число обязано совпасть с тем, по которому считал движок.
      a.number = priced;
    }
  }
  // Право первого слова: обоснованный якорь двигает РАМКУ. Условия ровно те,
  // которым учит упражнение курса `an-07`/`an-10`: цифра, приём «якорение»,
  // критерий — и всё это ДО того, как оппонент положил на стол свою цифру.
  // Зеркало engine.py.
  if (
    s.ledger.length === 0 && s.turn <= 1 && priced !== null &&
    H("anchor") && H("objective_criteria") && a.arg >= CRITERIA_EVENT_MIN &&
    anchorFrame(s, priced)
  ) {
    m.openingAnchor = true;
  }
  // Гибкость больше НЕ порождает движение сама по себе: она лишь превращает
  // заработанное событие в рубли.
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
  // Ни одного события — оппонент не двигается ВООБЩЕ.
  if (events.length === 0) cf = 0;
  // Сложность стола — множитель к ЗАРАБОТАННОМУ движению, и только к нему.
  // Стоит ПОСЛЕ обнуления без события: трудный стол уступает скупее, но повод
  // уступить он не отменяет и не выдумывает. Нулю множитель не поможет.
  cf *= resistance(s);
  if (s.tension > 75) cf *= 0.25;
  else if (s.tension > 55) cf *= 0.6;
  // Повтор — не ход: чем ближе реплика к уже сказанному, тем меньше движения.
  if (repeat >= REPEAT_SOFT) cf *= Math.max(0.15, 1 - repeat);
  cf = clamp(cf, 0, 0.7);
  // Обратный ход старше уступки: в ход, где нагрубили или дожали второй
  // угрозой, цена уходит назад, а не вперёд.
  if (rollback > 0) { cf = 0; retract(s, rollback); }
  else if (cf > 0.01) concede(s, cf);
  // Повтор не заставляет оппонента реагировать ЗАНОВО — он уже ответил на эту
  // реплику. Грубость и угрозы исключение: их повтор ранит каждый раз, иначе
  // агрессивная партия перестала бы срываться (инвариант 2).
  if (repeated && !(H("hostile") || H("threat"))) {
    s.trust = b.trust; s.tension = b.tension; s.info = b.info; s.leverage = b.leverage;
    s.tension = clamp(s.tension + 6); // …но раздражает: «вы это уже говорили»
    reaction = "neutral";
  }
  let closed = false;
  if (H("accept")) {
    // Число вне коридора сценария — это не оферта, а провал закрытия. Прежде
    // «Договорились, 42» проходило через клампы к дну оппонента и одной фразой
    // давало economic 100.
    const statedUnpriced = a.number !== null && priced === null;
    let noBridge = false;
    let meeting: number;
    if (priced !== null) {
      const gap = s.lowerBetter ? s.offerOpp - priced : priced - s.offerOpp;
      // Хвостик в пару процентов от хода якоря — это уже рукопожатие.
      const near = Math.abs(gap) <= 0.02 * Math.abs(sc.open - sc.floor);
      if (gap <= 0 || near) meeting = priced;
      else {
        // Разрыв закрывают ТЕМ ЖЕ, чем двигают цену: заработанным событием.
        const w = events.length ? 0.3 + 0.45 * fl : 0;
        meeting = Math.round((s.offerOpp + (priced - s.offerOpp) * w) * 100) / 100;
        noBridge = events.length === 0;
      }
    } else {
      // Голое «договорились» — согласие на ТО, ЧТО ЛЕЖИТ НА СТОЛЕ.
      meeting = s.offerOpp;
    }
    if (statedUnpriced || noBridge || !acceptable(s, meeting)) {
      s.tension = clamp(s.tension + 8); // не сошлись — это стоит нервов
      reaction = "not_yet";
    } else { s.deal = meeting; s.status = "agreement"; closed = true; }
  }
  // Срыв старше рукопожатия. Одна реплика умеет и то и другое сразу — «По рукам,
  // вы врёте, но ладно»: accept успевает записать сделку, а хамство в той же
  // строке добивает напряжение до ста. Оставить число значит показать на столе
  // цену сделки, которой нет. Зеркало engine.py (инвариант 8).
  if (s.tension >= 100 || s.trust <= 3) { s.status = "breakdown"; closed = true; reaction = "walked_out"; s.deal = null; }
  const deltas: Deltas = {
    trust: s.trust - b.trust,
    tension: s.tension - b.tension,
    info: s.info - b.info,
    leverage: s.leverage - b.leverage,
  };
  // Хроника хода для разбора «с той стороны стола». Пишется ПОСЛЕ всего —
  // включая срыв, который старше рукопожатия, — поэтому запись отражает
  // окончательное решение движка. Номер хода считается по самой хронике, а не
  // по s.turn: счётчик крутит вызывающая сторона. Зеркало engine.py.
  s.ledger.push({
    turn: s.ledger.length + 1,
    text: rawText,
    reaction,
    moves: [...a.moves].sort(),
    deltas,
    events: [...events],
    rollback,
    repeat: Math.round(repeat * 100) / 100,
    revealed: revealedIdx,
    gated: probeGated,
    offerBefore: Math.round(b.offerOpp * 100) / 100,
    offerAfter: Math.round(s.offerOpp * 100) / 100,
    closed,
    status: s.status,
  });
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
    // Общий вопрос, не попавший ни в один интерес. Отдельная реакция нужна ради
    // второго принципа: opened_up подставляет в реплику текст интереса, и на
    // невскрытом вопросе оппонент выдал бы секрет, которого счётчик не засчитал.
    probe_vague: {
      base: [
        "Почему — а что именно вас интересует? Спросите конкретнее.",
        "Смотря о чём вы. Что именно вам важно понять?",
        "Вопрос широкий. Про что конкретно спрашиваете?",
        "Так сразу и не ответишь. Уточните, о чём речь?",
        "Про что именно? Тем тут хватает.",
        "Можно поконкретнее? Иначе отвечу общими словами.",
      ],
      relationship: ["Я бы рада ответить, но спросите поконкретнее — о чём именно?", "Давайте по-человечески: что именно вас интересует?"],
      tough: ["Что именно? Общие вопросы — общие ответы.", "Конкретнее. Про что спрашиваете?"],
      analytical: ["Вопрос сформулирован широко. Уточните предмет.", "О каком именно факторе речь?"],
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
    // A generic question that hit no live interest — see the RU bank above.
    probe_vague: {
      base: [
        "Why — but what exactly are you asking about? Be specific.",
        "Depends what you mean. What is it you want to understand?",
        "That's a broad question. About what exactly?",
        "Hard to answer like that. Narrow it down?",
        "About what specifically? There's plenty here.",
        "Could you be more concrete? Otherwise you'll get platitudes.",
      ],
      relationship: ["I'd love to answer, but ask me something specific — about what?", "Let's keep it human: what exactly matters to you here?"],
      tough: ["What exactly? Generic questions get generic answers.", "Be specific. What are you asking?"],
      analytical: ["The question is stated too broadly. Specify the subject.", "Which factor exactly are we talking about?"],
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
  // Цифра в реплике оппонента печатается по тем же правилам, что и в разборе:
  // разделитель по языку и узкий пробел перед знаком валюты (иначе «100₽/шт»
  // слипается в один глиф).
  return l
    .replace("{o}{u}", formatDeal(s.offerOpp, u, s.lang))
    .replace("{d}{u}", formatDeal(s.deal != null ? s.deal : s.offerOpp, u, s.lang))
    .replace("{o}", formatNumber(s.offerOpp, s.lang))
    .replace("{d}", formatNumber(s.deal != null ? s.deal : s.offerOpp, s.lang))
    .replace("{u}", u)
    .replace("{i}", (li || "").toLowerCase());
}

export function greetingText(s: Session): string {
  const sc = s.sc;
  return s.lang === "ru"
    ? `Здравствуйте. Я ${sc.cp.nm.ru}. Свою цифру я назову, но начать предлагаю вам — с чего начнём?`
    : `Hello. I'm ${sc.cp.nm.en}. I'll name my figure, but I'd rather you start — where shall we begin?`;
}

// ---------- state view (protocol) ----------
export function stateView(s: Session): StateView {
  return {
    trust: Math.round(s.trust),
    tension: Math.round(s.tension),
    info: Math.round(s.info),
    leverage: Math.round(flex(s) * 100),
    offer_opp: s.offerOpp,
    deal: s.deal ?? null,   // settled price; see StateView.deal
    offer_player: s.offerPlayer,
    interests_found: s.interests.length,
    interests_total: s.sc.interests[s.lang].length,
    // Занавес, начатый ЗА СТОЛОМ: тема едет всегда (она не секрет), текст
    // интереса — только у вскрытых. Зеркало engine.py::_interest_slots.
    interests: (s.sc.interestTopics?.[s.lang]?.length
      ? s.sc.interests[s.lang].map((text, i) => ({
          topic: s.sc.interestTopics[s.lang][i] ?? "",
          text: s.interests.includes(i) ? text : null,
        }))
      : []),
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
    // Печатаем на языке сессии, а не по-джаваскриптовому: стол и разбор обязаны
    // показывать одно число одними знаками. Зеркало backend engine/format.py.
    dealText = formatDeal(s.deal, u, lang);
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
  // Первое слово: обоснованный якорь, поставленный ДО цифры оппонента. Приём
  // был в словаре и на чипе под композером, а в счёте не стоил ничего.
  technique += m.openingAnchor ? 6 : 0;
  technique += m.probes > 0 ? 14 : 0;
  technique += s.interests.length >= sc.interests[lang].length ? 12 : s.interests.length * 4;
  technique += s.tradeoffs.length > 0 ? 12 : 0;
  technique += m.empathy > 0 ? 8 : 0;
  technique += Math.round((avgArg / 100) * 14);
  technique -= m.hostiles * 12;
  technique -= Math.max(0, m.threats - 1) * 6;
  // Доля партии, ушедшая на повторы. Ход, который уже был, — не приём: без
  // этого один сильный абзац, вставленный одиннадцать раз, набирал столько же
  // флагов техники, сколько живая партия. Зеркало backend score_session.
  if (m.repeatN) technique -= Math.round(20 * (m.repeatSum / m.repeatN));
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
    // «С той стороны стола». На сервере колонку приклеивает адаптер
    // (views.debrief_view); здесь адаптера нет — MockServer отдаёт то, что
    // вернул scoreSession, — поэтому она собирается прямо тут.
    her_side: herSide(s),
  };
}

// ---------- «С той стороны стола» (зеркало views.py::her_side) ----------
//
// Разбор глазами оппонента: ход за ходом, что происходило У НЕЁ. ЧИСТАЯ ФУНКЦИЯ
// ОТ СОСТОЯНИЯ ДВИЖКА — собирается из хроники `Session.ledger`, которую пишет
// applyMove, и потому одинаково полна с сетью и без неё (инвариант 5). Ни один
// сигнал отсюда не заходит в scoreSession (инвариант 6): это послесловие.
//
// ТЕКСТ СВЕРЯЕТСЯ С СЕРВЕРОМ ПОСИМВОЛЬНО: строки ниже — те же, что в
// services/gateway/app/views.py, а games.test.ts прогоняет эталонные партии и
// требует совпадения колонки целиком (инвариант 8). Менять — в двух местах.
//
// ФОРМУЛИРОВКИ БЕЗРОДОВЫЕ. Половина персон мужчины, половина женщины, а поля
// пола у ScenarioDef нет вовсе — прошедшее время первого лица («я убрала»)
// развалило бы либо половину столов, либо паритет. Настоящее время работает
// везде и звучит живее.
const HER_QUOTE_MAX = 140;

/** Значение — либо одна реплика, либо список вариантов: список стоит там, где
 *  случай выпадает в партии несколько раз подряд. Зеркало views.py::_HER. */
type HerLine = Record<Lang, string>;
type HerBank = Record<string, Record<string, HerLine | HerLine[]>>;
const HER: HerBank = {
  "walked_out": {
    "base": {
      "ru": "Всё, разговор окончен. Я встаю из-за стола.",
      "en": "That's it, we're done. I'm getting up from the table."
    },
    "relationship": {
      "ru": "Мне жаль, но так дальше нельзя. Я ухожу.",
      "en": "I'm sorry, but this can't go on. I'm leaving."
    },
    "tough": {
      "ru": "Хватит. Мы закончили.",
      "en": "Enough. We're finished here."
    },
    "analytical": {
      "ru": "Дальше считать нечего. Я закрываю папку.",
      "en": "There's nothing left to compute. I'm closing the file."
    }
  },
  "closed": {
    "base": {
      "ru": "По рукам. На этой цифре я подписываю — торговаться больше не о чем.",
      "en": "Deal. I'll sign at that number — there's nothing left to haggle over."
    },
    "relationship": {
      "ru": "По рукам, и мне правда приятно, чем это кончилось. Работаем.",
      "en": "Deal — and I'm genuinely glad this is how it ended. Let's work."
    },
    "tough": {
      "ru": "Ладно. По рукам, пока я не передумал. Дальше — по документам.",
      "en": "Fine. Deal, before I change my mind. Paperwork next."
    },
    "analytical": {
      "ru": "Сходится. На этой цифре подписываю — расчёт закрыт.",
      "en": "It checks out. I'll sign at that number — the math is closed."
    }
  },
  "hostile": {
    "base": {
      "ru": "Это уже не про сделку, а про меня лично. В таком тоне я не работаю — и то, что уже уступил, возвращаю назад.",
      "en": "That stopped being about the deal and became about me. I don't work in that tone — and the concession goes back."
    },
    "relationship": {
      "ru": "Мне просто обидно. Я двигаюсь вам навстречу, а в ответ слышу вот это — уступку возвращаю назад.",
      "en": "That simply hurts. I keep moving toward you and get this in return — so my concession goes back."
    },
    "tough": {
      "ru": "Хамить мне не надо, тут вы соперника не найдёте. Раз так — моё предложение снова прежнее.",
      "en": "Don't take that tone with me, you won't win that game. Fine — my offer is back where it started."
    },
    "analytical": {
      "ru": "К цифрам это отношения не имеет. Возвращаю предложение к исходному — считать будем заново.",
      "en": "None of that touches the numbers. I'm resetting my offer — we'll count again."
    }
  },
  "threat_again": {
    "base": {
      "ru": "Второй ультиматум подряд — это уже не нервы, а способ разговаривать. Половину уступки я забираю обратно.",
      "en": "A second ultimatum in a row isn't nerves any more, it's a method. Half of my concession goes back."
    },
    "tough": {
      "ru": "Давите второй раз — значит, аргументы кончились. Уступку снимаю.",
      "en": "Pressing twice means the arguments ran out. The concession is off."
    }
  },
  "threat_backed": {
    "base": {
      "ru": "Альтернатива у вас и правда есть, и вы её обосновали. Приятного мало, но считаться приходится.",
      "en": "You do have an alternative, and you backed it up. I don't enjoy it, but I have to reckon with it."
    },
    "analytical": {
      "ru": "Альтернатива названа и подкреплена. Это довод, а не давление, — принимаю к расчёту.",
      "en": "The alternative is named and supported. That's an argument, not pressure — I'll factor it in."
    }
  },
  "threat_bare": {
    "base": {
      "ru": "Это прозвучало как угроза без опоры. Напряжение выросло, а двигаться под таким разговором я не стану.",
      "en": "That landed as a threat with nothing behind it. Tension is up, and I won't move under that."
    },
    "relationship": {
      "ru": "Зачем так? Мы же разговаривали по-человечески. Под ультиматум я не подвинусь.",
      "en": "Why like that? We were talking like people. I won't move under an ultimatum."
    },
    "tough": {
      "ru": "Угрозы? Я в этом деле давно. Ничего, кроме напряжения, вы этим не добились.",
      "en": "Threats? I've been at this a long time. All you got was tension."
    }
  },
  "batna_backed": {
    "base": {
      "ru": "Альтернатива названа и подкреплена — это довод, а не пугалка. Приходится считаться.",
      "en": "The alternative is named and backed — that's an argument, not a scare. I have to reckon with it."
    },
    "analytical": {
      "ru": "Альтернатива с цифрами. Такое я кладу в расчёт, а не в спор.",
      "en": "An alternative with numbers. That goes into my model, not into an argument."
    }
  },
  "batna_bare": {
    "base": {
      "ru": "Вы намекаете, что есть кому позвонить кроме меня. Ни цифр, ни условий за этим нет — давит, но не убеждает.",
      "en": "You're hinting there's someone else you could call. No numbers, no terms behind it — that pushes, but it doesn't persuade."
    },
    "relationship": {
      "ru": "Значит, вы уже смотрите на сторону. Мне это неприятно слышать, и ближе мы от этого не стали.",
      "en": "So you're already looking elsewhere. I don't enjoy hearing that, and it didn't bring us closer."
    },
    "tough": {
      "ru": "Альтернатива? Попробуйте. Пока это просто слова.",
      "en": "An alternative? Go ahead and try. So far those are just words."
    }
  },
  "bare_offer": {
    "base": {
      "ru": "Число вы назвали, а чем оно обосновано — нет. Позицию я слышу, повода двигаться не вижу.",
      "en": "You named a number but not what backs it. I hear the position; I don't hear a reason to move."
    },
    "analytical": {
      "ru": "Цифра без модели за ней. Мне не с чем её сопоставить.",
      "en": "A figure with no model behind it. I have nothing to compare it against."
    },
    "tough": {
      "ru": "Просто цифра. И что дальше?",
      "en": "Just a number. And then what?"
    }
  },
  "repeat": {
    "base": {
      "ru": "Вы это уже говорили. Второй раз то же самое не работает — и ответ у меня тот же.",
      "en": "You've said this already. The same line twice doesn't work — and my answer is the same."
    }
  },
  "not_yet": {
    "base": {
      "ru": "Вы предлагаете ударить по рукам, но повода сойтись именно на этой цифре я не вижу. Пока нет.",
      "en": "You're offering to shake hands, but I see no reason to settle at that number. Not yet."
    },
    "analytical": {
      "ru": "Цифра названа, обоснование — нет. Сойтись на ней я не могу.",
      "en": "The number is named, the rationale isn't. I can't settle there."
    }
  },
  "revealed": {
    "base": [
      {
        "ru": "Вы попали в тему: {topic}. Раз спрашиваете по делу — рассказываю то, что обычно держу при себе.",
        "en": "You hit the topic: {topic}. Since you're asking properly, I tell you what I usually keep to myself."
      },
      {
        "ru": "И снова по адресу: {topic}. Хорошо, об этом я тоже расскажу.",
        "en": "On target again: {topic}. All right, I'll tell you about that too."
      },
      {
        "ru": "Тема: {topic}. Вы разговорили меня окончательно — держать это при себе больше нет смысла.",
        "en": "Topic: {topic}. You've got me talking for good — there's no point holding this back."
      }
    ],
    "relationship": [
      {
        "ru": "Вы попали в тему: {topic}. Спрашиваете по-доброму — и я открываюсь, хотя обычно этого не делаю.",
        "en": "You hit the topic: {topic}. You ask kindly — so I open up, which I don't usually do."
      },
      {
        "ru": "Опять в точку: {topic}. С вами почему-то легко говорить о своём.",
        "en": "On the nose again: {topic}. Somehow it's easy to talk about my own things with you."
      },
      {
        "ru": "И это тоже — {topic}. Ну вот, теперь вы знаете обо мне почти всё.",
        "en": "That as well — {topic}. There, now you know almost everything about me."
      }
    ],
    "tough": [
      {
        "ru": "Ладно, тема угадана: {topic}. Скажу коротко и по делу, раз спросили.",
        "en": "Fine, you guessed the topic: {topic}. I'll say it short, since you asked."
      },
      {
        "ru": "Снова угадали: {topic}. Ладно, слушайте.",
        "en": "Guessed right again: {topic}. All right, listen."
      },
      {
        "ru": "{topic}. Всё, больше вытягивать из меня нечего.",
        "en": "{topic}. That's it, there's nothing left to pull out of me."
      }
    ],
    "analytical": [
      {
        "ru": "Вопрос по существу, тема: {topic}. Отвечаю фактом, а не общими словами.",
        "en": "A substantive question, topic: {topic}. I answer with a fact, not generalities."
      },
      {
        "ru": "Второй точный вопрос подряд, тема: {topic}. Отвечаю так же прямо.",
        "en": "A second precise question, topic: {topic}. I answer just as directly."
      },
      {
        "ru": "Тема: {topic}. Картина у вас теперь полная — работайте с ней.",
        "en": "Topic: {topic}. You have the full picture now — work with it."
      }
    ]
  },
  "revealed_plain": {
    "base": [
      {
        "ru": "Вопрос попал в цель. Рассказываю то, что обычно держу при себе.",
        "en": "The question landed. I tell you what I usually keep to myself."
      },
      {
        "ru": "И снова в цель. Хорошо, об этом я тоже расскажу.",
        "en": "On target again. All right, I'll tell you about that too."
      },
      {
        "ru": "Вы разговорили меня окончательно — держать это при себе больше нет смысла.",
        "en": "You've got me talking for good — there's no point holding this back."
      }
    ],
    "relationship": [
      {
        "ru": "Спрашиваете по-доброму — и я открываюсь, хотя обычно этого не делаю.",
        "en": "You ask kindly — so I open up, which I don't usually do."
      },
      {
        "ru": "Опять в точку. С вами почему-то легко говорить о своём.",
        "en": "On the nose again. Somehow it's easy to talk about my own things with you."
      },
      {
        "ru": "И это тоже. Ну вот, теперь вы знаете обо мне почти всё.",
        "en": "That as well. There, now you know almost everything about me."
      }
    ],
    "tough": [
      {
        "ru": "Попали. Скажу коротко, раз спросили.",
        "en": "You landed it. Short version, since you asked."
      },
      {
        "ru": "Снова попали. Ладно, слушайте.",
        "en": "Landed it again. All right, listen."
      },
      {
        "ru": "Всё, больше вытягивать из меня нечего.",
        "en": "That's it, there's nothing left to pull out of me."
      }
    ],
    "analytical": [
      {
        "ru": "Вопрос по существу. Отвечаю фактом, а не общими словами.",
        "en": "A substantive question. I answer with a fact, not generalities."
      },
      {
        "ru": "Второй точный вопрос подряд. Отвечаю так же прямо.",
        "en": "A second precise question. I answer just as directly."
      },
      {
        "ru": "Картина у вас теперь полная — работайте с ней.",
        "en": "You have the full picture now — work with it."
      }
    ]
  },
  "gated": {
    "base": {
      "ru": "Вопрос личный, а доверия между нами ещё нет. Отвечаю вежливо и ни о чём.",
      "en": "A personal question, and there's no trust between us yet. I answer politely and say nothing."
    },
    "tough": {
      "ru": "С чего бы мне это вам рассказывать? Мы даже не разговаривали толком.",
      "en": "Why would I tell you that? We've barely talked."
    }
  },
  "probe_vague": {
    "base": {
      "ru": "Вопрос вежливый, но не про меня. Я не понимаю, о чём именно вы спрашиваете, и отвечаю общим.",
      "en": "A polite question, but not about me. I don't know what exactly you're asking, so I answer in generalities."
    },
    "analytical": {
      "ru": "Вопрос без предмета. Непонятно, какую величину вы хотите узнать, — отвечаю общим.",
      "en": "A question with no subject. It's unclear what quantity you're after — so I stay general."
    }
  },
  "term": {
    "base": {
      "ru": "Вот это разговор: {term} — ровно то, что мне нужно. За это можно и подвинуться по цене.",
      "en": "Now we're talking: {term} is exactly what I need. For that I can move on price."
    },
    "tough": {
      "ru": "{term} — вот это по делу. Ладно, за это подвинусь.",
      "en": "{term} — that's the real thing. Fine, I'll move for it."
    },
    "analytical": {
      "ru": "{term} меняет расчёт в мою сторону. Значит, по цене есть куда идти.",
      "en": "{term} changes the math in my favour. So there is room on price."
    }
  },
  "tradeoff": {
    "base": {
      "ru": "Вы предлагаете обмен, а не просто скидку. Это уже разговор о деле — часть пути я пройду.",
      "en": "You're proposing a trade, not just a discount. That's a real conversation — I'll come part of the way."
    }
  },
  "criteria": {
    "base": {
      "ru": "Цифра, на которую можно опереться. Спорить с рынком мне нечем — двигаюсь.",
      "en": "A number I can lean on. I have nothing to argue against the market with — so I move."
    },
    "analytical": {
      "ru": "Наконец цифра и источник. С этим я работать умею — пересчитываю.",
      "en": "Finally a number with a source. That I can work with — recalculating."
    }
  },
  "criteria_hollow": {
    "base": {
      "ru": "Вы сослались на рынок, но ни цифры, ни источника не назвали. Это слово, а не критерий, — цену оно не двигает.",
      "en": "You invoked the market but named neither a number nor a source. That's a word, not a criterion — it moves nothing."
    }
  },
  "warmed": {
    "base": {
      "ru": "Вы повторили мои же слова — значит, слушали. Напряжение спадает.",
      "en": "You said my own words back to me — so you were listening. The tension eases."
    },
    "relationship": {
      "ru": "Вот так со мной и надо. Меня услышали, и разговаривать сразу легче.",
      "en": "That's how you talk to me. I feel heard, and it's easier already."
    }
  },
  "quiet": {
    "base": {
      "ru": "Ничего нового. Повода двигать цену вы мне не дали.",
      "en": "Nothing new. You gave me no reason to move my price."
    }
  }
};

const HER_METER_LABELS: Record<string, Record<Lang, string>> = {
  "trust": {
    "ru": "Доверие",
    "en": "Trust"
  },
  "tension": {
    "ru": "Напряжение",
    "en": "Tension"
  },
  "info": {
    "ru": "Информация",
    "en": "Info"
  },
  "leverage": {
    "ru": "Рычаг",
    "en": "Leverage"
  }
};
const HER_PRICE_LABEL: Record<Lang, string> = {
  "ru": "Цена",
  "en": "Price"
};
const HER_STILL_CLOSED: Record<Lang, string> = {
  "ru": " А тема «{topic}» так и осталась закрытой.",
  "en": " And the topic “{topic}” stayed closed."
};
const HER_MISSED: Record<Lang, string> = {
  "ru": "Закрытыми остались темы: {list}. Что за ними стояло, вы узнали не за столом, а из разбора.",
  "en": "The topics that stayed closed: {list}. What sat behind them you learned from the debrief, not from me at the table."
};
const HER_MISSED_NONE: Record<Lang, string> = {
  "ru": "Секретов у меня для вас не осталось — вы спросили обо всём.",
  "en": "I have no secrets left for you — you asked about everything."
};
const HER_ASK: Record<Lang, string> = {
  "ru": "Одна реплика открыла бы это: «Что для вас важно в этой теме — {topic}?»",
  "en": "One line would have opened it: \"What matters to you here — {topic}?\""
};
const HER_ASK_NO_TOPIC: Record<Lang, string> = {
  "ru": "Одна реплика открыла бы это: спросить, что за этим стоит и почему именно это.",
  "en": "One line would have opened it: ask what sits behind that, and why exactly that."
};

/** Реплика оппонента по случаю. `pick` выбирает вариант ДЕТЕРМИНИРОВАННО, по
 *  состоянию партии, а не случайно. Зеркало views.py::_her_voice. */
function herVoice(kind: string, style: CounterpartStyle, lang: Lang, pick = 0): string {
  const bank = HER[kind];
  const entry = bank[style] ?? bank.base;
  return Array.isArray(entry) ? entry[pick % entry.length][lang] : entry[lang];
}

/** Голые числа движка рядом с репликой: колонка объясняет, а доказывает шкала. */
function herMeters(e: LedgerEntry, lang: Lang): string[] {
  const out: string[] = [];
  for (const key of ["trust", "tension", "info", "leverage"] as const) {
    const v = Math.round(e.deltas[key]);
    if (v) out.push(`${HER_METER_LABELS[key][lang]} ${v > 0 ? "+" : "−"}${Math.abs(v)}`);
  }
  if (e.offerBefore !== e.offerAfter) {
    out.push(`${HER_PRICE_LABEL[lang]} ${formatNumber(e.offerBefore, lang)} → ${formatNumber(e.offerAfter, lang)}`);
  }
  return out;
}

/** Один ход глазами оппонента: [что она говорит, тон].
 *
 *  Порядок веток — это ПРИОРИТЕТ, и он тот же, что у самого движка: конец партии
 *  старше хода, откат старше уступки, грубость старше приёма. Ровно поэтому
 *  колонка не может разойтись с цифрами рядом с ней. Зеркало views.py. */
function herTurn(e: LedgerEntry, style: CounterpartStyle, lang: Lang, interests: string[],
                 topics: string[], issueLabels: Record<string, string>,
                 openTopic: string, opened: number): [string, string] {
  const mv = new Set(e.moves);
  // `opened` — сколько интересов она открыла ДО этого хода: первое признание
  // звучит не так, как третье.
  const say = (kind: string) => herVoice(kind, style, lang, opened);

  if (e.reaction === "walked_out" || e.status === "breakdown") return [say("walked_out"), "bad"];
  if (e.closed && e.status === "agreement") return [say("closed"), "good"];
  if (mv.has("hostile")) return [say("hostile"), "bad"];
  if (mv.has("threat")) {
    if (e.rollback > 0) return [say("threat_again"), "bad"];
    return e.events.includes("batna") ? [say("threat_backed"), "flat"] : [say("threat_bare"), "bad"];
  }
  if (mv.has("batna")) {
    // Событие `batna` возникает только у ОБОСНОВАННОЙ альтернативы — ровно то же
    // различие, что двигает или не двигает цену внутри хода.
    return e.events.includes("batna") ? [say("batna_backed"), "flat"] : [say("batna_bare"), "bad"];
  }
  if (e.repeat >= REPEAT_HARD) return [say("repeat"), "flat"];
  if (e.reaction === "not_yet") return [say("not_yet"), "bad"];

  const idx = e.revealed;
  if (idx !== null && idx >= 0 && idx < interests.length) {
    if (idx < topics.length && topics[idx]) return [say("revealed").replace("{topic}", topics[idx]), "good"];
    // У сгенерированного стола («своя сделка») тем нет, и выдумывать их некому —
    // реплика просто обходится без названия темы.
    return [say("revealed_plain"), "good"];
  }

  const traded = e.events
    .filter((x) => x.startsWith("term:") && issueLabels[x.slice(5)])
    .map((x) => issueLabels[x.slice(5)]);
  if (traded.length) return [say("term").replace("{term}", traded.join(", ")), "good"];
  if (mv.has("tradeoff")) return [say("tradeoff"), "good"];

  const tail = openTopic ? HER_STILL_CLOSED[lang].replace("{topic}", openTopic) : "";
  if (e.gated) return [say("gated") + tail, "bad"];
  if (e.reaction === "probe_vague") return [say("probe_vague") + tail, "flat"];

  if (mv.has("objective_criteria")) {
    return e.events.includes("criteria") ? [say("criteria"), "good"] : [say("criteria_hollow"), "flat"];
  }
  if (mv.has("acknowledge")) return [say("warmed"), "good"];
  if (mv.has("offer") || mv.has("anchor") || mv.has("concession")) return [say("bare_offer"), "flat"];
  return [say("quiet"), "flat"];
}

/** Колонка «с той стороны стола» целиком. `null` — партия не сделала ни хода:
 *  пустая колонка была бы четвёртым состоянием «выглядит настоящим, а внутри
 *  пусто» (принцип 2). Зеркало views.py::her_side. */
export function herSide(s: Session): HerSide | null {
  if (!s.ledger.length) return null;
  const sc = s.sc, lang = s.lang, style = sc.cp.style;
  const interests = sc.interests[lang];
  const topics = sc.interestTopics[lang] ?? [];
  const issueLabels: Record<string, string> = {};
  for (const iss of sc.secondaryIssues ?? []) issueLabels[iss.id] = iss.label[lang];

  // Тема, ещё закрытая НА ТОТ МОМЕНТ, а не в конце партии: упрёк «вы не спросили
  // про оплату» на ходу, где про оплату уже спросили, был бы неправдой.
  const found = new Set<number>();
  const turns: HerSideTurn[] = [];
  for (const e of s.ledger) {
    const rest: number[] = [];
    for (let i = 0; i < interests.length; i++) if (!found.has(i)) rest.push(i);
    const openTopic = rest.length && rest[0] < topics.length ? topics[rest[0]] : "";
    const [said, tone] = herTurn(e, style, lang, interests, topics, issueLabels, openTopic, found.size);
    if (e.revealed !== null) found.add(e.revealed);
    turns.push({
      turn: e.turn,
      quote: e.text.slice(0, HER_QUOTE_MAX),
      said,
      meters: herMeters(e, lang),
      tone,
    });
  }

  const unfound: number[] = [];
  for (let i = 0; i < interests.length; i++) if (!s.interests.includes(i)) unfound.push(i);
  let missed: string;
  let ask = "";
  if (unfound.length) {
    const labels = unfound.filter((i) => i < topics.length).map((i) => topics[i]);
    missed = HER_MISSED[lang].replace("{list}",
      (labels.length ? labels : unfound.map((i) => interests[i])).join(", "));
    const topic = unfound[0] < topics.length ? topics[unfound[0]] : "";
    ask = topic ? HER_ASK[lang].replace("{topic}", topic) : HER_ASK_NO_TOPIC[lang];
  } else {
    missed = HER_MISSED_NONE[lang];
  }
  return { name: sc.cp.nm[lang].split(",")[0].trim(), turns, missed, ask };
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
  if (s.info < 40) {
    // ТРЕНЕР ПРЕДЛАГАЕТ ТОЛЬКО ТО, ЧТО ДВИЖОК ЗАСЧИТЫВАЕТ. Здесь стояло «Что
    // для вас важнее всего в этой сделке и почему именно это?» — вопрос без
    // темы, то есть ровно тот, на который движок отвечает probe_vague. Тренер
    // называл приём и не давал его. Подставляем ТЕМУ ещё не вскрытого интереса.
    // Зеркало views.py::compute_hint.
    const topics = s.sc.interestTopics?.[s.lang] ?? [];
    const rest = topics.filter((_, i) => !s.interests.includes(i));
    const topic = rest[0] ?? topics[0] ?? "";
    return topic ? L.info.replace("{topic}", topic) : L.infoPlain;
  }
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
    // Ярлык темы идёт в реплику КАК ЕСТЬ, в именительном: «важно в производство»
    // было бы косноязычием, «в этой теме — Производство» склоняться не обязано.
    info: "Что для вас важно в этой теме — {topic}?",
    // Запасной вариант для стола без тем («своя сделка»): там подставить нечего.
    infoPlain: "Что для вас важнее всего в этой сделке и почему именно это?",
    tension: "Понимаю, откуда вы идёте. Давайте вернёмся к сути — что для вас критично?",
    crit: "По рынку сопоставимые условия идут в другом диапазоне. Давайте опираться на этот ориентир, а не на позиции.",
    trade: "Если мы дадим {item}, сможете подвинуться по цене?",
    close: "Тогда фиксируем: условия, о которых договорились, и цена. Подписываем?",
  },
  en: {
    info: "What matters to you here — {topic}?",
    infoPlain: "What matters most to you in this deal, and why exactly that?",
    tension: "I understand where you're coming from. Let's get back to substance — what is critical for you?",
    crit: "Comparable terms on the market sit in a different range. Let's anchor on that benchmark rather than positions.",
    trade: "If we give you {item}, can you move on price?",
    close: "Then let's lock it: the terms we agreed plus the price. Shall we sign?",
  },
};
const HINTS: Record<Lang, Record<string, string>> = {
  ru: {
    info: "Вы почти не знаете, что движет оппонентом. Спросите ПО ТЕМЕ — темы стола перечислены в панели «Скрытые интересы».",
    tension: "Напряжение высокое — уступки заморожены. Признайте: «Понимаю, откуда вы идёте…»",
    crit: "Подкрепите позицию объективным критерием — сошлитесь на рыночные данные.",
    trade: "Вы знаете их интересы — предложите размен.",
    close: "Хорошая траектория. Назовите число и предложите зафиксировать сделку.",
  },
  en: {
    info: "You barely know what drives them. Ask about a TOPIC — they are listed in the “Hidden interests” panel.",
    tension: 'Tension is high — concessions are frozen. Acknowledge: "I understand where you\'re coming from…"',
    crit: "Back your position with an objective criterion — cite market data.",
    trade: "You know their interests — propose a trade.",
    close: "Good trajectory. Name a number and propose to lock the deal.",
  },
};
