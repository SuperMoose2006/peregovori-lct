// customConfirm.test.ts — числа своей сделки на подтверждение (CE-01) в
// офлайн-ядре и в транспорте. Серверная половина — tests/test_custom_adjust.py.
import { test } from "node:test";
import assert from "node:assert/strict";
import { MockServer } from "../src/mock/mockServer";
import { adjustCustom, synthCustomScenario } from "../src/mock/customScenario";
import type { ServerMsg } from "../src/types";

async function customTable() {
  const got: ServerMsg[] = [];
  const srv = new MockServer((m: ServerMsg) => got.push(m));
  srv.send({ type: "start", scenarioId: "", lang: "ru", mode: "custom",
             situation: "Поставщик поднимает цену на упаковку, я закупщик, хочу удержать цену." });
  for (let i = 0; i < 200 && !got.some((m) => m.type === "greeting"); i++) await new Promise((r) => setTimeout(r, 10));
  return { srv, got };
}

test("офлайн: числа своей сделки правятся до первого хода", async () => {
  const { srv, got } = await customTable();
  const first = got.find((m) => m.type === "greeting") as Extract<ServerMsg, { type: "greeting" }>;
  const lower = first.state.offer_opp > first.scenario.target;
  const open = lower ? first.state.offer_opp + 10 : first.state.offer_opp - 10;
  const target = lower ? first.scenario.target - 5 : first.scenario.target + 5;
  const redline = lower ? first.scenario.reservation + 2 : first.scenario.reservation - 2;
  got.length = 0;
  srv.send({ type: "adjust", open, target, redline });
  const again = got.find((m) => m.type === "greeting") as Extract<ServerMsg, { type: "greeting" }>;
  assert.ok(again, "нет нового приветствия");
  assert.equal(again.sessionId, first.sessionId);
  assert.equal(again.state.offer_opp, open);
  assert.equal(again.scenario.target, target);
  assert.equal(again.scenario.reservation, redline);
  srv.close();
});

test("офлайн: невозможные числа и поправка после хода — отказ строкой", async () => {
  const { srv, got } = await customTable();
  const first = got.find((m) => m.type === "greeting") as Extract<ServerMsg, { type: "greeting" }>;
  got.length = 0;
  // Цель хуже красной линии — в любом направлении стола это отказ.
  srv.send({ type: "adjust", open: first.state.offer_opp, target: first.scenario.reservation,
             redline: first.scenario.target });
  assert.ok(got.some((m) => m.type === "notice"), "нет отказа");
  assert.ok(!got.some((m) => m.type === "greeting"));
  srv.send({ type: "turn", text: "Что для вас важнее всего в этой сделке?" });
  for (let i = 0; i < 300 && !got.some((m) => m.type === "opponent"); i++) await new Promise((r) => setTimeout(r, 10));
  got.length = 0;
  srv.send({ type: "adjust", open: first.state.offer_opp, target: first.scenario.target, redline: first.scenario.reservation });
  const notice = got.find((m) => m.type === "notice") as { text: string } | undefined;
  assert.ok(notice && /до первого хода/.test(notice.text), JSON.stringify(got));
  srv.close();
});

test("дно собеседника сдвигается пропорционально и не выходит за старт", () => {
  const def = synthCustomScenario("Поставщик поднимает цену на упаковку, я закупщик.", "ru");
  const lower = def.dir === "low";
  const open = lower ? def.open * 1.1 : def.open * 0.9;
  const target = lower ? def.target * 0.95 : def.target * 1.05;
  const redline = lower ? def.resv * 1.02 : def.resv * 0.98;
  const next = adjustCustom(def, open, target, redline, "ru");
  assert.ok(typeof next !== "string", String(next));
  if (typeof next === "string") return;
  const share = (def.floor - def.open) / (def.target - def.open);
  assert.ok(Math.abs(next.floor - (open + Math.max(0, share) * (target - open))) < 0.01);
  assert.ok(lower ? next.floor <= open : next.floor >= open, "дно по ту сторону старта");
});
