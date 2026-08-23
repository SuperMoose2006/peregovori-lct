// course.mjs — сквозной проход блока курса ЭТАЛОННЫМИ ответами.
//
// Что он доказывает, чего не доказывают юнит-тесты: что банк, экраны и профиль
// сходятся ВМЕСТЕ. Ответы берутся из того же сгенерированного банка, который
// показывает продукт, вводятся через настоящий интерфейс (клики, ввод, drag-free
// перестановка кнопками) и обязаны быть засчитаны. Если эталонный ответ не
// зачтён — прогон падает с типом задания и причиной отказа.
//
// Затем сдаётся экзамен блока теми же ответами и проверяется, что блок стал
// пройденным, а следующий открылся.
//
//   node e2e/course.mjs [--url http://127.0.0.1:8010] [--out /tmp/dialog-e2e]
import { chromium } from "playwright-core";
import { readFileSync, mkdirSync } from "node:fs";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};
const BASE = arg("url", "http://127.0.0.1:8010");
const OUT = arg("out", "/tmp/dialog-e2e");
const EXE = process.env.CHROME_PATH
  || "/root/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome";
mkdirSync(OUT, { recursive: true });

// Ответы берём из сгенерированного банка — как их знает продукт.
const src = readFileSync(new URL("../src/data/course.generated.ts", import.meta.url), "utf8");
const bankJson = src.slice(src.indexOf("export const COURSE_BANK: Exercise[] = ") + 39,
                           src.indexOf("];", src.indexOf("export const COURSE_BANK")) + 1);
const BANK = JSON.parse(bankJson);
const byId = Object.fromEntries(BANK.map((x) => [x.id, x]));

let browser;
try {
  browser = await chromium.launch({ executablePath: EXE });
} catch (e) {
  console.error(`не удалось запустить chromium (${EXE}). CHROME_PATH=… или npx playwright install chromium\n${e}`);
  process.exit(2);
}
const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } });
const p = await ctx.newPage();
const errs = [];
p.on("pageerror", (e) => errs.push(String(e)));
p.on("console", (m) => { if (m.type() === "error" && !m.text().includes("Failed to load")) errs.push(m.text().slice(0,120)); });

await p.goto(BASE, { waitUntil: "networkidle" });
await p.evaluate(() => localStorage.setItem("dialog.tutorial.v1", "done"));
await p.reload({ waitUntil: "networkidle" });

// Отвечает верно на текущее задание, опознавая тип по разметке.
async function answer() {
  const kind = (await p.locator(".ex").getAttribute("class")) || "";
  const type = (kind.match(/ex--([a-z_]+)/) || [])[1];
  if (type === "choice" || type === "spot_error" || type === "reaction" ||
      type === "meters" || type === "face") {
    // Верный вариант ищем по тексту: банк знает ответ, разметка знает порядок.
    const id = await p.locator(".ex-prompt").textContent();
    const ex = BANK.find((x) => x.prompt.ru === id?.trim());
    if (!ex) throw new Error("не нашли задание по тексту: " + id);
    let label;
    if (type === "choice" || type === "spot_error") label = ex.options[ex.answer].ru;
    else if (type === "meters") label = { trust: "Доверие", tension: "Напряжение",
      info: "Информация", leverage: "Рычаг", up: "Вырастет", down: "Упадёт" }[ex.answer];
    else label = { walked_out: "Встаёт из-за стола", offended: "Принимает на свой счёт",
      hardened: "Закрывается", pressured: "Под давлением", not_yet: "Пока не соглашается",
      neutral: "Держит нейтралитет", collaborated: "Идёт навстречу",
      persuaded: "Принимает довод", opened_up: "Приоткрывается", warmed: "Теплеет" }[ex.answer];
    await p.locator(".ex-opt", { hasText: label }).first().click();
  } else if (type === "numeric") {
    const id = await p.locator(".ex-prompt").textContent();
    const ex = BANK.find((x) => x.prompt.ru === id?.trim());
    await p.locator(".ex-num input").fill(String(ex.answer.value));
  } else if (type === "freeform") {
    const id = await p.locator(".ex-prompt").textContent();
    const ex = BANK.find((x) => x.prompt.ru === id?.trim());
    await p.locator(".ex-free textarea").fill(ex.reference.ru);
  } else if (type === "order") {
    const id = await p.locator(".ex-prompt").textContent();
    const ex = BANK.find((x) => x.prompt.ru === id?.trim());
    // Поднимаем каждый элемент на своё место кнопками ↑
    for (let target = 0; target < ex.answer.length; target++) {
      const want = ex.items.find((i) => i.id === ex.answer[target]).ru;
      const rows = p.locator(".ex-order li");
      const n = await rows.count();
      let at = -1;
      for (let k = 0; k < n; k++) {
        if (((await rows.nth(k).locator(".ex-ord-t").textContent()) || "").trim() === want) { at = k; break; }
      }
      for (let k = at; k > target; k--) {
        await p.locator(".ex-order li").nth(k).locator("button").first().click();
      }
    }
  } else if (type === "match") {
    const id = await p.locator(".ex-prompt").textContent();
    const ex = BANK.find((x) => x.prompt.ru === id?.trim());
    for (const [left, right] of Object.entries(ex.answer)) {
      const lt = ex.left.find((l) => l.id === left).ru;
      const rt = ex.right.find((r) => r.id === right).ru;
      await p.locator(".ex-match ul").first().locator("button", { hasText: lt }).first().click();
      await p.locator(".ex-match ul").nth(1).locator("button", { hasText: rt }).first().click();
    }
  } else if (type === "drill") {
    return "drill";
  }
  await p.locator("button:has-text('Проверить')").click();
  await p.waitForTimeout(300);
  const ok = (await p.locator(".ex-verdict.ok").count()) === 1;
  if (!ok) {
    const why = await p.locator(".ex-verdict").textContent();
    throw new Error(`эталонный ответ не засчитан (${type}): ${why?.slice(0, 160)}`);
  }
  return type;
}

