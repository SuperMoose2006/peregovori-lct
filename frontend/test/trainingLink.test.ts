// trainingLink.test.ts — тренировка из редактора передаётся ссылкой (CE-03).
import test from "node:test";
import assert from "node:assert/strict";
import { adminPreset } from "../src/lib/adminContext";
import { readTrainingLink, trainingLink } from "../src/lib/trainingLink";

test("ссылка несёт настройки тренировки и читается обратно, кириллица цела", () => {
  const draft = { ...adminPreset("career", "ru"), topic: "Зарплата «senior» в оффере — 250 000 ₽" };
  const url = trainingLink(draft, "ru", "https://dialog.example/");
  assert.ok(url.startsWith("https://dialog.example/?training="), url);
  const back = readTrainingLink(new URL(url).search);
  assert.deepEqual(back, { draft, lang: "ru" });
});

test("чужая или испорченная ссылка не запускает ничего", () => {
  for (const search of ["", "?training=", "?training=@@@", "?training=" + "A".repeat(3000),
                        "?training=" + Buffer.from(JSON.stringify({ domain: "hack", topic: "x" })).toString("base64url"),
                        "?training=" + Buffer.from("{not json").toString("base64url")]) {
    assert.equal(readTrainingLink(search), null, search.slice(0, 40));
  }
});

test("редактор больше не обещает «ссылки пока нет»", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../src/components/AdminScenarioScreen.tsx", import.meta.url), "utf-8");
  assert.doesNotMatch(src, /ссылки и экспорта сценария пока нет|no share link or export yet/);
  assert.match(src, /trainingLink\(/);
});
