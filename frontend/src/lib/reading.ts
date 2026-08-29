// reading.ts — режим «Чтение стола»: разбор ЧУЖОЙ партии по ходам.
//
// ЗАМЫСЕЛ. Во всех остальных режимах человек сидит за столом сам. Здесь он
// садится рядом и на каждом ходу отвечает на один вопрос: «как сейчас
// отреагирует вторая сторона?» — а потом видит, что ответил движок, и почему.
// Переговорам мешает не незнание приёмов, а неумение заметить, что приём НЕ
// СРАБОТАЛ; заметить это на чужой партии дешевле, чем на своей.
//
// ПРАВИЛЬНЫЙ ОТВЕТ ОПРЕДЕЛЯЕТ ДВИЖОК. Реакция на ход — это ровно то, что вернул
// `applyMove`, а не мнение автора и не ответ модели. Отсюда три следствия,
// каждое из которых и есть причина делать режим именно так:
//
//   1. ИИ здесь не участвует нигде, значит режим полностью играбелен офлайн
//      (инвариант 5) и одинаков в браузере и на сервере (инвариант 8) — обе
//      реализации движка считают эти партии одинаково, это уже проверяет
//      `test/games.test.ts`.
//   2. Ни один ответ не входит в `score_session` (инвариант 6): режим вообще не
//      партия, и прогресс у него свой (`lib/readingStore.ts`).
//   3. Разбор промаха не сочиняется: `said`, шкалы и цена приходят из хроники
//      хода (`engine.ts::herSide`) — той же, что рисует колонку «с той стороны
//      стола» в разборе настоящей партии.
//
// ЧТО ЧЕЛОВЕК ДОЛЖЕН УВИДЕТЬ В РЕПЛИКЕ, ЧТОБЫ ОТВЕТИТЬ. Ровно две вещи, и после
// ответа ему показывают обе: КАКОЙ ПРИЁМ несёт реплика (чипы `analyze`) и
// МОЖЕТ ЛИ СТОЛ ЕГО ПРИНЯТЬ (шкалы до хода и порог доверия). Вопрос без второй
// половины был бы викториной: один и тот же вопрос по теме на холодном столе
// получает переспрос, а на тёплом вскрывает интерес.
import { SCENARIO_MAP } from "../data/scenarios";
import { readingGamesFor } from "../data/readingGames";
import {
  analyze, applyMove, herSide, newSession, revealTrustGate, scoreSession, toAnalysis,
} from "../mock/engine";
import { buildProbe, isAskable, type Probe } from "./probe";
import type { Analysis, Debrief, Deltas, Lang, Tag } from "../types";

/** Снимок стола: то, что человек видит ДО ответа и что решает исход хода. */
export interface ReadingSnapshot {
  trust: number;
  tension: number;
  info: number;
  leverage: number;
  offer: number;
}

export interface ReadingTurn {
  turn: number;
  /** Реплика того, чью партию смотрят. */
  quote: string;
  /** Что ответил движок. Правильный ответ вопроса — он и есть. */
  reaction: string;
  /** Вопрос этого хода. `null` — ход проигрывается сам, см. `planAsks`. */
  ask: Probe | null;
  /** Улики: приёмы, которые движок нашёл в реплике. */
  tags: Tag[];
  analysis: Analysis;
  /** Её слова о ходе — из хроники движка, не сочинены здесь. */
  said: string;
  /** Готовые чипы «Доверие +8 · Цена 100 → 98», собранные тем же движком. */
  meters: string[];
  tone: string;
  before: ReadingSnapshot;
  after: ReadingSnapshot;
  deltas: Deltas;
  /** Порог доверия стола на момент хода: вторая половина ответа на вопрос. */
  gate: number;
  /** Спросили по теме, но доверия не хватило до порога. */
  gated: boolean;
  /** Тема, вскрытая этим ходом. */
  revealedTopic: string | null;
  closed: boolean;
}

export interface Reading {
  id: string;
  scenario: string;
  icon: string;
  title: string;
  /** Имя того, кто сидит с той стороны стола. */
  name: string;
  unit: string;
  turns: ReadingTurn[];
  /** Сколько вопросов задаёт партия. */
  asked: number;
  /** Итог, посчитанный движком — показывается ТОЛЬКО в конце чтения. */
  debrief: Debrief;
  /** Какие темы остались закрытыми (строка движка). */
  missed: string;
}

/**
 * Шкала теплоты, разбитая на три полосы: оттолкнуло / впустую / сблизило.
 *
 * ЗАЧЕМ ПОЛОСЫ. Ответ «мимо» и ответ «не та сила» — разные ошибки. Назвать
 * «приоткрылась» там, где движок дал «идёт навстречу», значит прочитать стол
 * ВЕРНО и ошибиться в мере; назвать «закрылась» — не прочитать вовсе. Режим,
 * который ставит за это одинаковое «неверно», учит бояться шкалы вместо того,
 * чтобы её читать.
 *
 * `probe_vague` лежит в средней полосе, и это не компромисс: переспрос значит
 * «ваш вопрос не двинул стол», то есть ровно «впустую».
 */
