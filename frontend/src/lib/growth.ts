// growth.ts — ИСТОРИЯ партий и честный ответ на вопрос «я расту?».
//
// ЧЕГО НЕ ХВАТАЛО. `progress.ts` держит по каждому навыку НАКОПЛЕННОЕ мастерство
// (`SkillAgg` — сумма и число партий, то есть бегущее среднее). Это ответ на
// вопрос «сколько у меня СЕЙЧАС», и он честный, но на вопрос «стало ли лучше,
// чем три недели назад» среднее ответить не может в принципе: оно помнит итог и
// забывает порядок. Тренажёр, который обещает рост, обязан его показывать.
//
// ЧТО ЗДЕСЬ ЕСТЬ. Лента точек «дата · стол · грейд · overall · шесть сигналов»
// и арифметика тенденции над ней. Ни одного нового измерения: точка целиком
// собирается из `Debrief`, который посчитал ДВИЖОК, теми же полями, что уходят
// в грейд (`skillSignals`, `d.overall`, `d.grade`) — см. `pointFrom`.
//
// ЧЕГО ЗДЕСЬ НЕТ И БЫТЬ НЕ МОЖЕТ. Ни одно число отсюда не возвращается в
// оценку (инвариант 6): история — витрина, а не механика. Она живёт СВОИМ
// ключом в localStorage, `Profile` о ней не знает, и удаление ключа не меняет
// в партии ничего.
import type { Debrief } from "../types";
import { SKILL_IDS, skillSignals, type Grade, type SkillId } from "./progress";

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** Одна сыгранная партия так, как её увидит график. */
export interface HistoryPoint {
  at: string; // ISO-время окончания
  scenarioId: string;
  grade: Grade; // буква, которую поставил движок
  overall: number; // 0..100 — ТО ЖЕ число, из которого получилась буква
  // Шесть сигналов из разбора, 0..100 каждый. Ключами, а не массивом:
  // порядок `SKILL_IDS` — вещь изменяемая, а перепутанный молча массив дал бы
  // «рост» по навыку, в который человек не играл. Плата — байты, и она мелкая:
  // двести партий это ~30 КБ, полпроцента квоты.
  skills: Record<SkillId, number>;
}

const KEY = "dialog.history.v1";

/** СКОЛЬКО ПАРТИЙ ХРАНИМ.
 *
 *  Двести — это больше полугода ежедневной игры, то есть заведомо длиннее
 *  любого окна, по которому считается тенденция (двадцать партий). Меньше было
 *  бы жалко: история тем и ценна, что помнит далеко. Больше — бессмысленно:
 *  сравнивать сегодняшнюю игру с партией годичной давности значит сравнивать
 *  двух разных людей, и на вопрос «расту ли я СЕЙЧАС» такая точка не отвечает.
 *
 *  Переполнение вытесняет САМЫЕ СТАРЫЕ. Прореживать середину, оставляя «начало
 *  и конец», нельзя: получилась бы поддельная база отсчёта — точка, которую
 *  продукт хранит дольше остальных именно потому, что она удобно низкая. */
export const HISTORY_MAX = 200;

/** Аварийный размер: если хранилище отказало по квоте, пробуем сохранить хвост
 *  этой длины. Хвоста в тридцать партий хватает и на окно тенденции, и на
 *  запас; полная лента при этом просто не переживёт перезагрузку. */
export const HISTORY_RESCUE = 30;

/** Окно, по которому считается тенденция: последние двадцать партий. Ровно эти
 *  точки и рисуются — вывод и картинка обязаны стоять на одних данных, иначе
 *  график «показывает» не то, о чём говорит подпись. */
export const TREND_WINDOW = 20;

/** СКОЛЬКО ПАРТИЙ НУЖНО, ЧТОБЫ ВООБЩЕ ГОВОРИТЬ О ТЕНДЕНЦИИ.
 *
 *  Шесть, потому что вывод строится сравнением двух половин окна, а половина
 *  меньше трёх партий не имеет разброса: по двум числам «размах» — это одно
 *  число, и отличить шум от роста им нечем. По двум партиям линию нарисовать
 *  можно всегда — и это ровно четвёртое состояние из принципа 2: выглядит
 *  настоящим, а внутри пусто. До шести продукт честно говорит «сыграно N из
 *  шести». */
export const TREND_MIN = 6;

/** Одна ступень самой грубой шкалы навыка, округлённая вверх. Сигналы
 *  `criteria`, `listening`, `questions` ходят третями (0 · 33 · 67 · 100) —
 *  непрерывными они не являются, и «рост» размером в одну ступень одной партии
 *  это не рост, а одна партия. */
const SKILL_STEP = 34;

/** Нижний порог по навыку: разница мельче восьми очков не объявляется ростом
 *  ни при каком разбросе. Страхует вырожденный случай — все партии сыграны
 *  одинаково, разброс нулевой, и любая мелочь формально «значима». */
const SKILL_FLOOR = 8;

