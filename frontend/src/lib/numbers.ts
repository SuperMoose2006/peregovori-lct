// numbers.ts — числительные словами → цифры. Зеркало services/gateway/app/engine/numbers.py.
//
// ЗАЧЕМ ЗЕРКАЛО, А НЕ ВЫЗОВ СЕРВЕРА. Офлайн-ядро (`mock/engine.ts`) обязано
// считать ход ровно так же, как движок на сервере: это и есть обещание, что
// без сети продукт полностью играбелен, а не «работает похоже». Значит любая
// нормализация ввода живёт в двух местах и меняется синхронно. Расхождение
// ловит тест `test/parity.test.ts`.
//
// ЗАЧЕМ ЭТО ВООБЩЕ. Движок распознаёт цену по цифрам. Люди печатают «300 000»,
// но ГОВОРЯТ «триста тысяч» — и тот же ход внезапно переставал быть оффером.
// Полный разбор дефекта — в шапке питоновского близнеца.

const RU_UNITS: Record<string, number> = {
  ноль: 0, один: 1, одна: 1, одну: 1, два: 2, две: 2, три: 3, четыре: 4,
  пять: 5, шесть: 6, семь: 7, восемь: 8, девять: 9, десять: 10,
  одиннадцать: 11, двенадцать: 12, тринадцать: 13, четырнадцать: 14,
  пятнадцать: 15, шестнадцать: 16, семнадцать: 17, восемнадцать: 18,
  девятнадцать: 19,
};
const RU_TENS: Record<string, number> = {
  двадцать: 20, тридцать: 30, сорок: 40, пятьдесят: 50, шестьдесят: 60,
  семьдесят: 70, восемьдесят: 80, девяносто: 90,
};
const RU_HUNDREDS: Record<string, number> = {
  сто: 100, двести: 200, триста: 300, четыреста: 400, пятьсот: 500,
  шестьсот: 600, семьсот: 700, восемьсот: 800, девятьсот: 900,
};
const RU_SCALES: Record<string, number> = {
  тысяча: 1000, тысячи: 1000, тысяч: 1000, тысячу: 1000,
  миллион: 1000000, миллиона: 1000000, миллионов: 1000000,
};
const RU_HALVES: Record<string, number> = { полтора: 1.5, полторы: 1.5 };

const EN_UNITS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
  fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19,
};
const EN_TENS: Record<string, number> = {
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70,
  eighty: 80, ninety: 90,
};
const EN_SCALES: Record<string, number> = { hundred: 100, thousand: 1000, million: 1000000 };

const UNITS = { ...RU_UNITS, ...EN_UNITS };
const TENS = { ...RU_TENS, ...EN_TENS };
const HUNDREDS = { ...RU_HUNDREDS };
const SCALES = { ...RU_SCALES, ...EN_SCALES };
const HALVES = { ...RU_HALVES };

/** Связки внутри числительного, которые не должны его разрывать. */
const GLUE = new Set(["и", "and"]);

export const NUMBER_WORDS: ReadonlySet<string> = new Set([
  ...Object.keys(UNITS), ...Object.keys(TENS), ...Object.keys(HUNDREDS),
  ...Object.keys(SCALES), ...Object.keys(HALVES),
]);

const TRAIL = /[.,!?%-]+$/;

/** Пробел-разделитель разрядов внутри числа. Ровно три цифры справа, иначе
 *  «по 86 88 за штуку» слиплось бы в «8688». */
const GROUP_SEP = /(?<=\d)[ \u00a0](?=\d{3}(?!\d))/g;

function fold(tokens: string[]): number | null {
  let total = 0;
  let current = 0;
  let seen = false;
  for (const token of tokens) {
    if (GLUE.has(token)) continue;
    if (token in HALVES) { current += HALVES[token]; seen = true; }
    else if (token in UNITS) { current += UNITS[token]; seen = true; }
    else if (token in TENS) { current += TENS[token]; seen = true; }
    else if (token in HUNDREDS) { current += HUNDREDS[token]; seen = true; }
    else if (token in SCALES) {
      const scale = SCALES[token];
      // "two hundred" — сотня умножает набранное, а не закрывает группу.
      if (scale === 100) current = (current || 1) * 100;
      else { total += (current || 1) * scale; current = 0; }
      seen = true;
    } else return null;
  }
  return seen ? total + current : null;
}

const fmt = (v: number): string => (Number.isInteger(v) ? String(v) : String(v));

/**
 * Заменить числительные словами на цифры. Остальное не трогать.
 *
 * Правило безопасности: одиночное числительное БЕЗ множителя не заменяется —
 * «три условия» не должно стать «3 условия» и тем самым внезапно превратиться
 * в оффер. Цена всегда произносится с единицей.
 */
/** Чистое число без хвостов — им может оказаться предыдущий выведенный токен. */
const DIGITS = /^\d+(?:[.,]\d+)?$/;

export function spellToDigits(text: string): string {
  if (!text) return text;
  // Разделители групп внутри числа схлопываются: «300 000» → «300000». Иначе
  // одна и та же цена даёт РАЗНОЕ число слов, а от него зависит балл
  // аргументации — паритет ломается на ровном месте.
  const collapsed = text.replace(GROUP_SEP, "");
  const tokens = collapsed.split(" ");
  // Пунктуация примыкает к слову («тысячи.»), и без её отделения множитель
  // не находится, а число остаётся словами.
  const bare = tokens.map((t) => t.replace(TRAIL, ""));
  const tails = tokens.map((t, i) => t.slice(bare[i].length));

  const out: string[] = [];
  let i = 0;
  while (i < tokens.length) {
    if (!NUMBER_WORDS.has(bare[i])) {
      out.push(tokens[i]);
      i += 1;
      continue;
    }
    let j = i;
    const group: string[] = [];
    while (j < tokens.length && (NUMBER_WORDS.has(bare[j]) || (GLUE.has(bare[j]) && group.length))) {
      group.push(bare[j]);
      j += 1;
      // Пунктуация внутри группы обрывает числительное: «три, четыре» —
      // это перечисление, а не тридцать четыре.
      if (tails[j - 1]) break;
    }
    while (group.length && GLUE.has(group[group.length - 1])) {
      group.pop();
      j -= 1;
    }
    const hasScale = group.some((g) => g in SCALES && SCALES[g] >= 1000);
    const value = hasScale ? fold(group) : null;
    const prev = out.length ? out[out.length - 1] : "";
    if (value === null) {
      out.push(...tokens.slice(i, j));
    } else if (DIGITS.test(prev) && group[0] in SCALES && SCALES[group[0]] >= 1000) {
      // «70 тысяч» — множитель ПОСЛЕ цифр. Без этой ветки он приписывался
      // отдельным числом («70 1000»), и регулярка цены читала «70 100»:
      // человек называл семьдесят тысяч, а стол слышал семьдесят тысяч сто.
      const scale = SCALES[group[0]];
      const rest = group.length > 1 ? fold(group.slice(1)) ?? 0 : 0;
      out[out.length - 1] = fmt(parseFloat(prev.replace(",", ".")) * scale + rest) + tails[j - 1];
    } else {
      out.push(fmt(value) + tails[j - 1]);
    }
    i = j;
  }
  return out.join(" ");
}