export const READING_BANDS = {
  cold: ["walked_out", "offended", "hardened", "pressured"],
  flat: ["not_yet", "neutral", "probe_vague"],
  warm: ["collaborated", "persuaded", "opened_up", "warmed"],
} as const satisfies Record<string, readonly string[]>;

export type ReadingBand = keyof typeof READING_BANDS;
export type ReadingVerdict = "exact" | "near" | "miss";

export function bandOf(reaction: string): ReadingBand | null {
  for (const band of Object.keys(READING_BANDS) as ReadingBand[]) {
    if ((READING_BANDS[band] as readonly string[]).includes(reaction)) return band;
  }
  return null;
}

export function verdictOf(picked: string, right: string): ReadingVerdict {
  if (picked === right) return "exact";
  const a = bandOf(picked);
  return a !== null && a === bandOf(right) ? "near" : "miss";
}

/**
 * На каких ходах спрашивать.
 *
 * ПОЧЕМУ НЕ НА КАЖДОМ. У эталонных партий реакция держится по нескольку ходов
 * подряд: принципиальная линия открывает интерес трижды, торг без метода пять
 * ходов не двигает стол вовсе. Три вопроса подряд с одним и тем же правильным
 * ответом — это не три проверки, а подсказка: человек отвечает «как в прошлый
 * раз» и попадает, ничего не прочитав. То же правило и по той же причине живёт
 * в слое «Читай лицо» (`probe.ts::nextProbe`).
 *
 * Ход без вопроса не пропадает: он проигрывается сам, со всем разбором. Человек
 * его СМОТРИТ — а это и есть режим.
 */
export function planAsks(reactions: string[]): boolean[] {
  let lastAsked: string | null = null;
  return reactions.map((r) => {
    if (!isAskable(r) || r === lastAsked) return false;
    lastAsked = r;
    return true;
  });
}

const snap = (s: {
  trust: number; tension: number; info: number; leverage: number; offerOpp: number;
}): ReadingSnapshot => ({
  trust: s.trust, tension: s.tension, info: s.info, leverage: s.leverage, offer: s.offerOpp,
});

/**
 * Прогнать партию из каталога и собрать из неё чтение.
 *
 * Цикл — тот же самый, что у `MockServer.handleTurn` и у бэкендового `play()`:
 * инкремент хода → `analyze` → `applyMove` → проверка предела ходов. Ни одного
 * числа этот файл сам не считает, поэтому расходиться с партией ему нечем.
 */
export function buildReading(id: string, lang: Lang): Reading | null {
  const game = readingGamesFor(lang).find((g) => g.id === id);
  const sc = game ? SCENARIO_MAP[game.scenario] : undefined;
  if (!game || !sc) return null;

  const s = newSession(sc, lang);
  const before: ReadingSnapshot[] = [];
  const gates: number[] = [];
  const analyses: Analysis[] = [];
  const tags: Tag[][] = [];
  for (const text of game.lines) {
    if (s.status !== "active") break;
    s.turn += 1;
    before.push(snap(s));
    gates.push(revealTrustGate(s));
    const a = analyze(text);
    applyMove(s, a, text);
    // `toAnalysis` берётся ПОСЛЕ хода намеренно: `applyMove` срезает качество
    // довода за повтор, и показать нужно то число, с которым движок работал.
    analyses.push(toAnalysis(a, text));
    tags.push(a.tags);
    if (s.status === "active" && s.turn >= s.maxTurns) s.status = "breakdown";
  }

  const her = herSide(s);
  const topics = sc.interestTopics[lang] ?? [];
  const asks = planAsks(s.ledger.map((e) => e.reaction));
  const turns: ReadingTurn[] = s.ledger.map((e, i) => ({
    turn: e.turn,
    quote: e.text,
    reaction: e.reaction,
    ask: asks[i] ? buildProbe(e.reaction, e.turn) : null,
    tags: tags[i] ?? [],
    analysis: analyses[i],
    said: her?.turns[i]?.said ?? "",
    meters: her?.turns[i]?.meters ?? [],
    tone: her?.turns[i]?.tone ?? "flat",
    before: before[i],
    after: {
      trust: before[i].trust + e.deltas.trust,
      tension: before[i].tension + e.deltas.tension,
      info: before[i].info + e.deltas.info,
      leverage: before[i].leverage + e.deltas.leverage,
      offer: e.offerAfter,
    },
    deltas: e.deltas,
    gate: gates[i],
    gated: e.gated,
    revealedTopic: e.revealed !== null && e.revealed < topics.length ? topics[e.revealed] : null,
    closed: e.closed,
  }));

  return {
    id,
    scenario: game.scenario,
    icon: sc.icon,
    title: sc.title[lang],
    name: her?.name ?? sc.cp.nm[lang].split(",")[0].trim(),
    unit: sc.unit[lang],
    turns,
    asked: turns.filter((t) => t.ask).length,
    debrief: scoreSession(s),
    missed: her?.missed ?? "",
  };
}
