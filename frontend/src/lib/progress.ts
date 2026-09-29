// progress.ts — cross-session player profile in localStorage. This is the
// retention spine: it's the reason to play a scenario twice (beat your grade)
// and to come back tomorrow (keep the day streak alive).
//
// Split by design: the SCORING and STREAK math are pure functions (no I/O, so
// they're trivially unit-testable and deterministic under an injected "today");
// only loadProfile/saveProfile touch localStorage, and they're defensive — any
// corrupt/missing/half-shaped blob degrades to sane defaults rather than throwing.

import { COURSE_BLOCKS } from "../data/course.blocks.generated";
import type { Debrief, Mode } from "../types";
import { normalizeDifficulty } from "./difficulty";

export type Grade = "A" | "B" | "C" | "D" | "F";

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

// Best result the player has ever reached on one scenario.
export interface ScenarioRecord {
  bestGrade: Grade | null; // null = never finished
  bestScore: number; // 0..100 (overall of the best-graded run)
  attempts: number;
  lastPlayed: string; // ISO date (full timestamp)
}

// The six trainable negotiation skills. Each game's debrief carries an honest,
// engine-owned signal for each; we keep a running (sum, n) so mastery is the
// average across ALL games — the answer to "am I getting better?".
export type SkillId = "questions" | "interests" | "criteria" | "listening" | "tradeoff" | "tension";
export const SKILL_IDS: SkillId[] = ["questions", "interests", "criteria", "listening", "tradeoff", "tension"];

export interface SkillAgg {
  sum: number; // Σ per-game 0..100 signals
  n: number; // games counted
}

export interface Profile {
  version: number;
  scenarios: Record<string, ScenarioRecord>;
  streak: number; // consecutive days with >=1 finished negotiation
  lastStreakDay: string; // YYYY-MM-DD of the last finished-negotiation day ("" = none)
  // ---- gamification (all additive; a v1 blob loads with these defaulted) ----
  xp: number; // cumulative lifetime XP
  skills: Record<SkillId, SkillAgg>; // per-skill running mastery
  achievements: string[]; // unlocked achievement ids (set, stored as array)
  // ---- retention layer v3 (streak-freeze, daily goal, milestone dedupe) ------
  freezes: number; // held streak-freezes (earned 1 per 5-day streak, capped)
  dailyGoalTarget: number; // games/day the player aims for (1..3, default 1)
  // Отложенное понижение цели: сегодня цель остаётся прежней, `target` вступает
  // в силу с дня `from`. null — ничего не отложено. См. setDailyGoalTarget.
  dailyGoalPending: DailyGoalPending | null;
  dailyDoneDay: string; // YYYY-MM-DD the dailyDoneCount applies to ("" = none)
  dailyDoneCount: number; // finished games on dailyDoneDay (toward the goal ring)
  celebratedMilestones: string[]; // milestone ids already shown (never repeat)
  // ---- курс приёмов v4 -------------------------------------------------------
  // Прогресс по блокам курса. Отдельной валюты нет: XP тот же, ранги те же —
  // курс и партии живут в одном профиле, иначе «прогресс» перестаёт быть общим.
  course: Record<string, BlockProgress>;
  // ---- кампании v5 -----------------------------------------------------------
  // Прогресс ПО ИДЕНТИФИКАТОРУ кампании, а не одной записью: кампаний две
  // («Восхождение» и «Своё дело»), и общая запись означала бы, что вход во
  // вторую стирает первую. Раньше этого поля не было вовсе — четырёхактная арка
  // жила в состоянии React и обнулялась по F5.
  campaigns: Record<string, CampaignProgress>;
}

/** Итог одного акта: грейд и балл, как их поставил движок. Не пересчитывается. */
export interface StageResult {
  grade: string;
  overall: number;
}

/** Прогресс ОДНОЙ кампании. `stageIndex` — акт, который играется следующим;
 *  равен числу актов, когда кампания пройдена. */
export interface CampaignProgress {
  stageIndex: number;
  reputation: number; // -100..100, переносится в доверие следующего акта
  results: StageResult[];
  /** ISO-время последнего акта; "" — кампания не начата. По нему выбирается
   *  кампания, открытая при возврате: продолжают ту, которую играли последней. */
  updatedAt: string;
}

export function emptyCampaign(): CampaignProgress {
  return { stageIndex: 0, reputation: 0, results: [], updatedAt: "" };
}

/** Что игрок сделал в одном блоке курса. */
export interface BlockProgress {
  lessons: number[];   // пройденные уроки (idx), без повторов
  solved: string[];    // id упражнений, решённых верно с первого раза
  missed: string[];    // id упражнений, где ошиблись и ещё не переделали
  examBest: number;    // лучший результат экзамена в очках
  examTotal: number;   // из скольких очков (меняется вместе с банком)
  passed: boolean;     // экзамен сдан хотя бы раз
  attempts: number;    // попыток экзамена
}

export function emptyBlockProgress(): BlockProgress {
  return { lessons: [], solved: [], missed: [], examBest: 0, examTotal: 0, passed: false, attempts: 0 };
}

const VERSION = 5;
const KEY = "dialog.progress.v1";
// If a quota/permission error leaves an older blob on disk, keep this tab's
// latest progress usable until a later write succeeds. It is not durable.
let unsavedProfile: Profile | null = null;

// Streak-freeze economy (Duolingo's anxiety-reducer): a small buffer that eats a
// missed day so a good habit isn't punished by one busy day. Earned by showing up
// (1 per 5-day streak), hard-capped so it can never trivialize the streak.
export const FREEZE_CAP = 2;
export const FREEZE_EARN_EVERY = 5;

/** Потолок актов в одной кампании. Не описание кампаний (их знает движок), а
 *  граница здравого смысла для ЧУЖОГО блоба: без неё подделанный `stageIndex`
 *  рисовал бы бесконечную арку. Кампании в продукте — четырёхактные. */
export const CAMPAIGN_MAX_ACTS = 12;

// Daily-goal bounds — the player picks 1/2/3 finished games per day.
export const DAILY_GOAL_MIN = 1;
export const DAILY_GOAL_MAX = 3;
export const DAILY_GOAL_DEFAULT = 1;

function clampGoal(n: number): number {
  return clamp(Math.round(n), DAILY_GOAL_MIN, DAILY_GOAL_MAX);
}

/** Понижение цели, назначенное на будущий день. */
export interface DailyGoalPending {
  target: number; // 1..3, меньше цели дня, в котором его назначили
  from: string;   // YYYY-MM-DD: первый день, в который оно действует
}

function emptySkills(): Record<SkillId, SkillAgg> {
  const s = {} as Record<SkillId, SkillAgg>;
  for (const id of SKILL_IDS) s[id] = { sum: 0, n: 0 };
  return s;
}

export function emptyProfile(): Profile {
  return {
    version: VERSION, scenarios: {}, streak: 0, lastStreakDay: "", xp: 0,
    skills: emptySkills(), achievements: [],
    freezes: 0, dailyGoalTarget: DAILY_GOAL_DEFAULT, dailyGoalPending: null, dailyDoneDay: "", dailyDoneCount: 0,
    celebratedMilestones: [], course: {}, campaigns: {},
  };
}

const GRADE_RANK: Record<Grade, number> = { A: 5, B: 4, C: 3, D: 2, F: 1 };

// A run "improves" a record when there was none, when its grade is strictly
// better, or when the grade ties but the numeric score is higher. Ties on both
// keep the earlier record (no phantom "new record").
export function isBetter(grade: Grade, score: number, prev: ScenarioRecord | null): boolean {
  if (!prev || prev.bestGrade === null) return true;
  const dr = GRADE_RANK[grade] - GRADE_RANK[prev.bestGrade];
  if (dr !== 0) return dr > 0;
  return score > prev.bestScore;
}

// Local calendar day key (YYYY-MM-DD). Streaks are day-granular, in the player's
// own timezone — the natural unit for "came back the next day".
export function dayKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function daysBetween(a: string, b: string): number {
  const pa = Date.parse(a + "T00:00:00Z");
  const pb = Date.parse(b + "T00:00:00Z");
  if (!isFinite(pa) || !isFinite(pb)) return NaN;
  return Math.round((pb - pa) / 86_400_000);
}

/** Следующий календарный день после ключа `YYYY-MM-DD`. Арифметика на самом
 *  ключе, а не на часах: ключ уже местный (dayKey), и переход через полночь
 *  или смену летнего времени здесь ничего не сдвигает. */
