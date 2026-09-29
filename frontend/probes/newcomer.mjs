// newcomer.mjs — путь человека, который открыл продукт ВПЕРВЫЕ.
//
// ОТКУДА ОН. Коллега прошёл продукт глазами нового пользователя и вернул
// разбор: «человек, зашедший впервые, не понимает почти ничего». Этот прибор
// повторяет его путь — первый заход, тренировка, кампания с графиком цены,
// профиль, своя сделка, редактор — и на каждом экране ИЗМЕРЯЕТ то, на что
// была жалоба, а не только снимает картинку:
//   · вводная показывается при первом заходе, шаги идут по порядку, её можно
//     пропустить, и после перезагрузки она не возвращается;
//   · пройденная вводная главной НЕ гасит подсказки за столом в первой партии;
//   · у графика цены есть легенда (раскрытая в первой партии), цвета цели,
//     коридора, их старта и вашего предложения разные (сверяются вычисленные
//     стили, а не классы), а вместо линии без подписи — строка с числами;
//   · в профиле сказано, где работают слои, а живое видео-лицо помечено
//     недоступным;
//   · «Своя сделка» и «Редактор» объясняют, чем отличаются друг от друга.
//
// Запуск — против любой сборки фронтенда; без шлюза она играет на офлайн-ядре,
// то есть бесплатно и детерминированно:
//   npx vite --port 5188 &           # или VITE_MOCK=1 сборка + http.server
//   node probes/newcomer.mjs         # адрес — NEWCOMER_BASE, снимки — NEWCOMER_OUT
// Браузер — CHROME_PATH, иначе тот же поиск, что у e2e (e2e/browser.mjs).
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";
import { tsImport } from "tsx/esm/api";
import { browserExecutable } from "../e2e/browser.mjs";

const BASE = (process.env.NEWCOMER_BASE ?? "http://127.0.0.1:5188").replace(/\/+$/, "") + "/";
const OUT = process.env.NEWCOMER_OUT ?? "/tmp/dialog-newcomer";
mkdirSync(OUT, { recursive: true });

const { I18N } = await tsImport("../src/i18n.ts", import.meta.url);

const problems = [];
const notes = [];
const check = (ok, what) => { (ok ? notes : problems).push(`${ok ? "ok " : "BAD"} ${what}`); };

const browser = await chromium.launch({ executablePath: browserExecutable() });

async function fresh(width, height, lang) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => problems.push(`BAD pageerror: ${e.message}`));
  if (lang === "en") {
    await page.addInitScript(() => { try { localStorage.setItem("dialog.lang.v1", "en"); } catch { /* */ } });
  }
  return { ctx, page };
}

const tipTitle = (page) => page.locator(".onb-tip .onb-title").innerText().catch(() => null);

/** Вводная целиком: каждый шаг — снимок, счётчик, заголовок из словаря. */
async function walkTour(page, t, tag) {
  const titles = [];
  for (let i = 0; i < 6; i++) {
    const tip = page.locator(".onb-tip");
    if (!(await tip.count())) break;
    // Подсветка доезжает до цели вместе с плавной прокруткой: на телефоне
    // путь до рейла — несколько экранов. Ждём, пока подсказка замрёт.
    let prev = null;
    for (let k = 0; k < 20; k++) {
      await page.waitForTimeout(200);
      const b = await tip.boundingBox();
      if (prev && b && Math.abs(b.y - prev.y) < 0.5 && Math.abs(b.x - prev.x) < 0.5) break;
      prev = b;
    }
    titles.push(await tipTitle(page));
    const box = await tip.boundingBox();
    const vp = page.viewportSize();
    check(box && box.y >= 0 && box.y + box.height <= vp.height + 1 && box.x >= 0 && box.x + box.width <= vp.width + 1,
      `${tag}: подсказка «${titles.at(-1)}» целиком в окне (${box ? `${Math.round(box.x)},${Math.round(box.y)} ${Math.round(box.width)}×${Math.round(box.height)}` : "нет"})`);
    await page.screenshot({ path: `${OUT}/${tag}-tour-${i + 1}.png` });
    await page.locator(".onb-next").click();
  }
  return titles;
}

