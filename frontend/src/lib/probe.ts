// probe.ts — the "read her face" question.
//
// This layer is fully REAL, not mocked, and that is the whole reason it is the
// one we ship first: the engine already decides a `reaction` every turn, so the
// right answer is deterministic, reproducible and free. No AI decides it, no
// camera is needed, and it works offline — which is exactly what no
// webcam-based emotion reader can claim.
//
// Everything here is a pure function of (reaction, turn), so a replayed session
// asks the same questions in the same order.

/** The engine's reaction vocabulary, ordered from coldest to warmest. Ordering
 *  is what makes the distractors hard: neighbours on this scale are the
 *  plausible confusions, and picking far-apart options would make the question
 *  trivial. Mirrors engine.py / mock/engine.ts. */
export const REACTION_SCALE = [
  "walked_out", "offended", "hardened", "pressured", "not_yet",
  "neutral", "collaborated", "persuaded", "opened_up", "warmed",
] as const;

export type Reaction = (typeof REACTION_SCALE)[number];

export interface Probe {
  turn: number;
  /** Index into `options` of the true reaction. */
  answer: number;
  options: Reaction[];
}

export function isReaction(r: string): r is Reaction {
  return (REACTION_SCALE as readonly string[]).includes(r);
}

/** Ask every `EVERY`-th turn, never on the very first move (there is nothing to
 *  read yet) and never on the closing one (the outcome already answers it). */
export const EVERY = 3;

export function shouldProbe(turn: number, closed: boolean): boolean {
  return !closed && turn >= 2 && turn % EVERY === 0;
}

/** Three distractors drawn from the nearest neighbours on the warmth scale,
 *  then ordered deterministically by the turn number so a replay matches. */
export function buildProbe(reaction: string, turn: number): Probe | null {
  if (!isReaction(reaction)) return null;
  const i = REACTION_SCALE.indexOf(reaction);
  const near: Reaction[] = [];
  for (let d = 1; near.length < 3 && d < REACTION_SCALE.length; d++) {
    for (const j of [i - d, i + d]) {
      if (j >= 0 && j < REACTION_SCALE.length && near.length < 3) near.push(REACTION_SCALE[j]);
    }
  }
  const pool = [reaction as Reaction, ...near];
  // Rotate by the turn so the correct answer is not always in the same slot,
  // while staying a pure function of the turn (no randomness — replays match).
  const shift = turn % pool.length;
  const options = [...pool.slice(shift), ...pool.slice(0, shift)];
  return { turn, answer: options.indexOf(reaction as Reaction), options };
}
