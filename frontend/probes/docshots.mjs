// docshots.mjs — снимки для документации, снятые ОДНОЙ КОМАНДОЙ.
//
// ЗАЧЕМ ОТДЕЛЬНЫЙ ПРИБОР. Снимки в docs/screenshots лежали с 15–22 августа и
// показывали скин «додзё», удалённый из продукта целиком. Их читает не только
// человек: `.claude/agents/creative-director.md` прямо велит критику судить
// облик по этим PNG — то есть часть визуального разбора относилась к
// приложению, которого больше нет.
//
// Пересъёмка руками не делается никогда, поэтому она сделана командой:
//   node probes/docshots.mjs
//
// Прибор обхода (audit.mjs) снимает 25 состояний в /tmp для разбора находок;
// здесь — ровно те пять кадров, на которые ссылается docs/course.md, под их
// собственными именами.
import { chromium } from "playwright-core";
import fs from "fs";
import crypto from "crypto";
import path from "path";

const EXE = "/root/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome";
const BASE = process.env.DOCSHOT_BASE ?? "http://127.0.0.1:5199/";
const OUT = path.join(process.cwd(), "..", "docs", "screenshots");

// Та же сверка, что и у обходчика: снимок чужой сборки хуже отсутствующего,
// потому что он выглядит свежим.
//
// СВЕРЯТЬСЯ НАДО С ТОЙ СБОРКОЙ, КОТОРУЮ И РАЗДАЮТ. Здесь стоял жёсткий `dist`,
// а адрес по умолчанию — порт ОФЛАЙНОВОЙ сборки (`dist-mock`, рецепт в
// probes/README.md). Проверка проходила ровно до тех пор, пока на том порту по
// ошибке стоял сервер с онлайновой сборкой: то есть она была зелёной от чужой
// поломки и покраснела от починки. Каталог теперь выбирается по адресу и
// переопределяется тем же способом, что и адрес.
const bundleOf = (html) => (html.match(/assets\/index-[A-Za-z0-9_.-]+\.js/) || [])[0] || null;
const DIST = process.env.DOCSHOT_DIST
  ?? (BASE.includes(":5199") ? "dist-mock" : "dist");
const want = bundleOf(fs.readFileSync(path.join(process.cwd(), DIST, "index.html"), "utf-8"));
const got = bundleOf(await (await fetch(BASE)).text());
if (!want || want !== got) {
  console.error(`ЧУЖАЯ СБОРКА: раздаётся ${got}, на диске ${want}. Съёмка отменена.`);
  process.exit(2);
}
console.log(`сборка сверена: ${want} (${DIST})`);

const browser = await chromium.launch({ executablePath: EXE, args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
await page.addInitScript(() => { try { localStorage.setItem("dialog.tutorialDone.v1", "1"); } catch {} });
await page.goto(BASE, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2000);

// ДВА ОДИНАКОВЫХ КАДРА ПОД РАЗНЫМИ ИМЕНАМИ — ЭТО ПРОМАХ ОБХОДА, А НЕ СНИМОК.
//
// Прибор писался с тезисом «снимок чужой сборки хуже отсутствующего, потому что
// выглядит свежим» — и сам же его нарушил: три клика шли по селекторам, которых
// в разметке нет (`.lesson-row`, `.opt-btn`), промах глотался `.catch`, и три
// экрана курса сохранились одним и тем же кадром под тремя именами. Байт в байт.
//
// Урок один и тот же третий раз за сутки, поэтому он встроен в конструкцию, а не
// в намерение: любой обход, который может промахнуться молча, ОБЯЗАН ПАДАТЬ.
const seen = new Map();
const shot = async (name) => {
  await page.waitForTimeout(700);
  const buf = await page.screenshot({ fullPage: true });
  const sum = crypto.createHash("md5").update(buf).digest("hex");
  if (seen.has(sum)) {
    console.error(`ПРОМАХ ОБХОДА: «${name}» совпал байт в байт с «${seen.get(sum)}».\n` +
      "Экран не сменился — значит клик не сработал, а кадр сохранился бы под чужим именем.");
await browser.close();
    process.exit(2);
  }
  seen.set(sum, name);
  fs.writeFileSync(path.join(OUT, name), buf);
  console.log("  снят:", name);
};

// ——— главная и партия ———
// Эти кадры не упомянуты в docs/*.md, но их читает АГЕНТ-КРИТИК:
// .claude/agents/creative-director.md велит судить облик продукта по PNG в этой
// папке. Пока они показывали удалённый скин «додзё», часть визуального разбора
// относилась к приложению, которого больше нет.
await shot("01-home.png");

await page.getByRole("button", { name: /НАЧАТЬ|ЗА СТОЛ|START|TO THE TABLE/i }).first()
  .click().catch(() => {});
await page.waitForTimeout(2500);
await shot("02-game-start.png");

const composer = page.locator("textarea").first();
if (await composer.count()) {
  await composer.fill("Ирина, что для вас важнее всего в этом контракте и почему именно это?");
  await page.keyboard.press("Enter");
  // Ход идёт к судье и модели: ждём дольше, иначе снимок поймает пустой пузырь.
  await page.waitForTimeout(9000);
  await shot("03-after-turn.png");
}

await page.locator('[data-nav="campaign"]').first().click().catch(() => {});
await page.waitForTimeout(1500);
await shot("30-campaign-arc.png");

await page.locator('[data-nav="custom"]').first().click().catch(() => {});
await page.waitForTimeout(1200);
await shot("10-custom-situation.png");

// ——— курс ———
await page.locator('[data-nav="course"]').first().click();
await page.waitForTimeout(1200);
await shot("40-course-map.png");

await page.locator(".cnode-btn:not(:disabled)").first().click();
await page.waitForTimeout(900);
await shot("41-course-block.png");

// Урок: первый доступный пункт внутри блока.
await page.locator(".lesson-list button").first().click();
await page.waitForTimeout(900);
await shot("42-course-lesson.png");

// Задание и вердикт: доходим до упражнения и отвечаем НЕВЕРНО намеренно —
// вердикт с разбором ошибки и есть то, что показывает docs/course.md.
await page.getByRole("button", { name: /К заданиям|To the tasks/i }).first().click().catch(() => {});
await page.waitForTimeout(1000);
const option = page.locator(".ex-opt").first();
if (await option.count()) {
  await option.click().catch(() => {});
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: /Проверить|Check/i }).first().click().catch(() => {});
  await page.waitForTimeout(1200);
}
await shot("43-course-verdict.png");

