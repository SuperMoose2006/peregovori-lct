// ui.mjs — оболочка продукта глазами человека: тема, язык, телефон, клавиатура.
//
//   theme     светлая/тёмная включается сразу (в том числе посреди партии, не
//             перезапуская её) и переживает перезагрузку
//   language  RU/EN включается сразу, переживает перезагрузку; на английских
//             экранах нет русского текста (инвариант 4)
//   mobile    390×844: ни один главный экран, стол, шторка и разбор не уезжают
//             вбок; все пункты меню видны и нажимаются
//   keyboard  Tab: первая остановка — «К содержимому», дальше всё меню и
//             карточки оппонентов, фокус виден на КАЖДОЙ остановке; Esc
//             закрывает чтение стола, обратную сторону, шторку слоёв и веху,
//             фокус возвращается на открывашку, Tab не выпадает из модалки
//
// Гигиена каждого экрана (консоль, эмодзи, alt, внешние запросы) — в harness.mjs.
// Утверждается поведение, а не вид: ни цветов, ни классов, ни координат.
//
//   node e2e/ui.mjs --url http://127.0.0.1:8013 --out /tmp/e2e-ui [--only mobile] [--strict]
// (как поднять офлайн-шлюз на своей сборке — в шапке flows.mjs)
import {
  Suite, I18N, GAMES, HOSTILE_RU, esc, composer, waitTable, playLine, playUntilDebrief, readDebrief,
  escapeModals, nav, tabTo, until, focusIsVisible, describeFocus,
} from "./harness.mjs";

const KNOWN_BUGS = {
  "lang-toggle-no-state":
    "Кнопки RU/EN не сообщают, какая из них выбрана: состояние передаётся только классом " +
    "`on` (App.tsx), без aria-pressed/aria-current. Диктор слышит две одинаковые кнопки. " +
    "Соседняя кнопка темы это умеет (aria-pressed).",
  "milestone-focus-to-body":
    "Веха всплывает в момент конца партии; её «открывашкой» useModalShell запоминает поле реплики, " +
    "которое к закрытию уже скрыто (`hidden` на финале). Esc → focus() на скрытый элемент молча " +
    "не срабатывает, фокус падает на <body> до того, как через ~2 с смонтируется разбор. " +
    "lib/modal.ts проверяет `document.contains(opener)`, но не то, что открывашка ещё фокусируема.",
};

const NAV_LABEL = { practice: "training", campaign: "campaign", course: "course", custom: "custom",
                    exam: "exam", profile: "profile", admin: "admin" };

const suite = new Suite("ui.mjs", KNOWN_BUGS);
await suite.start();
const ru = I18N.ru;
const en = I18N.en;

// ---------------------------------------------------------------------------
await suite.flow("theme", async (f) => {
  const t = ru;
  const p = await f.open({ tutorialDone: true });
  const themeName = new RegExp(`^(${esc(t.a11y.themeLight)}|${esc(t.a11y.themeDark)})$`);
  const btn = p.getByRole("button", { name: themeName });
  const now = async () => ({
    theme: await p.evaluate(() => document.documentElement.getAttribute("data-theme")),
    pressed: await btn.getAttribute("aria-pressed"),
    label: await btn.getAttribute("aria-label"),
  });
  await f.visit("home-light");
  let s = await now();
  f.check(s.pressed === "false" && s.label === t.a11y.themeLight, "кнопка темы называет текущую — светлую",
    JSON.stringify(s));

  await btn.click();
  s = await now();
  f.check(s.theme === "dark", "клик включает тёмную тему сразу", `data-theme=${s.theme}`);
  f.check(s.pressed === "true" && s.label === t.a11y.themeDark, "кнопка говорит «тёмная» и нажата", JSON.stringify(s));
  await f.visit("home-dark");
  await p.reload({ waitUntil: "networkidle" });
  s = await now();
  f.check(s.theme === "dark" && s.pressed === "true", "тёмная тема пережила перезагрузку", JSON.stringify(s));
  await nav(p, "course");
  await f.visit("course-dark");
  await nav(p, "profile");
  await f.visit("profile-dark");

  // Посреди партии: тема меняется, партия — нет.
  await nav(p, "practice");
  await p.locator('[data-scenario="rent"]').click();
  await waitTable(p);
  await composer(p).focus();
  await playLine(f, t, "Почему для вас важно, чтобы квартира не пустовала?");
  const inits = p.proto.inits.length;
  await btn.click();
  s = await now();
  f.check(s.theme === "light", "за столом тема переключается сразу", `data-theme=${s.theme}`);
  f.check(p.proto.inits.length === inits, "смена темы не перезапускает партию",
    `session.init: ${inits} → ${p.proto.inits.length}`);
  await f.visit("table-light");
  await p.reload({ waitUntil: "networkidle" });
  s = await now();
  f.check(s.theme === "light" && s.pressed === "false", "светлая тема пережила перезагрузку", JSON.stringify(s));
});

