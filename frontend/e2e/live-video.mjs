// live-video.mjs — живое видео собеседника в настоящем (безголовом) браузере.
//
// Два режима шлюза, по одному прогону на каждый; режим назван флагом --expect:
//
//   off  — КРЕДОВ НЕТ. Сдача идёт так. Доказывается «ноль изменений»: лицо —
//          рисованный портрет со ртом по громкости, ни одного кадра по сокету,
//          /api/health говорит live_video=off, консоль чистая.
//
//   stub — заглушка сервиса с обрывом по заказу. Доказывается сценарий показа
//          перед жюри: кадры по звуку → сервис отвалился посреди партии →
//          рисованный портрет → партия идёт дальше, следующая реплика звучит.
//
// Шлюз поднимается отдельно (см. docs/INTEGRATION_LIVE_VIDEO.md, «Проверка»):
//   cd frontend && npx vite build --outDir /tmp/lv-dist
//   cd services/gateway && NEGO_AI=off NEGO_TTS=testtone NEGO_FRONTEND_DIST=/tmp/lv-dist \
//     .venv/bin/uvicorn app.main:app --port 8041                         # off
//   ... NEGO_LIVE_VIDEO=stub NEGO_LIVE_VIDEO_STUB_FAIL_AFTER_S=12 ...    # stub
//   node e2e/live-video.mjs --url http://127.0.0.1:8041 --expect off --out /tmp/e2e-lv
//
// Синтетического ввода в окна нет: всё внутри безголового браузера.
// Что НЕ доказывается: настоящий сервис видео, его задержки и качество губ.
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";
import { browserExecutable } from "./browser.mjs";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};
const URL = arg("url", "http://127.0.0.1:8041");
const EXPECT = arg("expect", "off");
const OUT = arg("out", "/tmp/e2e-live-video");
mkdirSync(OUT, { recursive: true });

const problems = [];
const passed = [];
const check = (ok, name, detail = "") => (ok ? passed : problems).push(detail ? `${name} — ${detail}` : name);

const health = await (await fetch(`${URL}/api/health`)).json();
const live = String(health.live_video ?? "");
if (EXPECT === "off") check(live.startsWith("off"), "health: живое видео выключено", live);
else check(live.startsWith("stub"), "health: включена заглушка, а не сервис", live);

