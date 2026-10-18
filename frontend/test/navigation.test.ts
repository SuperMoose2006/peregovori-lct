// navigation.test.ts — главное меню уводит из вложенного экрана раздела.
//
// Аудит 17.10, F04: на итоге урока «Курс» в меню не делал ничего — свой вид
// (карта, блок, урок, итог) CourseScreen держит сам и читает `startAt` только
// при монтировании, а повторный вход при `screen === "course"` его не
// пересоздавал. Выбраться можно было только через другой раздел.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");

test("каждый вход в курс пересоздаёт экран курса", () => {
  const open = app.match(/const openCourse = useCallback\(\(at[^]*?\}, \[leaveSession\]\);/);
  assert.ok(open, "openCourse в App.tsx не найден — тест устарел вместе с кодом");
  assert.match(open[0], /setCourseKey\(\(k\) => k \+ 1\)/, "вход в курс не меняет ключ экрана");
  assert.match(app, /<CourseScreen\s+key=\{courseKey\}/, "CourseScreen без ключа — вложенный вид переживёт вход");
  assert.match(app, /onCourse=\{\(\) => openCourse\(null\)\}/, "пункт меню «Курс» идёт мимо openCourse");
});