export function nextDayKey(day: string): string {
  const t = Date.parse(day + "T00:00:00Z");
  if (!isFinite(t)) return day;
  const d = new Date(t + 86_400_000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/** Сколько миллисекунд до ближайшей местной полуночи (плюс секунда запаса).
 *  По нему экран сам перерисовывает цель дня, когда наступил следующий день. */
export function msUntilNextDay(now: Date = new Date()): number {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
  return Math.max(1000, next.getTime() - now.getTime());
}

// Pure streak transition. today is a day key (see dayKey).
//  - first ever finish           → 1
//  - another finish same day     → unchanged (already counted today)
//  - finish the very next day     → +1
//  - a gap (or anything odd)      → reset to 1
export function nextStreak(prevStreak: number, lastDay: string, today: string): number {
  if (!lastDay) return 1;
  if (lastDay === today) return Math.max(1, prevStreak);
  const gap = daysBetween(lastDay, today);
  if (gap === 1) return Math.max(1, prevStreak) + 1;
  return 1;
}

export interface StreakState {
  streak: number;
  freezes: number;
}

export interface StreakUpdate {
  streak: number;
  freezes: number;
  freezeUsed: boolean; // a freeze was spent this update to save the streak
}

// Freeze-aware streak transition — the honest anxiety-reducer. Pure, so the whole
// earn/spend/reset economy is unit-testable under an injected "today".
//  - a genuine advance (first finish, or the next day) increments the streak, and
//    every 5th day earns a freeze (capped at FREEZE_CAP);
//  - a MISSED stretch spends one freeze per skipped day to keep the streak alive
//    (freezeUsed=true). Today still extends it once the gap is covered;
//  - only when the held freezes can't cover every skipped day does the streak reset.
// Freezes are never spent on a same-day replay or a normal consecutive day.
export function updateStreak(prev: StreakState, lastDay: string, today: string): StreakUpdate {
  const s0 = Math.max(0, prev.streak);
  const f0 = clamp(prev.freezes, 0, FREEZE_CAP);
  // Grant an earned freeze when an ADVANCE lands the streak on a 5-day milestone.
  const earn = (streak: number, freezes: number) =>
    streak > s0 && streak % FREEZE_EARN_EVERY === 0 ? Math.min(FREEZE_CAP, freezes + 1) : freezes;

  if (!lastDay) {
    return { streak: 1, freezes: earn(1, f0), freezeUsed: false };
  }
  if (lastDay === today) {
    return { streak: Math.max(1, s0), freezes: f0, freezeUsed: false };
  }
  const gap = daysBetween(lastDay, today);
  if (gap === 1) {
    const streak = Math.max(1, s0) + 1;
    return { streak, freezes: earn(streak, f0), freezeUsed: false };
  }
  // gap >= 2 → (gap - 1) day(s) were skipped. Spend one freeze per skipped day.
  const missed = Number.isFinite(gap) ? gap - 1 : Infinity;
  if (missed >= 1 && missed <= f0) {
    const streak = Math.max(1, s0) + 1; // preserved through the gap, extended today
    return { streak, freezes: earn(streak, f0 - missed), freezeUsed: true };
  }
  // Not enough freezes to cover the gap — the streak resets (held freezes survive).
  return { streak: 1, freezes: f0, freezeUsed: false };
}

// ---- Что серия скажет о СЕГОДНЯШНЕМ дне -------------------------------------
//
// Полоска серии в шапке говорит, сколько дней подряд игрок возвращался, и
// молчит о единственном, что от него сейчас зависит: засчитан ли СЕГОДНЯШНИЙ
// день. Разница между «серия жива, но сегодня вы ещё не играли» и «день уже
// записан» — это ровно то, ради чего серию вообще смотрят.
//
// Считается тем же `updateStreak`, что и настоящая запись после партии. Это не
// удобство, а условие честности: карточка обещает то, что и произойдёт, а не
// свою отдельную оценку положения дел (принцип 2). Разойтись они не могут —
// функция одна.
export type StreakMood =
  | "kept"      // сегодняшний день уже засчитан
  | "waiting"   // серия жива, сегодня партии ещё не было
  | "shielded"  // пропуск был, но его покроет заморозка
  | "lost"      // серия прервётся: заморозок не хватило
  | "away";     // прервётся, и перерыв длинный

/** Порог «долгого перерыва». Неделя — потому что серия и так живёт днями:
 *  два пропущенных дня это осечка, семь — другой разговор. */
const AWAY_DAYS = 7;

export interface StreakView {
  mood: StreakMood;
  streak: number;   // серия сейчас, как она записана в профиле
  ifPlayed: number; // какой она станет, если закончить партию сегодня
  freezes: number;  // заморозок в запасе сейчас
  awayDays: number; // сколько дней прошло с последнего засчитанного дня
}

/**
 * Состояние серии на сегодня — или null, если серии ещё не было ни разу.
 *
 * `null` намеренно: игроку без единой законченной партии рассказывать о
 * прерванной серии нечего, а карточка «0 дней» — украшение. Первый шаг ему
 * называет «Ваш следующий шаг», и второго голоса об этом не нужно.
 */
export function streakView(profile: Profile, today: string = dayKey()): StreakView | null {
  const last = profile.lastStreakDay;
  if (!last) return null;
  const streak = Math.max(0, profile.streak);
  const freezes = clamp(profile.freezes, 0, FREEZE_CAP);
  const gap = daysBetween(last, today);
  const awayDays = Number.isFinite(gap) ? Math.max(0, gap) : 0;
  const next = updateStreak({ streak, freezes }, last, today);
  const view = { streak, ifPlayed: next.streak, freezes, awayDays };

  // Ветвление идёт по РАЗРЫВУ, а не по тому, вырос ли счётчик: у профиля с
  // нулевой серией и непустым последним днём (такие приезжают из старых
  // сохранений) любая партия «увеличивает» серию, и проверка по числу назвала
  // бы прерванную серию живой.
  if (last === today) return { ...view, mood: "kept" };
  if (awayDays === 1) return { ...view, mood: "waiting" };
  if (next.freezeUsed) return { ...view, mood: "shielded" };
  return { ...view, mood: awayDays >= AWAY_DAYS ? "away" : "lost" };
}

// ---- Daily goal (customizable target, per-day progress) ----------------------

//
// ПОДНЯТЬ МОЖНО СРАЗУ, ОПУСТИТЬ — ТОЛЬКО СО СЛЕДУЮЩЕГО ДНЯ. Раньше цель
// переставлялась в любую сторону в любой момент: поставил три, сыграл одну,
// переставил на одну — и «цель выполнена». Обязательство, которое отменяется
// одним нажатием, обязательством не является (у Duolingo, откуда механика,
// понизить цель текущего дня тоже нельзя). Решение владельца: понижение
// принимается, но вступает в силу со следующего местного календарного дня —
// той же границы, по которой считается серия.
//
// Отложенное понижение применяется ЧТЕНИЕМ, а не записью: всё, что спрашивает
// цель (показ, зачёт партии), идёт через `resolveDailyGoal` с сегодняшним днём.
// Поэтому в полночь оно вступает в силу само, без захода в настройки. Таймер в
// карточке (Rail.tsx::useDayKey) только перерисовывает открытую вкладку — от
// него правило не зависит: проспи он полночь, первая же партия нового дня
// посчитается по новой цели.

export interface DailyGoalView {
  target: number; // цель, действующая СЕГОДНЯ (1..3)
  done: number; // finished games so far today
  met: boolean; // done >= target
  progress: number; // 0..1 fraction toward the target (for the ring)
  /** Понижение, отложенное на завтра; null — не отложено. */
  later: number | null;
}

/** Какая цель действует в день `today` и что ещё отложено. Чистая. */
export function resolveDailyGoal(profile: Profile, today: string): { target: number; pending: DailyGoalPending | null } {
  const pending = profile.dailyGoalPending;
  // Ключи дня — YYYY-MM-DD, строковое сравнение совпадает с календарным.
  if (pending && today >= pending.from) return { target: clampGoal(pending.target), pending: null };
  return { target: clampGoal(profile.dailyGoalTarget), pending };
}

// Pure read of today's daily-goal state — how many games are done vs the chosen
// target. `today` is injectable for tests; the count only counts if it's today's.
export function dailyGoalView(profile: Profile, today: string = dayKey()): DailyGoalView {
  const { target, pending } = resolveDailyGoal(profile, today);
  const done = profile.dailyDoneDay === today ? Math.max(0, profile.dailyDoneCount) : 0;
  return {
    target, done, met: done >= target, progress: clamp(done / target, 0, 1),
    later: pending ? clampGoal(pending.target) : null,
  };
}

/**
 * Выбор цели. Не меньше сегодняшней — действует сразу и снимает отложенное
 * понижение (последний выбор отменяет предыдущий). Меньше сегодняшней —
 * сегодня не меняется ничего, а выбор ложится на завтра.
 */
export function setDailyGoalTarget(profile: Profile, target: number, today: string = dayKey()): Profile {
  const want = clampGoal(target);
  const now = resolveDailyGoal(profile, today).target;
  if (want >= now) return { ...profile, dailyGoalTarget: want, dailyGoalPending: null };
  return { ...profile, dailyGoalTarget: now, dailyGoalPending: { target: want, from: nextDayKey(today) } };
}

// ---- Milestones (near-full-screen celebrations, once each) -------------------

export interface MilestoneHit {
  id: string; // dedupe key, e.g. "streak_7" | "rank_pro"
  kind: "streak" | "rank";
  value: number; // streak days, or the new rank's index
  rankId?: string; // set for rank milestones (drives the localized rank name)
}

// The real milestones reached by THIS game: a 7-day streak, and each rank-up. Pure;
// the caller filters against already-celebrated ids so a card never repeats. Failed
// games pass an empty result upstream (a collapse is never a celebration).
export function milestonesForGame(rankBefore: RankInfo, rankAfter: RankInfo, streak: number): MilestoneHit[] {
  const out: MilestoneHit[] = [];
  if (rankAfter.index > rankBefore.index) {
    out.push({ id: `rank_${rankAfter.rank.id}`, kind: "rank", value: rankAfter.index, rankId: rankAfter.rank.id });
  }
  if (streak >= 7) out.push({ id: "streak_7", kind: "streak", value: 7 });
  return out;
}

export interface RecordResult {
  profile: Profile; // the updated profile (immutable copy)
  record: ScenarioRecord; // the scenario's record AFTER this run
  prevBest: { grade: Grade | null; score: number } | null; // best BEFORE this run
  // Did this run BEAT a previously recorded best? False on the first-ever attempt
  // of a scenario — a first result is the silent baseline, not a "new record".
  improved: boolean;
  isFirst: boolean; // no prior recorded best existed (this run sets the baseline)
}

// Fold one finished negotiation into the profile: bump attempts + lastPlayed,
// raise the scenario best only-if-improved, and advance the day streak. Pure:
// returns a fresh Profile, mutating nothing. `today` is injectable for tests.
export function recordDebrief(
  profile: Profile,
  scenarioId: string,
  grade: Grade,
  score: number,
  now: Date = new Date(),
): RecordResult {
  const prev = profile.scenarios[scenarioId] ?? null;
  const prevBest = prev ? { grade: prev.bestGrade, score: prev.bestScore } : null;
  const hadBest = !!(prev && prev.bestGrade !== null);
  // `raise` decides whether we overwrite the stored best (true on the first run,
  // so the baseline gets recorded). `improved` is the CELEBRATORY signal — it only
  // fires when a real prior best was actually beaten, never on the first attempt.
  const raise = isBetter(grade, score, prev);
  const improved = hadBest && raise;
  const isFirst = !hadBest;

  const record: ScenarioRecord = {
    bestGrade: raise ? grade : prev!.bestGrade,
    bestScore: raise ? score : prev!.bestScore,
    attempts: (prev?.attempts ?? 0) + 1,
    lastPlayed: now.toISOString(),
  };

  const today = dayKey(now);
  const streak = nextStreak(profile.streak, profile.lastStreakDay, today);

  const next: Profile = {
    version: VERSION,
    scenarios: { ...profile.scenarios, [scenarioId]: record },
    streak,
    lastStreakDay: today,
    // Gamification fields are owned by applyDebrief; recordDebrief only advances
    // the record + streak, so it passes them through untouched.
    xp: profile.xp,
    skills: profile.skills,
    achievements: profile.achievements,
    freezes: profile.freezes,
    dailyGoalTarget: profile.dailyGoalTarget,
    dailyGoalPending: profile.dailyGoalPending,
    dailyDoneDay: profile.dailyDoneDay,
    dailyDoneCount: profile.dailyDoneCount,
    celebratedMilestones: profile.celebratedMilestones,
    course: profile.course,
    campaigns: profile.campaigns,
  };
  return { profile: next, record, prevBest, improved, isFirst };
}

// ---- localStorage adapters (defensive; never throw into the UI) ----

function sanitizeRecord(v: unknown): ScenarioRecord | null {
  if (!v || typeof v !== "object") return null;
  const r = v as Record<string, unknown>;
  const g = r.bestGrade;
  const bestGrade =
    g === "A" || g === "B" || g === "C" || g === "D" || g === "F" ? (g as Grade) : null;
  const bestScore = typeof r.bestScore === "number" && isFinite(r.bestScore) ? r.bestScore : 0;
  const attempts = typeof r.attempts === "number" && r.attempts >= 0 ? Math.floor(r.attempts) : 0;
  const lastPlayed = typeof r.lastPlayed === "string" ? r.lastPlayed : "";
  return { bestGrade, bestScore, attempts, lastPlayed };
}

function sanitizeGoalPending(v: unknown): DailyGoalPending | null {
  if (!v || typeof v !== "object") return null;
  const r = v as Record<string, unknown>;
  if (typeof r.target !== "number" || !isFinite(r.target)) return null;
  if (typeof r.from !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(r.from)) return null;
  return { target: clampGoal(r.target), from: r.from };
}

// Read before a write: another tab may have completed a lesson since mount.
// Preserve in-memory progress when storage is unavailable. This prevents stale
// sequential writes, not simultaneous cross-tab read/modify/write races.
// AUDIT-LIMIT profile-writers: mixed quota failure + another tab is not merged.
// See docs/deep-audit-12206/CLEANUP.md.
export function loadProfile(fallback: Profile = emptyProfile()): Profile {
  if (unsavedProfile) return unsavedProfile;
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(KEY) : null;
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const scenarios: Record<string, ScenarioRecord> = {};
    const src = parsed.scenarios;
    if (src && typeof src === "object") {
      for (const [id, val] of Object.entries(src as Record<string, unknown>)) {
        const rec = sanitizeRecord(val);
        if (rec) scenarios[id] = rec;
      }
    }
    return {
      version: VERSION,
      scenarios,
      streak: typeof parsed.streak === "number" && parsed.streak >= 0 ? Math.floor(parsed.streak) : 0,
      lastStreakDay: typeof parsed.lastStreakDay === "string" ? parsed.lastStreakDay : "",
      xp: typeof parsed.xp === "number" && isFinite(parsed.xp) && parsed.xp >= 0 ? Math.floor(parsed.xp) : 0,
      skills: sanitizeSkills(parsed.skills),
      achievements: Array.isArray(parsed.achievements)
        ? parsed.achievements.filter((a): a is string => typeof a === "string")
        : [],
      // v3 retention fields — any pre-v3 blob loads them defaulted (never throws).
      freezes:
        typeof parsed.freezes === "number" && isFinite(parsed.freezes) && parsed.freezes >= 0
          ? clamp(Math.floor(parsed.freezes), 0, FREEZE_CAP)
          : 0,
      dailyGoalTarget:
        typeof parsed.dailyGoalTarget === "number" && isFinite(parsed.dailyGoalTarget)
          ? clampGoal(parsed.dailyGoalTarget)
          : DAILY_GOAL_DEFAULT,
      // Отложенное понижение появилось позже всего остального: у старого
      // профиля его нет — значит, ничего не отложено. Кривое — тоже ничего.
      dailyGoalPending: sanitizeGoalPending(parsed.dailyGoalPending),
      dailyDoneDay: typeof parsed.dailyDoneDay === "string" ? parsed.dailyDoneDay : "",
      dailyDoneCount:
        typeof parsed.dailyDoneCount === "number" && parsed.dailyDoneCount >= 0
          ? Math.floor(parsed.dailyDoneCount)
          : 0,
      celebratedMilestones: Array.isArray(parsed.celebratedMilestones)
        ? parsed.celebratedMilestones.filter((a): a is string => typeof a === "string")
        : [],
      // v4: любой более старый блоб загружается с пустым курсом — как и все
      // предыдущие добавления, поле дефолтится, а не роняет профиль.
      course: sanitizeCourse(parsed.course),
      // v5: кампании. Тот же приём, что у всех предыдущих добавлений — чужой
      // (старый или испорченный) блоб грузится с пустой картой, а не падает.
      campaigns: sanitizeCampaigns(parsed.campaigns),
    };
  } catch {
    return fallback;
  }
}

function sanitizeCourse(v: unknown): Record<string, BlockProgress> {
  const out: Record<string, BlockProgress> = {};
  if (!v || typeof v !== "object") return out;
  for (const [id, val] of Object.entries(v as Record<string, unknown>)) {
    if (!val || typeof val !== "object") continue;
    const r = val as Record<string, unknown>;
    const nums = (x: unknown) => (Array.isArray(x) ? x.filter((n): n is number => typeof n === "number") : []);
    const strs = (x: unknown) => (Array.isArray(x) ? x.filter((n): n is string => typeof n === "string") : []);
    out[id] = {
      lessons: [...new Set(nums(r.lessons))],
      solved: [...new Set(strs(r.solved))],
      missed: [...new Set(strs(r.missed))],
      examBest: typeof r.examBest === "number" && r.examBest >= 0 ? Math.floor(r.examBest) : 0,
      examTotal: typeof r.examTotal === "number" && r.examTotal >= 0 ? Math.floor(r.examTotal) : 0,
      passed: r.passed === true,
      attempts: typeof r.attempts === "number" && r.attempts >= 0 ? Math.floor(r.attempts) : 0,
    };
  }
  return out;
}

/** Разбор карты кампаний из хранилища. Каждое поле проверяется по отдельности:
 *  испорченная запись ОДНОЙ кампании не должна уносить с собой вторую, а
 *  «пройдено актов больше, чем сыграно» — не состояние, в котором арка
 *  когда-либо была, значит это чужой блоб. */
function sanitizeCampaigns(v: unknown): Record<string, CampaignProgress> {
  const out: Record<string, CampaignProgress> = {};
  if (!v || typeof v !== "object") return out;
  for (const [id, val] of Object.entries(v as Record<string, unknown>)) {
    if (!id || !val || typeof val !== "object") continue;
    const r = val as Record<string, unknown>;
    const results = (Array.isArray(r.results) ? r.results : [])
      .map((x): StageResult | null => {
        if (!x || typeof x !== "object") return null;
        const e = x as Record<string, unknown>;
        const g = e.grade;
        if (g !== "A" && g !== "B" && g !== "C" && g !== "D" && g !== "F") return null;
        const overall = typeof e.overall === "number" && isFinite(e.overall) ? clamp(Math.round(e.overall), 0, 100) : 0;
        return { grade: g, overall };
      })
      .filter((x): x is StageResult => x !== null)
      .slice(0, CAMPAIGN_MAX_ACTS);
    const rawIdx = typeof r.stageIndex === "number" && isFinite(r.stageIndex) ? Math.floor(r.stageIndex) : 0;
    out[id] = {
      // Акт «следующий» не может быть раньше сыгранных и не может убежать за
      // потолок: иначе подделанный блоб открывал бы четвёртый акт с нуля.
      stageIndex: clamp(rawIdx, results.length, CAMPAIGN_MAX_ACTS),
      reputation: typeof r.reputation === "number" && isFinite(r.reputation)
        ? clamp(Math.round(r.reputation), -100, 100) : 0,
      results,
      updatedAt: typeof r.updatedAt === "string" ? r.updatedAt : "",
    };
  }
  return out;
}

function sanitizeSkills(v: unknown): Record<SkillId, SkillAgg> {
  const out = emptySkills();
  if (v && typeof v === "object") {
    const src = v as Record<string, unknown>;
    for (const id of SKILL_IDS) {
      const a = src[id];
      if (a && typeof a === "object") {
        const r = a as Record<string, unknown>;
        const sum = typeof r.sum === "number" && isFinite(r.sum) && r.sum >= 0 ? r.sum : 0;
        const n = typeof r.n === "number" && isFinite(r.n) && r.n >= 0 ? Math.floor(r.n) : 0;
        out[id] = { sum, n };
      }
    }
  }
  return out;
}

export function saveProfile(p: Profile): void {
  try {
    if (typeof localStorage === "undefined") { unsavedProfile = p; return; }
    localStorage.setItem(KEY, JSON.stringify(p));
    unsavedProfile = null;
  } catch {
    // storage full / disabled / private mode — progress is best-effort, not load-bearing.
    unsavedProfile = p;
  }
}

export function getRecord(profile: Profile, scenarioId: string): ScenarioRecord | null {
  return profile.scenarios[scenarioId] ?? null;
}

// ---- First-run onboarding gate ---------------------------------------------
// A one-time flag: has the player been through (or skipped) the guided first
// negotiation? Kept in its own key — it's a boolean milestone, unrelated to the
// scoring/streak profile, so a corrupt profile blob never blocks or re-triggers
// onboarding. Reads/writes are defensive (private mode / disabled storage just
// means the tutorial may show again — never a thrown error into the UI).
//
// КЛЮЧ ОДИН, И ТЕПЕРЬ ОН ТОЛЬКО ПРО СТОЛ. Какое-то время он был ступенчатым
// ("home" — пройден обход главной, "1" — всё): обход главной показывался один
// раз. Его заменили туры по разделам со своим хранилищем (lib/tours.ts), и
// этот ключ снова решает одно — подсветки за столом в первой партии. Старое
// значение "home" у людей в браузере безвредно: для стола это «ещё не видел».
// Приборы и e2e по-прежнему пишут сюда "1" (и выключают туры своим ключом).
const TUTORIAL_KEY = "dialog.tutorialDone.v1";

function tutorialStage(): string | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage.getItem(TUTORIAL_KEY) : null;
  } catch {
    return null;
  }
}

