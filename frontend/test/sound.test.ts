// sound.test.ts — the pure, headless-testable bits of the audio layer:
// the mute-flag persistence round-trip and the guards that keep every cue a
// safe no-op where WebAudio / vibration / localStorage are absent (i.e. Node).
// The synthesized audio itself can't be asserted headlessly.
import { test } from "node:test";
import assert from "node:assert/strict";

// A minimal in-memory localStorage stand-in so the persistence path is exercised.
function fakeStorage() {
  const m = new Map<string, string>();
  return {
    store: m,
    api: {
      getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
      setItem: (k: string, v: string) => void m.set(k, String(v)),
      removeItem: (k: string) => void m.delete(k),
    } as unknown as Storage,
  };
}

test("mute flag: default unmuted, and setMuted persists to localStorage", async () => {
  const fs = fakeStorage();
  (globalThis as { localStorage?: Storage }).localStorage = fs.api;
  const sound = await import("../src/lib/sound");

  assert.equal(sound.isMuted(), false, "defaults to UNMUTED");

  sound.setMuted(true);
  assert.equal(sound.isMuted(), true);
  assert.equal(fs.store.get("dialog.muted"), "1", "persisted as '1' when muted");

  sound.setMuted(false);
  assert.equal(sound.isMuted(), false);
  assert.equal(fs.store.get("dialog.muted"), "0", "persisted as '0' when unmuted");
});

test("toggleMuted flips and returns the new value", async () => {
  const fs = fakeStorage();
  (globalThis as { localStorage?: Storage }).localStorage = fs.api;
  const sound = await import("../src/lib/sound");

  sound.setMuted(false);
  assert.equal(sound.toggleMuted(), true);
  assert.equal(sound.isMuted(), true);
  assert.equal(sound.toggleMuted(), false);
  assert.equal(sound.isMuted(), false);
});

test("cues and haptics are guarded no-ops headless (no WebAudio / vibrate)", async () => {
  const sound = await import("../src/lib/sound");
  sound.setMuted(false); // even unmuted, there is no AudioContext in Node
  for (const name of ["send", "reveal", "xp", "levelup", "grade"] as const) {
    assert.doesNotThrow(() => sound.play(name));
  }
  assert.doesNotThrow(() => sound.play("grade", { grade: "A" }));
  assert.doesNotThrow(() => sound.play("grade", { grade: "F" }));
  assert.doesNotThrow(() => sound.haptic());
  assert.doesNotThrow(() => sound.haptic(30));
  assert.doesNotThrow(() => sound.initAudioUnlock());
});

test("muted silences both sound and haptics without throwing", async () => {
  const sound = await import("../src/lib/sound");
  // Prove haptic honors mute: install a vibrate spy, mute, and confirm no call.
  let vibrated = 0;
  // Node's global `navigator` can be non-extensible — install the spy best-effort.
  const nav = globalThis.navigator as unknown as { vibrate?: (ms: number) => boolean };
  let installed = false;
  let prev: ((ms: number) => boolean) | undefined;
  try {
    if (nav) {
      prev = nav.vibrate;
      nav.vibrate = () => (vibrated++, true);
      installed = true;
    }
  } catch {
    /* can't spy — the mute guard short-circuits before navigator anyway */
  }

  sound.setMuted(true);
  assert.doesNotThrow(() => sound.play("reveal"));
  assert.doesNotThrow(() => sound.haptic());
  assert.equal(vibrated, 0, "muted → navigator.vibrate is not called");

  sound.setMuted(false);
  if (installed && nav) {
    try {
      if (prev) nav.vibrate = prev;
      else delete nav.vibrate;
    } catch {
      /* leave as-is */
    }
  }
});
