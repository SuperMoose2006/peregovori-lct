// icon.test.ts — значки: что рисуется и что слышит диктор.
//
// ЧТО ЗДЕСЬ ДЕРЖИТСЯ. Эмодзи заменены штриховым SVG (Icon.tsx), и
// `noEmoji.test.ts` проверяет, что каждое ИМЯ из данных есть в PATHS. Он не
// проверяет, что по имени рисуется хоть что-нибудь, и не проверяет обещание из
// шапки Icon.tsx про доступность: значок без подписи немой (`aria-hidden`), а
// значок, которому дали `title`, — картинка с именем. Перепутать эти два
// случая значит либо заставить диктор читать «изображение» у каждой кнопки,
// либо оставить единственную кнопку-значок вовсе без имени.
//
// Оформление (цвет, толщина, размер) здесь не проверяется намеренно: оно
// меняется вместе с дизайном, а поведение — нет.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { DataIcon, Icon, type IconName } from "../src/components/Icon";

const SOURCE = readFileSync(new URL("../src/components/Icon.tsx", import.meta.url), "utf8");

/** Имена из объявления `PATHS` — разбор как в noEmoji.test.ts, но только внутри
 *  самого объекта: иначе в список попадает и поле `name:` из пропсов. */
const PATHS_BLOCK = SOURCE.slice(SOURCE.indexOf("const PATHS"), SOURCE.indexOf("\n};", SOURCE.indexOf("const PATHS")));
const NAMES = (PATHS_BLOCK.match(/^\s{2}([a-z]+):\s/gm) ?? []).map((m) => m.trim().replace(":", "")) as IconName[];

/** Имена из союза `IconName` — второй, независимый источник. */
const UNION = [...(SOURCE.match(/export type IconName =([^;]+);/)?.[1] ?? "").matchAll(/"([a-z]+)"/g)]
  .map((m) => m[1]);

const render = (name: IconName, title?: string) =>
  renderToStaticMarkup(createElement(Icon, { name, title }));

/** Содержимое между `<svg …>` и `</svg>` без `<title>`. */
const body = (markup: string) =>
  markup.replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "").replace(/<title>.*?<\/title>/, "");

test("разбор исходника видит все значки — иначе проверки ниже проверяют пустоту", () => {
  assert.ok(NAMES.length > 40, `в PATHS нашлось только ${NAMES.length}`);
  assert.deepEqual([...NAMES].sort(), [...UNION].sort(),
    "список значков в PATHS и в типе IconName разошёлся — разбор сломан");
});

test("каждое имя рисует <svg> с геометрией внутри", () => {
  // Пустой <svg> — самый тихий сбой из возможных: место под значок есть,
  // значка нет, и ни типы, ни сборка этого не заметят.
  const empty: string[] = [];
  for (const name of NAMES) {
    const markup = render(name);
    assert.match(markup, /^<svg[\s>]/, `${name}: корень не <svg>`);
    if (!/<(path|circle|rect|ellipse|line|polyline|polygon)\b/.test(body(markup))) empty.push(name);
  }
  assert.deepEqual(empty, [], `пустые значки: ${empty.join(", ")}`);
});

test("два разных имени не рисуют одну и ту же картинку", () => {
  // Копия чужой геометрии под новым именем — значок, который «есть», но
  // показывает другой предмет.
  const seen = new Map<string, string>();
  const clones: string[] = [];
  for (const name of NAMES) {
    const b = body(render(name));
    if (seen.has(b)) clones.push(`${name} = ${seen.get(b)}`);
    else seen.set(b, name);
  }
  assert.deepEqual(clones, []);
});

test("без подписи значок немой: aria-hidden, без роли и без имени", () => {
  for (const name of NAMES) {
    const markup = render(name);
    assert.match(markup, /aria-hidden="true"/, `${name}: диктор прочтёт декоративный значок`);
    assert.ok(!/\brole=/.test(markup), `${name}: у декоративного значка роль`);
    assert.ok(!/aria-label=/.test(markup), `${name}: у декоративного значка имя`);
    assert.ok(!markup.includes("<title>"), `${name}: у декоративного значка всплывающая подсказка`);
    // Старые IE/Edge ставили SVG в порядок Tab; значок не должен ловить фокус.
    assert.match(markup, /focusable="false"/);
  }
});

test("с подписью значок — картинка с доступным именем", () => {
  for (const [lang, title] of [["ru", "Сменить тему"], ["en", "Switch theme"]] as const) {
    const markup = render("moon", title);
    assert.match(markup, /role="img"/, `${lang}: значок с подписью не назван картинкой`);
    assert.ok(markup.includes(`aria-label="${title}"`), `${lang}: доступного имени нет`);
    assert.ok(markup.includes(`<title>${title}</title>`), `${lang}: нет всплывающей подписи`);
    assert.ok(!/aria-hidden/.test(markup), `${lang}: значок с именем спрятан от диктора`);
  }
});

test("подпись экранируется, а не вклеивается разметкой", () => {
  const markup = render("warning", `Цена <b>"86"</b> & выше`);
  assert.ok(!markup.includes("<b>"), "подпись попала в разметку как HTML");
  assert.ok(markup.includes("&lt;b&gt;"));
});

test("значок по имени из данных рисует тот же значок, что и прямой вызов", () => {
  for (const name of NAMES) {
    assert.equal(renderToStaticMarkup(createElement(DataIcon, { name })), render(name), name);
  }
});

test("неизвестное имя из данных даёт нейтральную метку, а не падение экрана", () => {
  // Сценарии и блоки курса хранят ИМЯ значка строкой. Опечатка в данных или
  // значок с сервера новее клиента не имеют права ронять каталог.
  const fallback = render("target");
  for (const name of ["", "unknown-icon", "Flame", "flame ", "handshake2"]) {
    let markup = "";
    assert.doesNotThrow(() => { markup = renderToStaticMarkup(createElement(DataIcon, { name })); }, `«${name}»`);
    assert.equal(markup, fallback, `«${name}»: вместо нейтральной метки нарисовано другое`);
  }
});

test("имя из данных, совпавшее со свойством объекта, тоже даёт нейтральную метку", {
  todo: "components/Icon.tsx:140 проверяет `name in PATHS`, а `in` видит цепочку прототипов: " +
        "«constructor»/«toString» рисуют пустой <svg>, «__proto__» роняет рендер " +
        "(Objects are not valid as a React child); нужен Object.hasOwn",
}, () => {
  const fallback = render("target");
  for (const name of ["constructor", "toString", "hasOwnProperty", "__proto__"]) {
    let markup = "";
    assert.doesNotThrow(() => { markup = renderToStaticMarkup(createElement(DataIcon, { name })); }, `«${name}»`);
    assert.equal(markup, fallback, `«${name}»: пустой значок вместо нейтральной метки`);
  }
});
