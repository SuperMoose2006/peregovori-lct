// Real browser regression: discovery → configured scenario → session cleanup →
// full negotiation → report download, plus first-visit offline and mobile layouts.
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { chromium } from "playwright-core";
import { browserExecutable } from "./browser.mjs";

const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i < 0 ? fallback : process.argv[i + 1]; };
const base = arg("url", "http://127.0.0.1:8010");
const out = arg("out", "/tmp/dialog-improvements");
mkdirSync(out, { recursive: true });
const games = JSON.parse(readFileSync(new URL("../test/fixtures/games.json", import.meta.url), "utf8"));
const browser = await chromium.launch({ executablePath: browserExecutable() });
const errors = [], checks = [];
if (process.argv.includes("--layout-only")) {
  try {
    const { page, ctx } = await context(320, 900);
    const overflow = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
      elements: [...document.querySelectorAll("body *")].map(e => ({ tag: e.tagName, cls: String(e.className), x: e.getBoundingClientRect().x, right: e.getBoundingClientRect().right, w: e.getBoundingClientRect().width })).filter(e => e.right > innerWidth + 1 && e.x < innerWidth) }));
    console.log(JSON.stringify(overflow, null, 2));
    await page.screenshot({ path: `${out}/layout-320.png` });
    await ctx.close();
  } finally { await browser.close(); }
  process.exit(0);
}
async function context(width = 1440, height = 1000) {
  const ctx = await browser.newContext({ viewport: { width, height }, acceptDownloads: true });
  await ctx.addInitScript(() => {
    localStorage.setItem("dialog.tutorialDone.v1", "1");
    localStorage.setItem("dialog.lang.v1", "ru");
    localStorage.setItem("dialog.theme.v1", "light");
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(base, { waitUntil: "networkidle" });
  return { ctx, page };
}
async function nav(page, key) {
  await page.locator(`[data-nav="${key}"]`).click();
  await page.waitForFunction((key) => document.querySelector(`[data-nav="${key}"].on`), key);
}
async function noOverflow(page, name) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, `${name}: page overflows horizontally`);
}
async function clearScrims(page) {
  for (let i = 0; i < 6; i++) {
    if (!await page.locator(".milestone-scrim").count()) return;
    await page.locator(".milestone-go").first().click();
  }
}
async function turn(page, line) {
  await clearScrims(page);
  await page.locator(".msg.opp").first().waitFor();
  const before = await page.locator(".msg.opp").count();
  const budget = await page.locator(".turnbar i").getAttribute("style");
  await page.locator(".chat textarea").fill(line);
  await page.locator(".send").click();
  await page.waitForFunction(({ n, budget }) => (document.querySelectorAll(".msg.opp").length > n && document.querySelector(".turnbar i")?.getAttribute("style") !== budget) || !!document.querySelector(".debrief"), { n: before, budget }, { timeout: 30000 });
}

