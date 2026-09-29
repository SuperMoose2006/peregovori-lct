// onboarding.test.ts — вводная при первом заходе.
//
// ЧТО ЗДЕСЬ ДЕРЖИТСЯ. Человек, открывший продукт впервые, не понимал почти
// ничего, а механизм подсказок (Onboarding.tsx, флаг dialog.tutorialDone.v1)
// работал только за столом. Теперь есть короткий обход главной — и у него три
// обещания, каждое из которых легко сломать молча:
//   1. показывается ОДИН раз и переживает перезагрузку — флаг в localStorage;
//   2. НЕ гасит подсказки за столом в первой партии — у флага две стадии;
//   3. каждое слово подсказки на экране — даже когда цель выше окна (меню).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import {
  emptyProfile, hasPlayed, isTutorialDone, isWelcomeDone, markTutorialDone, markWelcomeDone,
  shouldRunTutorial, shouldRunWelcome,
} from "../src/lib/progress";
import { placeTip, type Rect } from "../src/components/Onboarding";
import { TOUR_STEPS } from "../src/components/HomeTour";
import { I18N } from "../src/i18n";

const SRC = new URL("../src/", import.meta.url).pathname;
const KEY = "dialog.tutorialDone.v1";

/** Подменённое хранилище на время одного теста. */
function withStore<T>(fn: (store: Map<string, string>) => T, seed: Record<string, string> = {}): T {
  const store = new Map(Object.entries(seed));
  const g = globalThis as Record<string, unknown>;
  const had = "localStorage" in g;
  const prev = g.localStorage;
  g.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  try {
    return fn(store);
  } finally {
    if (had) g.localStorage = prev;
    else delete g.localStorage;
  }
}

// ---- Флаг: одна запись, две стадии ------------------------------------------

test("первый заход: ни вводная главной, ни подсказки за столом ещё не пройдены", () => {
  withStore(() => {
    assert.equal(isWelcomeDone(), false);
    assert.equal(isTutorialDone(), false);
  });
});

test("вводная главной пройдена — подсказки за столом в первой партии остаются", () => {
  // Сломанная реализация — писать тот же "1", что и стол, — погасила бы
  // подсветки в первой партии: shouldRunTutorial увидел бы «пройдено».
  withStore((store) => {
    markWelcomeDone();
    assert.equal(isWelcomeDone(), true, "после перезагрузки вводная главной не должна вернуться");
    assert.equal(isTutorialDone(), false);
    assert.equal(shouldRunTutorial("practice", isTutorialDone()), true);
    assert.equal(store.get(KEY), "home");
  });
});

test("стадия только растёт: пройденная вводная целиком не откатывается к «home»", () => {
  withStore((store) => {
    markTutorialDone();
    markWelcomeDone();
    assert.equal(store.get(KEY), "1");
    assert.equal(isWelcomeDone(), true);
    assert.equal(isTutorialDone(), true);
  });
});

test("приборы и e2e пишут в ключ \"1\" — это закрывает и вводную главной", () => {
  // Полтора десятка прогонов (probes/*, e2e/*) выключают вводную именно так.
  // Если бы \"1\" значило только «стол», обход главной вылез бы поверх их снимков.
  withStore(() => {
    assert.equal(isWelcomeDone(), true);
  }, { [KEY]: "1" });
});

test("вводная главной — только тому, кто здесь впервые", () => {
  const fresh = emptyProfile();
  assert.equal(shouldRunWelcome(false, fresh), true);
  assert.equal(shouldRunWelcome(true, fresh), false, "пройденная не повторяется");
  assert.equal(shouldRunWelcome(false, { ...fresh, xp: 40 }), false, "опыт есть — дорогу уже нашёл");
  const played = { ...fresh, scenarios: { supplier: { bestGrade: "B", bestScore: 78, attempts: 1 } } } as unknown as typeof fresh;
  assert.equal(shouldRunWelcome(false, played), false, "партия сыграна — дорогу уже нашёл");
  assert.equal(hasPlayed(fresh), false);
  assert.equal(hasPlayed(played), true);
});

// ---- Шаги: три–пять, у каждого настоящая цель и слова на двух языках --------

test("вводная — три-пять шагов, и у каждого заголовок и текст на обоих языках", () => {
  assert.ok(TOUR_STEPS.length >= 3 && TOUR_STEPS.length <= 5, `шагов ${TOUR_STEPS.length}`);
  for (const lang of ["ru", "en"] as const) {
    for (const s of TOUR_STEPS) {
      const copy = I18N[lang].tour.steps[s.id];
      assert.ok(copy?.title.trim() && copy.body.trim(), `${lang}: у шага ${s.id} нет текста`);
    }
  }
});