// ---------------------------------------------------------------------------

/** Русские слова на английском экране (кроме бренда «Диалог»). */
async function cyrillicLeaks(p) {
  return p.evaluate(() => {
    const text = document.body.innerText;
    const out = new Map();
    for (const m of text.matchAll(/[А-Яа-яЁё][А-Яа-яЁё-]*/g)) {
      // Регистр не важен: логотип рисуется строчными через text-transform, а
      // innerText отдаёт текст уже преобразованным — «диалог», а не «Диалог».
      if (m[0].toLowerCase() === "диалог") continue;
      if (!out.has(m[0])) out.set(m[0], JSON.stringify(text.slice(Math.max(0, m.index - 25), m.index + 25).replace(/\s+/g, " ")));
    }
    return [...out.values()].slice(0, 5);
  });
}

async function navLabels(p) {
  return p.locator("[data-nav]").evaluateAll((els) =>
    els.map((e) => [e.getAttribute("data-nav"), e.getAttribute("aria-label") || e.textContent.trim()]));
}

await suite.flow("language", async (f) => {
  const p = await f.open({ tutorialDone: true });
  await f.visit("home-ru");
  const RU = p.getByRole("button", { name: "RU", exact: true });
  const EN = p.getByRole("button", { name: "EN", exact: true });
  const stateOf = async (b) => (await b.getAttribute("aria-pressed")) ?? (await b.getAttribute("aria-current"));
  await f.known("lang-toggle-no-state", (await stateOf(RU)) === "true" || (await stateOf(RU)) === "page",
    "кнопки языка сообщают выбранный (aria-pressed / aria-current)",
    `RU: aria-pressed=${await RU.getAttribute("aria-pressed")}, aria-current=${await RU.getAttribute("aria-current")}`);

  await EN.click();
  const checkEn = async (when) => {
    f.check(await p.evaluate(() => document.documentElement.lang) === "en", `${when}: <html lang="en">`);
    const labels = await navLabels(p);
    const wrong = labels.filter(([k, l]) => NAV_LABEL[k] && l !== en.nav[NAV_LABEL[k]]);
    f.check(labels.length > 0 && wrong.length === 0, `${when}: меню по-английски`, JSON.stringify(wrong));
    f.check(await p.getByRole("heading", { level: 1, name: en.modes.practice.title, exact: true }).count() === 1,
      `${when}: заголовок экрана по-английски`);
  };
  await checkEn("сразу после клика");
  await p.reload({ waitUntil: "networkidle" });
  await checkEn("после перезагрузки");

  // Инвариант 4: весь пользовательский контент двуязычный — на английских
  // экранах не должно остаться русских слов.
  for (const [key, label] of [["practice", "home"], ["campaign", "campaign"], ["course", "course"],
                              ["custom", "custom"], ["exam", "exam"], ["profile", "profile"]]) {
    await nav(p, key);
    await p.waitForTimeout(300);
    await f.visit(`${label}-en`);
    const leaks = await cyrillicLeaks(p);
    f.check(leaks.length === 0, `[${label}-en] на английском экране нет русского текста`, leaks.join(", "));
  }
  await nav(p, "practice");
  await p.locator('[data-scenario="salary"]').click();
  await waitTable(p);
  await f.visit("table-en");
  const leaks = await cyrillicLeaks(p);
  f.check(leaks.length === 0, "[table-en] на английском столе нет русского текста", leaks.join(", "));
  f.check(p.proto.inits.at(-1)?.lang === "en", "партия уходит на сервер с lang=en",
    `lang=${p.proto.inits.at(-1)?.lang}`);
  await nav(p, "practice");

  await RU.click();
  f.check(await p.evaluate(() => document.documentElement.lang) === "ru", "RU возвращает <html lang=\"ru\">");
  await p.reload({ waitUntil: "networkidle" });
  const back = await navLabels(p);
  f.check(back.every(([k, l]) => !NAV_LABEL[k] || l === ru.nav[NAV_LABEL[k]]), "русский пережил перезагрузку",
    JSON.stringify(back));
});

