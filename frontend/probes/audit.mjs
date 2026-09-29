// audit.mjs — обходчик состояний UI со встроенными проверками.
// Смысл: цикл «улучшить» слеп без прибора. Здесь прибор.
import { chromium } from "playwright-core";
import fs from "fs";

import { assertBundle, assertGateway } from "./_fresh.mjs";

const EXE = "/root/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome";
// Обходчик гоняется против ОФЛАЙН-сборки на отдельном порту (см. README), а не
// против гейтвея, поэтому у него своя переменная и своё умолчание.
const BASE = (process.env.AUDIT_BASE ?? "http://127.0.0.1:5199/").replace(/\/+$/, "") + "/";
// Каталог снимков переопределяется: два прогона разом писали в один и тот же
// путь, и половина снимков в отчёте оказывалась чужой.
const OUT = process.env.AUDIT_OUT ?? "/tmp/ui-audit";
fs.mkdirSync(OUT, { recursive: true });

// СВЕРКА СВЕЖЕСТИ ЖИВЁТ В ОБЩЕМ МОДУЛЕ `_fresh.mjs`. Она родилась здесь — на
// 127.0.0.1:5199 трое суток стоял забытый `python3 -m http.server` со сборкой
// от 25 августа, и обходчик исправно рапортовал «ноль находок» про код,
// которого в той сборке не было. Оказалось, что ровно та же слепота была у всех
// голосовых и медийных приборов сразу, поэтому проверка переехала в общее место
// и подключена ко всем. Здесь остаётся только вызов.
//
// Шлюз обходчику НЕ обязателен: домашний экран и курс он умеет обойти по
// офлайн-ядру. Отсюда `optional` — единственное отличие от остальных приборов,
// для которых шлюз и есть предмет замера.
// СВЕРЯЕМСЯ С ОФЛАЙН-СБОРКОЙ, А НЕ С `dist`. README велит гонять обходчик
// против `dist-mock` — и ровно на этом сверка свежести отказывала: она по
// умолчанию смотрит в `frontend/dist`, у которого другой хеш входного файла
// (VITE_MOCK меняет код). Прибор, который не может стартовать по инструкции из
// собственного README, — это прибор, которым не пользуются.
const DIST = new URL(
  fs.existsSync(new URL("../dist-mock/index.html", import.meta.url)) ? "../dist-mock/index.html" : "../dist/index.html",
  import.meta.url,
);
await assertBundle(BASE, DIST);
await assertGateway(BASE, { optional: true });

const ONLY = (process.env.AUDIT_VPS || "").split(",").map((x) => x.trim()).filter(Boolean);
const VPS = [
  { w: 1440, h: 900, tag: "desk",      scheme: "light", attr: null },
  { w: 390,  h: 844, tag: "mob",       scheme: "light", attr: null },
  // Системная тёмная БЕЗ явного выбора — самый забываемый режим: правила под
  // [data-theme="dark"] в нём не срабатывают.
  { w: 1440, h: 900, tag: "dark-sys",  scheme: "dark",  attr: null },
  { w: 1440, h: 900, tag: "dark-attr", scheme: "dark",  attr: "dark" },
  // Английская локаль: инвариант требует RU/EN во всём пользовательском тексте,
  // а непереведённая строка выглядит как работающий интерфейс — её видно только
  // если специально искать кириллицу там, где её быть не должно.
  { w: 1440, h: 900, tag: "en",        scheme: "light", attr: null, lang: "en" },
].filter((v) => !ONLY.length || ONLY.includes(v.tag));
// Прогон целиком не влезает в память коробки: хром падает по oom-kill на
// середине. AUDIT_VPS=desk,mob гоняет половину — отчёт при этом честно
// перечисляет, какие режимы в него вошли.
// ПОДПИСИ КНОПОК ПЕРЕВОДЯТСЯ ВМЕСТЕ С ПРОДУКТОМ. Обходчик искал их по русскому
// тексту, поэтому в английском режиме навигация молча не срабатывала
// (`.catch(()=>{})` глотает промах) и одиннадцать состояний курса не
// проверялись НИ РАЗУ. Ходим по обоим языкам сразу.
const RX = {
  toTasks: /(К заданиям|To the tasks)/i,
  next:    /^(Дальше|Далее|Next)/i,
  back:    /←/,
};

