// course.ts — курс приёмов: проверка упражнений и выборка экзамена.
//
// ПОЧЕМУ ПРОВЕРКА ЗДЕСЬ, А НЕ НА СЕРВЕРЕ. Курс обязан работать офлайн — это тот
// же инвариант, что «без сети продукт полностью играбелен». Всё, что нужно для
// зачёта, у клиента уже есть: движок-зеркало (mock/engine.ts) и банк,
// сгенерированный из Python. Правильность каждого ответа доказана на стороне
// Python против настоящего движка (tests/test_course_bank.py), здесь —
// исполнение тех же предикатов.
//
// Зеркало: services/gateway/app/course/check.py. Менять синхронно.
import { COURSE_BANK, COURSE_BLOCKS } from "../data/course.generated";
import { SCENARIO_MAP } from "../data/scenarios";
import type { Exercise, PassCondition } from "./courseTypes";
import { REACTION_SCALE, type Reaction } from "./probe";
import { analyze, applyMove, newSession } from "../mock/engine";
import { norm } from "./techniques";
import type { Lang, StateView } from "../types";

export { COURSE_BANK, COURSE_BLOCKS };
export type { Exercise } from "./courseTypes";

export const BLOCK_IDS = COURSE_BLOCKS.map((b) => b.id);
export const blockById = (id: string) => COURSE_BLOCKS.find((b) => b.id === id);
export const exercisesOf = (blockId: string) => COURSE_BANK.filter((x) => x.block === blockId);
export const exercisesOfLesson = (blockId: string, lesson: number) =>
  COURSE_BANK.filter((x) => x.block === blockId && x.lesson === lesson);

// ---------------------------------------------------------------- проверки

export interface Verdict {
  ok: boolean;
  /** Закрытый словарь причин: он переводится в i18n, а не показывается сырым. */
  reasons: string[];
  moves?: string[];
  argQuality?: number;
}

const OPS: Record<PassCondition["op"], (a: number, b: number) => boolean> = {
  "==": (a, b) => a === b,
  "!=": (a, b) => a !== b,
  ">=": (a, b) => a >= b,
  "<=": (a, b) => a <= b,
  ">": (a, b) => a > b,
  "<": (a, b) => a < b,
};

export function checkChoice(ex: Exercise, picked: number): Verdict {
  return { ok: picked === ex.answer, reasons: [] };
}

export function checkOrder(ex: Exercise, order: string[]): Verdict {
  const answer = ex.answer as string[];
  const ok = order.length === answer.length && order.every((x, i) => x === answer[i]);
  return { ok, reasons: ok ? [] : ["order"] };
}

/** Сколько элементов на своих местах — для подсветки, НЕ для зачёта. */
export function orderHits(ex: Exercise, order: string[]): number {
  const answer = ex.answer as string[];
  return order.filter((x, i) => x === answer[i]).length;
}

export function checkMatch(ex: Exercise, pairs: Record<string, string>): Verdict {
  const answer = ex.answer as Record<string, string>;
  const keys = Object.keys(answer);
  const ok = keys.every((k) => pairs[k] === answer[k]);
  return { ok, reasons: ok ? [] : ["match"] };
}

export function matchHits(ex: Exercise, pairs: Record<string, string>): number {
  const answer = ex.answer as Record<string, string>;
  return Object.keys(answer).filter((k) => pairs[k] === answer[k]).length;
}

export function checkNumeric(ex: Exercise, value: number | null): Verdict {
  const a = ex.answer as { value: number; tolerance: number };
  if (value === null || !isFinite(value)) return { ok: false, reasons: ["no_number"] };
  const ok = Math.abs(value - a.value) <= (a.tolerance ?? 0) + 1e-9;
  return { ok, reasons: ok ? [] : ["numeric"] };
}

export function checkPick(ex: Exercise, picked: string): Verdict {
  return { ok: picked === ex.answer, reasons: [] };
}

