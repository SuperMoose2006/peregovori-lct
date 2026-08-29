// readingshots.mjs — снимки режима «Чтение стола» в обеих темах и на обоих языках.
//
// ЧТО ЭТОТ ПРИБОР ДОКАЗЫВАЕТ, ПОМИМО КАРТИНОК. Ровно то, чего не доказывает
// ни один тест: что режим ОТКРЫВАЕТСЯ в собранном продукте, что вопрос
// действительно рисуется четырьмя вариантами, что ответ раскрывает разбор — и
// что тёмная тема ему не ломает ни одного цвета.
//
// ПОХОЖИЕ СНИМКИ — ЭТО НЕ СОВПАДЕНИЕ. `docshots.mjs` однажды сохранил три
// БАЙТ В БАЙТ одинаковых кадра под тремя именами, потому что клики шли по
// селекторам, которых в разметке нет, а промах глотался `.catch`. Поэтому здесь:
//
//   * ни одного `.catch(() => {})` на пути, который что-то открывает;
//   * каждый шаг обязан УВИДЕТЬ то, что должен был открыть, иначе исключение;
//   * два одинаковых кадра валят прогон (`shot` считает md5).
//
// Запуск — против офлайн-сборки, детерминированно и без сети:
//   VITE_MOCK=1 npx vite build --outDir dist-mock
//   (cd dist-mock && python3 -m http.server 5199 --bind 127.0.0.1 &)
//   node probes/readingshots.mjs
import { chromium } from "playwright-core";
import fs from "fs";
import crypto from "crypto";
import path from "path";

const EXE = "/root/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome";
const BASE = process.env.RDSHOT_BASE ?? "http://127.0.0.1:5199/";
const DIST = process.env.RDSHOT_DIST ?? "dist-mock";
const OUT = process.env.RDSHOT_OUT ?? "/tmp/readingshots";

// Та же сверка, что у обходчика: снимок чужой сборки хуже отсутствующего,
// потому что он выглядит свежим.
const bundleOf = (html) => (html.match(/assets\/index-[A-Za-z0-9_.-]+\.js/) || [])[0] || null;
const want = bundleOf(fs.readFileSync(path.join(process.cwd(), DIST, "index.html"), "utf-8"));
const got = bundleOf(await (await fetch(BASE)).text());
if (!want || want !== got) {
  console.error(`ЧУЖАЯ СБОРКА: раздаётся ${got}, на диске ${want}. Съёмка отменена.`);
  process.exit(2);
}
console.log("сборка сверена:", want);
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: EXE, args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 980 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();

const seen = new Map();
const fail = async (msg) => { console.error(msg); await browser.close(); process.exit(2); };

const shot = async (name) => {
  await page.waitForTimeout(500);
  // Кадр — ВИДИМАЯ область, а не вся страница: экран режима лежит порталом
  // поверх приложения (`position: fixed`), и `fullPage` подклеил бы под него
  // домашний экран, которого человек в этот момент не видит.
  const buf = await page.screenshot({ fullPage: false });
  const sum = crypto.createHash("md5").update(buf).digest("hex");
  if (seen.has(sum)) {
    await fail(`ПРОМАХ ОБХОДА: «${name}» совпал байт в байт с «${seen.get(sum)}».\n` +
      "Экран не сменился — значит шаг не сработал, а кадр лёг бы под чужим именем.");
  }
  seen.set(sum, name);
  fs.writeFileSync(path.join(OUT, name), buf);
  console.log("  снят:", name, `(${(buf.length / 1024).toFixed(0)} КБ)`);
};