/** Нижний порог по `overall`.
 *
 *  Пять, потому что столько в него способен внести ОДИН недетерминированный
 *  вход — семантический судья. Его балл входит в технику слагаемым 0…14
 *  (`judge_term` в engine.score_session), техника весит 0.35, то есть до 4.9
 *  очка `overall` на ровно той же игре (docs/judge-reproducibility.md).
 *  Разницу, которую судья может выдумать сам, ростом называть нельзя. */
const OVERALL_FLOOR = 5;

// ---------------------------------------------------------------- точка ленты

/** Собрать точку из разбора.
 *
 *  ИСТОЧНИК ОДИН. `overall` и `grade` берутся из того же `Debrief`, что рисует
 *  кольцо грейда, а шесть сигналов — из `skillSignals`, который читает поля,
 *  входящие в `score_session` (spin_stages, interests_found/total,
 *  objective_criteria, empathy, tradeoffs, relationship). Соседнего похожего
 *  поля здесь нет ни одного: `avg_arg` — балл судьи, он в графике не участвует
 *  вовсе. Проверяется прогоном движка (test/growth.test.ts). */
export function pointFrom(scenarioId: string, d: Debrief, now: Date = new Date()): HistoryPoint {
  const sig = skillSignals(d);
  const skills = {} as Record<SkillId, number>;
  for (const id of SKILL_IDS) skills[id] = clamp(Math.round(sig[id]), 0, 100);
  return {
    at: now.toISOString(),
    scenarioId: scenarioId || "custom",
    grade: (d.grade as Grade) ?? "F",
    overall: clamp(Math.round(d.overall), 0, 100),
    skills,
  };
}

/** Чистая свёртка: дописать точку в конец и вытеснить самые старые сверх
 *  потолка. Возвращает новый массив. */
export function foldHistory(prev: HistoryPoint[], p: HistoryPoint): HistoryPoint[] {
  const next = [...prev, p];
  return next.length <= HISTORY_MAX ? next : next.slice(next.length - HISTORY_MAX);
}

// ------------------------------------------------------------- хранилище

function sanitizePoint(v: unknown): HistoryPoint | null {
  if (!v || typeof v !== "object") return null;
  const r = v as Record<string, unknown>;
  const g = r.grade;
  if (g !== "A" && g !== "B" && g !== "C" && g !== "D" && g !== "F") return null;
  if (typeof r.scenarioId !== "string" || !r.scenarioId) return null;
  const skills = {} as Record<SkillId, number>;
  const src = (r.skills && typeof r.skills === "object" ? r.skills : {}) as Record<string, unknown>;
  for (const id of SKILL_IDS) {
    const n = src[id];
    skills[id] = typeof n === "number" && isFinite(n) ? clamp(Math.round(n), 0, 100) : 0;
  }
  return {
    at: typeof r.at === "string" ? r.at : "",
    scenarioId: r.scenarioId,
    grade: g as Grade,
    overall: typeof r.overall === "number" && isFinite(r.overall) ? clamp(Math.round(r.overall), 0, 100) : 0,
    skills,
  };
}

/** Прочитать ленту. Испорченный блоб — это «истории пока нет», а не сбой:
 *  тот же приём, что у профиля и у прошлых партий. */
export function loadHistory(): HistoryPoint[] {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(KEY) : null;
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const src = parsed && typeof parsed === "object" ? parsed.points : null;
    if (!Array.isArray(src)) return [];
    const out: HistoryPoint[] = [];
    for (const v of src) {
      const p = sanitizePoint(v);
      if (p) out.push(p);
    }
    return out.length <= HISTORY_MAX ? out : out.slice(out.length - HISTORY_MAX);
  } catch {
    return [];
  }
}

/** Записать ленту. Best-effort: приватный режим и переполненная квота роняют
 *  `setItem` исключением, и партия из-за витрины падать не имеет права.
 *
 *  Одна попытка ужаться — единственная разумная реакция на квоту: полная лента
 *  не влезла, хвост скорее всего влезет. Возвращается то, что РЕАЛЬНО лежит на
 *  диске, чтобы память и хранилище не разошлись молча. */
export function saveHistory(list: HistoryPoint[]): HistoryPoint[] {
  const blob = (l: HistoryPoint[]) => JSON.stringify({ v: 1, points: l });
  try {
    if (typeof localStorage === "undefined") return list;
    localStorage.setItem(KEY, blob(list));
    return list;
  } catch {
    const tail = list.slice(-HISTORY_RESCUE);
    try {
      localStorage.setItem(KEY, blob(tail));
      return tail;
    } catch {
      // Хранилище закрыто совсем. История просто не переживёт перезагрузку —
      // ни партия, ни грейд от этого не меняются.
      return list;
    }
  }
}

/** Дописать законченную партию в историю. Единственная точка входа приложения. */
export function appendHistory(scenarioId: string, d: Debrief, now: Date = new Date()): HistoryPoint[] {
  return saveHistory(foldHistory(loadHistory(), pointFrom(scenarioId, d, now)));
}

