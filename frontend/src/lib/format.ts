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

// Единица, начинающаяся со знака валюты, отделяется от числа узким неразрывным
// пробелом U+202F: «100₽/шт» сливает рубль с нулём в один глиф. Перед «%», «k»,
// «дн» пробел не ставим — там он не нужен и ломает вёрстку.
const NARROW_NBSP = "\u202f";
const CURRENCY_HEAD = ["₽", "$", "€", "£", "¥"];

// A deal number with its scenario unit suffix (e.g. 85.93 + "₽/шт" → "85,93 ₽/шт"
// in RU, "85.93 ₽/шт" in EN). Зеркало services/gateway/app/engine/format.py —
// сервер печатает `deal_text` теми же правилами (инвариант 8).
export function formatDeal(value: number, unit: string, lang: Lang): string {
  const space = CURRENCY_HEAD.includes(unit.slice(0, 1)) ? NARROW_NBSP : "";
  return formatNumber(value, lang) + space + unit;
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


/**
 * Русская тройка форм: 1 задание · 2 задания · 5 заданий.
 *
 * Нужна ровно потому, что «1 заданий» на экране блока читается как недоделка —
 * а курс, который учит формулировкам, обязан сам говорить грамотно. Для
 * английского вызывающая сторона передаёт две одинаковые формы множественного.
 */
export function plural(n: number, forms: [string, string, string]): string {
  const abs = Math.abs(Math.trunc(n));
  const tens = abs % 100;
  if (tens >= 11 && tens <= 14) return forms[2];
  const ones = abs % 10;
  if (ones === 1) return forms[0];
  if (ones >= 2 && ones <= 4) return forms[1];
  return forms[2];
}
