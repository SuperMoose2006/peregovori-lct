// techniques.ts — shared negotiation-technique lexicon + text helpers.
// Ported from legacy-node/public/demo.html. Used by the composer's live preview
// (client-side, works against any backend) and by the MockServer engine.

import { LEX } from "./lexicon.generated";
import { spellToDigits } from "./numbers";

// Словарь приёмов ГЕНЕРИРУЕТСЯ из движка: `services/gateway/app/engine/techniques.py`
// — единственный источник. Реэкспорт, а не копия: у клиента и сервера обязан быть
// один вердикт на одну реплику. Правка руками валит tests/test_lex_parity.py.
export { LEX } from "./lexicon.generated";

// Знак валюты → слово. Фильтр ниже выбрасывает всё, что не буква и не цифра,
// поэтому «$» умирал раньше, чем успевал доказать, что число рядом это цена:
// «I can do $500» становилось «i can do 500» и офертой не считалось. Русский
// той же фразой работал — «руб» это СЛОВО, оно нормализацию переживает.
// Замерено на чужом корпусе: 5991 реплика из 9124 пропущенных цен несла «$».
// Зеркало services/gateway/app/engine/techniques.py::_CURRENCY_WORDS.
const CURRENCY: [RegExp, string][] = [
  [/\$/g, " usd "],
  [/\u20bd/g, " руб "],
  [/\u20ac/g, " eur "],
];

