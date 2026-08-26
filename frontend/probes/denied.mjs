// denied.mjs — что видит человек, которому браузер НЕ ДАЛ микрофон и камеру.
//
// Проверяется запрещённое четвёртое состояние: переключатель включён, устройства
// нет, а на экране — живой чип «микрофон активен». Здесь разрешение не выдаётся
// вовсе (нет флага --use-fake-ui-for-media-stream), поэтому getUserMedia
// отказывает по-настоящему.
import { chromium } from "playwright-core";
// Пароль НЕ живёт в репозитории (CLAUDE.md: секреты — в services/gateway/.env).
// Прибор берёт его оттуда же, откуда его берёт сам гейтвей.
import { readFileSync } from "node:fs";
const PASS = (process.env.NEGO_HTTP_PASSWORD
  ?? (readFileSync(new URL("../../services/gateway/.env", import.meta.url), "utf8")
        .match(/^NEGO_HTTP_PASSWORD=(.*)$/m)?.[1] ?? "")).trim();
const HOST = process.env.DIALOG_HOST ?? "https://185-154-194-88.nip.io/";
const b = await chromium.launch({ executablePath:"/root/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome",
  args:["--no-sandbox","--no-proxy-server","--use-fake-device-for-media-stream","--autoplay-policy=no-user-gesture-required"] });
const ctx = await b.newContext({ viewport:{width:1440,height:900},
  httpCredentials:{username:"dialog",password:PASS} });
const p = await ctx.newPage();
await p.addInitScript(() => { try { localStorage.setItem("dialog.tutorialDone.v1","1"); } catch {} });
await p.goto(HOST, { waitUntil:"domcontentloaded", timeout:40000 });
await p.waitForTimeout(2500);
await p.locator(".card .go, .card button").first().click().catch(()=>{});
await p.waitForTimeout(1600);
for (const n of ["Голосом","Камера"]) await p.locator(".layer",{hasText:n}).locator(".ly-sw").click().catch(()=>{});
await p.locator("button:has-text('НАЧАТЬ'), button:has-text('ЗА СТОЛ')").first().click().catch(()=>{});
await p.waitForSelector(".chat", { timeout:40000 }).catch(()=>{});
await p.waitForTimeout(6000);
const notice = await p.locator(".layer-off").first().textContent().catch(()=>null);
console.log("строка отказа:", notice ? notice.replace(/\s+/g," ").trim() : "НЕТ — экран молчит");
console.log("живая полоса слоёв:", await p.locator(".livebar").count());
console.log("чип «микрофон активен»:", await p.locator("text=микрофон активен").count());
console.log("партия играется:", await p.locator("textarea").count() ? "да, композер на месте" : "НЕТ");
await p.screenshot({ path:"/tmp/denied.png" });
await b.close();