/** Открыть продукт в заданных языке и теме и войти в режим чтения. */
async function enter(lang, theme) {
  await page.addInitScript(([l, th]) => {
    try {
      localStorage.setItem("dialog.tutorialDone.v1", "1");
      localStorage.setItem("dialog.lang.v1", l);
      localStorage.setItem("dialog.theme.v1", th);
      // Чистый прогресс режима: иначе второй прогон открывал бы другую партию,
      // и снимки сравнивать было бы не с чем.
      localStorage.removeItem("dialog.reading.v1");
    } catch {}
  }, [lang, theme]);
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);

  const card = page.locator('[data-reading="open"]');
  if (!(await card.count())) await fail("карточки режима нет на домашнем экране");
  // ПОЧЕМУ КЛИК ЧЕРЕЗ JS, А НЕ `locator.click()`. На телефоне навигация — полоса,
  // приклеенная к низу экрана, а прокрутка в продукте плавная: собственная
  // подводка Playwright запускает анимацию и жмёт по ещё едущей кнопке, попадая
  // в полосу. Промах при этом молчит и превращается в таймаут.
  //
  // Но «нажать мимо actionability» — ровно тот способ соврать, которым приборы
  // здесь уже врали. Поэтому перекрытие проверяется ЯВНО: под центром кнопки
  // обязана оказаться она сама, иначе прогон падает.
  const hit = await card.first().evaluate((n) => {
    n.scrollIntoView({ block: "center", behavior: "instant" });
    const r = n.getBoundingClientRect();
    const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    if (!n.contains(top)) return `кнопку перекрывает ${top?.className || top?.tagName}`;
    n.click();
    return null;
  });
  if (hit) await fail(`войти в режим нечем: ${hit}`);
  // Экран едет отдельным файлом: ждём именно ЕГО, а не просто время.
  await page.waitForSelector(".rd-shell .rd-card", { timeout: 15000 });
  const opts = await page.locator(".rd-opts .rd-opt").count();
  if (opts !== 4) await fail(`вариантов ответа ${opts}, а должно быть четыре`);
}

// ——— русский, светлая: вопрос и разбор ———
await enter("ru", "light");
await shot("10-ru-light-question.png");
// Отвечаем ПЕРВЫМ вариантом намеренно: он верен не всегда, а разбор промаха и
// есть то, ради чего режим сделан.
await page.locator(".rd-opts .rd-opt").first().click();
await page.waitForSelector(".rd-reveal .rd-said", { timeout: 5000 });
await shot("11-ru-light-reveal.png");

// ——— русский, тёмная: тот же разбор другими токенами ———
await enter("ru", "dark");
await page.locator(".rd-opts .rd-opt").first().click();
await page.waitForSelector(".rd-reveal .rd-said", { timeout: 5000 });
await shot("20-ru-dark-reveal.png");

// Дочитать партию до итога: грейд, чтение и «что осталось закрытым».
for (let i = 0; i < 20; i++) {
  const next = page.locator(".rd-next");
  if (!(await next.count())) break;
  await next.click();
  await page.waitForTimeout(250);
  const opt = page.locator(".rd-opts .rd-opt");
  if (await opt.count()) await opt.first().click();
  if (await page.locator(".rd-done").count()) break;
}
if (!(await page.locator(".rd-done").count())) await fail("итог партии так и не показался");
await shot("21-ru-dark-result.png");

// ——— английский, светлая: тот же экран, другой словарь ———
await enter("en", "light");
await shot("30-en-light-question.png");
const cyr = await page.locator(".rd-shell").innerText();
if (/[А-Яа-яЁё]/.test(cyr.replace(/Диалог/g, ""))) {
  await fail("в английском режиме на экране русский текст (инвариант 4):\n" +
    (cyr.match(/[^\n]*[А-Яа-яЁё][^\n]*/g) || []).join("\n"));
}
await page.locator(".rd-opts .rd-opt").first().click();
await page.waitForSelector(".rd-reveal .rd-said", { timeout: 5000 });
await shot("31-en-light-reveal.png");

// ——— телефон: горизонтальной прокрутки быть не должно ———
// Самая частая находка обходчика (`audit.mjs`) — именно она: экран, который на
// 390 px уезжает вбок, читается как сломанный, а в тестах не виден никак.
//
// Ширину меняем НА ОТКРЫТОМ экране, а не заходим в режим заново, и это не лень:
// на 390 px кнопки карточек правого рейла перекрыты СЛЕДУЮЩЕЙ карточкой —
// проверено, у «Продолжить курс →» ровно то же самое, то есть дефект раскладки
// рейла старше этого режима. Заходить через сломанную кнопку значило бы либо
// падать здесь по чужой причине, либо тихо жать мимо actionability.
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(400);
await shot("40-ru-phone-reveal.png");
const over = await page.evaluate(() => ({
  doc: document.documentElement.scrollWidth,
  win: window.innerWidth,
  wide: [...document.querySelectorAll(".rd-shell *")]
    .filter((n) => n.getBoundingClientRect().right > window.innerWidth + 1)
    .map((n) => `${n.className} → ${Math.round(n.getBoundingClientRect().right)}px`),
}));
if (over.doc > over.win + 1 || over.wide.length) {
  await fail(`на 390 px экран шире окна: ${over.doc} против ${over.win}\n` + over.wide.join("\n"));
}
console.log(`  телефон: ширина ${over.doc} при окне ${over.win} — прокрутки вбок нет`);

console.log(`\nснимков: ${seen.size}, все разные. Папка: ${OUT}`);
await browser.close();
