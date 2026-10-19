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

/** То же, плюс «по описанию» первым пунктом — для «Своей сделки», где панель
 *  необязательна: пустое значение оставляет сложность генератору. Без него
 *  форма показывала выбор, которого никто не делал, и он перебивал описание
 *  (найдено после аудита 17.10). */
export function AutoDifficultySelect({ lang, value, autoLabel, onChange }: {
  lang: Lang;
  value: number | null;
  autoLabel: string;
  onChange: (value: DifficultyMode | null) => void;
}) {
  return <select name="context-difficulty" value={value === null ? "" : normalizeDifficulty(value)}
    onChange={(event) => onChange(event.target.value === "" ? null : normalizeDifficulty(Number(event.target.value)))}>
    <option value="">{autoLabel}</option>
    {DIFFICULTY_MODES.map(mode => <option key={mode} value={mode}>{difficultyLabel(mode, lang)}</option>)}
  </select>;
}
