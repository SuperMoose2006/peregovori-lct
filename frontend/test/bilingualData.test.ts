// bilingualData.test.ts — инвариант 4 за пределами словаря интерфейса.
//
// `i18n.test.ts` держит `I18N`: ключи, пустоту, подстановки, язык каждой
// строки. Но добрая половина того, что человек читает, живёт НЕ там: брифы и
// реплики столов (data/scenarios.ts, mirrors.ts), кампании, игры на чтение,
// названия пресетов и причины недоступности слоёв (lib/layers.ts), банк курса.
// Всё это пары `{ru, en}`, и каждую до сих пор проверял — если проверял —
// тест своего модуля, своими словами.
//
// Здесь одно правило на все пары сразу, включая модули, которых ещё нет:
// каталоги читаются целиком, а не списком. Новый файл данных с забытым
// переводом валит сборку в тот же день.
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";

const SRC = new URL("../src/", import.meta.url);

/** Имя продукта пишется по-русски и в английском тексте — это название. */
const BRAND = /«?Диалог»?/g;
/** Термины метода и единица опыта законно стоят латиницей в русском тексте. */
const TERMS = /\b(SPIN|BATNA|ZOPA|XP)\b/g;
const CYR = /[А-Яа-яЁё]/;
const LATIN = /[A-Za-z]/;
const LETTER = /[A-Za-zА-Яа-яЁё]/;

/** Поля-символы, а не текст: «k» в обоих языках — это «тысяч», а не забытый перевод. */
const SYMBOL_KEYS = new Set(["unit"]);

interface Pair { path: string; key: string; ru: unknown; en: unknown }

async function collect(): Promise<{ pairs: Pair[]; modules: string[] }> {
  const pairs: Pair[] = [];
  const modules: string[] = [];
  const seen = new WeakSet<object>();
  const walk = (v: unknown, path: string, key: string) => {
    if (!v || typeof v !== "object" || seen.has(v)) return;
    seen.add(v);
    const o = v as Record<string, unknown>;
    if (typeof o.ru === "string" || typeof o.en === "string") pairs.push({ path, key, ru: o.ru, en: o.en });
    if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`, key));
    else for (const [k, x] of Object.entries(o)) walk(x, `${path}.${k}`, k);
  };
  for (const dir of ["lib", "data"]) {
    for (const file of readdirSync(new URL(dir, SRC)).filter((f) => f.endsWith(".ts")).sort()) {
      const mod = await import(new URL(`${dir}/${file}`, SRC).href) as Record<string, unknown>;
      modules.push(`${dir}/${file}`);
      for (const [name, value] of Object.entries(mod)) walk(value, `${dir}/${file}:${name}`, name);
    }
  }
  return { pairs, modules };
}

const data = collect();

test("обход видит данные продукта, а не пустоту", async () => {
  // Сторож, который ничего не нашёл, выглядит ровно как сторож, который всё
  // проверил. Поэтому — нижняя граница и три заведомо двуязычных источника.
  const { pairs } = await data;
  assert.ok(pairs.length > 500, `нашлось всего ${pairs.length} пар {ru, en}`);
  for (const src of ["data/scenarios.ts", "lib/layers.ts", "data/campaigns.generated.ts"]) {
    assert.ok(pairs.some((p) => p.path.startsWith(src)), `${src}: ни одной пары — обход сломан`);
  }
});

test("у каждой пары есть обе половины", async () => {
  const bad = (await data).pairs
    .filter((p) => typeof p.ru !== "string" || typeof p.en !== "string")
    .map((p) => `${p.path}: ru=${typeof p.ru}, en=${typeof p.en}`);
  assert.deepEqual(bad, [], bad.join("\n"));
});

test("половина с текстом не стоит рядом с пустой", async () => {
  // Пустыми законно бывают обе половины сразу (полоса репутации, о которой
  // нечего сказать). Одна пустая при живой второй — забытый перевод.
  const bad: string[] = [];
  for (const p of (await data).pairs) {
    const ru = String(p.ru ?? ""), en = String(p.en ?? "");
    if (LETTER.test(ru) && !en.trim()) bad.push(`${p.path}: нет английского к «${ru.slice(0, 60)}»`);
    if (LETTER.test(en) && !ru.trim()) bad.push(`${p.path}: нет русского к «${en.slice(0, 60)}»`);
  }
  assert.deepEqual(bad, [], bad.join("\n"));
});

test("английская половина написана по-английски", async () => {
  const bad = (await data).pairs
    .filter((p) => typeof p.en === "string" && CYR.test(p.en.replace(BRAND, "")))
    .map((p) => `${p.path} = ${JSON.stringify(p.en).slice(0, 100)}`);
  assert.deepEqual(bad, [], "английскому пользователю показывают русский текст:\n" + bad.join("\n"));
});

test("русская половина не осталась английской", async () => {
  const bad: string[] = [];
  for (const p of (await data).pairs) {
    if (typeof p.ru !== "string" || SYMBOL_KEYS.has(p.key)) continue;
    const rest = p.ru.replace(/\{[^}]*\}/g, "").replace(TERMS, "");
    if (LATIN.test(rest) && !CYR.test(rest)) bad.push(`${p.path} = ${JSON.stringify(p.ru).slice(0, 100)}`);
  }
  assert.deepEqual(bad, [], "русскому пользователю показывают английский текст:\n" + bad.join("\n"));
});
