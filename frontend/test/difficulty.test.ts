import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DIFFICULTY_MODES, difficultyLabel, difficultyOrdinal, normalizeDifficulty } from "../src/lib/difficulty";
import { DifficultySelect } from "../src/components/DifficultySelect";
import { DifficultyIndicator } from "../src/components/DifficultyIndicator";
import { ADMIN_DRAFT_KEY, adminPreset, loadAdminDraft, saveAdminDraft } from "../src/lib/adminContext";
import { DEFAULT_SCENARIO_CONTEXT } from "../src/lib/scenarioContext";
import { synthCustomScenario } from "../src/mock/customScenario";
import { newSession, resistance, revealTrustGate } from "../src/mock/engine";
import { SCENARIOS, SCENARIO_MAP, toScenarioView } from "../src/data/scenarios";
import { MIRRORS } from "../src/data/mirrors";
import { synthCampaigns } from "../src/data/campaigns";
import { filterCatalog } from "../src/lib/catalogFilter";
import { chooseNextStep, emptyProfile } from "../src/lib/progress";

test("three negotiation IDs stay 1/3/5; both legacy ties choose the middle", () => {
  assert.deepEqual(DIFFICULTY_MODES, [1, 3, 5]);
  for (const [input, expected, ordinal] of [[1, 1, 1], [2, 3, 2], [3, 3, 2], [4, 3, 2], [5, 5, 3]]) {
    assert.equal(normalizeDifficulty(input), expected);
    assert.equal(difficultyOrdinal(input), ordinal);
  }
  assert.equal(normalizeDifficulty(-10), 1);
  assert.equal(normalizeDifficulty(99), 5);
  assert.equal(normalizeDifficulty(1.9), 1);
  assert.equal(normalizeDifficulty(2.1), 3);
  assert.equal(normalizeDifficulty(4.1), 5);
  for (const invalid of [undefined, null, "1", true, false, NaN, Infinity, -Infinity, {}]) {
    assert.equal(normalizeDifficulty(invalid), 3);
  }
});

test("legacy draft reads preserve raw localStorage and every unrelated setting", () => {
  for (const legacy of [2, 4]) {
    const draft = { ...adminPreset("team", "en"), topic: "My retained draft", difficulty: legacy };
    let raw = JSON.stringify(draft);
    const originalRaw = raw;
    const storage = {
      getItem(key: string) { assert.equal(key, ADMIN_DRAFT_KEY); return raw; },
      setItem(_key: string, value: string) { raw = value; },
      removeItem() { raw = ""; },
    };
    assert.deepEqual(loadAdminDraft("en", storage), { ...draft, difficulty: 3 });
    assert.equal(raw, originalRaw, "reading must neither overwrite nor delete the legacy draft");
    assert.equal(saveAdminDraft(draft, storage), true);
    assert.deepEqual(JSON.parse(raw), { ...draft, difficulty: 3 });
    assert.equal(draft.difficulty, legacy, "explicit save must not mutate its input either");
  }
});

test("both forms share exactly three labelled choices and legacy selections resolve", () => {
  for (const lang of ["ru", "en"] as const) for (const [legacy, canonical] of [[2, 3], [4, 3], [5, 5]]) {
    const html = renderToStaticMarkup(createElement(DifficultySelect, {
      lang, value: legacy, onChange() {},
    }));
    assert.deepEqual([...html.matchAll(/<option value="(\d+)"/g)].map(match => Number(match[1])), [1, 3, 5]);
    assert.match(html, new RegExp(`value="${canonical}" selected=""`));
    for (const mode of DIFFICULTY_MODES) assert.ok(html.includes(difficultyLabel(mode, lang)));
    assert.doesNotMatch(html, /\/\s*5/);
  }
});

test("difficulty indicators show three positions while engine IDs remain 1/3/5", () => {
  for (const lang of ["ru", "en"] as const) for (const value of [1, 2, 3, 4, 5]) {
    const html = renderToStaticMarkup(createElement(DifficultyIndicator, { value, lang }));
    assert.equal((html.match(/<i /g) ?? []).length, 3);
    assert.equal((html.match(/class="on"/g) ?? []).length, difficultyOrdinal(value));
    assert.ok(html.includes(`${difficultyOrdinal(value)}/3`));
    assert.ok(html.includes(difficultyLabel(value, lang)));
  }
});

test("legacy custom scenarios and sessions use canonical mechanics without rewriting inputs", () => {
  for (const legacy of [2, 4]) {
    const context = { ...DEFAULT_SCENARIO_CONTEXT, difficulty: legacy };
    assert.equal(synthCustomScenario("Supply contract", "en", context).diff, 3);
    assert.equal(context.difficulty, legacy);
    const raw = { ...SCENARIO_MAP.supplier, diff: legacy };
    const session = newSession(raw, "ru");
    const canonicalSession = newSession({ ...raw, diff: 3 }, "ru");
    assert.equal(session.difficulty, 3);
    assert.equal(toScenarioView(raw, "ru").difficulty, 3);
    assert.equal(raw.diff, legacy);
    // Restored sessions can still carry a raw legacy number after construction.
    session.difficulty = legacy;
    assert.equal(resistance(session), resistance(canonicalSession));
    assert.equal(revealTrustGate(session), revealTrustGate(canonicalSession));
  }
});

test("catalogue filtering partitions legacy data into three modes without mutation", () => {
  const rows = [1, 2, 3, 4, 5].map(difficulty => ({ id: `legacy-${difficulty}`, difficulty, title: "Deal", role: "Buyer", icon: "" }));
  const before = JSON.stringify(rows);
  assert.deepEqual(filterCatalog(rows, "", "all", 1).map(row => row.difficulty), [1]);
  assert.deepEqual(filterCatalog(rows, "", "all", 3).map(row => row.difficulty), [2, 3, 4]);
  assert.deepEqual(filterCatalog(rows, "", "all", 5).map(row => row.difficulty), [5]);
  assert.equal(JSON.stringify(rows), before);
  for (const scenario of [...SCENARIOS, ...MIRRORS]) assert.ok([1, 3, 5].includes(scenario.diff), scenario.id);
  for (const campaign of synthCampaigns("en")) for (const stage of campaign.stages) {
    assert.ok([1, 3, 5].includes(stage.difficulty), stage.scenario_id);
  }
});

test("first-step recommendation compares canonical modes and retains catalogue order on ties", () => {
  const input = { tables: [{ id: "legacy-first", difficulty: 4 }, { id: "canonical-next", difficulty: 3 }],
    campaigns: [], dailyScenarioId: "daily" };
  const before = JSON.stringify(input);
  const pick = chooseNextStep(emptyProfile(), input);
  assert.equal(pick.scenarioId, "legacy-first");
  assert.equal(pick.difficulty, 3);
  assert.equal(JSON.stringify(input), before);
});
