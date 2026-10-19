// appIcon.test.ts — значок вкладки и приложения разбирается браузером.
//
// SVG — это XML, а в XML внутри комментария два дефиса подряд запрещены. В
// комментарии значка стояло «--brass» (имя переменной из styles.css), и
// Chrome не рисовал такой файл вовсе: `new Image()` с ним падает в onerror.
// Ссылка на /icon.svg — первая в index.html и первая в манифесте, так что
// вместо значка вкладка показывала пустое место. Глазами в редакторе это не
// видно, а другого читателя у файла нет.
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";

const PUBLIC = new URL("../public/", import.meta.url);

test("в комментариях SVG нет двух дефисов подряд", () => {
  const files = readdirSync(PUBLIC, { recursive: true }).map(String).filter((f) => f.endsWith(".svg"));
  assert.ok(files.includes("icon.svg"), "значок не найден — обход сломан");
  const bad: string[] = [];
  for (const f of files) {
    const svg = readFileSync(new URL(f, PUBLIC), "utf-8");
    for (const [, body] of svg.matchAll(/<!--([\s\S]*?)-->/g)) {
      if (body.includes("--")) bad.push(`${f}: ${body.trim().slice(0, 80)}`);
    }
  }
  assert.deepEqual(bad, [], bad.join("\n"));
});