// Комментарий тренера бывает ТОЛЬКО у свободного ответа, а он не первый в
// блоке: задания разбиты ПО УРОКАМ, по одному-два на урок. Поэтому обходим
// уроки — ровно как это делает обходчик, — и останавливаемся на первом поле
// ввода. Не встретилось ни в одном — честно говорим, а не подставляем другой
// кадр под этим именем.
// СВЕЖАЯ СТРАНИЦА, А НЕ ВОЗВРАТ ПО ШАГАМ. Прежде обход шёл сюда прямо из
// открытого упражнения через карту курса, и переход не успевал: список уроков
// оказывался пустым, цикл заканчивался на нулевом шаге, а кадр «пропускался».
// Отладка показала, что сам путь исправен — ломался только вход в него.
let coached = false;
await page.goto(BASE, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2000);
await page.locator('[data-nav="course"]').first().click();
await page.waitForTimeout(1400);
await page.locator(".cnode-btn:not(:disabled)").first().click();
await page.waitForTimeout(1200);

const lessons = await page.locator(".lesson-list button").count();
for (let li = 0; li < Math.min(lessons, 6) && !coached; li++) {
  const row = page.locator(".lesson-list button");
  if ((await row.count()) <= li) break;
  await row.nth(li).click().catch(() => {});
  await page.waitForTimeout(800);
  // По РОЛИ, а не по тексту: getByText ловит и заголовок, и подпись, клик по
  // ним молча ничего не делает, а `.catch` это глотает. Так же ходит обходчик.
  const toTasks = page.getByRole("button", { name: /К заданиям|To the tasks/i }).first();
  if (await toTasks.count()) { await toTasks.click().catch(() => {}); await page.waitForTimeout(1000); }

  for (let step = 0; step < 6 && !coached; step++) {
    const box = page.locator(".ex textarea").first();
    if (await box.count()) {
      await box.fill("Если мы дадим годовой контракт и предоплату — сможете подвинуться по цене?");
      await page.getByRole("button", { name: /Проверить|Check/i }).first().click().catch(() => {});
      // Комментарий тренера идёт в модель, а не считается на месте: ждём дольше.
      await page.waitForTimeout(4000);
      await shot("44-course-coach.png");
      coached = true;
      break;
    }
    const next = page.getByRole("button", { name: /^(Дальше|Далее|Next)/i }).first();
    if (!(await next.count())) break;
    await next.click().catch(() => {});
    await page.waitForTimeout(700);
  }
  if (!coached) {
    // Возврат к списку уроков — кнопкой «← <блок>», а не через карту курса:
    // уход на карту и повторный вход в блок сбрасывал список, и обход
    // останавливался на первом же уроке.
    await page.getByRole("button", { name: /^←/ }).first().click().catch(() => {});
    await page.waitForTimeout(800);
  }
}
if (!coached) console.log("  ПРОПУЩЕН 44-course-coach.png: свободного ответа в первом блоке не нашлось");

    // ——— разбор ———
// РАЗБОРА В ПАПКЕ НЕ БЫЛО ВОВСЕ — экрана, ради которого играют: грейд с тремя
// составляющими, занавес над скрытыми интересами, ключевые ходы цитатами,
// контрфакт. Пять снимков курса при нуле снимков разбора — неверная расстановка
// акцентов для того, кто судит продукт по этой папке.
await page.goto(BASE, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2000);
await page.getByRole("button", { name: /НАЧАТЬ|ЗА СТОЛ|START|TO THE TABLE/i }).first()
  .click().catch(() => {});
await page.waitForTimeout(2500);

// Принципиальная линия — та же, которой доказывается инвариант 2.
const PRINCIPLED = [
  "Здравствуйте! Почему для вас так важна стабильная загрузка производства?",
  "Понимаю вас. А почему для вас важен денежный поток и предоплата?",
  "Зачем вам разовый заказ, если можно долгосрочный годовой контракт?",
  "По рыночным данным медиана независимых прайсов 86, потому что это отраслевой стандарт.",
  "Если мы дадим годовой контракт с гарантией объёма и предоплату, сможете подвинуться к 86?",
  "Фиксируем пакет: годовой контракт, предоплата — и цена 86. Договорились?",
];
for (const line of PRINCIPLED) {
  const box = page.locator("textarea").first();
  if (!(await box.count())) break;
  await box.fill(line);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(2200);
}
// Разбор приезжает после того, как стол додержит исход.
await page.waitForTimeout(9000);
if (await page.locator(".debrief").count()) {
  await shot("50-debrief.png");
} else {
  console.log("  ПРОПУЩЕН 50-debrief.png: партия не дошла до разбора");
}

await browser.close();
console.log("готово:", OUT);
