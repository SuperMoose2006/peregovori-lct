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

const { TOURS } = await tsImport("../src/lib/tours.ts", import.meta.url);
const TOURS_OFF = '{"enabled":false}';

/** Подсказка замерла: плавная прокрутка до цели закончилась. */
async function settle(page) {
  const tip = page.locator(".onb-tip");
  let prev = null;
  for (let k = 0; k < 25; k++) {
    await page.waitForTimeout(200);
    const b = await tip.boundingBox().catch(() => null);
    if (prev && b && Math.abs(b.y - prev.y) < 0.5 && Math.abs(b.x - prev.x) < 0.5) return;
    prev = b;
  }
}

/** Тур раздела целиком: каждый шаг — снимок, место в окне, галочка, заголовок
 *  из словаря именно этого раздела и именно в том порядке, что в TOURS. */
async function walkTour(page, t, section, tag) {
  await page.waitForSelector(".onb-tip", { timeout: 20000 }).catch(() => null);
  const titles = [];
  for (let i = 0; i < 9; i++) {
    const tip = page.locator(".onb-tip");
    if (!(await tip.count())) break;
    await settle(page);
    titles.push(await tipTitle(page));
    const box = await tip.boundingBox();
    const vp = page.viewportSize();
    check(box && box.y >= 0 && box.y + box.height <= vp.height + 1 && box.x >= 0 && box.x + box.width <= vp.width + 1,
      `${tag}: «${titles.at(-1)}» целиком в окне (${box ? `${Math.round(box.x)},${Math.round(box.y)} ${Math.round(box.width)}×${Math.round(box.height)}` : "нет"})`);
    if (i === 0) check(await tip.locator('.onb-opt input[type="checkbox"]').count() === 1, `${tag}: в карточке видна галочка «${t.tour.dontShow}»`);
    await page.screenshot({ path: `${OUT}/${tag}-${String(i + 1).padStart(2, "0")}.png` });
    await page.locator(".onb-next").click();
  }
  const order = TOURS[section].map((st) => t.tours[section][st.id].title);
  const inOrder = titles.every((x, k) => k === 0 || order.indexOf(x) > order.indexOf(titles[k - 1]));
  check(titles.length >= 3 && titles.every((x) => order.includes(x)) && inOrder,
    `${tag}: тур раздела «${t.tour.names[section]}» — ${titles.length} шагов: ${titles.join(" → ")}`);
  check(!(await page.locator(".onb-tip").count()), `${tag}: тур закрылся после последнего шага`);
  return titles;
}

/** Уйти в раздел меню и дождаться его тура. */
async function enter(page, nav) {
  await page.locator(`[data-nav="${nav}"]`).first().click();
  await page.waitForTimeout(400);
}

// ---- 1. Туры во всех разделах: RU/EN × 1440/390 -----------------------------------
for (const [lang, w, h] of [["ru", 1440, 900], ["en", 1440, 900], ["ru", 390, 844], ["en", 390, 844]]) {
  const t = I18N[lang];
  const tag = `${lang}-${w}`;
  const { ctx, page } = await fresh(w, h, lang);
  await page.goto(BASE, { waitUntil: "networkidle" });
  await walkTour(page, t, "home", `${tag}-tour-home`);
  for (const [nav, section] of [["campaign", "campaign"], ["course", "course"], ["custom", "custom"],
                                ["exam", "exam"], ["profile", "profile"], ["admin", "admin"]]) {
    await enter(page, nav);
    await walkTour(page, t, section, `${tag}-tour-${section}`);
  }
  // Вернулся на главную в том же сеансе — тур второй раз не всплывает.
  await enter(page, "practice");
  await page.waitForTimeout(900);
  check(!(await page.locator(".onb-tip").count()), `${tag}: главная в том же сеансе — тур не повторился`);
  await page.locator(".route-cta").click();
  await page.waitForSelector(".dealtracker", { timeout: 20000 });
  const table = await walkTour(page, t, "table", `${tag}-tour-table`);
  check(table.length === TOURS.table.length, `${tag}: за столом все ${TOURS.table.length} шагов (${table.length})`);
  await ctx.close();
}

