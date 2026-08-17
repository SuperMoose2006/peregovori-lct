// format.ts — locale-aware presentation helpers (pure, unit-tested).
//
// Deal numbers must read natively per locale: RU wants a comma decimal and a
// space thousands separator ("1 060", "85,93"), EN a dot ("1,060", "85.93").
// The scenario `unit` string already carries its own spacing (" ₽", "k", "%",
// " дн"), so we only localize the NUMBER and append the unit verbatim — never
// inventing spacing the unit didn't ask for.
import type { Lang } from "../types";

const LOCALE: Record<Lang, string> = { ru: "ru-RU", en: "en-US" };

// A bare number, localized. Up to 2 fraction digits, trailing zeros trimmed by
// Intl, locale grouping + decimal separator.
export function formatNumber(value: number, lang: Lang): string {
  return new Intl.NumberFormat(LOCALE[lang], { maximumFractionDigits: 2 }).format(value);
}

// A deal number with its scenario unit suffix (e.g. 85.93 + " ₽" → "85,93 ₽" in
// RU, "85.93 ₽" in EN). The unit owns its own leading space, so we don't add one.
export function formatDeal(value: number, unit: string, lang: Lang): string {
  return formatNumber(value, lang) + unit;
}

// ---------------------------------------------------------------------------
// Teaching placeholder rotation. For a new player's first few turns the composer
// placeholder nudges a concrete technique ("ask WHY", "cite market data", "offer
// a trade") instead of the generic "your line…". After that it settles to `base`
// so it stops nagging an experienced player. Pure: turn index in, string out.
// ---------------------------------------------------------------------------
export function teachingPlaceholder(turn: number, base: string, nudges: string[]): string {
  if (turn < 0 || nudges.length === 0) return base;
  return turn < nudges.length ? nudges[turn] : base;
}
