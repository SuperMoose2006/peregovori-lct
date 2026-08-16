// progress.test.ts — the retention spine's pure math: best-only-if-improved and
// the day-streak transitions. No localStorage here (those adapters are I/O); we
// exercise the deterministic functions with an injected "now".
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyDebrief,
  earnedAchievements,
  emptyProfile,
  isBetter,
  masteryOf,
  nextStreak,
  rankForXp,
  recordDebrief,
  shouldRunTutorial,
  skillSignals,
  strongestWeakest,
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
  // Three consecutive days earns the participation streak badge, but no skill/success badge.
  const success = ["first_a", "all_interests", "no_threat_deal", "criteria_tradeoff"];
  assert.ok(!g.newAchievements.some((a) => success.includes(a)), "no success badge from a breakdown");
});

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
