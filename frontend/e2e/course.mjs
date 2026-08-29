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
// ЭКЗАМЕН БЛОКА ЗАКАНЧИВАЕТСЯ КАПСТОУНОМ, И ЕГО НАДО СЫГРАТЬ. `drawExam`
// ставит упражнения типа `drill` последними, а у капстоуна нет ни «Проверить»,
// ни «Завершить»: единственная кнопка ведёт в настоящую мини-партию, и экзамен
// закрывается её итогом (App.tsx кладёт в профиль `score + 2` за сданный
// капстоун). Прибор раньше видел капстоун и считал экзамен законченным —
// жал первую попавшуюся `button.btn.primary`, уходил в партию и уже не
// возвращался. Из-за этого три главных утверждения ниже — «экзамен сдан»,
// «блок пройден», «следующий открылся» — не проверялись НИ РАЗУ.
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

// ЛИНИЯ КАПСТОУНА БЕРЁТСЯ ИЗ ФИКСТУРЫ ЭТАЛОННЫХ ПАРТИЙ, А НЕ ПИШЕТСЯ ЗДЕСЬ.
// `frontend/test/fixtures/games.json` — тот же набор, которым
// tests/test_reference_games.py и test/games.test.ts доказывают инвариант 2 и
// инвариант 8. Своя линия «по мотивам» однажды уже перестала закрывать сделку и
// увела на полдня в поиск несуществующего дефекта движка: правки лексикона и
// баланса до неё не доходили, потому что её никто не проверял.
const GAMES = JSON.parse(
  readFileSync(new URL("../test/fixtures/games.json", import.meta.url), "utf8"));

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
// КЛЮЧ ОБУЧЕНИЯ — `dialog.tutorialDone.v1` СО ЗНАЧЕНИЕМ "1" (lib/progress.ts).
// Прибор ставил `dialog.tutorial.v1` = "done": ключ, которого продукт не знает.
// На экранах курса это ничем не пахло, а вот капстоун идёт в режиме practice —
// и вводный тур вставал ровно поперёк партии, которую прибор пришёл играть.
await p.evaluate(() => localStorage.setItem("dialog.tutorialDone.v1", "1"));
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

/**
 * Убирает модальные вехи, если продукт их показал.
 *
 * «Веха» (`.milestone-scrim`) — полноэкранный диалог про серию и повышение
 * ранга; он всплывает по накопленному XP, то есть ровно посреди прохода курса.
 * Playwright не жмёт сквозь него и падает по таймауту с «intercepts pointer
 * events» — а выглядит это как «кнопки капстоуна нет». Вех может прийти
 * несколько подряд (кнопка подписана «1/2»), поэтому закрываем в цикле.
 */
async function clearScrims() {
  for (let i = 0; i < 6; i++) {
    if (!(await p.locator(".milestone-scrim").count())) return;
    await p.locator(".milestone-go").first().click({ timeout: 5000 }).catch(() => {});
    await p.waitForTimeout(400);
  }
}

/** Ищет упражнение по тексту вопроса — как это делает `answer()`. */
function exByPrompt(text) {
  const ex = BANK.find((x) => x.prompt.ru === (text || "").trim());
  if (!ex) throw new Error("не нашли задание по тексту: " + text);
  return ex;
}

/**
 * Доигрывает капстоун: настоящая мини-партия эталонной линией.
 *
 * Ждать фиксированные паузы здесь нельзя — ход идёт в модель, и на живом
 * шлюзе он занимает от секунды до десятка. Ждём СОБЫТИЯ: появления новой
 * реплики оппонента, а на последнем ходу — вердикта капстоуна.
 */
