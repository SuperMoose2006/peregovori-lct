// technique-floor.test.ts — потолок техники в браузерном зеркале.
//
// Потолок опускает A/B до C, когда метод тонкий: цену взяли, а интересы,
// критерии и размены бросили. До правки он сравнивал с порогом ЧИСЛО, в
// которое входит балл судьи, — и на живом прогоне одна и та же партия давала
// `overall` 74 и грейд то B, то C (docs/judge-reproducibility.md §4–5).
// Теперь сравнивается детерминированная часть техники, и порог обязан
// совпадать с серверным: инвариант 8.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SCENARIO_MAP } from "../src/data/scenarios";
import { analyze, applyMove, newSession, scoreSession, TECHNIQUE_FLOOR } from "../src/mock/engine";

const GAMES = JSON.parse(readFileSync(new URL("./fixtures/games.json", import.meta.url), "utf8"));

test("порог потолка техники совпадает с серверным движком", () => {
  const src = readFileSync(
    new URL("../../services/gateway/app/engine/engine.py", import.meta.url), "utf8");
  assert.ok(src.includes(`TECHNIQUE_FLOOR = ${TECHNIQUE_FLOOR}`),
    `сервер не знает порога ${TECHNIQUE_FLOOR}`);
  assert.ok(src.includes("technique_method < TECHNIQUE_FLOOR"),
    "сервер сравнивает с потолком не детерминированную часть техники");
});

test("цена без вопросов об интересах не выкупает B", () => {
  // Хвост принципиальной партии: критерий с цифрой, размен, закрытие пакетом —
  // и ни одного вопроса об интересах. Экономика 100, `overall` 77, техника
  // ровно на старом пороге 45; метод — 38, и это ниже потолка.
  const lines: string[] = [3, 4, 5].map((i) => GAMES.principled.supplier.ru[i]);
  const s = newSession(SCENARIO_MAP["supplier"], "ru");
  for (const t of lines) {
    if (s.status !== "active") break;
    s.turn += 1;
    applyMove(s, analyze(t), t);
  }
  const d = scoreSession(s);
  assert.equal(d.interests_found, 0, "партия перестала быть «цена без интересов»");
  assert.ok(d.overall >= 70, `overall ${d.overall} — партия больше не претендует на B`);
  assert.equal(d.grade, "C", `грейд ${d.grade} при технике ${d.technique}`);
});
