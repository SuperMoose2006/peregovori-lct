// tours.test.ts — туры по разделам: у каждого раздела свой тур по ЕГО
// элементам, показ при входе раз за сеанс вкладки, галочка «больше не
// показывать» на раздел и общий переключатель в Профиле, который возвращает всё.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  TOURS, TOUR_SECTIONS, DEFAULT_TOUR_PREFS, loadTourPrefs, markSeenThisSession, parseTourPrefs,
  seenThisSession, setSectionOff, setToursEnabled, shouldAutoRunTour, type TourSection,
} from "../src/lib/tours";
import { Onboarding } from "../src/components/Onboarding";
import { TourPrefsPanel } from "../src/components/TourPrefs";
import { I18N } from "../src/i18n";

const SRC = new URL("../src/", import.meta.url).pathname;
const ru = I18N.ru;

function fakeStorage(seed: Record<string, string> = {}) {
  const store = new Map(Object.entries(seed));
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
}
function withStorages<T>(local: ReturnType<typeof fakeStorage>, session: ReturnType<typeof fakeStorage>, run: () => T): T {
  const g = globalThis as Record<string, unknown>;
  const prev = [g.localStorage, g.sessionStorage];
  g.localStorage = local;
  g.sessionStorage = session;
  try { return run(); } finally { [g.localStorage, g.sessionStorage] = prev; }
}

// ---- Когда показывать ----------------------------------------------------------

test("по умолчанию каждый раздел показывает тур при первом входе в сеансе", () => {
  for (const s of TOUR_SECTIONS) assert.equal(shouldAutoRunTour(s, DEFAULT_TOUR_PREFS, []), true, s);
});

test("внутри сеанса вкладки раздел второй раз сам не всплывает", () => {
  assert.equal(shouldAutoRunTour("table", DEFAULT_TOUR_PREFS, ["table"]), false);
  assert.equal(shouldAutoRunTour("course", DEFAULT_TOUR_PREFS, ["table"]), true, "другие разделы — своим чередом");
});

test("сеанс — это вкладка: перезагрузка помнит показанное, новая вкладка — нет", () => {
  const local = fakeStorage();
  const tab = fakeStorage();
  withStorages(local, tab, () => {
    assert.deepEqual(seenThisSession(), []);
    markSeenThisSession("table");
    markSeenThisSession("table");
    assert.deepEqual(seenThisSession(), ["table"], "перезагрузка той же вкладки");
  });
  withStorages(local, fakeStorage(), () => {
    assert.deepEqual(seenThisSession(), [], "новая вкладка — тур снова покажется");
  });
});

test("галочка в карточке отключает только свой раздел", () => {
  const p = setSectionOff(DEFAULT_TOUR_PREFS, "table", true);
  assert.equal(shouldAutoRunTour("table", p, []), false);
  assert.equal(shouldAutoRunTour("course", p, []), true);
  assert.deepEqual(setSectionOff(p, "table", false).off, [], "снятая галочка возвращает раздел");
});

test("общий переключатель выключает всё, а включение возвращает и отключённые галочкой", () => {
  const off = setToursEnabled(setSectionOff(DEFAULT_TOUR_PREFS, "admin", true), false);
  for (const s of TOUR_SECTIONS) assert.equal(shouldAutoRunTour(s, off, []), false, s);
  const back = setToursEnabled(off, true);
  for (const s of TOUR_SECTIONS) assert.equal(shouldAutoRunTour(s, back, []), true, `${s} не вернулся`);
});

test("старые профили: прежний флаг вводной не гасит новые туры, мусор в настройках не роняет", () => {
  // У людей лежит dialog.tutorialDone.v1 = "home" или "1" — туры его не читают.
  for (const old of ["home", "1"]) {
    const prefs = withStorages(fakeStorage({ "dialog.tutorialDone.v1": old }), fakeStorage(), () => loadTourPrefs());
    assert.deepEqual(prefs, DEFAULT_TOUR_PREFS, `флаг «${old}»`);
    assert.equal(shouldAutoRunTour("table", prefs, []), true);
  }
  for (const raw of [null, "{не json", "42", '{"enabled":"да","off":"table"}', '{"off":["table","нет-такого"]}']) {
    const p = parseTourPrefs(raw);
    assert.equal(p.enabled, true, String(raw));
    assert.ok(p.off.every((s) => (TOUR_SECTIONS as string[]).includes(s)), String(raw));
  }
  assert.deepEqual(parseTourPrefs('{"enabled":false,"off":["course"]}'), { enabled: false, off: ["course"] });
});

// ---- Что показывать ----------------------------------------------------------------

test("у каждого раздела — свой тур из 3–7 шагов с текстом на обоих языках", () => {
  for (const s of TOUR_SECTIONS) {
    const steps = TOURS[s];
    assert.ok(steps.length >= 3 && steps.length <= 7, `${s}: ${steps.length} шагов`);
    for (const lang of ["ru", "en"] as const) {
      for (const st of steps) {
        const copy = I18N[lang].tours[s][st.id];
        assert.ok(copy?.title.trim() && copy.body.trim(), `${lang}/${s}: нет текста шага ${st.id}`);
      }
      assert.ok(I18N[lang].tour.names[s].trim(), `${lang}: нет имени раздела ${s}`);
    }
  }
});