const browser = await chromium.launch({
  executablePath: browserExecutable(),
  args: ["--autoplay-policy=no-user-gesture-required",
         "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: ["microphone"] });
const page = await ctx.newPage();
const errors = [];
const wire = { frames: 0, states: [] };
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error" && !/404|501/.test(m.text())) errors.push(m.text()); });
page.on("websocket", (ws) => ws.on("framereceived", ({ payload }) => {
  if (typeof payload !== "string") return;
  if (payload.includes('"avatar.frame"')) wire.frames++;
  else if (payload.includes('"avatar.state"')) {
    try { const e = JSON.parse(payload); wire.states.push({ mode: e.lipsync_mode, reason: e.reason ?? null }); }
    catch { /* не событие */ }
  }
}));
await page.addInitScript(() => {
  localStorage.setItem("dialog.tutorialDone.v1", "1");
  localStorage.setItem("dialog.lang.v1", "ru");
  localStorage.setItem("dialog.layers.v1", JSON.stringify({ voice: true, avatar: true }));
});
await page.goto(URL, { waitUntil: "networkidle" });

const face = () => page.evaluate(() => {
  const el = document.querySelector(".mt-face .face");
  return { source: el?.getAttribute("data-source") ?? null, renderer: el?.getAttribute("data-renderer") ?? null,
           status: document.querySelector(".meeting")?.getAttribute("data-status") ?? null,
           replies: document.querySelectorAll(".msg.opp:not(.typing-msg)").length,
           test: document.querySelector(".mt-test")?.textContent ?? null };
});
async function say(text) {
  const box = page.locator("textarea:visible").first();
  await box.fill(text);
  await box.press("Enter");
}
async function watch(ms) {
  const seen = { sources: new Set(), renderers: new Set(), statuses: new Set() };
  for (let t = 0; t < ms; t += 100) {
    const f = await face();
    seen.sources.add(f.source); seen.renderers.add(f.renderer); seen.statuses.add(f.status);
    await page.waitForTimeout(100);
  }
  return seen;
}
const list = (set) => [...set].join(",");

await page.locator('[data-scenario="supplier"]').first().click();
await page.waitForSelector("textarea", { timeout: 15000 });
check(await page.locator(".meeting").count() === 1, "встреча построена (тренировка с голосом)");
const start = await face();
await page.screenshot({ path: `${OUT}/${EXPECT}-01-start.png` });

if (EXPECT === "off") {
  check(start.renderer === "amplitude" && start.source === "drawn",
    "без кредов лицо — рисованный портрет со ртом по громкости", `${start.renderer}/${start.source}`);
  check(start.test === null, "без кредов нет подписи «тестовый поток»");
  await say("Что для вас важнее всего в этой поставке, кроме цены?");
  const seen = await watch(6000);
  check(!seen.sources.has("frame"), "без кредов кадров на экране нет", list(seen.sources));
  check(seen.statuses.has("speaking"), "собеседник звучал", list(seen.statuses));
  check(wire.frames === 0, "без кредов ни одного avatar.frame по сокету", String(wire.frames));
  check(wire.states.every((s) => s.mode === "amplitude"), "все состояния лица — прежний режим amplitude",
    JSON.stringify(wire.states.slice(0, 3)));
  check((await face()).replies >= 1, "реплика оппонента пришла");
} else {
  check(start.renderer === "video", "с заглушкой лицо в режиме видео", String(start.renderer));
  check((start.test ?? "").length > 0, "заглушка подписана как тестовый поток", String(start.test));
  await say("Что для вас важнее всего в этой поставке, кроме цены?");
  const first = await watch(6000);
  check(first.sources.has("frame"), "во время реплики лицо рисуют кадры сервиса", list(first.sources));
  check(!first.sources.has("drawn"), "пока сервис жив — без рисованной замены", list(first.sources));
  await page.screenshot({ path: `${OUT}/stub-02-frames.png` });
  // Ждём обрыв: заглушка рвёт связь по часам (NEGO_LIVE_VIDEO_STUB_FAIL_AFTER_S).
  let dropped = false;
  for (let i = 0; i < 300 && !dropped; i++) {
    dropped = wire.states.some((s) => s.reason === "provider_failed");
    if (!dropped) await page.waitForTimeout(100);
  }
  check(dropped, "сервис отвалился посреди партии (событие provider_failed)");
  await page.waitForTimeout(300);
  const after = await face();
  check(after.renderer === "amplitude" && after.source === "drawn",
    "после отказа — рисованный портрет", `${after.renderer}/${after.source}`);
  check(after.test === null, "после отказа подпись «тестовый поток» снята — потока нет", String(after.test));
  await page.screenshot({ path: `${OUT}/stub-03-portrait.png` });
  const before = after.replies;
  await say("Давайте опираться на рыночные данные: медиана независимых прайсов — 87.");
  const second = await watch(7000);
  const later = await face();
  check(later.replies > before, "партия продолжается: следующая реплика пришла", `${before} → ${later.replies}`);
  check(second.statuses.has("speaking"), "следующая реплика звучит", list(second.statuses));
  check(await page.locator("textarea:visible").isEnabled(), "следующий ход разрешён");
  const recovered = wire.states.some((s) => s.reason === "provider_recovered");
  passed.push(`справка: связь восстановлена и видео вернулось между репликами — ${recovered ? "да" : "нет"}`);
  await page.screenshot({ path: `${OUT}/stub-04-continued.png` });
}

check(errors.length === 0, "консоль без ошибок", errors.slice(0, 3).join(" | "));
await browser.close();
for (const p of passed) console.log("  ✓ " + p);
for (const p of problems) console.log("  ✗ " + p);
console.log(problems.length ? `ПРОВАЛ (${problems.length}) · снимки: ${OUT}` : `ПРОЙДЕНО (${passed.length}) · снимки: ${OUT}`);
process.exit(problems.length ? 1 : 0);