// ---------------------------------------------------------------------------
await suite.flow("mobile", async (f) => {
  const t = ru;
  const W = 390;
  const p = await f.open({ width: W, height: 844, tutorialDone: true });
  await f.visit("m-home", { overflow: true });
  const keys = await p.locator("[data-nav]").evaluateAll((els) => els.map((e) => e.getAttribute("data-nav")));
  f.check(keys.length >= 6, "меню на телефоне на месте", `пунктов: ${keys.length}`);
  // Полоса вкладок на телефоне может листаться вбок: «достижимо» — да, но
  // человеку об этом говорит только обрезанная подпись. Не провал, а заметка;
  // снимается ДО первого клика, пока полосу никто не листал.
  const offscreen = await p.locator("[data-nav]").evaluateAll((els) => els
    .filter((el) => { const r = el.getBoundingClientRect(); return r.left < 0 || r.right > innerWidth; })
    .map((el) => el.getAttribute("data-nav")));
  if (offscreen.length) f.note(`на ${W}px за краем окна пункты меню: ${offscreen.join(", ")} — до них листают полосу`);
  for (const key of [...keys.filter((k) => k !== "practice"), "practice"]) {
    const b = p.locator(`[data-nav="${key}"]`).first();
    await b.scrollIntoViewIfNeeded();
    const box = await b.boundingBox();
    f.check(await b.isVisible() && box && box.x >= -1 && box.x + box.width <= W + 1,
      `[m] пункт меню «${key}» виден целиком в окне`, JSON.stringify(box));
    await nav(p, key); // клик сам проверяет, что пункт ничем не перекрыт
    await p.waitForTimeout(300);
    await f.visit(`m-${key}`, { overflow: true });
  }

  await p.locator('[data-scenario="conflict"]').click();
  await waitTable(p);
  await f.visit("m-table", { overflow: true });
  const quit = p.getByRole("button", { name: new RegExp(esc(t.quit)) });
  f.check(await quit.count() > 0, "[m] со стола есть выход");
  const layers = p.getByRole("button", { name: t.layers.head, exact: true });
  await layers.click();
  const dlg = p.getByRole("dialog", { name: t.layers.head });
  await dlg.waitFor();
  await f.visit("m-drawer", { overflow: true });
  await p.keyboard.press("Escape");
  await dlg.waitFor({ state: "detached", timeout: 3000 }).catch(() => {});
  f.check(!(await dlg.count()), "[m] Esc закрывает шторку");

  await composer(p).focus();
  await playUntilDebrief(f, t, HOSTILE_RU, { max: 12 });
  f.screen = "m-outcome";
  const d = await readDebrief(p, t);
  await escapeModals(f);
  await f.visit("m-debrief", { overflow: true });
  f.check(!!d.grade, "[m] на разборе видна оценка", JSON.stringify(d));
  const navBack = p.locator('[data-nav="practice"]').first();
  await navBack.scrollIntoViewIfNeeded();
  f.check(await navBack.isVisible(), "[m] с разбора меню достижимо");

  // Английские подписи длиннее — проверяем их отдельно.
  await nav(p, "practice");
  await p.getByRole("button", { name: "EN", exact: true }).click();
  await f.visit("m-home-en", { overflow: true });
  await nav(p, "profile");
  await f.visit("m-profile-en", { overflow: true });
});

