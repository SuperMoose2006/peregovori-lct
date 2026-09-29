// denied.mjs — что видит человек, которому браузер НЕ ДАЛ микрофон и камеру.
//
// Проверяется запрещённое четвёртое состояние: переключатель включён, устройства
// нет, а на экране — живой чип «микрофон активен». Здесь разрешение не выдаётся
// вовсе (нет флага --use-fake-ui-for-media-stream), поэтому getUserMedia
// отказывает по-настоящему.
import { chromium } from "playwright-core";
import { enterTable, enableLayers } from "./_layers.mjs";
// Пароль и адрес — из общего модуля: пароль НЕ живёт в репозитории (CLAUDE.md:
// секреты — в services/gateway/.env), а свежесть доказывается ДО запуска
// браузера. Прибор, который не может доказать, что меряет ЭТОТ код, обязан
// отказаться от прогона: молчаливый отчёт по чужой сборке хуже отсутствующего.
// Умолчание здесь — публичный стенд: этот прибор затем и написан, чтобы идти
// путём зрителя. Меняется через DIALOG_HOST.
import { PASS, STAND, assertFresh, hostOf } from "./_fresh.mjs";
const HOST = hostOf(STAND);
await assertFresh(HOST);
const b = await chromium.launch({ executablePath:"/root/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome",
  args:["--no-sandbox","--no-proxy-server","--use-fake-device-for-media-stream","--autoplay-policy=no-user-gesture-required"] });
const ctx = await b.newContext({ viewport:{width:1440,height:900},
  httpCredentials:{username:"dialog",password:PASS} });
const p = await ctx.newPage();
await p.addInitScript(() => { try { localStorage.setItem("dialog.tutorialDone.v1","1"); localStorage.setItem("dialog.tours.v1", '{"enabled":false}'); } catch {} });
await p.goto(HOST + "/", { waitUntil:"domcontentloaded", timeout:40000 });
await p.waitForTimeout(2500);
// Здесь слой обязан НЕ загореться — это и есть предмет замера, поэтому
// require:false. Но сам путь к тумблеру должен существовать: его отсутствие —
// поломка прибора, а не отказ устройства, и она валит прогон.
await enterTable(p);
const layerState = await enableLayers(p, ["Голосом","Камера"], { require: false });
console.log("тумблеры после отказа:", layerState.map(s=>`${s.name}:${s.on?"горит":"погашен"}`).join(" · "));
await p.waitForTimeout(6000);
const notice = await p.locator(".layer-off").first().textContent().catch(()=>null);
console.log("строка отказа:", notice ? notice.replace(/\s+/g," ").trim() : "НЕТ — экран молчит");
console.log("живая полоса слоёв:", await p.locator(".livebar").count());
console.log("чип «микрофон активен»:", await p.locator("text=микрофон активен").count());
console.log("партия играется:", await p.locator("textarea").count() ? "да, композер на месте" : "НЕТ");
await p.screenshot({ path:"/tmp/denied.png" });
await b.close();
