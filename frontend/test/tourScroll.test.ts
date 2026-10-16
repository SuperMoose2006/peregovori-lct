// tourScroll.test.ts — конец тура возвращает прокрутку туда, где тур начался.
//
// Аудит 16.10, 390 px: семь шагов тура стола прокручивали к целям, последняя —
// внизу рейла, и после «Готово» человек стоял у футера без чата и поля ввода.
import test from "node:test";
import assert from "node:assert/strict";
import { markScroll, restoreScroll } from "../src/components/SectionTour";

type Box = { parentElement: Box | null; scrollHeight: number; clientHeight: number; scrollTop: number };
const box = (parent: Box | null, scrollable: boolean, top = 0): Box =>
  ({ parentElement: parent, scrollHeight: scrollable ? 900 : 100, clientHeight: 100, scrollTop: top });

test("тур помнит окно и прокручиваемых предков целей и возвращает их", () => {
  const page = box(null, false);
  const rail = box(page, true, 0);
  const target = box(rail, false);
  const mark = markScroll([target as unknown as Element, null], 40);
  assert.equal(mark.boxes.length, 1, "непрокручиваемые предки не запоминаются");

  rail.scrollTop = 620; // подсветка доехала до низа рейла
  const calls: unknown[] = [];
  (globalThis as unknown as { window: unknown }).window = { scrollTo: (o: unknown) => calls.push(o) };
  restoreScroll(mark);
  assert.equal(rail.scrollTop, 0);
  assert.deepEqual(calls, [{ top: 40, behavior: "auto" }]);
});

test("без отметки возвращать нечего", () => {
  assert.doesNotThrow(() => restoreScroll(null));
});