export const norm = (s: string): string =>
  // Числительные словами → цифры. Единственная точка, через которую проходит
  // любой ход, поэтому паритет клавиатуры и голоса обеспечивается здесь:
  // «триста тысяч» и «300 000» дают один и тот же ход. Зеркало —
  // services/gateway/app/engine/numbers.py, менять синхронно.
  spellToDigits(
    CURRENCY.reduce(
      (acc, [re, word]) => acc.replace(re, word),
      (s || "").toLowerCase().replace(/ё/g, "е"),
    )
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
 *
 * Закрывается только начало — и, поимённо, хвост у записей `LEX.closedTail`,
 * где открытый хвост ловит ЧУЖОЕ слово, а удлинить основу нельзя: «ты прав»
 * совпало бы с «ты правда так думаешь?», а «правда» длиннее «прав», не короче.
 */
const CLOSED_TAIL = new Set(LEX.closedTail);

const tailOk = (text: string, at: number, word: string): boolean => {
  if (!CLOSED_TAIL.has(word)) return true;
  const end = at + word.length;
  return end >= text.length || !/\p{L}/u.test(text[end]);
};

export const startsAtWord = (text: string, word: string): boolean => {
  for (let at = text.indexOf(word); at >= 0; at = text.indexOf(word, at + 1)) {
    const before = at === 0 ? " " : text[at - 1];
    if (!/\p{L}/u.test(before) && tailOk(text, at, word)) return true;
  }
  return false;
};

export const has = (t: string, arr: string[]): boolean => arr.some((w) => startsAtWord(t, w));
export const cnt = (t: string, arr: string[]): number =>
  arr.reduce((n, w) => n + (startsAtWord(t, w) ? 1 : 0), 0);

// Сколько слов перед триггером считается «прямо перед ним». Зеркало
// techniques.py::_NEGATION_WINDOW — три: «no problem» кладёт отрицание за одно
// слово, «not a problem» за два, «isn't a problem» после нормализации за три.
const NEGATION_WINDOW = 3;
const NEGATORS = new Set(LEX.negators);

/** `has`, но совпадение ПОД ОТРИЦАНИЕМ не считается.
 *
 * «No problem» — вежливая отговорка, а не стадия SPIN «Проблема»: на чужом
 * корпусе слово `problem` совпало 311 раз, и 149 из них были отрицанием.
 * Словарём это не чинится — отрицание лежит ПЕРЕД словом. Тем же сторожится
 * короткое закрытие: «no deal» — отказ.
 *
 * Зеркало services/gateway/app/engine/techniques.py::_has_unnegated —
 * менять синхронно (инвариант 8). */
export const hasUnnegated = (t: string, arr: string[]): boolean =>
  arr.some((w) => {
    for (let at = t.indexOf(w); at >= 0; at = t.indexOf(w, at + 1)) {
      const before = at === 0 ? " " : t[at - 1];
      if (/\p{L}/u.test(before) || !tailOk(t, at, w)) continue;
      const head = t.slice(0, at).split(/\s+/).filter(Boolean);
      if (!head.slice(-NEGATION_WINDOW).some((x) => NEGATORS.has(x))) return true;
    }
    return false;
  });

// Знаки, которыми кончается КЛАУЗА. Зеркало techniques.py::_CLAUSE_BREAKS —
// дефис не входит намеренно: в «мы-то договорились» он внутри слова.
const CLAUSE_BREAKS = ".,?!";
const SUBORDINATORS = new Set(LEX.subordinators);

/** Идиома закрытия — это АКТ закрытия, а не рассказ о нём.
 *
 * `accept` ведёт стол к сделке НА ЦЕНЕ ОППОНЕНТА, поэтому ложное закрытие
 * стоит игроку партии. Перенос чужой разметки переводом (docs/validation.md
 * § 7.5) намерил шесть таких на 53 русских срабатывания, и все шесть одной
 * формы: идиома внутри ПРИДАТОЧНОГО предложения — «жду, КОГДА мы ударим по
 * рукам», «рад, ЧТО мы договорились». Союз ищется по всей клаузе, а не только
 * в её начале: русский ставит перед «что» запятую всегда, английский не пишет
 * её вовсе («let me know when we have a deal» — одна клауза, союз четвёртым
 * словом). Условие «идиома не открывает клаузу» обязательно: без него правило
 * съело бы «That works for us», где «that» — указательное местоимение. Вторым признаком снимается
 * отказ («мы так и не договорились»), и отрицание не переходит границу
 * клаузы — иначе «Не вопрос, договорились» тоже стало бы отказом.
 *
 * Зеркало services/gateway/app/engine/techniques.py::_closes_here — менять
 * синхронно (инвариант 8). */
export function isClose(t: string): boolean {
  return LEX.accept.some((w) => {
    for (let at = t.indexOf(w); at >= 0; at = t.indexOf(w, at + 1)) {
      const before = at === 0 ? " " : t[at - 1];
      if (/\p{L}/u.test(before) || !tailOk(t, at, w)) continue;
      const head = t.slice(0, at);
      let cut = -1;
      for (const ch of CLAUSE_BREAKS) cut = Math.max(cut, head.lastIndexOf(ch));
      const clause = head.slice(cut + 1).split(/\s+/).filter(Boolean);
      if (!clause.length) return true;
      if (clause.some((x) => SUBORDINATORS.has(x))) continue;
      if (!clause.slice(-NEGATION_WINDOW).some((x) => NEGATORS.has(x))) return true;
    }
    return false;
  });
}

// Длина реплики, при которой формула закрытия читается как закрытие. Зеркало
// techniques.py::_ACCEPT_SHORT_MAX_WORDS.
const ACCEPT_SHORT_MAX_WORDS = 4;

/** Вся реплика — формула закрытия: «Deal.», «Сделка!», «Agreed».
 *
 * Английское «deal» — обычное существительное (2404 совпадения на чужом
 * корпусе: «good deal», «the deal is», «dealer»), а `accept` у нас высшего
 * приоритета и ведёт стол к закрытию. Поэтому три условия: короткая реплика,
 * не вопрос («Deal?» спрашивает), не под отрицанием («no deal» — отказ).
 *
 * Зеркало techniques.py::_is_short_close — менять синхронно. */
export function isShortClose(t: string): boolean {
  if (t.includes("?")) return false;
  if (t.split(" ").filter(Boolean).length > ACCEPT_SHORT_MAX_WORDS) return false;
  return hasUnnegated(t, LEX.acceptShort);
}

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
  // Формула предложения цены — такое же доказательство, как слово «цена»:
  // «how about 120», «i can do 480», «а если 86» не несут ни ценового
  // контекста, ни приёма, но число в них — цена. Список читается ТОЛЬКО здесь
  // и ни одного тега приёма не даёт. Зеркало techniques.py::offer_number.
  if (has(t, LEX.offerIntent)) return v;
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
  // Якорь — единственный приём, который стоит ПОКАЗАТЬ ещё до отправки: он
  // ценен ровно первым ходом (движок считает по нему право первого слова), а
  // узнать об этом постфактум значит узнать поздно. Класс `.tag.anchor` в
  // styles.css уже есть — чип не заявляет ничего нового, только то, что
  // словарь и так засчитал.
  add(has(x, LEX.anchor), "anchor", "⚓");
  add(has(x, LEX.batna), "batna", "🛡");
  add(has(x, LEX.acknowledge) || has(x, LEX.interestsProbe), "empathy", "🤝");
  add(has(x, LEX.tradeoff), "tradeoff", "🔄");
  add(has(x, LEX.threat), "threat", "⚠");
  return out.slice(0, 6);
}
