import test from "node:test";
import assert from "node:assert/strict";
import { ADMIN_DRAFT_KEY, DOMAINS, adminPreset, adminPreviewIsCurrent, loadAdminDraft, saveAdminDraft, translateAdminPreset, validAdminDraft, type AdminPreview } from "../src/lib/adminContext";

test("every bilingual preset can configure a real scenario", () => {
  for (const lang of ["ru", "en"] as const) for (const domain of DOMAINS) {
    assert.equal(validAdminDraft(adminPreset(domain, lang)), true);
  }
});
test("invalid and corrupt persisted drafts cannot replace usable defaults", () => {
  for (const value of ["{bad", "null", JSON.stringify({ ...adminPreset("career", "ru"), difficulty: 9 }), JSON.stringify({ ...adminPreset("career", "ru"), unexpected: "value" }), "x".repeat(5000)]) {
    assert.equal(loadAdminDraft("ru", { getItem: () => value }).domain, "procurement");
  }
  assert.equal(loadAdminDraft("en", { getItem: () => { throw new Error("denied"); } }).domain, "procurement");
});
test("saved settings round trip and storage failure is visible", () => {
  let saved = "";
  const draft = adminPreset("team", "en");
  assert.equal(saveAdminDraft(draft, { setItem: (key, value) => { assert.equal(key, ADMIN_DRAFT_KEY); saved = value; } }), true);
  assert.deepEqual(loadAdminDraft("en", { getItem: () => saved }), draft);
  assert.equal(saveAdminDraft(draft, { setItem: () => { throw new Error("full"); } }), false);
});
test("switching language translates untouched presets while preserving custom settings", () => {
  for (const domain of DOMAINS) {
    const ru = adminPreset(domain, "ru"), en = adminPreset(domain, "en");
    assert.deepEqual(translateAdminPreset(ru, "ru", "en"), en);
    assert.deepEqual(translateAdminPreset(en, "en", "ru"), ru);
    for (const patch of [{ topic: "My own meeting" }, { opponentRole: "My own role" }, { difficulty: ru.difficulty === 5 ? 4 : 5 }, { tone: ru.tone === "firm" ? "analytical" : "firm" }]) {
      const edited = { ...ru, ...patch } as typeof ru;
      assert.equal(translateAdminPreset(edited, "ru", "en"), edited);
    }
  }
});
test("a preview cannot launch after any setting or language changes", () => {
  const draft = adminPreset("procurement", "ru");
  const result = { context: { ...draft, lang: "ru" } } as AdminPreview;
  assert.equal(adminPreviewIsCurrent(result, draft, "ru"), true);
  for (const patch of [{ topic: "Другой контекст" }, { domain: "team" }, { difficulty: 5 }, { tone: "firm" }, { opponentRole: "Директор" }, { opponentGoals: ["timing"] }] as const) {
    assert.equal(adminPreviewIsCurrent(result, { ...draft, ...patch } as typeof draft, "ru"), false);
  }
  assert.equal(adminPreviewIsCurrent(result, draft, "en"), false);
  assert.equal(adminPreviewIsCurrent(null, draft, "ru"), false);
});
