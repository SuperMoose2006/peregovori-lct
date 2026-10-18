// whatif.test.ts — the "А что если…" replay client seam:
//  (1) the pivotal-turn picker chooses the most-damaging turning point (and its
//      1-based turn maps to a 0-based move index), and
//  (2) the offline synth (whatIfLocal) returns the WhatIfResponse shape and
//      reproduces the real play on the original branch while a strong probe beats
//      a hostile original on the alternative branch — deterministically.
import { test } from "node:test";
import assert from "node:assert/strict";
import { pickPivotalTurn, pivotalTurnIndex } from "../src/lib/whatif";
import { whatIfLocal } from "../src/api/whatif";
import type { TurningPoint, WhatIfRequest } from "../src/types";

test("pickPivotalTurn selects the most-damaging turning point", () => {
  const points: TurningPoint[] = [
    { turn: 1, quote: "hi", what: "trust rose, you uncovered an interest" },
    { turn: 3, quote: "or else", what: "tension spiked, trust fell" }, // most damaging
    { turn: 5, quote: "ok", what: "this move shifted the talk" },
  ];
  const p = pickPivotalTurn(points);
  assert.equal(p?.turn, 3);
});

test("pickPivotalTurn falls back to the first when nothing looks damaging", () => {
  const points: TurningPoint[] = [
    { turn: 2, quote: "a", what: "trust rose" },
    { turn: 4, quote: "b", what: "you uncovered an interest" },
  ];
  assert.equal(pickPivotalTurn(points)?.turn, 2);
});

test("pickPivotalTurn handles the Russian mock wording", () => {
  const points: TurningPoint[] = [
    { turn: 1, quote: "a", what: "Ход сыграл в вашу пользу: Доверие +8." },
    { turn: 2, quote: "b", what: "Ход качнул стол против вас: Напряжение +22, Доверие −14." },
  ];
  assert.equal(pickPivotalTurn(points)?.turn, 2);
});

test("pickPivotalTurn returns null for empty/absent input", () => {
  assert.equal(pickPivotalTurn([]), null);
  assert.equal(pickPivotalTurn(undefined), null);
});

test("pivotalTurnIndex maps 1-based turn to a 0-based move index, guarding range", () => {
  assert.equal(pivotalTurnIndex({ turn: 3, quote: "", what: "" }, 4), 2);
  assert.equal(pivotalTurnIndex({ turn: 5, quote: "", what: "" }, 4), null); // out of range
  assert.equal(pivotalTurnIndex(null, 4), null);
});

// Deterministic offline synth: a hostile ultimatum vs a Harvard-style probe at
// the same turn, on the built-in "supplier" (lower-is-better) scenario.
const MOVES = [
  "Здравствуйте! Расскажите, с какими сложностями по загрузке вы сталкиваетесь?",
  "Понимаю вас. А что для вас важнее всего в этой сделке?",
  "Снижайте цену немедленно, иначе мы уходим к другому. Ультиматум.",
];

test("whatIfLocal returns the WhatIfResponse shape", () => {
  const req: WhatIfRequest = {
    scenarioId: "supplier", lang: "ru", moves: MOVES, turnIndex: 2,
    altText: "А что для вас важнее всего в этой сделке и почему?",
  };
  const r = whatIfLocal(req);
  assert.ok(r, "expected a response");
  assert.equal(r!.turnIndex, 2);
  for (const branch of [r!.original, r!.alternative]) {
    assert.equal(typeof branch.text, "string");
    assert.equal(typeof branch.opponent_line, "string");
    assert.ok(branch.opponent_line.length > 0);
    assert.equal(typeof branch.deltas.trust, "number");
    assert.equal(typeof branch.deltas.tension, "number");
    assert.equal(typeof branch.deltas.info, "number");
    assert.equal(typeof branch.state.offer_opp, "number");
    assert.equal(typeof branch.state.interests_found, "number");
  }
});

test("whatIfLocal: the original branch replays the real hostile move", () => {
  const r = whatIfLocal({
    scenarioId: "supplier", lang: "ru", moves: MOVES, turnIndex: 2, altText: "x",
  })!;
  // The original at turn 2 is a threat: tension up, trust down, no interest.
  assert.ok(r.original.deltas.tension > 0);
  assert.ok(r.original.deltas.trust < 0);
});

test("whatIfLocal: a strong probe beats the hostile original at the same turn", () => {
  const r = whatIfLocal({
    scenarioId: "supplier", lang: "ru", moves: MOVES, turnIndex: 2,
    altText: "А что для вас важнее всего в долгосрочном сотрудничестве и почему?",
  })!;
  const { original: o, alternative: a } = r;
  assert.ok(a.deltas.info > 0, "alternative uncovers info");
  assert.ok(a.state.interests_found > o.state.interests_found);
  assert.ok(a.deltas.tension < o.deltas.tension, "alternative cools the room");
  assert.ok(a.deltas.trust > o.deltas.trust, "alternative builds trust");
});

