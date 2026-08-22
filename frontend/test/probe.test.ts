// The probe layer is the one modality that is REAL rather than mocked, so its
// determinism is the thing worth locking down: a replayed session must ask the
// same questions with the same options in the same order.
import test from "node:test";
import assert from "node:assert/strict";
import { buildProbe, shouldProbe, REACTION_SCALE, EVERY } from "../src/lib/probe";

test("the true reaction is always among the options and correctly indexed", () => {
  for (const r of REACTION_SCALE) {
    for (let turn = 2; turn <= 12; turn++) {
      const p = buildProbe(r, turn);
      assert.ok(p, `${r}@${turn}`);
      assert.equal(p!.options[p!.answer], r);
      assert.equal(p!.options.length, 4);
      assert.equal(new Set(p!.options).size, 4, "options must be distinct");
    }
  }
});

test("distractors are NEIGHBOURS on the warmth scale, not random opposites", () => {
  // "warmed" vs "walked_out" would be trivial; the confusion worth training is
  // between adjacent states.
  const p = buildProbe("neutral", 4)!;
  const idx = p.options.map((o) => REACTION_SCALE.indexOf(o));
  const centre = REACTION_SCALE.indexOf("neutral");
  for (const i of idx) assert.ok(Math.abs(i - centre) <= 2, `${REACTION_SCALE[i]} too far`);
});

test("it is a pure function — same input, same question", () => {
  assert.deepEqual(buildProbe("hardened", 6), buildProbe("hardened", 6));
});

test("the correct answer does not sit in the same slot every time", () => {
  const slots = new Set([3, 6, 9, 12].map((t) => buildProbe("pressured", t)!.answer));
  assert.ok(slots.size > 1, "answer position must vary across turns");
});

test("an unknown reaction yields no question rather than a wrong one", () => {
  assert.equal(buildProbe("nonsense", 3), null);
});

test("no question on the first move or after the table closes", () => {
  assert.equal(shouldProbe(1, false), false, "nothing to read on turn 1");
  assert.equal(shouldProbe(EVERY, true), false, "the outcome already answers it");
  assert.equal(shouldProbe(EVERY, false), true);
});
