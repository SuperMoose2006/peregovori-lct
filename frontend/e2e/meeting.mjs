// meeting.mjs — встреча с крупным собеседником в настоящем браузере.
//
// ЗАПУСКАЕТСЯ ПРОТИВ СТЕНДА, а не против продукта: встреча строится вокруг
// звучащего собеседника, а офлайн звука нет. Стенд — синтетический звук и
// синтетические кадры, оба только по явной настройке:
//
//   cd services/gateway && NEGO_AI=off NEGO_TTS=testtone NEGO_AVATAR_PROVIDER=testcard \
//     NEGO_FRONTEND_DIST=/tmp/meeting-dist .venv/bin/uvicorn app.main:app --port 8033
//   (cd frontend && npx vite build --outDir /tmp/meeting-dist)
//   node e2e/meeting.mjs --url http://127.0.0.1:8033 --out /tmp/e2e-meeting
//
// Что доказывается: встреча появляется только в тренировке с голосом; лицо
// идёт кадрами по звуку и возвращается к портрету ТОГО ЖЕ персонажа, а не к
// рисованной замене; «перебить» глушит речь и кадры; сцена видна на 390 px и
// после фокуса в поле ввода; управление доступно с клавиатуры; экзамен
// встречи не получает; после «Завершить» соединения закрыты.
// Что НЕ доказывается: настоящая клавиатура телефона, живой микрофон,
// задержки внешней модели видео — стенд их не имеет.
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";
import { browserExecutable } from "./browser.mjs";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};
const URL = arg("url", "http://127.0.0.1:8033");
const OUT = arg("out", "/tmp/e2e-meeting");
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

async function open({ width = 1440, height = 900, theme = "light", lang = "ru", reduced = false,
                      layers = { voice: true, avatar: true } } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, colorScheme: theme,
    reducedMotion: reduced ? "reduce" : "no-preference", permissions: ["microphone"] });
  const page = await ctx.newPage();
  const errors = [];
  const sockets = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" && !/404|501/.test(m.text())) errors.push(m.text()); });
  page.on("websocket", (ws) => { const s = { url: ws.url(), closed: false }; sockets.push(s); ws.on("close", () => { s.closed = true; }); });
  await page.addInitScript(({ theme, lang, layers }) => {
    localStorage.setItem("dialog.tutorialDone.v1", "1"); localStorage.setItem("dialog.tours.v1", '{"enabled":false}');
    localStorage.setItem("dialog.theme.v1", theme);
    localStorage.setItem("dialog.lang.v1", lang);
    localStorage.setItem("dialog.layers.v1", JSON.stringify(layers));
  }, { theme, lang, layers });
  await page.goto(URL, { waitUntil: "networkidle" });
  return { ctx, page, errors, sockets };
}

const face = (page) => page.evaluate(() => ({
  source: document.querySelector(".mt-face .face")?.getAttribute("data-source") ?? null,
  status: document.querySelector(".meeting")?.getAttribute("data-status") ?? null,
}));

async function startPractice(page) {
  await page.locator('[data-scenario="supplier"]').first().click();
  await page.waitForSelector("textarea", { timeout: 15000 });
}

async function say(page, text) {
  const box = page.locator("textarea:visible").first();
  await box.fill(text);
  await box.press("Enter");
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

// 1. Десктоп, светлая, RU: полный ход, кадры по звуку, перебивание, завершение.
{
  const { ctx, page, errors, sockets } = await open();
  await startPractice(page);
  check(await page.locator(".meeting").count() === 1, "встреча появилась в тренировке с голосом");
  check((await page.locator(".mt-test").textContent())?.includes("Тестовый"), "стенд подписан как тестовый поток");
  await page.screenshot({ path: `${OUT}/01-desk-light-start.png` });
  await say(page, "Что для вас важнее всего в этой поставке, кроме цены?");
  const seen = await watch(page, 5000);
  check(seen.sources.has("frame"), "во время речи лицо рисуют кадры по звуку", [...seen.sources].join(","));
  check(!seen.sources.has("drawn") && !seen.sources.has("loop"),
    "между кадрами — портрет того же персонажа, без рисованной замены", [...seen.sources].join(","));
  check(seen.statuses.has("speaking") && seen.statuses.has("thinking"), "строка состояния прошла «думает → говорит»",
    [...seen.statuses].join(","));
  await page.screenshot({ path: `${OUT}/02-desk-light-after-turn.png` });

  // Перебивание: второй ход, и сразу «перебить», как только зазвучит.
  await say(page, "Давайте опираться на рыночные данные: медиана независимых прайсов — 87.");
  let cut = false;
  for (let i = 0; i < 60 && !cut; i++) {
    if ((await face(page)).status === "speaking" && await page.locator(".mt-btn.cut").count()) {
      await page.locator(".mt-btn.cut").click();
      cut = true;
    }
    await page.waitForTimeout(100);
  }
  check(cut, "кнопка «перебить» появилась, пока собеседник говорит");
  await page.waitForTimeout(600);
  const after = await watch(page, 1500);
  check(!after.statuses.has("speaking"), "после «перебить» собеседник молчит", [...after.statuses].join(","));
  check(!after.sources.has("frame"), "после «перебить» кадры погашенной речи не рисуются", [...after.sources].join(","));
  check(await page.locator("textarea:visible").isEnabled(), "после перебивания следующий ход разрешён");

  // «Ответить текстом» ставит фокус в поле ввода.
  await page.locator(".mt-btn", { hasText: "Ответить текстом" }).click();
  check(await page.evaluate(() => document.activeElement?.tagName === "TEXTAREA"), "«Ответить текстом» ведёт в поле ввода");

  // Клавиатура: кнопки встречи достижимы Tab'ом и получают видимый фокус.
  // Именно Tab, а не `focus()`: после кликов мышью программный фокус
  // `:focus-visible` не включает — и не должен.
  let reached = false;
  for (let i = 0; i < 80 && !reached; i++) {
    await page.keyboard.press("Tab");
    reached = await page.evaluate(() => document.activeElement?.classList.contains("mt-btn") ?? false);
  }
  check(reached, "кнопки встречи достижимы с клавиатуры");
  const ring = await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle);
  check(ring !== "none", "у кнопок встречи видимый фокус", ring);

  // Завершить → домой, соединения закрыты.
  await page.locator(".mt-btn.end").click();
  await page.waitForTimeout(800);
  check(await page.locator(".meeting").count() === 0, "«Завершить» уводит со стола");
  check(sockets.length > 0 && sockets.every((s) => s.closed), "после завершения все соединения закрыты",
    `${sockets.filter((s) => !s.closed).length} открыто из ${sockets.length}`);
  check(errors.length === 0, "десктоп: без ошибок в консоли", errors.slice(0, 3).join(" | "));
  await ctx.close();
}

