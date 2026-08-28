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

/**
 * Ключевые слова — ОСНОВЫ, и совпадать они обязаны с НАЧАЛА слова.
 *
 * Голое вхождение подстроки засчитывало «справедливо» внутри «несправедливо»:
 * жалоба получала активное слушание, +8 доверия и самую тёплую реакцию, а
 * английское «unfair» не давало ничего — два языка вели себя по-разному на
 * одном предложении. Хвост остаётся открытым намеренно: основы для того и
 * написаны, чтобы ловить словоформы. Зеркало techniques.py::_starts_at_word.
 */
export const startsAtWord = (text: string, word: string): boolean => {
  for (let at = text.indexOf(word); at >= 0; at = text.indexOf(word, at + 1)) {
    const before = at === 0 ? " " : text[at - 1];
    if (!/\p{L}/u.test(before)) return true;
  }
  return false;
};

export const has = (t: string, arr: string[]): boolean => arr.some((w) => startsAtWord(t, w));
export const cnt = (t: string, arr: string[]): number =>
  arr.reduce((n, w) => n + (startsAtWord(t, w) ? 1 : 0), 0);

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

// Денежный суффикс вплотную к числу — сам по себе доказательство цены.
// Зеркало services/gateway/app/engine/techniques.py::_MONEY_SUFFIX_RE.
// `\b` в питоне юникодный, в JS — нет: после кириллической «к» (не \w для JS)
// границы слова не возникает, и «даю 88к» несло цену на сервере и ничего в
// браузере. Явный отрицательный просмотр повторяет питоновский `к\b` в обе
// стороны и не зависит от того, что движок JS считает буквой.
const MONEY_SUFFIX = /^\s*(%|руб|rub|k(?![\p{L}\p{N}_])|к(?![\p{L}\p{N}_])|тыс|тысяч|млн|usd|\$|€|eur|долл|евро)/iu;

/** Число реплики, если это ОФФЕР; иначе null.
 *
 * Цифра сама по себе ничего не значит: «Мне 30 лет, я работаю тут 5 лет»
 * читалось как зарплата 30 там, где шкала 180–240, а «Ага 1.» — как цена
 * 1 ₽/шт. Число становится офертой, только когда реплика несёт намерение
 * назвать цену: приём (якорь, уступка, размен, закрытие), денежный суффикс,
 * слово ценового контекста — или вся реплика и есть число. Слово-единица сразу
 * после числа («лет», «инженеров») перебивает всё.
 *
 * Зеркало services/gateway/app/engine/techniques.py::offer_number — менять
 * синхронно (инвариант 8). */
export function offerNumber(t: string, moves: Iterable<string>): number | null {
  const m = t.match(MONEY);
  if (!m) return null;
  const v = parseFloat(m[1].replace(/ /g, "").replace(",", "."));
  if (!isFinite(v)) return null;

  const tail = t.slice((m.index ?? 0) + m[0].length);
  const trimmed = tail.trim();
  const after = trimmed ? trimmed.split(" ")[0].replace(/^[.,?!-]+|[.,?!-]+$/g, "") : "";
  if (after && LEX.nonPriceUnits.some((u) => after.startsWith(u))) return null;

  const mv = new Set(moves);
  if (["anchor", "concession", "accept", "tradeoff"].some((k) => mv.has(k))) return v;
  if (MONEY_SUFFIX.test(tail)) return v;
  if (has(t, LEX.priceContext)) return v;
  if (t.split(" ").filter(Boolean).length <= 1) return v;
  return null;
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
