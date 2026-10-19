// call.mjs — созвон в настоящем браузере: текст и голос как два режима партии.
//
// ЗАПУСКАЕТСЯ ПРОТИВ СТЕНДА, а не против продукта: созвон строится вокруг
// звучащего собеседника, а офлайн звука нет. Стенд — синтетический звук и
// синтетические кадры, оба только по явной настройке. `NEGO_AI=off` здесь
// НЕЛЬЗЯ: без сети health честно говорит «голос недоступен», и кнопка
// «Созвон» стоит запертой (lib/layers.ts::withServer). Ключей у стенда нет —
// реплики идут шаблонами движка, распознавания нет — ход в звонке уходит
// текстом в сокет созвона (call-helpers.mjs).
//
//   cd services/gateway && NEGO_TTS=testtone NEGO_AVATAR_PROVIDER=testcard \
//     NEGO_FRONTEND_DIST=/tmp/call-dist .venv/bin/uvicorn app.main:app --port 8033
//   (cd frontend && npx vite build --outDir /tmp/call-dist)
//   node e2e/call.mjs --url http://127.0.0.1:8033 --out /tmp/e2e-call
//
// Что доказывается: партия начинается чатом без микрофона; «Созвон» уводит на
// экран звонка с тем же ходом и без поля ввода; лицо идёт кадрами по звуку и
// возвращается к портрету того же персонажа; «перебить» глушит речь и кадры;
// «Завершить» возвращает в чат с той же лентой, старый сокет закрыт; кнопки
// звонка доступны с клавиатуры и на 390 px; экзамен кнопки не получает.
// Что НЕ доказывается: живой микрофон и распознавание, настоящая клавиатура
// телефона, задержки внешней модели видео — стенд их не имеет.
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";
import { browserExecutable } from "./browser.mjs";
import { enterCall, leaveCall, routeRealtime } from "./call-helpers.mjs";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};
const URL = arg("url", "http://127.0.0.1:8033");
const OUT = arg("out", "/tmp/e2e-call");
mkdirSync(OUT, { recursive: true });

const problems = [];
const passed = [];
const check = (ok, name, detail = "") => (ok ? passed : problems).push(detail ? `${name} — ${detail}` : name);

const health = await (await fetch(`${URL}/api/health`)).json();
if (!String(health.tts ?? "").startsWith("testtone")) {
  console.error("стенд не поднят: /api/health.tts должен быть testtone (см. шапку файла)");
  process.exit(2);
}

const browser = await chromium.launch({
  executablePath: browserExecutable(),
  args: ["--autoplay-policy=no-user-gesture-required",
         "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
});

async function open({ width = 1440, height = 900, theme = "light", lang = "ru", reduced = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, colorScheme: theme,
    reducedMotion: reduced ? "reduce" : "no-preference", permissions: ["microphone"] });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" && !/404|501/.test(m.text())) errors.push(m.text()); });
  const wire = await routeRealtime(page);
  await page.addInitScript(({ theme, lang }) => {
    localStorage.setItem("dialog.tutorialDone.v1", "1"); localStorage.setItem("dialog.tours.v1", '{"enabled":false}');
    localStorage.setItem("dialog.theme.v1", theme);
    localStorage.setItem("dialog.lang.v1", lang);
    localStorage.setItem("dialog.layers.v1", JSON.stringify({ avatar: true, probe: false }));
  }, { theme, lang });
  await page.goto(URL, { waitUntil: "networkidle" });
  return { ctx, page, errors, wire };
}

const face = (page) => page.evaluate(() => ({
  source: document.querySelector(".call-face .face")?.getAttribute("data-source") ?? null,
  status: document.querySelector(".call")?.getAttribute("data-status") ?? null,
}));

async function startPractice(page) {
  await page.locator('[data-scenario="supplier"]').first().click();
  await page.waitForSelector("textarea", { timeout: 15000 });
}

async function type(page, text) {
  const box = page.locator("textarea:visible").first();
  await box.fill(text);
  await box.press("Enter");
  await page.waitForFunction(() => !document.querySelector(".typing-msg"), null, { timeout: 15000 });
  await page.waitForTimeout(500);
}

