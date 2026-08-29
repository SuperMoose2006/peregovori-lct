// _mascotshots.mjs — снимки экранов, куда добавлены маскоты.
//
// ЗАЧЕМ ОТДЕЛЬНЫЙ ПРИБОР. Обходчик (audit.mjs) ходит по 25 состояниям и мерит
// WCAG; docshots.mjs снимает пять кадров для документации. Ни тот, ни другой не
// доходит до состояний, которые появляются ТОЛЬКО при определённом профиле
// (серия прервана, длинный перерыв) или при отказе сети (кусок экрана не
// приехал). Их надо подстроить руками — и снять.
//
// ДВА ПРАВИЛА, ОБА ИЗ ОДНОГО УРОКА. docshots.mjs однажды сохранил три БАЙТ В
// БАЙТ одинаковых кадра под тремя именами: клики шли по селекторам, которых в
// разметке нет, промах глотался `.catch`. Поэтому здесь:
//
//   1. одинаковый кадр под другим именем — падение, а не снимок;
//   2. каждый снимок объявляет, ЧТО на нём должно быть видно (селектор и, если
//      это маскот, точная поза в `src` картинки). Не совпало — падение.
//
// Второе правило важнее первого: два разных кадра могут отличаться на один
// пиксель шкалы и при этом оба показывать не то, что заявлено.
import { chromium } from "playwright-core";
import fs from "fs";
import crypto from "crypto";
import path from "path";

const EXE = "/root/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome";
const BASE = process.env.SHOT_BASE ?? "http://127.0.0.1:5199/";
const OUT = process.env.SHOT_OUT ?? "/tmp/mascot-shots";
fs.mkdirSync(OUT, { recursive: true });

// Та же сверка свежести, что у остальных приборов: снимок чужой сборки хуже
// отсутствующего, потому что выглядит свежим.
const bundleOf = (html) => (html.match(/assets\/index-[A-Za-z0-9_.-]+\.js/) || [])[0] || null;
const want = bundleOf(fs.readFileSync(path.join(process.cwd(), "dist-mock", "index.html"), "utf-8"));
const got = bundleOf(await (await fetch(BASE)).text());
if (!want || want !== got) {
  console.error(`ЧУЖАЯ СБОРКА: раздаётся ${got}, на диске ${want}. Съёмка отменена.`);
  process.exit(2);
}
console.log("сборка сверена:", want);

const browser = await chromium.launch({ executablePath: EXE, args: ["--no-sandbox"] });

const seen = new Map();
let failures = 0;

const day = (offset) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const profile = (over = {}) => JSON.stringify({
  version: 5, scenarios: {}, streak: 0, lastStreakDay: "", xp: 0,
  skills: {}, achievements: [], freezes: 0, dailyGoalTarget: 1,
  dailyDoneDay: "", dailyDoneCount: 0, celebratedMilestones: [], course: {}, campaigns: {},
  ...over,
});

/**
 * Один снимок.
 *
 * `expect` — список утверждений о разметке: `{ sel }` (узел обязан быть),
 * `{ sel, src }` (узел обязан быть картинкой с этой позой), `{ sel, text }`
 * (узел обязан содержать эту подстроку). Провал любого — красная строка и
 * ненулевой код выхода в конце: молча промахнуться прибор не должен.
 */
async function shot(page, name, expect = []) {
  await page.waitForTimeout(500);
  for (const e of expect) {
    const loc = page.locator(e.sel).first();
    if (!(await loc.count())) {
      console.error(`  ✗ ${name}: селектора «${e.sel}» на экране нет`);
      failures++;
      return;
    }
    if (e.src) {
      const src = await loc.getAttribute("src");
      if (!src || !src.includes(e.src)) {
        console.error(`  ✗ ${name}: ждали позу «${e.src}», в разметке «${src}»`);
        failures++;
        return;
      }
    }
    if (e.text) {
      const txt = (await loc.innerText()).replace(/\s+/g, " ");
      if (!txt.includes(e.text)) {
        console.error(`  ✗ ${name}: ждали текст «${e.text}», нашли «${txt.slice(0, 120)}»`);
        failures++;
        return;
      }
    }
  }
  const buf = await page.screenshot({ fullPage: true });
  const sum = crypto.createHash("md5").update(buf).digest("hex");
  if (seen.has(sum)) {
    console.error(`  ✗ ПРОМАХ ОБХОДА: «${name}» совпал байт в байт с «${seen.get(sum)}»`);
    failures++;
    return;
  }
  seen.set(sum, name);
  fs.writeFileSync(path.join(OUT, name + ".png"), buf);
  console.log(`  ✓ ${name}`);
}