// ------------------------------------------------------------- арифметика

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** Выборочный разброс (n−1). По одному числу разброса нет — ноль. */
function sd(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) * (x - m), 0) / (xs.length - 1));
}

export type TrendDir = "up" | "down" | "flat";

export interface Trend {
  dir: TrendDir;
  before: number; // среднее старшей половины окна
  after: number; // среднее младшей половины
  delta: number; // after − before
  /** Что надо было перейти, чтобы это назвали ростом. Показывается словами:
   *  «разница {delta} не выходит за разброс {threshold}». */
  threshold: number;
  n: number; // партий в каждой половине
}

/**
 * Тенденция по ряду значений — и, главное, ОТКАЗ её объявлять.
 *
 * Окно делится пополам; при нечётной длине средняя партия отбрасывается, чтобы
 * не считаться дважды. Разница средних сравнивается с порогом, у которого две
 * составляющих:
 *
 *   1. СТАТИСТИЧЕСКАЯ. Удвоенная стандартная ошибка разности средних. Чем
 *      сильнее человек скачет от партии к партии, тем больше должна быть
 *      разница, чтобы её вообще стоило называть.
 *   2. ЦЕНОВАЯ. Пол, ниже которого не опускаемся ни при каком разбросе:
 *      величина, которую способен создать один-единственный вход, к росту
 *      навыка отношения не имеющий (одна партия, шагнувшая на одну ступень
 *      шкалы; дрожь судьи в `overall`). Без него ряд без разброса — все партии
 *      сыграны одинаково — объявлял бы ростом любую мелочь.
 */
export function trendOf(values: number[], floorFor: (half: number) => number): Trend | null {
  const k = Math.floor(values.length / 2);
  if (k < 1) return null;
  const older = values.slice(0, k);
  const newer = values.slice(values.length - k);
  const before = mean(older);
  const after = mean(newer);
  const delta = after - before;
  // Объединённый разброс двух половин равного размера, отсюда — ошибка разности.
  const s1 = sd(older);
  const s2 = sd(newer);
  const pooled = Math.sqrt((s1 * s1 + s2 * s2) / 2);
  const se = pooled * Math.sqrt(2 / k);
  const threshold = Math.max(floorFor(k), 2 * se);
  const dir: TrendDir = Math.abs(delta) > threshold ? (delta > 0 ? "up" : "down") : "flat";
  return { dir, before, after, delta, threshold, n: k };
}

/** Порог для навыка: одна ступень грубейшей шкалы, размазанная по половине
 *  окна, но не меньше восьми очков. */
export const skillFloor = (half: number) => Math.max(SKILL_FLOOR, SKILL_STEP / half);

/** Порог для `overall`: то, что в него способен внести судья. */
export const overallFloor = () => OVERALL_FLOOR;

export interface SkillTrend {
  id: SkillId;
  trend: Trend;
}

export interface GrowthView {
  /** Хватает ли партий, чтобы вообще говорить о тенденции. */
  enough: boolean;
  played: number; // партий в истории всего
  need: number; // сколько нужно (TREND_MIN)
  /** Точки, по которым сделан вывод, — ровно те, что рисует график. */
  window: HistoryPoint[];
  from: string; // ISO первой точки окна ("" — окна нет)
  to: string; // ISO последней
  overall: Trend | null;
  skills: SkillTrend[];
}

/** Всё, что экран имеет право показать. Чистая функция от ленты. */
export function growthView(history: HistoryPoint[]): GrowthView {
  const played = history.length;
  const window = history.slice(-TREND_WINDOW);
  const enough = played >= TREND_MIN;
  if (!enough) {
    return { enough, played, need: TREND_MIN, window, from: "", to: "", overall: null, skills: [] };
  }
  const overall = trendOf(window.map((p) => p.overall), overallFloor);
  const skills: SkillTrend[] = [];
  for (const id of SKILL_IDS) {
    const t = trendOf(window.map((p) => p.skills[id]), skillFloor);
    if (t) skills.push({ id, trend: t });
  }
  return {
    enough,
    played,
    need: TREND_MIN,
    window,
    from: window[0]?.at ?? "",
    to: window[window.length - 1]?.at ?? "",
    overall,
    skills,
  };
}

/** Навык, который вырос сильнее прочих, и навык, который просел. Только
 *  объявленные тенденции — «ровно» в ответ не попадает никогда. */
export function movedMost(v: GrowthView): { up: SkillTrend | null; down: SkillTrend | null } {
  let up: SkillTrend | null = null;
  let down: SkillTrend | null = null;
  for (const s of v.skills) {
    if (s.trend.dir === "up" && (!up || s.trend.delta > up.trend.delta)) up = s;
    if (s.trend.dir === "down" && (!down || s.trend.delta < down.trend.delta)) down = s;
  }
  return { up, down };
}
