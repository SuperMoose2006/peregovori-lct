// mock.test.ts — exercises the MockServer over the full turn protocol, proving
// the mock path (and thus the UI's end-to-end demo path) works headlessly.
import { test } from "node:test";
import assert from "node:assert/strict";
import { MockServer } from "../src/mock/mockServer";
import type { ServerMsg } from "../src/types";

// A tiny promise-based harness over the message stream.
function harness() {
  const messages: ServerMsg[] = [];
  let waiter: { pred: (m: ServerMsg) => boolean; resolve: (m: ServerMsg) => void } | null = null;
  const server = new MockServer((m) => {
    messages.push(m);
    if (waiter && waiter.pred(m)) {
      const w = waiter;
      waiter = null;
      w.resolve(m);
    }
  });
  const waitFor = (pred: (m: ServerMsg) => boolean, ms = 4000) =>
    new Promise<ServerMsg>((resolve, reject) => {
      const found = messages.find(pred);
      if (found) return resolve(found);
      const timer = setTimeout(() => reject(new Error("timeout waiting for message")), ms);
      waiter = {
        pred,
        resolve: (m) => {
          clearTimeout(timer);
          resolve(m);
        },
      };
    });
  return { server, messages, waitFor };
}

test("custom generation can be forced to fail (failure-UI seam)", async () => {
  const { server, waitFor } = harness();
  // The sentinel makes the deterministic synth emit {type:error} instead of a
  // greeting — the hook the failure/retry UI is exercised against.
  server.send({ type: "start", scenarioId: "", lang: "ru", mode: "custom", situation: "force-gen-error" });
  const err = await waitFor((m) => m.type === "error");
  assert.equal(err.type, "error");
  if (err.type === "error") assert.ok(err.message.length > 0);
});

test("greeting → opponent turns → debrief over the protocol", async () => {
  const { server, messages, waitFor } = harness();

  server.send({ type: "start", scenarioId: "supplier", lang: "ru", mode: "practice" });
  const greeting = await waitFor((m) => m.type === "greeting");
  assert.equal(greeting.type, "greeting");
  if (greeting.type === "greeting") {
    assert.equal(greeting.scenario.id, "supplier");
    assert.equal(greeting.state.turn, 0);
    assert.equal(greeting.state.status, "active");
    assert.ok(greeting.text.length > 0);
    // Offline is the deterministic keyword path — the semantic judge is never
    // live in the mock, so the "graded by meaning" badge must stay honest (off).
    assert.equal(greeting.judge_active, false);
  }

  // Drive turns until the negotiation closes (agreement or timeout breakdown).
  let debrief: ServerMsg | null = null;
  for (let i = 0; i < 13 && !debrief; i++) {
    const before = messages.length;
    server.send({ type: "turn", text: "Расскажите, что для вас важнее всего в этой сделке и почему?" });
    const opp = await waitFor((m) => messages.indexOf(m) >= before && m.type === "opponent");
    assert.equal(opp.type, "opponent");
    if (opp.type === "opponent") {
      assert.equal(typeof opp.analysis.arg_quality, "number");
      assert.ok(opp.analysis.arg_quality >= 0 && opp.analysis.arg_quality <= 100);
      assert.ok(Array.isArray(opp.analysis.tags));
      assert.equal(typeof opp.deltas.trust, "number");
      assert.ok(opp.state.turn >= 1);
      // Mock parity: offline has no LIVE judge, so the "judge-cam" fields must be
      // honestly ABSENT (undefined) — never [] / false. The scorecard chips (item 2)
      // still work offline because they derive from analysis/deltas, checked above.
      assert.equal(opp.coach_techniques, undefined);
      assert.equal(opp.coach_reject, undefined);
      // Once the session closes, the server emits a debrief shortly after.
      if (opp.state.status !== "active") {
        debrief = await waitFor((m) => m.type === "debrief");
        break;
      }
    }
    debrief = messages.find((m) => m.type === "debrief") ?? null;
  }

  assert.ok(debrief, "a debrief should eventually be produced");
  if (debrief && debrief.type === "debrief") {
    const d = debrief.debrief;
    assert.match(d.grade, /^[ABCDF]$/);
    assert.ok(d.overall >= 0 && d.overall <= 100);
    assert.ok(d.tips.length > 0);
    assert.equal(d.overall, Math.round(0.4 * d.economic + 0.25 * d.relationship + 0.35 * d.technique));
  }

  server.close();
});

