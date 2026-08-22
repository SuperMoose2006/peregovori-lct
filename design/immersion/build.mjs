// build.mjs — собирает .dc.html из общей палитры (_chrome.css) и тела (parts/*.html).
//
// Палитра вынесена, потому что она не выдумана: значения подняты из
// frontend/src/styles.css (скин «Игра», светлая тема) и обязаны совпадать с
// приложением попиксельно. Держать её в десяти копиях руками — гарантировать
// расхождение на первой же правке.
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const chrome = readFileSync("_chrome.css", "utf8");

// Nunito ВСТРАИВАЕТСЯ, а не линкуется с fonts.googleapis.com. Две причины, и
// обе проверены руками:
//   1. Приложение само хостит эти файлы ровно по этой причине — «демо на
//      площадке не должно ждать fonts.gstatic.com, чтобы отрисоваться»
//      (frontend/src/styles.css, шапка). Макет, который ждёт сеть, спорил бы
//      с решением, который он показывает.
//   2. Без сети ссылка не резолвится, и артборд ВООБЩЕ не монтируется —
//      рантайм ждёт стилевой лист вечно. Проверено: тот же артборд без ссылки
//      рисуется, со ссылкой висит на «Loading artboard…».
// Берём те же самые файлы, что грузит продукт: буква в макете и буква в
// приложении — один и тот же контур.
const FONT_DIR = "../../frontend/public/fonts";
const face = (file, range) =>
  `@font-face{font-family:"Nunito";font-style:normal;font-weight:400 900;font-display:swap;` +
  `src:url(data:font/woff2;base64,${readFileSync(join(FONT_DIR, file)).toString("base64")}) format("woff2");` +
  `unicode-range:${range}}`;
const FONT = "<style>" + face("nunito-cyrillic.woff2",
    "U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116") +
  face("nunito-latin.woff2",
    "U+0000-00FF,U+0131,U+0152-0153,U+2000-206F,U+20AC,U+2122,U+2212,U+FEFF,U+FFFD") +
  "</style>";

for (const f of readdirSync("parts").filter((n) => n.endsWith(".html"))) {
  const name = f.replace(/\.html$/, "");
  const raw = readFileSync(join("parts", f), "utf8");
  const [head, body] = raw.includes("<!--SPLIT-->") ? raw.split("<!--SPLIT-->") : ["", raw];
  const out = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  ${FONT}
  <style>
${chrome}${head.trim() ? "\n" + head.trim() + "\n" : ""}  </style>
</helmet>
${body.trim()}
</x-dc>
</body>
</html>
`;
  writeFileSync(`${name}.dc.html`, out);
  console.log(`${name}.dc.html`);
}
