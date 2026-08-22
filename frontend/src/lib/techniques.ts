// techniques.ts — shared negotiation-technique lexicon + text helpers.
// Ported from legacy-node/public/demo.html. Used by the composer's live preview
// (client-side, works against any backend) and by the MockServer engine.

import { LEX } from "./lexicon.generated";
import { spellToDigits } from "./numbers";

// Словарь приёмов ГЕНЕРИРУЕТСЯ из движка: `services/gateway/app/engine/techniques.py`
// — единственный источник. Реэкспорт, а не копия: у клиента и сервера обязан быть
// один вердикт на одну реплику. Правка руками валит tests/test_lex_parity.py.
export { LEX } from "./lexicon.generated";

export const norm = (s: string): string =>
  // Числительные словами → цифры. Единственная точка, через которую проходит
  // любой ход, поэтому паритет клавиатуры и голоса обеспечивается здесь:
  // «триста тысяч» и «300 000» дают один и тот же ход. Зеркало —
  // services/gateway/app/engine/numbers.py, менять синхронно.
  spellToDigits(
    (s || "")
      .toLowerCase()
      .replace(/ё/g, "е")
      .replace(/[^\p{L}\p{N}\s%.,?!\-]/gu, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );

export const has = (t: string, arr: string[]): boolean => arr.some((w) => t.includes(w));
export const cnt = (t: string, arr: string[]): number =>
  arr.reduce((n, w) => n + (t.includes(w) ? 1 : 0), 0);

// Две ветки, порядок важен: сперва число с разделителями групп («300 000»),
// затем сплошной ряд цифр. Вторая добавлена по найденному дефекту — прежняя
// регулярка требовала разделитель, и «300000» читалось как 300.
// Зеркало: services/gateway/app/engine/techniques.py::MONEY_RE.
const MONEY = /(?:^|[^\d])(\d{1,3}(?:[ .,]\d{3})+|\d+(?:[.,]\d+)?)/;
export function extractNum(t: string): number | null {
  const m = t.match(MONEY);
  if (!m) return null;
  const v = parseFloat(m[1].replace(/ /g, "").replace(",", "."));
  return isFinite(v) ? v : null;
}

// Lightweight, client-side preview chips shown live while the player types.
// (Independent of the engine so it works even against the real backend.)
export interface PreviewChip {
  key: string; // maps to the CSS tag color classes
  label: string;
}
export function previewChips(raw: string): PreviewChip[] {
  const x = norm(raw);
  const out: PreviewChip[] = [];
  const add = (cond: boolean, key: string, label: string) => {
    if (cond) out.push({ key, label });
  };
  add(x.includes("?"), "spin", "❓");
  add(has(x, LEX.rationale), "criteria", "↳ arg");
  add(has(x, LEX.objectiveCriteria), "criteria", "📊");
  add(has(x, LEX.batna), "batna", "🛡");
  add(has(x, LEX.acknowledge) || has(x, LEX.interestsProbe), "empathy", "🤝");
  add(has(x, LEX.tradeoff), "tradeoff", "🔄");
  add(has(x, LEX.threat), "threat", "⚠");
  return out.slice(0, 6);
}
