import type { Lang } from "../types";

/** Negotiation modes retain their calibrated engine IDs. Course exercises use
 *  a separate 1..3 scale and must not pass through this compatibility mapping. */
export const DIFFICULTY_MODES = [1, 3, 5] as const;
export type DifficultyMode = typeof DIFFICULTY_MODES[number];

/** Read legacy values without changing the stored record. Equidistant values
 *  go to the middle mode: 2 → 3 and 4 → 3. Invalid data also defaults to 3. */
export function normalizeDifficulty(value: unknown): DifficultyMode {
  if (typeof value !== "number" || !Number.isFinite(value)) return 3;
  return DIFFICULTY_MODES.reduce((best, candidate) => {
    const distance = Math.abs(candidate - value), bestDistance = Math.abs(best - value);
    return distance < bestDistance || (distance === bestDistance && Math.abs(candidate - 3) < Math.abs(best - 3))
      ? candidate : best;
  });
}

/** Display position only; never send this ordinal to the engine. */
export function difficultyOrdinal(value: unknown): number {
  return DIFFICULTY_MODES.indexOf(normalizeDifficulty(value)) + 1;
}

const LABELS: Record<Lang, Record<DifficultyMode, string>> = {
  ru: { 1: "Больше уступок", 3: "Умеренные уступки", 5: "Меньше уступок" },
  en: { 1: "More concessions", 3: "Moderate concessions", 5: "Fewer concessions" },
};

export function difficultyLabel(value: unknown, lang: Lang): string {
  return LABELS[lang][normalizeDifficulty(value)];
}
