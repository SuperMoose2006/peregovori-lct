// progress.ts — cross-session player profile in localStorage. This is the
// retention spine: it's the reason to play a scenario twice (beat your grade)
// and to come back tomorrow (keep the day streak alive).
//
// Split by design: the SCORING and STREAK math are pure functions (no I/O, so
// they're trivially unit-testable and deterministic under an injected "today");
// only loadProfile/saveProfile touch localStorage, and they're defensive — any
// corrupt/missing/half-shaped blob degrades to sane defaults rather than throwing.

export type Grade = "A" | "B" | "C" | "D" | "F";

// Best result the player has ever reached on one scenario.
export interface ScenarioRecord {
  bestGrade: Grade | null; // null = never finished
  bestScore: number; // 0..100 (overall of the best-graded run)
  attempts: number;
  lastPlayed: string; // ISO date (full timestamp)
}

export interface Profile {
  version: number;
  scenarios: Record<string, ScenarioRecord>;
  streak: number; // consecutive days with >=1 finished negotiation
  lastStreakDay: string; // YYYY-MM-DD of the last finished-negotiation day ("" = none)
}

const VERSION = 1;
const KEY = "dialog.progress.v1";

export function emptyProfile(): Profile {
  return { version: VERSION, scenarios: {}, streak: 0, lastStreakDay: "" };
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
    };
  } catch {
    return emptyProfile();
  }
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