// КУРС ЧИТАЕТСЯ ИЗ КАТАЛОГА, А НЕ ПЕРЕПИСЫВАЕТСЯ ЗДЕСЬ. В приборе стояли три
// копии одного и того же знания — девять идентификаторов блоков для посева
// прогресса, десять типов разметки списком и «42 урока, 90 упражнений» в
// комментарии, — и все три протухли в один день, когда в курс лёг
// одиннадцатый блок. Хуже посева: два блока переставали открываться, а прибор
// молча ходил по девяти и печатал «увидено 10/10».
//
// Банк генерируется из Python (`tools/sync_course.py`), формат — обычный JSON
// внутри TS, поэтому разбирается регуляркой без сборщика. Пустой каталог — это
// находка, а не повод продолжать: прогон по курсу без блоков ничего не значит.
const COURSE = (() => {
  const read = (rel) => fs.readFileSync(new URL(rel, import.meta.url), "utf8");
  const blocksSrc = read("../src/data/course.blocks.generated.ts");
  const bankSrc = read("../src/data/course.generated.ts");
  // Только БАНК: следом в том же файле лежит COURSE_MASTER (капстоун), его
  // упражнения по блокам не разложены и в обход не входят.
  const from = bankSrc.indexOf("export const COURSE_BANK");
  const to = bankSrc.indexOf("export const COURSE_MASTER");
  const bank = from >= 0 && to > from ? bankSrc.slice(from, to) : "";
  const blocks = [...blocksSrc.matchAll(/"id":\s*"([^"]+)"/g)].map((m) => m[1]);
  const kinds = [...new Set([...bank.matchAll(/"type":\s*"([^"]+)"/g)].map((m) => m[1]))];
  const lessons = new Set([...bank.matchAll(/"block":\s*"([^"]+)",\s*\n\s*"lesson":\s*(\d+)/g)]
    .map((m) => m[1] + "/" + m[2]));
  // Считаем по "block", а не по "id": внутри упражнения свои id есть у
  // вариантов, пар соответствия и шагов, и наивный счёт по "id" давал 143 там,
  // где банк отдаёт 101. Число, которое прибор печатает, обязано совпадать с
  // тем, что говорит /api/health, иначе это ещё одна копия, разошедшаяся с
  // каталогом, — то самое, ради избавления от чего разбор и заведён.
  const exercises = (bank.match(/"block":\s*"/g) || []).length;
  if (!blocks.length || !kinds.length || !exercises)
    throw new Error("каталог курса не разобрался — обход по курсу мерил бы пустоту");
  return { blocks, kinds, lessons: lessons.size, exercises };
})();
console.log(`каталог курса: блоков ${COURSE.blocks.length}, уроков ${COURSE.lessons}, ` +
            `упражнений ${COURSE.exercises}, типов разметки ${COURSE.kinds.length}`);

const findings = [];
let VP = "";
const add = (sev, where, kind, msg) => findings.push({ sev, where: where + "@" + VP, kind, msg });

// ——— проверки, которые гоняются на каждом состоянии ———
const PROBE = `(() => {
  const out = { hscroll: false, overflow: [], small: [], leak: [], dupIds: [], noAlt: 0, mute: [], contrast: [], cyr: [], aria: [], badLabel: [], scroll: [], roleName: [] };
  const de = document.documentElement;
  out.hscroll = de.scrollWidth > de.clientWidth + 1;

  const seen = new Set();
  for (const el of document.querySelectorAll("[id]")) {
    if (seen.has(el.id)) out.dupIds.push(el.id); else seen.add(el.id);
  }
  // ПУСТОЙ alt — ЭТО НЕ ОТСУТСТВУЮЩИЙ. alt="" говорит диктору «картинка
  // декоративная, пропусти», и это правильная разметка. Прибор считал его
  // ошибкой и ругался на честно помеченные украшения. Ошибка — отсутствие
  // атрибута; и отдельно ошибка — пустой alt у картинки, которая ОДНА внутри
  // ссылки или кнопки: там пропустить нечего, и управление остаётся безымянным.
  for (const img of document.querySelectorAll("img")) {
    if (!img.hasAttribute("alt")) { out.noAlt++; continue; }
    if (img.alt) continue;
    const ctl = img.closest("a,button");
    if (ctl && !ctl.getAttribute("aria-label") && !(ctl.textContent || "").trim()) {
      out.mute.push((ctl.tagName === "A" ? "ссылка" : "кнопка") + " без имени: только картинка с пустым alt");
    }
  }

  const vis = (el) => {
    const s = getComputedStyle(el);
    if (s.display === "none" || s.visibility === "hidden" || +s.opacity === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };

  // Текст, который РЕАЛЬНО обрезается. Прошлая версия считала переполнением
  // любой выход за родителя — и ловила обычную вертикальную прокрутку рейла.
  // Признак настоящей беды один: контейнер клипует, а содержимое шире.
  for (const el of document.querySelectorAll("body *")) {
    if (!vis(el)) continue;
    const s = getComputedStyle(el);
    const clipsX = s.overflowX === "hidden" || s.overflowX === "clip";
    if (!clipsX) continue;
    // sr-only обрезан НАМЕРЕННО: это коробка 1×1 для экранного диктора.
    if (el.clientWidth <= 2 || el.clientHeight <= 2) continue;
    // Двойное экранирование: PROBE — шаблонный литерал, и одиночное \\b в нём
    // превращается в букву «b». Разделитель был /bsr-onlyb/ и не совпадал
    // никогда; спасал только фильтр по размеру 1×1 выше.
    if (/\\bsr-only\\b/.test(el.className || "")) continue;
    if (el.scrollWidth > el.clientWidth + 1) {
      const t = (el.textContent || "").trim();
      if (t) out.overflow.push(Math.round(el.scrollWidth - el.clientWidth) + "px срезано :: " + (el.className || el.tagName) + " :: " + t.slice(0, 40));
    }
  }

  // мелкие цели нажатия
  for (const el of document.querySelectorAll("button, a, [role=button], input, select, textarea")) {
    if (!vis(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.height < 44 || r.width < 24) {
      out.small.push(Math.round(r.width) + "x" + Math.round(r.height) + " " + (el.className || el.tagName) + " :: " + (el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 30));
    }
  }

  // утечки шаблона
  const body = document.body.innerText;
  for (const bad of ["undefined", "NaN", "{{", "[object Object]", "null "]) {
    if (body.includes(bad)) out.leak.push(bad);
  }

  // контраст текста на реальном фоне
  const lum = (c) => {
    const [r,g,b] = c;
    const f = (v) => { v/=255; return v <= 0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4); };
    return 0.2126*f(r) + 0.7152*f(g) + 0.0722*f(b);
  };
  // Chromium отдаёт color(srgb 0.1 0.2 0.3) для всего, что пришло из color-mix()
  // или oklch, и прежний разбор на таких элементах возвращал null — прибор молча
  // брал фон предка и считал контраст не от того фона. Именно на этом получались
  // ложные срабатывания вокруг активной строки навигатора.
  const parse = (s) => {
    const srgb = String(s).match(/^color\\(srgb ([\\d.]+) ([\\d.]+) ([\\d.]+)/);
    if (srgb) return [1, 2, 3].map((i) => Math.round(parseFloat(srgb[i]) * 255));
    if (!/^rgba?\\(/.test(s)) return null;
    const m = String(s).match(/\\d+(\\.\\d+)?/g);
    return m ? m.slice(0, 3).map(Number) : null;
  };
  const alphaOf = (s) => {
    const str = String(s);
    const slashed = str.match(/\\/\\s*([\\d.]+)\\s*\\)$/);   // color(srgb r g b / a)
    if (slashed) return parseFloat(slashed[1]);
    if (str.startsWith("rgba")) {
      const m = str.match(/[\\d.]+\\)$/);
      return m ? Number(m[0].slice(0, -1)) : 1;
    }
    return 1;
  };

  const bgOf = (el) => {
    // Фон ищем только среди предков, НА КОТОРЫХ ЭЛЕМЕНТ ВИЗУАЛЬНО ЛЕЖИТ.
    // Абсолютно спозиционированная подпись часто вынесена ЗА свой контейнер
    // (top: -20px), и наивный подъём по дереву приписывал ей фон полоски,
    // под которой она не находится: прибор дважды обвинял в провале контраста
    // текст, лежащий на обычном белом.
    const r0 = el.getBoundingClientRect();
    const cx = r0.left + r0.width / 2, cy = r0.top + r0.height / 2;
    let n = el;
    while (n && n !== document.documentElement) {
      const s = getComputedStyle(n); const c = parse(s.backgroundColor);
      // ПРОЗРАЧНОСТЬ ЧИТАЕТСЯ ИЗ ОБЕИХ ЗАПИСЕЙ. Разбор альфы смотрел только на
      // строки, начинающиеся с "rgba", и семипроцентная латунь поверх белой
      // панели — color(srgb 0.22 0.5 0 / 0.07) — считалась СПЛОШНЫМ фоном.
      // Отсюда пять «провалов контраста 2.21:1» там, где на самом деле 10:1:
      // прибор мерил текст против цвета, которого на экране нет.
      const a = alphaOf(s.backgroundColor);
      if (c && a > 0.5) {
        const r = n.getBoundingClientRect();
        const covers = cx >= r.left - 1 && cx <= r.right + 1 && cy >= r.top - 1 && cy <= r.bottom + 1;
        if (covers || n === el) return c;
      }
      n = n.parentElement;
    }
    // Умолчание — НЕ белый: в тёмной теме фон тёмный, и подстановка белого
    // превращала прибор в генератор ложных провалов контраста. Берём то, чем
    // страница реально закрашена.
    const rootBg = parse(getComputedStyle(document.body).backgroundColor)
                || parse(getComputedStyle(document.documentElement).backgroundColor);
    return rootBg || [255,255,255];
  };
  const checked = new Set();
  for (const el of document.querySelectorAll("body *")) {
    if (el.children.length || !vis(el)) continue;
    const txt = (el.textContent || "").trim();
    if (txt.length < 2) continue;
    if (!/[\\p{L}\\p{N}]/u.test(txt)) continue;  // только эмодзи/значок — не текст
    const s = getComputedStyle(el);
    const fg = parse(s.color); if (!fg) continue;
    const bg = bgOf(el);
    const L1 = lum(fg), L2 = lum(bg);
    const ratio = (Math.max(L1,L2) + 0.05) / (Math.min(L1,L2) + 0.05);
    const size = parseFloat(s.fontSize), weight = +s.fontWeight || 400;
    const large = size >= 24 || (size >= 18.66 && weight >= 700);
    const need = large ? 3 : 4.5;
    if (ratio < need) {
      const key = s.color + "|" + bg.join(",") + "|" + Math.round(size);
      if (checked.has(key)) continue; checked.add(key);
      out.contrast.push(ratio.toFixed(2) + ":1 (нужно " + need + ") " + Math.round(size) + "px " + s.color + " на rgb(" + bg.join(",") + ") :: " + txt.slice(0, 40));
    }
  }

  // ——— семантика ———
  // Кнопка без доступного имени — немая для диктора.
  out.unnamed = [];
  for (const el of document.querySelectorAll("button, a[href]")) {
    if (!vis(el)) continue;
    const name = (el.getAttribute("aria-label") || el.getAttribute("title") || el.textContent || "").trim();
    // текст только из значков именем не считается
    if (!name || !/[\\p{L}\\p{N}]/u.test(name)) out.unnamed.push((el.className || el.tagName) + " " + name.slice(0, 12));
  }

  // Порядок заголовков: пропуск уровня ломает навигацию по разделам.
  out.headings = [];
  let prev = 0;
  for (const h of document.querySelectorAll("h1,h2,h3,h4,h5,h6")) {
    if (!vis(h)) continue;
    const lvl = +h.tagName[1];
    if (prev && lvl > prev + 1) out.headings.push("h" + prev + " → h" + lvl + ": " + (h.textContent||"").trim().slice(0,32));
    prev = lvl;
  }

  // Поле ввода без подписи.
  out.unlabelled = [];
  for (const el of document.querySelectorAll("input:not([type=hidden]), textarea, select")) {
    if (!vis(el)) continue;
    const id = el.id;
    const lab = (id && document.querySelector('label[for="' + id + '"]')) || el.closest("label")
      || el.getAttribute("aria-label") || el.getAttribute("aria-labelledby") || el.getAttribute("placeholder");
    if (!lab) out.unlabelled.push((el.className || el.tagName) + " " + (el.type || ""));
  }

  // Собираем кириллицу отдельно: сравнивать надо ВИДИМЫЙ текст, а не разметку.
  for (const el of document.querySelectorAll("body *")) {
    if (el.children.length || !vis(el)) continue;
    const t = (el.textContent || "").trim();
    if (t.length < 2) continue;
    // «Диалог» — ИМЯ ПРОДУКТА, а не непереведённая строка: бренд не переводят,
    // как не переводят Duolingo. Единственное законное исключение; всё
    // остальное кириллическое в английском интерфейсе — ошибка.
    if (t.indexOf("Диалог") === 0) continue;
    if (/[\\u0400-\\u04FF]/.test(t)) out.cyr.push((el.className || el.tagName) + " :: " + t.slice(0, 46));
  }

  // ARIA-ПАТТЕРН, СОБРАННЫЙ НАПОЛОВИНУ, ХУЖЕ ОТСУТСТВУЮЩЕГО: диктор объявляет
  // «вкладка 1 из 3» или «список», человек жмёт стрелки — и ничего. Проверяется
  // статически, без прохода по сценарию.
  for (const lb of document.querySelectorAll("[role=listbox]")) {
    const alien = [...lb.children].filter((c) => c.getAttribute("role") !== "option");
    if (alien.length) out.aria.push("listbox с посторонними детьми (" +
      alien.map((c) => c.tagName).join(",") + ") — связь «владеет» разорвана");
  }
  for (const tl of document.querySelectorAll("[role=tablist]")) {
    const tabs = [...tl.querySelectorAll("[role=tab]")];
    if (!document.querySelector("[role=tabpanel]")) out.aria.push("tablist без tabpanel");
    if (tabs.some((t) => !t.getAttribute("aria-controls"))) out.aria.push("вкладка без aria-controls");
    if (tabs.filter((t) => t.tabIndex === 0).length > 1)
      out.aria.push("tablist без roving tabindex: каждая вкладка — своя остановка Tab");
  }

  // ПРОКРУЧИВАЕМАЯ ОБЛАСТЬ, КОТОРУЮ НЕЧЕМ ПРОЛИСТАТЬ С КЛАВИАТУРЫ.
  //
  // Вложенный скроллер прокручивается стрелками, только если он сам может
  // принять фокус (tabindex) или если фокус можно завести внутрь него — на
  // какое-нибудь управление. Не выполнено ни то, ни другое — часть содержимого
  // недостижима без мыши, и это не «неудобно», а «нельзя». Так молчала лента
  // реплик на экзамене: карточек тренера там нет, крестиков внутри нет, ноль
  // фокусируемых потомков — и свои первые ходы человек перечитать не мог.
  for (const el of document.querySelectorAll("body *")) {
    if (!vis(el)) continue;
    const s = getComputedStyle(el);
    const scrollsY = (s.overflowY === "auto" || s.overflowY === "scroll") && el.scrollHeight > el.clientHeight + 8;
    const scrollsX = (s.overflowX === "auto" || s.overflowX === "scroll") && el.scrollWidth > el.clientWidth + 8;
    if (!scrollsY && !scrollsX) continue;
    const ti = el.getAttribute("tabindex");
    if (ti !== null && ti !== "-1") continue;                       // сам берёт фокус
    // Управление внутри — тоже способ доскроллить: Tab подводит его под кромку.
    const inner = [...el.querySelectorAll("button, a[href], input:not([type=hidden]), select, textarea, [tabindex]:not([tabindex='-1'])")]
      .filter((n) => !n.disabled && vis(n));
    if (inner.length) continue;
    out.scroll.push(Math.round(Math.max(el.scrollHeight - el.clientHeight, el.scrollWidth - el.clientWidth)) +
      "px недостижимо: " + (el.className || el.tagName) + " прокручивается, но не принимает фокус и не содержит ни одного управления");
  }

  // ВИДЖЕТ-РОЛЬ БЕЗ ДОСТУПНОГО ИМЕНИ. Для этих ролей имя обязательно по
  // спецификации: без него диктор читает «индикатор, 3» — число, о котором
  // нечего сказать. Текст ВНУТРИ именем не считается: у progressbar и meter
  // содержимое дикторами не читается вовсе.
  const NAMED = ["progressbar", "meter", "slider", "radiogroup", "switch", "tablist", "dialog", "img", "log", "group"];
  for (const el of document.querySelectorAll("[role]")) {
    const role = (el.getAttribute("role") || "").trim();
    if (!NAMED.includes(role)) continue;
    if (!vis(el)) continue;
    const lb = el.getAttribute("aria-labelledby");
    const named = (el.getAttribute("aria-label") || "").trim()
      // ДВОЙНОЕ ЭКРАНИРОВАНИЕ ОБЯЗАТЕЛЬНО: PROBE — это шаблонный литерал, и
      // одиночное \\s внутри него превращается в букву «s», а не в границу
      // пробела. Разделитель становился /s+/, «cust-ex-head» распадался на
      // «cu» и «t-ex-head», и прибор объявлял безымянной группу, у которой имя
      // есть. Ровно этой ошибкой прибор уже врал 29 раз за прогон.
      || (lb ? lb.split(/\\s+/).some((id) => document.getElementById(id)) : false)
      || (role === "img" && (el.getAttribute("alt") || "").trim());
    if (!named) out.roleName.push('role="' + role + '" без доступного имени :: ' + (el.className || el.tagName).toString().slice(0, 40));
  }

  // РАДИОГРУППА БЕЗ ROVING TABINDEX. Роль обещает ОДНУ остановку Tab на всю
  // группу, а ходят внутри стрелки; четыре отдельные остановки и мёртвые
  // стрелки — ровно та половинчатая разметка, из-за которой из продукта уже
  // убрали «tablist» в разборе и «listbox» в курсе. Считается то, что видно
  // отсюда, — число остановок; работу стрелок проверяет уже человек за
  // клавиатурой, но без одной остановки они бессмысленны в любом случае.
  for (const rg of document.querySelectorAll("[role=radiogroup]")) {
    if (!vis(rg)) continue;
    const radios = [...rg.querySelectorAll("[role=radio]")].filter(vis);
    if (radios.length < 2) continue;
    const stops = radios.filter((r) => r.tabIndex === 0);
    if (stops.length !== 1)
      out.aria.push("radiogroup без roving tabindex: остановок Tab внутри " + stops.length +
                    " (обязана быть ровно одна) :: " + (rg.className || rg.tagName).toString().slice(0, 30));
  }

  // ИМЯ КНОПКИ — ТОЖЕ ПОЛЬЗОВАТЕЛЬСКИЙ ТЕКСТ. Прибор считал aria-label
  // доказательством, что с именем всё хорошо, и не смотрел, НА КАКОМ ОНО ЯЗЫКЕ.
  // Русский диктор читает aria-label="send" как «сенд».
  for (const el of document.querySelectorAll("[aria-label]")) {
    const label = (el.getAttribute("aria-label") || "").trim();
    if (label.length < 3) continue;
    const cyr = /[\u0400-\u04FF]/.test(label);
    if (LANG === "ru" && !cyr && /^[a-z][a-z ]+$/i.test(label))
      out.badLabel.push('aria-label="' + label + '" в русском интерфейсе');
    if (LANG === "en" && cyr)
      out.badLabel.push('aria-label="' + label + '" в английском интерфейсе');
  }

  // Плейсхолдер — не подпись (он исчезает при вводе), но его контраст считается.
  // Двойное экранирование обязательно: PROBE это шаблонный литерал, и
  // одиночная управляющая последовательность в нём превращается в символ
  // U+0008, а не в границу слова. Проверка не могла совпасть НИКОГДА и
  // печатала находку на каждом экране независимо от CSS — 29 раз за прогон.
  if (!/\\b(light|dark)\\b/.test(getComputedStyle(document.documentElement).colorScheme))
    out.leak.push("color-scheme не объявлен: плейсхолдеры и родные виджеты остаются светлыми на тёмном");
  return out;
})()`;

// ——— ГЕОМЕТРИЯ: перекрытие и вынос содержимого за коробку ———
//
// ПОЧЕМУ ЭТО ОТДЕЛЬНАЯ ПРОВЕРКА, А НЕ ЧАСТЬ PROBE. Всё в PROBE меряется там,
// где элемент лежит; перекрытие меряется только hit-тестом, а hit-тест работает
// в координатах ОКНА — значит каждый элемент надо сперва подвести под кромку.
// Отсюда `scrollIntoView` в цикле и отдельный вызов.
//
// ЧТО ОНА НАШЛА. На 390×844 кнопки карточек правого рейла лежали ПОД следующей
// карточкой: «Продолжить курс →» 324×48 на 398–446, и все пять контрольных
// точек попадали в `p.rc-note` соседней карточки; «Читать партию →» — то же
// самое. Причина не в отступе, а в том, что полосу прогресса в этих двух
// карточках рисует <span>: инлайновая коробка игнорирует `height`, и секция
// считалась на 153 и 218 пикселей короче своего содержимого. Ни одна прежняя
// проверка этого не видела — переполнение прибор ищет по ГОРИЗОНТАЛИ, а
// «выглядит тесно» дефектом не является. Дефект — это два прямоугольника.
const GEOM = `(() => {
  const out = { covered: [], spill: [], cut: [] };
  const vis = (el) => { const s = getComputedStyle(el);
    if (s.display === "none" || s.visibility === "hidden" || +s.opacity === 0) return false;
    // ЗАКРЫТЫЙ <details> — НЕ ДЕФЕКТ. Браузер прячет его содержимое через
    // content-visibility, а не display, поэтому наивная проверка видимости
    // считала свёрнутый блок «Почему это учит» видимым и рапортовала 1434px
    // содержимого ниже коробки. Прибор, который врёт, чинят раньше продукта.
    if (el.tagName !== "SUMMARY" && el.closest("details:not([open])")) return false;
    const r = el.getBoundingClientRect(); return r.width > 2 && r.height > 2; };
  const nm = (el) => {
    if (!el) return "—";
    const c = typeof el.className === "string" ? el.className.trim().split(/\\s+/).filter(Boolean).slice(0, 3).join(".") : "";
    return (c ? el.tagName.toLowerCase() + "." + c : el.tagName.toLowerCase())
      + (el.textContent ? " «" + el.textContent.trim().slice(0, 26) + "»" : "");
  };
  // Открытая шторка ЗАКРЫВАЕТ фон намеренно — это не дефект, а её работа.
  // Пока диалог открыт, смотрим только внутрь него.
  const dialog = document.querySelector("[role=dialog], dialog[open]");
  const skip = (el) => el.closest("[inert], [aria-hidden=true]") || (dialog && !dialog.contains(el));

  // ГЕОМЕТРИЯ ЛИСТАЕТ ВЛОЖЕННЫЕ СКРОЛЛЕРЫ И ОБЯЗАНА ВЕРНУТЬ ИХ НА МЕСТО.
  // Проверка перекрытия подводит каждое управление под кромку "scrollIntoView",
  // а он прокручивает не только документ, но и рельс. Прежняя редакция
  // возвращала на место только окно ("window.scrollTo(0, 0)"), и дальше
  // страдали двое: снимок стола уходил в отчёт с рельсом, прокрученным на 72
  // пикселя (портрет оппонента срезан сверху — это видно на desk-game-turn0),
  // а проверка прилипшего низа мерила «покой» в точке, где игрок рельс никогда
  // не застаёт. Лента реплик при этом прокручена вниз ПРОДУКТОМ, поэтому
  // возвращаем не нули, а исходные значения.
  const scrollers = [...document.querySelectorAll("body *")]
    .filter((el) => el.scrollHeight > el.clientHeight + 1)
    .map((el) => [el, el.scrollTop]);
  const restoreScroll = () => { for (const [el, t] of scrollers) el.scrollTop = t; };

  // 1. ПЕРЕКРЫТИЕ. Пять точек на управлении: центр и четыре угла внутрь на 3px.
  // Три из пяти в чужом элементе — по кнопке нельзя попасть.
  const ctl = [...document.querySelectorAll("button, a[href], input:not([type=hidden]), select, textarea, [role=button]")];
  for (const el of ctl.slice(0, 80)) {
    if (!vis(el) || skip(el)) continue;
    el.scrollIntoView({ block: "center", inline: "nearest" });
    const r = el.getBoundingClientRect();
    const pts = [[r.left + r.width / 2, r.top + r.height / 2],
                 [r.left + 3, r.top + 3], [r.right - 3, r.top + 3],
                 [r.left + 3, r.bottom - 3], [r.right - 3, r.bottom - 3]];
    let blocked = 0, by = null, inside = 0;
    for (const [x, y] of pts) {
      if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) continue;
      inside++;
      const top = document.elementFromPoint(x, y);
      if (!top || top === el || el.contains(top) || top.contains(el)) continue;
      blocked++; by = top;
    }
    if (inside >= 3 && blocked >= 3)
      out.covered.push(Math.round(r.width) + "x" + Math.round(r.height) +
        " y=" + Math.round(r.top) + ".." + Math.round(r.bottom) + " " + nm(el) +
        " ← закрыт " + nm(by) + " (" + blocked + " из " + inside + " точек)");
  }
  window.scrollTo(0, 0);
  restoreScroll();

  // 2. СОДЕРЖИМОЕ НИЖЕ СВОЕЙ КОРОБКИ. Родитель не клипует, значит текст видно —
  // но лежит он уже на соседе, и это ровно то, из чего получается перекрытие.
  for (const el of document.querySelectorAll("body *")) {
    if (!vis(el) || !el.children.length) continue;
    const s = getComputedStyle(el);
    if (s.overflowY !== "visible" || s.position === "absolute" || s.position === "fixed") continue;
    const r = el.getBoundingClientRect();
    let low = -1e9, who = null;
    for (const ch of el.children) {
      const cs = getComputedStyle(ch);
      if (cs.position === "absolute" || cs.position === "fixed" || !vis(ch)) continue;
      if (parseFloat(cs.marginBottom) < 0) continue;   // выступ намеренный
      const cr = ch.getBoundingClientRect();
      if (cr.bottom > low) { low = cr.bottom; who = ch; }
    }
    const over = low - r.bottom - parseFloat(s.paddingBottom || 0);
    if (who && over > 4)
      out.spill.push(Math.round(over) + "px ниже коробки :: " + nm(el).slice(0, 44) + " ← " + nm(who).slice(0, 44));
  }

  // 3. ПРИЛИПШИЙ НИЗ ЗАКРАШИВАЕТ СОДЕРЖИМОЕ.
  //
  // ПРЕЖНЯЯ РЕДАКЦИЯ ЭТОЙ ПРОВЕРКИ НЕ МОГЛА СРАБОТАТЬ НИ РАЗУ, и это выяснилось
  // замером, а не чтением. Она домагивала скроллер до конца (scrollTop =
  // scrollHeight) и спрашивала «что осталось под полосой» — то есть искала
  // содержимое, до которого нельзя доскроллить. Но прилипший низ у нас —
  // ПОСЛЕДНИЙ элемент потока (".side-foot", "margin-top: auto"), а такой на
  // максимуме прокрутки стоит ровно на своём месте в потоке и не закрывает
  // собой ничего по определению. Проверка исправно возвращала пустой список на
  // рельсе, у которого при этом целая кнопка была не видна. Прибор, который не
  // может сработать, хуже отсутствующего: его молчание читают как «чисто».
  //
  // Меряем теперь ДВЕ разные беды, и первая — та, что есть на самом деле.
  //
  // (а) НА ПОКОЕ. Полоса непрозрачна ("background: var(--ground)"), и всё, что
  //     оказалось под ней при том "scrollTop", в котором игрок застаёт рельс,
  //     он не видит вовсе — хотя место на экране под это отведено. Замер на
  //     1440×900 за столом: ".side-foot" 134 px пришпилен на 750..884, панель
  //     «Условия сделки» лежит 668..822 — 72 px закрашено, — а кнопка брифинга
  //     832..874 закрыта ЦЕЛИКОМ. Пятиточечный hit-тест выше её не ловит: он
  //     сперва подводит элемент под кромку "scrollIntoView", и правильно
  //     делает — там речь о другом дефекте.
  // (б) НЕДОСТИЖИМОЕ. Если прилипший низ не последний в потоке, часть
  //     содержимого не выводится под кромку никаким скроллом. Класс редкий, но
  //     настоящий, поэтому остаётся.
  const floorHit = (sc, stick, floorTop, scRect, when) => {
    // Элемент, целиком уехавший ниже коробки скроллера, — это обычная
    // прокрутка, а не работа полосы: без неё его тоже не было бы видно.
    const painted = (cr) => cr.top >= floorTop - 1 && cr.top < scRect.bottom - 1;
    for (const el of sc.querySelectorAll("button, a[href], input:not([type=hidden]), select, textarea, [role=button]")) {
      // Кнопки САМОЙ полосы лежат ниже её кромки по определению — она их и
      // держит. Без этой строки прибор докладывал бы о выходе со стола как о
      // закрытом им же самим.
      if (!vis(el) || skip(el) || stick.some((s) => s.contains(el))) continue;
      const cr = el.getBoundingClientRect();
      if (!painted(cr)) continue;
      out.cut.push("управление закрыто прилипшим низом " + when + ": " +
        Math.round(cr.width) + "x" + Math.round(cr.height) + " на " + Math.round(cr.top) + ".." +
        Math.round(cr.bottom) + " при кромке " + Math.round(floorTop) + " :: " + nm(el).slice(0, 40));
    }
    for (const ch of sc.children) {
      if (!vis(ch) || skip(ch) || getComputedStyle(ch).position === "sticky") continue;
      const cr = ch.getBoundingClientRect();
      const hidden = Math.min(cr.bottom, scRect.bottom) - floorTop;
      if (hidden > 6 && cr.top < floorTop - 1)
        out.cut.push(Math.round(hidden) + "px закрашено прилипшим низом " + when + " (" +
          Math.round(cr.top) + ".." + Math.round(cr.bottom) + " при кромке " +
          Math.round(floorTop) + ") :: " + nm(ch).slice(0, 40));
    }
  };
  for (const sc of document.querySelectorAll("body *")) {
    if (!vis(sc)) continue;
    const ss = getComputedStyle(sc);
    if (ss.overflowY !== "auto" && ss.overflowY !== "scroll") continue;
    if (sc.scrollHeight <= sc.clientHeight + 1) continue;
    const stick = [...sc.children].filter((c) => {
      const cs = getComputedStyle(c);
      return cs.position === "sticky" && vis(c) && parseFloat(cs.bottom || "auto") >= 0;
    });
    if (!stick.length) continue;
    const scRect = sc.getBoundingClientRect();
    const topOf = () => Math.min(...stick.map((c) => c.getBoundingClientRect().top));
    // «Покой» — это НОЛЬ, а не то, где скроллер оставила проверка перекрытия
    // выше. Рельс продукт не прокручивает никогда: игрок застаёт его в начале
    // и уезжает от начала только сам.
    sc.scrollTop = 0;
    floorHit(sc, stick, topOf(), scRect, "на покое");
    sc.scrollTop = sc.scrollHeight;
    floorHit(sc, stick, topOf(), scRect, "и до него не доскроллить");
  }
  restoreScroll();
  return out;
})()`;

// ——— КЛАВИАТУРНЫЙ ПРОХОД: ОДИН ОБХОД, ДВА ОТВЕТА ———
//
// Первый: ВИДЕН ЛИ ФОКУС. `:focus-visible` не включается от программного
// `.focus()` — только от настоящей клавиши, поэтому жмём Tab и смотрим на
// вычисленный стиль элемента под фокусом.
//
// Второй, и он важнее: ДОХОДИТ ЛИ TAB ДО КАЖДОГО ДЕЙСТВИЯ. Этого прибор не
// спрашивал ни разу — и не увидел, как «А что если…», единственное место
// продукта, где партию переигрывают на своих же словах, оказалось
// неиграбельным без мыши: поле «впишите свою реплику» стоит в порядке обхода
// между затравками и кнопкой «Показать» и по `onFocus` гасило выбранную
// затравку, а кнопка от этого становилась `disabled` — то есть исчезала из
// обхода ровно в тот момент, когда до неё дошли. Мышью путь работал, потому
// что мышь поля не касается. Проверка «кнопка имеет имя» такое не ловит:
// имя у кнопки было.
//
// Мерять это можно только НАСТОЯЩИМИ нажатиями Tab: порядок обхода зависит от
// tabindex, disabled, inert, `display`, порталов и того, что делает сама
// страница в ответ на фокус. Ни один статический разбор разметки этого не
// воспроизводит.
const KB_MARK = `(() => {
  const OP = 'button, a[href], input:not([type=hidden]), select, textarea, [tabindex]:not([tabindex="-1"]), [role=button], [role=radio], [role=switch], [role=option], [role=tab]';
  const vis = (el) => {
    const s = getComputedStyle(el);
    if (s.display === "none" || s.visibility === "hidden" || +s.opacity === 0) return false;
    if (el.tagName !== "SUMMARY" && el.closest("details:not([open])")) return false;
    const r = el.getBoundingClientRect();
    return r.width > 1 && r.height > 1;
  };
  const out = [];
  let i = 0;
  for (const el of document.querySelectorAll(OP)) {
    // Выключенное управление вне обхода ПО ЗАМЫСЛУ, инертное — тем более.
    if (el.disabled || el.closest("[inert]")) continue;
    // И tabindex="-1" — тоже замысел, а не дефект: так помечены цель
    // перевода фокуса (заголовок экрана, карточка вопроса) и невыбранные
    // члены радиогруппы с roving tabindex. Требовать, чтобы Tab дошёл до них,
    // значило бы требовать сломать ровно ту модель, которую мы чинили.
    if (el.getAttribute("tabindex") === "-1") continue;
    if (!vis(el)) continue;
    el.setAttribute("data-kb", String(i));
    const name = (el.getAttribute("aria-label") || el.textContent || el.getAttribute("title")
                  || el.getAttribute("placeholder") || "").replace(/\\s+/g, " ").trim();
    out.push({ i: String(i), sel: (el.className || el.tagName).toString().slice(0, 40), name: name.slice(0, 46) });
    i++;
  }
  return out;
})()`;

async function keyboardWalk(page) {
  const all = await page.evaluate(KB_MARK);
  const noRing = [];
  const seen = new Set();
  if (all.length) {
    await page.evaluate(() => { const a = document.activeElement; if (a && a.blur) a.blur(); });
    // Полтора круга с запасом: одного мало (обход мог начаться с середины),
    // трёх — расточительно.
    const budget = Math.min(all.length * 2 + 6, 90);
    let atBody = 0;
    for (let k = 0; k < budget; k++) {
      await page.keyboard.press("Tab");
      const r = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return null;
        const cs = getComputedStyle(el);
        const visible = (cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0)
          || (cs.boxShadow !== "none" && /inset|rgb/.test(cs.boxShadow));
        return {
          visible, kb: el.getAttribute("data-kb"),
          id: (el.className || el.tagName) + "::" + (el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 24),
        };
      });
      if (!r) { if (++atBody > 2) break; continue; }   // адресная строка браузера — один раз за круг
      if (!r.visible && !noRing.includes(r.id)) noRing.push(r.id);
      if (r.kb !== null) seen.add(r.kb);
      if (seen.size >= all.length) break;
    }
  }
  // ПЕРЕПРОВЕРКА ПЕРЕД ОБВИНЕНИЕМ — И ЕЁ СОБСТВЕННАЯ ЛОВУШКА.
  //
  // За время обхода страница живёт: что-то успевает скрыться. Пропавшее
  // управление — шум, а не находка. Но первая редакция этой перепроверки
  // отбрасывала ЗАОДНО и то, что стало `disabled`, — и молча съедала ровно тот
  // дефект, ради которого написана: кнопка «Показать, что было бы иначе»
  // выключалась В ХОДЕ ОБХОДА, потому что Tab заходил в соседнее поле, а поле
  // гасило выбранную затравку. К концу обхода кнопка была выключена, и прибор
  // считал это законным основанием промолчать.
  //
  // Поэтому случая два, и второй — отдельная, более громкая находка: ОДИН
  // ТОЛЬКО TAB НЕ ИМЕЕТ ПРАВА ВЫКЛЮЧАТЬ УПРАВЛЕНИЯ. Обход ничего не нажимает.
  const check = await page.evaluate((ids) => {
    const out = { unreached: [], killed: [] };
    for (const id of ids) {
      const el = document.querySelector('[data-kb="' + id + '"]');
      if (!el || el.closest("[inert]")) continue;
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      if (s.display === "none" || s.visibility === "hidden" || +s.opacity === 0) continue;
      if (r.width <= 1 || r.height <= 1) continue;
      (el.disabled ? out.killed : out.unreached).push(id);
    }
    document.querySelectorAll("[data-kb]").forEach((e) => e.removeAttribute("data-kb"));
    return out;
  }, all.filter((e) => !seen.has(e.i)).map((e) => e.i));
  const byId = new Map(all.map((e) => [e.i, e]));
  const pick = (ids) => ids.map((id) => byId.get(id)).filter(Boolean);
  return { noRing, unreached: pick(check.unreached), killed: pick(check.killed) };
}

// ——— ФОКУС ПОСЛЕ НАЖАТИЯ ———
//
// Управление, которое исчезает тем же нажатием, которым его нажимают, уносит
// фокус с собой: браузер роняет его на BODY. Для человека с клавиатурой это
// значит «следующий Tab начинает документ заново», для диктора — что о
// случившемся не сказано НИЧЕГО. Так молчало «Чтение стола»: четыре варианта
// ответа сменялись разбором, ради которого режим и существует, и разбор этот
// не объявлялся ничем.
//
// Проверка НЕ требует, чтобы фокус остался на месте: правильных ответов два —
// остаться на живом элементе или уехать туда, где теперь суть. Находкой
// считается только BODY.
async function focusAfter(page, where, what, act) {
  const before = await page.evaluate(() => !!document.activeElement && document.activeElement !== document.body);
  if (!before) return;                       // фокуса не было — терять нечего
  await act();
  await page.waitForTimeout(500);
  const lost = await page.evaluate(() => !document.activeElement || document.activeElement === document.body);
  if (lost) add("BAD", where, "focus", `после «${what}» фокус упал на BODY: с клавиатуры обход начинается заново, диктору не сказано ничего`);
}

async function probe(page, where, tag, lang = "ru") {
  // Язык прокидывается ВНУТРЬ страницы, а не угадывается там: проверка имён
  // кнопок зависит от того, на каком языке интерфейс должен быть.
  const r = await page.evaluate(`const LANG = ${JSON.stringify(lang)};\n` + PROBE);
  if (r.hscroll) add("BAD", where, "hscroll", "горизонтальная прокрутка документа");
  for (const o of r.overflow.slice(0, 4)) add("BAD", where, "overflow", "текст вылезает: " + o);
  if (tag === "mob") for (const s of r.small.slice(0, 6)) add("WARN", where, "target", "мелкая цель " + s);
  for (const l of r.leak) add("BAD", where, "leak", "в тексте видно «" + l + "»");
  for (const d of r.dupIds.slice(0, 3)) add("WARN", where, "dupid", "повтор id: " + d);
  if (r.noAlt) add("WARN", where, "alt", r.noAlt + " img без атрибута alt");
  for (const a of (r.aria || []).slice(0, 3)) add("BAD", where, "aria", a);
  for (const sc of (r.scroll || []).slice(0, 3)) add("BAD", where, "kbscroll", "прокрутка только мышью: " + sc);
  for (const n of (r.roleName || []).slice(0, 4)) add("BAD", where, "name", n);
  for (const l of (r.badLabel || []).slice(0, 3)) add("BAD", where, "i18n", l);
  for (const m of (r.mute || []).slice(0, 3)) add("BAD", where, "a11y", m);
  for (const c of r.contrast.slice(0, 6)) add("WARN", where, "contrast", c);
  for (const u of (r.unnamed || []).slice(0, 5)) add("BAD", where, "name", "кнопка без имени: " + u);
  if (tag === "desk") {
    const kb = await keyboardWalk(page);
    for (const f of kb.noRing.slice(0, 4)) add("BAD", where, "focus", "фокус не виден при Tab: " + f);
    for (const u of kb.unreached.slice(0, 4))
      add("BAD", where, "kbreach", `до управления не доходит Tab: ${u.sel} :: «${u.name}»`);
    for (const u of kb.killed.slice(0, 4))
      add("BAD", where, "kbreach", `управление выключилось во время обхода Tab — дойти до него нельзя: ${u.sel} :: «${u.name}»`);
  }
  for (const h of (r.headings || []).slice(0, 3)) add("WARN", where, "heading", "пропуск уровня " + h);
  for (const u of (r.unlabelled || []).slice(0, 3)) add("BAD", where, "label", "поле без подписи: " + u);
  // Геометрия идёт ПОСЛЕ остальных проверок и ДО снимка: она листает страницу,
  // и снимок с середины прокрутки читался бы как другой экран.
  const g = await page.evaluate(GEOM);
  for (const c of (g.covered || []).slice(0, 4)) add("BAD", where, "overlap", "управление перекрыто: " + c);
  for (const c of (g.cut || []).slice(0, 4)) add("BAD", where, "cut", "срезано: " + c);
  for (const sp of (g.spill || []).slice(0, 4)) add("BAD", where, "spill", "содержимое ниже своей коробки: " + sp);
  await page.evaluate(() => window.scrollTo(0, 0));
  if (tag === "en") {
    for (const c of (r.cyr || []).slice(0, 6)) add("BAD", where, "i18n", "непереведено: " + c);
  }
  await page.screenshot({ path: `${OUT}/${tag}-${where.replace(/[^\w-]/g, "_")}.png`, fullPage: tag === "desk" });
}

// ФЛАГИ ПАМЯТИ — НЕ УКРАШЕНИЕ. README честно пишет, что прогон целиком не
// влезает в память коробки и хром падает по oom-kill на середине курса; упавший
// прибор не отчитывается ни о чём. Общая память тут делится с гейтвеем и
// тестами, поэтому отбираем у браузера всё, что не нужно обходчику: общую
// память /dev/shm (её тут 64 МБ), GPU, лишние процессы отрисовки.
const browser = await chromium.launch({
  executablePath: EXE,
  args: [
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    "--renderer-process-limit=1",
    "--disable-background-networking",
    "--js-flags=--max-old-space-size=256",
  ],
});

for (const vp of VPS) {
  VP = vp.tag;
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: 1, colorScheme: vp.scheme });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => add("BAD", "*", "js", "PAGEERROR " + String(e).slice(0, 120)));
  page.on("console", (m) => { if (m.type() === "error" && !/WebSocket|favicon|Failed to load resource/.test(m.text())) add("BAD", "*", "js", m.text().slice(0, 120)); });
  // «Failed to load resource: 400» без адреса — это не находка, а загадка:
  // консоль имени файла не называет. Слушаем ответы и говорим, ЧТО именно.
  page.on("response", (res) => {
    const url = res.url();
    if (res.status() >= 400 && !/favicon/.test(url)) {
      // Тело запроса тоже в находку: «400 на /api/course/coach» без него —
      // загадка на полчаса, а с ним — готовый воспроизводимый случай.
      const body = (res.request().postData() || "").slice(0, 120);
      add("BAD", "*", "net",
          `${res.status()} на ${url.replace(BASE, "/").slice(0, 90)}${body ? " ← " + body : ""}`);
    }
  });
  await page.addInitScript(() => { try { localStorage.setItem("dialog.tutorialDone.v1", "1"); localStorage.setItem("dialog.tours.v1", '{"enabled":false}'); } catch {} });
  if (vp.attr) await page.addInitScript((a) => {
    document.addEventListener("DOMContentLoaded", () => document.documentElement.setAttribute("data-theme", a));
  }, vp.attr);
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2200);
  if (vp.lang === "en") {
    await page.locator('.seg button:has-text("EN")').first().click().catch(()=>{});
    await page.waitForTimeout(900);
  }

  await probe(page, "home", vp.tag, vp.lang || "ru");

  // ——— «ЧТЕНИЕ СТОЛА»: ШТОРКА, КОТОРУЮ ОБХОДЧИК НЕ ВИДЕЛ НИ РАЗУ ———
  // Режим живёт карточкой на главной (раздел «Другие форматы тренировки»,
  // раньше — рейл) и открывается порталом в <body> поверх
  // инертной оболочки — то есть ни один из обходов по разделам сюда не попадал.
  // Ходим по `data-reading`, а не по подписи: подпись переводится.
  {
    const open = page.locator('[data-reading="open"]').first();
    if (await open.count()) {
      await open.click();
      // Экран режима едет отдельным куском сборки: ждём его, а не таймаут.
      const got = await page.waitForSelector(".rd-shell .rd-head", { timeout: 15000 }).catch(() => null);
      if (!got) add("BAD", "reading", "nav", "карточка «Чтение стола» не открыла экран режима");
      else {
        await probe(page, "reading", vp.tag, vp.lang || "ru");
        // Остановка с вопросом — то состояние, ради которого режим и сделан.
        const opt = page.locator(".rd-opts button").first();
        if (await opt.count()) {
          // ОТВЕЧАЕМ КЛАВИАТУРОЙ, а не мышью, и ровно поэтому проверка что-то
          // значит: мышиный клик фокуса не ставит, и «фокус упал на BODY»
          // после него не отличить от «фокуса и не было».
          await opt.focus().catch(() => {});
          await focusAfter(page, "reading", "ответ на остановке",
                           () => page.keyboard.press("Enter"));
          await page.waitForTimeout(500);
          await probe(page, "reading-answer", vp.tag, vp.lang || "ru");
        } else {
          add("BAD", "reading", "nav", "у остановки нет вариантов ответа — экран показал не то");
        }
      }
      await page.keyboard.press("Escape").catch(() => {});
      await page.waitForTimeout(600);
    } else {
      add("BAD", "reading", "nav", "карточки «Разбор чужой партии» нет на главной (раздел «Другие форматы»)");
    }
  }

  // ПЕРЕХОД ОБЯЗАН СОСТОЯТЬСЯ, И ЭТО ПРОВЕРЯЕТСЯ. Раньше клик по русской
  // подписи глотался `.catch(()=>{})`: в английском режиме навигация не
  // срабатывала, а снимок всё равно сохранялся под именем раздела — шесть
  // разделов оказывались одним и тем же домашним экраном. Ходим по ключу
  // раздела (`data-nav`, от языка не зависит) и убеждаемся, что пункт стал
  // активным; не стал — это находка, а не молчание.
  const nav = async (key, name) => {
    await page.locator(`[data-nav="${key}"]`).first().click().catch(()=>{});
    await page.waitForTimeout(1300);
    if (!await page.locator(`[data-nav="${key}"].on`).count())
      add("BAD", name, "nav", `переход в «${key}» не состоялся — снимок показал бы не тот экран`);
    await probe(page, name, vp.tag, vp.lang || "ru");
  };

  await nav("campaign", "campaign");
  await nav("course", "course");
  await nav("custom", "custom");
  await nav("exam", "exam");
  await page.locator('[data-nav="profile"]').first().click().catch(()=>{});
  await page.waitForTimeout(1200); await probe(page, "profile", vp.tag, vp.lang || "ru");

  // ——— глубокие состояния ———
  // Курс: блок → урок → упражнение
  await page.click('text=КУРС').catch(()=>{});
  await page.waitForTimeout(1200);
  // В КУРС ЗАХОДЯТ ВСЕ РЕЖИМЫ, ВКЛЮЧАЯ ТЁМНЫЕ.
  //
  // Раньше здесь стояло `desk || mob || en`, и рассуждение было такое: «тёмные
  // варианты для упражнений почти ничего не добавляют — те же токены, что
  // везде». Рассуждение неверное. Курс — самая текстовая часть продукта (счёт
  // блоков, уроков, упражнений и типов разметки прибор печатает при старте, из
  // каталога — вписывать их сюда значит завести четвёртую копию, которая
  // протухнет вместе с остальными), и у него СВОИ цвета: рамка
  // вердикта, подсветка выбранного варианта, фон карточки соответствия,
  // приглушённый текст разбора. Ни одна из них на контраст в тёмной теме не
  // проверялась ни разу — а системная тёмная (`dark-sys`) вдобавок не получает
  // правил под `[data-theme="dark"]` и уже один раз ломалась целиком.
  //
  // Английский обход курса ОБЯЗАТЕЛЕН, хотя он и медленный. Проверка на
  // просочившуюся кириллицу гоняется только в режиме `en`, а курс — самая
  // текстовая часть продукта. Пропуская его, прибор рапортовал
  // «непереведённого нет», ни разу туда не заглянув.
  const deepCourse = true;

  // ТЁМНЫЙ ОБХОД — СОКРАЩЁННЫЙ, И ВОТ ПОЧЕМУ ИМЕННО ТАК.
  //
  // Полный обход курса в пяти режимах в память коробки не влезает: хром уже
  // падал здесь по oom-kill, и упавший на середине прибор не отчитывается ни о
  // чём (README: «прогон целиком не влезает в память»). Значит выбор не между
  // «полно» и «сокращённо», а между «сокращённо» и «никак».
  //
  // Сокращаем по типу разметки, а не по числу экранов. Проверки `probe()`
  // смотрят на ФОРМУ: контраст пары «текст на своём фоне», переполнение,
  // размер цели, имя кнопки. Два упражнения одного типа отличаются только
  // словами внутри одинаковых узлов — на второй `choice` тёмная тема не даёт
  // ничего, чего не дал первый. Поэтому тёмный проход идёт до первого
  // упражнения КАЖДОГО типа и на этом останавливается, а блоки и уроки
  // перебирает ровно настолько, насколько нужно, чтобы эти типы встретить
  // (типы разложены по разным блокам — одного блока мало).
  //
  // Чего сокращение НЕ покрывает, сказано вслух в конце прохода: типы, до
  // которых обход не добрался, печатаются. Прибор, умалчивающий о своих
  // границах, врёт не меньше того, который не проверяет вовсе.
  const shortCourse = vp.tag.startsWith("dark");

  // Профиль подставляем ЕЩЁ РАЗ, прямо перед обходом курса. Между экранами его
  // успевает перезаписать сам продукт (серия, цель дня), и посеянный на старте
  // прогресс к этому моменту исчезал — обходчик видел один открытый блок вместо
  // семи и не доходил до четырёх типов упражнений.
  await page.evaluate((blocks) => {
    const course = {};
    for (const b of blocks) {
      course[b] = { lessons:[1,2,3,4], solved:[], missed:[], examBest:5, examTotal:5,
                    passed:true, attempts:1 };
    }
    const raw = localStorage.getItem("dialog.progress.v1");
    const prof = raw ? JSON.parse(raw) : {};
    prof.course = course; prof.xp = 900;
    localStorage.setItem("dialog.progress.v1", JSON.stringify(prof));
  }, COURSE.blocks).catch(()=>{});
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  // Язык живёт в состоянии React и перезагрузку не переживает — после reload
  // интерфейс снова русский. Без этой строки прибор пометил бы русские подписи
  // как «непереведено» и обвинил продукт в том, чего в нём нет: снимок экрана
  // показывал ровно TRAINING, CAMPAIGN, YOUR DEAL.
  if (vp.lang === "en") {
    await page.locator('.seg button:has-text("EN")').first().click().catch(()=>{});
    await page.waitForTimeout(800);
  }
  await page.locator('[data-nav="course"]').first().click().catch(()=>{});
  await page.waitForTimeout(1300);

  const ALL_KINDS = COURSE.kinds;
  const seen = new Set();
  // Типы упражнений разложены по РАЗНЫМ блокам, поэтому одного блока мало.
  // Идём по блокам, пока не увидим все десять или пока блоки не кончатся.
  const blockCount = deepCourse ? await page.locator(".cnode-btn:not(:disabled)").count() : 0;
  if (vp.tag === "desk") console.log("  открытых блоков:", blockCount, "из", COURSE.blocks.length);
  // ПОСЕВ ПРОГРЕССА ОБЯЗАН ОТКРЫТЬ ВЕСЬ КАТАЛОГ, И ЭТО ПРОВЕРЯЕТСЯ. Список
  // блоков в приборе однажды отстал от курса на два блока, обход молча ходил
  // по девяти и печатал «увидено 10/10» — то есть отчитывался об успехе там,
  // где два блока не открывались вовсе.
  if (deepCourse && blockCount < COURSE.blocks.length)
    add("BAD", "course", "nav", `посев открыл ${blockCount} блоков из ${COURSE.blocks.length} — часть курса не обойдена`);
  for (let bi = 0; bi < Math.min(blockCount, 6) && seen.size < ALL_KINDS.length; bi++) {
    const blocks = page.locator(".cnode-btn:not(:disabled)");
    if (await blocks.count() <= bi) break;
    await blocks.nth(bi).click().catch(()=>{});
    await page.waitForTimeout(1100);
    if (vp.tag === "desk") console.log("    блок", bi, "→", await page.evaluate(()=>document.querySelector(".screen h1, .screen h2")?.innerText?.slice(0,28)));
    if (bi === 0) await probe(page, "course-block", vp.tag, vp.lang || "ru");
    // Задания разбиты ПО УРОКАМ, а не по блоку целиком: на урок приходится
    // одно-два. Чтобы увидеть все десять типов, надо обойти уроки, а если типов
    // всё ещё не хватает — и соседние блоки.
    const lessonsCount = await page.locator(".lesson-list button").count();
    for (let li = 0; li < Math.min(lessonsCount, 4); li++) {
      const lessons = page.locator(".lesson-list button");
      if (await lessons.count() <= li) break;
      await lessons.nth(li).click().catch(()=>{});
      await page.waitForTimeout(900);
      if (li === 0) await probe(page, "course-lesson", vp.tag, vp.lang || "ru");
      const toTasks = page.getByRole("button", { name: RX.toTasks }).first();
      if (await toTasks.count()) { await toTasks.click().catch(()=>{}); await page.waitForTimeout(1100); }

      // В тёмном проходе на урок хватает четырёх шагов: больше — это повторы
      // уже увиденных типов, ради которых тёмный режим сюда и не заходит.
      for (let i = 0; i < (shortCourse ? 4 : 8); i++) {
        const kind = await page.evaluate(() => {
          const ex = document.querySelector(".ex");
          if (!ex) return null;
          const m = /ex--([a-z_]+)/.exec(ex.className);
          return m ? m[1] : "ex";
        });
        if (!kind) break;
        if (!seen.has(kind)) { seen.add(kind); await probe(page, "ex-" + kind, vp.tag, vp.lang || "ru"); }
        for (const box of await page.locator(".ex textarea, .ex input[type=text]").all()) {
          await box.fill(vp.lang === "en"
            ? "What matters most to you in this deal, and why exactly that?"
            : "Что для вас важнее всего в этой сделке и почему именно это?").catch(()=>{});
        }
        for (const num of await page.locator(".ex input[type=number]").all()) {
          await num.fill("86").catch(()=>{});
        }
        const opt = page.locator(".ex button:not(:disabled)").first();
        if (await opt.count()) { await opt.click().catch(()=>{}); await page.waitForTimeout(300); }
        const check = page.locator(".ex-go").first();
        // «Проверить» исчезает вместе с нажатием: на его месте появляется
        // вердикт. Тот же класс дефекта, что в «Чтении стола», — меряем так же.
        // Только по ЖИВОЙ кнопке: `focus()` на выключенной молча не сработает,
        // и Enter уйдёт в вариант ответа, который остался под фокусом, —
        // прибор мерил бы собственный промах.
        if (await check.count() && await check.isEnabled().catch(() => false)) {
          await check.focus().catch(() => {});
          await focusAfter(page, "ex-" + (kind || "?"), "Проверить",
                           () => page.keyboard.press("Enter"));
          await page.waitForTimeout(400);
        } else if (await check.count()) {
          await check.click().catch(() => {}); await page.waitForTimeout(750);
        }
        const next = page.getByRole("button", { name: RX.next }).first();
        if (!await next.count()) break;
        await next.click().catch(()=>{});
        await page.waitForTimeout(850);
      }
      // Вернуться к списку уроков блока.
      const back = page.getByRole("button", { name: RX.back }).first();
      if (await back.count()) { await back.click().catch(()=>{}); await page.waitForTimeout(900); }
      if (seen.size >= ALL_KINDS.length) break;
    }
    // Вернуться к списку блоков. Кнопка «←» ведёт на уровень вверх, а сколько
    // уровней мы прошли — зависит от того, где оборвался обход упражнений.
    // Поэтому не гадаем: жмём назад, а если списка блоков не видно — заходим
    // в курс заново через меню. Иначе обходчик застревал на первом блоке и
    // четыре типа упражнений оставались непроверенными.
    for (let back = 0; back < 3; back++) {
      if (await page.locator(".cnode-btn").count()) break;
      const b = page.getByRole("button", { name: RX.back }).first();
      if (!await b.count()) break;
      await b.click().catch(()=>{});
      await page.waitForTimeout(700);
    }
    if (!await page.locator(".cnode-btn").count()) {
      await page.locator('[data-nav="course"]').first().click().catch(()=>{});
      await page.waitForTimeout(1200);
    }
  }
  // ГРАНИЦЫ ОБХОДА ПЕЧАТАЮТСЯ ДЛЯ КАЖДОГО РЕЖИМА, а не только для desk: иначе
  // сокращённый тёмный проход выглядел бы как полный.
  {
    const missing = ALL_KINDS.filter(k => !seen.has(k));
    console.log(`  [${vp.tag}] типов упражнений увидено ${seen.size}/${ALL_KINDS.length}:`,
                [...seen].sort().join(", ") || "НИ ОДНОГО");
    if (missing.length) console.log(`  [${vp.tag}] НЕ УВИДЕНО:`, missing.join(", "));
  }

  // Тренировка → СРАЗУ стол → исход → разбор.
  //
  // ПРЯМОЙ ПУТЬ. Между «НАЧАТЬ →» и полем ввода не должно стоять ни одного
  // промежуточного экрана. Стоял: полноэкранный конфигуратор слоёв — четыре
  // выключенных тумблера и инженерный инвариант «оценка та же», объяснённый
  // человеку, который ещё не сделал ни одного хода. Меряем ровно это: один
  // клик по карточке, дальше только ожидание, без единого клика больше.
  // Переход в тренировку — по ключу раздела, не по русской подписи: в
  // английском режиме `text=ТРЕНИРОВКА` молча промахивался, и до стола
  // обходчик не доходил вовсе.
  await page.locator('[data-nav="practice"]').first().click().catch(()=>{});
  await page.waitForTimeout(1200);
  await page.locator(".card").first().click().catch(()=>{});
  await page.waitForSelector(".chat textarea, .setup-layers", { timeout: 20000 }).catch(()=>{});
  if (await page.locator(".setup-layers, .lay-panel").count()) {
    add("BAD", "route", "gate", "между «НАЧАТЬ» и столом стоит промежуточный экран");
  }
  if (!await page.locator(".chat textarea").count()) {
    add("BAD", "route", "gate", "после «НАЧАТЬ» поле ввода не появилось без лишних кликов");
  }
  await page.waitForTimeout(1600);
  await probe(page, "game-turn0", vp.tag, vp.lang || "ru");

  // ——— ШТОРКА СЛОЁВ. Полноэкранный экран подготовки убран, слои переехали
  // внутрь стола, и обходчик за ними следом не пошёл: состояние, где четыре
  // тумблера и объяснение запрета в зачётных режимах, не проверялось ни разу.
  {
    const lay = page.locator(".lay-open").first();
    if (await lay.count()) {
      await lay.click();
      const sheet = await page.waitForSelector(".lay-sheet", { timeout: 8000 }).catch(() => null);
      if (!sheet) add("BAD", "layers", "nav", "кнопка слоёв не открыла шторку");
      else await probe(page, "layers", vp.tag, vp.lang || "ru");
      await page.keyboard.press("Escape").catch(() => {});
      await page.waitForTimeout(500);
    } else {
      add("BAD", "layers", "nav", "кнопки слоёв за столом нет");
    }
  }

  // ОДНА ПОДСКАЗКА НА ХОД. На нулевом ходу их было до пяти разом: карточка
  // «Стол накрыт» с тремя затравками, строка тренера, чип-затравка над полем,
  // обучающий плейсхолдер и пузырь Карла, повторявший ленту слово в слово.
  const hints = await page.evaluate(() => {
    const sel = ".log .opening, .firstcoach, .suggest, .coachline, .karl-bub, .hintbub, .onb-tip";
    return [...document.querySelectorAll(sel)]
      .filter((el) => el.getBoundingClientRect().height > 0)
      .map((el) => el.className);
  });
  if (hints.length > 1) {
    add("BAD", "game-turn0", "hints", `подсказок на первом ходу ${hints.length}: ${hints.join(", ").slice(0, 90)}`);
  }

  // РЕПЛИКИ ИГРОКА ТОЖЕ ПЕРЕВОДЯТСЯ. Прибор печатал русские фразы во всех
  // режимах, они возвращались в ленту как пузыри игрока и в разбор как цитата —
  // и проверка на просочившуюся кириллицу честно ловила НАШ СОБСТВЕННЫЙ ввод.
  // Одиннадцать «непереведённых строк» оказались тем, что прибор напечатал сам.
  const LINES = vp.lang === "en" ? [
    "What matters most to you in this deal, and why exactly that?",
    "Why does cash flow matter to you — would a prepayment help?",
    "Comparable deals run at 86-88 on the market; my reference is 86.",
    "If we commit to a yearly contract and 30% upfront — could you move to 86?",
    "Agreed: 86 per unit, yearly contract, 30% upfront. Shall we lock it in?",
  ] : [
    "Что для вас важнее всего в этой сделке и почему именно это?",
    "А почему для вас важен денежный поток — предоплата помогла бы?",
    "По рынку аналог идёт 86-88; ориентир — 86.",
    "Если дадим годовой контракт и 30% предоплату — подвинетесь к 86?",
    "Договорились: 86 ₽/шт, годовой контракт, предоплата 30%. Фиксируем?"];
  let shotMid = false, shotOut = false;
  for (let i = 0; i < 14; i++) {
    if (await page.locator(".debrief").count()) break;
    try {
      await page.fill("textarea", LINES[i % LINES.length], { timeout: 3500 });
      await page.click(".send", { timeout: 5000 });
    } catch { break; }
    await page.waitForTimeout(1300);
    if (!shotMid && i === 1) { shotMid = true; await probe(page, "game-mid", vp.tag, vp.lang || "ru"); }
    if (!shotOut && await page.locator(".outcome").count()) { shotOut = true; await probe(page, "outcome", vp.tag, vp.lang || "ru"); }
  }
  await page.waitForSelector(".debrief", { timeout: 20000 }).catch(()=>{});
  await page.waitForTimeout(1200);
  if (await page.locator(".debrief").count()) {
    await probe(page, "debrief-beat1", vp.tag, vp.lang || "ru");
    // «А ЧТО ЕСЛИ…» — САМОЕ ДОРОГОЕ ДЕЙСТВИЕ РАЗБОРА, и до сих пор прибор его
    // не НАЖИМАЛ ни разу: снимался экран с кнопкой, а состояние с посчитанной
    // веткой не проверялось вовсе. Жмём клавишей: кнопка исчезает вместе с
    // нажатием (её место занимает расхождение), а это ровно тот случай, где
    // фокус падает на BODY.
    const wi = page.locator(".wi-reveal").first();
    if (await wi.count() && await wi.isEnabled().catch(() => false)) {
      await wi.focus().catch(() => {});
      await focusAfter(page, "debrief-whatif", "Показать, что было бы иначе",
                       () => page.keyboard.press("Enter"));
      await page.waitForTimeout(1800);
      if (await page.locator(".wi-diverge").count())
        await probe(page, "debrief-whatif", vp.tag, vp.lang || "ru");
    }
    for (let b = 2; b <= 3; b++) {
      const next = page.locator(".beat-go, .beat-dot").nth(b - 1);
      if (!await next.count()) break;
      await next.click().catch(()=>{});
      await page.waitForTimeout(900);
      await probe(page, "debrief-beat" + b, vp.tag, vp.lang || "ru");
    }
  }

  // ——— СТОЛ ЭКЗАМЕНА: СОСТОЯНИЕ, КОТОРОГО ОБХОДЧИК НЕ ВИДЕЛ НИ РАЗУ ———
  //
  // Экран экзамена прибор открывал, а СТОЛ экзамена — нет, и это не «ещё одна
  // партия»: там выключено живое сопровождение целиком — чипы приёмов, строка
  // тренера, подсказки. Разница не косметическая. Именно из-за неё лента
  // реплик там остаётся БЕЗ ЕДИНОГО фокусируемого потомка: крестики карточек
  // тренера, которыми в обычной партии её случайно можно было пролистать, в
  // экзамене не рисуются вовсе. Проверка «прокрутка только мышью» в обычной
  // партии сработать не может по построению — значит без этого состояния она
  // молчала бы всегда, а молчание прибора читают как «чисто».
  //
  // Идёт ПОСЛЕДНИМ: партия экзамена не бросается на полпути, и портить ею
  // порядок остальных состояний незачем.
  {
    await page.locator('[data-nav="exam"]').first().click().catch(() => {});
    await page.waitForTimeout(1200);
    await page.fill(".exam-name input", vp.lang === "en" ? "Jane Doe" : "Иван Петров").catch(() => {});
    await page.locator(".card").first().click().catch(() => {});
    const got = await page.waitForSelector(".chat textarea", { timeout: 20000 }).catch(() => null);
    if (!got) add("BAD", "exam-game", "nav", "с экрана экзамена не открывается стол");
    else {
      await page.waitForTimeout(1500);
      // Несколько ходов, чтобы лента переросла свою коробку: пустую ленту
      // прокручивать не надо, и проверка на ней ничего не значит.
      for (let i = 0; i < 4; i++) {
        try {
          await page.fill("textarea", LINES[i % LINES.length], { timeout: 3500 });
          await page.click(".send", { timeout: 5000 });
        } catch { break; }
        await page.waitForTimeout(1200);
      }
      await probe(page, "exam-game", vp.tag, vp.lang || "ru");
    }
  }

  await ctx.close();
}
await browser.close();

const bad = findings.filter(f => f.sev === "BAD");
const warn = findings.filter(f => f.sev === "WARN");
console.log(`\n=== НАЙДЕНО: ${bad.length} ошибок, ${warn.length} замечаний ===\n`);
const group = (list) => {
  const m = new Map();
  for (const f of list) { const k = `${f.sev} ${f.kind}`; if (!m.has(k)) m.set(k, []); m.get(k).push(f); }
  for (const [k, v] of m) { console.log(`— ${k} (${v.length})`); for (const f of v.slice(0, 8)) console.log(`   [${f.where}] ${f.msg}`); }
};
group(bad); group(warn);
fs.writeFileSync(`${OUT}/findings.json`, JSON.stringify(findings, null, 1));