async function enterCourseCapstone(page) {
  await nav(page, "course");
  await page.locator(".cnode.current .cnode-btn").click();
  await page.getByRole("button", { name: "Сдавать экзамен", exact: true }).click();
  for (let i = 0; i < 20; i++) {
    await clearScrims(page);
    if (await page.locator(".ex-drill").count()) break;
    const match = page.locator(".ex-match");
    if (await match.count()) {
      const left = match.locator("ul").first().locator("button");
      const right = match.locator("ul").nth(1).locator("button");
      const n = await left.count();
      for (let k = 0; k < n; k++) { await left.nth(k).click(); await right.nth(0).click(); }
    } else if (await page.locator(".ex-opt").count()) await page.locator(".ex-opt").first().click();
    if (await page.locator(".ex-num input").count()) await page.locator(".ex-num input").fill("1");
    if (await page.locator(".ex-free textarea").count()) await page.locator(".ex-free textarea").fill("нет");
    await page.getByRole("button", { name: "Проверить", exact: true }).click();
    await page.locator("button:has-text('Дальше'), button:has-text('Завершить')").first().click();
  }
  await page.locator(".ex-drill button.btn.primary").click();
  await page.locator(".chat textarea").waitFor();
}
try {
  const { page, ctx } = await context();
  let repeatDebrief = null;
  const serverEvents = [];
  await page.routeWebSocket(/\/v1\/realtime/, socket => {
    const server = socket.connectToServer();
    server.onMessage(message => {
      socket.send(message);
      try { const event = JSON.parse(String(message)); serverEvents.push(event.type); if (event.type === "debrief") repeatDebrief = () => socket.send(message); } catch { /* Audio frames have no JSON type. */ }
    });
  });
  // Playwright installs its WebSocket bridge as a document init script.
  await page.reload({ waitUntil: "networkidle" });
  const sockets = [];
  page.on("websocket", (socket) => { const item = { closed: false }; sockets.push(item); socket.on("close", () => { item.closed = true; }); });
  assert.equal(await page.locator("[data-scenario]").count(), 9);
  await page.screenshot({ path: `${out}/01-practice-desktop.png`, fullPage: true });
  await page.getByRole("searchbox").fill("АРЕНДЕ");
  assert.equal(await page.locator("[data-scenario]").count(), 1);
  assert.equal(await page.locator("[data-scenario]").getAttribute("data-scenario"), "rent");
  await page.getByRole("searchbox").fill("несуществующая ситуация");
  await page.locator(".catalog-empty").waitFor();
  await page.locator(".catalog-empty button").click();
  await page.locator(".catalog-topics button").filter({ hasText: /^Бизнес$/ }).click();
  await page.locator(".catalog-level select").selectOption("challenge");
  assert.equal(await page.locator("[data-scenario]").count(), 3);
  await page.locator(".catalog-reset").click();
  checks.push("Catalog search, combined filters, empty state and reset");

  await nav(page, "admin");
  await page.locator(".admin-presets button").filter({ hasText: /^Аренда$/ }).click();
  await page.locator("#admin-topic").fill("Аренда помещения для новой команды");
  await page.locator("#admin-role").fill("Представитель собственника");
  await page.locator("#admin-tone").selectOption("firm");
  await page.locator("#admin-difficulty").fill("4");
  await page.getByRole("button", { name: "Сохранить черновик", exact: true }).click();
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("dialog.adminContext.v1")).difficulty), 4);
  await page.getByRole("button", { name: "Посмотреть условия", exact: true }).click();
  await page.locator(".admin-launch").waitFor();
  assert.match(await page.locator(".admin-preview").innerText(), /Аренда помещения для новой команды/);
  await noOverflow(page, "desktop editor");
  await page.screenshot({ path: `${out}/02-editor-desktop.png`, fullPage: true });
  await page.locator(".admin-launch").click();
  await page.locator(".chat textarea").waitFor({ timeout: 20000 });
  await turn(page, "Что для вас важно помимо цены?");
  assert.equal(await page.locator(".msg.me").count(), 1);
  await page.screenshot({ path: `${out}/03-configured-negotiation.png`, fullPage: true });
  await nav(page, "profile");
  await page.waitForTimeout(300);
  assert(sockets.length > 0 && sockets.every(s => s.closed), "Leaving the table must close its websocket");
  checks.push("Configured admin scenario launches, accepts a move, closes session on profile navigation");

  await nav(page, "practice");
  await page.locator('[data-scenario="rent"]').click();
  await page.locator(".chat textarea").waitFor();
  for (const line of games.principled.rent.ru) {
    if (await page.locator(".debrief").count()) break;
    await turn(page, line);
  }
  await page.locator(".debrief").waitFor({ timeout: 15000 });
  await clearScrims(page);
  assert.equal(await page.locator(".drill-verdict").count(), 0);
  assert.equal((await page.locator(".gl").textContent()).trim(), "A");
  const progression = () => page.evaluate(() => [localStorage.getItem("dialog.progress.v1"), localStorage.getItem("dialog.history.v1")]);
  const recorded = await progression();
  assert(repeatDebrief, `The completed server session must publish its report: ${serverEvents.join(",")}`);
  repeatDebrief();
  await page.waitForTimeout(300);
  assert.deepEqual(await progression(), recorded, "Replayed completion must not award XP or append history twice");
  checks.push("Replayed server debrief does not duplicate XP, attempts or history");
  const txtDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Скачать разбор", exact: true }).click();
  const txt = await txtDownload;
  await txt.saveAs(`${out}/report.txt`);
  assert.match(readFileSync(`${out}/report.txt`, "utf8"), /Итог: A/);
  const jsonDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Данные JSON", exact: true }).click();
  const json = await jsonDownload;
  await json.saveAs(`${out}/report.json`);
  const saved = JSON.parse(readFileSync(`${out}/report.json`, "utf8"));
  assert.equal(saved.result.grade, "A");
  assert.deepEqual(saved.player_moves, games.principled.rent.ru);
  await page.screenshot({ path: `${out}/04-debrief-export.png`, fullPage: true });
  checks.push("Complete reference negotiation earns A; TXT/JSON downloads preserve actual score and all player lines");
  await ctx.close();

  const { page: interrupted, ctx: interruptedCtx } = await context();
  const starts = [];
  interrupted.on("websocket", socket => socket.on("framesent", ({ payload }) => {
    try { const e = JSON.parse(String(payload)); if (e.type === "session.init") starts.push(e.payload); } catch { /* Binary audio is not a protocol message. */ }
  }));
  await enterCourseCapstone(interrupted);
  assert.equal(starts.at(-1).gameMode, "drill");
  await nav(interrupted, "practice");
  await interrupted.locator('[data-scenario="rent"]').click();
  await interrupted.locator(".chat textarea").waitFor();
  assert.equal(starts.at(-1).gameMode, "practice");
  for (const line of games.principled.rent.ru) await turn(interrupted, line);
  await interrupted.locator(".debrief").waitFor({ timeout: 15000 });
  assert.equal(await interrupted.locator(".drill-verdict").count(), 0);
  assert.equal((await interrupted.locator(".gl").textContent()).trim(), "A");
  await interruptedCtx.close();
  checks.push("Abandon course capstone → ordinary practice sends practice mode and shows its own A report");

  const { page: denied, ctx: deniedCtx } = await context();
  await denied.routeWebSocket(/\/v1\/realtime/, socket => socket.onMessage(() => socket.close({ code: 1008, reason: "test initial refusal" })));
  await denied.reload({ waitUntil: "networkidle" });
  await denied.locator('[data-scenario="rent"]').click();
  await denied.locator(".conn-lost").waitFor({ timeout: 20000 });
  assert((await denied.locator(".conn-lost").innerText()).length > 20, "Initial refusal must explain recovery before a scenario exists");
  assert(await denied.locator(".conn-lost button").count() > 0);
  assert(await denied.locator(".conn-lost").evaluate(panel => panel.getBoundingClientRect().top >= document.querySelector(".top").getBoundingClientRect().bottom), "Recovery must not overlap the toolbar");
  await denied.screenshot({ path: `${out}/08-initial-connection-refusal.png`, fullPage: true });
  await denied.locator(".conn-lost-actions .ghost").click();
  await denied.locator('[data-scenario="rent"]').waitFor();
  await deniedCtx.close();
  checks.push("Initial websocket refusal shows visible recovery controls without hanging on an empty table");

  for (const width of [320, 390, 820]) {
    const { page: p, ctx: c } = await context(width, 900);
    await noOverflow(p, `practice ${width}`);
    await p.screenshot({ path: `${out}/05-practice-${width}.png`, fullPage: true });
    await p.screenshot({ path: `${out}/05-practice-viewport-${width}.png` });
    await nav(p, "admin");
    await noOverflow(p, `editor ${width}`);
    await p.getByRole("button", { name: "EN", exact: true }).click();
    await p.getByRole("heading", { name: "Set up a negotiation", exact: true }).waitFor();
    await p.locator(".controls .seg").nth(1).locator("button").click();
    await p.screenshot({ path: `${out}/06-editor-dark-en-${width}.png`, fullPage: true });
    await noOverflow(p, `English dark editor ${width}`);
    await c.close();
  }
  checks.push("320px/390px/820px layouts, reachable editor navigation, English and dark theme without horizontal page overflow");

  // A clean context opens the shell once; every runtime chunk must be cached
  // before any course/game visits. This catches the original first-load hole.
  const { page: offline, ctx: offlineCtx } = await context();
  await offline.evaluate(() => navigator.serviceWorker.ready);
  await offline.waitForFunction(() => !!navigator.serviceWorker.controller);
  const cached = await offline.evaluate(async () => {
    const names = await caches.keys();
    const cache = await caches.open(names.find(n => n.startsWith("dialog-build-")));
    return (await cache.keys()).map(r => new URL(r.url).pathname);
  });
  assert(cached.some(p => /\/assets\/index-.*\.js$/.test(p)), "First visit must cache entry JS");
  assert(cached.some(p => /\/assets\/index-.*\.css$/.test(p)), "First visit must cache entry CSS");
  await offlineCtx.setOffline(true);
  await offline.reload({ waitUntil: "domcontentloaded" });
  await offline.locator('[data-scenario="rent"]').click();
  await offline.locator(".chat textarea").waitFor({ timeout: 20000 });
  await turn(offline, "Что для вас важно помимо цены?");
  assert.equal(await offline.locator(".msg.me").count(), 1);
  await nav(offline, "course");
  await offline.locator(".cnode.current").waitFor();
  await offline.screenshot({ path: `${out}/07-first-visit-offline-course.png`, fullPage: true });
  await offlineCtx.close();
  checks.push("First-visit precache → offline reload → playable negotiation and course");
  assert.deepEqual(errors, []);
  writeFileSync(`${out}/checks.json`, JSON.stringify({ checks, errors }, null, 2));
  console.log(checks.map(c => `✓ ${c}`).join("\n"));
} catch (error) {
  writeFileSync(`${out}/checks.json`, JSON.stringify({ checks, errors, fatal: String(error), stack: error.stack }, null, 2));
  throw error;
} finally { await browser.close(); }
