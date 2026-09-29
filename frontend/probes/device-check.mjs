// device-check.mjs — камера и микрофон спрашиваются в момент включения слоя.
//
// ЧТО МЕРЯЕТ. Профиль → «Слои» в настоящем браузере, два прогона:
//   разрешено — поддельные устройства и автоответ «разрешить»: тумблер камеры
//               и голоса включается, под ним «работает», а КАЖДАЯ полученная
//               дорожка уже остановлена (камера не горит, пока ходят по меню);
//   запрещено — доступ к камере и микрофону запрещён так же, как это делает
//               человек в настройках сайта (DevTools: Browser.setPermission →
//               denied): тумблер остаётся выключенным, под ним — как выдать доступ.
//               Просто убрать автоответ нельзя: у безголовой сборки нет окна
//               разрешений, и она отвечает NotSupportedError, а не отказом.
//               Поэтому браузер — полный Chrome в безголовом режиме (окон нет):
//               только он отвечает на запрет настоящим NotAllowedError.
//               Путь — DEVICE_CHROME, иначе стандартный путь Chrome, иначе
//               тот же поиск, что у e2e.
// Настоящая камера машины не трогается ни разу: только поддельные устройства
// (--use-fake-device-for-media-stream). Ответ /api/health подменяется в этом же
// процессе (облако есть, распознавание есть) — иначе без шлюза слои заперты
// серверной причиной и спрашивать устройство незачем (так и задумано).
//
//   npx vite --port 5188 &
//   node probes/device-check.mjs     # адрес — DEVICE_BASE, снимки — DEVICE_OUT
import { existsSync, mkdirSync } from "node:fs";
import { chromium } from "playwright-core";
import { tsImport } from "tsx/esm/api";
import { browserExecutable } from "../e2e/browser.mjs";

const BASE = (process.env.DEVICE_BASE ?? "http://127.0.0.1:5188").replace(/\/+$/, "") + "/";
const OUT = process.env.DEVICE_OUT ?? "/tmp/dialog-device-check";
const MAC_CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const EXE = process.env.DEVICE_CHROME ?? (existsSync(MAC_CHROME) ? MAC_CHROME : browserExecutable());
mkdirSync(OUT, { recursive: true });
const { I18N } = await tsImport("../src/i18n.ts", import.meta.url);
const t = I18N.ru;
const problems = [];
const check = (ok, what) => { console.log(`${ok ? "ok " : "BAD"} ${what}`); if (!ok) problems.push(what); };

async function run(tag, args, deny = false) {
  const b = await chromium.launch({ executablePath: EXE, headless: true, args });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => problems.push(`${tag}: pageerror ${e.message}`));
  await p.route("**/api/health", (r) => r.fulfill({ contentType: "application/json",
    body: JSON.stringify({ ok: true, cloud_ai: true, voice: "classic: parakeet (local)" }) }));
  // Считаем выданные дорожки, чтобы проверить, что каждую остановили.
  await p.addInitScript(() => {
    localStorage.setItem("dialog.tutorialDone.v1", "1");
    localStorage.setItem("dialog.tours.v1", '{"enabled":false}');
    const md = navigator.mediaDevices;
    if (!md?.getUserMedia) return;
    const orig = md.getUserMedia.bind(md);
    window.__tracks = [];
    md.getUserMedia = async (c) => { const s = await orig(c); window.__tracks.push(...s.getTracks()); return s; };
  });
  if (deny) {
    const cdp = await ctx.newCDPSession(p);
    for (const name of ["camera", "microphone"]) {
      await cdp.send("Browser.setPermission", { permission: { name }, setting: "denied", origin: new URL(BASE).origin });
    }
  }
  await p.goto(BASE, { waitUntil: "networkidle" });
  await p.locator('[data-nav="profile"]').first().click();
  await p.waitForSelector(".prof-layers");
  const layer = (name) => p.locator(".prof-layers .layer").filter({ has: p.getByRole("switch", { name, exact: true }) });
  const sw = (name) => p.locator(".prof-layers").getByRole("switch", { name, exact: true });
  for (const [id, name] of [["camera", t.layers.names.camera], ["voice", t.layers.names.voice]]) {
    await sw(name).click();
    await p.waitForFunction((n) => {
      const s = [...document.querySelectorAll(".prof-layers .ly-check")].map((x) => x.className);
      return s.some((c) => !c.includes("checking"));
    }, name, { timeout: 10000 }).catch(() => {});
    await p.waitForTimeout(300);
    const status = await layer(name).locator(".ly-check").innerText().catch(() => "");
    const on = await sw(name).getAttribute("aria-checked");
    const live = await p.evaluate(() => (window.__tracks ?? []).filter((x) => x.readyState === "live").length);
    const stored = await p.evaluate(() => JSON.parse(localStorage.getItem("dialog.layers.v1") || "{}"));
    console.log(`  ${tag}/${id}: тумблер ${on}, строка «${status}», живых дорожек ${live}, в профиле ${JSON.stringify(stored)}`);
    if (tag === "разрешено") {
      check(on === "true" && status === t.layers.check[id].granted, `${tag}: «${name}» включён и подписан «работает»`);
      check(live === 0, `${tag}: поток «${name}» закрыт сразу — устройство не горит (живых дорожек: ${live})`);
    } else {
      check(on === "false" && status === t.layers.check[id].denied, `${tag}: «${name}» остался выключен и объясняет, как выдать доступ`);
      check(stored[id] !== true, `${tag}: в профиле «${name}» не записан включённым`);
    }
    await layer(name).screenshot({ path: `${OUT}/${tag}-${id}.png` });
  }
  await b.close();
}

await run("разрешено", ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"]);
await run("запрещено", ["--use-fake-device-for-media-stream"], true);
console.log(problems.length ? `\n${problems.length} проблем` : `\nоба пути чисты · снимки в ${OUT}`);
process.exit(problems.length ? 1 : 0);