test("whatIfLocal is deterministic and guards bad input", () => {
  const req: WhatIfRequest = {
    scenarioId: "supplier", lang: "ru", moves: MOVES, turnIndex: 1, altText: "тест",
  };
  assert.deepEqual(whatIfLocal(req), whatIfLocal(req));
  assert.equal(whatIfLocal({ ...req, turnIndex: 9 }), null); // out of range
  assert.equal(whatIfLocal({ ...req, scenarioId: "nope" }), null); // unknown scenario
});

// ---- Аудит 17.10, F03: «Как было» — сыгранный ход, а не пересчёт -------------
import { recordedBranch, repliesByMove } from "../src/lib/whatif";
import { SCENARIO_MAP } from "../src/data/scenarios";
import { analyze, applyMove, applyStartConditions, newSession, scoreSession } from "../src/mock/engine";
import type { TurnRecord } from "../src/types";
import { readFileSync } from "node:fs";

const F03_MOVES = [
  "Добрый день, рад знакомству!",
  "Расскажите, с какими сложностями по загрузке вы сталкиваетесь?",
  "А что для вас важнее всего в этой сделке?",
];

function playOffline(reputation?: number) {
  const def = SCENARIO_MAP["supplier"];
  const s = newSession(def, "ru");
  applyStartConditions(s, def, reputation);
  for (const m of F03_MOVES) { s.turn += 1; applyMove(s, analyze(m), m); }
  return scoreSession(s);
}

test("the offline debrief's turn log is exactly what the replay of the same line gives", () => {
  // Судьи офлайн нет, поэтому хроника и переигровка обязаны совпасть — и
  // с репутацией кампании тоже: стартовые условия едут в запрос.
  for (const reputation of [undefined, 60]) {
    const log = playOffline(reputation).turn_log!;
    assert.equal(log.length, F03_MOVES.length);
    F03_MOVES.forEach((m, i) => {
      const res = whatIfLocal({ scenarioId: "supplier", lang: "ru", moves: F03_MOVES, turnIndex: i,
                                altText: m, reputation: reputation ?? null })!;
      assert.deepEqual(res.alternative.deltas, log[i].deltas, `ход ${i + 1}, репутация ${reputation}`);
      assert.equal(res.alternative.state.offer_opp, log[i].offer_after);
      assert.equal(res.alternative.state.interests_found, log[i].interests_found);
    });
  }
});

test("«Как было» takes the recorded numbers and the reply the player actually read", () => {
  const res = whatIfLocal({ scenarioId: "supplier", lang: "ru", moves: F03_MOVES, turnIndex: 0, altText: "Хорошо." })!;
  const rec: TurnRecord = {
    deltas: { trust: 9, tension: -7, info: 14, leverage: 0 }, offer_after: 97, interests_found: 1,
    judge: { arg_score: 70, interest_targeted: 0, criteria_legitimate: null, tradeoff_real: null,
             batna_real: null, secondary_conceded: null },
  };
  const o = recordedBranch(res.original, rec, "Загрузка у нас сейчас и правда нестабильная.");
  assert.deepEqual(o.deltas, rec.deltas);
  assert.equal(o.state.offer_opp, 97);
  assert.equal(o.state.interests_found, 1);
  assert.equal(o.opponent_line, "Загрузка у нас сейчас и правда нестабильная.");
  assert.equal(o.judged, true);
  // Без хроники (старый разбор) — пересчёт как есть.
  assert.equal(recordedBranch(res.original, undefined, "x"), res.original);
});

test("replies line up with the player's moves, skipping hints and probes", () => {
  const log = [
    { kind: "opp", text: "Здравствуйте." },          // приветствие — до первого хода
    { kind: "me", text: "a" }, { kind: "hint", text: "h" }, { kind: "opp", text: "A" },
    { kind: "me", text: "b" },                         // ответа нет — перебили
    { kind: "me", text: "c" }, { kind: "probe" }, { kind: "opp", text: "C" },
  ];
  assert.deepEqual(repliesByMove(log), ["A", "", "C"]);
});

test("a judged real move against an unjudged alternative never claims «better»", () => {
  // Принцип 2: «Так было бы лучше» на сравнении не на равных — заявление,
  // которого нет. Сторож по исходнику: баннер гасится, подпись показывается.
  const src = readFileSync(new URL("../src/components/Debrief.tsx", import.meta.url), "utf8");
  assert.match(src, /const approx = !!o\.judged && !a\.judged;/);
  assert.match(src, /const better = !approx &&/);
  assert.match(src, /approx \? <p className="wi-approx">\{w\.approxNote\}<\/p>/);
});
