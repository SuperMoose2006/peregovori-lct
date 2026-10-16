// chatScroll.test.ts — лента остаётся у низа, когда её сжимает поле ввода.
//
// Замер в браузере: длинная реплика растит поле ввода, окно ленты падает
// 536 → 507 px, браузер шлёт `scroll` с зазором 25 px от низа. Прежняя
// проверка «зазор ≤ 2 px» решала, что читатель ушёл вверх, и автопрокрутка
// молчала до конца партии — следующий вопрос оказывался за кадром.
import test from "node:test";
import assert from "node:assert/strict";
import { stillAtBottom } from "../src/components/Chat";

test("сжатие окна ленты не считается уходом читателя вверх", () => {
  const saved = { top: 559, atBottom: true, height: 536 };
  assert.equal(stillAtBottom(saved, { top: 563, scrollHeight: 1095, clientHeight: 507 }), true);
});

test("читатель, сам ушедший вверх, остаётся там и при сжатии окна", () => {
  const saved = { top: 200, atBottom: false, height: 536 };
  assert.equal(stillAtBottom(saved, { top: 200, scrollHeight: 1095, clientHeight: 507 }), false);
});

test("прокрутка вверх при прежней высоте окна — уход от низа", () => {
  const saved = { top: 559, atBottom: true, height: 536 };
  assert.equal(stillAtBottom(saved, { top: 400, scrollHeight: 1095, clientHeight: 536 }), false);
});

test("у низа — у низа, даже без сохранённой позиции", () => {
  assert.equal(stillAtBottom(null, { top: 559, scrollHeight: 1095, clientHeight: 536 }), true);
  assert.equal(stillAtBottom(null, { top: 0, scrollHeight: 1095, clientHeight: 536 }), false);
});