test("custom mode: situation → synthesized scenario → greeting → opponent", async () => {
  const { server, messages, waitFor } = harness();

  server.send({
    type: "start",
    scenarioId: "",
    lang: "ru",
    mode: "custom",
    situation:
      "Я фрилансер-дизайнер. Клиент хочет снизить мою ставку, но я не готов работать ниже рынка.",
  });

  const greeting = await waitFor((m) => m.type === "greeting");
  assert.equal(greeting.type, "greeting");
  if (greeting.type === "greeting") {
    // A full, playable ScenarioView must be synthesized from the free text.
    assert.ok(greeting.scenario.id.length > 0);
    assert.ok(greeting.scenario.title.length > 0);
    assert.ok(greeting.scenario.counterpart_name.length > 0);
    assert.ok(greeting.scenario.briefing.length > 0);
    assert.equal(typeof greeting.scenario.target, "number");
    assert.equal(typeof greeting.scenario.reservation, "number");
    assert.equal(greeting.state.turn, 0);
    assert.equal(greeting.state.status, "active");
    assert.ok(greeting.state.interests_total > 0);
    assert.ok(greeting.text.length > 0);
  }

  // The synthesized scenario drives the SAME engine — a turn yields an opponent.
  const before = messages.length;
  server.send({ type: "turn", text: "Что для вас важнее всего в этой сделке и почему именно это?" });
  const opp = await waitFor((m) => messages.indexOf(m) >= before && m.type === "opponent");
  assert.equal(opp.type, "opponent");
  if (opp.type === "opponent") {
    assert.ok(opp.text.length > 0);
    assert.equal(typeof opp.analysis.arg_quality, "number");
    assert.ok(opp.state.turn >= 1);
  }

  server.close();
});

test("exam mode: greeting → opponent → debrief over the same protocol path", async () => {
  // Экзамен is an assessment overlay on the same engine: the mock path must
  // still run the full loop. (Feedback is hidden in the UI layer, not here —
  // the protocol still carries analysis/deltas; the components withhold them.)
  const { server, messages, waitFor } = harness();

  server.send({ type: "start", scenarioId: "supplier", lang: "ru", mode: "exam" });
  const greeting = await waitFor((m) => m.type === "greeting");
  assert.equal(greeting.type, "greeting");
  if (greeting.type === "greeting") {
    assert.equal(greeting.scenario.id, "supplier");
    assert.equal(greeting.state.status, "active");
    assert.ok(greeting.scenario.title.length > 0); // needed for the certificate line
  }

  let debrief: ServerMsg | null = null;
  for (let i = 0; i < 13 && !debrief; i++) {
    const before = messages.length;
    server.send({ type: "turn", text: "Что для вас важнее всего в этой сделке и почему именно это?" });
    const opp = await waitFor((m) => messages.indexOf(m) >= before && m.type === "opponent");
    assert.equal(opp.type, "opponent");
    if (opp.type === "opponent" && opp.state.status !== "active") {
      debrief = await waitFor((m) => m.type === "debrief");
      break;
    }
    debrief = messages.find((m) => m.type === "debrief") ?? null;
  }

  assert.ok(debrief, "exam mode should still reach a debrief");
  if (debrief && debrief.type === "debrief") {
    assert.match(debrief.debrief.grade, /^[ABCDF]$/);
    assert.ok(debrief.debrief.tips.length > 0); // coach tips shown after the exam
  }
  server.close();
});

test("logrolling: offering a secondary issue marks it traded in terms_conceded", async () => {
  const { server, waitFor, messages } = harness();

  server.send({ type: "start", scenarioId: "supplier", lang: "ru", mode: "practice" });
  const greeting = await waitFor((m) => m.type === "greeting");
  assert.equal(greeting.type, "greeting");
  if (greeting.type === "greeting") {
    // The scenario view must expose the tradeable secondary issues (label only).
    assert.ok(greeting.scenario.secondary_issues && greeting.scenario.secondary_issues.length === 2);
    const ids = greeting.scenario.secondary_issues!.map((i) => i.id).sort();
    assert.deepEqual(ids, ["annual_contract", "prepay"]);
    // Nothing traded at the start.
    assert.deepEqual(greeting.state.terms_conceded ?? [], []);
  }

  // Offer a trade-off that concedes the annual-contract issue by keyword.
  const before = messages.length;
  server.send({
    type: "turn",
    text: "Если мы пойдём навстречу и подпишем годовой контракт с гарантией объёма, сможете ли вы снизить цену?",
  });
  const opp = await waitFor((m) => messages.indexOf(m) >= before && m.type === "opponent");
  assert.equal(opp.type, "opponent");
  if (opp.type === "opponent") {
    assert.ok(
      (opp.state.terms_conceded ?? []).includes("annual_contract"),
      "the annual contract should be on the table after being offered",
    );
    assert.ok(!(opp.state.terms_conceded ?? []).includes("prepay"), "prepay was not offered yet");
  }

  server.close();
});

test("every built-in scenario now exposes its tradeable secondary issues", async () => {
  const { server, waitFor } = harness();
  server.send({ type: "start", scenarioId: "conflict", lang: "ru", mode: "practice" });
  const greeting = await waitFor((m) => m.type === "greeting");
  if (greeting.type === "greeting") {
    // Parity with the backend: conflict now carries a structured logrolling axis.
    const ids = (greeting.scenario.secondary_issues ?? []).map((i) => i.id).sort();
    assert.deepEqual(ids, ["joint_status", "share_resource"]);
    assert.deepEqual(greeting.state.terms_conceded ?? [], []);
  }
  server.close();
});

test("hint request returns a hint message", async () => {
  const { server, waitFor } = harness();
  server.send({ type: "start", scenarioId: "salary", lang: "en", mode: "practice" });
  await waitFor((m) => m.type === "greeting");
  server.send({ type: "hint" });
  const hint = await waitFor((m) => m.type === "hint");
  assert.equal(hint.type, "hint");
  if (hint.type === "hint") assert.ok(hint.text.length > 0);
  server.close();
});
