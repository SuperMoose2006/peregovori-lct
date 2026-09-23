// harness.mjs — общая обвязка для flows.mjs и ui.mjs.
//
// ЧТО ЗДЕСЬ И ПОЧЕМУ ОДНО МЕСТО. Оба прибора ходят по продукту так, как ходит
// человек, и на каждом экране обязаны проверить одно и то же: ни ошибки в
// консоли, ни pageerror, ни эмодзи в тексте, ни картинки без alt, ни запроса
// наружу (демо идёт на wifi площадки, а сторонний адрес там — это висящая
// загрузка). Если эти проверки живут в каждом файле, второй файл забывает
// половину — поэтому они здесь.
//
// ВЫБОР ЭЛЕМЕНТОВ — ПО СМЫСЛУ, А НЕ ПО ВИДУ. Оформление меняется прямо сейчас:
// цвета, шрифты, отступы, часть разметки. Поэтому элементы ищутся по роли,
// доступному имени и `data-*`, а подписи берутся ИЗ СЛОВАРЯ ПРОДУКТА
// (`src/i18n.ts`), а не вписываются сюда: переформулировали строку — прибор
// видит новую сам. Цвета, классы и координаты не утверждаются нигде.
import { mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { chromium } from "playwright-core";
import { tsImport } from "tsx/esm/api";
import { browserExecutable } from "./browser.mjs";

export const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")
    ? process.argv[i + 1] : fallback;
};

export const BASE = arg("url", "http://127.0.0.1:8010").replace(/\/+$/, "");
export const OUT = arg("out", "/tmp/dialog-e2e-flows");
/** `--strict`: открытый известный дефект валит прогон, а не только печатается. */
export const STRICT = process.argv.includes("--strict") || process.env.E2E_STRICT === "1";
/** `--only a,b`: прогнать выбранные сценарии. */
export const ONLY = arg("only", "").split(",").map((s) => s.trim()).filter(Boolean);

// ТОЛЬКО ЛОКАЛЬНО. Эти сценарии играют партии целиком; на публичном стенде
// каждый ход — это настоящие вызовы моделей и настоящие деньги. Выход —
// явный флаг, а не молчаливое «ну раз попросили».
{
  const host = new URL(BASE).hostname;
  if (!["127.0.0.1", "localhost", "[::1]", "::1"].includes(host)
      && !process.argv.includes("--allow-remote")) {
    console.error(`отказ: ${BASE} — не локальный адрес. Эти сценарии играют партии целиком и ` +
      "на живом стенде жгут вызовы моделей. Поднимите шлюз локально с NEGO_AI=off.");
    process.exit(2);
  }
}

mkdirSync(OUT, { recursive: true });

// Словарь и причины слоёв — из исходников продукта. `tsx` уже в devDependencies,
// а оба файла импортируют только типы.
export const { I18N } = await tsImport("../src/i18n.ts", import.meta.url);
export const { SERVER_SIDE_REASON } = await tsImport("../src/lib/layers.ts", import.meta.url);
/** Эталонные партии — те же, которыми юнит-тесты доказывают инвариант 2. */
export const GAMES = JSON.parse(
  readFileSync(new URL("../test/fixtures/games.json", import.meta.url), "utf8"));

/** Грубость и ультиматумы — реплики из services/gateway/tests/test_engine.py
 *  (агрессия → срыв / F). Повторяются по кругу, пока партия не закроется. */
export const HOSTILE_RU = [
  "Ваша цена смешна и некомпетентна.",
  "У вас нет выбора, иначе уходим. Ультиматум.",
  "Требую немедленно снизить, иначе разрываем.",
  "Вы врёте, и это абсурд.",
  "Вы некомпетентны, это позор.",
  "Смешно, вы издеваетесь.",
];

const EMOJI = /[\u{1F300}-\u{1FAFF}]/u;
const ORIGIN = new URL(BASE).origin;
const WS_ORIGIN = ORIGIN.replace(/^http/, "ws");

/** Экранирование для RegExp из строки словаря. */
export const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Прогон: набор сценариев, у каждого свой браузерный контекст.
 *
 * Сценарий падает целиком по первому исключению, но остальные идут дальше:
 * прибор, который после первой находки молчит обо всём остальном, теряет ровно
 * то, ради чего написан.
 */
export class Suite {
  constructor(title, knownBugs = {}) {
    this.title = title;
    this.knownBugs = knownBugs;
    this.results = [];
    this.browser = null;
  }

