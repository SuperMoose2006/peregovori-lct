import test from "node:test";
import assert from "node:assert/strict";
import { reportSnapshot, reportText, type ReportInput } from "../src/lib/reportExport";

const input: ReportInput = {
  lang: "ru", mode: "practice", scenarioTitle: "Аренда", createdAt: "2026-09-16T12:00:00.000Z",
  playerName: "  Саша  ", playerMoves: ["Что для вас важно?", "Договорились."],
  debrief: { grade: "B", overall: 78, economic: 80, relationship: 90, technique: 65, status: "agreement", deal_text: "100 ₽", interests_found: 1, interests_total: 2, spin_stages: 2, objective_criteria: 1, empathy: 2, threats: 0, tradeoffs: 1, avg_arg: 60, tips: ["Спросите о сроках"], turning_points: [{ turn: 1, quote: "Что для вас важно?", what: "Доверие выросло", coach: "Продолжайте спрашивать" }] },
};

test("report keeps actual scores, Unicode and ordered player lines with explicit attribution", () => {
  const text = reportText(input);
  assert.match(text, /Итог: B · 78\/100/);
  assert.match(text, /Участник: Саша/);
  assert.match(text, /Результат: 100 ₽/);
  assert.match(text, /Ваши реплики\n1\. Что для вас важно\?\n2\. Договорились\./);
  assert.match(text, /Доверие выросло/);
});

test("English report handles absent optional data without fake sections", () => {
  const text = reportText({ ...input, lang: "en", mode: "exam", playerName: undefined, playerMoves: undefined, debrief: { ...input.debrief, turning_points: undefined, tips: [] } });
  assert.match(text, /Mode: Exam/);
  assert.match(text, /Overall: B · 78\/100/);
  assert.doesNotMatch(text, /undefined|Your lines|Mentor|Participant|Try next time/);
});

test("JSON export copies only public report fields and never carries unknown transport fields", () => {
  const source = { ...input, debrief: { ...input.debrief, session_token: "private", observations: [{ turn: 1, at_ms: 0, text: "camera", expressive: true }] } };
  const snapshot = reportSnapshot(source);
  assert.equal(snapshot.version, 1);
  assert.deepEqual(snapshot.player_moves, input.playerMoves);
  assert.doesNotMatch(JSON.stringify(snapshot), /private|camera|observations/);
  snapshot.result.tips.push("New");
  assert.equal(input.debrief.tips.length, 1);
});
