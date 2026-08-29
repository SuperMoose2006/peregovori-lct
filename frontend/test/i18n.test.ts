// i18n.test.ts — RU и EN обязаны иметь ОДНУ форму.
//
// Типы ловят только отсутствие ключа целиком: `Record<string, string>` (ярлыки
// приёмов, реакций, шкал курса) типизирован одинаково для обоих языков, но
// ничего не знает про наличие конкретного ключа. Пропущенный `tradeoff` в
// английском словаре компилируется молча — и всплывает на экране как «tradeoff»
// вместо перевода, ровно перед жюри.
import test from "node:test";
import assert from "node:assert/strict";
import { I18N } from "../src/i18n";

type Node = unknown;

function shape(node: Node, path = ""): string[] {
  if (Array.isArray(node)) return [`${path}[]`];
  if (node && typeof node === "object") {
    return Object.entries(node as Record<string, Node>)
      .flatMap(([k, v]) => shape(v, path ? `${path}.${k}` : k));
  }
  return [path];
}

test("русский и английский словари имеют одинаковый набор ключей", () => {
  const ru = shape(I18N.ru).sort();
  const en = shape(I18N.en).sort();
  const onlyRu = ru.filter((k) => !en.includes(k));
  const onlyEn = en.filter((k) => !ru.includes(k));
  assert.deepEqual(onlyRu, [], `нет в английском: ${onlyRu.join(", ")}`);
  assert.deepEqual(onlyEn, [], `нет в русском: ${onlyEn.join(", ")}`);
});

test("ни одна строка не пустая", () => {
  for (const lang of ["ru", "en"] as const) {
    const empty: string[] = [];
    const walk = (node: Node, path: string) => {
      if (typeof node === "string") { if (!node.trim()) empty.push(path); return; }
      if (Array.isArray(node)) { node.forEach((v, i) => walk(v, `${path}[${i}]`)); return; }
      if (node && typeof node === "object") {
        for (const [k, v] of Object.entries(node as Record<string, Node>)) walk(v, path ? `${path}.${k}` : k);
      }
    };
    walk(I18N[lang], "");
    assert.deepEqual(empty, [], `${lang}: пустые строки — ${empty.join(", ")}`);
  }
});

test("плейсхолдеры совпадают в обоих языках", () => {
  // «{n} из {total}» без одного из плейсхолдеров — это молчаливая потеря числа.
  const holes = (s: string) => (s.match(/\{[a-z]+\}/gi) ?? []).sort().join(",");
  const bad: string[] = [];
  const walk = (a: Node, b: Node, path: string) => {
    if (typeof a === "string" && typeof b === "string") {
      if (holes(a) !== holes(b)) bad.push(`${path}: «${holes(a)}» ≠ «${holes(b)}»`);
      return;
    }
    if (Array.isArray(a) && Array.isArray(b)) {
      a.forEach((v, i) => walk(v, b[i], `${path}[${i}]`));
      return;
    }
    if (a && b && typeof a === "object" && typeof b === "object") {
      for (const k of Object.keys(a as Record<string, Node>)) {
        walk((a as Record<string, Node>)[k], (b as Record<string, Node>)[k], path ? `${path}.${k}` : k);
      }
    }
  };
  walk(I18N.ru, I18N.en, "");
  assert.deepEqual(bad, [], bad.join("\n"));
});

// ── Инвариант 4: билингвальность ВСЕГО пользовательского контента ──────────
//
// Три теста выше сверяют ключи, пустоту и подстановки. Ни один из них не
// замечает, что английская строка написана по-русски: ключ на месте, строка
// непуста, плейсхолдеры совпадают — а диктор читает английскому пользователю
// «Карл наблюдает». Именно так этот дефект и жил в подписях к маскоту, и нашёлся
// он только когда кто-то посмотрел глазами.
//
// Здесь он закрыт для всего словаря сразу, в обе стороны.

/** Единственная кириллица, которой в английском словаре место, — имя продукта.
 *  Оно и по-английски пишется так же: это название, а не забытый перевод. */
const BRAND = /«?Диалог»?/g;

/** Слова, которые в русском тексте остаются латиницей законно: термины метода
 *  и единица опыта. Список намеренно короткий и закрытый — он оправдывает
 *  восемь конкретных строк, а не открывает дверь. */
const TERMS = /\b(SPIN|BATNA|ZOPA|XP)\b/g;

const CYR = /[А-Яа-яЁё]/;
const LETTER = /[A-Za-zА-Яа-яЁё]/;

function walk(o: unknown, path: string, out: [string, string][]): void {
  for (const [k, v] of Object.entries((o ?? {}) as Record<string, unknown>)) {
    const p = path ? `${path}.${k}` : k;
    if (typeof v === "string") out.push([p, v]);
    else if (v && typeof v === "object") walk(v, p, out);
  }
}

/** Английская строка написана по-русски? */
const enHasRussian = (v: string) => CYR.test(v.replace(BRAND, ""));

/** Русская строка осталась английской? Тоньше первого случая: «{n} XP»
 *  законна, «Your turn» — нет. Убираем подстановки и термины; если после
 *  этого остались буквы, среди них обязана быть кириллица. */
const ruHasForgottenEnglish = (v: string) => {
  const rest = v.replace(/\{[^}]*\}/g, "").replace(TERMS, "");
  return LETTER.test(rest) && !CYR.test(rest);
};

test("само правило отличает забытый перевод от законного исключения", () => {
  // Сторож, проверенный только на здоровом словаре, доказывает лишь то, что
  // словарь здоров. Здесь он проверяется на подложных строках — в обе стороны
  // и на самом коварном случае: имя продукта не должно прикрывать собой
  // кириллицу, стоящую рядом.
  assert.equal(enHasRussian("The «Диалог» trainer certifies the method."), false);
  assert.equal(enHasRussian("Карл наблюдает"), true);
  assert.equal(enHasRussian("The «Диалог» trainer. Ваш ход."), true);
  assert.equal(enHasRussian("Your move"), false);

  assert.equal(ruHasForgottenEnglish("{n} XP"), false);
  assert.equal(ruHasForgottenEnglish("{done}/{target}"), false);
  assert.equal(ruHasForgottenEnglish("Your turn"), true);
  assert.equal(ruHasForgottenEnglish("Ваш ход"), false);
  assert.equal(ruHasForgottenEnglish("SPIN и BATNA"), false);
});

test("в английском словаре нет русского текста", () => {
  const bad: string[] = [];
  const rows: [string, string][] = [];
  walk(I18N.en, "", rows);
  for (const [key, value] of rows) {
    if (enHasRussian(value)) bad.push(`${key} = ${JSON.stringify(value)}`);
  }
  assert.deepEqual(bad, [],
    "английскому пользователю показывают русский текст:\n" + bad.join("\n"));
});

test("в русском словаре нет забытого английского", () => {
  // Симметричный случай, и он тоньше: строка «{n} XP» законна, а строка
  // «Your turn» — нет. Отличаем так: убираем плейсхолдеры и термины метода;
  // если после этого остались буквы, среди них обязана быть кириллица.
  const bad: string[] = [];
  const rows: [string, string][] = [];
  walk(I18N.ru, "", rows);
  for (const [key, value] of rows) {
    if (ruHasForgottenEnglish(value)) bad.push(`${key} = ${JSON.stringify(value)}`);
  }
  assert.deepEqual(bad, [],
    "русскому пользователю показывают английский текст:\n" + bad.join("\n"));
});