export function isTutorialDone(): boolean {
  return tutorialStage() === "1";
}

export function markTutorialDone(): void {
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(TUTORIAL_KEY, "1");
  } catch {
    // best-effort; a blocked store just means the guided intro may run again
  }
}

/** Доиграл ли человек хоть что-нибудь: партию (запись стола) или задание курса
 *  (опыт). Отвечает на вопрос «новичок ли это» по профилю, а не по флагу
 *  вводной: вводную можно пропустить, не сыграв ни одного хода. */
export function hasPlayed(profile: Pick<Profile, "xp" | "scenarios">): boolean {
  return profile.xp > 0 || Object.keys(profile.scenarios).length > 0;
}

// Pure gate for the guided first negotiation. It runs ONLY in practice (an
// assessment/exam, a narrative campaign act, or a custom deal must never be
// hijacked by coach-marks) and ONLY until the player has finished or skipped it
// once. Pure so the rule is unit-testable without touching localStorage.
export function shouldRunTutorial(mode: Mode, tutorialDone: boolean): boolean {
  return mode === "practice" && !tutorialDone;
}

// ============================================================================
// Gamification — all derived from HONEST engine numbers. XP rewards the score
// the deterministic engine already assigned; skills aggregate the same stat
// signals the debrief shows; achievements are skill-truthful predicates. There
// is no path to earn XP/ranks/badges by gaming — only by negotiating better.
// Everything here is pure (no I/O); applyDebrief folds it into a fresh Profile.
// ============================================================================

