// avatar.test.ts — the parametric portrait system renders (server-side, no DOM)
// for every known scenario id and for an unknown/custom id (the default), and the
// mood mapping matches the deterministic meter thresholds — with exam pinned to a
// fixed neutral so a hidden meter can never leak through the face.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Avatar, avatarMood, AVATAR_CONFIG, type Mood } from "../src/components/Avatar";
import type { StateView } from "../src/types";

const KNOWN = ["supplier", "salary", "conflict", "investor", "rent", "used_car", "freelance_rate", "sla_renewal"];
const MOODS: Mood[] = ["warm", "neutral", "wary", "angry"];

test("every known scenario id has a distinct avatar config", () => {
  for (const id of KNOWN) assert.ok(AVATAR_CONFIG[id], `config for ${id}`);
  assert.equal(Object.keys(AVATAR_CONFIG).length, KNOWN.length);
  // Distinctness: no two personas share the exact same (skin, hair, style, collar).
  const sigs = KNOWN.map((id) => {
    const c = AVATAR_CONFIG[id];
    return `${c.skin}|${c.hair}|${c.style}|${c.collar}`;
  });
  assert.equal(new Set(sigs).size, KNOWN.length, "each of the 8 reads as a different person");
});

test("Avatar renders an <svg> for each known id in every mood", () => {
  for (const id of KNOWN) {
    for (const mood of MOODS) {
      const html = renderToStaticMarkup(createElement(Avatar, { scenarioId: id, mood }));
      assert.match(html, /<svg[\s>]/, `${id}/${mood} renders svg`);
      assert.match(html, /<path|<ellipse|<line/, `${id}/${mood} draws features`);
    }
  }
});

test("unknown/custom scenario id falls back to the default avatar (no crash)", () => {
  const html = renderToStaticMarkup(createElement(Avatar, { scenarioId: "custom-abc123", mood: "neutral" }));
  assert.match(html, /<svg[\s>]/);
});

function mkState(trust: number, tension: number): StateView {
  return { trust, tension } as unknown as StateView;
}

test("avatarMood matches the meter thresholds", () => {
  assert.equal(avatarMood(mkState(50, 80), false), "angry"); // tension > 70
  assert.equal(avatarMood(mkState(90, 50), false), "wary"); // tension > 45
  assert.equal(avatarMood(mkState(80, 20), false), "warm"); // trust > 65
  assert.equal(avatarMood(mkState(40, 20), false), "neutral");
  assert.equal(avatarMood(null, false), "neutral");
});

test("exam mode pins a fixed neutral expression (meters hidden → no leak)", () => {
  // Even a state that would otherwise read angry/warm must stay neutral in exam.
  assert.equal(avatarMood(mkState(90, 95), true), "neutral");
  assert.equal(avatarMood(mkState(90, 10), true), "neutral");
  assert.equal(avatarMood(mkState(10, 90), true), "neutral");
});
