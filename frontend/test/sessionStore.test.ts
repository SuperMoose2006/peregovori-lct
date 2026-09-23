import test from "node:test";
import assert from "node:assert/strict";
import { createSessionStore } from "../src/api/sessionStore";
import { initialState, reduce } from "../src/api/useNegotiation";
import type { StateView } from "../src/types";
import type { Transport } from "../src/api/transport";
import { applyDebrief, emptyProfile, recordCampaignStage } from "../src/lib/progress";

const active = () => createSessionStore({ ...initialState, state: { status: "active", turn: 0 } as StateView });

test("render subscriptions and repeated snapshots cannot resend a command", () => {
  const store = active();
  const sent: unknown[] = [];
  const transport: Transport = { send: (msg) => { sent.push(msg); }, close() {} };
  const unsubscribe = store.subscribe(() => { store.getSnapshot(); store.getSnapshot(); });
  assert.equal(store.turn("hello", transport), true);
  for (let i = 0; i < 10; i++) store.getSnapshot();
  unsubscribe();
  store.subscribe(() => store.getSnapshot());
  assert.deepEqual(sent, [{ type: "turn", text: "hello" }]);
  assert.equal(store.turn("double click", transport), false);
  assert.equal(sent.length, 1);
  assert.equal(store.getSnapshot().log.length, 1);
});

test("a synchronously emitted offline analysis attaches to the accepted line", () => {
  const store = active();
  const analysis = { tags: ["empathy"], primary: "empathy", arg_quality: 50 } as never;
  const transport: Transport = { close() {}, send() {
    store.update((p) => reduce(p, { type: "analysis", analysis }, store.nextId));
  } };
  store.turn("I understand", transport);
  const line = store.getSnapshot().log[0];
  assert.equal(line.kind, "me");
  assert.equal(line.kind === "me" && line.analysis, analysis);
});

test("connecting/reconnecting/lost refuse moves and hints without modifying the log", () => {
  for (const conn of ["connecting", "reconnecting", "lost"] as const) {
    const store = active();
    store.update((p) => ({ ...p, conn }));
    const transport: Transport = { send() { assert.fail("must not send offline"); }, close() {} };
    assert.equal(store.turn("keep my draft", transport), false);
    assert.equal(store.hint(transport), false);
    assert.deepEqual(store.getSnapshot().log, []);
    assert.equal(store.getSnapshot().busy, false);
  }
});

test("a socket that closes during send rejects the draft and rolls back its placeholder", () => {
  for (const fail of [() => false, () => { throw new Error("socket closed"); }]) {
    const store = active();
    assert.equal(store.turn("keep my draft", { send: fail, close() {} }), false);
    assert.deepEqual(store.getSnapshot().log, []);
    assert.equal(store.getSnapshot().busy, false);
    assert.equal(store.getSnapshot().conn, "lost");
  }
});

test("hint requests are sent once and synchronous answers replace the pending entry", () => {
  const store = active();
  let requests = 0;
  const transport: Transport = { close() {}, send() { requests++; } };
  assert.equal(store.hint(transport), true);
  assert.equal(store.hint(transport), false);
  assert.equal(requests, 1);
  store.update((p) => reduce(p, { type: "hint", text: "Ask why" }, store.nextId));
  assert.equal(store.getSnapshot().log.length, 1);
  const other = active();
  other.hint({ close() {}, send() {
    other.update((p) => reduce(p, { type: "hint", text: "Ask why" }, other.nextId));
  } });
  assert.deepEqual(other.getSnapshot().log.map((e) => e.kind === "hint" && e.pending), [false]);
});

test("an unanswered probe blocks transport actions, including hints", () => {
  const store = active();
  store.update((p) => ({ ...p, log: [{ id: 1, kind: "probe", turn: 1, options: [], answer: 0 }] }));
  const transport: Transport = { send() { assert.fail("probe must be answered first"); }, close() {} };
  assert.equal(store.turn("bypass", transport), false);
  assert.equal(store.hint(transport), false);
});

test("a dropped pending hint is cleared and can be retried after resume", () => {
  const store = active();
  let sent = 0;
  const transport: Transport = { send() { sent++; }, close() {} };
  assert.equal(store.hint(transport), true);
  store.connection("reconnecting");
  assert.deepEqual(store.getSnapshot().log, []);
  assert.equal(store.hint(transport), false);
  store.connection("online");
  assert.equal(store.hint(transport), true);
  assert.equal(sent, 2);
  store.update((p) => reduce(p, { type: "hint", text: "Recovered hint" }, store.nextId));
  assert.equal(store.getSnapshot().log.length, 1);
  assert.equal(store.getSnapshot().log[0].text, "Recovered hint");
});

test("a retransmitted final scorecard cannot award XP, history or a campaign stage twice", () => {
  const store = active();
  const debrief = { overall: 60, grade: "C", economic: 60, relationship: 60,
    technique: 60, deal_text: "", status: "deal", interests_found: 0,
    interests_total: 3, spin_stages: 0, objective_criteria: 0, empathy: 0,
    threats: 0, tradeoffs: 0, avg_arg: 50, tips: [] } as const;
  let profile = emptyProfile();
  let recorded = store.getSnapshot().debrief;
  let history = 0;
  store.subscribe(() => {
    const final = store.getSnapshot().debrief;
    if (!final || final === recorded) return;
    recorded = final;
    profile = applyDebrief(profile, "supplier", final).profile;
    profile = recordCampaignStage(profile, "arc", 4, final.grade, final.overall);
    history++;
  });
  const deliver = () => store.update((p) => reduce(p, {
    type: "debrief", debrief: JSON.parse(JSON.stringify(debrief)),
  }, store.nextId));
  deliver();
  const once = profile;
  store.connection("reconnecting");
  store.connection("online");
  deliver();
  assert.equal(profile, once);
  assert.equal(history, 1);
  assert.equal(profile.scenarios.supplier.attempts, 1);
  assert.equal(profile.campaigns.arc.stageIndex, 1);
  store.update(() => ({ ...initialState }));
  deliver();
  assert.equal(history, 2, "a new game with the same score must count independently");
  assert.equal(profile.scenarios.supplier.attempts, 2);
});
