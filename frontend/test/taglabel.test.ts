// Both engines hardcode tag labels in one language — the Python engine in
// English, the offline mock in Russian — so a Russian session showed "Probing
// interests" and an English one showed "Объективный критерий". The client
// localizes from the stable `key` instead; these lock that in.
import test from "node:test";
import assert from "node:assert/strict";
import { tagText } from "../src/lib/tagLabel";
import { I18N } from "../src/i18n";
import type { Analysis } from "../src/types";

const base: Analysis = { tags: [], primary: "", arg_quality: 0, spin: null, flags: {} } as Analysis;

test("a tag is localized from its key, whatever the engine called it", () => {
  const t = { key: "interests", label: "Probing interests" };
  assert.equal(tagText(t, base, I18N.ru.tagLabels), "Вскрытие интересов");
  assert.equal(tagText(t, base, I18N.en.tagLabels), "Probing interests");

  const crit = { key: "criteria", label: "Объективный критерий" };
  assert.equal(tagText(crit, base, I18N.en.tagLabels), "Objective criteria");
});

test("the shared `spin` key resolves through the analysis stage", () => {
  const t = { key: "spin", label: "SPIN · Implication" };
  assert.equal(tagText(t, { ...base, spin: "implication" }, I18N.ru.tagLabels), "SPIN · Последствия");
  assert.equal(tagText(t, { ...base, spin: "problem" }, I18N.ru.tagLabels), "SPIN · Проблема");
  // No stage: the engine tagged a plain open question with the same key.
  assert.equal(tagText(t, base, I18N.ru.tagLabels), "Открытый вопрос");
});

test("an unknown key falls back to whatever the engine sent", () => {
  const t = { key: "brand-new-move", label: "Something new" };
  assert.equal(tagText(t, base, I18N.ru.tagLabels), "Something new");
});