// ---- 1. Первый заход: вводная, RU, 1440×900 -----------------------------------
{
  const t = I18N.ru;
  const { ctx, page } = await fresh(1440, 900, "ru");
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForSelector(".onb-tip", { timeout: 8000 }).catch(() => null);
  const titles = await walkTour(page, t, "ru-1440");
  const expected = ["intro", "start", "nav", "progress"].map((k) => t.tour.steps[k].title);
  check(JSON.stringify(titles) === JSON.stringify(expected),
    `вводная: ${titles.length} шагов по порядку — ${titles.join(" → ")}`);
  check(!(await page.locator(".onb-tip").count()), "вводная закрылась после последнего шага");
  const stage = await page.evaluate(() => localStorage.getItem("dialog.tutorialDone.v1"));
  check(stage === "home", `флаг после вводной главной = "${stage}" (ожидается "home": подсказки за столом ещё впереди)`);

  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(900);
  check(!(await page.locator(".onb-tip").count()), "после перезагрузки вводная не вернулась");
  await page.screenshot({ path: `${OUT}/ru-1440-home.png`, fullPage: true });

  // Рейл и форматы: что где стоит.
  const railHeads = await page.locator(".rail .rail-head b").allInnerTexts();
  check(railHeads.some((h) => h.toLowerCase() === t.rail.progressHead.toLowerCase()), `рейл: группа «${t.rail.progressHead}» подписана`);
  const formats = await page.locator(".formats .rc h2").allInnerTexts();
  check(formats.length === 3, `другие форматы под каталогом: ${formats.join(" · ")}`);
  check(!(await page.locator(".rail [data-reading], .rail [data-other-side]").count()), "форматы тренировки больше не в рейле");
  for (const hint of [t.goal.hint, t.rank.hint]) {
    check(await page.getByText(hint, { exact: false }).count() > 0, `пояснение в рейле: «${hint.slice(0, 40)}…»`);
  }
  const method = page.locator(".rc-method summary").first();
  await method.click();
  check(await page.locator(".rc-method details[open] .rc-method-ex").count() === 1, "«Четыре главных приёма»: пример раскрывается по нажатию");

  // Повтор вводной с кнопки.
  await page.locator(".practice-tour").click();
  await page.waitForSelector(".onb-tip", { timeout: 4000 }).catch(() => null);
  check(await page.locator(".onb-tip").count() === 1, "кнопка «Как здесь всё устроено?» открывает вводную заново");
  await page.locator(".onb-skip").click();
  check(!(await page.locator(".onb-tip").count()), "«Пропустить» закрывает вводную");

  // ---- 2. Первая партия: подсказки за столом живы после вводной главной -------
  await page.locator(".route-cta").click();
  await page.waitForSelector(".dealtracker", { timeout: 20000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/ru-1440-table-t0.png` });
  await page.fill("textarea", "Расскажите, как у вас устроено производство?");
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => !document.querySelector("textarea")?.disabled, null, { timeout: 30000 });
  await page.waitForSelector(".onb-tip", { timeout: 6000 }).catch(() => null);
  check(await page.locator(".onb-tip").count() === 1,
    `подсказка за столом в первой партии показалась: «${await tipTitle(page)}»`);
  await page.screenshot({ path: `${OUT}/ru-1440-table-coachmark.png` });
  await ctx.close();
}

// ---- 3. Кампания: график цены ----------------------------------------------------
async function campaignTracker(lang, tag) {
  const t = I18N[lang];
  const { ctx, page } = await fresh(1440, 900, lang);
  await page.addInitScript(() => { try { localStorage.setItem("dialog.tutorialDone.v1", "1"); } catch { /* */ } });
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.click('[data-nav="campaign"]');
  await page.waitForSelector(".camp-cta", { timeout: 15000 });
  await page.click(".camp-cta");
  await page.waitForSelector(".dealtracker", { timeout: 20000 });
  await page.waitForTimeout(700);
  await page.locator(".dealtracker").screenshot({ path: `${OUT}/${tag}-tracker-t0.png` });

  const lines = lang === "ru"
    ? ["Что для вас важно в бюджете отдела?", "По рыночным данным справедливая цифра выше — давайте опираться на них.", "Предлагаю 225."]
    : ["What matters to you about the department budget?", "Market data puts the fair figure higher — let's use it.", "I propose 225."];
  for (const line of lines) {
    await page.fill("textarea", line);
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => !document.querySelector("textarea")?.disabled, null, { timeout: 30000 });
    await page.waitForTimeout(500);
  }
  const tr = page.locator(".dealtracker");
  await tr.screenshot({ path: `${OUT}/${tag}-tracker-t3.png` });
  await page.screenshot({ path: `${OUT}/${tag}-table-t3.png` });

  const legend = await tr.locator(".dt-legend li").allInnerTexts();
  check(legend.length >= 5, `${tag}: легенда графика — ${legend.length} строк: ${legend.map((s) => s.split(" · ")[0].split(" — ")[0]).join(" | ")}`);
  check(legend.some((s) => s.startsWith(t.tracker.redline)), `${tag}: красная линия названа «${t.tracker.redline}»`);
  check(await tr.locator(".dt-status").count() === 1, `${tag}: строка «что это значит»: ${await tr.locator(".dt-status").innerText().catch(() => "—")}`);
  check(await tr.locator(".dt-trail").count() === 1, `${tag}: путь их цены строкой: ${await tr.locator(".dt-trail").innerText().catch(() => "—")}`);
  check(await tr.locator("svg path").count() === 0, `${tag}: непонятного снижающегося графика больше нет`);
  // Новичок (профиль пуст) видит легенду раскрытой.
  check(await tr.locator("details.dt-key[open]").count() === 1, `${tag}: легенда раскрыта в первой партии`);

  // Цвета — по вычисленным стилям образцов легенды.
  const colors = await tr.evaluate((root) => {
    const bg = (sel, prop = "backgroundColor") => {
      const el = root.querySelector(sel);
      return el ? getComputedStyle(el)[prop] : null;
    };
    return {
      target: bg(".dt-legend .sw-target"),
      zone: bg(".dt-legend .sw-zone", "backgroundImage"),
      start: bg(".dt-legend .sw-start", "borderTopColor"),
      theirs: bg(".dt-legend .sw-theirs"),
      yours: bg(".dt-legend .sw-yours"),
      redline: bg(".dt-legend .sw-redline"),
    };
  });
  const green = colors.target;
  const others = { zone: colors.zone, start: colors.start, yours: colors.yours };
  for (const [k, v] of Object.entries(others)) {
    // Своего предложения может ещё не быть: движок не услышал числа — метки нет.
    if (v == null && k === "yours") { notes.push(`--  ${tag}: вашего предложения на шкале нет — число не прозвучало`); continue; }
    check(v && !String(v).includes(green), `${tag}: «${k}» не того же цвета, что цель (${green} vs ${v})`);
  }
  // Подписи шкалы не вылезают за карточку.
  const overflow = await tr.evaluate((root) => {
    const card = root.getBoundingClientRect();
    return [...root.querySelectorAll(".dt-scale .lbl, .dt-end")]
      .map((el) => el.getBoundingClientRect())
      .filter((r) => r.left < card.left - 0.5 || r.right > card.right + 0.5).length;
  });
  check(overflow === 0, `${tag}: подписи шкалы внутри карточки (за краем: ${overflow})`);

  // Что можно предложить взамен — раскрыть и снять.
  const more = page.locator(".side-more-toggle");
  if (await more.count()) {
    await more.click();
    await page.waitForTimeout(400);
    const terms = page.locator(".dealterms");
    if (await terms.count()) {
      await terms.screenshot({ path: `${OUT}/${tag}-terms.png` });
      // innerText отдаёт текст с учётом text-transform — заголовок набран капсом.
      check((await terms.innerText()).toLowerCase().includes(t.terms.title.toLowerCase()),
        `${tag}: панель условий названа «${t.terms.title}»`);
    }
  }
  const batna = await page.locator(".batna b").innerText().catch(() => "");
  check(/запасн|fallback/i.test(batna), `${tag}: BATNA расшифрована на столе — «${batna.trim()}»`);
  await ctx.close();
}
await campaignTracker("ru", "ru-campaign");
await campaignTracker("en", "en-campaign");

// ---- 4. Профиль, своя сделка, редактор ---------------------------------------------
for (const lang of ["ru", "en"]) {
  const t = I18N[lang];
  const { ctx, page } = await fresh(1440, 900, lang);
  await page.addInitScript(() => { try { localStorage.setItem("dialog.tutorialDone.v1", "1"); } catch { /* */ } });
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.click('[data-nav="profile"]');
  await page.waitForSelector(".prof-layers", { timeout: 10000 });
  await page.waitForTimeout(400);
  await page.locator(".prof-layers").screenshot({ path: `${OUT}/${lang}-profile-layers.png` });
  check((await page.locator(".lay-where").innerText()).includes(lang === "ru" ? "Тренировка" : "Training"),
    `${lang}: профиль говорит, где работают слои`);
  const later = await page.locator(".ly-later").innerText().catch(() => "");
  check(later.toLowerCase().includes(t.layers.unavailable.toLowerCase()),
    `${lang}: живое видео-лицо помечено «${t.layers.unavailable}»: ${later.replace(/\s+/g, " ")}`);

  await page.click('[data-nav="custom"]');
  await page.waitForSelector(".cust-vs", { timeout: 10000 });
  await page.screenshot({ path: `${OUT}/${lang}-custom.png`, fullPage: true });
  check((await page.locator(".cust-vs").innerText()).length > 40, `${lang}: «Своя сделка» объясняет отличие от редактора`);

  await page.click('[data-nav="admin"]');
  await page.waitForSelector(".admin-vs", { timeout: 15000 });
  await page.screenshot({ path: `${OUT}/${lang}-admin.png`, fullPage: true });
  check((await page.locator(".admin-vs").innerText()).length > 40, `${lang}: «Редактор» объясняет отличие от своей сделки`);
  await ctx.close();
}

// ---- 5. Телефон: вводная влезает в окно ---------------------------------------
{
  const { ctx, page } = await fresh(390, 844, "ru");
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForSelector(".onb-tip", { timeout: 8000 }).catch(() => null);
  const titles = await walkTour(page, I18N.ru, "ru-390");
  check(titles.length >= 3, `телефон: вводная прошла ${titles.length} шагов`);
  await ctx.close();
}

await browser.close();
console.log(notes.join("\n"));
if (problems.length) {
  console.log(problems.join("\n"));
  console.log(`\n${problems.length} проблем · снимки в ${OUT}`);
  process.exit(1);
}
console.log(`\nвсё чисто · ${notes.length} проверок · снимки в ${OUT}`);
