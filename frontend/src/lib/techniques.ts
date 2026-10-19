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

/** `has`, но совпадение под отрицанием В СВОЕЙ КЛАУЗЕ не считается: «Если мы
 *  НЕ дадим годовой контракт…» — условие придержано, а не отдано (найдено
 *  после аудита 17.10). Зеркало techniques.py::has_unnegated_in_clause. */
export const hasUnnegatedInClause = (t: string, arr: string[]): boolean => arr.some((w) => {
  for (let at = t.indexOf(w); at >= 0; at = t.indexOf(w, at + 1)) {
    const before = at === 0 ? " " : t[at - 1];
    if (/\p{L}/u.test(before) || !tailOk(t, at, w)) continue;
    const lead = t.slice(0, at);
    let cut = -1;
    for (const ch of CLAUSE_BREAKS) cut = Math.max(cut, lead.lastIndexOf(ch));
    const head = lead.slice(cut + 1).split(/\s+/).filter(Boolean).slice(-NEGATION_WINDOW);
    if (!head.some((x) => NEGATORS.has(x))) return true;
    // «Не против», "don't mind" — отрицание, которое соглашается (ревью ветки).
    const joined = head.join(" ");
    if (LEX.notAgainst.some((p) => joined.includes(p))) return true;
  }
  return false;
});

/** `has(LEX.hostile)`, но в рамке вежливой оговорки грубость — не грубость
 *  («Не хочу показаться некомпетентным, но…»); голое отрицание её не снимает
 *  («Нет это абсурд», ревью ветки). Зеркало techniques.py::_has_hostile. */
export const hasHostile = (t: string): boolean => LEX.hostile.some((w) => {
  for (let at = t.indexOf(w); at >= 0; at = t.indexOf(w, at + 1)) {
    const before = at === 0 ? " " : t[at - 1];
    if (/\p{L}/u.test(before) || !tailOk(t, at, w)) continue;
    const lead = t.slice(0, at);
    let cut = -1;
    for (const ch of CLAUSE_BREAKS) cut = Math.max(cut, lead.lastIndexOf(ch));
    const head = lead.slice(cut + 1).split(/\s+/).filter(Boolean).slice(-NEGATION_WINDOW).join(" ");
    if (!LEX.hostileDisclaimers.some((d) => head.includes(d))) return true;
  }
  return false;
});

/** `has(LEX.tradeoff)`, но условие под отрицанием — не размен: «Если мы НЕ
 *  договоримся, уйдём» — давление (найдено после аудита 17.10). Зеркало
 *  techniques.py::_has_tradeoff. */
export const hasTradeoff = (t: string): boolean => LEX.tradeoff.some((w) => {
  for (let at = t.indexOf(w); at >= 0; at = t.indexOf(w, at + 1)) {
    const before = at === 0 ? " " : t[at - 1];
    if (/\p{L}/u.test(before) || !tailOk(t, at, w)) continue;
    if (LEX.tradeoffVoidIfNot.includes(w)) {
      const tail = t.slice(at + w.length);
      const first = (tail.split(/\s+/).filter(Boolean)[0] ?? "").replace(/^[.,?!-]+|[.,?!-]+$/g, "");
      if (tail.startsWith(" ") && first && NEGATORS.has(first)) continue;
    }
    return true;
  }
  return false;
});
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
const CLOSE_HEDGES = new Set(LEX.closeHedges);
const CLOSE_UNDO = new Set(LEX.closeUndo);
const CONTRAST = new Set(LEX.contrast);
const OBJECT_THEN_CONTRAST = /^\s+([^.,?!]+),\s*([^\s.,?!]+)/;

/** Отменяет ли идиому то, что идёт СРАЗУ за ней: «договорились БЫ», «по рукам
 *  НЕ ударим», «принимаю К СВЕДЕНИЮ», «устраивает качество, НО…» (дополнение
 *  без числа, затем противительный союз). Зеркало techniques.py::_undone_after. */
