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
