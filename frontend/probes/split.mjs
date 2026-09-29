// split.mjs — продукт, у которого статика и бэкенд стоят на РАЗНЫХ адресах.
//
// ЗАЧЕМ ОТДЕЛЬНЫЙ ПРИБОР. «Работает» на одном origin не говорит про разные
// ничего. Браузер молча меняет поведение, когда домены расходятся: не шлёт
// учётные данные без `credentials: "include"`, не отправляет куку `dlg_ok`
// (samesite=lax) на чужой домен и не умеет слать заголовок при рукопожатии
// сокета. Ни одного из трёх не видно на `localhost:5173` рядом с гейтвеем — а
// именно так продукт гоняют каждый день.
//
// И ЧТО ЕЩЁ ХУЖЕ: промах здесь выглядит УСПЕХОМ. Не ответивший бэкенд роняет
// продукт в офлайн-ядро, а офлайн-ядро играет целиком — экран открывается,
// партия идёт, грейд считается. Отличить «фронтенд дошёл до сервера» от
// «фронтенд не дошёл и играет сам» глазами нельзя ВООБЩЕ. Поэтому прибор
// смотрит не на экран, а на провод: куда ушёл каждый запрос, каким получился
// адрес сокета и не горит ли плашка демо-режима.
//
//   # статика собирается С АДРЕСОМ БЭКЕНДА и раздаётся ЧЕМ УГОДНО
//   VITE_API_BASE=http://127.0.0.1:8010 npx vite build --outDir dist-split
//   (cd dist-split && python3 -m http.server 5200 --bind 127.0.0.1 &)
//   # шлюз обязан знать origin статики — иначе браузер отвергнет ответы
//   NEGO_ALLOWED_ORIGINS=http://127.0.0.1:5200 make gateway
//   node probes/split.mjs
//
// Адреса меняются: SPLIT_UI (статика) и SPLIT_API (шлюз); каталог сборки,
// с которым сверяется свежесть, — SPLIT_DIST.
import { chromium } from "playwright-core";

import { PASS, assertBundle, assertGateway } from "./_fresh.mjs";
import { enterTable } from "./_layers.mjs";

const EXE = process.env.CHROME_PATH
  || "/root/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome";
const trim = (s) => s.replace(/\/+$/, "");
const UI = trim(process.env.SPLIT_UI ?? "http://127.0.0.1:5200");
const API = trim(process.env.SPLIT_API ?? "http://127.0.0.1:8010");

if (new URL(UI).origin === new URL(API).origin) {
  console.error(`SPLIT_UI и SPLIT_API — ОДИН И ТОТ ЖЕ origin (${UI}).\n` +
    "Этот прибор про разъехавшиеся домены; на одном он не меряет ничего.");
  process.exit(2);
}

// СВЕЖЕСТЬ ДО БРАУЗЕРА, как у всех приборов репозитория. Сборка сверяется с
// `dist-split` — тем каталогом, который собирают по рецепту в шапке: у обычного
// `dist` другой входной файл (в нём нет адреса бэкенда), и сверка с ним
// отказывала бы по инструкции из собственного README.
const DIST = new URL(`../${process.env.SPLIT_DIST ?? "dist-split"}/index.html`, import.meta.url);
await assertBundle(UI, DIST);
await assertGateway(API);

const problems = [];
const say = (ok, line) => { console.log(`${ok ? "  ok " : "  НЕТ"} ${line}`); if (!ok) problems.push(line); };

// `--no-proxy-server` — не украшение: в песочнице разработки исходящий HTTP
// идёт через прокси, и на НЕлупбэковый адрес он отвечает 407. Полдня это
// выглядело как «сайт просит пароль и не принимает его» (см. remote.mjs).
const browser = await chromium.launch({ executablePath: EXE,
                                        args: ["--no-sandbox", "--no-proxy-server"] });
// ПАРОЛЬ СТЕНДА ОТДАЁТСЯ БРАУЗЕРУ, а не приписывается к запросам руками:
// проверяется как раз то, что учётные данные доезжают на ЧУЖОЙ origin, и
// подложить их мимо браузера значило бы проверить прибор, а не продукт.
// Пароль берётся из NEGO_HTTP_PASSWORD (окружение или services/gateway/.env);
// на незапертом шлюзе он никому не мешает.
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 950 },
  ignoreHTTPSErrors: true,
  ...(PASS ? { httpCredentials: { username: "dialog", password: PASS } } : {}),
});

