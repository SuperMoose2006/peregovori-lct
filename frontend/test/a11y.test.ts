// a11y.test.ts — три инварианта доступности, которые уже один раз сломались.
//
// Все три нашлись прибором в живом браузере, и все три невидимы для типов и для
// остальных тестов: `aria-label="send"` компилируется, `behavior: "smooth"`
// компилируется, `aria-modal="true"` без ловушки фокуса компилируется. Ловить их
// можно только по исходнику — как `markers.test.ts` ловит голый TODO, а
// `tokens.test.ts` — необъявленный `var(--x)`.
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const full = join(dir, e);
    if (statSync(full).isDirectory()) {
      // vendor/ — перенесённый upstream-код, его конвенции не наши.
      if (e !== "vendor") walk(full, out);
    } else if (/\.tsx?$/.test(e)) out.push(full);
  }
  return out;
}
const rel = (f: string) => relative(SRC, f);

test("aria-label — пользовательский контент, а не строка в коде", () => {
  // Имя, набранное в JSX литералом, не переводится вместе с интерфейсом:
  // русский диктор читал «сенд» и «тхеме», английский — «говорит».
  //
  // Бракуется ЛИТЕРАЛ, а не любой шаблон: `aria-label={`${b.title[lang]} — …`}`
  // собран из уже переведённых кусков и есть ровно то, чего мы хотим. Признак
  // литерала — отсутствие подстановки `${…}`.
  const LITERAL = /aria-label=(?:"([^"]*)"|\{\s*(?:"([^"]*)"|'([^']*)'|`([^`]*)`)\s*\})/;
  const bad: string[] = [];
  for (const file of walk(SRC)) {
    readFileSync(file, "utf8").split("\n").forEach((line, i) => {
      const m = line.match(LITERAL);
      if (!m) return;
      const text = m[1] ?? m[2] ?? m[3] ?? m[4] ?? "";
      if (text.includes("${")) return;      // собрано из словаря — это правильный код
      if (!/\p{L}/u.test(text)) return;     // пустое имя — отдельный разговор
      bad.push(`${rel(file)}:${i + 1} — aria-label="${text}"`);
    });
  }
  assert.deepEqual(bad, [], "имя берётся из словаря (t.a11y.*), иначе оно одноязычно:\n" + bad.join("\n"));
});

test("«плавно» спрашивают у lib/motion, а не пишут константой", () => {
  // `behavior: "smooth"` по спецификации перекрывает CSS `scroll-behavior`,
  // поэтому `@media (prefers-reduced-motion: reduce)` до него не достаёт:
  // просьбу не анимировать восемь переходов подряд просто не замечали.
  const bad: string[] = [];
  for (const file of walk(SRC)) {
    if (rel(file) === join("lib", "motion.ts")) continue;
    readFileSync(file, "utf8").split("\n").forEach((line, i) => {
      if (/behavior:\s*["']smooth["']/.test(line)) bad.push(`${rel(file)}:${i + 1}`);
    });
  }
  assert.deepEqual(bad, [], "используйте scrollTop()/scrollTo() из lib/motion:\n" + bad.join("\n"));
});

test("роль обещает ровно то, что реализовано", () => {
  const bad: string[] = [];
  for (const file of walk(SRC)) {
    const text = readFileSync(file, "utf8");
    // `tablist` без `tabpanel` — диктор объявляет «вкладка 1 из 3», а панели,
    // на которую вкладка ссылается, нет: переключаются куски по всей карточке.
    if (/role="tab(list)?"/.test(text) && !/role="tabpanel"/.test(text)) {
      bad.push(`${rel(file)}: role="tab"/"tablist" без role="tabpanel"`);
    }
    // `listbox` без `option` — и наоборот: половина пары ничего не значит.
    if (/role="listbox"/.test(text) !== /role="option"/.test(text)) {
      bad.push(`${rel(file)}: listbox и option объявляются только вместе`);
    }
    // `aria-modal` — обещание, что фон недостижим. Держит его `inert`, а не
    // атрибут: без него Tab свободно ходит по фону, и курсор диктора
    // оказывается там, где для человека уже ничего нет.
    if (/aria-modal="true"/.test(text) && !/\binert\b|useModalShell/.test(text)) {
      bad.push(`${rel(file)}: aria-modal="true" без ловушки фокуса (lib/modal.ts)`);
    }
  }
  assert.deepEqual(bad, [], bad.join("\n"));
});