/** Свежая вкладка с заданным профилем, темой и языком. */
async function open({ prof = profile(), theme = null, lang = "ru", init = null, width = 1440 } = {}) {
  const ctx = await browser.newContext({
    viewport: { width, height: 900 },
    deviceScaleFactor: 1,
    colorScheme: theme === "dark" ? "dark" : "light",
    // Service worker кеширует куски сборки И ОБХОДИТ page.route: с ним отказ
    // куска подделать нельзя — прибор честно рапортовал бы «Карла нет», хотя
    // не наступил и сам отказ. Заодно ни один снимок не приезжает из кеша.
    serviceWorkers: "block",
  });
  const page = await ctx.newPage();
  await page.addInitScript(([p, th, lg]) => {
    try {
      localStorage.setItem("dialog.progress.v1", p);
      localStorage.setItem("dialog.tutorialDone.v1", "1");
      localStorage.setItem("dialog.lang.v1", lg);
      if (th) localStorage.setItem("dialog.theme.v1", th);
    } catch { /* приватный режим — экран обязан открыться и так */ }
  }, [prof, theme, lang]);
  if (init) await page.addInitScript(init);
  return { ctx, page };
}

// ——— 1. Карточка серии в рейле: пять настоящих состояний профиля ———
const STREAKS = [
  ["01-streak-waiting", { streak: 4, lastStreakDay: day(-1) }, "karl/doze"],
  ["02-streak-kept", { streak: 4, lastStreakDay: day(0), dailyDoneDay: day(0), dailyDoneCount: 1 }, "tikhon/cheer"],
  ["03-streak-shielded", { streak: 6, lastStreakDay: day(-2), freezes: 2 }, "tikhon/idle"],
  ["04-streak-lost", { streak: 6, lastStreakDay: day(-3) }, "tikhon/concern"],
  ["05-streak-away", { streak: 6, lastStreakDay: day(-12) }, "tikhon/doze"],
];
for (const [name, over, pose] of STREAKS) {
  const { ctx, page } = await open({ prof: profile(over) });
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1400);
  await shot(page, name, [{ sel: ".rc-streak img", src: pose }]);
  await ctx.close();
}

// Тёмная тема и английский: карточка обязана работать в обоих.
{
  const { ctx, page } = await open({ prof: profile({ streak: 4, lastStreakDay: day(-1) }), theme: "dark", lang: "en" });
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1400);
  await shot(page, "06-streak-waiting-dark-en", [
    { sel: ".rc-streak img", src: "karl/doze" },
    { sel: ".rc-streak p", text: "in a row" },
  ]);
  await ctx.close();
}

// ——— 2. Слои: честное «недоступно» с лицом ———
// `mediaDevices` убирается ДО загрузки страницы — ровно то, что видит браузер
// без камеры и микрофона. Подделывать нечего: слой и правда не поднимется.
for (const [name, lang, theme] of [["07-layers-na", "ru", null], ["08-layers-na-dark", "en", "dark"]]) {
  const { ctx, page } = await open({
    lang, theme,
    init: () => {
      try { Object.defineProperty(navigator, "mediaDevices", { value: undefined, configurable: true }); } catch {}
    },
  });
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  await page.locator('[data-nav="profile"]').first().click();
  await page.waitForTimeout(900);
  await page.locator(".prof-layers").first().scrollIntoViewIfNeeded();
  await shot(page, name, [{ sel: ".lay-na img", src: "karl/shrug" }, { sel: ".lay-na p" }]);
  await ctx.close();
}

// ——— 3. Экран, который не догрузился, и экран, который ещё едет ———
{
  const { ctx, page } = await open();
  // Кусок стола не приезжает вовсе: то же, что оборванная сеть на переходе.
  await page.route("**/assets/Table-*.js", (route) => route.abort());
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: /НАЧАТЬ|ЗА СТОЛ/i }).first().click();
  await page.waitForTimeout(2500);
  await shot(page, "09-chunk-failed", [{ sel: ".conn-lost .karl-mini img", src: "karl/concern" }]);
  await ctx.close();
}
{
  const { ctx, page } = await open();
  // Кусок едет медленно — то состояние, которое раньше было тремя точками.
  await page.route("**/assets/Table-*.js", async (route) => {
    await new Promise((r) => setTimeout(r, 6000));
    await route.continue();
  });
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: /НАЧАТЬ|ЗА СТОЛ/i }).first().click();
  await page.waitForTimeout(1500);
  await shot(page, "10-chunk-loading", [{ sel: ".gen .karl-row img", src: "karl/think" }]);
  await ctx.close();
}

await browser.close();
if (failures) {
  console.error(`\nПРОВАЛЕНО ПРОВЕРОК: ${failures}`);
  process.exit(2);
}
console.log(`\nснимки в ${OUT}`);