test("тур стола объясняет то, на чём спотыкались: шкалы, цену, BATNA, условия, поле ввода, выход", () => {
  const ids = TOURS.table.map((s) => s.id);
  for (const need of ["meters", "price", "interests", "batna", "terms", "composer", "exit"]) {
    assert.ok(ids.includes(need), `за столом нет шага ${need}`);
  }
  const tr = ru.tours.table;
  assert.match(tr.meters.body, /Напряжение/);
  assert.match(tr.price.body, /красная линия/);
  assert.match(tr.batna.title, /BATNA/);
  assert.match(tr.terms.body, /в обмен/);
  assert.match(tr.exit.body, /выйти/);
});

test("тур редактора говорит, чем он отличается от своей сделки, и что делает каждая настройка", () => {
  assert.equal(TOURS.admin[0].id, "vs");
  assert.match(ru.tours.admin.vs.body, /Своя сделка/);
  const fields = ru.tours.admin.fields.body;
  for (const label of ["Сфера", "Тема встречи", "Роль собеседника", "Тон", "Сложность", "цели"]) {
    assert.ok(fields.includes(label), `настройка «${label}» не объяснена`);
  }
});

test("каждая цель тура действительно стоит в разметке", () => {
  // Переименованный класс молча выключил бы шаг: SectionTour выбрасывает шаги
  // без цели. Селектор — один класс или два через точку («.cnode.current»).
  const tsx = readdirSync(join(SRC, "components")).filter((f) => f.endsWith(".tsx"))
    .map((f) => readFileSync(join(SRC, "components", f), "utf8"))
    .concat(readFileSync(join(SRC, "App.tsx"), "utf8"))
    .join("\n");
  for (const s of TOUR_SECTIONS) {
    for (const st of TOURS[s]) {
      const cls = st.selector.split(".").filter(Boolean)[0];
      const declared = new RegExp(`className=\\{?["\`](?:[^"\`]*\\s)?${cls}(?:[\\s$][^"\`]*)?["\`]`).test(tsx);
      assert.ok(declared, `${s}/${st.id}: класс ${cls} (${st.selector}) не найден в разметке`);
    }
  }
});

// ---- Карточка и Профиль ---------------------------------------------------------------

test("в карточке тура — видимая галочка «Больше не показывать», и она отражает выбор", () => {
  const html = (checked: boolean) => renderToStaticMarkup(createElement(Onboarding, {
    stepKey: "x", targetRef: { current: null }, title: "t", body: "b",
    primaryLabel: "next", onPrimary: () => {}, skipLabel: "skip", onSkip: () => {},
    optOut: { label: ru.tour.dontShow, checked, onChange: () => {} },
  }));
  // Цель не измерена в SSR — карточка не рисуется; проверяем разметку компонента.
  const src = readFileSync(join(SRC, "components", "Onboarding.tsx"), "utf8");
  assert.match(src, /<label className="onb-opt">[\s\S]*type="checkbox"[\s\S]*optOut\.label/);
  assert.equal(html(true), "", "без измеренной цели подсказки нет — и галочки тоже");
  assert.match(readFileSync(join(SRC, "components", "SectionTour.tsx"), "utf8"),
    /optOut=\{\{ label: t\.tour\.dontShow, checked: optedOut, onChange: onOptOut \}\}/);
});

test("Профиль: общий переключатель подсказок и возврат отключённых галочкой", () => {
  const html = (prefs: typeof DEFAULT_TOUR_PREFS) =>
    renderToStaticMarkup(createElement(TourPrefsPanel, { t: ru, prefs, onChange: () => {} }));
  assert.match(html(DEFAULT_TOUR_PREFS), /role="switch" aria-checked="true"/);
  assert.match(html({ enabled: false, off: [] }), /role="switch" aria-checked="false"/);
  const some = html({ enabled: true, off: ["table", "admin"] });
  assert.ok(some.includes("Стол переговоров, Редактор"), "не сказано, где подсказки отключены");
  assert.ok(some.includes(ru.tour.prefsRestore), "нет способа вернуть отключённое");
});

test("App: тур раздела сам при входе, раз за сеанс; кнопка в шапке — тур текущего раздела", () => {
  const app = readFileSync(join(SRC, "App.tsx"), "utf8");
  assert.match(app, /shouldAutoRunTour\(tourSection, tourPrefsRef\.current, seenThisSession\(\)\)/);
  assert.match(app, /markSeenThisSession\(tourSection\);\s*setTour\(tourSection\)/);
  assert.match(app, /className="tour-help" onClick=\{replayTour\}/);
  assert.match(app, /<TourPrefsPanel\b/);
  for (const s of TOUR_SECTIONS.filter((x) => x !== "home" && x !== "table")) {
    assert.ok(app.includes(`"${s}"`), `раздел ${s} не распознаётся`);
  }
  const sections: TourSection[] = ["home", "table"];
  for (const s of sections) assert.ok(app.includes(`"${s}"`), s);
});
