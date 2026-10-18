// progressEdges.test.ts — края геймификации, найденные после аудита 17.10.
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyDebrief, emptyProfile, markLessonDone, streakView, strongestWeakest } from "../src/lib/progress";
import { I18N } from "../src/i18n";
import type { Debrief } from "../src/types";

const deb = (o: Partial<Debrief> = {}): Debrief => ({
  overall: 60, grade: "C", economic: 60, relationship: 60, technique: 60, deal_text: "", status: "active",
  interests_found: 0, interests_total: 3, spin_stages: 0, objective_criteria: 0, empathy: 0, threats: 0,
  tradeoffs: 0, avg_arg: 50, tips: [], ...o,
});

test("прерванная серия не празднуется на партии, которая её не засчитала", () => {
  // Семь дней уроков, две недели перерыва, партия на D: карточка «7 дней
  // подряд» и значок серии — при том, что серия прервана.
  let p = emptyProfile();
  for (let i = 1; i <= 7; i++) p = markLessonDone(p, "foundations", i, new Date(2026, 7, i, 10));
  assert.equal(p.streak, 7);
  assert.equal(streakView(p, "2026-08-21")!.mood, "away");
  const g = applyDebrief(p, "supplier", deb({ overall: 45, grade: "D", status: "agreement" }), new Date(2026, 7, 21, 10));
  assert.equal(g.streakCounted, false);
  assert.deepEqual(g.newMilestones.filter((m) => m.kind === "streak"), []);
  assert.ok(!g.newAchievements.includes("streak_3"));
});

test("карточка серии не говорит «вы не играли» после партии на D", () => {
  let p = applyDebrief(emptyProfile(), "a", deb({ status: "agreement" }), new Date(2026, 8, 1, 10)).profile;
  p = applyDebrief(p, "a", deb({ overall: 45, grade: "D", status: "agreement" }), new Date(2026, 8, 2, 10)).profile;
  const v = streakView(p, "2026-09-02")!;
  assert.doesNotMatch(I18N.ru.streak[v.mood], /не играли/);
  assert.doesNotMatch(I18N.en.streak[v.mood], /not played/);
});

test("сильный и слабый навык не совпадают; без разброса не названы", () => {
  const g = applyDebrief(emptyProfile(), "a", deb({ overall: 10, grade: "F", status: "breakdown", relationship: 0 }), new Date(2026, 8, 1, 10));
  const { strong, weak } = strongestWeakest(g.profile);
  assert.ok(strong === null || strong !== weak, `strong=${strong} weak=${weak}`);
});
