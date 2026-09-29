import { chromium } from "playwright-core";
import { enterTable } from "./_layers.mjs";
// СВЕЖЕСТЬ ДОКАЗЫВАЕТСЯ ДО ЗАПУСКА БРАУЗЕРА. Прибор ходил на жёстко вписанный
// https://127.0.0.1:8443, где висел процесс, поднятый 25 августа и не знающий
// даже поля `build` в /api/health, — и отчитался бы об успехе, измерив
// четырёхдневный код. Общий модуль отказывает в прогоне, если сборка или шлюз
// не те, что лежат на диске. Адрес меняется через DIALOG_HOST.
import { HOST, assertFresh } from "./_fresh.mjs";
await assertFresh(HOST);
import { execSync, spawn } from "child_process";
const b = await chromium.launch({ executablePath: "/root/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome", args:["--no-sandbox"] });
const ctx = await b.newContext({ viewport:{width:1440,height:900}, ignoreHTTPSErrors:true });
const p = await ctx.newPage();
await p.addInitScript(() => { try { localStorage.setItem("dialog.tutorialDone.v1","1"); localStorage.setItem("dialog.tours.v1", '{"enabled":false}'); } catch {} });
await p.goto(HOST + "/", { waitUntil:"domcontentloaded", timeout:40000 });
await p.waitForTimeout(2600);
// Карточка ведёт СРАЗУ за стол; промах здесь ВАЛИТ прогон — «партия не
// пережила обрыв» и «партии не было вовсе» обязаны различаться.
await enterTable(p);
await p.waitForTimeout(1500);
await p.fill("textarea", "Что для вас важнее всего в этой сделке и почему именно это?");
await p.click(".send");
await p.waitForTimeout(9000);
const before = await p.evaluate(() => ({
  msgs: document.querySelectorAll(".msg").length,
  turn: document.querySelector(".turn, .ch .turn")?.innerText?.trim(),
  price: document.querySelector(".dt-now, .pb-now, .side b")?.innerText?.trim(),
}));
console.log("до обрыва:", JSON.stringify(before, null, 0));
console.log("роняю гейтвей…");
// Убиваем по НОМЕРУ процесса: pkill по строке совпадал с собственной
// командой скрипта и валил его самого.
// Порт берём ИЗ АДРЕСА, а не из головы: прибор ходит туда, куда указывает
// DIALOG_HOST, и ронять он обязан ровно тот процесс, который сам и меряет.
const PORT = new URL(HOST).port || "443";
const pid = execSync(`ss -ltnp 2>/dev/null | grep ':${PORT} ' | grep -oP 'pid=\\K[0-9]+' | head -1`, { shell: "/bin/bash" }).toString().trim();
console.log("  роняю pid", pid);
if (pid) execSync(`kill ${pid}`);
await p.waitForTimeout(2500);
console.log("плашка связи:", await p.evaluate(() => document.querySelector(".conn-banner, .conn-lost, .conn")?.innerText?.trim()?.slice(0,50) || "нет"));
// Поднимаем обратно ОТЦЕПЛЁННЫМ процессом: execSync с «&» не переживает
// завершения скрипта, и гейтвей оставался лежать.
spawn("/bin/bash", ["-lc",
  "cd /root/LCT/services/gateway && set -a && . ./.env && set +a && " +
  `PYTHONPATH=/root/LCT exec ./.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port ${PORT} ` +
  "--ssl-keyfile certs/key.pem --ssl-certfile certs/cert.pem >> /tmp/gw-https.log 2>&1"],
  { detached: true, stdio: "ignore" }).unref();
for (let i=0;i<40;i++){ await p.waitForTimeout(1000);
  const st = await p.evaluate(() => document.querySelector(".conn-banner, .conn-lost")?.innerText?.trim()?.slice(0,40) || null);
  if (!st) break; }
await p.waitForTimeout(3000);
const after = await p.evaluate(() => ({
  msgs: document.querySelectorAll(".msg").length,
  turn: document.querySelector(".turn, .ch .turn")?.innerText?.trim(),
  price: document.querySelector(".dt-now, .pb-now, .side b")?.innerText?.trim(),
  banner: document.querySelector(".conn-banner, .conn-lost")?.innerText?.trim()?.slice(0,40) || "нет",
}));
console.log("после восстановления:", JSON.stringify(after, null, 0));
console.log("партия сохранилась:", before.msgs === after.msgs && before.price === after.price ? "ДА" : "НЕТ");
await p.screenshot({ path: "/tmp/reconnect.png" });
await b.close();
