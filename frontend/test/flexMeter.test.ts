// flexMeter.test.ts — шкала стола называется тем, что показывает.
//
// Полоса шкал на столе и в «Переиграть» берёт `leverage` из состояния, а там
// лежит ГИБКОСТЬ ×100 (доверие, информация, рычаг и напряжение вместе —
// engine.py::to_state_view, как у прежнего сервера). Подписана она была
// «Рычаг», а чипы под репликой, курс и подсказка говорят о сыром рычаге: голая
// BATNA давала зелёный «Рыч +10», а полоса «Рычаг» падала 11 → 4. Решение
// владельца 19.10: шкала остаётся гибкостью и называется «Гибкость».
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { I18N } from "../src/i18n";
import { COURSE_BLOCKS } from "../src/lib/course";

test("шкала стола и «Переиграть» подписана «Гибкость» на обоих языках", () => {
  assert.equal(I18N.ru.flexMeter.full, "Гибкость");
  assert.equal(I18N.en.flexMeter.full, "Flexibility");
  const table = readFileSync(new URL("../src/components/Table.tsx", import.meta.url), "utf-8");
  assert.match(table, /leverage: t\.flexMeter\.full/);
  const rematch = readFileSync(new URL("../src/components/Rematch.tsx", import.meta.url), "utf-8");
  assert.match(rematch, /t\.flexMeter\.short/);
});

test("ни одна строка не зовёт гибкость «шкалой Рычаг»", () => {
  const OLD = /шкал[а-я]* «Рычаг»|Leverage meter/;
  const bad: string[] = [];
  const walk = (o: unknown, path: string) => {
    if (typeof o === "string") { if (OLD.test(o)) bad.push(`${path}: ${o.slice(0, 80)}`); return; }
    if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) walk(v, `${path}.${k}`);
  };
  walk(I18N, "I18N");
  walk(COURSE_BLOCKS, "COURSE_BLOCKS");
  assert.deepEqual(bad, [], bad.join("\n"));
});