// ---- XP + ranks --------------------------------------------------------------

// XP for one finished negotiation. Honest by construction:
//  - a BREAKDOWN (talks collapsed) is scaled down hard (×0.3) and earns no
//    bonuses — a failed negotiation should never feel rewarded.
//  - otherwise it's the engine's own score, plus a record bonus (only when a real
//    prior best was beaten — `improved`) and a small closing bonus (reaching a deal).
// `improved` here is the celebratory flag (passing grade AND a beaten prior best),
// so a lucky D/F never collects the +25 record bonus.
export function xpForDebrief(overall: number, status: Debrief["status"], improved: boolean): number {
  if (status === "breakdown") return Math.max(0, Math.round(overall * 0.3));
  let xp = Math.max(0, Math.round(overall));
  if (improved) xp += 25; // beat your personal best on this scenario
  if (status === "agreement") xp += 15; // closed the deal
  return xp;
}

export interface Rank {
  id: string;
  min: number; // XP threshold to enter this rank
  name: { ru: string; en: string };
}

// Новичок → Переговорщик → Профи → Мастер → Гроссмейстер (CLAUDE.md).
export const RANKS: Rank[] = [
  { id: "novice", min: 0, name: { ru: "Новичок", en: "Novice" } },
  { id: "negotiator", min: 150, name: { ru: "Переговорщик", en: "Negotiator" } },
  { id: "pro", min: 400, name: { ru: "Профи", en: "Pro" } },
  { id: "master", min: 900, name: { ru: "Мастер", en: "Master" } },
  { id: "grandmaster", min: 1800, name: { ru: "Гроссмейстер", en: "Grandmaster" } },
];

export interface RankInfo {
  rank: Rank; // current rank
  index: number; // 0-based rank index
  next: Rank | null; // next rank (null at the top)
  intoRank: number; // XP earned inside the current tier
  span: number; // XP width of the current tier (0 at the top)
  toNext: number; // XP remaining to the next rank (0 at the top)
  progress: number; // 0..1 fraction toward the next rank (1 at the top)
}

export function rankForXp(xp: number): RankInfo {
  const x = Math.max(0, xp);
  let index = 0;
  for (let i = 0; i < RANKS.length; i++) if (x >= RANKS[i].min) index = i;
  const rank = RANKS[index];
  const next = index + 1 < RANKS.length ? RANKS[index + 1] : null;
  if (!next) {
    return { rank, index, next: null, intoRank: x - rank.min, span: 0, toNext: 0, progress: 1 };
  }
  const span = next.min - rank.min;
  const intoRank = x - rank.min;
  return {
    rank,
    index,
    next,
    intoRank,
    span,
    toNext: Math.max(0, next.min - x),
    progress: span > 0 ? clamp(intoRank / span, 0, 1) : 1,
  };
}

// ---- Skill mastery -----------------------------------------------------------

