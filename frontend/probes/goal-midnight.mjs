// goal-midnight.mjs — цель на сегодня переживает полночь сама.
//
// ЧТО МЕРЯЕТ. Правило цели дня: поднять можно сразу, опустить — только со
// следующего дня (lib/progress.ts::setDailyGoalTarget). Юнит-тесты держат
// логику, но не запускают таймер карточки (Rail.tsx::useDayKey), а именно он
// перерисовывает цель в полночь у вкладки, открытой с вечера. Здесь —
// настоящий браузер с поддельными часами: 23:59:30 по Москве, цель 3, одна
// партия сыграна; нажатие «1» → сегодня по-прежнему 3, строка «с завтрашнего
// дня — 1», переживает перезагрузку; часы переводятся через полночь БЕЗ
// единого действия → «0 из 1».
//
//   npx vite --port 5188 &
//   node probes/goal-midnight.mjs      # адрес — GOAL_BASE, снимки — GOAL_OUT
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";
import { browserExecutable } from "../e2e/browser.mjs";

const BASE = (process.env.GOAL_BASE ?? "http://127.0.0.1:5188").replace(/\/+$/, "") + "/";
const OUT = process.env.GOAL_OUT ?? "/tmp/dialog-goal-midnight";
mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ executablePath: browserExecutable() });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, timezoneId: "Europe/Moscow" });
const p = await ctx.newPage();
p.on("pageerror", (e) => console.log("PAGEERROR", e.message));
await p.clock.install({ time: new Date("2026-09-28T23:59:30+03:00") });
await p.addInitScript(() => {
  localStorage.setItem("dialog.tutorialDone.v1", "1");
  if (!localStorage.getItem("dialog.progress.v1")) {
    localStorage.setItem("dialog.progress.v1", JSON.stringify({
      version: 5, xp: 120, dailyGoalTarget: 3, dailyDoneDay: "2026-09-28", dailyDoneCount: 1,
      scenarios: { supplier: { bestGrade: "C", bestScore: 61, attempts: 1, lastPlayed: "2026-09-28T12:00:00Z" } },
    }));
  }
});
await p.goto(BASE, { waitUntil: "domcontentloaded" });
await p.waitForSelector(".rc-steps button");
const card = p.locator(".rc").filter({ has: p.locator(".rc-steps") });
const state = async (tag) => {
  const count = await card.locator(".rc-goal b").innerText();
  const later = (await card.locator(".rc-goal-later").innerText()).trim();
  const pressed = await card.locator('.rc-steps button[aria-pressed="true"]').innerText();
  const rule = await card.locator(".rc-goal-rule").innerText();
  const title1 = await card.locator(".rc-steps button").nth(0).getAttribute("title");
  console.log(`${tag}: счёт «${count}», выбрано ${pressed}, строка «${later}»`);
  return { count, later, pressed, rule, title1 };
};
const s0 = await state("23:59:30, до нажатия");
console.log("  правило до нажатия:", s0.rule);
console.log("  подсказка на «1»:", s0.title1);
await card.locator(".rc-steps button").nth(0).click();   // хочу 1 при цели 3
const s1 = await state("после выбора 1");
await card.screenshot({ path: `${OUT}/1-pending.png` });
await p.reload({ waitUntil: "domcontentloaded" });
await p.waitForSelector(".rc-steps button");
const s2 = await state("после перезагрузки");
await p.clock.runFor(60_000);                              // через полночь, без единого действия
await p.waitForTimeout(100);
const s3 = await state("00:00:30, никто ничего не нажимал");
await card.screenshot({ path: `${OUT}/2-after-midnight.png` });
const stored = await p.evaluate(() => JSON.parse(localStorage.getItem("dialog.progress.v1")).dailyGoalPending);
console.log("  в хранилище:", JSON.stringify(stored));
const ok = s1.pressed === "3" && s1.later.includes("3") && s1.later.includes("1") && s2.later === s1.later
  && s3.pressed === "1" && s3.later === "" && s3.count.startsWith("0");
console.log(ok ? "ПОЛНОЧЬ: ok" : "ПОЛНОЧЬ: BAD");
await b.close();
process.exit(ok ? 0 : 1);
