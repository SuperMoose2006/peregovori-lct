import { chromium } from "playwright-core";
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
await p.goto("https://127.0.0.1:8443/", { waitUntil:"domcontentloaded", timeout:40000 });
await p.waitForTimeout(2800);
await p.locator(".card .go, .card button").first().click().catch(()=>{});
await p.waitForTimeout(1500);
await p.locator(".layer",{hasText:"Голосом"}).locator(".ly-sw").click().catch(()=>{});
await p.locator("button:has-text('НАЧАТЬ'), button:has-text('ЗА СТОЛ')").first().click().catch(()=>{});
await p.waitForSelector(".chat", { timeout:40000 }).catch(()=>{});
await p.waitForTimeout(26000);
console.log("от начала речи:");
for (const [t,k,x] of marks) console.log(`  +${t} с  ${k.padEnd(9)} ${x}`);
const fin = marks.find(m => m[1]==="ИТОГ"), snd = marks.find(m => m[1]==="ПЕРВЫЙ ЗВУК");
if (fin && snd) console.log(`\nОТ КОНЦА РЕПЛИКИ ДО ПЕРВОГО ЗВУКА ОТВЕТА: ${(snd[0]-fin[0]).toFixed(2)} с`);
console.log("реплик игрока:", await p.locator(".msg.me").count());
console.log("текст реплики:", await p.locator(".msg.me").first().innerText().catch(()=>"—"));
await b.close();