  async start() {
    try {
      // Поддельные устройства: браузер отдаёт «микрофон» и «камеру», как
      // человек, нажавший «Разрешить». Без них безголовый хром отказывает сам,
      // и отказ браузера маскирует то, что проверяется, — честность СЕРВЕРА.
      this.browser = await chromium.launch({
        executablePath: browserExecutable(),
        args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
      });
    } catch (e) {
      console.error(`не удалось запустить chromium. CHROME_PATH=… или npx playwright install chromium\n${e}`);
      process.exit(2);
    }
    // Шлюз жив? Иначе каждый сценарий упал бы по таймауту с непонятным текстом.
    const health = await fetch(`${BASE}/api/health`).then((r) => r.json()).catch(() => null);
    if (!health?.ok) {
      console.error(`шлюз не отвечает на ${BASE}/api/health — поднимите его (см. шапку файла)`);
      await this.browser.close();
      process.exit(2);
    }
    // И шлюз ОФЛАЙНОВЫЙ. С ключами каждый ход — платные вызовы моделей, а
    // ожидания сценариев (судьи нет, облачных слоёв нет, грейд детерминирован)
    // верны только без облака. Локальный :8010 с .env — ровно такой случай.
    if (health.cloud_ai && !process.argv.includes("--allow-cloud")) {
      console.error(`отказ: у шлюза ${BASE} есть облачный ИИ (cloud_ai=true) — сценарии рассчитаны на ` +
        "NEGO_AI=off и жгли бы вызовы моделей. Поднимите офлайн-шлюз (см. шапку flows.mjs).");
      await this.browser.close();
      process.exit(2);
    }
    this.health = health;
    console.log(`${this.title} · ${BASE} · cloud_ai=${health.cloud_ai} · build ${health.build?.code ?? "?"}`);
  }

  /** Один сценарий. `fn(f)` получает объект сценария с открывашкой и проверками. */
  async flow(name, fn) {
    if (ONLY.length && !ONLY.includes(name)) return;
    // Снимки прошлого прогона этого сценария убираются: иначе в каталоге
    // лежал бы вчерашний FAIL рядом с сегодняшним зелёным. Трогаем только свои
    // имена (`<сценарий>-NN-…png`) — каталог могли указать общий.
    const mine = new RegExp(`^${esc(name)}-\\d{2}-.*\\.png$`);
    for (const file of readdirSync(OUT)) if (mine.test(file)) unlinkSync(`${OUT}/${file}`);
    const f = new Flow(this, name);
    const t0 = Date.now();
    try {
      await fn(f);
    } catch (e) {
      const where = String(e?.stack ?? "").split("\n").find((l) => l.includes("/e2e/") && !l.includes("harness.mjs"));
      f.fail(`ОБОРВАЛСЯ на «${f.screen}»: ${String(e?.message ?? e).split("\n").slice(0, 6).join(" | ")}` +
             (where ? `\n      ${where.trim()}` : ""));
      await f.shotFailure();
    } finally {
      for (const c of f.contexts) await c.close().catch(() => {});
    }
    f.ms = Date.now() - t0;
    this.results.push(f);
    const mark = f.failures.length ? "FAIL" : "ok  ";
    console.log(`${mark} ${name} (${(f.ms / 1000).toFixed(1)} с, проверок ${f.passed.length})`);
    for (const p of f.failures) console.log(`     ✗ ${p}`);
    for (const k of f.knownOpen) console.log(`     ! известный дефект ${k.id}: ${k.detail}`);
    for (const k of f.knownFixed) console.log(`     ? ${k.id} больше не воспроизводится — уберите его из KNOWN_BUGS`);
    for (const n of f.notes) console.log(`     i ${n}`);
  }

