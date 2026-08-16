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