/** Свободный ответ. Ловит ФОРМУ хода — и говорит об этом честно в разборе. */
export function checkFreeform(ex: Exercise, text: string, lang: Lang): Verdict {
  const spec = ex.check ?? {};
  const a = analyze(text);
  const moves = a.moves;
  const reasons: string[] = [];

  for (const m of spec.require_moves ?? []) if (!moves.includes(m)) reasons.push(`missing:${m}`);
  const any = spec.require_any ?? [];
  if (any.length && !any.some((m) => moves.includes(m))) reasons.push(`missing_any:${any.join("|")}`);
  for (const m of spec.forbid_moves ?? []) if (moves.includes(m)) reasons.push(`forbidden:${m}`);
  // Слова считаем по той же нормализации, что и движок: иначе «300 000» и
  // «300000» дали бы разное число слов, а с ним и разный вердикт.
  const words = norm(text).split(" ").filter(Boolean).length;
  if (words < (spec.min_words ?? 0)) reasons.push("too_short");
  if (a.arg < (spec.min_arg ?? 0)) reasons.push("weak_argument");
  if (spec.require_number && a.number === null) reasons.push("no_number");

  if (spec.require_secondary && ex.scenario_id) {
    const def = SCENARIO_MAP[ex.scenario_id];
    const issue = def?.secondaryIssues?.find((s) => s.id === spec.require_secondary);
    const t = text.toLowerCase();
    const hit = issue?.keywords[lang]?.some((k) => t.includes(k.toLowerCase()));
    if (!hit) reasons.push(`missing_term:${spec.require_secondary}`);
  }

  return { ok: reasons.length === 0, reasons, moves, argQuality: a.arg };
}

/** Капстоун: предикат над состоянием партии. Только поля движка — слои сюда не входят. */
export function checkDrill(ex: Exercise, view: StateView): Verdict {
  const failed: string[] = [];
  // Лимит ходов — часть задания, а не декорация в тексте цели: закрыть сделку
  // за двенадцать ходов там, где просили шесть, значит не выполнить условие.
  if (ex.max_turns && view.turn > ex.max_turns) failed.push("max_turns");
  for (const cond of ex.pass ?? []) {
    const actual = (view as unknown as Record<string, number | string | null>)[cond.field];
    if (actual === null || actual === undefined) { failed.push(cond.field); continue; }
    if (typeof cond.value === "string") {
      if (!OPS[cond.op](actual === cond.value ? 1 : 0, 1)) failed.push(cond.field);
    } else if (!OPS[cond.op](Number(actual), cond.value)) failed.push(cond.field);
  }
  return { ok: failed.length === 0, reasons: failed };
}

export function check(ex: Exercise, answer: unknown, lang: Lang): Verdict {
  switch (ex.type) {
    case "choice":
    case "spot_error": return checkChoice(ex, answer as number);
    case "order": return checkOrder(ex, answer as string[]);
    case "match": return checkMatch(ex, answer as Record<string, string>);
    case "numeric": return checkNumeric(ex, answer as number | null);
    case "freeform": return checkFreeform(ex, String(answer ?? ""), lang);
    case "reaction":
    case "meters": return checkPick(ex, String(answer ?? ""));
    case "drill": return checkDrill(ex, answer as StateView);
  }
}

// ------------------------------------------------- варианты для «читай лицо»

/** Варианты ответа для `reaction`: соседи по шкале теплоты — как в слое probe. */
export function reactionOptions(ex: Exercise): Reaction[] {
  const answer = ex.answer as Reaction;
  const i = REACTION_SCALE.indexOf(answer);
  const near: Reaction[] = [];
  for (let d = 1; near.length < 3 && d < REACTION_SCALE.length; d++) {
    for (const j of [i - d, i + d]) {
      if (j >= 0 && j < REACTION_SCALE.length && near.length < 3) near.push(REACTION_SCALE[j]);
    }
  }
  const pool = [answer, ...near];
  const shift = (ex.seed_turn ?? 0) % pool.length;
  return [...pool.slice(shift), ...pool.slice(0, shift)];
}