// One game's 0..100 signal per skill, read straight from the debrief. Missing
// denominators degrade to 0 (a scenario with no interests contributes 0 there).
export function skillSignals(d: Debrief): Record<SkillId, number> {
  const pct = (num: number, den: number) => (den > 0 ? clamp(Math.round((num / den) * 100), 0, 100) : 0);
  return {
    questions: pct(d.spin_stages, 3), // SPIN ladder climbed (0..3 stages)
    interests: pct(d.interests_found, d.interests_total), // hidden interests uncovered
    criteria: pct(Math.min(d.objective_criteria, 3), 3), // objective criteria invoked
    listening: pct(Math.min(d.empathy, 3), 3), // acknowledgements / active listening
    tradeoff: pct(Math.min(d.tradeoffs, 2), 2), // logrolling trades made
    tension: clamp(Math.round(d.relationship), 0, 100), // engine's relationship dim (trust kept, tension low)
  };
}

export function masteryOf(agg: SkillAgg): number {
  return agg.n > 0 ? Math.round(agg.sum / agg.n) : 0;
}

export interface SkillView {
  id: SkillId;
  mastery: number; // 0..100 running average
  n: number; // games contributing
}

export function skillViews(profile: Profile): SkillView[] {
  return SKILL_IDS.map((id) => ({ id, mastery: masteryOf(profile.skills[id]), n: profile.skills[id].n }));
}

// Strongest / weakest played skills — the one-line "Силён в … · Подтяни …" read.
// Only skills with at least one game count; null when nothing has been played.
export function strongestWeakest(profile: Profile): { strong: SkillId | null; weak: SkillId | null } {
  const played = skillViews(profile).filter((s) => s.n > 0);
  if (played.length === 0) return { strong: null, weak: null };
  let strong = played[0];
  let weak = played[0];
  for (const s of played) {
    if (s.mastery > strong.mastery) strong = s;
    if (s.mastery < weak.mastery) weak = s;
  }
  return { strong: strong.id, weak: played.length > 1 ? weak.id : null };
}

// ---- Achievements ------------------------------------------------------------

export interface Achievement {
  id: string;
  icon: string;
  name: { ru: string; en: string };
  desc: { ru: string; en: string };
}

// Six skill-honest badges. Each is unlocked by a real negotiation outcome, never
// by grinding. Predicates below decide unlock from (profile-after, this debrief).
export const ACHIEVEMENTS: Achievement[] = [
  { id: "first_a", icon: "trophy", name: { ru: "Высший балл", en: "Top marks" }, desc: { ru: "Грейд A впервые", en: "Earn an A grade" } },
  { id: "streak_3", icon: "flame", name: { ru: "Три дня подряд", en: "Three-day streak" }, desc: { ru: "Играть 3 дня подряд", en: "Play 3 days in a row" } },
  { id: "all_interests", icon: "search", name: { ru: "Все интересы", en: "Full read" }, desc: { ru: "Вскрыть все интересы в игре", en: "Uncover every hidden interest in one game" } },
  { id: "no_threat_deal", icon: "handshake", name: { ru: "Чистая сделка", en: "Clean deal" }, desc: { ru: "Сделка без единой угрозы", en: "Close a deal with zero threats" } },
  { id: "criteria_tradeoff", icon: "scales", name: { ru: "Критерий и размен", en: "Criterion & trade" }, desc: { ru: "Критерий и размен в одной игре", en: "Use an objective criterion and a trade-off in one game" } },
  { id: "five_scenarios", icon: "map", name: { ru: "Пять столов", en: "Five tables" }, desc: { ru: "Сыграть 5 разных сценариев", en: "Play 5 different scenarios" } },
  // Курсовые. Дают ту же валюту, что и партии: у игрока одна история обучения,
  // а не две параллельных полки значков.
  { id: "block_passed", icon: "book", name: { ru: "Первый блок", en: "First block" }, desc: { ru: "Сдать экзамен блока", en: "Pass a block exam" } },
  { id: "exam_clean", icon: "check", name: { ru: "Без единой ошибки", en: "Flawless" }, desc: { ru: "Сдать экзамен блока на максимум", en: "Score full marks on a block exam" } },
  { id: "course_half", icon: "books", name: { ru: "Половина пути", en: "Halfway" }, desc: { ru: "Сдать половину блоков курса", en: "Pass half of the course blocks" } },
  { id: "course_done", icon: "cap", name: { ru: "Курс пройден", en: "Course complete" }, desc: { ru: "Сдать все блоки курса", en: "Pass every course block" } },
  { id: "master_exam", icon: "crown", name: { ru: "Мастер", en: "Master" }, desc: { ru: "Сдать экзамен мастера — три партии подряд", en: "Pass the master exam — three negotiations in a row" } },
];

export function getAchievement(id: string): Achievement | undefined {
  return ACHIEVEMENTS.find((a) => a.id === id);
}

// The full set of achievement ids that SHOULD be unlocked given the profile
// (already folded with this run) and the just-finished debrief. Pure/deterministic.
export function earnedAchievements(profile: Profile, d: Debrief): string[] {
  const out: string[] = [];
  // A collapsed negotiation earns no skill/success badge — you can't "win" a table
  // you blew up. Only participation badges (streak, breadth) survive a breakdown.
  const failed = d.status === "breakdown";
  if (!failed && d.grade === "A") out.push("first_a");
  if (profile.streak >= 3) out.push("streak_3");
  if (!failed && d.interests_total > 0 && d.interests_found >= d.interests_total) out.push("all_interests");
  if (d.status === "agreement" && d.threats === 0) out.push("no_threat_deal");
  if (!failed && d.objective_criteria > 0 && d.tradeoffs > 0) out.push("criteria_tradeoff");
  if (Object.keys(profile.scenarios).length >= 5) out.push("five_scenarios");
  return out;
}

// ---- Orchestrator: fold one finished game into the full profile --------------

export interface GameResult extends RecordResult {
  xpGain: number;
  xpBefore: number;
  xpAfter: number;
  rankBefore: RankInfo;
  rankAfter: RankInfo;
  leveledUp: boolean; // crossed into a new rank this game
  newAchievements: string[]; // ids first unlocked this game (for toasts)
  dailyGoalMet: boolean; // this game HIT the daily target (the crossing game)
  dailyDone: number; // finished games today AFTER this one (toward the ring)
  dailyTarget: number; // the player's chosen daily target (1..3)
  freezes: number; // streak-freezes held AFTER this game
  freezeUsed: boolean; // a freeze saved the streak this game (gentle note)
  newMilestones: MilestoneHit[]; // real milestones to celebrate now (deduped, none on a fail)
  // The negotiation collapsed (walked out / timed out). Drives the sober,
  // no-fanfare debrief tone: reduced XP, no record splash, no level-up flourish.
  failed: boolean;
  // Earn the celebratory "new record" flourish: a real prior best was beaten AND
  // the outcome is a passing, non-collapsed one. Guards against celebrating a D/F.
  celebrate: boolean;
  // Did this run extend the day-streak? True only for a C+ (non-collapse) result.
  // A D/F leaves the streak untouched (neither advanced nor reset) — lets the UI
  // note honestly that a weak run didn't count toward the streak.
  streakCounted: boolean;
}