test("первый шаг говорит, что это за продукт; второй — что делать прямо сейчас", () => {
  assert.deepEqual(TOUR_STEPS.slice(0, 2).map((s) => s.id), ["intro", "start"]);
  assert.match(I18N.ru.tour.steps.intro.title, /тренажёр переговоров/i);
  assert.match(I18N.ru.tour.steps.start.body, /нажмите/i);
});

test("каждая цель вводной действительно стоит в разметке главной", () => {
  // Переименованный класс молча выключил бы шаг: HomeTour выбрасывает шаги без
  // цели. Здесь — что класс-цель объявлен хоть в одном компоненте.
  const tsx = readdirSync(join(SRC, "components")).filter((f) => f.endsWith(".tsx"))
    .map((f) => readFileSync(join(SRC, "components", f), "utf8"))
    .concat(readFileSync(join(SRC, "App.tsx"), "utf8"))
    .join("\n");
  for (const s of TOUR_STEPS) {
    const cls = s.selector.replace(/^\./, "");
    // className="… cls …" или className={`… cls …`} — класс стоит отдельным словом.
    const declared = new RegExp(`className=\\{?["\`](?:[^"\`]*\\s)?${cls}(?:\\s[^"\`]*)?["\`]`).test(tsx);
    assert.ok(declared, `цель шага ${s.id} (${s.selector}) не найдена в разметке`);
  }
});

test("App решает про вводную по флагу и пустому профилю и закрывает её при уходе с главной", () => {
  const app = readFileSync(join(SRC, "App.tsx"), "utf8");
  assert.match(app, /shouldRunWelcome\(isWelcomeDone\(\), profile\)/);
  assert.match(app, /<HomeTour\b/);
  assert.match(app, /screen !== "home" \|\| mode !== "practice"\)\) finishTour\(\)/,
    "ушёл с главной посреди обхода — вводная считается пройденной");
});

// ---- Где встаёт подсказка ------------------------------------------------------

const inside = (p: { top: number; left: number }, w: number, h: number, vw: number, vh: number) =>
  p.top >= 0 && p.left >= 0 && p.top + h <= vh && p.left + w <= vw;

test("цель выше окна (меню разделов): подсказка встаёт сбоку и целиком в окне", () => {
  // Прежнее правило ставило её ПОД целью, если выше не влезало, — то есть за
  // нижней кромкой окна: человек видел ободок и ни слова.
  const nav: Rect = { top: -8, left: -8, width: 236, height: 920 };
  const p = placeTip(nav, 1440, 900, 320, 256);
  assert.equal(p.arrow, "left");
  assert.ok(p.left >= nav.left + nav.width, "подсказка не налезает на меню");
  assert.ok(inside(p, 320, 256, 1440, 900), JSON.stringify(p));
});

test("есть место под целью — подсказка под ней, стрелка вверх и смотрит на цель", () => {
  const card: Rect = { top: 400, left: 250, width: 860, height: 160 };
  const p = placeTip(card, 1440, 900, 320, 220);
  assert.equal(p.arrow, "up");
  assert.equal(p.top, card.top + card.height + 12);
  const cx = card.left + card.width / 2;
  assert.ok(Math.abs(p.left + p.arrowAt - cx) < 1, "стрелка указывает в середину цели");
});

test("цель у нижнего края — подсказка над ней", () => {
  const p = placeTip({ top: 700, left: 250, width: 400, height: 120 }, 1440, 900, 320, 220);
  assert.equal(p.arrow, "down");
  assert.ok(inside(p, 320, 220, 1440, 900));
});

test("телефон, цель во всю ширину и выше окна — подсказка прижата к низу, но в окне", () => {
  const p = placeTip({ top: -200, left: 12, width: 366, height: 1400 }, 390, 844, 366, 250);
  assert.ok(inside(p, 366, 250, 390, 844), JSON.stringify(p));
});

test("подсказка знает свой номер шага: «Шаг N из M» на обоих языках", () => {
  for (const lang of ["ru", "en"] as const) {
    const s = I18N[lang].tour.stepOf.replace("{n}", "2").replace("{total}", "4");
    assert.match(s, /2\D+4/);
  }
  assert.match(readFileSync(join(SRC, "components", "Onboarding.tsx"), "utf8"), /className="onb-step"/);
});
