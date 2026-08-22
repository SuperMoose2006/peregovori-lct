// The marker convention, enforced.
//
// A bare `TODO` rots: a week later nobody remembers what was fake or what would
// make it real. So the codebase uses three tags, and every one of them must
// carry BOTH halves — what is not real, and what would make it real. This test
// is the reason the convention survives contact with a deadline.
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const TAG = /\b(STUB|MOCK|CONTRACT)\(([a-z0-9-]+)\)\s*:/g;

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const full = join(dir, e);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|css)$/.test(e)) out.push(full);
  }
  return out;
}

test("every STUB/MOCK/CONTRACT says what is missing AND what makes it real", () => {
  const bad: string[] = [];
  let found = 0;
  for (const file of walk(SRC)) {
    const text = readFileSync(file, "utf8");
    const lines = text.split("\n");
    lines.forEach((line, i) => {
      TAG.lastIndex = 0;
      const m = TAG.exec(line);
      if (!m) return;
      found++;
      // The explanation may run over the following few comment lines.
      const block = lines.slice(i, i + 6).join(" ");
      const saysWhy = /Настоящим станет|Real when|Станет настоящим|станет|when:/i.test(block);
      if (!saysWhy) bad.push(`${file.replace(SRC, "src")}:${i + 1} — ${m[1]}(${m[2]}) has no "what makes it real"`);
    });
  }
  assert.ok(found > 0, "the convention exists, so at least one tag should be present");
  assert.deepEqual(bad, [], bad.join("\n"));
});

test("no bare TODO/FIXME — the convention replaces them", () => {
  const offenders: string[] = [];
  for (const file of walk(SRC)) {
    readFileSync(file, "utf8").split("\n").forEach((line, i) => {
      if (/\b(TODO|FIXME)\b/.test(line) && !/\b(STUB|MOCK|CONTRACT)\(/.test(line)) {
        offenders.push(`${file.replace(SRC, "src")}:${i + 1}`);
      }
    });
  }
  assert.deepEqual(offenders, [], `use STUB()/MOCK()/CONTRACT() instead:\n${offenders.join("\n")}`);
});