async function playCapstone() {
  await clearScrims();
  const ex = exByPrompt(await p.locator(".ex-prompt").textContent());
  const lines = GAMES.principled?.[ex.scenario_id]?.ru;
  if (!lines) throw new Error(
    `нет эталонной линии для стола «${ex.scenario_id}» в test/fixtures/games.json`);
  console.log(`  капстоун ${ex.id}: стол «${ex.scenario_id}», ${lines.length} реплик`);

  await p.locator(".ex-drill button.btn.primary").click();
  await p.waitForSelector(".chat textarea", { timeout: 40000 });
  for (const line of lines) {
    if (await p.locator(".drill-verdict, .debrief").count()) break;
    await clearScrims();
    const before = await p.locator(".msg.opp").count();
    await p.locator(".chat textarea").fill(line);
    await p.locator(".send").click({ timeout: 20000 });
    // Либо оппонент ответил, либо партия закрылась — обоих ждём одним условием.
    await p.waitForFunction(
      (n) => document.querySelectorAll(".msg.opp").length > n
             || document.querySelector(".drill-verdict, .debrief") !== null,
      before, { timeout: 120000 });
  }
  await p.waitForSelector(".drill-verdict", { timeout: 120000 });
  await clearScrims();
  const ok = (await p.locator(".drill-verdict.ok").count()) === 1;
  const verdict = ((await p.locator(".drill-verdict b").textContent()) || "").trim();
  await p.screenshot({ path: `${OUT}/block-03-capstone.png`, fullPage: true });
  // «← В курс» с экрана вердикта ведёт СРАЗУ на карту блоков (App.backToCourse),
  // промежуточного экрана экзамена за ним нет.
  await p.locator(".drill-verdict button.btn.primary").click();
  await p.waitForTimeout(1200);
  return { ok, verdict };
}

// По ключу раздела, а не по русской подписи: см. смоук.
await p.locator('[data-nav="course"]').click();
await p.waitForTimeout(400);
await p.locator(".cnode.current .cnode-btn").click();
await p.waitForTimeout(300);

const lessons = await p.locator(".lesson-list button").count();
for (let i = 0; i < lessons; i++) {
  await clearScrims();
  await p.locator(".lesson-list button").nth(i).click();
  await p.waitForTimeout(300);
  await p.locator("button:has-text('К заданиям'), button:has-text('Урок пройден')").first().click();
  await p.waitForTimeout(350);
  while (await p.locator(".ex").count()) {
    // Капстоун ВНУТРИ УРОКА необязателен: рядом с ним стоит «Дальше →», и его
    // можно пройти мимо. Раньше здесь стоял `break`, и он уносил не только
    // капстоун, но и все задания урока после него.
    await answer();
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
await clearScrims();
await p.locator("button:has-text('Сдавать экзамен')").click();
await p.waitForTimeout(400);
let capstone = null;
while (await p.locator(".ex").count()) {
  const type = await answer();
  if (type === "drill") {
    await p.screenshot({ path: `${OUT}/block-02-exam.png`, fullPage: true });
    capstone = await playCapstone();
    break;
  }
  const next = p.locator("button:has-text('Дальше'), button:has-text('Завершить')").first();
  if (!(await next.count())) break;
  await next.click();
  await p.waitForTimeout(350);
}
await p.waitForTimeout(600);
await p.screenshot({ path: `${OUT}/block-04-map.png`, fullPage: true });

// УТВЕРЖДЕНИЯ СНИМАЮТСЯ С КАРТЫ, А НЕ СО СЧЁТЧИКОВ. `.cnode` идут в порядке
// курса, поэтому «первый пройден» и «второй открылся» проверяются по позиции:
// счётчик «хотя бы один done» держался бы и на чужом блоке.
const nodes = await p.locator(".cnode").evaluateAll(
  (els) => els.map((e) => e.className.replace("cnode", "").trim()));
const onMap = await p.locator(".course-path").count() === 1;
await browser.close();

const problems = [];
if (!capstone) {
  problems.push("экзамен блока не дошёл до капстоуна — раньше здесь прибор молча " +
                "считал экзамен законченным и не проверял ничего из нижнего");
} else if (!capstone.ok) {
  // Капстоун сдан ЭТАЛОННОЙ линией — той же, которой tests/test_reference_games
  // доказывает инвариант 2. Не сдан — это находка, а не случайность прогона.
  problems.push(`капстоун не сдан эталонной линией: «${capstone.verdict}»`);
}
if (!onMap) problems.push("после капстоуна не вернулись на карту блоков");
if (nodes[0] !== "done") {
  problems.push(`экзамен блока не сдан: первый узел карты «${nodes[0]}», ожидалось «done»`);
}
if (nodes[1] !== "current") {
  problems.push(`следующий блок не открылся: второй узел карты «${nodes[1]}», ожидалось «current»`);
}
if (errs.length) problems.push(...errs);
if (problems.length) {
  console.error("ПРОБЛЕМЫ:\n" + problems.join("\n"));
  process.exit(1);
}
console.log(`блок пройден целиком, капстоун сдан («${capstone.verdict}»), ` +
            `экзамен сдан, следующий блок открыт · скриншоты: ${OUT}`);