  /** Итог: печать, report.json, код выхода. */
  async finish() {
    await this.browser?.close().catch(() => {});
    const failures = this.results.flatMap((f) => f.failures.map((p) => `${f.name}: ${p}`));
    const openKnown = [...new Map(this.results.flatMap((f) => f.knownOpen).map((k) => [k.id, k])).values()];
    const fixedKnown = [...new Set(this.results.flatMap((f) => f.knownFixed).map((k) => k.id))]
      .filter((id) => !openKnown.some((k) => k.id === id));
    const reportFile = `${OUT}/report-${this.title.replace(/\.mjs$/, "")}.json`;
    writeFileSync(reportFile, JSON.stringify({
      suite: this.title, base: BASE, at: new Date().toISOString(), health: this.health,
      flows: this.results.map((f) => ({ name: f.name, ms: f.ms, passed: f.passed, failures: f.failures,
        knownOpen: f.knownOpen, knownFixed: f.knownFixed, notes: f.notes, shots: f.shots })),
    }, null, 2));
    console.log("");
    if (openKnown.length) {
      console.log(`ИЗВЕСТНЫЕ ДЕФЕКТЫ ОТКРЫТЫ (${openKnown.length})${STRICT ? " — --strict, считаются провалом" : ""}:`);
      for (const k of openKnown) console.log(`  ${k.id}: ${this.knownBugs[k.id] ?? ""}\n    снимок: ${k.shot ?? "—"}`);
    }
    if (fixedKnown.length) console.log(`ПОХОЖЕ, ПОЧИНЕНЫ (уберите из KNOWN_BUGS): ${fixedKnown.join(", ")}`);
    if (failures.length) {
      console.error(`\nПРОВАЛЕНО (${failures.length}):\n` + failures.map((p) => `  ${p}`).join("\n"));
    }
    const bad = failures.length > 0 || (STRICT && openKnown.length > 0);
    console.log(`\n${bad ? "ПРОВАЛ" : "ПРОЙДЕНО"} · снимки: ${OUT} · отчёт: ${reportFile}`);
    process.exit(bad ? 1 : 0);
  }
}

export class Flow {
  constructor(suite, name) {
    this.suite = suite;
    this.name = name;
    this.failures = [];
    this.passed = [];
    this.knownOpen = [];
    this.knownFixed = [];
    this.notes = [];
    this.contexts = [];
    this.shots = [];
    this.screen = "start";
    this.page = null;
    this.n = 0;
  }

  fail(msg) { this.failures.push(msg); }
  /** Наблюдение, которое не провал, но которое стоит увидеть глазами. */
  note(msg) { this.notes.push(msg); }
  ok(msg) { this.passed.push(msg); }

  /** Обычная проверка: ложь — провал сценария, но сценарий идёт дальше. */
  check(cond, msg, detail = "") {
    if (cond) this.ok(msg);
    else this.fail(`${msg}${detail ? ` — ${detail}` : ""}`);
    return !!cond;
  }

  /**
   * Проверка, за которой стоит ИЗВЕСТНЫЙ ОТКРЫТЫЙ дефект.
   *
   * Утверждение остаётся тем, каким оно должно быть; меняется только то, что
   * прогон делает с провалом: печатает дефект и снимок, но не краснеет (кроме
   * `--strict`). Прошло — прибор говорит, что строку пора убрать из списка.
   */
  async known(id, cond, msg, detail = "") {
    if (!(id in this.suite.knownBugs)) throw new Error(`неизвестный KNOWN_BUGS id: ${id}`);
    if (cond) {
      this.ok(msg);
      this.knownFixed.push({ id, msg });
      return true;
    }
    const shot = this.page ? await this.shot(`known-${id}`) : null;
    this.knownOpen.push({ id, msg, detail: `${msg}${detail ? ` — ${detail}` : ""}`, shot });
    if (STRICT) this.fail(`[${id}] ${msg}${detail ? ` — ${detail}` : ""}`);
    return false;
  }

  async shot(label) {
    if (!this.page) return null;
    const path = `${OUT}/${this.name}-${String(++this.n).padStart(2, "0")}-${label.replace(/[^\w.-]+/g, "_")}.png`;
    await this.page.screenshot({ path, fullPage: true }).catch(() => {});
    this.shots.push(path);
    return path;
  }

  async shotFailure() { return this.shot(`FAIL-${this.screen}`); }

