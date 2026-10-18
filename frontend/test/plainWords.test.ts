// plainWords.test.ts — в интерфейсе нет слов из устройства продукта.
//
// Решение владельца: «без технических фраз в интерфейсе». Аудит 16.10 нашёл
// тридцать строк вида «итог, который поставил движок», «у сервера нет ключа
// модели», «посчитал движок по словарю приёмов». Человек за столом не знает и
// не обязан знать, что такое движок и шаблон; ему говорят «по правилам
// тренажёра» и «готовые реплики». Слово «движение» (цены) — не находка.
import test from "node:test";
import assert from "node:assert/strict";
import { I18N } from "../src/i18n";
import { COURSE_BANK, COURSE_MASTER } from "../src/data/course.generated";
import { COURSE_BLOCKS } from "../src/data/course.blocks.generated";

const BANNED: Record<"ru" | "en", RegExp> = {
  ru: /движ(ок|ка|ку|ком|ке)\b|сервер|шаблон|детерминир|ключ[а-я]* модел|словар[а-я]* при[её]м/i,
  en: /\bengine\b|\bserver\b|\btemplates?\b|deterministic|model key|lexicon/i,
};

function strings(o: unknown, path: string, out: [string, string][]) {
  if (typeof o === "string") out.push([path, o]);
  else if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) strings(v, `${path}.${k}`, out);
  return out;
}

for (const lang of ["ru", "en"] as const) {
  test(`${lang}: в строках интерфейса нет технических слов`, () => {
    const bad = strings(I18N[lang], lang, []).filter(([, s]) => BANNED[lang].test(s));
    assert.deepEqual(bad, []);
  });
}

// Курс: объяснения к заданиям и теория блоков. Там же жили «Движок видит
// здесь только предложение цены», «Первый инвариант движка», «Предикат
// требует…» и `concession` в обратных кавычках (аудит 16.10, F-1).

const COURSE_BANNED: Record<"ru" | "en", RegExp> = {
  ru: /движ(ок|ка|ку|ком|ке)\b|предикат|инвариант|`|\bсудь[яи]\b|офлайнов/i,
  en: /\bengine\b|predicate|invariant|`|\bjudge\b|offline check/i,
};

function bilingual(o: unknown, out: [string, string, string][], path = "") {
  if (Array.isArray(o)) o.forEach((v, i) => bilingual(v, out, `${path}[${i}]`));
  else if (o && typeof o === "object") {
    const r = o as Record<string, unknown>;
    if (typeof r.ru === "string" && typeof r.en === "string") out.push([path, r.ru, r.en]);
    else for (const [k, v] of Object.entries(r)) bilingual(v, out, `${path}.${k}`);
  }
  return out;
}

test("курс: в объяснениях и теории нет технических слов", () => {
  const all = bilingual([COURSE_BANK, COURSE_MASTER, COURSE_BLOCKS], []);
  assert.ok(all.length > 300, "курс не разобрался — проверка мерила бы пустоту");
  const bad = all.filter(([, ru, en]) => COURSE_BANNED.ru.test(ru) || COURSE_BANNED.en.test(en))
    .map(([p, ru, en]) => `${p}: ${COURSE_BANNED.ru.test(ru) ? ru : en}`.slice(0, 160));
  assert.deepEqual(bad, []);
});

// Строки, зашитые в компоненты и модули мимо I18N, этот сторож не видел:
// «Проверьте подключение к серверу» (редактор), «Серверная аттестация»,
// «на сервере нет облачного зрения» (слои), «получено с сервера»
// (переподключение) — найдено после аудита 17.10. Смотрим фразы в кавычках:
// с кириллицей — по русскому списку, из трёх и больше слов с заглавной — по
// английскому. Комментарии вырезаются: там эти слова законны.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { if (name !== "vendor") sources(p, out); }
    else if (/\.(ts|tsx)$/.test(name) && !/i18n\.ts$|\.generated\.ts$|vite-env/.test(name)) out.push(p);
  }
  return out;
}

test("в строках, зашитых в компоненты мимо словаря, нет технических слов", () => {
  const src = new URL("../src", import.meta.url).pathname;
  const bad: string[] = [];
  for (const file of sources(src)) {
    const code = readFileSync(file, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|\s)\/\/.*$/gm, "$1")
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
    for (const m of code.matchAll(/"([^"\n]{12,})"|`([^`\n]{12,})`/g)) {
      const s = m[1] ?? m[2];
      const ru = /[а-яё]/i.test(s);
      const en = !ru && /^[A-Z][^ ]* \S+ \S+/.test(s);
      if ((ru && BANNED.ru.test(s)) || (en && BANNED.en.test(s))) bad.push(`${file.slice(src.length + 1)}: ${s.slice(0, 90)}`);
    }
  }
  assert.deepEqual(bad, []);
});
