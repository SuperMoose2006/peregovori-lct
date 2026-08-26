// remote.mjs — тот же прибор, что mediacheck.mjs, но по СЕТИ и через пароль.
//
// Зачем отдельно. mediacheck ходит на 127.0.0.1, а локальные запросы замок не
// проверяет и сертификат браузер не смотрит — то есть ровно те две вещи,
// которые ломались у человека снаружи, прибор не трогал. Здесь он идёт тем же
// путём, что и зритель: настоящее имя, настоящий сертификат, basic-пароль,
// кука `dlg_ok` для веб-сокета.
//
// --no-proxy-server обязателен: в песочнице разработки исходящий HTTP идёт
// через прокси, и он отвечал 407 на публичный адрес. Полдня это выглядело как
// «сайт просит пароль и не принимает его».
import { chromium } from "playwright-core";
// Пароль НЕ живёт в репозитории (CLAUDE.md: секреты — в services/gateway/.env).
// Прибор берёт его оттуда же, откуда его берёт сам гейтвей.
import { readFileSync } from "node:fs";
const PASS = (process.env.NEGO_HTTP_PASSWORD
  ?? (readFileSync(new URL("../../services/gateway/.env", import.meta.url), "utf8")
        .match(/^NEGO_HTTP_PASSWORD=(.*)$/m)?.[1] ?? "")).trim();
const HOST = process.env.DIALOG_HOST ?? "https://185-154-194-88.nip.io/";
const b = await chromium.launch({ executablePath: "/root/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome",
  args:["--no-sandbox","--no-proxy-server","--use-fake-ui-for-media-stream","--use-fake-device-for-media-stream",
        "--use-file-for-fake-audio-capture=/tmp/fake-mic-48k.wav%noloop","--autoplay-policy=no-user-gesture-required"] });
const ctx = await b.newContext({ viewport:{width:1440,height:900}, httpCredentials:{username:"dialog",password:PASS}, permissions:["microphone","camera"] });
const p = await ctx.newPage();
const errs = [], got = new Map(), sent = new Map();
p.on("pageerror", e => errs.push(String(e).slice(0,110)));
p.on("console", m => { if (m.type()==="error" && !/favicon/.test(m.text())) errs.push(m.text().slice(0,110)); });
p.on("websocket", ws => {
  ws.on("framesent", f => { try { const t=JSON.parse(f.payload).type; sent.set(t,(sent.get(t)||0)+1); } catch {}
                            if (/video_frames/.test(f.payload)) sent.set("кадр",(sent.get("кадр")||0)+1); });
  ws.on("framereceived", f => { try { const m=JSON.parse(f.payload); got.set(m.type,(got.get(m.type)||0)+1);
                                      if (m.type==="vision.observation") got.set("ЗРЕНИЕ: "+String(m.text).slice(0,52),1); } catch {} });
});
await p.addInitScript(() => {
  try { localStorage.setItem("dialog.tutorialDone.v1","1"); } catch {}
  window.__gum = [];
  const o = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia = async (c) => { window.__gum.push(JSON.stringify(c).slice(0,70));
    try { const s = await o(c); window.__gum.push("ok:"+s.getTracks().map(t=>t.kind).join(",")); return s; }
    catch (e) { window.__gum.push("fail:"+e.name); throw e; } };
});
await p.goto(HOST, { waitUntil:"domcontentloaded", timeout:40000 });
await p.waitForTimeout(3000);
console.log("защищённый контекст:", await p.evaluate(()=>window.isSecureContext));
await p.waitForTimeout(2000);
console.log("service worker:", await p.evaluate(async()=>{try{return await navigator.serviceWorker.getRegistration()?"зарегистрирован":"нет"}catch(e){return "ошибка:"+e.name}}));
await p.locator(".card .go, .card button").first().click().catch(()=>{});
await p.waitForTimeout(1600);
for (const n of ["Голосом","Камера","Лицо оппонента"]) await p.locator(".layer",{hasText:n}).locator(".ly-sw").click().catch(()=>{});
await p.waitForTimeout(500);
console.log("включены слои:", await p.evaluate(()=>[...document.querySelectorAll(".layer")]
  .filter(e=>/\bon\b/.test(e.className)).map(e=>e.textContent.trim().slice(0,13)).join(", ")));
await p.locator("button:has-text('НАЧАТЬ'), button:has-text('ЗА СТОЛ')").first().click().catch(()=>{});
await p.waitForSelector(".chat", { timeout:40000 }).catch(()=>{});
await p.waitForTimeout(20000);
console.log("\ngetUserMedia:", await p.evaluate(()=>window.__gum));
console.log("видео:", await p.evaluate(()=>{const v=document.querySelector("video");return v?{поток:!!v.srcObject,ширина:v.videoWidth,играет:!v.paused}:null;}));
console.log("ушло:", JSON.stringify([...sent.entries()]));
console.log("пришло:", JSON.stringify([...got.entries()].filter(([k])=>!/delta/.test(k))));
console.log("реплик игрока голосом:", await p.locator(".msg.me").count());
console.log("ошибок:", errs.length, errs.slice(0,2));
await p.screenshot({ path:"/tmp/mediacheck.png" });
await b.close();