// ---- 2. Сеанс, галочка, общий переключатель, кнопка тура — RU, 1440 -------------------
{
  const t = I18N.ru;
  const { ctx, page } = await fresh(1440, 900, "ru");
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForSelector(".onb-tip", { timeout: 8000 }).catch(() => null);
  await page.locator(".onb-skip").click();
  await enter(page, "course");
  await page.waitForSelector(".onb-tip", { timeout: 20000 }).catch(() => null);
  check(await page.locator(".onb-tip").count() === 1, "курс: тур при первом входе");
  await page.locator(".onb-skip").click();
  await enter(page, "custom");
  await page.waitForSelector(".onb-tip", { timeout: 8000 }).catch(() => null);
  await page.locator(".onb-skip").click().catch(() => {});
  await enter(page, "course");
  await page.waitForTimeout(1500);
  check(!(await page.locator(".onb-tip").count()), "курс: ушёл и вернулся в том же сеансе — второй раз не всплыл");
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  check(!(await page.locator(".onb-tip").count()), "перезагрузка той же вкладки — тур не повторился");

  // Кнопка в шапке — тур ТЕКУЩЕГО раздела.
  await enter(page, "course");
  await page.locator(".tour-help").click();
  await page.waitForSelector(".onb-tip", { timeout: 20000 }).catch(() => null);
  const first = await tipTitle(page);
  check(Object.values(t.tours.course).some((c) => c.title === first), `«${t.tour.replay}» в курсе открывает тур курса: «${first}»`);
  // Галочка «Больше не показывать в этом разделе».
  await page.locator('.onb-opt input[type="checkbox"]').check();
  await page.screenshot({ path: `${OUT}/ru-1440-dontshow-checked.png` });
  await page.locator(".onb-skip").click();
  const prefs = await page.evaluate(() => localStorage.getItem("dialog.tours.v1"));
  check(/"off":\["course"\]/.test(prefs ?? ""), `галочка отключила только курс: ${prefs}`);

  // Новая вкладка — новый сеанс: главная снова с туром, курс — без.
  const tab = await ctx.newPage();
  await tab.goto(BASE, { waitUntil: "networkidle" });
  await tab.waitForSelector(".onb-tip", { timeout: 8000 }).catch(() => null);
  check(await tab.locator(".onb-tip").count() === 1, "новая вкладка: тур главной снова показан");
  await tab.locator(".onb-skip").click();
  await enter(tab, "course");
  await tab.waitForTimeout(2000);
  check(!(await tab.locator(".onb-tip").count()), "новая вкладка: курс, отключённый галочкой, молчит");

  // Профиль: общий переключатель и возврат отключённого.
  await enter(tab, "profile");
  await tab.waitForSelector(".tour-prefs");
  await tab.locator(".onb-skip").click().catch(() => {});
  const off = await tab.locator(".tp-off").innerText().catch(() => "");
  check(off.includes(t.tour.names.course), `профиль говорит, где подсказки отключены: «${off}»`);
  await tab.locator(".tour-prefs").screenshot({ path: `${OUT}/ru-1440-profile-tips-off.png` });
  await tab.locator(".tp-restore").click();
  const back = await tab.evaluate(() => localStorage.getItem("dialog.tours.v1"));
  check(/"off":\[\]/.test(back ?? "") && /"enabled":true/.test(back ?? ""), `«${t.tour.prefsRestore}» вернул подсказки: ${back}`);
  await tab.locator('.tour-prefs [role="switch"]').click();
  const allOff = await tab.evaluate(() => localStorage.getItem("dialog.tours.v1"));
  check(/"enabled":false/.test(allOff ?? ""), `общий переключатель выключил подсказки: ${allOff}`);
  await tab.locator(".tour-prefs").screenshot({ path: `${OUT}/ru-1440-profile-tips-switch.png` });
  const tab2 = await ctx.newPage();
  await tab2.goto(BASE, { waitUntil: "networkidle" });
  await tab2.waitForTimeout(1500);
  check(!(await tab2.locator(".onb-tip").count()), "подсказки выключены в профиле — новая вкладка молчит");
  await tab2.locator(".tour-help").click();
  await tab2.waitForSelector(".onb-tip", { timeout: 8000 }).catch(() => null);
  check(await tab2.locator(".onb-tip").count() === 1, "даже выключенные, по кнопке «Как здесь всё устроено?» подсказки есть");
  await ctx.close();
}

