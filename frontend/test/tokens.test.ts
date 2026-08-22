// Guard against the failure mode that just cost us the coach button: a CSS
// custom property that is USED but never DECLARED. `var(--bg)` silently
// resolved to the inherited value, so a brass label sat on a brass pill and the
// whole feature was invisible — no error, no warning, nothing in the build.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const CSS = join(SRC, "styles.css");

/** .tsx files may declare a token inline (`["--p"]: value` in a style object) —
 *  the ring's fill percentage is set that way — so those count as declared. */
function inlineDeclared(dir: string, into: Set<string>): Set<string> {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) inlineDeclared(full, into);
    else if (e.name.endsWith(".tsx") || e.name.endsWith(".ts")) {
      for (const m of readFileSync(full, "utf8").matchAll(/["'](--[a-z0-9-]+)["']/gi)) {
        into.add(m[1]);
      }
    }
  }
  return into;
}

test("every var(--token) used in styles.css is declared somewhere", () => {
  const css = readFileSync(CSS, "utf8");
  const declared = new Set(
    [...css.matchAll(/(^|[;{\s])(--[a-z0-9-]+)\s*:/gi)].map((m) => m[2]),
  );
  inlineDeclared(SRC, declared);
  // Second capture group of var(--x, fallback) is a fallback, not a usage.
  const used = new Set([...css.matchAll(/var\(\s*(--[a-z0-9-]+)/gi)].map((m) => m[1]));
  const missing = [...used].filter((t) => !declared.has(t)).sort();
  assert.deepEqual(missing, [], `undeclared CSS custom properties: ${missing.join(", ")}`);
});
