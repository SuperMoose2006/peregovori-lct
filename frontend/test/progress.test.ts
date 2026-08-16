// progress.test.ts — the retention spine's pure math: best-only-if-improved and
// the day-streak transitions. No localStorage here (those adapters are I/O); we
// exercise the deterministic functions with an injected "now".
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  emptyProfile,
  isBetter,
  nextStreak,
  recordDebrief,
  type ScenarioRecord,
} from "../src/lib/progress";

const rec = (grade: ScenarioRecord["bestGrade"], score: number, attempts = 1): ScenarioRecord => ({
  bestGrade: grade,
  bestScore: score,
  attempts,
  lastPlayed: "2026-01-01T00:00:00.000Z",
});

test("isBetter: first result always improves", () => {
  assert.equal(isBetter("F", 10, null), true);
  assert.equal(isBetter("F", 0, rec(null, 0, 0)), true);
});

test("isBetter: higher grade wins, lower grade loses", () => {
  assert.equal(isBetter("A", 40, rec("C", 90)), true, "A beats C even with lower score");
  assert.equal(isBetter("C", 99, rec("A", 60)), false, "C never beats A");
});

test("isBetter: same grade compares score; exact tie does not improve", () => {
  assert.equal(isBetter("B", 78, rec("B", 70)), true);
  assert.equal(isBetter("B", 70, rec("B", 78)), false);
  assert.equal(isBetter("B", 70, rec("B", 70)), false, "tie keeps the earlier record");
});

test("recordDebrief: best only updates when improved; attempts always increments", () => {
  let p = emptyProfile();
  let r = recordDebrief(p, "supplier", "B", 72, new Date("2026-02-01T10:00:00Z"));
  assert.equal(r.improved, true);
  assert.equal(r.prevBest, null);
  assert.equal(r.record.bestGrade, "B");
  assert.equal(r.record.bestScore, 72);
  assert.equal(r.record.attempts, 1);
  p = r.profile;

  // A worse run: attempts bumps, best is unchanged, improved=false.
  r = recordDebrief(p, "supplier", "D", 40, new Date("2026-02-01T11:00:00Z"));
  assert.equal(r.improved, false);
  assert.equal(r.record.bestGrade, "B");
  assert.equal(r.record.bestScore, 72);
  assert.equal(r.record.attempts, 2);
  assert.deepEqual(r.prevBest, { grade: "B", score: 72 });
  p = r.profile;

  // A better run: best rises, delta is reported via prevBest.
  r = recordDebrief(p, "supplier", "A", 88, new Date("2026-02-02T09:00:00Z"));
  assert.equal(r.improved, true);
  assert.equal(r.record.bestGrade, "A");
  assert.equal(r.record.bestScore, 88);
  assert.equal(r.record.attempts, 3);
  assert.deepEqual(r.prevBest, { grade: "B", score: 72 });
});

test("nextStreak: first, same-day, consecutive, and gap transitions", () => {
  assert.equal(nextStreak(0, "", "2026-02-01"), 1, "first ever finish");
  assert.equal(nextStreak(3, "2026-02-01", "2026-02-01"), 3, "same day: unchanged");
  assert.equal(nextStreak(3, "2026-02-01", "2026-02-02"), 4, "next day: +1");
  assert.equal(nextStreak(5, "2026-02-01", "2026-02-05"), 1, "gap: reset to 1");
});

test("recordDebrief advances the streak across consecutive days but not within a day", () => {
  let p = emptyProfile();
  p = recordDebrief(p, "salary", "C", 60, new Date("2026-03-01T08:00:00Z")).profile;
  assert.equal(p.streak, 1);
  p = recordDebrief(p, "salary", "C", 61, new Date("2026-03-01T20:00:00Z")).profile;
  assert.equal(p.streak, 1, "second game same day keeps streak at 1");
  p = recordDebrief(p, "salary", "B", 70, new Date("2026-03-02T09:00:00Z")).profile;
  assert.equal(p.streak, 2, "next day advances");
  p = recordDebrief(p, "salary", "B", 71, new Date("2026-03-10T09:00:00Z")).profile;
  assert.equal(p.streak, 1, "a gap resets");
});
