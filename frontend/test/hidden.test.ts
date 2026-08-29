// hidden.test.ts — КЛАСС ОШИБКИ, а не три её случая.
//
// Аудит нашёл одну строку в styles.css:
//
//     :root .side .meters, :root .side .scorecard, :root .pb-meters { display: none }
//
// Компонент `Scorecard` был написан, переведён на два языка, отрисован в
// Table.tsx — и погашен стилем. Панель шкал с полными подписями и объяснениями
// `meterInfo` — то же самое. Ни typecheck, ни тесты, ни чтение кода этого не
// видят: импорт есть, разметка есть, строки переведены. Нет только пикселей.
//
// Это ровно тот долг, за который уже платили удалением скина «додзё»: код,
// который не показывают, но за который платят при каждой правке.
//
// ЧТО СЧИТАЕТ ТЕСТ. Для каждого класса, который хоть один компонент кладёт в
// `className`, он ищет в styles.css «приговор» и «помилование»:
//
//   приговор  — `display: none` правилом, которое действует ВСЕГДА: без
//               `@media` (это условие ширины), без `[hidden]`, `:hover`,
//               `.x.on` (это условия состояния) и без `::before` (это вообще
//               другой элемент). Условное скрытие — норма, ловим безусловное.
//   помилование — любое правило с другим `display`, откуда угодно, включая
//               `@media` и состояния, — но только если оно ПЕРЕБИВАЕТ приговор
//               по (специфичность, порядок). Именно этой проверки не хватало
//               `.pb-meters`: `@media` возвращал ему `display: grid`, а
//               `:root .pb-meters { display: none }` был специфичнее и убивал
//               ответ насовсем.
//
// Предок в приговоре (`:root .side .meters`) считается выполненным, только
// если тот же файл, который рисует класс, рисует и предка. Иначе контекст
// приходит извне и может не наступить: `.course-why .teach-head` прячет
// заголовок внутри одного конкретного блока, а в остальных местах он виден.
//
// Как пройти тест: верните класс правилом БОЛЬШЕЙ специфичности либо удалите
// разметку. Третьего состояния — «нарисовано и погашено» — быть не должно.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

interface Rule {
  selector: string;
  /** Классы элемента-подлежащего (последний компонент селектора). */
  subject: string[];
  /** Классы предков — контекст, который ещё должен совпасть. */
  ancestors: string[];
  display: string;
  spec: number;
  order: number;
  /** Правило действует не всегда: @media, состояние, псевдокласс. */
  conditional: boolean;
}

/** Специфичность одним числом: id·10000 + класс/атрибут/псевдокласс·100 + элемент. */
function specificity(sel: string): number {
  const s = sel.replace(/::[a-z-]+/g, " ").replace(/\([^)]*\)/g, "");
  const ids = (s.match(/#[\w-]+/g) ?? []).length;
  const classes = (s.match(/\.[\w-]+|\[[^\]]*\]|:[\w-]+/g) ?? []).length;
  const els = (s.match(/(^|[\s>+~])[a-z][\w-]*/gi) ?? []).length;
  return ids * 10000 + classes * 100 + els;
}

const classesOf = (part: string) => (part.match(/\.[\w-]+/g) ?? []).map((c) => c.slice(1));

/** Разбор styles.css в плоский список правил, задающих `display`. */
function displayRules(css: string): Rule[] {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const out: Rule[] = [];
  let head = "";
  let atDepth = 0;
  let order = 0;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (ch === "{") {
      const sel = head.trim();
      head = "";
      if (sel.startsWith("@")) {
        atDepth++;
        continue;
      }
      let depth = 1;
      let j = i + 1;
      for (; j < clean.length && depth; j++) {
        if (clean[j] === "{") depth++;
        else if (clean[j] === "}") depth--;
      }
      const body = clean.slice(i + 1, j - 1);
      i = j - 1;
      const decls = [...body.matchAll(/(^|;)\s*display\s*:\s*([^;!}]+)/g)];
      if (!decls.length) continue;
      const value = decls[decls.length - 1][2].trim();
      for (const one of sel.split(",")) {
        const s1 = one.trim();
        if (!s1 || /^(from|to|\d)/.test(s1)) continue; // шаги @keyframes
        const parts = s1.split(/[\s>+~]+/).filter(Boolean);
        const last = parts[parts.length - 1];
        out.push({
          selector: s1,
          subject: classesOf(last),
          ancestors: parts.slice(0, -1).flatMap(classesOf),
          display: value,
          spec: specificity(s1),
          order: order++,
          conditional:
            atDepth > 0 ||
            /::/.test(s1) ||
            /\[/.test(s1) ||
            /:(?!root\b)[\w-]/.test(s1) ||
            parts.some((p) => classesOf(p).length > 1),
        });
      }
    } else if (ch === "}") {
      if (atDepth) atDepth--;
    } else {
      head += ch;
    }
  }
  return out;
}

/** Классы, которые кладёт в `className` каждый .tsx: файл → множество классов. */
function renderedClasses(dir: string, into = new Map<string, Set<string>>()): Map<string, Set<string>> {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      renderedClasses(full, into);
      continue;
    }
    if (!e.name.endsWith(".tsx")) continue;
    const src = readFileSync(full, "utf8");
    const set = into.get(e.name) ?? new Set<string>();
    for (const m of src.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\}|\{"([^"]*)"\})/g)) {
      const raw = m[1] ?? m[2] ?? m[3] ?? "";
      // `${…}` — вычисляемая часть; из неё берём только строковые литералы.
      const literal = raw.replace(/\$\{[^}]*\}/g, (x) =>
        (x.match(/["'`][^"'`]*["'`]/g) ?? []).join(" ").replace(/["'`]/g, " "),
      );
      for (const cls of literal.split(/\s+/)) if (/^[\w-]+$/.test(cls)) set.add(cls);
    }
    into.set(e.name, set);
  }
  return into;
}

test("ни один отрисованный класс не погашен насмерть через display:none", () => {
  const rules = displayRules(readFileSync(join(SRC, "styles.css"), "utf8"));
  const byClass = new Map<string, Rule[]>();
  for (const r of rules) {
    for (const cls of r.subject) {
      const list = byClass.get(cls) ?? [];
      list.push(r);
      byClass.set(cls, list);
    }
  }
  const beats = (a: Rule, b: Rule) => a.spec > b.spec || (a.spec === b.spec && a.order > b.order);

  const dead: string[] = [];
  for (const [file, classes] of renderedClasses(join(SRC, "components"))) {
    for (const cls of classes) {
      const list = byClass.get(cls);
      if (!list) continue;
      // Приговор: безусловное `display: none`, чей контекст этот же файл и
      // создаёт. Берём самый сильный — его и придётся перебивать.
      let doom: Rule | null = null;
      for (const r of list) {
        if (r.conditional || r.display !== "none") continue;
        if (!r.ancestors.every((a) => classes.has(a))) continue;
        if (!doom || beats(r, doom)) doom = r;
      }
      if (!doom) continue;
      const saved = list.some((r) => r.display !== "none" && beats(r, doom!));
      if (!saved) dead.push(`.${cls} (рисует ${file}) погашен правилом «${doom.selector}»`);
    }
  }
  assert.deepEqual(
    dead.sort(),
    [],
    `разметка есть, пикселей нет:\n  ${dead.sort().join("\n  ")}\n` +
      "Либо верните класс правилом большей специфичности, либо удалите разметку.",
  );
});
