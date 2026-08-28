// smoke.mjs — обход продукта в настоящем браузере.
//
// ЗАЧЕМ ОН ЕСТЬ. Юнит-тесты доказывают, что движок считает верно, а курс не
// расходится с движком. Они НЕ доказывают, что экран открывается: половина
// поломок этого проекта была не в логике, а в том, что кнопка ушла за сгиб,
// модалка перекрыла стол или var(--bg) не существовал и подложка стала
// прозрачной. Такое видно только в браузере.
//
// Прогон ничего не «утверждает» кроме двух вещей: ни одной ошибки в консоли и
// ни одного pageerror на всех ключевых экранах. Скриншоты складываются рядом —
// смотреть глазами. Партии здесь НЕ играются (это минуты ожидания ИИ); для них
// есть ручной сценарий в docs/demo.md.
//
//   node e2e/smoke.mjs [--url http://127.0.0.1:8010] [--out /tmp/shots]
//
// playwright-core объявлен в devDependencies, но БРАУЗЕР он с собой не тащит:
// путь к chromium берётся из CHROME_PATH или из кэша playwright по умолчанию.
// Нет браузера — прогон честно падает с понятной ошибкой, а не «зелёный, потому
// что ничего не проверял».
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};

const URL = arg("url", "http://127.0.0.1:8010");
const OUT = arg("out", "/tmp/dialog-e2e");
const EXE = process.env.CHROME_PATH
  || "/root/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome";

mkdirSync(OUT, { recursive: true });

const problems = [];
let browser;
try {
  browser = await chromium.launch({ executablePath: EXE });
} catch (e) {
  console.error(`не удалось запустить chromium (${EXE}).\n` +
    "Укажите путь через CHROME_PATH=… или поставьте браузер: npx playwright install chromium\n" + e);
  process.exit(2);
}

/** Профиль со всеми сданными блоками — иначе половина курса заперта. */
const UNLOCKED = `(() => {
  const blocks = {};
  for (const id of ["foundations","spin-ladder","active-listening","objective-criteria",
                    "batna-zopa","anchoring","logrolling","pressure-defense","closing","styles"]) {
    blocks[id] = { lessons: [1,2,3,4,5], solved: [], examBest: 6, examTotal: 6, passed: true, attempts: 1 };
  }
  localStorage.setItem("dialog.progress.v1", JSON.stringify({ version: 4, scenarios: {}, streak: 0,
    lastStreakDay: "", xp: 900, skills: {}, achievements: [], freezes: 0, dailyGoalTarget: 1,
    dailyDoneDay: "", dailyDoneCount: 0, celebratedMilestones: [], course: blocks }));
  localStorage.setItem("dialog.tutorial.v1", "done");
})()`;

async function open(name, { width = 1440, height = 950, unlocked = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => problems.push(`${name}: pageerror ${e}`));
  page.on("console", (m) => {
    // Сетевые 404/501 в офлайновом прогоне — ожидаемы и не ошибка продукта.
    if (m.type() === "error" && !m.text().includes("Failed to load resource")) {
      problems.push(`${name}: console ${m.text().slice(0, 140)}`);
    }
  });
  await page.goto(URL, { waitUntil: "networkidle" });
  if (unlocked) {
    await page.evaluate(UNLOCKED);
    await page.reload({ waitUntil: "networkidle" });
  }
  return page;
}

const shot = (page, n) => page.screenshot({ path: `${OUT}/${n}.png`, fullPage: true });
// ХОДИМ ПО КЛЮЧУ РАЗДЕЛА, А НЕ ПО ПОДПИСИ. Подпись переводится вместе с
// продуктом, поэтому в английском режиме клик молча не срабатывал, а снимок
// всё равно сохранялся под именем раздела. Хуже того: «Прогресс» из меню
// убрали, и этот шаг падал на каждом прогоне — то есть смоук был красным
// столько же, сколько существовал removed-пункт. Ключ от языка не зависит, и
// переход теперь ПРОВЕРЯЕТСЯ: не состоялся — падаем здесь, а не на снимке.
const nav = async (page, key) => {
  await page.locator(`[data-nav="${key}"]`).first().click();
  await page.waitForTimeout(500);
  if (!(await page.locator(`[data-nav="${key}"].on`).count()))
    throw new Error(`переход в «${key}» не состоялся — снимок показал бы не тот экран`);
};

