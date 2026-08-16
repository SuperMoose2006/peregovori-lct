// progress.ts — cross-session player profile in localStorage. This is the
// retention spine: it's the reason to play a scenario twice (beat your grade)
// and to come back tomorrow (keep the day streak alive).
//
// Split by design: the SCORING and STREAK math are pure functions (no I/O, so
// they're trivially unit-testable and deterministic under an injected "today");
// only loadProfile/saveProfile touch localStorage, and they're defensive — any
// corrupt/missing/half-shaped blob degrades to sane defaults rather than throwing.

import type { Debrief } from "../types";

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
}

const VERSION = 2;
const KEY = "dialog.progress.v1";

function emptySkills(): Record<SkillId, SkillAgg> {
  const s = {} as Record<SkillId, SkillAgg>;
  for (const id of SKILL_IDS) s[id] = { sum: 0, n: 0 };
  return s;
}

export function emptyProfile(): Profile {
  return { version: VERSION, scenarios: {}, streak: 0, lastStreakDay: "", xp: 0, skills: emptySkills(), achievements: [] };
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

export interface RecordResult {
  profile: Profile; // the updated profile (immutable copy)
  record: ScenarioRecord; // the scenario's record AFTER this run
  prevBest: { grade: Grade | null; score: number } | null; // best BEFORE this run
  improved: boolean; // did this run set a new personal best?
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
  const improved = isBetter(grade, score, prev);

  const record: ScenarioRecord = {
    bestGrade: improved ? grade : prev!.bestGrade,
    bestScore: improved ? score : prev!.bestScore,
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
  };
  return { profile: next, record, prevBest, improved };
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

export function loadProfile(): Profile {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(KEY) : null;
    if (!raw) return emptyProfile();
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
    };
  } catch {
    return emptyProfile();
  }
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
    if (typeof localStorage !== "undefined") localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // storage full / disabled / private mode — progress is best-effort, not load-bearing.
  }
}

export function getRecord(profile: Profile, scenarioId: string): ScenarioRecord | null {
  return profile.scenarios[scenarioId] ?? null;
}

// ============================================================================
// Gamification — all derived from HONEST engine numbers. XP rewards the score
// the deterministic engine already assigned; skills aggregate the same stat
// signals the debrief shows; achievements are skill-truthful predicates. There
// is no path to earn XP/ranks/badges by gaming — only by negotiating better.
// Everything here is pure (no I/O); applyDebrief folds it into a fresh Profile.
// ============================================================================

// ---- XP + ranks --------------------------------------------------------------

// XP for one finished negotiation: the engine's own score, plus a record bonus
// (reward for beating your own best) and a small closing bonus (reaching a deal).
export function xpForDebrief(overall: number, status: Debrief["status"], improved: boolean): number {
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
  { id: "first_a", icon: "🏆", name: { ru: "Высший балл", en: "Top marks" }, desc: { ru: "Грейд A впервые", en: "Earn an A grade" } },
  { id: "streak_3", icon: "🔥", name: { ru: "Три дня подряд", en: "Three-day streak" }, desc: { ru: "Играть 3 дня подряд", en: "Play 3 days in a row" } },
  { id: "all_interests", icon: "🔍", name: { ru: "Все интересы", en: "Full read" }, desc: { ru: "Вскрыть все интересы в игре", en: "Uncover every hidden interest in one game" } },
  { id: "no_threat_deal", icon: "🤝", name: { ru: "Чистая сделка", en: "Clean deal" }, desc: { ru: "Сделка без единой угрозы", en: "Close a deal with zero threats" } },
  { id: "criteria_tradeoff", icon: "⚖️", name: { ru: "Критерий и размен", en: "Criterion & trade" }, desc: { ru: "Критерий и размен в одной игре", en: "Use an objective criterion and a trade-off in one game" } },
  { id: "five_scenarios", icon: "🗺️", name: { ru: "Пять столов", en: "Five tables" }, desc: { ru: "Сыграть 5 разных сценариев", en: "Play 5 different scenarios" } },
];

export function getAchievement(id: string): Achievement | undefined {
  return ACHIEVEMENTS.find((a) => a.id === id);
}

// The full set of achievement ids that SHOULD be unlocked given the profile
// (already folded with this run) and the just-finished debrief. Pure/deterministic.
export function earnedAchievements(profile: Profile, d: Debrief): string[] {
  const out: string[] = [];
  if (d.grade === "A") out.push("first_a");
  if (profile.streak >= 3) out.push("streak_3");
  if (d.interests_total > 0 && d.interests_found >= d.interests_total) out.push("all_interests");
  if (d.status === "agreement" && d.threats === 0) out.push("no_threat_deal");
  if (d.objective_criteria > 0 && d.tradeoffs > 0) out.push("criteria_tradeoff");
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
  dailyGoalMet: boolean; // this was the first finished game today
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
  // Daily goal = first finished game of the local day (before this one is folded in).
  const dailyGoalMet = profile.lastStreakDay !== dayKey(now);

  const base = recordDebrief(profile, scenarioId, d.grade as Grade, d.overall, now);

  const xpGain = xpForDebrief(d.overall, d.status, base.improved);
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

  const nextProfile: Profile = { ...base.profile, xp: xpAfter, skills };
  const earned = earnedAchievements(nextProfile, d);
  const newAchievements = earned.filter((a) => !profile.achievements.includes(a));
  nextProfile.achievements = Array.from(new Set([...profile.achievements, ...earned]));

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
  };
}