  /**
   * Новый контекст и страница со сторожами.
   *
   * @param width,height  окно
   * @param lang,theme    заранее выбранные язык и тема (как будто человек уже был здесь)
   * @param tutorialDone  пропустить вводную (по умолчанию нет: первый визит)
   * @param storage       прочие ключи localStorage до первой загрузки
   */
  async open({ width = 1440, height = 950, lang = null, theme = null, tutorialDone = false,
               storage = {}, calmMotion = true } = {}) {
    const ctx = await this.suite.browser.newContext({
      viewport: { width, height },
      // Уменьшенное движение: переходы не дорисовываются между шагом и
      // проверкой. Это настройка ОКРУЖЕНИЯ, которую продукт уважает сам.
      reducedMotion: calmMotion ? "reduce" : "no-preference",
      colorScheme: "light",
    });
    this.contexts.push(ctx);
    const seed = { ...storage };
    if (lang) seed["dialog.lang.v1"] = lang;
    if (theme) seed["dialog.theme.v1"] = theme;
    if (tutorialDone) seed["dialog.tutorialDone.v1"] = "1";
    if (Object.keys(seed).length) {
      // Только при ПЕРВОЙ загрузке вкладки: иначе перезагрузка затирала бы то,
      // что человек выбрал, и проверка «пережило перезагрузку» врала бы.
      await ctx.addInitScript((kv) => {
        if (sessionStorage.getItem("e2e.seeded")) return;
        sessionStorage.setItem("e2e.seeded", "1");
        for (const [k, v] of Object.entries(kv)) localStorage.setItem(k, v);
      }, seed);
    }
    // Всё, что уходит с этого происхождения наружу, — провал. Включая запросы
    // service worker'а: они идут через контекст.
    ctx.on("request", (r) => {
      const u = r.url();
      if (u.startsWith("data:") || u.startsWith("blob:")) return;
      let origin;
      try { origin = new URL(u).origin; } catch { return; }
      if (origin !== ORIGIN && origin !== WS_ORIGIN) this.fail(`[${this.screen}] запрос наружу: ${u}`);
    });
    const page = await ctx.newPage();
    page.setDefaultTimeout(15000);
    page.on("pageerror", (e) => this.fail(`[${this.screen}] pageerror: ${String(e).slice(0, 200)}`));
    page.on("console", (m) => {
      if (m.type() !== "error") return;
      const where = m.location()?.url ? ` (${m.location().url.replace(ORIGIN, "")})` : "";
      this.fail(`[${this.screen}] console.error: ${m.text().slice(0, 200)}${where}`);
    });
    page.on("websocket", (ws) => {
      if (!ws.url().startsWith(WS_ORIGIN)) this.fail(`[${this.screen}] сокет наружу: ${ws.url()}`);
    });
    page.proto = watchProtocol(page);
    this.page = page;
    await page.goto(BASE, { waitUntil: "networkidle" });
    return page;
  }

  /**
   * «Мы на экране X»: подпись для сторожей, гигиена экрана и снимок.
   * @param overflow  проверить, что страница не уезжает вбок (телефон)
   */
  async visit(label, { overflow = false } = {}) {
    this.screen = label;
    const page = this.page;
    await page.waitForLoadState("networkidle").catch(() => {});
    const h = await page.evaluate((re) => {
      const emoji = new RegExp(re, "u");
      const text = document.body.innerText;
      const found = [];
      for (const m of text.matchAll(new RegExp(re, "gu"))) {
        found.push(JSON.stringify(text.slice(Math.max(0, m.index - 20), m.index + 20)));
        if (found.length >= 3) break;
      }
      const noAlt = [...document.querySelectorAll("img")].filter((i) => !i.hasAttribute("alt"))
        .map((i) => (i.getAttribute("src") || "?").split("/").slice(-2).join("/"));
      const scroll = document.documentElement.scrollWidth;
      const wide = scroll > innerWidth + 1
        ? [...document.querySelectorAll("body *")].filter((e) => {
            const r = e.getBoundingClientRect();
            return r.width > 0 && r.right > innerWidth + 1 && getComputedStyle(e).position !== "fixed";
          }).slice(0, 4).map((e) => `${e.tagName.toLowerCase()}${e.getAttribute("role") ? `[role=${e.getAttribute("role")}]` : ""}` +
            `${e.getAttribute("aria-label") ? `[${e.getAttribute("aria-label").slice(0, 30)}]` : ""}`)
        : [];
      return { emoji: emoji.test(text) ? found : [], noAlt, scroll, inner: innerWidth, wide };
    }, EMOJI.source);
    this.check(h.emoji.length === 0, `[${label}] нет эмодзи в тексте`, h.emoji.join(", "));
    this.check(h.noAlt.length === 0, `[${label}] у каждой <img> есть alt`, h.noAlt.join(", "));
    if (overflow) {
      this.check(h.scroll <= h.inner + 1, `[${label}] страница не уезжает вбок на ${h.inner}px`,
        `scrollWidth ${h.scroll}; шире окна: ${h.wide.join(", ")}`);
    }
    await this.shot(label);
    return h;
  }
}

