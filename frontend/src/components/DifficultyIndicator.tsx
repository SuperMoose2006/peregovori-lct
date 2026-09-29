import type { Lang } from "../types";
import { DIFFICULTY_MODES, difficultyLabel, difficultyOrdinal } from "../lib/difficulty";

export function DifficultyIndicator({ value, lang }: { value: number; lang: Lang }) {
  const ordinal = difficultyOrdinal(value);
  const label = `${difficultyLabel(value, lang)} · ${ordinal}/${DIFFICULTY_MODES.length}`;
  return <div className="diff" role="img" aria-label={label} title={label}>
    {DIFFICULTY_MODES.map((mode, index) => <i className={index < ordinal ? "on" : ""} key={mode} aria-hidden="true" />)}
  </div>;
}