// ---------------------------------------------------------------------------

/** Tab N раз внутри модалки: фокус обязан оставаться в ней. */
async function trapHolds(p, dialog, presses = 12) {
  for (let i = 0; i < presses; i++) {
    await p.keyboard.press(i % 4 === 3 ? "Shift+Tab" : "Tab");
    if (!(await dialog.evaluate((el) => el.contains(document.activeElement)))) {
      return `после ${i + 1}-го нажатия фокус на ${await describeFocus(p)}`;
    }
  }
  return null;
}

/** Открыть модалку клавиатурой с открывашки, проверить ловушку, закрыть Esc. */
async function escapeSurface(f, id, label, openerSel, dialogName) {
  const p = f.page;
  const reach = await tabTo(p, openerSel, 120);
  if (!f.check(reach.ok, `Tab доходит до открывашки «${label}»`, reach.stops.slice(-4).join(" → "))) return;
  await p.keyboard.press("Enter");
  const dlg = p.getByRole("dialog", { name: dialogName });
  await dlg.waitFor();
  await p.waitForTimeout(300);
  await f.visit(`${id}-open`);
  f.check(await dlg.evaluate((el) => el.contains(document.activeElement)), `«${label}»: фокус внутри после открытия`,
    await describeFocus(p));
  const leak = await trapHolds(p, dlg);
  f.check(!leak, `«${label}»: Tab не выпадает из модального окна`, leak ?? "");
  await p.keyboard.press("Escape");
  await dlg.waitFor({ state: "detached", timeout: 3000 }).catch(() => {});
  f.check(!(await dlg.count()), `«${label}»: Esc закрывает`);
  f.check(await p.evaluate((sel) => !!document.activeElement?.matches(sel), openerSel),
    `«${label}»: фокус вернулся на открывашку`, await describeFocus(p));
}