/**
 * Протокол глазами браузера: что ушло и что пришло по `/v1/realtime`.
 *
 * Конец хода ждётся по СОБЫТИЮ протокола (`response.done` — авторитетный итог
 * реплики, см. CLAUDE.md), а не по классу пузыря в ленте: разметка ленты
 * переделывается, протокол — договор с сервером.
 */
function watchProtocol(page) {
  const seen = { types: [], inits: [], caps: [], debrief: null };
  page.on("websocket", (ws) => {
    ws.on("framesent", ({ payload }) => {
      try { const e = JSON.parse(String(payload)); if (e.type === "session.init") seen.inits.push(e.payload); }
      catch { /* бинарный звук — не событие протокола */ }
    });
    ws.on("framereceived", ({ payload }) => {
      try {
        const e = JSON.parse(String(payload));
        seen.types.push(e.type);
        if (e.type === "session.created") seen.caps.push(e.capabilities ?? {});
        if (e.type === "debrief") seen.debrief = e.debrief ?? e;
      } catch { /* бинарный кадр */ }
    });
  });
  return seen;
}

const count = (arr, type) => arr.filter((x) => x === type).length;

async function until(fn, ms, what) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await fn()) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`не дождались: ${what} (${ms} мс)`);
}

/** Поле реплики за столом — единственное текстовое поле внутри main во время партии. */
export const composer = (page) => page.getByRole("main").getByRole("textbox");

/** Партия начата: сервер ответил приветствием и поле реплики на месте. */
export async function waitTable(page) {
  await until(() => page.proto.types.includes("session.created"), 20000, "session.created");
  await composer(page).waitFor({ timeout: 20000 });
}

/**
 * Один ход С КЛАВИАТУРЫ: печать в поле, Enter, ожидание ответа оппонента.
 *
 * Фокус ОБЯЗАН остаться в поле после предыдущего хода — иначе партию нельзя
 * играть без мыши. Потерю фокуса фиксируем находкой и возвращаем его, чтобы
 * сценарий дошёл до конца и проверил остальное.
 */
export async function playLine(f, t, line) {
  const page = f.page;
  const box = composer(page);
  const inBox = await box.evaluate((el) => el === document.activeElement).catch(() => false);
  if (!inBox) {
    f.fail(`[${f.screen}] после хода фокус ушёл из поля реплики (на ${await describeFocus(page)})`);
    await box.focus();
  }
  await page.keyboard.type(line);
  // «Отправить» оживает, когда стол не занят: Enter раньше этого — пустой.
  const send = page.getByRole("button", { name: t.a11y.send, exact: true });
  await until(() => send.isEnabled(), 30000, "кнопка отправки ожила");
  const before = count(page.proto.types, "response.done");
  await page.keyboard.press("Enter");
  await until(() => count(page.proto.types, "response.done") > before || page.proto.debrief, 30000,
    `ответ оппонента на «${line.slice(0, 40)}»`);
}

/** Играет реплики, пока партия не закроется; возвращает число сыгранных. */
export async function playUntilDebrief(f, t, lines, { max = 14 } = {}) {
  let played = 0;
  for (let i = 0; i < max && !f.page.proto.debrief; i++) {
    await playLine(f, t, lines[i % lines.length]);
    played++;
  }
  await until(() => f.page.proto.debrief, 20000, "событие debrief");
  return played;
}

/** Экран разбора: заголовок и буква грейда — по доступному имени, как читает диктор. */
export async function readDebrief(page, t, { exam = false } = {}) {
  const title = exam ? t.exam.resultTitle : t.debriefTitle;
  await page.getByRole("heading", { level: 1, name: title, exact: true }).waitFor({ timeout: 20000 });
  const re = new RegExp("^" + esc(t.a11y.grade).replace("\\{grade\\}", "([A-F])").replace("\\{score\\}", "(\\d+)") + "$");
  const label = await page.getByRole("img", { name: re }).first().getAttribute("aria-label");
  const m = label?.match(re);
  return { grade: m?.[1] ?? null, score: m ? Number(m[2]) : null, status: page.proto.debrief?.status ?? null };
}

