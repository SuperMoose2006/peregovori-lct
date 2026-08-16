// whatif.ts — pure helpers for the "А что если…" replay.
//
// The debrief teaches from the player's OWN worst moment: pick the turning point
// that most damaged the negotiation, then re-run that exact turn with a stronger
// line. turning_points carry only prose ("what happened"), not numeric deltas —
// they come from two independent backends (FastAPI views.turning_points and the
// mock's synthTurningPoints) with different wording — so we detect damage by the
// direction cues both encode ("tension spiked", "trust fell", "against you", …).
import type { TurningPoint } from "../types";

// Bilingual cues that mark a move as harmful. Matched case-insensitively as
// substrings, so both backends' phrasings are covered without coupling to either.
const DAMAGE_CUES = [
  // ru
  "напряжение подскочило", "доверие упало", "против вас", "давление", "угроз", "срыв", "сорва",
  // en
  "tension spiked", "trust fell", "against you", "pressure", "threat", "walked",
];

// How many damage cues a turning point's prose (+ coach note) trips. 0 = the move
// was neutral or beneficial.
export function damageScore(tp: TurningPoint): number {
  const hay = `${tp.what} ${tp.coach ?? ""}`.toLowerCase();
  return DAMAGE_CUES.reduce((n, cue) => (hay.includes(cue) ? n + 1 : n), 0);
}

// The pivotal turn to teach from: the most-damaging turning point. Ties resolve to
// the earliest (turning_points arrive chronological), which is also the required
// fallback when nothing looks damaging — the first turning point.
export function pickPivotalTurn(points: TurningPoint[] | undefined | null): TurningPoint | null {
  if (!points || points.length === 0) return null;
  let best = points[0];
  let bestScore = damageScore(best);
  for (const p of points) {
    const s = damageScore(p);
    if (s > bestScore) {
      best = p;
      bestScore = s;
    }
  }
  return best;
}

// A turning point's `turn` is 1-based (turn 1 = the first player line); moves[] is
// 0-based, so the index into the player's moves is turn - 1. Returns null if the
// mapping falls outside the recorded moves (defensive — never index out of range).
export function pivotalTurnIndex(tp: TurningPoint | null, movesLen: number): number | null {
  if (!tp) return null;
  const idx = tp.turn - 1;
  return idx >= 0 && idx < movesLen ? idx : null;
}