/** Провод: куда ушёл каждый запрос и каким получился адрес сокета. */
const wire = { api: [], stray: [], sockets: [], failed: [] };
ctx.on("request", (r) => {
  const url = r.url();
  if (!/\/(api|v1)\//.test(url)) return;
  (url.startsWith(API) ? wire.api : wire.stray).push(url);
});
ctx.on("requestfailed", (r) => {
  if (/\/(api|v1)\//.test(r.url())) wire.failed.push(`${r.url()} — ${r.failure()?.errorText ?? "?"}`);
});

const page = await ctx.newPage();
page.on("websocket", (ws) => wire.sockets.push(ws.url()));
page.on("pageerror", (e) => problems.push(`pageerror ${e}`));
await page.addInitScript(() => {
  try { localStorage.setItem("dialog.tutorialDone.v1", "1"); localStorage.setItem("dialog.tours.v1", '{"enabled":false}'); } catch { /* приватный режим */ }
});

try {
  // ------------------------------------------------------------ 1. главная
  await page.goto(UI + "/", { waitUntil: "domcontentloaded", timeout: 40000 });
  await page.waitForSelector(".card", { timeout: 30000 });
  await page.screenshot({ path: "/tmp/split-01-home.png" });
  console.log("\nглавная");
  say(wire.api.length > 0, `запросы ушли на бэкенд (${wire.api.length})`);
  say(wire.stray.length === 0,
      `ни один запрос не ушёл на адрес статики${wire.stray.length ? ": " + wire.stray[0] : ""}`);
  say(wire.failed.length === 0,
      `ни один запрос не отвергнут браузером${wire.failed.length ? ": " + wire.failed[0] : ""}`);

  // -------------------------------------------------------------- 2. партия
  await enterTable(page);
  await page.waitForTimeout(1200);
  console.log("\nпартия");
  say(wire.sockets.length > 0, "сокет открыт");
  const socket = wire.sockets[0] ?? "";
  say(socket.startsWith(API.replace(/^http/, "ws")), `адрес сокета — бэкенд: ${socket.split("?")[0]}`);
  // Билет — единственный способ передать пропуск на рукопожатии сокета с
  // чужого домена. Его наличие определяет ШЛЮЗ (замок есть — билет нужен),
  // поэтому прибор спрашивает у шлюза, а не решает сам.
  const lock = await (await ctx.request.get(API + "/api/auth/ticket")).json();
  const carries = /[?&]ticket=/.test(socket);
  say(carries === !!lock.required,
      lock.required ? "билет уехал в адресе сокета" : "замка нет — билета в адресе нет");
  // Демо-режим за столом = бэкенда не было. Экран при этом выглядит здоровым.
  say((await page.locator(".conn.mock").count()) === 0,
      "партию ведёт СЕРВЕР, а не офлайн-ядро (плашки демо-режима нет)");

  // ТОЛЬКО ВИДИМОЕ ПОЛЕ. `.chat textarea` совпадает и со скрытым — прибор
  // упирался в него и ждал тридцать секунд «element is not visible»,
  // хотя стол работал.
  const box = () => page.locator(".chat textarea:visible").first();
  const before = await page.locator(".msg").count();
  await box().fill("Что для вас важнее всего в этой сделке и почему именно это?");
  await page.locator(".send:visible").first().click();
  await page.waitForFunction((n) => document.querySelectorAll(".msg").length > n + 1,
                             before, { timeout: 40000 });
  await page.screenshot({ path: "/tmp/split-02-table.png" });
  say(true, `ход сделан, оппонент ответил (реплик ${await page.locator(".msg").count()})`);

  // -------------------------------------------------------------- 3. разбор
  // Доигрываем до конца: разбор — отдельный экран и отдельный набор запросов
  // («А что если…» ходит на `/api/whatif`), и он тоже обязан доехать.
  for (let i = 0; i < 16 && !(await page.locator(".ring").count()); i += 1) {
    if (!(await box().count())) break;
    const n = await page.locator(".msg").count();
    await box().fill("Если мы дадим объём и предоплату — сможете подвинуться по цене?");
    await page.locator(".send:visible").first().click();
    await page.waitForFunction((k) => document.querySelectorAll(".msg").length > k,
                               n, { timeout: 40000 }).catch(() => {});
    await page.waitForTimeout(600);
  }
  await page.waitForSelector(".ring", { timeout: 30000 });
  await page.screenshot({ path: "/tmp/split-03-debrief.png" });
  console.log("\nразбор");
  say(true, `грейд: ${(await page.locator(".ring .gl").first().textContent())?.trim()}`);

  // «А что если…» — единственное место, откуда ходят на `/api/whatif`. Без
  // этого клика ручка не проверена ничем: карточка молча считает ветки
  // офлайн-ядром и выглядит точно так же.
  const preset = page.locator(".wi-preset:visible").first();
  if (await preset.count()) {
    await preset.click();
    await page.locator(".wi-reveal:visible").first().click();
    await page.waitForTimeout(3000);
    say(wire.api.some((u) => u.includes("/api/whatif")), "«А что если…» сходило на бэкенд");
  } else {
    problems.push("на разборе нет карточки «А что если…» — /api/whatif не проверен ничем");
  }

  // ---------------------------------------------------------------- 4. курс
  const home = page.locator(".quit, [data-nav='home']").first();
  if (await home.count()) { await home.click(); await page.waitForTimeout(500); }

  /** Открыть урок с номером `n` в текущем блоке курса и дойти до заданий. */
  const openLesson = async (n) => {
    // ВЫХОДИМ КНОПКОЙ «НАЗАД», А НЕ ПУНКТОМ МЕНЮ. Экран «Урок пройден» лежит
    // ВНУТРИ раздела «Курс», поэтому пункт меню там уже активен и клик по нему
    // не делает ничего — прибор ждал тридцать секунд карту курса, стоя на
    // экране итога урока.
    for (let back = 0; back < 3 && !(await page.locator(".cnode-btn").count()); back += 1) {
      // ПО СТРЕЛКЕ, А НЕ ПО КЛАССУ: у экрана «Урок пройден» кнопка возврата —
      // главная (без `.ghost`), и селектор по классу молча не находил ничего.
      // Стрелка одна на все языки, подпись — нет.
      const b = page.locator("button:visible").filter({ hasText: "←" }).first();
      if (!(await b.count())) break;
      await b.click();
      await page.waitForTimeout(600);
    }
    if (!(await page.locator(".cnode-btn").count())) {
      await page.locator("[data-nav='course']").first().click();
      await page.waitForTimeout(700);
    }
    // ПЕРВЫЙ ОТКРЫТЫЙ БЛОК, а не `.cnode.current`: «текущий» переезжает по мере
    // прохождения, и после первого же зачтённого урока прибор ждал узел,
    // которого на месте уже нет.
    await page.locator(".cnode-btn:not([disabled])").first().click();
    await page.waitForTimeout(500);
    const lessons = page.locator(".lesson-list button");
    if (n >= (await lessons.count())) return false;
    await lessons.nth(n).click();
    await page.waitForTimeout(400);
    const go = page.locator("button:has-text('К заданиям'), button:has-text('To the tasks')").first();
    if (!(await go.count())) return false;
    await go.click();
    await page.waitForTimeout(500);
    return true;
  };

  await openLesson(0);
  await page.locator(".ex-opt").first().click();
  await page.locator("button:has-text('Проверить'), button:has-text('Check')").first().click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: "/tmp/split-04-course.png" });
  console.log("\nкурс");
  say((await page.locator(".ex-verdict, .verdict").count()) > 0, "упражнение проверено");

  // СВОБОДНЫЙ ОТВЕТ — единственное место, откуда ходят на `/api/course/coach`
  // (и только ВНЕ экзамена: в экзамене разбор откладывается до конца). Ищем его
  // по урокам, а не по номеру задания: тип упражнения — свойство банка, и
  // вписанный номер сторожил бы банк, а не адрес.
  let free = false;
  for (let lesson = 0; lesson < 5 && !free; lesson += 1) {
    if (lesson && !(await openLesson(lesson))) break;
    for (let step = 0; step < 8 && !free; step += 1) {
      const area = page.locator(".ex-free textarea:visible").first();
      if (await area.count()) {
        await area.fill("Давайте опираться на рыночные данные: медиана независимых прайсов ниже.");
        await page.locator("button:has-text('Проверить'), button:has-text('Check')").first().click();
        await page.waitForTimeout(3000);
        free = true;
        break;
      }
      // Вердикт уже на экране — задание отвечено, надо листать дальше. Иначе
      // прибор упирался в выключенный вариант и ждал тридцать секунд.
      const next = page.locator("button:has-text('Дальше'), button:has-text('Next')").first();
      if (await next.count()) {
        await next.click();
        await page.waitForTimeout(500);
        continue;
      }
      const opt = page.locator(".ex-opt:visible:not([disabled])").first();
      const check = page.locator("button:has-text('Проверить'), button:has-text('Check')").first();
      if (!(await opt.count()) || !(await check.count())) break;   // не наш тип задания
      await opt.click();
      await check.click();
      await page.waitForTimeout(600);
    }
  }
  say(free && wire.api.some((u) => u.includes("/api/course/coach")),
      free ? "свободный ответ сходил к тренеру на бэкенд"
           : "свободного ответа не нашлось — /api/course/coach не проверен");
  await page.screenshot({ path: "/tmp/split-05-coach.png" });

  // -------------------------------------------------------------- 5. итог
  console.log("\nпровод");
  const paths = [...new Set(wire.api.map((u) => new URL(u).pathname))].sort();
  say(true, `ручки бэкенда: ${paths.join(" ")}`);
  say(wire.stray.length === 0,
      `на адрес статики не ушло ни одного запроса к ручкам${wire.stray.length ? ": " + wire.stray.join(" ") : ""}`);
  say(wire.failed.length === 0,
      `браузер не отверг ни одного ответа${wire.failed.length ? ": " + wire.failed.join(" ") : ""}`);
} catch (e) {
  problems.push(`обход оборвался: ${e?.message ?? e}`);
  console.error(String(e?.stack ?? e).split("\n").slice(0, 8).join("\n"));
}

await browser.close();
if (problems.length) {
  console.error(`\nПРОБЛЕМЫ (${problems.length}):\n` + problems.join("\n"));
  process.exit(1);
}
console.log("\nразнесённое развёртывание пройдено · снимки: /tmp/split-0*.png");