function undoneAfter(t: string, at: number): boolean {
  const space = t.indexOf(" ", at);
  let wordEnd = space < 0 ? t.length : space;
  for (const w of LEX.accept) {
    if (t.startsWith(w, at)) { wordEnd = at + w.length; break; }
  }
  const tail = t.slice(wordEnd);
  const words = tail.split(/\s+/).filter(Boolean);
  const first = words.length ? words[0].replace(/^[.,?!-]+|[.,?!-]+$/g, "") : "";
  if (!",.?!".includes(tail.slice(0, 1) || "x") && (NEGATORS.has(first) || CLOSE_UNDO.has(first))) {
    // «Договорились НЕ ЗАТЯГИВАТЬ» — о чём договорились, а не отказ.
    const next = words.length > 1 ? words[1].replace(/^[.,?!-]+|[.,?!-]+$/g, "") : "";
    if (!(NEGATORS.has(first) && isInfinitive(next))) return true;
  }
  if (LEX.closeNotDeal.some((x) => tail.trimStart().startsWith(x))) return true;
  const m = tail.match(OBJECT_THEN_CONTRAST);
  if (!(m && !/\d/.test(m[1]) && CONTRAST.has(m[2]))) return false;
  // Дополнение — сама сделка («ваше предложение, но…»): сделка с условием.
  const obj = m[1].split(/\s+/).filter(Boolean);
  return !(obj.length <= 3 && LEX.closeDealObjects.some((d) => obj[obj.length - 1].startsWith(d)));
}

/** Инфинитив после «не»: «не затягивать», "not to delay". Зеркало techniques.py::_infinitive. */
function isInfinitive(w: string): boolean {
  return w === "to" || /(ть|ться|ти|чь)$/.test(w);
}