// ---- 3. Первая партия: подсказки за столом ждут конца тура стола ----------------------
{
  const { ctx, page } = await fresh(1440, 900, "ru");
  // Явный выбор «Классика»: здесь меряются подсказки первой партии, а вопрос
  // «Читай лицо» (у нового профиля он включён умолчанием) запирал бы поле ввода.
  await page.addInitScript(() => { if (!localStorage.getItem("dialog.layers.v1")) localStorage.setItem("dialog.layers.v1", '{"probe":false,"voice":false,"camera":false,"avatar":false,"pokerface":false}'); });
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForSelector(".onb-tip", { timeout: 8000 }).catch(() => null);
  await page.locator(".onb-skip").click();
  // Рейл и форматы: что где стоит.
  const t = I18N.ru;
  await page.screenshot({ path: `${OUT}/ru-1440-home.png`, fullPage: true });
  const railHeads = await page.locator(".rail .rail-head b").allInnerTexts();
  check(railHeads.some((h) => h.toLowerCase() === t.rail.progressHead.toLowerCase()), `рейл: группа «${t.rail.progressHead}» подписана`);
  const formats = await page.locator(".formats .rc h2").allInnerTexts();
  check(formats.length === 3, `другие форматы под каталогом: ${formats.join(" · ")}`);
  const method = page.locator(".rc-method summary").first();
  await method.click();
  check(await page.locator(".rc-method details[open] .rc-method-ex").count() === 1, "«Четыре главных приёма»: пример раскрывается по нажатию");
  await page.locator(".route-cta").click();
  await page.waitForSelector(".dealtracker", { timeout: 20000 });
  await page.waitForSelector(".onb-tip", { timeout: 20000 }).catch(() => null);
  await page.locator(".onb-skip").click();
  await page.fill("textarea", "Расскажите, как у вас устроено производство?");
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => !document.querySelector("textarea")?.disabled, null, { timeout: 30000 });
  await page.waitForSelector(".onb-tip", { timeout: 6000 }).catch(() => null);
  check(await page.locator(".onb-tip").count() === 1,
    `подсказка первой партии после тура стола показалась: «${await tipTitle(page)}»`);
  await page.screenshot({ path: `${OUT}/ru-1440-table-coachmark.png` });
  await page.locator(".onb-skip").click().catch(() => {});

  // Доиграть принципиальную партию и пройти тур разбора.
  const lines = [
    "А почему для вас важна оплата — предоплата помогла бы?",
    "Что критично по сроку контракта: разовая поставка или годовой?",
    "По рынку аналог идёт 86-88; альтернатива у нас по 95, но с риском качества. Ориентир — 86.",
    "Если дадим годовой контракт с гарантией объёма и 30% предоплату — подвинетесь к 86?",
    "Договорились: 86 ₽/шт, годовой контракт, предоплата 30%. Фиксируем?",
  ];
  const closing = lines[lines.length - 1];
  for (let k = 0; k < 6; k++) lines.push(closing); // стол закрывается, когда цена сошлась
  for (const line of lines) {
    if (await page.locator(".gh, .outcome").count()) break;
    if (!(await page.locator("textarea:not([disabled])").count())) break;
    await page.fill("textarea", line);
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => !document.querySelector("textarea")?.disabled || document.querySelector(".outcome"), null, { timeout: 30000 });
    await page.waitForTimeout(400);
    await page.locator(".onb-skip").click({ timeout: 500 }).catch(() => {});
  }
  await page.locator(".oc-go:not([disabled])").click({ timeout: 15000 }).catch(() => {});
  await page.waitForSelector(".gh", { timeout: 20000 }).catch(() => null);
  if (await page.locator(".gh").count()) {
    const deb = await walkTour(page, t, "debrief", "ru-1440-tour-debrief");
    check(deb.length >= 3, `разбор: тур из ${deb.length} шагов`);
  } else {
    check(false, "разбор так и не открылся — тур разбора не проверен");
  }
  await ctx.close();
}