await p.locator("button[aria-label='Курс']").click();
await p.waitForTimeout(400);
await p.locator(".cnode.current .cnode-btn").click();
await p.waitForTimeout(300);

const lessons = await p.locator(".lesson-list button").count();
for (let i = 0; i < lessons; i++) {
  await p.locator(".lesson-list button").nth(i).click();
  await p.waitForTimeout(300);
  await p.locator("button:has-text('К заданиям'), button:has-text('Урок пройден')").first().click();
  await p.waitForTimeout(350);
  while (await p.locator(".ex").count()) {
    const type = await answer();
    if (type === "drill") break;
    const next = p.locator("button:has-text('Дальше')").first();
    if (!(await next.count())) break;
    await next.click();
    await p.waitForTimeout(300);
  }
  // Экран «Урок пройден» уводит кнопкой ← <блок>; если его нет — кнопкой назад.
  const doneBtn = p.locator(".wrap.lesson.done button.primary").first();
  if (await doneBtn.count()) { await doneBtn.click(); }
  else { const back = p.locator("button.back").first(); if (await back.count()) await back.click(); }
  await p.waitForTimeout(400);
}
await p.screenshot({ path: `${OUT}/block-01-done.png`, fullPage: true });

// Экзамен блока — те же эталонные ответы
await p.locator("button:has-text('Сдавать экзамен')").click();
await p.waitForTimeout(400);
while (await p.locator(".ex").count()) {
  const type = await answer();
  if (type === "drill") break;
  const next = p.locator("button:has-text('Дальше'), button:has-text('Завершить')").first();
  if (!(await next.count())) break;
  await next.click();
  await p.waitForTimeout(350);
}
await p.waitForTimeout(600);
await p.screenshot({ path: `${OUT}/block-02-exam.png`, fullPage: true });
const passed = await p.locator("h1, h2").filter({ hasText: "Экзамен сдан" }).count();
await p.locator("button.btn.primary").first().click();
await p.waitForTimeout(400);
await p.locator("button:has-text('Все блоки')").click();
await p.waitForTimeout(500);
await p.screenshot({ path: `${OUT}/block-03-map.png`, fullPage: true });
const unlocked = await p.locator(".cnode.current").count();
const done = await p.locator(".cnode.done").count();
await browser.close();

const problems = [];
if (passed !== 1) problems.push("экзамен блока не сдан эталонными ответами");
if (done < 1) problems.push("блок не отмечен пройденным на карте");
if (unlocked < 1) problems.push("следующий блок не открылся");
if (errs.length) problems.push(...errs);
if (problems.length) {
  console.error("ПРОБЛЕМЫ:\n" + problems.join("\n"));
  process.exit(1);
}
console.log(`блок пройден целиком, экзамен сдан · скриншоты: ${OUT}`);
