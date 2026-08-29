import { chromium } from "playwright-core";
import { enterTable, enableLayers } from "./_layers.mjs";
// СВЕЖЕСТЬ ДОКАЗЫВАЕТСЯ ДО ЗАПУСКА БРАУЗЕРА. Прибор ходил на жёстко вписанный
// https://127.0.0.1:8443, где висел процесс, поднятый 25 августа и не знающий
// даже поля `build` в /api/health, — и отчитался бы об успехе, измерив
// четырёхдневный код. Общий модуль отказывает в прогоне, если сборка или шлюз
// не те, что лежат на диске. Адрес меняется через DIALOG_HOST.
import { HOST, assertFresh } from "./_fresh.mjs";
await assertFresh(HOST);
const b = await chromium.launch({ executablePath: "/root/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome",
  args:["--no-sandbox","--use-fake-ui-for-media-stream","--use-fake-device-for-media-stream",
        "--use-file-for-fake-audio-capture=/tmp/fake-mic-48k.wav%noloop","--autoplay-policy=no-user-gesture-required"] });
const ctx = await b.newContext({ viewport:{width:1440,height:900}, ignoreHTTPSErrors:true, permissions:["microphone","camera"] });
const p = await ctx.newPage();
const marks = [];
const t0 = () => Date.now();
let start = 0;
p.on("websocket", ws => ws.on("framereceived", f => {
  try { const m = JSON.parse(f.payload);
    if (m.type === "user.speech.started" && !start) start = Date.now();
    if (m.type === "user.transcript")
      marks.push([((Date.now()-start)/1000).toFixed(2), m.final ? "ИТОГ" : "гипотеза", String(m.text).slice(0,70)]);
    if (m.type === "turn.analysis") marks.push([((Date.now()-start)/1000).toFixed(2), "судья", ""]);
    if (m.type === "user.transcript" && m.final) window.__finalAt = Date.now();
    if (m.type === "response.output.delta" && m.kind === "audio" && !globalThis.__firstAudio) {
      globalThis.__firstAudio = Date.now();
      marks.push([((Date.now()-start)/1000).toFixed(2), "ПЕРВЫЙ ЗВУК", ""]);
    }
  } catch {} }));
await p.addInitScript(() => { try { localStorage.setItem("dialog.tutorialDone.v1","1"); } catch {} });
await p.goto(HOST + "/", { waitUntil:"domcontentloaded", timeout:40000 });
await p.waitForTimeout(2800);
// Слой включается из шторки стола, и промах ВАЛИТ прогон: прибор, который
// молча отыграл партию без голоса, доложил бы об успехе замера голоса.
await enterTable(p);
console.log("включён слой:", (await enableLayers(p, ["Голосом"]))
  .filter(s=>s.on).map(s=>s.name).join(", "));
await p.waitForTimeout(26000);
console.log("от начала речи:");
for (const [t,k,x] of marks) console.log(`  +${t} с  ${k.padEnd(9)} ${x}`);
const fin = marks.find(m => m[1]==="ИТОГ"), snd = marks.find(m => m[1]==="ПЕРВЫЙ ЗВУК");
if (fin && snd) console.log(`\nОТ КОНЦА РЕПЛИКИ ДО ПЕРВОГО ЗВУКА ОТВЕТА: ${(snd[0]-fin[0]).toFixed(2)} с`);
console.log("реплик игрока:", await p.locator(".msg.me").count());
console.log("текст реплики:", await p.locator(".msg.me").first().innerText().catch(()=>"—"));
await b.close();
