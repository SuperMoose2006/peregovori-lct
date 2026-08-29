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
const ev = [];
p.on("websocket", ws => {
  ws.on("framereceived", f => { try { const m=JSON.parse(f.payload);
    if (/cancel|done|delta/.test(m.type)) ev.push(m.type + (m.kind ? ":"+m.kind : "")); } catch {} });
  ws.on("framesent", f => { try { ev.push("→" + JSON.parse(f.payload).type); } catch {} });
});
await p.addInitScript(() => {
  try { localStorage.setItem("dialog.tutorialDone.v1","1"); } catch {}
  window.__played = 0;
  const O = window.AudioContext; window.AudioContext = class extends O {
    createBufferSource(){ const s=super.createBufferSource(); const st=s.start.bind(s);
      s.start=(...a)=>{window.__played+=(s.buffer?.duration||0);return st(...a);}; return s; } };
});
await p.goto(HOST + "/", { waitUntil:"domcontentloaded", timeout:40000 });
await p.waitForTimeout(2800);
// Слой включается из шторки стола, и промах ВАЛИТ прогон: прибор, который
// молча отыграл партию без голоса, доложил бы об успехе замера голоса.
await enterTable(p);
console.log("включён слой:", (await enableLayers(p, ["Голосом"]))
  .filter(s=>s.on).map(s=>s.name).join(", "));
// ждём, пока оппонент заговорит
for (let i=0;i<40;i++){ await p.waitForTimeout(700);
  if (await p.locator(".lb-cut").count()) break; }
const before = await p.evaluate(()=>window.__played);
const btn = p.locator(".lb-cut");
console.log("кнопка «перебить» видна:", await btn.count() > 0, "| активна:", await btn.first().isEnabled().catch(()=>null));
console.log("звука проиграно до перебивания:", before.toFixed(1), "с");
await btn.first().click({ timeout: 5000 }).catch(e=>console.log("клик:", String(e).split("\n")[0].slice(0,70)));
await p.waitForTimeout(3500);
const after = await p.evaluate(()=>window.__played);
console.log("звука проиграно через 3.5с после:", after.toFixed(1), "с  → прибавилось", (after-before).toFixed(1));
console.log("события:", ev.filter(e=>/cancel|→response|→input.commit/.test(e)).slice(-6));
await b.close();
