// Regenerates docs/screenshots against the MOCK transport (deterministic, free).
import { chromium } from "playwright-core";

const EXE = "/root/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome";
const BASE = "http://localhost:5199/";
const OUT = "/root/LCT/docs/screenshots";
const VIEWPORTS = [
  { w: 1920, h: 1080, tag: "1920" },
  { w: 1280, h: 900, tag: "1280" },
  { w: 390, h: 844, tag: "390" },
];
const LANGS = ["ru", "en"];
const STRONG = {
  ru: [
    "Что для вас важнее всего в этой сделке и почему именно это?",
    "А почему для вас важен денежный поток — предоплата помогла бы?",
    "Что критично: разовая поставка или годовой контракт?",
    "По рынку аналог идёт 86-88; альтернатива у нас по 95, но с риском качества. Ориентир — 86.",
    "Если дадим годовой контракт с гарантией объёма и 30% предоплату — подвинетесь к 86?",
    "Договорились: 86 ₽/шт, годовой контракт, предоплата 30%. Фиксируем?",
  ],
  en: [
    "What matters most to you in this deal, and why exactly that?",
    "Why does cash flow matter to you — would a deposit help?",
    "What's critical: a one-off order or a year-long contract?",
    "Market comparables run 86-88; our alternative is 95 but with quality risk. A fair anchor is 86.",
    "If we commit to a year with guaranteed volume and 30% up front, could you move to 86?",
    "Agreed: 86 per unit, annual contract, 30% deposit. Shall we lock it?",
  ],
};

const errors = [];
const notes = [];

async function shot(page, name) {
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
}

async function noHScroll(page, label) {
  const bad = await page.evaluate(() =>
    document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  if (bad) notes.push(`!! HORIZONTAL SCROLL: ${label}`);
}

const browser = await chromium.launch({ executablePath: EXE });
for (const vp of VIEWPORTS) {
  for (const lang of LANGS) {
    const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h } });
    const page = await ctx.newPage();
    const where = `${lang}/${vp.tag}`;
    page.on("console", (m) => { if (m.type() === "error" && !/WebSocket/.test(m.text())) errors.push(`[${where}] ${m.text()}`); });
    page.on("pageerror", (e) => errors.push(`[${where}] PAGEERROR ${e.message}`));
    await page.addInitScript(() => { try { localStorage.setItem("dialog.tutorialDone.v1", "1"); localStorage.setItem("dialog.tours.v1", '{"enabled":false}'); } catch {} });
    await page.goto(BASE, { waitUntil: "networkidle" });
    if (lang === "en") { await page.click('.seg button:has-text("EN")'); await page.waitForTimeout(200); }

    await noHScroll(page, `home ${where}`);
    if (lang === "ru" && vp.tag === "1920") await shot(page, "01-home");

    await page.click(".card >> nth=0");
    await page.waitForSelector(".chat", { timeout: 20000 });
    await page.waitForTimeout(900);
    await noHScroll(page, `game-turn0 ${where}`);
    await shot(page, `91-game-turn0-${lang}-${vp.tag}`);

    const lines = STRONG[lang];
    let outcomeShot = false;
    for (let i = 0; i < 12; i++) {
      if (await page.locator(".outcome").count()) break;
      if (await page.locator(".debrief").count()) break;
      // The composer disappears the moment the table closes, and the close can
      // land between our check and our click — so a failed send means "the game
      // ended", not "the test is broken".
      try {
        await page.fill("textarea", lines[i % lines.length], { timeout: 4000 });
        await page.click(".send", { timeout: 6000 });
      } catch {
        break;
      }
      await page.waitForTimeout(1200);
      if (i === 1) { await noHScroll(page, `game-mid ${where}`); await shot(page, `92-game-scorecard-${lang}-${vp.tag}`); }
      if (!outcomeShot && await page.locator(".outcome").count()) {
        await noHScroll(page, `outcome ${where}`);
        await shot(page, `94-outcome-${lang}-${vp.tag}`);
        outcomeShot = true;
      }
    }
    await page.waitForSelector(".debrief", { timeout: 20000 });
    await page.waitForTimeout(1000);
    await noHScroll(page, `debrief ${where}`);
    await shot(page, `93-debrief-${lang}-${vp.tag}`);

    const blocks = await page.evaluate(() => ({
      reveal: document.querySelectorAll(".reveal li").length,
      mentor: !!document.querySelector(".mentor"),
      statRows: (() => {
        const g = document.querySelector(".stats");
        if (!g) return 0;
        const tops = new Set([...g.children].map((c) => Math.round(c.getBoundingClientRect().top)));
        return tops.size;
      })(),
    }));
    notes.push(`blocks[${where}] ${JSON.stringify(blocks)}`);
    console.log(`done ${where}`);
    await ctx.close();
  }
}
await browser.close();
for (const n of notes) console.log(n);
console.log("=== CONSOLE ERRORS:", errors.length);
for (const e of errors) console.log(e);
