import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CustomSituation } from "../src/components/CustomSituation";
import { I18N } from "../src/i18n";
import { DEFAULT_SCENARIO_CONTEXT } from "../src/lib/scenarioContext";
import { synthCustomScenario } from "../src/mock/customScenario";
import { newSession, analyze, applyMove } from "../src/mock/engine";

const context = { ...DEFAULT_SCENARIO_CONTEXT, sector: "Manufacturing", topic: "Annual supply",
  opponent_role: "Factory director", opponent_goal: "Keep order volume", difficulty: 5, style: "tough" as const };

test("facilitator settings are labelled in both languages and bounded", () => {
  for (const lang of ["ru", "en"] as const) {
    const t = I18N[lang];
    const html = renderToStaticMarkup(createElement(CustomSituation, {
      t, lang, value: "Discuss the contract", error: null, onChange() {}, onGenerate() {},
      context, onContextChange() {},
    }));
    for (const label of [t.custom.context.head, t.custom.context.sector, t.custom.context.topic,
      t.custom.context.opponent_role, t.custom.context.opponent_goal,
      t.custom.context.difficulty, t.custom.context.style]) assert.ok(html.includes(label));
    assert.equal((html.match(/<label>/g) ?? []).length, 6);
    assert.match(html, /maxLength="1500"/);
    assert.match(html, /maxLength="240"/);
    assert.match(html, /value="5" selected=""/);
    assert.match(html, /value="tough" selected=""/);
    const difficultySelect = html.match(/<select[^>]*>([\s\S]*?)<\/select>/)?.[1] ?? "";
    assert.deepEqual([...difficultySelect.matchAll(/value="(\d+)"/g)].map(match => Number(match[1])), [1, 3, 5]);
  }
});

test("offline context changes the real scenario and stays playable", () => {
  const scenario = synthCustomScenario("Discuss a contract", "en", context);
  assert.equal(scenario.diff, 5);
  assert.equal(scenario.cp.style, "tough");
  assert.equal(scenario.title.en, context.topic);
  assert.ok(scenario.cp.ps.en.includes(context.opponent_role));
  assert.ok(scenario.cp.ps.en.includes(context.opponent_goal));
  assert.ok(scenario.brief.en.includes(context.sector));
  const session = newSession(scenario, "en");
  const line = "Hello, what matters most to you about the budget?";
  session.turn++;
  applyMove(session, analyze(line), line);
  assert.equal(session.status, "active");
  assert.ok(Number.isFinite(session.trust));
});