// The single entry point the app calls on every debrief. Builds on recordDebrief
// (best-only-if-improved + streak) and additionally: awards XP, updates the rank,
// folds skill signals into the running averages, and unlocks achievements. Pure:
// returns a fresh Profile; `now` is injectable for tests.
export function applyDebrief(
  profile: Profile,
  scenarioId: string,
  d: Debrief,
  now: Date = new Date(),
): GameResult {
  const today = dayKey(now);

  // Daily goal: count finished games in the local day, then fire "met" only on the
  // game that CROSSES the chosen target (later games the same day don't re-fire).
  // Цель — та, что действует СЕГОДНЯ: с учётом понижения, чей день наступил.
  // Записывается она же — вступившее в силу понижение уходит из профиля.
  const goalToday = resolveDailyGoal(profile, today);
  const dailyTarget = goalToday.target;
  const doneBefore = profile.dailyDoneDay === today ? Math.max(0, profile.dailyDoneCount) : 0;
  const dailyDone = doneBefore + 1;
  const dailyGoalMet = dailyDone === dailyTarget;

  const base = recordDebrief(profile, scenarioId, d.grade as Grade, d.overall, now);

  // Honesty gate: a collapsed table or a failing grade never triggers the record
  // fanfare or its XP bonus, even if the raw score edged out a prior (worse) best.
  const failed = d.status === "breakdown";
  const passing = d.grade !== "D" && d.grade !== "F";
  const celebrate = base.improved && passing && !failed;

  // Streak honesty: the day-streak is a MASTERY streak, not an attendance log — only
  // a competent result (C+ and no collapse) marks a day as "qualifying", so `streak` =
  // "consecutive days you actually negotiated to at least a C". A weak run doesn't
  // touch the count in the moment (a later C+ the same day still extends it), but it
  // also fails to mark the day — so a day with NO C+ breaks the chain, and the next
  // qualifying day restarts unless a banked freeze covers the gap. This closes the
  // loophole of farming a streak by opening the app and tanking a game. Freeze-aware
  // transition (recompute from the ORIGINAL profile) — applied ONLY when the run qualifies.
  const streakCounted = passing && !failed;
  const su = updateStreak({ streak: profile.streak, freezes: profile.freezes }, profile.lastStreakDay, today);
  const streakOut = streakCounted
    ? { streak: su.streak, freezes: su.freezes, lastStreakDay: today, freezeUsed: su.freezeUsed }
    : { streak: profile.streak, freezes: profile.freezes, lastStreakDay: profile.lastStreakDay, freezeUsed: false };

  const xpGain = xpForDebrief(d.overall, d.status, celebrate);
  const xpBefore = profile.xp;
  const xpAfter = xpBefore + xpGain;
  const rankBefore = rankForXp(xpBefore);
  const rankAfter = rankForXp(xpAfter);

  const skills = { ...base.profile.skills };
  const sig = skillSignals(d);
  for (const id of SKILL_IDS) {
    const prev = profile.skills[id];
    skills[id] = { sum: prev.sum + sig[id], n: prev.n + 1 };
  }

  const nextProfile: Profile = {
    ...base.profile,
    xp: xpAfter,
    skills,
    // Override the baseline streak with the C+-gated, freeze-aware result. When the
    // run didn't qualify, streakOut carries the profile's streak/day forward unchanged.
    streak: streakOut.streak,
    freezes: streakOut.freezes,
    lastStreakDay: streakOut.lastStreakDay,
    dailyGoalTarget: goalToday.target,
    dailyGoalPending: goalToday.pending,
    dailyDoneDay: today,
    dailyDoneCount: dailyDone,
  };
  const earned = earnedAchievements(nextProfile, d);
  const newAchievements = earned.filter((a) => !profile.achievements.includes(a));
  nextProfile.achievements = Array.from(new Set([...profile.achievements, ...earned]));

  // Milestones: real, once each, never on a collapse. Filter against what's already
  // been celebrated, then mark the newly-shown ones so a card can never repeat.
  const hits = failed ? [] : milestonesForGame(rankBefore, rankAfter, streakOut.streak);
  const newMilestones = hits.filter((h) => !profile.celebratedMilestones.includes(h.id));
  nextProfile.celebratedMilestones = Array.from(
    new Set([...profile.celebratedMilestones, ...newMilestones.map((h) => h.id)]),
  );

  return {
    ...base,
    profile: nextProfile,
    xpGain,
    xpBefore,
    xpAfter,
    rankBefore,
    rankAfter,
    leveledUp: rankAfter.index > rankBefore.index,
    newAchievements,
    dailyGoalMet,
    dailyDone,
    dailyTarget,
    freezes: streakOut.freezes,
    freezeUsed: streakOut.freezeUsed,
    newMilestones,
    failed,
    celebrate,
    streakCounted,
  };
}


// ---------------------------------------------------------------- курс приёмов
//
// Чистые функции над профилем: то же правило, что и у остального прогресса —
// математика без localStorage, поэтому её можно проверить тестом.

function blockOf(profile: Profile, blockId: string): BlockProgress {
  return profile.course[blockId] ?? emptyBlockProgress();
}

export function getBlockProgress(profile: Profile, blockId: string): BlockProgress {
  return blockOf(profile, blockId);
}

/**
 * День засчитан в серию.
 *
 * Серия росла только за законченные партии — а человек, который каждый день
 * проходит по уроку, для продукта выглядел бездельником. Дневная ЦЕЛЬ при этом
 * остаётся про партии: пройденный урок — это «я был здесь», а не «я сыграл».
 */
export function touchStreak(profile: Profile, now: Date = new Date()): Profile {
  const today = dayKey(now);
  if (profile.lastStreakDay === today) return profile;
  const next = updateStreak(
    { streak: profile.streak, freezes: profile.freezes }, profile.lastStreakDay, today);
  return { ...profile, streak: next.streak, freezes: next.freezes, lastStreakDay: today };
}

/** Урок прочитан. XP за чтение не даём: платим за решённое, а не за пролистанное. */
export function markLessonDone(profile: Profile, blockId: string, lesson: number,
                               now: Date = new Date()): Profile {
  const b = blockOf(profile, blockId);
  if (b.lessons.includes(lesson)) return profile;
  return touchStreak({
    ...profile,
    course: { ...profile.course, [blockId]: { ...b, lessons: [...b.lessons, lesson].sort((x, y) => x - y) } },
  }, now);
}

/**
 * Упражнение решено верно. XP начисляется ОДИН раз за упражнение — иначе
 * фарм повтором превращает прогресс в счётчик усидчивости.
 */
export function recordExercise(profile: Profile, blockId: string, exerciseId: string,
                               xp: number, correct: boolean): { profile: Profile; xpGain: number } {
  const b = blockOf(profile, blockId);
  // Ошибка попадает в список на переделку и НЕ считается решённой. Верный ответ
  // снимает её оттуда — «работа над ошибками» существует ровно до тех пор, пока
  // ошибка не исправлена, а не вечно.
  if (!correct) {
    if (b.missed.includes(exerciseId) || b.solved.includes(exerciseId)) return { profile, xpGain: 0 };
    return {
      profile: { ...profile, course: { ...profile.course, [blockId]: { ...b, missed: [...b.missed, exerciseId] } } },
      xpGain: 0,
    };
  }
  const missed = b.missed.filter((id) => id !== exerciseId);
  if (b.solved.includes(exerciseId)) {
    if (missed.length === b.missed.length) return { profile, xpGain: 0 };
    return { profile: { ...profile, course: { ...profile.course, [blockId]: { ...b, missed } } }, xpGain: 0 };
  }
  // XP за исправленную ошибку платится половиной: навык тот же, но узнавание с
  // первого раза стоит дороже — иначе выгодно ошибаться нарочно.
  const gain = b.missed.includes(exerciseId) ? Math.round(xp / 2) : xp;
  const next: Profile = {
    ...profile,
    xp: profile.xp + gain,
    course: { ...profile.course, [blockId]: { ...b, solved: [...b.solved, exerciseId], missed } },
  };
  return { profile: next, xpGain: gain };
}

/** Все нерешённые ошибки по всему курсу: (блок, id упражнения). */
export function missedExercises(profile: Profile): { blockId: string; id: string }[] {
  return Object.entries(profile.course)
    .flatMap(([blockId, b]) => b.missed.map((id) => ({ blockId, id })));
}

/**
 * Итог экзамена блока. Провал даёт долю XP, а не ноль: попытка чему-то научила,
 * но и бонуса за неё нет — та же честная логика, что у `xpForDebrief`.
 */
export const MASTER_ID = "master";

export function courseAchievements(profile: Profile, justScored?: { score: number; total: number }): string[] {
  // Экзамен мастера живёт в том же словаре, но блоком не является: иначе он
  // считался бы десятым и «курс пройден» выдавался бы за девять из десяти.
  const passed = Object.entries(profile.course)
    .filter(([id, b]) => id !== MASTER_ID && b.passed).length;
  const out: string[] = [];
  if (profile.course[MASTER_ID]?.passed) out.push("master_exam");
  if (passed >= 1) out.push("block_passed");
  // Порог «курс пройден» — ЧИСЛО БЛОКОВ, а не константа 9: блок добавили, а
  // значок остался бы за девять из десяти, то есть выдавался бы за непройденный
  // курс. Половина считается от того же числа по той же причине.
  if (passed >= Math.ceil(COURSE_BLOCKS.length / 2)) out.push("course_half");
  if (passed >= COURSE_BLOCKS.length) out.push("course_done");
  if (justScored && justScored.total > 0 && justScored.score >= justScored.total) out.push("exam_clean");
  return out;
}

export function recordExam(profile: Profile, blockId: string, score: number, total: number,
                           passMark: number): {
  profile: Profile; xpGain: number; passed: boolean; newAchievements: string[];
} {
  const b = blockOf(profile, blockId);
  const ok = score >= passMark;
  const share = total > 0 ? score / total : 0;
  const xpGain = ok && !b.passed ? 60 : Math.round(30 * share);
  const withBlock: Profile = {
    ...profile,
    xp: profile.xp + xpGain,
    course: {
      ...profile.course,
      [blockId]: {
        ...b,
        attempts: b.attempts + 1,
        examBest: Math.max(b.examBest, score),
        examTotal: total,
        passed: b.passed || ok,
      },
    },
  };
  // Значки считаются ПОСЛЕ записи блока — иначе «первый сданный блок» никогда
  // не выпадет на том экзамене, который его и сдал.
  const withDay = touchStreak(withBlock);
  const earned = courseAchievements(withDay, { score, total });
  const fresh = earned.filter((id) => !withDay.achievements.includes(id));
  const next: Profile = fresh.length
    ? { ...withDay, achievements: [...withDay.achievements, ...fresh] }
    : withDay;
  return { profile: next, xpGain, passed: ok, newAchievements: fresh };
}