/** Закрыть всплывшие модальные окна (вехи) клавишей Esc — как человек.
 *  Карточек вехи бывает несколько подряд, поэтому Esc жмётся до шести раз;
 *  окно, пережившее все шесть, — провал: Esc его не закрывает. */
export async function escapeModals(f) {
  const modal = f.page.locator('[role="dialog"][aria-modal="true"]');
  for (let i = 0; i < 6; i++) {
    if (!(await modal.count())) return;
    await f.page.keyboard.press("Escape");
    await f.page.waitForTimeout(250);
  }
  if (await modal.count()) {
    f.fail(`[${f.screen}] модальное окно «${await modal.first().getAttribute("aria-label")}» не закрывается по Esc`);
  }
}

/** Переход по разделу меню — по ключу `data-nav`; состоялся ли, говорит `aria-current`. */
export async function nav(page, key) {
  await page.locator(`[data-nav="${key}"]`).first().click();
  await page.locator(`[data-nav="${key}"][aria-current="page"]`).first().waitFor({ timeout: 5000 })
    .catch(() => { throw new Error(`переход в «${key}» не состоялся: пункт меню не стал текущим`); });
}

/**
 * Жать Tab, пока фокус не встанет на элемент по селектору.
 * @returns {ok, presses, stops} — stops: что встречалось по пути (для сообщений)
 */
export async function tabTo(page, selector, max = 80, { shift = false } = {}) {
  const stops = [];
  for (let i = 1; i <= max; i++) {
    await page.keyboard.press(shift ? "Shift+Tab" : "Tab");
    const hit = await page.evaluate((sel) => !!document.activeElement?.matches(sel), selector);
    if (hit) return { ok: true, presses: i, stops };
    stops.push(await describeFocus(page));
  }
  return { ok: false, presses: max, stops };
}

/** Состояние переключателя слоя: включён ли, заперт ли и что написано под ним. */
export async function switchState(scope, name) {
  const sw = scope.getByRole("switch", { name, exact: true });
  if (!(await sw.count())) return null;
  return sw.first().evaluate((el) => {
    const ids = (el.getAttribute("aria-describedby") || "").split(/\s+/).filter(Boolean);
    const note = ids.map((id) => document.getElementById(id)?.textContent?.trim() ?? "").join(" ").trim();
    return {
      checked: el.getAttribute("aria-checked") === "true",
      disabled: el.getAttribute("aria-disabled") === "true" || el.hasAttribute("disabled"),
      note,
    };
  });
}

export { until };

/** Что сейчас в фокусе — для сообщений. */
export async function describeFocus(page) {
  return page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return "body";
    const name = el.getAttribute("aria-label") || el.textContent?.trim().slice(0, 40) || "";
    const nav = el.getAttribute("data-nav");
    return `${el.tagName.toLowerCase()}${nav ? `[data-nav=${nav}]` : ""}${name ? ` «${name}»` : ""}`;
  });
}

/**
 * Виден ли фокус у элемента в фокусе.
 *
 * Не «какого он цвета», а «меняется ли что-то»: снимаем рамку/тень/обводку/фон
 * в фокусе и без него и сравниваем. Так проверка переживает любую смену
 * оформления — лишь бы фокус оставался видимым.
 */
export async function focusIsVisible(page) {
  return page.evaluate(async () => {
    const el = document.activeElement;
    if (!el || el === document.body) return { ok: false, why: "фокус на body" };
    const props = ["outlineStyle", "outlineWidth", "outlineColor", "boxShadow", "borderTopColor",
                   "borderBottomColor", "backgroundColor", "color", "textDecorationLine", "top", "transform"];
    // Обводка бывает и на обёртке (`:focus-within` у поля поиска), поэтому
    // снимаются сам элемент и два его предка.
    const chain = [el, el.parentElement, el.parentElement?.parentElement].filter(Boolean);
    const snap = () => chain.map((n) => { const s = getComputedStyle(n); return props.map((p) => s[p]).join("|"); }).join("||");
    const visible = el.matches(":focus-visible");
    const on = snap();
    const rect = el.getBoundingClientRect();
    el.blur();
    await new Promise((r) => requestAnimationFrame(() => r()));
    const off = snap();
    el.focus({ focusVisible: true });
    const inView = rect.width > 0 && rect.height > 0;
    return { ok: visible && on !== off && inView, why: !visible ? "не :focus-visible" : on === off ? "в фокусе выглядит так же, как без него" : !inView ? "нулевой размер" : "" };
  });
}
