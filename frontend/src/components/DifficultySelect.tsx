import type { Lang } from "../types";
import { DIFFICULTY_MODES, difficultyLabel, normalizeDifficulty, type DifficultyMode } from "../lib/difficulty";

/** The custom-deal and facilitator forms share the same three choices. */
export function DifficultySelect({ id, lang, value, onChange }: {
  id?: string;
  lang: Lang;
  value: number;
  onChange: (value: DifficultyMode) => void;
}) {
  return <select id={id} value={normalizeDifficulty(value)}
    onChange={(event) => onChange(normalizeDifficulty(Number(event.target.value)))}>
    {DIFFICULTY_MODES.map(mode => <option key={mode} value={mode}>{difficultyLabel(mode, lang)}</option>)}
  </select>;
}