/** Доля блока, пройденная игроком (0..1): уроки + упражнения + экзамен. */
export function blockCompletion(b: BlockProgress, lessons: number, exercises: number): number {
  const parts = [
    lessons > 0 ? Math.min(1, b.lessons.length / lessons) : 0,
    exercises > 0 ? Math.min(1, b.solved.length / exercises) : 0,
    b.passed ? 1 : 0,
  ];
  return parts.reduce((a, x) => a + x, 0) / parts.length;
}

// ============================================================================
// Прошлая партия за столом — «переиграй против себя вчерашнего».
//
// Движок это чистая функция от (сценарий, порядок ходов): одинаковый вход даёт
// байт-в-байт одинаковое состояние. Значит, чтобы посадить рядом с игроком его
// же прошлую попытку, хранить надо не картинку партии, а её ВХОД — стол,
// стартовые условия и реплики по порядку. Всё остальное пересчитает движок
// (lib/rematch.ts), и пересчитает одинаково на сервере и офлайн (инвариант 8).
//
// ПОЧЕМУ ОТДЕЛЬНЫЙ КЛЮЧ, А НЕ ПОЛЕ ПРОФИЛЯ. Стенограммы — самое тяжёлое, что
// продукт кладёт в localStorage, и единственное, что может упереться в квоту.
// В общем блобе переполнение унесло бы с собой XP, серию и курс — то есть
// цену прогресса за всё время. Тот же приём, что у флага онбординга: своя
// коробка, своё защищённое чтение, отдельная авария.
// ============================================================================

/** Стартовые условия стола — то, что модификаторы («стол дня», репутация акта)
 *  меняют ДО первого хода. Хранятся замером, а не причиной: правило, по
 *  которому они получились, живёт в одном месте (сервер и MockServer), и
 *  повторять его здесь значило бы завести второй источник правды. */
export interface RunOpening {
  trust: number;
  tension: number;
  maxTurns: number;
  /** Absent on historical records: their final result remains valid, but the
   *  old trajectory cannot be reconstructed using a different balance. */
  balanceVersion?: string;
}

/** Одна сохранённая партия: вход движка плюс итог, который движок поставил. */
export interface PastRun {
  scenarioId: string;
  /** Язык партии. Реплики опознаются по ключевым словам своего языка, поэтому
   *  русскую стенограмму нельзя переигрывать по-английски: сравнение молча
   *  потеряло бы вскрытые интересы. Разошёлся язык — сравнения нет. */
  lang: "ru" | "en";
  at: string; // ISO-время окончания
  opening: RunOpening;
  moves: string[]; // реплики игрока по порядку
  // Итог, как его посчитал движок в ТОЙ партии. Показывается как есть и никогда
  // не пересчитывается: это послесловие, а не вторая оценка (инвариант 6).
  grade: Grade;
  score: number; // overall
  economic: number;
  relationship: number;
  technique: number;
  dealText: string;
  status: Debrief["status"];
}

const PAST_KEY = "dialog.pastruns.v1";
/** Ходов в партии максимум двенадцать; двадцать четыре — тот же запас, что у
 *  «А что если…», и он же потолок для чужого (испорченного) блоба. */
export const PAST_MAX_MOVES = 24;
/** Композер и так режет ввод; здесь потолок против раздутого блоба. */
export const PAST_MOVE_CHARS = 400;
/** Столов девять, плюс запас на будущие. Больше — вытесняем самый старый:
 *  квота localStorage не резиновая, а нужен всегда ОДИН стол — текущий. */
export const PAST_MAX_TABLES = 12;

/** Ужать партию до того, что и правда хранится. Чистая функция. */
export function compactRun(run: PastRun): PastRun {
  return {
    ...run,
    moves: run.moves.slice(0, PAST_MAX_MOVES).map((m) => m.slice(0, PAST_MOVE_CHARS)),
  };
}

function sanitizeRun(v: unknown): PastRun | null {
  if (!v || typeof v !== "object") return null;
  const r = v as Record<string, unknown>;
  const g = r.grade;
  if (g !== "A" && g !== "B" && g !== "C" && g !== "D" && g !== "F") return null;
  if (typeof r.scenarioId !== "string" || !r.scenarioId) return null;
  const lang = r.lang === "en" ? "en" : "ru";
  const moves = Array.isArray(r.moves) ? r.moves.filter((m): m is string => typeof m === "string") : [];
  if (moves.length === 0) return null;
  const num = (x: unknown, d: number) => (typeof x === "number" && isFinite(x) ? x : d);
  const op = (r.opening ?? {}) as Record<string, unknown>;
  const st = r.status;
  return compactRun({
    scenarioId: r.scenarioId,
    lang,
    at: typeof r.at === "string" ? r.at : "",
    opening: {
      trust: clamp(num(op.trust, 40), 0, 100),
      tension: clamp(num(op.tension, 25), 0, 100),
      maxTurns: clamp(Math.round(num(op.maxTurns, 12)), 1, PAST_MAX_MOVES),
      ...(typeof op.balanceVersion === "string" && op.balanceVersion.length <= 64
        ? { balanceVersion: op.balanceVersion } : {}),
    },
    moves,
    grade: g as Grade,
    score: clamp(Math.round(num(r.score, 0)), 0, 100),
    economic: clamp(Math.round(num(r.economic, 0)), 0, 100),
    relationship: clamp(Math.round(num(r.relationship, 0)), 0, 100),
    technique: clamp(Math.round(num(r.technique, 0)), 0, 100),
    dealText: typeof r.dealText === "string" ? r.dealText : "",
    status: st === "agreement" || st === "breakdown" ? st : "active",
  });
}

export function loadPastRuns(): Record<string, PastRun> {
  const out: Record<string, PastRun> = {};
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(PAST_KEY) : null;
    if (!raw) return out;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const src = parsed && typeof parsed === "object" ? parsed.tables : null;
    if (!src || typeof src !== "object") return out;
    for (const [id, val] of Object.entries(src as Record<string, unknown>)) {
      const run = sanitizeRun(val);
      if (run) out[id] = run;
    }
  } catch {
    /* испорченный блоб — просто «сравнивать не с чем», а не сбой партии */
  }
  return out;
}

export function loadPastRun(scenarioId: string): PastRun | null {
  return loadPastRuns()[scenarioId] ?? null;
}

/** Какую из двух попыток держать. Тот же порядок, что у личного рекорда
 *  (`isBetter`): соперником остаётся ЛУЧШАЯ ваша игра за этим столом, иначе
 *  одна неудачная партия стирала бы планку, которую вы уже брали. */
export function keepRun(next: PastRun, prev: PastRun | null): PastRun {
  if (!prev) return next;
  // Сменился язык — прошлая стенограмма для сравнения бесполезна (см. PastRun.lang).
  if (prev.lang !== next.lang) return next;
  return isBetter(next.grade, next.score, {
    bestGrade: prev.grade, bestScore: prev.score, attempts: 0, lastPlayed: prev.at,
  }) ? next : prev;
}

/** Чистая свёртка: положить партию в таблицу столов, вытеснив самую старую,
 *  если столов стало больше потолка. Возвращает новую таблицу. */
export function foldPastRun(
  tables: Record<string, PastRun>,
  run: PastRun,
): Record<string, PastRun> {
  const compact = compactRun(run);
  const next = { ...tables, [compact.scenarioId]: keepRun(compact, tables[compact.scenarioId] ?? null) };
  const ids = Object.keys(next);
  if (ids.length <= PAST_MAX_TABLES) return next;
  const oldest = ids
    .filter((id) => id !== compact.scenarioId)
    .sort((a, b) => (next[a].at < next[b].at ? -1 : 1))
    .slice(0, ids.length - PAST_MAX_TABLES);
  for (const id of oldest) delete next[id];
  return next;
}

/** Записать партию и вернуть ТУ, что теперь лежит на этом столе — то есть
 *  соперника следующей партии. Запись «лучшее из двух», см. keepRun. */
export function savePastRun(run: PastRun): PastRun {
  const tables = foldPastRun(loadPastRuns(), run);
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(PAST_KEY, JSON.stringify({ v: 1, tables }));
    }
  } catch {
    /* квота/приватный режим — сравнение просто не переживёт перезагрузку */
  }
  return tables[run.scenarioId];
}


// ============================================================================
// Кампании — прогресс по идентификатору, а не одной записью.
//
// Кампаний две, и обе играются. Пока прогресс жил в состоянии React, у него не
// было ни владельца, ни срока жизни: F5 обнулял четырёхактную арку, а вход во
// вторую кампанию затирал бы первую. Здесь та же математика, что у остального
// профиля, — чистые функции над свежей копией, — поэтому её можно проверить
// тестом, а не глазами.
//
// ОЦЕНКУ ЭТО НЕ ТРОГАЕТ. Репутация — стартовое условие следующего акта (сдвиг
// доверия), ровно как модификатор «стола дня»; в score_session она не входит.
// ============================================================================