// 2. Телефон 390×844, тёмная: сцена видна и после фокуса в поле ввода, вбок не уезжает.
{
  const { ctx, page, errors } = await open({ width: 390, height: 844, theme: "dark" });
  await startPractice(page);
  await page.screenshot({ path: `${OUT}/03-mobile-dark-start.png` });
  await say(page, "Что для вас важнее всего в этой поставке, кроме цены?");
  await page.waitForTimeout(2500);
  await page.locator("textarea:visible").first().focus();
  await page.waitForTimeout(300);
  const m = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth,
    stageTop: document.querySelector(".meeting").getBoundingClientRect().top,
    stageBottom: document.querySelector(".mt-stage").getBoundingClientRect().bottom,
    small: [...document.querySelectorAll(".mt-btn")].filter((b) => {
      const r = b.getBoundingClientRect(); return r.width < 44 || r.height < 44; }).length,
    names: [...document.querySelectorAll(".mt-btn")].map((b) => b.textContent.trim()).filter(Boolean).length,
  }));
  check(m.scrollW <= m.clientW, "390: страница не уезжает вбок", `${m.scrollW} > ${m.clientW}`);
  check(m.stageTop >= -1 && m.stageBottom > 100, "390: собеседник виден и после фокуса в поле ввода",
    `top=${Math.round(m.stageTop)} bottom=${Math.round(m.stageBottom)}`);
  check(m.small === 0, "390: цели нажатия кнопок встречи не меньше 44 px", `${m.small} мельче`);
  check(m.names === await page.locator(".mt-btn").count(), "390: у значков-кнопок есть доступные имена");
  await page.screenshot({ path: `${OUT}/04-mobile-dark-turn.png` });
  check(errors.length === 0, "телефон: без ошибок в консоли", errors.slice(0, 3).join(" | "));
  await ctx.close();
}

// 3. Английский и reduced-motion: подписи по-английски, ролика нет, точка не мигает.
{
  const { ctx, page, errors } = await open({ lang: "en", reduced: true });
  await page.locator('[data-scenario="supplier"]').first().click();
  await page.waitForSelector(".meeting", { timeout: 15000 });
  const text = await page.locator(".meeting").innerText();
  check(!/[А-Яа-яЁё]/.test(text.replace(/Ирина|Irina/g, "")), "EN: на сцене нет русских слов", text.slice(0, 120));
  const src = (await face(page)).source;
  check(src !== "loop", "reduced-motion: ролик состояния не крутится", String(src));
  await page.screenshot({ path: `${OUT}/05-desk-en-reduced.png` });
  check(errors.length === 0, "EN: без ошибок в консоли", errors.slice(0, 3).join(" | "));
  await ctx.close();
}

// 4. Экзамен с теми же настройками профиля: встречи нет, лицо неподвижно.
{
  const { ctx, page, errors } = await open();
  await page.locator('[data-nav="exam"]').first().click();
  await page.waitForTimeout(500);
  await page.locator(".exam-name input").fill("E2E");
  await page.locator('[data-scenario="supplier"]').first().click();
  await page.waitForSelector("textarea", { timeout: 15000 });
  check(await page.locator(".meeting").count() === 0, "экзамен: встречи нет, хотя голос включён в профиле");
  await page.screenshot({ path: `${OUT}/06-exam.png` });
  check(errors.length === 0, "экзамен: без ошибок в консоли", errors.slice(0, 3).join(" | "));
  await ctx.close();
}

// 5. Без голоса в профиле: обычный стол, встречи нет.
{
  const { ctx, page } = await open({ layers: {} });
  await startPractice(page);
  check(await page.locator(".meeting").count() === 0, "без голоса встречи нет — обычный стол");
  await ctx.close();
}

await browser.close();
for (const p of passed) console.log("  ✓ " + p);
for (const p of problems) console.log("  ✗ " + p);
console.log(problems.length ? `ПРОВАЛ (${problems.length}) · снимки: ${OUT}` : `ПРОЙДЕНО (${passed.length}) · снимки: ${OUT}`);
process.exit(problems.length ? 1 : 0);
