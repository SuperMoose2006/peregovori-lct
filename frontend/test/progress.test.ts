// progress.test.ts — the retention spine's pure math: best-only-if-improved and
// the day-streak transitions. No localStorage here (those adapters are I/O); we
// exercise the deterministic functions with an injected "now".
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyDebrief,
  dailyGoalView,
  earnedAchievements,
  emptyProfile,
  FREEZE_CAP,
  isBetter,
  masteryOf,
  milestonesForGame,
  nextStreak,
  rankForXp,
  recordDebrief,
  setDailyGoalTarget,
  shouldRunTutorial,
  skillSignals,
  strongestWeakest,
  updateStreak,
  xpForDebrief,
  type Profile,
  type ScenarioRecord,
} from "../src/lib/progress";
import type { Debrief } from "../src/types";

// A debrief factory: neutral defaults, override the fields a test cares about.
const deb = (o: Partial<Debrief> = {}): Debrief => ({
  overall: 60, grade: "C", economic: 60, relationship: 60, technique: 60,
  deal_text: "", status: "active",
  interests_found: 0, interests_total: 3, spin_stages: 0, objective_criteria: 0,
  empathy: 0, threats: 0, tradeoffs: 0, avg_arg: 50, tips: [],
  ...o,
});

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

test("recordDebrief: first run is a silent baseline (no 'improved'); best only updates when improved; attempts always increments", () => {
  let p = emptyProfile();
  let r = recordDebrief(p, "supplier", "B", 72, new Date("2026-02-01T10:00:00Z"));
  assert.equal(r.improved, false, "first-ever attempt beats no prior best — never a 'record'");
  assert.equal(r.isFirst, true, "first run sets the baseline");
  assert.equal(r.prevBest, null);
  assert.equal(r.record.bestGrade, "B", "baseline is still recorded");
  assert.equal(r.record.bestScore, 72);
  assert.equal(r.record.attempts, 1);
  p = r.profile;

  // A worse run: attempts bumps, best is unchanged, improved=false.
  r = recordDebrief(p, "supplier", "D", 40, new Date("2026-02-01T11:00:00Z"));
  assert.equal(r.improved, false);
  assert.equal(r.isFirst, false);
  assert.equal(r.record.bestGrade, "B");
  assert.equal(r.record.bestScore, 72);
  assert.equal(r.record.attempts, 2);
  assert.deepEqual(r.prevBest, { grade: "B", score: 72 });
  p = r.profile;

  // A better run that beats a real prior best: improved=true, delta via prevBest.
  r = recordDebrief(p, "supplier", "A", 88, new Date("2026-02-02T09:00:00Z"));
  assert.equal(r.improved, true);
  assert.equal(r.isFirst, false);
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

// ---- Gamification: XP, ranks, skills, achievements -------------------------

test("xpForDebrief: base score + record bonus + agreement bonus", () => {
  assert.equal(xpForDebrief(60, "active", false), 60, "just the score");
  assert.equal(xpForDebrief(60, "active", true), 85, "+25 for a personal record");
  assert.equal(xpForDebrief(60, "agreement", false), 75, "+15 for closing a deal");
  assert.equal(xpForDebrief(72.4, "agreement", true), 72 + 25 + 15, "all three, rounded");
  assert.equal(xpForDebrief(-5, "breakdown", false), 0, "never negative");
});

test("xpForDebrief: a breakdown is scaled down hard and earns no bonuses", () => {
  assert.equal(xpForDebrief(60, "breakdown", false), 18, "60 × 0.3, no bonuses");
  assert.equal(xpForDebrief(60, "breakdown", true), 18, "a breakdown never collects the record bonus");
  assert.equal(xpForDebrief(90, "breakdown", false), 27, "90 × 0.3");
  // A collapsed deal earns far less than the same score reached honestly.
  assert.ok(xpForDebrief(60, "breakdown", false) < xpForDebrief(60, "active", false));
});

test("rankForXp: thresholds, mid-tier progress, and the capped top rank", () => {
  assert.equal(rankForXp(0).rank.id, "novice");
  assert.equal(rankForXp(149).rank.id, "novice");
  assert.equal(rankForXp(150).rank.id, "negotiator");
  assert.equal(rankForXp(400).rank.id, "pro");

  const mid = rankForXp(275); // negotiator [150..400): halfway
  assert.equal(mid.rank.id, "negotiator");
  assert.equal(mid.next?.id, "pro");
  assert.equal(mid.toNext, 125);
  assert.equal(mid.progress, 0.5);

  const top = rankForXp(5000);
  assert.equal(top.rank.id, "grandmaster");
  assert.equal(top.next, null);
  assert.equal(top.progress, 1, "top rank shows a full bar");
  assert.equal(top.toNext, 0);
});

test("skillSignals: each debrief stat maps to a 0..100 signal", () => {
  const s = skillSignals(deb({
    spin_stages: 3, interests_found: 2, interests_total: 4,
    objective_criteria: 2, empathy: 1, tradeoffs: 3, relationship: 80,
  }));
  assert.equal(s.questions, 100, "3/3 SPIN stages");
  assert.equal(s.interests, 50, "2 of 4 interests");
  assert.equal(s.criteria, 67, "min(2,3)/3 rounded");
  assert.equal(s.listening, 33, "min(1,3)/3 rounded");
  assert.equal(s.tradeoff, 100, "min(3,2)/2 capped");
  assert.equal(s.tension, 80, "relationship dimension");

  // Missing denominators degrade to 0, not NaN.
  const z = skillSignals(deb({ interests_found: 0, interests_total: 0 }));
  assert.equal(z.interests, 0);
});

test("earnedAchievements: each predicate fires on its own condition", () => {
  const base = emptyProfile();
  assert.deepEqual(earnedAchievements(base, deb({ grade: "A" })), ["first_a"]);
  assert.deepEqual(
    earnedAchievements(base, deb({ interests_found: 3, interests_total: 3 })),
    ["all_interests"],
  );
  assert.deepEqual(
    earnedAchievements(base, deb({ status: "agreement", threats: 0 })),
    ["no_threat_deal"],
  );
  assert.deepEqual(
    earnedAchievements(base, deb({ objective_criteria: 1, tradeoffs: 1 })),
    ["criteria_tradeoff"],
  );
  // A threatful deal does NOT earn the clean-deal badge.
  assert.deepEqual(earnedAchievements(base, deb({ status: "agreement", threats: 2 })), []);

  const streaky: Profile = { ...base, streak: 3 };
  assert.deepEqual(earnedAchievements(streaky, deb()), ["streak_3"]);

  const rr = rec("A", 80);
  const wide: Profile = {
    ...base,
    scenarios: { a: rr, b: rr, c: rr, d: rr, e: rr },
  };
  assert.ok(earnedAchievements(wide, deb()).includes("five_scenarios"));
});

test("earnedAchievements: a breakdown mints no skill/success badge", () => {
  const base = emptyProfile();
  // Even if the player uncovered every interest and used a criterion + trade, a
  // collapsed table earns none of the success badges.
  assert.deepEqual(
    earnedAchievements(base, deb({
      status: "breakdown", grade: "F",
      interests_found: 3, interests_total: 3, objective_criteria: 2, tradeoffs: 1,
    })),
    [],
    "no success badge survives a breakdown",
  );
  // Participation badges (streak, breadth) still count — you did show up.
  const streaky: Profile = { ...base, streak: 3 };
  assert.deepEqual(earnedAchievements(streaky, deb({ status: "breakdown", grade: "F" })), ["streak_3"]);
});

test("applyDebrief: awards XP, folds skill averages, unlocks badges, tracks daily goal", () => {
  let p = emptyProfile();

  // Game 1: a strong A with a deal on day 1.
  let g = applyDebrief(
    p, "supplier",
    deb({ overall: 88, grade: "A", status: "agreement", spin_stages: 3, interests_found: 3, interests_total: 3, objective_criteria: 2, tradeoffs: 1, empathy: 2, threats: 0, relationship: 78 }),
    new Date("2026-04-01T10:00:00Z"),
  );
  assert.equal(g.improved, false, "a first attempt beats no prior best");
  assert.equal(g.isFirst, true);
  assert.equal(g.celebrate, false, "no record fanfare on the very first play");
  assert.equal(g.failed, false);
  assert.equal(g.xpGain, 88 + 15, "score + deal, but NO record bonus on a first attempt");
  assert.equal(g.xpAfter, g.xpGain);
  assert.equal(g.dailyGoalMet, true, "first game of the day meets the goal");
  assert.ok(g.newAchievements.includes("first_a"));
  assert.ok(g.newAchievements.includes("all_interests"));
  assert.ok(g.newAchievements.includes("no_threat_deal"));
  assert.ok(g.newAchievements.includes("criteria_tradeoff"));
  assert.equal(masteryOf(g.profile.skills.questions), 100);
  assert.equal(masteryOf(g.profile.skills.interests), 100);
  p = g.profile;

  // Game 2 same day: goal already met; skills average across the two games.
  g = applyDebrief(
    p, "salary",
    deb({ overall: 40, grade: "D", status: "active", spin_stages: 0, interests_found: 0, interests_total: 3, relationship: 40 }),
    new Date("2026-04-01T20:00:00Z"),
  );
  assert.equal(g.dailyGoalMet, false, "second game same day: goal already met");
  assert.equal(masteryOf(g.profile.skills.questions), 50, "(100 + 0) / 2");
  assert.equal(masteryOf(g.profile.skills.interests), 50);
  // No badge is unlocked twice.
  assert.equal(g.newAchievements.includes("first_a"), false);
  assert.equal(g.profile.achievements.filter((a) => a === "first_a").length, 1);
  p = g.profile;

  const { strong, weak } = strongestWeakest(p);
  // tension = (78+40)/2 = 59 is the highest running average across the two games.
  assert.equal(strong, "tension");
  assert.equal(weak, "tradeoff"); // (50+0)/2 = 25 is the lowest
});

test("applyDebrief: honest reward loop — beat-a-best celebrates, breakdown does not", () => {
  let p = emptyProfile();

  // Baseline: a first C. No record, no fanfare (celebrate=false).
  let g = applyDebrief(p, "supplier", deb({ overall: 60, grade: "C", status: "agreement" }), new Date("2026-06-01T10:00:00Z"));
  assert.equal(g.isFirst, true);
  assert.equal(g.celebrate, false, "first attempt never celebrates");
  assert.equal(g.xpGain, 60 + 15, "no +25 record bonus on the baseline");
  p = g.profile;

  // Next day, a real improvement to a passing B: THIS celebrates + earns the bonus.
  g = applyDebrief(p, "supplier", deb({ overall: 80, grade: "B", status: "agreement" }), new Date("2026-06-02T10:00:00Z"));
  assert.equal(g.improved, true);
  assert.equal(g.celebrate, true, "beating a prior best with a passing grade celebrates");
  assert.equal(g.xpGain, 80 + 25 + 15, "score + record + deal");
  p = g.profile;

  // Next day, the same scenario collapses: reduced XP, no fanfare, best untouched.
  const before = p.xp;
  g = applyDebrief(p, "supplier", deb({ overall: 50, grade: "F", status: "breakdown" }), new Date("2026-06-03T10:00:00Z"));
  assert.equal(g.failed, true);
  assert.equal(g.celebrate, false, "a breakdown never shows a record");
  assert.equal(g.improved, false);
  assert.equal(g.xpGain, Math.round(50 * 0.3), "breakdown XP is hard-scaled, no bonuses");
  assert.equal(g.xpAfter, before + Math.round(50 * 0.3));
  assert.equal(g.record.bestGrade, "B", "the collapse does not touch the recorded best");
  // Streak honesty: the day-3 collapse does NOT extend the streak (it's a mastery
  // streak, not attendance) — so no streak_3 and no other success badge either.
  assert.equal(g.streakCounted, false, "a breakdown does not count toward the streak");
  assert.equal(g.profile.streak, 2, "streak stays at the 2 competent days, day-3 collapse excluded");
  const success = ["first_a", "all_interests", "no_threat_deal", "criteria_tradeoff", "streak_3"];
  assert.ok(!g.newAchievements.some((a) => success.includes(a)), "no success/streak badge from a breakdown");
});

test("applyDebrief: streak is a MASTERY streak — only C+ days count, a weak day is neutral", () => {
  let p = emptyProfile();
  // Day 1: a competent C → streak starts at 1.
  let g = applyDebrief(p, "supplier", deb({ overall: 60, grade: "C", status: "agreement" }), new Date("2026-09-01T10:00:00Z"));
  assert.equal(g.streakCounted, true);
  assert.equal(g.profile.streak, 1);
  p = g.profile;

  // Day 2: a D → doesn't count. lastStreakDay stays on the last QUALIFYING day (day 1),
  // so the streak number is untouched in the moment (not reset mid-day: a later C+ the
  // same day would still extend it, since today === a consecutive step from day 1).
  g = applyDebrief(p, "supplier", deb({ overall: 40, grade: "D", status: "active" }), new Date("2026-09-02T10:00:00Z"));
  assert.equal(g.streakCounted, false, "a D never counts toward the streak");
  assert.equal(g.profile.streak, 1, "the weak day leaves the count as-is in the moment");
  assert.equal(g.profile.lastStreakDay, "2026-09-01", "the last qualifying day is still day 1");
  p = g.profile;

  // Day 3: a competent B, but now a full calendar gap sits between it and the last
  // qualifying day (day 1) — day 2 had no C+, so the chain is genuinely broken. With no
  // freeze banked (freezes accrue every 5 days), it honestly restarts at 1: "consecutive
  // days with a C+" is exactly 1. (A long streak would hold a freeze and survive one off-day.)
  g = applyDebrief(p, "supplier", deb({ overall: 78, grade: "B", status: "agreement" }), new Date("2026-09-03T10:00:00Z"));
  assert.equal(g.streakCounted, true);
  assert.equal(g.profile.streak, 1, "a non-C+ middle day breaks the chain — the streak restarts");
})

test("applyDebrief: a D/F run that edges out a prior best still does not celebrate", () => {
  // Prior best is a failing F(10). A D(45) is numerically better, so the stored
  // best rises — but a D is still a failing grade, so no fanfare/record bonus.
  let p = emptyProfile();
  p = applyDebrief(p, "salary", deb({ overall: 10, grade: "F", status: "active" }), new Date("2026-07-01T10:00:00Z")).profile;
  const g = applyDebrief(p, "salary", deb({ overall: 45, grade: "D", status: "active" }), new Date("2026-07-02T10:00:00Z"));
  assert.equal(g.improved, true, "the raw score did beat the prior best");
  assert.equal(g.celebrate, false, "but a D never celebrates");
  assert.equal(g.xpGain, 45, "no +25 record bonus on a failing grade");
  assert.equal(g.record.bestScore, 45, "the best still rises to reflect reality");
});

test("applyDebrief: crossing an XP threshold flags a level-up", () => {
  // Seed just below the negotiator threshold (150), then earn enough to cross it.
  let p: Profile = { ...emptyProfile(), xp: 140 };
  const g = applyDebrief(p, "supplier", deb({ overall: 60, status: "active" }), new Date("2026-05-01T10:00:00Z"));
  assert.equal(g.rankBefore.rank.id, "novice");
  assert.equal(g.rankAfter.rank.id, "negotiator");
  assert.equal(g.leveledUp, true);
});

// ---- Guided first-negotiation onboarding gate -------------------------------
// The tutorial runs ONLY in practice, and ONLY until finished/skipped once.
test("shouldRunTutorial: practice + not done → true (the one case that onboards)", () => {
  assert.equal(shouldRunTutorial("practice", false), true);
});

test("shouldRunTutorial: once done, practice never re-onboards", () => {
  assert.equal(shouldRunTutorial("practice", true), false);
});

test("shouldRunTutorial: exam / campaign / custom never onboard, even fresh", () => {
  for (const mode of ["exam", "campaign", "custom"] as const) {
    assert.equal(shouldRunTutorial(mode, false), false, `${mode} must not onboard`);
    assert.equal(shouldRunTutorial(mode, true), false, `${mode} must not onboard`);
  }
});

// ---- Streak-freeze: earn / spend / reset -----------------------------------

test("updateStreak: normal advance increments and earns a freeze every 5 days", () => {
  // Day-by-day from 4→5: the 5-day landing earns one freeze.
  const at5 = updateStreak({ streak: 4, freezes: 0 }, "2026-02-04", "2026-02-05");
  assert.equal(at5.streak, 5);
  assert.equal(at5.freezes, 1, "5-day streak earns a freeze");
  assert.equal(at5.freezeUsed, false);
  // A non-milestone day earns nothing.
  const at6 = updateStreak({ streak: 5, freezes: 1 }, "2026-02-05", "2026-02-06");
  assert.equal(at6.streak, 6);
  assert.equal(at6.freezes, 1);
});

test("updateStreak: earned freezes are capped", () => {
  // Already at the cap: landing on another 5-day milestone grants nothing extra.
  const at10 = updateStreak({ streak: 9, freezes: FREEZE_CAP }, "2026-02-09", "2026-02-10");
  assert.equal(at10.streak, 10);
  assert.equal(at10.freezes, FREEZE_CAP, "never exceeds the cap");
});

test("updateStreak: a missed day WITH a freeze preserves the streak and spends one", () => {
  // Last played the 1st, playing again the 3rd — the 2nd was skipped.
  const r = updateStreak({ streak: 6, freezes: 2 }, "2026-02-01", "2026-02-03");
  assert.equal(r.freezeUsed, true, "a freeze was spent to cover the gap");
  assert.equal(r.streak, 7, "streak preserved through the gap and extended today");
  assert.equal(r.freezes, 1, "one freeze consumed");
});

test("updateStreak: a missed day WITHOUT a freeze resets to 1", () => {
  const r = updateStreak({ streak: 6, freezes: 0 }, "2026-02-01", "2026-02-03");
  assert.equal(r.freezeUsed, false);
  assert.equal(r.streak, 1, "no freeze to spend → reset");
  assert.equal(r.freezes, 0);
});

test("updateStreak: a gap larger than held freezes resets (held freezes survive)", () => {
  // Two days skipped (gap of 3) needs two freezes; only one held → reset.
  const r = updateStreak({ streak: 8, freezes: 1 }, "2026-02-01", "2026-02-04");
  assert.equal(r.streak, 1);
  assert.equal(r.freezeUsed, false);
  assert.equal(r.freezes, 1, "the held freeze is not burned on a reset");
  // Two skipped days WITH two freezes: covered, streak preserved, both spent.
  const ok = updateStreak({ streak: 8, freezes: 2 }, "2026-02-01", "2026-02-04");
  assert.equal(ok.streak, 9);
  assert.equal(ok.freezes, 0);
  assert.equal(ok.freezeUsed, true);
});

test("updateStreak: first finish and same-day replay never spend a freeze", () => {
  assert.deepEqual(updateStreak({ streak: 0, freezes: 0 }, "", "2026-02-01"), { streak: 1, freezes: 0, freezeUsed: false });
  assert.deepEqual(updateStreak({ streak: 3, freezes: 1 }, "2026-02-01", "2026-02-01"), { streak: 3, freezes: 1, freezeUsed: false });
});

test("applyDebrief: a missed day is auto-saved by a held freeze", () => {
  // Seed a profile that finished on day 1 with a streak of 4 and one freeze.
  let p: Profile = { ...emptyProfile(), streak: 4, lastStreakDay: "2026-03-01", freezes: 1 };
  // Play again on day 3 — day 2 was missed; the freeze covers it.
  const g = applyDebrief(p, "supplier", deb({ overall: 60, status: "active" }), new Date("2026-03-03T10:00:00Z"));
  assert.equal(g.freezeUsed, true);
  assert.equal(g.profile.streak, 5, "streak preserved through the gap and extended");
  assert.equal(g.freezes, 1, "one freeze spent, one earned back at the 5-day landing");
  assert.equal(g.profile.freezes, 1);
});

// ---- Customizable daily goal ------------------------------------------------

test("setDailyGoalTarget: clamps to 1..3", () => {
  const p = emptyProfile();
  assert.equal(setDailyGoalTarget(p, 3).dailyGoalTarget, 3);
  assert.equal(setDailyGoalTarget(p, 0).dailyGoalTarget, 1, "floor at 1");
  assert.equal(setDailyGoalTarget(p, 9).dailyGoalTarget, 3, "ceil at 3");
});

test("dailyGoalView: fills toward the chosen target across the day", () => {
  const p: Profile = { ...emptyProfile(), dailyGoalTarget: 3, dailyDoneDay: "2026-04-10", dailyDoneCount: 2 };
  const v = dailyGoalView(p, "2026-04-10");
  assert.equal(v.target, 3);
  assert.equal(v.done, 2);
  assert.equal(v.met, false);
  assert.ok(Math.abs(v.progress - 2 / 3) < 1e-9, "ring fills to 2/3");
  // A new day resets the visible count to 0 even though the stored count lingers.
  const fresh = dailyGoalView(p, "2026-04-11");
  assert.equal(fresh.done, 0);
  assert.equal(fresh.progress, 0);
});

test("applyDebrief: the daily goal fires only on the game that hits the chosen target", () => {
  // Target of 2 games/day. First finish: progress 1/2, not yet met.
  let p: Profile = { ...emptyProfile(), dailyGoalTarget: 2 };
  let g = applyDebrief(p, "a", deb({ overall: 60 }), new Date("2026-05-01T09:00:00Z"));
  assert.equal(g.dailyTarget, 2);
  assert.equal(g.dailyDone, 1);
  assert.equal(g.dailyGoalMet, false, "one of two — not met yet");
  p = g.profile;
  // Second finish same day: crosses the target → met fires exactly here.
  g = applyDebrief(p, "b", deb({ overall: 60 }), new Date("2026-05-01T18:00:00Z"));
  assert.equal(g.dailyDone, 2);
  assert.equal(g.dailyGoalMet, true, "the crossing game fires the goal");
  p = g.profile;
  // Third finish same day: already met earlier, does not re-fire.
  g = applyDebrief(p, "c", deb({ overall: 60 }), new Date("2026-05-01T21:00:00Z"));
  assert.equal(g.dailyDone, 3);
  assert.equal(g.dailyGoalMet, false, "goal already met today — no re-fire");
  // Next day, the count resets and a target-1 profile meets on the first game.
  const one: Profile = { ...emptyProfile(), dailyGoalTarget: 1 };
  const g2 = applyDebrief(one, "a", deb({ overall: 60 }), new Date("2026-05-02T09:00:00Z"));
  assert.equal(g2.dailyDone, 1);
  assert.equal(g2.dailyGoalMet, true, "target of 1 meets on the first finish");
});

// ---- Milestones: detection + once-only dedupe -------------------------------

test("milestonesForGame: a 7-day streak and each rank-up are milestones", () => {
  const novice = rankForXp(0);
  const negotiator = rankForXp(150);
  assert.deepEqual(milestonesForGame(novice, novice, 3), [], "no rank-up, sub-7 streak → nothing");
  const streak = milestonesForGame(novice, novice, 7);
  assert.equal(streak.length, 1);
  assert.equal(streak[0].id, "streak_7");
  const rankUp = milestonesForGame(novice, negotiator, 2);
  assert.equal(rankUp.length, 1);
  assert.equal(rankUp[0].id, "rank_negotiator");
  assert.equal(rankUp[0].kind, "rank");
});

test("applyDebrief: a milestone is celebrated once, never on replay", () => {
  // Seed just below the negotiator threshold; a finish crosses it → rank milestone.
  let p: Profile = { ...emptyProfile(), xp: 140 };
  let g = applyDebrief(p, "supplier", deb({ overall: 60, status: "active" }), new Date("2026-06-01T10:00:00Z"));
  assert.equal(g.leveledUp, true);
  assert.deepEqual(g.newMilestones.map((m) => m.id), ["rank_negotiator"], "the rank-up is celebrated once");
  assert.ok(g.profile.celebratedMilestones.includes("rank_negotiator"), "and recorded so it can't repeat");
  p = g.profile;
  // A later game at the same rank yields no repeat of that milestone.
  g = applyDebrief(p, "supplier", deb({ overall: 60, status: "active" }), new Date("2026-06-02T10:00:00Z"));
  assert.deepEqual(g.newMilestones, [], "already celebrated → never fires again");
});

test("applyDebrief: a 7-day streak milestone fires once, and never on a breakdown", () => {
  // A streak of 6 finishing on a normal next day → hits 7, celebrates once.
  let p: Profile = { ...emptyProfile(), streak: 6, lastStreakDay: "2026-07-06" };
  let g = applyDebrief(p, "a", deb({ overall: 60, status: "active" }), new Date("2026-07-07T10:00:00Z"));
  assert.equal(g.profile.streak, 7);
  assert.deepEqual(g.newMilestones.map((m) => m.id), ["streak_7"]);
  p = g.profile;
  // Next day the streak grows past 7 but the milestone never repeats.
  g = applyDebrief(p, "a", deb({ overall: 60, status: "active" }), new Date("2026-07-08T10:00:00Z"));
  assert.deepEqual(g.newMilestones, [], "streak_7 shown once only");

  // A breakdown on what would have been the 7th day: it doesn't count toward the
  // mastery streak (stays at 6), so of course no milestone and nothing celebrated.
  const q: Profile = { ...emptyProfile(), streak: 6, lastStreakDay: "2026-08-06" };
  const gb = applyDebrief(q, "a", deb({ overall: 40, grade: "F", status: "breakdown" }), new Date("2026-08-07T10:00:00Z"));
  assert.equal(gb.streakCounted, false);
  assert.equal(gb.profile.streak, 6, "a collapse doesn't advance the streak — it isn't a competent day");
  assert.deepEqual(gb.newMilestones, [], "but a collapse is never a celebration");
  assert.deepEqual(gb.profile.celebratedMilestones, [], "and nothing is marked celebrated");
});

// ---------------------------------------------------------------------------
// Курс приёмов в профиле: XP платится за решённое, а не за повторно открытое.
import {
  blockCompletion, courseAchievements, emptyBlockProgress, getBlockProgress,
  markLessonDone, missedExercises, recordExam, recordExercise,
} from "../src/lib/progress";

test("урок отмечается один раз и не дублируется", () => {
  let p = emptyProfile();
  p = markLessonDone(p, "foundations", 1);
  p = markLessonDone(p, "foundations", 1);
  p = markLessonDone(p, "foundations", 3);
  assert.deepEqual(getBlockProgress(p, "foundations").lessons, [1, 3]);
});

test("XP за упражнение платится ровно один раз и только за верный ответ", () => {
  let p = emptyProfile();
  const wrong = recordExercise(p, "foundations", "fo-01", 10, false);
  assert.equal(wrong.xpGain, 0);
  assert.equal(wrong.profile.xp, 0);

  const first = recordExercise(p, "foundations", "fo-01", 10, true);
  assert.equal(first.xpGain, 10);
  p = first.profile;
  const again = recordExercise(p, "foundations", "fo-01", 10, true);
  assert.equal(again.xpGain, 0, "повтор того же упражнения не фармится");
  assert.equal(again.profile.xp, 10);
});

test("экзамен: провал даёт долю XP, сдача — бонус один раз", () => {
  let p = emptyProfile();
  const fail = recordExam(p, "foundations", 2, 6, 5);
  assert.ok(fail.xpGain > 0 && fail.xpGain < 60, "провал — доля, не ноль и не бонус");
  assert.equal(fail.passed, false);
  p = fail.profile;
  assert.equal(getBlockProgress(p, "foundations").attempts, 1);

  const pass = recordExam(p, "foundations", 6, 6, 5);
  assert.equal(pass.passed, true);
  assert.equal(pass.xpGain, 60);
  p = pass.profile;
  assert.equal(getBlockProgress(p, "foundations").examBest, 6);
  assert.ok(p.achievements.includes("block_passed"));
  assert.ok(p.achievements.includes("exam_clean"), "максимум — свой значок");

  const twice = recordExam(p, "foundations", 6, 6, 5);
  assert.ok(twice.xpGain < 60, "второй раз бонус не платится");
  assert.deepEqual(twice.newAchievements, [], "уже полученные значки не повторяются");
});

test("значки курса выдаются по числу СДАННЫХ блоков", () => {
  let p = emptyProfile();
  for (const id of ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"]) {
    p = { ...p, course: { ...p.course, [id]: { ...emptyBlockProgress(), passed: true } } };
  }
  const earned = courseAchievements(p);
  assert.ok(earned.includes("course_half") && earned.includes("course_done"));
});

test("доля блока считается по урокам, упражнениям и экзамену", () => {
  const b = { ...emptyBlockProgress(), lessons: [1, 2], solved: ["x"], passed: false };
  const share = blockCompletion(b, 4, 4);
  assert.ok(share > 0 && share < 1);
  assert.equal(
    blockCompletion({ ...b, lessons: [1, 2, 3, 4], solved: ["a", "b", "c", "d"], passed: true }, 4, 4), 1);
});

test("ошибка попадает в работу над ошибками и уходит из неё при исправлении", () => {
  let p = emptyProfile();
  const miss = recordExercise(p, "foundations", "fo-01", 10, false);
  assert.equal(miss.xpGain, 0);
  p = miss.profile;
  assert.deepEqual(getBlockProgress(p, "foundations").missed, ["fo-01"]);
  assert.deepEqual(missedExercises(p), [{ blockId: "foundations", id: "fo-01" }]);

  // Повторная ошибка не дублирует запись.
  p = recordExercise(p, "foundations", "fo-01", 10, false).profile;
  assert.deepEqual(getBlockProgress(p, "foundations").missed, ["fo-01"]);

  // Исправление: половина XP (иначе выгодно ошибаться нарочно) и запись уходит.
  const fix = recordExercise(p, "foundations", "fo-01", 10, true);
  assert.equal(fix.xpGain, 5);
  p = fix.profile;
  assert.deepEqual(getBlockProgress(p, "foundations").missed, []);
  assert.deepEqual(getBlockProgress(p, "foundations").solved, ["fo-01"]);
  assert.deepEqual(missedExercises(p), []);

  // Верный ответ с первого раза платит полностью.
  const clean = recordExercise(p, "foundations", "fo-02", 10, true);
  assert.equal(clean.xpGain, 10);
});

test("день с уроком или экзаменом курса засчитывается в серию", () => {
  // Серия росла только за партии — человек, который каждый день проходит урок,
  // выглядел для продукта бездельником. Дневная ЦЕЛЬ при этом остаётся про
  // партии: урок — это «я был здесь», а не «я сыграл».
  const mon = new Date("2026-08-10T10:00:00Z");
  const tue = new Date("2026-08-11T10:00:00Z");
  let p = emptyProfile();
  p = markLessonDone(p, "foundations", 1, mon);
  assert.equal(p.streak, 1);
  assert.equal(p.dailyDoneCount, 0, "цель дня — про партии, урок её не двигает");

  // Второй урок в тот же день серию не удваивает.
  p = markLessonDone(p, "foundations", 2, mon);
  assert.equal(p.streak, 1);

  p = markLessonDone(p, "foundations", 3, tue);
  assert.equal(p.streak, 2);
});
