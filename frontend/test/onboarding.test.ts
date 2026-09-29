// onboarding.test.ts — где встаёт подсказка и что в ней есть.
//
// Правила показа туров (раз за сеанс, галочка, общий переключатель) живут в
// test/tours.test.ts. Здесь — геометрия: каждое слово подсказки на экране,
// даже когда цель выше окна (меню разделов), и счётчик шагов.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { placeTip, type Rect } from "../src/components/Onboarding";
import { I18N } from "../src/i18n";

const SRC = new URL("../src/", import.meta.url).pathname;

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
