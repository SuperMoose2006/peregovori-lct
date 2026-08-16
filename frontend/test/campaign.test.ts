// campaign.test.ts — the "Кампания" (campaign) mode over the mock path:
//  (1) the offline synth produces the full 4-act arc the overview renders, and
//  (2) a stage started in campaign mode WITH a reputation value runs the same
//      greeting → opponent → debrief loop as any other scenario.
import { test } from "node:test";
import assert from "node:assert/strict";
import { MockServer } from "../src/mock/mockServer";
import { synthCampaigns } from "../src/data/campaigns";
import { SCENARIO_MAP } from "../src/data/scenarios";
import type { ServerMsg } from "../src/types";

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

test("offline synth produces the 4-act campaign overview", () => {
  for (const lang of ["ru", "en"] as const) {
    const campaigns = synthCampaigns(lang);
    assert.ok(campaigns.length >= 1, "at least one campaign is synthesized");
    const c = campaigns[0];
    assert.ok(c.title.length > 0);
    assert.ok(c.tagline.length > 0);
    assert.equal(c.stages.length, 4, "the arc has four acts");
    for (const st of c.stages) {
      // Each stage references a real scenario and carries narrative + metadata.
      assert.ok(SCENARIO_MAP[st.scenario_id], `stage references a known scenario (${st.scenario_id})`);
      assert.ok(st.act.length > 0);
      assert.ok(st.intro.length > 0);
      assert.ok(st.title.length > 0);
      assert.ok(st.icon.length > 0);
      assert.equal(typeof st.difficulty, "number");
    }
  }
});

test("campaign stage with reputation → greeting → opponent → debrief", async () => {
  const { server, messages, waitFor } = harness();
  const stage = synthCampaigns("ru")[0].stages[0];

  // Start a campaign act carrying an inbound reputation (as the App does between
  // stages). The mock accepts it as a starting-trust nudge and plays normally.
  server.send({
    type: "start",
    scenarioId: stage.scenario_id,
    lang: "ru",
    mode: "campaign",
    reputation: 40,
  });

  const greeting = await waitFor((m) => m.type === "greeting");
  assert.equal(greeting.type, "greeting");
  if (greeting.type === "greeting") {
    assert.equal(greeting.scenario.id, stage.scenario_id);
    assert.equal(greeting.state.status, "active");
    assert.equal(greeting.state.turn, 0);
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

  assert.ok(debrief, "the campaign stage reaches a debrief");
  if (debrief && debrief.type === "debrief") {
    assert.match(debrief.debrief.grade, /^[ABCDF]$/);
    assert.ok(debrief.debrief.overall >= 0 && debrief.debrief.overall <= 100);
  }

  server.close();
});

test("higher reputation raises the stage's starting trust", async () => {
  // The reputation carry should visibly nudge the opening trust in the mock,
  // demonstrating multi-stage progression (a strong prior act → warmer opponent).
  async function startTrust(reputation: number): Promise<number> {
    const { server, waitFor } = harness();
    server.send({ type: "start", scenarioId: "salary", lang: "ru", mode: "campaign", reputation });
    const g = await waitFor((m) => m.type === "greeting");
    server.close();
    return g.type === "greeting" ? g.state.trust : -1;
  }
  const low = await startTrust(-100);
  const high = await startTrust(100);
  assert.ok(high > low, `reputation carry lifts starting trust (${high} > ${low})`);
});