async function watch(page, ms) {
  const seen = { sources: new Set(), statuses: new Set() };
  for (let t = 0; t < ms; t += 100) {
    const f = await face(page);
    seen.sources.add(f.source); seen.statuses.add(f.status);
    await page.waitForTimeout(100);
  }
  return seen;
}

// 1. Десктоп, светлая, RU: чат → созвон → ход звуком → перебивание → чат.
{
  const { ctx, page, errors, wire } = await open();
  await startPractice(page);
  check(await page.locator(".call").count() === 0, "партия начинается чатом, а не звонком");
  check(await page.locator(".livebar").count() === 0, "в чате нет полосы микрофона");
  await type(page, "Что для вас важнее всего в этой поставке, кроме цены?");
  const before = await page.locator(".log > .msg").count();

  await enterCall(page);
  check(wire.servers.length === 2, "созвон — новый сокет той же партии", String(wire.servers.length));
  check(await page.locator(".call textarea").count() === 0, "в созвоне нет поля ввода");
  check((await page.locator(".call-turn").textContent())?.includes("1"), "созвон начался с того же хода");
  check(await page.locator(".call-top .hud").count() === 1 && await page.locator(".call-price").count() === 1,
    "шкалы и цена видны над звонком");
  check((await page.locator(".mt-test").textContent())?.includes("Тестовый"), "стенд подписан как тестовый поток");
  await page.screenshot({ path: `${OUT}/01-desk-light-call.png` });

  wire.say("Давайте опираться на рыночные данные: медиана независимых прайсов — 87.");
  const seen = await watch(page, 5000);
  check(seen.sources.has("frame"), "во время речи лицо рисуют кадры по звуку", [...seen.sources].join(","));
  check(!seen.sources.has("drawn") && !seen.sources.has("loop"),
    "между кадрами — портрет того же персонажа, без рисованной замены", [...seen.sources].join(","));
  check(seen.statuses.has("speaking"), "строка состояния дошла до «говорит»", [...seen.statuses].join(","));
  await page.screenshot({ path: `${OUT}/02-desk-light-speaking.png` });

  wire.say("Если закрепим объём на год, какую цену вы дадите?");
  let cut = false;
  for (let i = 0; i < 80 && !cut; i++) {
    if ((await face(page)).status === "speaking" && await page.locator(".call-bar .cb.cut").count()) {
      await page.locator(".call-bar .cb.cut").click();
      cut = true;
    }
    await page.waitForTimeout(100);
  }
  check(cut, "кнопка «перебить» появилась, пока собеседник говорит");
  await page.waitForTimeout(600);
  const after = await watch(page, 1500);
  check(!after.statuses.has("speaking"), "после «перебить» собеседник молчит", [...after.statuses].join(","));
  check(!after.sources.has("frame"), "после «перебить» кадры погашенной речи не рисуются", [...after.sources].join(","));

  // Клавиатура: кнопки звонка достижимы Tab'ом и получают видимый фокус.
  let reached = false;
  for (let i = 0; i < 40 && !reached; i++) {
    await page.keyboard.press("Tab");
    reached = await page.evaluate(() => document.activeElement?.classList.contains("cb") ?? false);
  }
  check(reached, "кнопки звонка достижимы с клавиатуры");
  const ring = await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle);
  check(ring !== "none", "у кнопок звонка видимый фокус", ring);
  const hidden = await page.evaluate(() => getComputedStyle(document.querySelector(".sidenav")).visibility);
  check(hidden === "hidden", "меню под звонком убрано и из обхода", hidden);

  await page.locator(".call-bar .cb", { hasText: "Ход переговоров" }).click();
  check(await page.locator(".call-feed .log > .msg").count() >= before, "в панели — та же лента");
  await page.screenshot({ path: `${OUT}/03-desk-light-feed.png` });

  await leaveCall(page);
  await page.waitForSelector("textarea:visible", { timeout: 15000 });
  check(await page.locator(".log > .msg").count() >= before, "после «Завершить» лента та же, что до звонка");
  check(await page.locator(".log .sys", { hasText: "Созвон завершён" }).count() === 1, "граница звонка видна в ленте");
  check(await page.locator(".conn-banner").count() === 0, "смена режима не объявлена обрывом связи");
  check(wire.servers.length === 3, "выход из звонка — снова та же партия новым сокетом", String(wire.servers.length));
  const inChat = await page.locator(".log > .msg").count();
  await type(page, "Хорошо, тогда давайте обсудим сроки оплаты.");
  check(await page.locator(".log > .msg").count() >= inChat + 2, "партия идёт дальше в чате: ход и ответ");
  check(errors.length === 0, "десктоп: без ошибок в консоли", errors.slice(0, 3).join(" | "));
  await ctx.close();
}