// 1. Домашний экран, кампания, своя сделка, экзамен, прогресс
{
  const page = await open("shell");
  await shot(page, "01-home");
  await nav(page, "campaign"); await shot(page, "02-campaign");
  await nav(page, "custom"); await shot(page, "03-custom");
  await nav(page, "exam"); await shot(page, "04-exam-mode");
  // «Прогресс» из меню убран: он вёл на ТОТ ЖЕ экран профиля. Снимок сохраняем
  // под прежним именем, чтобы не рвать ссылки в докладе.
  await nav(page, "profile"); await shot(page, "05-progress");
  await page.context().close();
}

// 2. Курс: карта → блок → урок → задание → вердикт
{
  const page = await open("course");
  await nav(page, "course"); await shot(page, "10-course-map");
  await page.locator(".cnode.current .cnode-btn").click();
  await page.waitForTimeout(400); await shot(page, "11-block");
  await page.locator(".lesson-list button").first().click();
  await page.waitForTimeout(300); await shot(page, "12-lesson");
  await page.locator("button:has-text('К заданиям')").click();
  await page.waitForTimeout(400);
  await page.locator(".ex-opt").first().click();
  await page.locator("button:has-text('Проверить')").click();
  await page.waitForTimeout(500); await shot(page, "13-verdict");
  await page.context().close();
}

// 3. Экзамен блока целиком (ответы наугад) — экран провала и урок восстановления
{
  const page = await open("exam");
  await nav(page, "course");
  await page.locator(".cnode.current .cnode-btn").click();
  await page.waitForTimeout(300);
  await page.locator("button:has-text('Сдавать экзамен')").click();
  await page.waitForTimeout(400);
  for (let i = 0; i < 8; i++) {
    const match = page.locator(".ex-match");
    if (await match.count()) {
      const left = match.locator("ul").first().locator("button");
      const right = match.locator("ul").nth(1).locator("button");
      const n = await left.count();
      for (let k = 0; k < n; k++) { await left.nth(k).click(); await right.nth(0).click(); }
    } else {
      const opt = page.locator(".ex-opt").first();
      if (await opt.count()) await opt.click();
    }
    const num = page.locator(".ex-num input");
    if (await num.count()) await num.fill("1");
    const free = page.locator(".ex-free textarea");
    if (await free.count()) await free.fill("нет");
    const check = page.locator("button:has-text('Проверить')");
    if (!(await check.count())) break;
    await check.click(); await page.waitForTimeout(350);
    const next = page.locator("button:has-text('Дальше'), button:has-text('Завершить')").first();
    if (!(await next.count())) break;
    await next.click(); await page.waitForTimeout(350);
  }
  await shot(page, "20-exam-result");
  if (!(await page.locator(".recovery").count())) {
    problems.push("exam: после провала нет урока восстановления");
  }
  await page.context().close();
}

// 4. Экзамен мастера (со всеми сданными блоками)
{
  const page = await open("master", { unlocked: true });
  await nav(page, "course");
  await page.locator(".master-card button").click();
  await page.waitForTimeout(400); await shot(page, "30-master");
  if ((await page.locator(".master-list li").count()) !== 3) {
    problems.push("master: ожидались три партии");
  }
  await page.context().close();
}

// 5. Телефон и английский
{
  const page = await open("phone", { width: 390, height: 844 });
  await nav(page, "course"); await shot(page, "40-course-phone");
  await page.context().close();

  const en = await open("en");
  await en.locator("button:has-text('EN')").first().click();
  await en.waitForTimeout(300);
  await nav(en, "Course"); await shot(en, "41-course-en");
  await en.context().close();
}

await browser.close();

if (problems.length) {
  console.error(`ПРОБЛЕМЫ (${problems.length}):\n` + problems.join("\n"));
  process.exit(1);
}
console.log(`обход пройден, ошибок нет · скриншоты: ${OUT}`);