await suite.flow("keyboard", async (f) => {
  const t = ru;
  const p = await f.open({ tutorialDone: true });
  await f.visit("home");

  // Первая остановка — «К содержимому», и она ведёт в main.
  await p.keyboard.press("Tab");
  const skip = p.getByRole("link", { name: t.a11y.skip, exact: true });
  f.check(await skip.evaluate((el) => el === document.activeElement), "первая остановка Tab — «К содержимому»",
    await describeFocus(p));
  const sv = await focusIsVisible(p);
  f.check(sv.ok, "«К содержимому» видна в фокусе", sv.why);
  await p.keyboard.press("Enter");
  f.check(await p.evaluate(() => !!document.activeElement?.closest("main")), "Enter по ней переводит фокус в main",
    await describeFocus(p));

  // Сквозной обход главной: всё меню, дальше карточки оппонентов; фокус виден везде.
  await p.reload({ waitUntil: "networkidle" });
  const navKeys = await p.locator("[data-nav]").evaluateAll((els) => els.map((e) => e.getAttribute("data-nav")));
  const reached = new Set();
  const invisible = [];
  let card = false;
  for (let i = 0; i < 70 && !card; i++) {
    await p.keyboard.press("Tab");
    const at = await p.evaluate(() => ({
      nav: document.activeElement?.getAttribute("data-nav"),
      card: document.activeElement?.hasAttribute("data-scenario"),
    }));
    if (at.nav) reached.add(at.nav);
    card = !!at.card;
    const v = await focusIsVisible(p);
    if (!v.ok) invisible.push(`${await describeFocus(p)}: ${v.why}`);
  }
  const missing = navKeys.filter((k) => !reached.has(k));
  f.check(missing.length === 0, "Tab проходит все пункты меню", `не дошли: ${missing.join(", ")}`);
  f.check(card, "Tab доходит до карточек оппонентов (главное действие экрана)");
  f.check(invisible.length === 0, "фокус виден на каждой остановке Tab главной", invisible.join("; "));
  await f.visit("home-tabbed");

  // Меню работает с клавиатуры.
  await p.reload({ waitUntil: "networkidle" });
  const toProfile = await tabTo(p, '[data-nav="profile"]', 30);
  f.check(toProfile.ok, "Tab доходит до «Профиль»");
  await p.keyboard.press("Enter");
  f.check(await p.locator('[data-nav="profile"][aria-current="page"]').count() === 1, "Enter открывает раздел меню");
  f.check(await p.evaluate(() => document.activeElement !== document.body), "после перехода фокус не падает на body",
    await describeFocus(p));
  await f.visit("profile-by-keyboard");

  // Модальные поверхности: Esc закрывает, фокус возвращается.
  await nav(p, "practice");
  await p.reload({ waitUntil: "networkidle" });
  await escapeSurface(f, "reading", "чтение стола", '[data-reading="open"]', t.reading.title);
  await p.reload({ waitUntil: "networkidle" });
  await escapeSurface(f, "other-side", "обратная сторона", '[data-other-side="open"]', t.otherSide.title);

  await p.locator('[data-scenario="rent"]').click();
  await waitTable(p);
  await f.visit("table");
  await escapeSurface(f, "layers-drawer", "шторка слоёв", 'button[aria-haspopup="dialog"]', t.layers.head);
});

// Веха — модальное окно, которое всплывает само (без открывашки): ранг меняется
// на 150 XP, поэтому профиль начинается со 140 и одной принципиальной партии
// хватает. Esc обязан её закрыть, а фокус — не упасть на body.
await suite.flow("milestone", async (f) => {
  const t = ru;
  const profile = {
    version: 4, scenarios: {}, streak: 0, lastStreakDay: "", xp: 140, skills: {}, achievements: [],
    freezes: 0, dailyGoalTarget: 1, dailyDoneDay: "", dailyDoneCount: 0, celebratedMilestones: [], course: {},
  };
  const p = await f.open({ tutorialDone: true, storage: { "dialog.progress.v1": JSON.stringify(profile) } });
  await p.locator('[data-scenario="rent"]').click();
  await waitTable(p);
  await composer(p).focus();
  await playUntilDebrief(f, t, GAMES.principled.rent.ru, { max: 6 });
  const card = p.getByRole("dialog", { name: t.gam.milestone.kicker });
  await card.waitFor({ timeout: 8000 }).catch(() => {});
  if (!f.check(await card.count() > 0, "переход через 150 XP показывает веху")) return;
  await f.visit("milestone");
  f.check(await card.evaluate((el) => el.contains(document.activeElement)), "фокус внутри вехи", await describeFocus(p));
  await p.keyboard.press("Escape");
  await until(async () => !(await card.count()), 3000, "веха закрылась").catch(() => {});
  f.check(!(await card.count()), "Esc закрывает веху");
  await f.known("milestone-focus-to-body", await p.evaluate(() => document.activeElement !== document.body),
    "после Esc по вехе фокус не падает на body", `фокус: ${await describeFocus(p)}`);
  await readDebrief(p, t);
  await until(() => p.evaluate(() => document.activeElement !== document.body), 3000, "фокус на разборе")
    .catch(() => {});
  f.check(await p.evaluate(() => document.activeElement !== document.body), "на разборе фокус не на body",
    await describeFocus(p));
  await f.visit("debrief-after-milestone");
});

await suite.finish();