export function isClose(t: string): boolean {
  return LEX.accept.some((w) => {
    for (let at = t.indexOf(w); at >= 0; at = t.indexOf(w, at + 1)) {
      const before = at === 0 ? " " : t[at - 1];
      if (/\p{L}/u.test(before) || !tailOk(t, at, w)) continue;
      const head = t.slice(0, at);
      let cut = -1;
      for (const ch of CLAUSE_BREAKS) cut = Math.max(cut, head.lastIndexOf(ch));
      const clause = head.slice(cut + 1).split(/\s+/).filter(Boolean);
      if (clause.some((x) => SUBORDINATORS.has(x))) continue;
      // «не договорились», «почти договорились». Зеркало techniques.py::_closes_here.
      if (clause.slice(-NEGATION_WINDOW).some((x) => NEGATORS.has(x) || CLOSE_HEDGES.has(x))) continue;
      if (!undoneAfter(t, at)) return true;
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
// Разбор числа СТРОГИЙ, как float() на сервере: «1.500.000» там не число, а
// parseFloat читал из него 1.5 — и одна реплика давала оффер офлайн и пустоту
// онлайн (инвариант 8; найдено ревью ветки аудита 17.10).
const strictNumber = (raw: string): number => Number(raw.replace(/ /g, "").replace(",", "."));
export function extractNum(t: string): number | null {
  const m = t.match(MONEY);
  if (!m) return null;
  const v = strictNumber(m[1]);
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
const MONEY_EACH = new RegExp(MONEY.source, "g");

/** Число на этой позиции — счёт чего-то («7 лет», «1000 штук»), а не цена. */
function countedAt(t: string, end: number): boolean {
  const trimmed = t.slice(end).trim();
  const after = trimmed ? trimmed.split(" ")[0].replace(/^[.,?!-]+|[.,?!-]+$/g, "") : "";
  return !!after && LEX.nonPriceUnits.some((u) => after.startsWith(u));
}

/** Первое число реплики, которое НЕ счёт. Счёт впереди цены раньше гасил цену
 *  целиком: «У меня 7 лет опыта, договорились на 230 тысяч» закрывало сделку на
 *  цене оппонента (найдено после аудита 17.10). Зеркало
 *  techniques.py::_first_price_match. */
function firstPriceMatch(t: string): RegExpMatchArray | null {
  for (const m of t.matchAll(MONEY_EACH)) {
    if (!countedAt(t, (m.index ?? 0) + m[0].length)) return m;
  }
  return null;
}

/** `has(LEX.priceContext)`, кроме «стоит ЗА»: «что стоит за этой цифрой» —
 *  вопрос об интересе (урок foundations/1). Зеркало techniques.py::_price_context. */
function priceContext(t: string): boolean {
  return LEX.priceContext.some((w) => {
    for (let at = t.indexOf(w); at >= 0; at = t.indexOf(w, at + 1)) {
      const before = at === 0 ? " " : t[at - 1];
      if (/\p{L}/u.test(before) || !tailOk(t, at, w)) continue;
      if (w === "стоит" && t.slice(at + w.length).startsWith(" за ")) continue;
      return true;
    }
    return false;
  });
}

/** Стоит ли формула `offerIntentNear` вплотную перед числом на позиции `at`
 *  (между ними — разве что «на / за / по»). «Давайте посмотрим, на чём
 *  основаны ваши 1200» — не оферта (найдено после аудита 17.10). Зеркало
 *  techniques.py::_intent_right_before. */
export function intentRightBefore(t: string, at: number): boolean {
  const head = t.slice(0, at).trimEnd().split(/\s+/).filter(Boolean);
  const tails = [head.join(" ")];
  // «готов на» — формула сама с предлогом.
  if (head.length && ["на", "за", "по"].includes(head[head.length - 1])) tails.push(head.slice(0, -1).join(" "));
  return tails.some((tail) => LEX.offerIntentNear.some((w) => tail === w || tail.endsWith(" " + w)));
}

/** Позиция первого числа-не-счёта (см. firstPriceMatch) или -1. */
export function firstPriceAt(t: string): number {
  const m = firstPriceMatch(t);
  return m ? (m.index ?? 0) + (/^\d/.test(m[0]) ? 0 : 1) : -1;
}

export function offerNumber(t: string, moves: Iterable<string>): number | null {
  const m = firstPriceMatch(t);
  if (!m) return null;
  const v = strictNumber(m[1]);
  if (!isFinite(v)) return null;

  const tail = t.slice((m.index ?? 0) + m[0].length);

  const mv = new Set(moves);
  if (["anchor", "concession", "accept", "tradeoff"].some((k) => mv.has(k))) return v;
  if (MONEY_SUFFIX.test(tail)) return v;
  if (priceContext(t)) return v;
  // Формула предложения цены — такое же доказательство, как слово «цена»:
  // «how about 120», «i can do 480», «а если 86» не несут ни ценового
  // контекста, ни приёма, но число в них — цена. Список читается ТОЛЬКО здесь
  // и ни одного тега приёма не даёт. Зеркало techniques.py::offer_number.
  if (has(t, LEX.offerIntent)) return v;
  if (intentRightBefore(t, (m.index ?? 0) + (/^\d/.test(m[0]) ? 0 : 1))) return v;
  if (t.split(" ").filter(Boolean).length <= 1) return v;
  return null;
}

/** Стоит ли ПЕРВОЕ число реплики в вопросительном предложении. Вопрос
 * отменяет оффер, но вопрос должен быть про ЭТО число: «Предлагаю 99,7%
 * аптайма. Что для вас важно?» раньше не клала цену на стол (аудит 17.10, F05).
 * Граница предложения — «.!?» и пробел; без lookbehind в регулярке: старый
 * Safari её не разбирает. Зеркало techniques.py::_number_in_question. */
export function numberInQuestion(t: string): boolean {
  // То же число, что берёт offerNumber: счёт впереди («7 лет») — не оно.
  const m = firstPriceMatch(t);
  if (!m) return t.includes("?");
  const at = (m.index ?? 0) + (/^\d/.test(m[0]) ? 0 : 1);
  let start = 0;
  for (let i = 0; i + 1 < t.length; i++) {
    if (".!?".includes(t[i]) && /\s/.test(t[i + 1])) {
      if (at <= i) return t.slice(start, i + 1).includes("?");
      start = i + 1;
    }
  }
  return t.slice(start).includes("?");
}

/** Одно число реплики вместе с тем, КАК оно записано: какое из чисел цена,
 * решает движок по единице стола (mock/engine.ts::pickOffer). «Предоплата 50%
 * в обмен на цену 90 рублей» на поставщике читалась как оффер на 50.
 * Зеркало techniques.py::NumberMention — менять синхронно (инвариант 8). */
export interface NumberMention {
  value: number;
  /** "pct" — «50%»; "money" — валюта или масштаб; "plain" — голое число. */
  kind: "pct" | "money" | "plain";
  /** Граница диапазона «88-92»: ориентир, а не оффер. */
  ranged: boolean;
  /** Число в уступительной клаузе («хотя я рассчитывал на 90»): сказанное о
   *  прошлом, а не новая оферта. */
  aside: boolean;
}

// Суффикс вплотную к числу съедается вместе с ним, как в MONEY_RE на сервере:
// иначе обход всех чисел начинал бы следующий поиск с другой позиции.
const MONEY_ALL = new RegExp(MONEY.source + "(?:\\s*(?:%|руб|k|к|тыс|тысяч|млн|usd|\\$|€|eur))?", "gi");
const PCT_WORDS = ["процент", "percent"];
// Между двумя числами только пробел и, может быть, дефис — диапазон «88-92».
const RANGE_GAP = /^\s*-?\s*$/;

/** Все числа нормализованной реплики по порядку, кроме счёта («5 лет»).
 * Зеркало techniques.py::number_mentions. */
export function numberMentions(t: string): NumberMention[] {
  const found: { start: number; end: number; value: number; kind: NumberMention["kind"]; counted: boolean }[] = [];
  for (const m of t.matchAll(MONEY_ALL)) {
    const start = (m.index ?? 0) + (/^\d/.test(m[0]) ? 0 : 1);
    const end = start + m[1].length;
    const value = strictNumber(m[1]);
    if (!isFinite(value)) continue;
    const tail = t.slice(end);
    const trimmed = tail.trim();
    const after = trimmed ? trimmed.split(" ")[0].replace(/^[.,?!-]+|[.,?!-]+$/g, "") : "";
    const counted = !!after && LEX.nonPriceUnits.some((u) => after.startsWith(u));
    const kind: NumberMention["kind"] =
      tail.trimStart().startsWith("%") || PCT_WORDS.some((w) => after.startsWith(w)) ? "pct"
        : MONEY_SUFFIX.test(tail) ? "money" : "plain";
    found.push({ start, end, value, kind, counted });
  }
  const out: NumberMention[] = [];
  found.forEach((f, i) => {
    if (f.counted) return;
    const ranged =
      (i > 0 && RANGE_GAP.test(t.slice(found[i - 1].end, f.start))) ||
      (i + 1 < found.length && RANGE_GAP.test(t.slice(f.end, found[i + 1].start)));
    const head = t.slice(0, f.start);
    let cut = -1;
    for (const ch of CLAUSE_BREAKS) cut = Math.max(cut, head.lastIndexOf(ch));
    const clause = head.slice(cut + 1).split(/\s+/).filter(Boolean);
    const aside = clause.some((w) => LEX.concessive.some((c) => w.startsWith(c)));
    out.push({ value: f.value, kind: f.kind, ranged, aside });
  });
  return out;
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
  add(x.includes("?"), "spin", "question");
  add(has(x, LEX.rationale), "criteria", "↳ arg");
  add(has(x, LEX.objectiveCriteria), "criteria", "chart");
  // Якорь — единственный приём, который стоит ПОКАЗАТЬ ещё до отправки: он
  // ценен ровно первым ходом (движок считает по нему право первого слова), а
  // узнать об этом постфактум значит узнать поздно. Класс `.tag.anchor` в
  // styles.css уже есть — чип не заявляет ничего нового, только то, что
  // словарь и так засчитал.
  add(has(x, LEX.anchor), "anchor", "anchor");
  add(has(x, LEX.batna), "batna", "shield");
  add(has(x, LEX.acknowledge) || has(x, LEX.interestsProbe), "empathy", "handshake");
  add(hasTradeoff(x), "tradeoff", "refresh");
  add(has(x, LEX.threat), "threat", "warning");
  return out.slice(0, 6);
}