const clampRep = (n: number) => clamp(Math.round(n), -100, 100);

export function getCampaignProgress(profile: Profile, campaignId: string): CampaignProgress {
  return profile.campaigns[campaignId] ?? emptyCampaign();
}

export function setCampaignProgress(
  profile: Profile, campaignId: string, p: CampaignProgress,
): Profile {
  return { ...profile, campaigns: { ...profile.campaigns, [campaignId]: p } };
}

/**
 * Акт сыгран: грейд в список, арка на шаг вперёд, репутация — на (балл − 50).
 *
 * Чистая свёртка. Раньше это же правило жило внутри useEffect в App.tsx и
 * проверить его было нечем; здесь оно ещё и не может уехать за число актов —
 * `total` приходит из самой кампании.
 */
export function recordCampaignStage(
  profile: Profile, campaignId: string, total: number,
  grade: string, overall: number, now: Date = new Date(),
): Profile {
  const prev = getCampaignProgress(profile, campaignId);
  if (prev.stageIndex >= total) return profile; // арка пройдена — записывать некуда
  return setCampaignProgress(profile, campaignId, {
    stageIndex: prev.stageIndex + 1,
    reputation: clampRep(prev.reputation + (overall - 50)),
    results: [...prev.results, { grade, overall }],
    updatedAt: now.toISOString(),
  });
}

/** «Пройти заново» — обнуление ОДНОЙ кампании, вторая не трогается. */
export function resetCampaign(profile: Profile, campaignId: string): Profile {
  return setCampaignProgress(profile, campaignId, emptyCampaign());
}

/**
 * Какую кампанию открыть по возвращении: ту, которую играли последней, а из
 * нетронутых — первую в списке. Иначе после перезагрузки человек попадал бы в
 * начало чужой арки, а свою искал бы вручную.
 */
export function activeCampaignId(profile: Profile, ids: string[]): string | null {
  if (ids.length === 0) return null;
  let best: string | null = null;
  let bestAt = "";
  for (const id of ids) {
    const p = profile.campaigns[id];
    if (!p || !p.updatedAt) continue;
    if (p.updatedAt > bestAt) { bestAt = p.updatedAt; best = id; }
  }
  return best ?? ids[0];
}

// ============================================================================
// «Ваш следующий шаг» — маршрут по одному правилу.
//
// На главной девять одинаковых карточек, шесть пунктов меню и пять виджетов
// рейла. Каждый вход честный, но ни один не говорит «начни отсюда», и новичок
// садится за «Раунд с инвестором» (пять точек сложности) с тем же основанием,
// что за «Контракт с поставщиком» (две).
//
// ПРАВИЛО: следующий шаг — это то, что УЖЕ НАЧАТО и не закончено; если начатого
// нет — то, что ещё не открыто; если и этого нет — стол дня. Порядок ниже
// разбирает ровно это, сверху вниз, и других веток у него нет.
//
// Чего здесь НЕТ намеренно: экзамена на сертификат и экзамена мастера. Это не
// «следующий шаг», а отдельное решение человека — сесть под запись, без
// подсказок и без слоёв. Продукт не должен подталкивать к нему карточкой.
// ============================================================================

export type NextStepKind = "first" | "course" | "rematch" | "campaign" | "daily";

/** Стол каталога — только то, что нужно правилу (id и сложность). Каталог сюда
 *  не импортируется: правило обязано быть проверяемым без данных игры. */
export interface RouteTable {
  id: string;
  difficulty: number;
}

/** Кампания — id и число актов. Столько же знает и `recordCampaignStage`. */
export interface RouteCampaign {
  id: string;
  stages: number;
}

export interface RouteInput {
  tables: RouteTable[];
  campaigns: RouteCampaign[];
  /** Стол дня — последний ответ правила, он же состояние «всё пройдено». */
  dailyScenarioId: string;
}

export interface NextStepPick {
  kind: NextStepKind;
  /** Стол, за который сажает шаг (`first` · `rematch` · `campaign` · `daily`). */
  scenarioId: string | null;
  /** Блок курса и урок внутри него (`course`). `lesson === null` — уроки прочитаны. */
  blockId: string | null;
  lesson: number | null;
  /** Курс уже начат — карточка объясняет «доучите», а не «откройте». */
  resumed: boolean;
  campaignId: string | null;
  /** Акт, который играется следующим (0-based), для `campaign`. */
  stageIndex: number;
  /** Рекорд, который надо побить (`rematch`), и сложность стола (`first`). */
  grade: Grade | null;
  score: number;
  difficulty: number;
}

const NO_STEP: NextStepPick = {
  kind: "daily", scenarioId: null, blockId: null, lesson: null, resumed: false,
  campaignId: null, stageIndex: 0, grade: null, score: 0, difficulty: 0,
};

/** Блок начат, но не сдан: есть прочитанные уроки, решённые задания или попытки
 *  экзамена. Именно он — «недоигранный курс», а не любой несданный блок. */
function startedBlock(profile: Profile) {
  return COURSE_BLOCKS.find((b) => {
    const p = profile.course[b.id];
    if (!p || p.passed) return false;
    return p.lessons.length > 0 || p.solved.length > 0 || p.attempts > 0;
  });
}

function courseStep(profile: Profile, blockId: string, resumed: boolean): NextStepPick {
  const block = COURSE_BLOCKS.find((b) => b.id === blockId);
  const done = profile.course[blockId]?.lessons ?? [];
  const lesson = block?.lessons.find((l) => !done.includes(l.idx));
  return { ...NO_STEP, kind: "course", blockId, lesson: lesson ? lesson.idx : null, resumed };
}

/**
 * Единственное правило маршрута. Чистая функция от профиля и трёх списков —
 * ни localStorage, ни каталога, ни сети (инвариант 5).
 */
export function chooseNextStep(profile: Profile, input: RouteInput): NextStepPick {
  const daily: NextStepPick = { ...NO_STEP, kind: "daily", scenarioId: input.dailyScenarioId };

  const played = Object.values(profile.scenarios).filter((r) => r.attempts > 0);
  const touchedCourse = COURSE_BLOCKS.some((b) => {
    const p = profile.course[b.id];
    return !!p && (p.lessons.length > 0 || p.solved.length > 0 || p.attempts > 0 || p.passed);
  });

  // 1. Профиль пуст — самый лёгкий стол каталога, названный поимённо. Ничья по
  //    сложности разрешается порядком каталога: правило обязано быть
  //    воспроизводимым, а не «каким-нибудь из двух».
  if (played.length === 0 && !touchedCourse) {
    const easiest = input.tables.reduce<RouteTable | null>(
      (best, t) => (best === null || normalizeDifficulty(t.difficulty) < normalizeDifficulty(best.difficulty) ? t : best), null);
    if (easiest) {
      return { ...NO_STEP, kind: "first", scenarioId: easiest.id, difficulty: normalizeDifficulty(easiest.difficulty) };
    }
    return daily;
  }

  // 2. Недоигранный блок курса — начатое важнее нового.
  const started = startedBlock(profile);
  if (started) return courseStep(profile, started.id, true);

  // 3. Стол, который вас обыграл. Слабый рекорд — это D или F: тот же порог,
  //    по которому движок считает партию непройденной (см. applyDebrief).
  let weak: { id: string; rec: ScenarioRecord } | null = null;
  for (const [id, rec] of Object.entries(profile.scenarios)) {
    if (rec.bestGrade !== "D" && rec.bestGrade !== "F") continue;
    if (!weak || GRADE_RANK[rec.bestGrade] < GRADE_RANK[weak.rec.bestGrade as Grade]
        || (GRADE_RANK[rec.bestGrade] === GRADE_RANK[weak.rec.bestGrade as Grade]
            && rec.bestScore < weak.rec.bestScore)) {
      weak = { id, rec };
    }
  }
  if (weak) {
    return { ...NO_STEP, kind: "rematch", scenarioId: weak.id,
             grade: weak.rec.bestGrade, score: weak.rec.bestScore };
  }

  // 4. Начатая, но не пройденная кампания — следующий акт. Непочатую сюда не
  //    тащим: «начать кампанию» это выбор истории, а не следующий шаг.
  for (const c of input.campaigns) {
    const p = profile.campaigns[c.id];
    if (!p || !p.updatedAt) continue;
    if (p.stageIndex >= c.stages) continue;
    return { ...NO_STEP, kind: "campaign", campaignId: c.id, stageIndex: p.stageIndex };
  }

  // 5. Первый ещё не открытый блок курса.
  const fresh = COURSE_BLOCKS.find((b) => !profile.course[b.id]?.passed);
  if (fresh) return courseStep(profile, fresh.id, false);

  // 6. Всё намеченное закрыто — остаётся держать форму.
  return daily;
}
