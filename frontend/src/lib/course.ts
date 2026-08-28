// course.ts — курс приёмов: данные, раскладка заданий и выборка экзамена.
//
// ПОЧЕМУ ЗДЕСЬ НЕТ ДВИЖКА. Зачёт свободного ответа гоняет НАСТОЯЩИЙ движок в
// браузере (инвариант 9), и раньше он приезжал отсюда — то есть офлайн-ядро
// целиком лежало на пути к домашнему экрану ради счётчика «пройдено N из 10» в
// рейле. Модуль разрезан по тому, КОГДА оно нужно:
//
//   course.ts      — данные курса и чистая арифметика над ними: сколько блоков
//                    сдано, какой шаг следующий, как разложить карточки. Это
//                    нужно главной, и движок для этого не требуется;
//   courseCheck.ts — вердикт по ответу. Нужен, только когда открыто задание.
//
// Проверка от этого не «ушла на сервер» и не ослабла: она в соседнем модуле,
// считает тем же движком-зеркалом и по-прежнему работает без сети.
//
// Зеркало: services/gateway/app/course/check.py. Менять синхронно.
import { COURSE_BANK, COURSE_BLOCKS, COURSE_MASTER, MASTER_PASS_MARK } from "../data/course.generated";
import type { Exercise, ItemWithId, PassCondition } from "./courseTypes";
import { REACTION_SCALE, type Reaction } from "./probe";
import type { StateView } from "../types";

export { COURSE_BANK, COURSE_BLOCKS, COURSE_MASTER, MASTER_PASS_MARK };
export type { Exercise } from "./courseTypes";

export const BLOCK_IDS = COURSE_BLOCKS.map((b) => b.id);
/** Экзамен мастера открыт, когда сданы все девять блоков. Не раньше: три партии
 *  подряд на незнакомых столах — это проверка навыка, а не разминка. */
export const masterUnlocked = (passedBlocks: number) => passedBlocks >= COURSE_BLOCKS.length;
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

/** Реакция → нарисованное состояние лица. Зеркало avatar/base.py + ALIASES. */
const REACTION_TO_DRAWN: Record<string, string> = {
  neutral: "listening", warmed: "warm", opened_up: "lean_forward",
  persuaded: "warm", collaborated: "warm", pressured: "lean_back",
  hardened: "annoyed", offended: "offended", not_yet: "annoyed",
  probe_vague: "listening",
  walked_out: "walk_out",
};

/** Картинка для задания «прочитай лицо». Однозначность гарантирует тест банка. */
export function faceImage(ex: Exercise): string | null {
  const state = REACTION_TO_DRAWN[String(ex.answer)];
  return ex.scenario_id && state ? `/avatars/${ex.scenario_id}/${state}.webp` : null;
}

/** Варианты для `meters`: либо четыре шкалы, либо вверх/вниз. */
export function metersOptions(ex: Exercise): string[] {
  return (ex.ask ?? "largest_delta").startsWith("sign_of:")
    ? ["up", "down"]
    : [...METER_IDS];
}

// ------------------------------------------------------------------ экзамен

/** Детерминированный хеш строки — выборка экзамена обязана воспроизводиться. */
export function seedOf(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export function shuffled<T>(items: T[], seed: number): T[] {
  const out = [...items];
  let s = seed || 1;
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) >>> 0;
    // Берём СТАРШИЕ биты, а не остаток: у линейного конгруэнтного генератора
    // младшие биты почти не мешаются (период у двух младших — четыре), и
    // «перемешанные» варианты вставали на одну и ту же позицию.
    const j = Math.floor((s / 4294967296) * (i + 1));
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

// --------------------------------------------------- раскладка «на старте»
//
// ДЕФЕКТ, РАДИ КОТОРОГО ЭТО НАПИСАНО. В банке элементы «порядка» перечислены В
// ПРАВИЛЬНОМ порядке, а правая колонка «соответствия» — в порядке ответа: это
// удобно читать и проверять, но если показать их как есть, оба типа решаются
// нажатием «Проверить» без единого действия.
//
// Раскладка детерминированная (от id упражнения): повтор урока даёт ту же
// расстановку, поэтому разбор и скриншоты воспроизводимы.

/** Начальный порядок карточек — заведомо НЕ ответ. */
export function startingOrder(ex: Exercise): string[] {
  const ids = (ex.items ?? []).map((i) => i.id);
  const answer = (ex.answer as string[]) ?? [];
  const same = (a: string[]) => a.length === answer.length && a.every((x, i) => x === answer[i]);
  let out = shuffled(ids, seedOf(ex.id));
  // Перемешивание могло случайно вернуть ответ — тогда сдвигаем на один.
  if (same(out)) out = [...out.slice(1), out[0]];
  return out;
}

/**
 * Варианты выбора в перемешанном порядке.
 *
 * ЗАЧЕМ. В банке верный вариант оказался вторым в двенадцати пунктах из
 * шестнадцати — так удобнее было писать (сперва типичная ошибка, потом верный
 * ход). Игрок, заметивший это, начинает решать курс, не читая варианты. Порядок
 * теперь детерминированно перемешан от id: тот же урок — та же раскладка, но
 * позиция ответа больше ничего не подсказывает.
 */
export function shuffledOptions(ex: Exercise): { options: unknown[]; answer: number } {
  const src = (ex.options ?? []) as unknown[];
  const idx = shuffled(src.map((_, i) => i), seedOf(`${ex.id}#opt`));
  return { options: idx.map((i) => src[i]), answer: idx.indexOf(ex.answer as number) };
}

/** Порядок правой колонки «соответствия» — заведомо не параллельный левой. */
export function shuffledRight(ex: Exercise): ItemWithId[] {
  const right = ex.right ?? [];
  const answer = (ex.answer as Record<string, string>) ?? {};
  const parallel = (list: ItemWithId[]) =>
    (ex.left ?? []).every((l, i) => list[i] && answer[l.id] === list[i].id);
  let out = shuffled(right, seedOf(`${ex.id}#right`));
  if (parallel(out)) out = [...out.slice(1), out[0]];
  return out;
}

// ------------------------------------------------- какой блок подтянуть
//
// Разбор говорит, где вы просели; курс знает, где этому учат. Связь между ними
// не должна быть догадкой игрока — это тот же приём, что «приём этого акта» в
// кампании, только в обратную сторону.
export const SKILL_BLOCK: Record<string, string> = {
  questions: "spin-ladder",
  interests: "foundations",
  criteria: "objective-criteria",
  listening: "active-listening",
  tradeoff: "logrolling",
  tension: "pressure-defense",
};

/** Блок курса под самый слабый сигнал разбора (или null, если всё ровно). */
export function blockForWeakest(signals: Record<string, number>): string | null {
  const entries = Object.entries(signals).filter(([k]) => k in SKILL_BLOCK);
  if (!entries.length) return null;
  const [weakest, value] = entries.reduce((a, b) => (b[1] < a[1] ? b : a));
  // Всё выше 70 — не «просадка», и предлагать подтянуть нечего.
  return value <= 70 ? SKILL_BLOCK[weakest] ?? null : null;
}

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