// 2. Телефон 390×844, тёмная: звонок не уезжает вбок, кнопки крупные и с именами.
{
  const { ctx, page, errors, wire } = await open({ width: 390, height: 844, theme: "dark" });
  await startPractice(page);
  await page.screenshot({ path: `${OUT}/04-mobile-dark-chat.png` });
  await enterCall(page);
  wire.say("Что для вас важнее всего в этой поставке, кроме цены?");
  await page.waitForTimeout(2500);
  const m = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth,
    small: [...document.querySelectorAll(".call-bar .cb")].filter((b) => {
      const r = b.getBoundingClientRect(); return r.width < 44 || r.height < 44; }).length,
    names: [...document.querySelectorAll(".call-bar .cb")].map((b) => b.textContent.trim()).filter(Boolean).length,
  }));
  check(m.scrollW <= m.clientW, "390: звонок не уезжает вбок", `${m.scrollW} > ${m.clientW}`);
  check(m.small === 0, "390: цели нажатия кнопок звонка не меньше 44 px", `${m.small} мельче`);
  check(m.names === await page.locator(".call-bar .cb").count(), "390: у значков-кнопок есть доступные имена");
  await page.screenshot({ path: `${OUT}/05-mobile-dark-call.png` });
  check(errors.length === 0, "телефон: без ошибок в консоли", errors.slice(0, 3).join(" | "));
  await ctx.close();
}

// 3. Английский и reduced-motion: подписи по-английски, ролика нет.
{
  const { ctx, page, errors } = await open({ lang: "en", reduced: true });
  await startPractice(page);
  await enterCall(page);
  const text = await page.locator(".call").innerText();
  check(!/[А-Яа-яЁё]/.test(text.replace(/Ирина|Irina/g, "")), "EN: в звонке нет русских слов", text.slice(0, 120));
  const src = (await face(page)).source;
  check(src !== "loop", "reduced-motion: ролик состояния не крутится", String(src));
  await page.screenshot({ path: `${OUT}/06-desk-en-reduced.png` });
  check(errors.length === 0, "EN: без ошибок в консоли", errors.slice(0, 3).join(" | "));
  await ctx.close();
}

// 4. Экзамен: кнопки «Созвон» нет — партия на зачёт идёт без слоёв.
{
  const { ctx, page, errors } = await open();
  await page.locator('[data-nav="exam"]').first().click();
  await page.waitForTimeout(500);
  await page.locator(".exam-name input").fill("E2E");
  await page.locator('[data-scenario="supplier"]').first().click();
  await page.waitForSelector("textarea", { timeout: 15000 });
  check(await page.locator(".call-go").count() === 0, "экзамен: кнопки «Созвон» нет");
  await page.screenshot({ path: `${OUT}/07-exam.png` });
  check(errors.length === 0, "экзамен: без ошибок в консоли", errors.slice(0, 3).join(" | "));
  await ctx.close();
}

await browser.close();
for (const p of passed) console.log("  ✓ " + p);
for (const p of problems) console.log("  ✗ " + p);
console.log(problems.length ? `ПРОВАЛ (${problems.length}) · снимки: ${OUT}` : `ПРОЙДЕНО (${passed.length}) · снимки: ${OUT}`);
process.exit(problems.length ? 1 : 0);
