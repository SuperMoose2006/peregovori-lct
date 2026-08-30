// a11y.test.ts — инварианты доступности, каждый из которых уже один раз
// сломался.
//
// Все нашлись прибором в живом браузере, и все невидимы для типов и для
// остальных тестов: `aria-label="send"` компилируется, `behavior: "smooth"`
// компилируется, `aria-modal="true"` без ловушки фокуса компилируется,
// `role="progressbar"` без имени компилируется. Ловить их можно только по
// исходнику — как `markers.test.ts` ловит голый TODO, а `tokens.test.ts` —
// необъявленный `var(--x)`.
//
// ГРАНИЦА ЭТОГО ФАЙЛА. Здесь живёт только то, что видно в РАЗМЕТКЕ: имя, роль,
// объявленное правило. «Доходит ли Tab до кнопки» и «не падает ли фокус на
// BODY после нажатия» отсюда не проверяются и проверяться не могут — порядок
// обхода зависит от `disabled`, `inert`, порталов и от того, что делает сама
// страница в ответ на фокус. Это меряет `probes/audit.mjs` настоящими
// нажатиями; здесь — причины, которые в исходнике видно.
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

test("одноязычная строка не прячется внутри выражения", () => {
  // Литерал ловится и в фигурных скобках: `aria-label="send"` тест выше видел,
  // а `aria-label={label ?? "Counterpart portrait"}` — нет, и русский диктор
  // читал бы «каунтерпарт портрет». Признак тот же: закавыченный текст с
  // буквами, в котором нет подстановки из словаря.
  const bad: string[] = [];
  for (const file of walk(SRC)) {
    const text = readFileSync(file, "utf8")
      .replace(/\/\*[^]*?\*\//g, (c) => c.replace(/[^\n]/g, " "))
      .replace(/\/\/[^\n]*/g, (c) => " ".repeat(c.length));
    for (const m of text.matchAll(/\b(aria-label|alt|title)=\{/g)) {
      // Выражение целиком: от «{» до парной «}».
      let depth = 0, end = m.index! + m[0].length - 1;
      for (let i = end; i < text.length; i++) {
        if (text[i] === "{") depth++;
        else if (text[i] === "}") { depth--; if (depth === 0) { end = i; break; } }
      }
      const expr = text.slice(m.index! + m[0].length, end);
      if (expr.includes("${")) continue;                    // собрано из словаря
      for (const lit of expr.matchAll(/"([^"]*)"|'([^']*)'/g)) {
        const v = lit[1] ?? lit[2] ?? "";
        if (!/\p{L}/u.test(v)) continue;                    // цифры и знаки языка не имеют
        // «{n}», «{grade}» — это ПОДСТАНОВОЧНЫЕ МЕСТА в `.replace()`, а не
        // текст: сам текст пришёл из словаря строкой раньше.
        if (/^\{\w+\}$/.test(v)) continue;
        const line = text.slice(0, m.index!).split("\n").length;
        bad.push(`${rel(file)}:${line} — ${m[1]}={… "${v}" …}`);
      }
    }
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

test("подпись картинки и всплывающая подсказка — тоже из словаря", () => {
  // Тот же дефект, что у `aria-label`, и он уже случался: подписи к картинкам
  // маскотов были вбиты по-русски прямо в JSX, и английскому диктору читали
  // русский текст — а тест на непереведённое смотрит только на ВИДИМЫЙ текст,
  // куда alt не попадает никогда. `title` здесь по той же причине: для
  // управления без содержимого он становится доступным именем.
  const LITERAL = /\b(alt|title)=(?:"([^"]*)"|\{\s*(?:"([^"]*)"|'([^']*)'|`([^`]*)`)\s*\})/;
  const bad: string[] = [];
  for (const file of walk(SRC)) {
    readFileSync(file, "utf8").split("\n").forEach((line, i) => {
      const m = line.match(LITERAL);
      if (!m) return;
      const text = m[2] ?? m[3] ?? m[4] ?? m[5] ?? "";
      if (text.includes("${")) return;   // собрано из словаря — так и надо
      // Пустой alt — законная пометка «картинка декоративная»; цифры и знаки
      // языка не имеют.
      if (!/\p{L}/u.test(text)) return;
      bad.push(`${rel(file)}:${i + 1} — ${m[1]}="${text}"`);
    });
  }
  assert.deepEqual(bad, [], "подпись берётся из словаря, иначе она одноязычна:\n" + bad.join("\n"));
});

test("виджет-роль несёт имя: без него диктор читает голое число", () => {
  // `role="progressbar"` без имени звучит как «индикатор, 3» — три чего,
  // неизвестно. Спецификация требует имени для этих ролей, и оно не может
  // прийти из содержимого: содержимое таких виджетов дикторами не читается.
  //
  // ИМЯ ИЩЕТСЯ В СВОЁМ ТЕГЕ, А НЕ «ГДЕ-ТО РЯДОМ». Первая редакция смотрела в
  // окно ±8 строк — и молчала о безымянной полоске внутри секции, у которой
  // `aria-labelledby` стоял восемью строками выше: имя было у РОДИТЕЛЯ, а
  // спрашивали про ребёнка. Проверка, которая не срабатывает на дефекте, ради
  // которого написана, хуже отсутствующей.
  const ROLES = ["progressbar", "meter", "slider", "radiogroup", "switch", "tablist", "dialog", "log"];
  const bad: string[] = [];
  for (const file of walk(SRC)) {
    // КОММЕНТАРИЙ — НЕ РАЗМЕТКА. Здесь плотно объясняют, ПОЧЕМУ роли нет, и
    // сама строка `role="progressbar"` в объяснении встречается чаще, чем в
    // коде. Гасим комментарии пробелами: длина сохраняется, значит номера
    // строк в находке остаются настоящими.
    const text = readFileSync(file, "utf8")
      .replace(/\/\*[^]*?\*\//g, (c) => c.replace(/[^\n]/g, " "))
      .replace(/\/\/[^\n]*/g, (c) => " ".repeat(c.length));
    for (const m of text.matchAll(/role="([a-z]+)"/g)) {
      if (!ROLES.includes(m[1])) continue;
      const at = m.index!;
      // Начало тега: ближайший «<» слева. В значениях атрибутов его не бывает.
      const open = text.lastIndexOf("<", at);
      // Конец тега: первый «>» на нулевой глубине фигурных скобок — иначе
      // стрелка в `onClick={() => …}` обрывала бы тег на середине.
      let depth = 0, close = at;
      for (let i = open; i < text.length; i++) {
        const c = text[i];
        if (c === "{") depth++;
        else if (c === "}") depth--;
        else if (c === ">" && depth === 0 && i > open) { close = i; break; }
      }
      const tag = text.slice(open, close);
      if (/aria-label(?:ledby)?=/.test(tag)) continue;
      const line = text.slice(0, at).split("\n").length;
      bad.push(`${rel(file)}:${line} — role="${m[1]}" без aria-label/aria-labelledby`);
    }
  }
  assert.deepEqual(bad, [], bad.join("\n"));
});

test("radiogroup обещает стрелки — значит стрелки написаны", () => {
  // Роль `radio`/`radiogroup` — это обещание конкретной клавиатурной модели:
  // ОДНА остановка Tab на группу, выбор внутри двигают стрелки. Четыре кнопки
  // с ролью `radio`, каждая своей остановкой, и мёртвые стрелки — та же
  // половинчатая разметка, из-за которой из продукта уже убрали `tablist` в
  // разборе и `listbox` в курсе. Либо модель написана, либо роли нет.
  const bad: string[] = [];
  for (const file of walk(SRC)) {
    const text = readFileSync(file, "utf8");
    if (!/role="radio"/.test(text)) continue;
    if (!/role="radiogroup"/.test(text)) bad.push(`${rel(file)}: role="radio" без role="radiogroup"`);
    if (!/ArrowRight|ArrowDown/.test(text)) bad.push(`${rel(file)}: radiogroup без стрелок`);
    // Roving tabindex: остановка Tab одна, и она вычисляется, а не константа.
    if (!/tabIndex=\{[^}]*\?[^}]*:\s*-1\s*\}/.test(text))
      bad.push(`${rel(file)}: radiogroup без roving tabindex — каждая радиокнопка своя остановка Tab`);
  }
  assert.deepEqual(bad, [], bad.join("\n"));
});

test("просьбу не анимировать гасит одно правило на весь продукт", () => {
  // Точечные `@media (prefers-reduced-motion)` рядом с каждой анимацией
  // протухают молча: новый `@keyframes` приезжает без своей пары, и никто не
  // замечает. Поэтому в styles.css стоит одно правило на всё, и снять его
  // нельзя незаметно. Проверяются обе половины: анимации/переходы и прокрутка
  // (последняя — вместе с lib/motion.ts, см. тест выше).
  const css = readFileSync(join(SRC, "styles.css"), "utf8");
  const block = css.match(/@media \(prefers-reduced-motion: reduce\)\s*\{[^]*?\n\}/g) ?? [];
  const global = block.find((b) => /\*\s*\{[^}]*animation:\s*none\s*!important/.test(b));
  assert.ok(global, "нет общего правила `* { animation: none !important }` под prefers-reduced-motion");
  assert.match(global!, /transition:\s*none\s*!important/, "общее правило гасит анимации, но не переходы");
  assert.match(global!, /scroll-behavior:\s*auto\s*!important/, "общее правило не гасит плавную прокрутку");
});