// ---- 3. Кампания: график цены ----------------------------------------------------
async function campaignTracker(lang, tag) {
  const t = I18N[lang];
  const { ctx, page } = await fresh(1440, 900, lang);
  await page.addInitScript((off) => { try { localStorage.setItem("dialog.tutorialDone.v1", "1"); localStorage.setItem("dialog.tours.v1", off); } catch { /* */ } }, TOURS_OFF);
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

// ---- 3б. Умолчание: новый профиль — все слои включены, недоступные гаснут с причиной ----
{
  const t = I18N.ru;
  const { ctx, page } = await fresh(1440, 900, "ru");
  await page.addInitScript((off) => { localStorage.setItem("dialog.tours.v1", off); }, TOURS_OFF);
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.locator('[data-nav="profile"]').first().click();
  await page.waitForSelector(".prof-layers");
  await page.waitForTimeout(800);
  const state = async (name) => page.locator(".prof-layers").getByRole("switch", { name, exact: true }).getAttribute("aria-checked");
  const probeOn = await state(t.layers.names.probe);
  check(probeOn === "true", `умолчание: «${t.layers.names.probe}» включён у нового профиля (${probeOn})`);
  for (const id of ["voice", "camera"]) {
    const on = await state(t.layers.names[id]);
    const card = await page.locator(".prof-layers .layer").filter({ has: page.getByRole("switch", { name: t.layers.names[id], exact: true }) }).innerText();
    const avail = !/нет связи|на сервере|нужен https/i.test(card);
    check(avail ? on === "true" : on === "false",
      `умолчание: «${t.layers.names[id]}» ${avail ? "включён, доступ спросят в начале партии" : "погашен с причиной"} (${on}): ${card.replace(/\s+/g, " ").slice(0, 140)}`);
  }
  const stored = await page.evaluate(() => localStorage.getItem("dialog.layers.v1"));
  check(stored === null, `умолчание не записано как выбор человека (${stored})`);
  await page.locator(".prof-layers").screenshot({ path: `${OUT}/ru-1440-layers-default.png` });
  await ctx.close();
}

// ---- 4. Профиль, своя сделка, редактор ---------------------------------------------
for (const lang of ["ru", "en"]) {
  const t = I18N[lang];
  const { ctx, page } = await fresh(1440, 900, lang);
  await page.addInitScript((off) => { try { localStorage.setItem("dialog.tutorialDone.v1", "1"); localStorage.setItem("dialog.tours.v1", off); } catch { /* */ } }, TOURS_OFF);
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.click('[data-nav="profile"]');
  await page.waitForSelector(".prof-layers", { timeout: 10000 });
  await page.waitForTimeout(400);
  await page.locator(".prof-layers").screenshot({ path: `${OUT}/${lang}-profile-layers.png` });
  check((await page.locator(".lay-where").innerText()).includes(lang === "ru" ? "Тренировка" : "Training"),
    `${lang}: профиль говорит, где работают слои`);
  const later = await page.locator(".ly-later").innerText().catch(() => "");
  check(later.includes(t.layers.avatarVideo), `${lang}: про живое видео-лицо сказано, что будет в обоих случаях: ${later.replace(/\s+/g, " ")}`);

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

await browser.close();
console.log(notes.join("\n"));
if (problems.length) {
  console.log(problems.join("\n"));
  console.log(`\n${problems.length} проблем · снимки в ${OUT}`);
  process.exit(1);
}
console.log(`\nвсё чисто · ${notes.length} проверок · снимки в ${OUT}`);