export const METER_IDS = ["trust", "tension", "info", "leverage"] as const;

/** Варианты для `meters`: либо четыре шкалы, либо вверх/вниз. */
export function metersOptions(ex: Exercise): string[] {
  return (ex.ask ?? "largest_delta").startsWith("sign_of:")
    ? ["up", "down"]
    : [...METER_IDS];
}

// --------------------------------------------------------------- генерация

/** Прогнать реплику через движок-зеркало: то же, что делает `simulate.py`. */
export function simulate(scenarioId: string, lang: Lang, line: string,
                         state?: Exercise["state"]): { reaction: string; deltas: Record<string, number> } | null {
  const def = SCENARIO_MAP[scenarioId];
  if (!def) return null;
  const sess = newSession(def, lang);
  if (state) {
    sess.trust = state.trust; sess.tension = state.tension;
    sess.info = state.info; sess.leverage = state.leverage;
    sess.turn = state.turn;
  }
  const res = applyMove(sess, analyze(line), line);
  return { reaction: res.reaction, deltas: res.deltas as unknown as Record<string, number> };
}

// ------------------------------------------------------------------ экзамен

/** Детерминированный хеш строки — выборка экзамена обязана воспроизводиться. */
export function seedOf(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function shuffled<T>(items: T[], seed: number): T[] {
  const out = [...items];
  let s = seed || 1;
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export interface ExamDraw {
  blockId: string;
  attempt: number;
  items: Exercise[];
  /** Вес позиции: капстоун стоит двух. */
  weight: (ex: Exercise) => number;
  total: number;
  passMark: number;
}

/**
 * Выборка экзамена блока.
 *
 * Порядок и состав детерминированы от (блок, попытка): пересдача даёт ДРУГУЮ
 * выборку, но одну и ту же при повторе — иначе экзамен нельзя ни отладить, ни
 * оспорить. Капстоун (drill), если он есть в блоке, входит всегда: узнавание
 * без применения — не навык.
 */
export function drawExam(blockId: string, attempt = 0): ExamDraw {
  const pool = exercisesOf(blockId);
  const drills = pool.filter((x) => x.type === "drill");
  const rest = shuffled(pool.filter((x) => x.type !== "drill"), seedOf(`${blockId}#${attempt}`));
  const items = [...rest, ...drills];
  const weight = (ex: Exercise) => (ex.type === "drill" ? 2 : 1);
  const total = items.reduce((n, x) => n + weight(x), 0);
  return { blockId, attempt, items, weight, total, passMark: Math.ceil(total * 0.8) };
}

export const passed = (score: number, draw: ExamDraw) => score >= draw.passMark;

// ------------------------------------------------------------ «что дальше»

export interface NextStep {
  blockId: string;
  /** Урок, который стоит открыть; null — уроки пройдены, ждёт экзамен. */
  lesson: number | null;
}

/**
 * Первый незакрытый шаг курса.
 *
 * Нужен ровно для одного: на домашнем экране кнопка обязана вести В КОНКРЕТНОЕ
 * место. «Открыть курс» заставляет вспоминать, где ты остановился, — а это и
 * есть та секунда сомнения, на которой человек закрывает вкладку.
 */
export function nextStep(done: { lessons: number[]; passed: boolean }[]): NextStep | null {
  for (let i = 0; i < COURSE_BLOCKS.length; i++) {
    const block = COURSE_BLOCKS[i];
    const p = done[i] ?? { lessons: [], passed: false };
    const lesson = block.lessons.find((l) => !p.lessons.includes(l.idx));
    if (lesson) return { blockId: block.id, lesson: lesson.idx };
    if (!p.passed) return { blockId: block.id, lesson: null };
  }
  return null;
}
