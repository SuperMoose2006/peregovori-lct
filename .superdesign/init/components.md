# components.md — shared UI primitives

**Stack:** React 18 + TypeScript + Vite. **No component library, no Tailwind, no CSS-in-JS.**
Every component is hand-written and styled by semantic class names against a single
global stylesheet (`src/styles.css`) driven entirely by CSS custom properties.

Consequences for design work:
- There is no `Button`/`Card`/`Input` primitive to reuse — the vocabulary is CSS classes
  (`.primary`, `.card`, `.panel`, `.chat`, `.bub`, `.meters`, …). See `theme.md`.
- Restyling is done by overriding tokens, not by editing components. Two skins already
  ship this way (`data-skin="game"` beside `data-theme="light|dark"`).
- All user-facing copy is bilingual RU/EN and comes from `src/i18n.ts` — never hardcode
  strings into a component.

---

## Avatar

- **Path:** `frontend/src/components/Avatar.tsx`
- Parametric SVG portrait of the counterpart; expression reacts to live trust/tension.

```tsx
// Avatar.tsx — parametric flat-illustration portraits for the 8 counterparts.
// Why: the opponent card used to swap a single generic emoji by mood — the
// cheapest-feeling surface in the app. Here every scenario id maps to a distinct
// person (skin/hair/face-shape/one signature accessory), while the EXPRESSION is
// driven purely by mood (eyebrows + mouth) so the same portrait animates smoothly
// as the deterministic trust/tension meters move. All inline SVG — CSP-safe, no
// external assets — and colors are muted to sit inside the brass/serif identity.
import type { StateView } from "../types";

export type Mood = "warm" | "neutral" | "wary" | "angry";

// The SAME thresholds the old `moodFace` used, kept in one place. Exam hides the
// meters, so the face must not leak the live read → fixed neutral there.
export function avatarMood(st: StateView | null, exam: boolean): Mood {
  if (exam || !st) return "neutral";
  if (st.tension > 70) return "angry";
  if (st.tension > 45) return "wary";
  if (st.trust > 65) return "warm";
  return "neutral";
}

type HairStyle = "bob" | "updo" | "sidepart" | "buzz" | "receding" | "curly";
type Beard = "full" | "stubble";

interface AvatarConfig {
  skin: string;
  hair: string;
  brow: string;
  style: HairStyle;
  collar: string;
  // face geometry (subtle rounder/longer variation so silhouettes differ)
  rx: number;
  ry: number;
  glasses?: boolean;
  tie?: string;
  earrings?: boolean;
  beard?: Beard;
}

// Muted, lamplit palette — warm skins, desaturated hair, dusk-toned clothing.
// Deliberately NOT bright primaries (would fight the brass/serif identity).
const SKIN = {
  fair: "#e6c3a4", light: "#dcae8b", medium: "#c99a70", tan: "#b6875b", olive: "#cda884",
};
const HAIR = {
  auburn: "#8a4a30", darkbrown: "#4a382c", black: "#2b2521", blonde: "#b1904f",
  silver: "#b8b2a6", grey: "#8c877e", brown: "#5b4331",
};

// One entry per scenario id. Ordered to make the 8 read as 8 different people:
// gender cues (hair + earrings), 5 skin tones, 6 hair styles, and a distinct
// signature accessory each (earrings / glasses / tie / beard / open collar).
export const AVATAR_CONFIG: Record<string, AvatarConfig> = {
  // Ирина — Head of Sales, relationship: warm, auburn bob, earrings, teal collar.
  supplier: { skin: SKIN.fair, hair: HAIR.auburn, brow: "#6f3a26", style: "bob",
    collar: "#4a6d6a", rx: 12.4, ry: 14.4, earrings: true },
  // Дмитрий — Hiring Director, analytical: glasses + navy tie, neat side part.
  salary: { skin: SKIN.medium, hair: HAIR.darkbrown, brow: "#3a2c22", style: "sidepart",
    collar: "#39445a", rx: 12.2, ry: 14.8, glasses: true, tie: "#2d3b57" },
  // Алексей — Partner Lead, tough: strong jaw, dark buzz, stubble, grey collar.
  conflict: { skin: SKIN.light, hair: HAIR.black, brow: "#241f1b", style: "buzz",
    collar: "#54575e", rx: 13, ry: 14.2, beard: "stubble" },
  // Марина — VC Partner, analytical: blonde updo, glasses, plum collar.
  investor: { skin: SKIN.fair, hair: HAIR.blonde, brow: "#87652f", style: "updo",
    collar: "#5f4a5c", rx: 12, ry: 14.4, glasses: true, earrings: true },
  // Наталья — Landlady, relationship (older): silver bob, earrings, mauve collar.
  rent: { skin: SKIN.olive, hair: HAIR.silver, brow: "#8f8578", style: "bob",
    collar: "#7a5c5f", rx: 12.6, ry: 14.2, earrings: true },
  // Sergey — used-car seller, tough: tan skin, full beard, open denim collar.
  used_car: { skin: SKIN.tan, hair: HAIR.darkbrown, brow: "#33271d", style: "sidepart",
    collar: "#48586a", rx: 13, ry: 14, beard: "full" },
  // Pavel — startup founder, analytical/casual: curly brown hair, glasses.
  freelance_rate: { skin: SKIN.light, hair: HAIR.brown, brow: "#43301f", style: "curly",
    collar: "#5c5f4a", rx: 12.2, ry: 14.6, glasses: true },
  // Viktor — vendor account exec, tough: receding grey, dark tie, charcoal collar.
  sla_renewal: { skin: SKIN.medium, hair: HAIR.grey, brow: "#5f5a52", style: "receding",
    collar: "#40434a", rx: 12.4, ry: 15, tie: "#33363d" },
};

// Unknown / custom "Своя сделка" ids (generated) → a pleasant neutral default.
const DEFAULT_CONFIG: AvatarConfig = {
  skin: SKIN.medium, hair: HAIR.brown, brow: "#43301f", style: "sidepart",
  collar: "#55585f", rx: 12.4, ry: 14.5,
};

// Hair silhouettes. `back` (behind the head) gives long styles their volume;
// `front` is the hairline/fringe drawn over the forehead. Head is cx32 cy33.
function hairPaths(style: HairStyle): { back?: string; front: string } {
  switch (style) {
    case "bob":
      return {
        back: "M17 33 Q16 15 32 15 Q48 15 47 33 Q47 46 44 47 L44 30 Q42 25 32 25 Q22 25 20 30 L20 47 Q17 46 17 33 Z",
        front: "M19 32 Q19 16 32 16 Q45 16 45 32 Q44 24 39 23 Q37 27 32 27 Q26 27 25 23 Q20 24 19 32 Z",
      };
    case "updo":
      return {
        back: "M25 18 Q25 10 32 10 Q39 10 39 18 Q39 25 32 25 Q25 25 25 18 Z",
        front: "M20 32 Q20 17 32 17 Q44 17 44 32 Q43 24 38 23 Q35 26 32 26 Q29 26 26 23 Q21 24 20 32 Z",
      };
    case "sidepart":
      return {
        front: "M19 32 Q19 17 32 17 Q45 17 45 32 Q44 24 38 23 Q37 26 33 26 Q31 22 29 24 Q26 24 24 23 Q20 25 19 32 Z",
      };
    case "buzz":
      return {
        front: "M21 31 Q21 19 32 19 Q43 19 43 31 Q42 25 38 24 Q35 26 32 26 Q29 26 26 24 Q22 25 21 31 Z",
      };
    case "receding":
      return {
        front: "M23 31 Q23 21 32 21 Q41 21 41 31 Q40 26 37 25 Q34 28 32 24 Q30 28 27 25 Q24 26 23 31 Z",
      };
    case "curly":
      return {
        front: "M19 32 Q17 25 21 22 Q22 17 27 19 Q29 15 33 18 Q39 15 42 20 Q47 24 45 32 Q44 27 40 26 Q40 22 36 24 Q34 20 30 23 Q26 21 24 26 Q20 27 19 32 Z",
      };
  }
}

// Expression = eyebrows + mouth only. Eyes at (26.5,35) & (37.5,35). Eyebrow
// baseline ~30.5; inner ends toward center. Same portrait, four faces.
interface Expr {
  browInner: number; // y of the inner (toward-nose) eyebrow end
  browOuter: number; // y of the outer eyebrow end
  mouth: string; // stroked path
}
const EXPR: Record<Mood, Expr> = {
  warm: { browInner: 30, browOuter: 31, mouth: "M26 42.5 Q32 49.5 38 42.5" },
  neutral: { browInner: 30.5, browOuter: 30.5, mouth: "M27.5 44 L36.5 44" },
  wary: { browInner: 28.3, browOuter: 31.4, mouth: "M27.5 45.6 Q32 42.8 36.5 45.6" },
  angry: { browInner: 33, browOuter: 28.6, mouth: "M26 47 Q32 40.3 38 47" },
};

interface Props {
  scenarioId: string;
  mood: Mood;
  /** px size; defaults to filling its container (100%). */
  size?: number;
  label?: string;
}

export function Avatar({ scenarioId, mood, size, label }: Props) {
  const c = AVATAR_CONFIG[scenarioId] ?? DEFAULT_CONFIG;
  const hair = hairPaths(c.style);
  const e = EXPR[mood];
  const dim = size ? { width: size, height: size } : undefined;

  return (
    <svg
      className="av-svg"
      viewBox="0 0 64 64"
      style={dim}
      role="img"
      aria-label={label ?? "Counterpart portrait"}
    >
      {/* Lamplit halo behind the head — theme-aware (token-based), ties the
          portrait to the brass identity and reads on light & dark panels. */}
      <rect x="0" y="0" width="64" height="64" rx="12" fill="var(--panel-2)" />
      <ellipse cx="32" cy="30" rx="24" ry="24" fill="var(--brass-soft)" opacity="0.13" />

      {/* shoulders + collar (clothing colour is a per-persona differentiator) */}
      <rect x="28.5" y="45" width="7" height="9" fill={c.skin} />
      <path d="M11 64 Q11 53 22 51 L26 49 Q32 54 38 49 L42 51 Q53 53 53 64 Z" fill={c.collar} />
      {c.tie ? (
        <>
          <path d="M30.4 50.5 h3.2 l-0.4 2 h-2.4 Z" fill={c.tie} />
          <path d="M31 52.5 h2 L34 62 L32 64 L30 62 Z" fill={c.tie} />
        </>
      ) : null}

      {/* back hair (long styles) */}
      {hair.back ? <path d={hair.back} fill={c.hair} /> : null}

      {/* ears + optional earrings, then the head */}
      <circle cx="19.6" cy="35" r="2.2" fill={c.skin} />
      <circle cx="44.4" cy="35" r="2.2" fill={c.skin} />
      {c.earrings ? (
        <>
          <circle cx="19.6" cy="38.4" r="1.1" fill="var(--brass)" />
          <circle cx="44.4" cy="38.4" r="1.1" fill="var(--brass)" />
        </>
      ) : null}
      <ellipse cx="32" cy="33" rx={c.rx} ry={c.ry} fill={c.skin} />

      {/* front hair over the forehead */}
      <path d={hair.front} fill={c.hair} />

      {/* beard (drawn over the lower face; mouth sits on top) */}
      {c.beard ? (
        <path
          d="M21 33 Q21 50 32 51 Q43 50 43 33 Q43 42 38 45 Q35 47 32 47 Q29 47 26 45 Q21 42 21 33 Z"
          fill={c.hair}
          opacity={c.beard === "stubble" ? 0.32 : 1}
        />
      ) : null}

      {/* nose (subtle) */}
      <path d="M32 37.5 L30.8 41 Q32 41.9 33.2 41.3" fill="none" stroke="rgba(80,52,34,0.34)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />

      {/* ---- expression: keyed by mood so React remounts it → a soft CSS fade
             (disabled under prefers-reduced-motion). Eyebrows + mouth only. ---- */}
      <g className="av-exp" key={mood}>
        <line x1="22.5" y1={e.browOuter} x2="30.5" y2={e.browInner} stroke={c.brow} strokeWidth="1.6" strokeLinecap="round" />
        <line x1="41.5" y1={e.browOuter} x2="33.5" y2={e.browInner} stroke={c.brow} strokeWidth="1.6" strokeLinecap="round" />
        <ellipse cx="26.5" cy="35" rx="1.5" ry="2" fill="#2b2521" />
        <ellipse cx="37.5" cy="35" rx="1.5" ry="2" fill="#2b2521" />
        <path d={e.mouth} fill="none" stroke="#7d4536" strokeWidth="1.7" strokeLinecap="round" />
      </g>

      {/* glasses last (over eyes) */}
      {c.glasses ? (
        <g fill="none" stroke={c.brow} strokeWidth="1.3" opacity="0.9">
          <rect x="22.4" y="31.6" width="8.2" height="6.4" rx="3" />
          <rect x="33.4" y="31.6" width="8.2" height="6.4" rx="3" />
          <line x1="30.6" y1="34" x2="33.4" y2="34" />
          <line x1="22.4" y1="34" x2="19.8" y2="34.6" />
          <line x1="41.6" y1="34" x2="44.2" y2="34.6" />
        </g>
      ) : null}
    </svg>
  );
}

```

---

## Meters

- **Path:** `frontend/src/components/Meters.tsx`
- The four negotiation meters (trust/tension/info/leverage) as labelled bars.

```tsx
// Meters.tsx — the four live negotiation meters with animated bars.
// Each meter is keyboard-focusable and carries a one-line tooltip (title + aria)
// explaining what it means and what moves it. The meter that changed most on the
// latest turn gets a one-shot pulse (keyed on `turn` so it replays each round).
import type { Deltas, StateView } from "../types";
import type { MeterLabels } from "../i18n";

type MeterKey = "trust" | "tension" | "info" | "leverage";
const ORDER: MeterKey[] = ["trust", "tension", "info", "leverage"];

interface Props {
  state: StateView;
  labels: MeterLabels;
  // one-line explanations, shown on hover/focus (optional; falls back to label)
  info?: MeterLabels;
  // last turn's deltas — used only to pulse the meter that moved most
  deltas?: Deltas | null;
}

// Which meter moved most this turn (for the settle/pulse cue). Null if the
// change is negligible, so a quiet turn doesn't flash anything.
function loudestKey(deltas?: Deltas | null): MeterKey | null {
  if (!deltas) return null;
  let best: MeterKey | null = null;
  let mag = 0.5; // ignore sub-half nudges
  for (const k of ORDER) {
    const m = Math.abs(deltas[k]);
    if (m > mag) {
      mag = m;
      best = k;
    }
  }
  return best;
}

export function Meters({ state, labels, info, deltas }: Props) {
  const loud = loudestKey(deltas);
  return (
    <div className="meters">
      {ORDER.map((k) => {
        const v = state[k];
        const tip = info?.[k] ?? labels[k];
        return (
          <div
            className="m"
            key={k}
            tabIndex={0}
            role="meter"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(v)}
            aria-label={`${labels[k]} ${Math.round(v)}. ${tip}`}
            title={tip}
          >
            <div className="mh">
              <span>{labels[k]}</span>
              <b>{Math.round(v)}</b>
            </div>
            <div className="track">
              <div className={`fill ${k}`} style={{ width: `${Math.max(0, Math.min(100, v))}%` }} />
              {loud === k ? <span className="pulse-glow" key={state.turn} /> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

```

---

## DealTracker

- **Path:** `frontend/src/components/DealTracker.tsx`
- Price scale: target, red line, their offer, your offer, plus a sparkline of their price over time.

```tsx
// DealTracker.tsx — the headline deal visualization, drawn from the PLAYER's
// perspective. A horizontal scale marks YOUR target and YOUR red line
// (reservation), their opening anchor, and animates their current offer (and
// your last offer) along it each turn. Below it, a sparkline traces how their
// price has moved.
//
// HONESTY: the opponent's hidden floor (reservation price) is NEVER sent to the
// client and is NEVER shown or inferred here. Every mark uses only client-known
// values: scenario.target, scenario.reservation, the first offer_opp we saw
// (their opening), the current offer_opp, and offer_player. The shaded "good
// zone" is purely the PLAYER's own acceptable band (target → red line).
import { useEffect, useRef, useState } from "react";
import type { Lang, ScenarioView, StateView } from "../types";
import type { Strings } from "../i18n";
import { formatDeal } from "../lib/format";

interface Props {
  scenario: ScenarioView;
  state: StateView | null;
  t: Strings;
  lang: Lang;
}

// Track their offer per turn. Reset when the scenario changes (new game).
function useOfferHistory(scenarioId: string, state: StateView | null): number[] {
  const [hist, setHist] = useState<number[]>([]);
  const lastTurn = useRef<number>(-1);
  const sid = useRef(scenarioId);

  useEffect(() => {
    if (sid.current !== scenarioId) {
      sid.current = scenarioId;
      lastTurn.current = -1;
      setHist(state ? [state.offer_opp] : []);
      if (state) lastTurn.current = state.turn;
      return;
    }
    if (!state) return;
    // Record the opening once, then one point per completed turn.
    if (hist.length === 0) {
      setHist([state.offer_opp]);
      lastTurn.current = state.turn;
    } else if (state.turn !== lastTurn.current) {
      lastTurn.current = state.turn;
      setHist((h) => [...h, state.offer_opp]);
    }
  }, [scenarioId, state, hist.length]);

  return hist;
}

export function DealTracker({ scenario, state, t, lang }: Props) {
  const hist = useOfferHistory(scenario.id, state);
  const unit = scenario.headline_unit;
  const fmt = (v: number) => formatDeal(v, unit, lang);
  const target = scenario.target;
  const redline = scenario.reservation;
  // Direction is inferred from target vs red line — no engine `dir` needed and
  // nothing about the opponent's floor is used.
  const lowerIsBetter = target < redline;

  const opening = hist.length ? hist[0] : state?.offer_opp ?? redline;
  // Once the table closes, the headline is the SETTLED price, not the last thing
  // the opponent said — those differ (the deal closes at the meeting point), and
  // showing offer_opp here contradicted the outcome strip a rouble away.
  const settled = state?.status === "agreement" ? state?.deal ?? null : null;
  const current = settled ?? state?.offer_opp ?? opening;
  const yours = state?.offer_player ?? null;

  // Axis spans every known mark, padded so nothing sits on the very edge.
  const pts = [target, redline, opening, current, ...(yours != null ? [yours] : [])];
  let lo = Math.min(...pts);
  let hi = Math.max(...pts);
  if (hi === lo) hi = lo + 1;
  const pad = (hi - lo) * 0.08;
  lo -= pad;
  hi += pad;

  // Normalize to [0,1], then orient so the PLAYER's good end is always LEFT.
  const frac = (v: number) => (v - lo) / (hi - lo);
  const x = (v: number) => (lowerIsBetter ? frac(v) : 1 - frac(v));
  const pct = (v: number) => `${(x(v) * 100).toFixed(1)}%`;

  // Good zone: from target (best) to red line (worst still acceptable to you).
  const gz1 = Math.min(x(target), x(redline)) * 100;
  const gz2 = Math.max(x(target), x(redline)) * 100;

  // Single accessible summary for the whole (otherwise purely visual) tracker: the
  // player's own target + red line and the counterpart's current offer. The hidden
  // floor is never referenced (honesty). role="img" collapses the ticks/scale into
  // this one label for screen readers.
  const ariaSummary = t.a11y.deal
    .replace("{target}", fmt(target))
    .replace("{redline}", fmt(redline))
    .replace("{offer}", state ? fmt(current) : "—");

  return (
    <div className="dealtracker" role="img" aria-label={ariaSummary}>
      <div className="dt-head" aria-hidden="true">
        <div className="ob">
          <div className="l">{settled != null ? t.tracker.settled : t.tracker.theirOffer}</div>
          <div className="v">{state ? fmt(current) : "—"}</div>
        </div>
        <div className="ob">
          <div className="l">{t.tracker.target}</div>
          <div className="v tg">{fmt(target)}</div>
        </div>
      </div>

      <div className="dt-scale" aria-hidden="true">
        <div className="dt-axis" />
        <div className="dt-good" style={{ left: `${gz1}%`, width: `${gz2 - gz1}%` }} />

        {/* their opening anchor — a faint ghost tick showing where they started */}
        <div className="dt-mark opening" style={{ left: pct(opening) }}>
          <span className="tick" />
          <span className="lbl">{t.tracker.opening}</span>
        </div>

        {/* your red line */}
        <div className="dt-mark redline" style={{ left: pct(redline) }}>
          <span className="tick" />
        </div>

        {/* your target */}
        <div className="dt-mark target" style={{ left: pct(target) }}>
          <span className="tick" />
        </div>

        {/* your last offer, if you've made one. The mark slides (CSS transition
            on `left`); the keyed ring replays a one-shot "settle" pop on move. */}
        {yours != null ? (
          <div className="dt-mark yours" style={{ left: pct(yours) }}>
            <span className="dot" />
            <span className="settle" key={yours} />
            <span className="lbl">{t.tracker.yourOffer}</span>
          </div>
        ) : null}

        {/* their current offer — the animated headline mark */}
        <div className="dt-mark theirs" style={{ left: pct(current) }}>
          <span className="dot" />
          <span className="settle" key={current} />
        </div>
      </div>

      <div className="dt-legend">
        <span className="lg tg">{t.tracker.target}</span>
        <span className="lg rl">{t.tracker.redline}</span>
        <span className="lg th">{t.tracker.theirOffer}</span>
        {yours != null ? <span className="lg yo">{t.tracker.yourOffer}</span> : null}
      </div>

      {hist.length >= 2 ? <Sparkline hist={hist} lowerIsBetter={lowerIsBetter} label={t.tracker.history} /> : null}
    </div>
  );
}

// Tiny inline-SVG step/line of their offers over turns. Theme-aware via
// currentColor; "good" direction points visually downward toward your target.
function Sparkline({ hist, lowerIsBetter, label }: { hist: number[]; lowerIsBetter: boolean; label: string }) {
  const W = 240;
  const H = 34;
  const pad = 3;
  let lo = Math.min(...hist);
  let hi = Math.max(...hist);
  if (hi === lo) hi = lo + 1;
  const n = hist.length;
  const px = (i: number) => pad + (i / (n - 1)) * (W - 2 * pad);
  // y: closer-to-target (good) plotted lower on the chart, so a conceding
  // opponent draws a line that descends toward you.
  const py = (v: number) => {
    const f = (v - lo) / (hi - lo); // 0..1, 1 = highest number
    const good = lowerIsBetter ? 1 - f : f; // 1 = best for player
    return pad + good * (H - 2 * pad);
  };
  const d = hist.map((v, i) => `${i === 0 ? "M" : "L"}${px(i).toFixed(1)},${py(v).toFixed(1)}`).join(" ");
  const lastX = px(n - 1);
  const lastY = py(hist[n - 1]);

  return (
    <div className="dt-spark">
      <span className="dt-spark-l">{label}</span>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" role="img" aria-label={label}>
        <path d={d} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={lastX} cy={lastY} r={2.6} fill="currentColor" />
      </svg>
    </div>
  );
}

```

---

## DealTerms

- **Path:** `frontend/src/components/DealTerms.tsx`
- The tradeable secondary issues (visible logrolling package).

```tsx
// DealTerms.tsx — makes multi-issue logrolling VISIBLE. Lists each tradeable
// secondary issue as a row; the moment its id shows up in state.terms_conceded
// (the engine's authoritative "package"), it flips to a brass "on the table"
// state. Nothing here is inferred — the deterministic engine owns terms_conceded;
// the panel only renders it. Renders nothing for scenarios without secondary
// issues (the parent also guards), so non-logrolling scenarios are unaffected.
import type { ScenarioView, StateView } from "../types";
import type { Strings } from "../i18n";

interface Props {
  scenario: ScenarioView;
  state: StateView | null;
  t: Strings;
}

export function DealTerms({ scenario, state, t }: Props) {
  const issues = scenario.secondary_issues ?? [];
  if (issues.length === 0) return null;
  const conceded = new Set(state?.terms_conceded ?? []);

  return (
    <div className="dealterms">
      <div className="dtm-head">🔄 {t.terms.title}</div>
      <ul className="dtm-list">
        {issues.map((iss) => {
          const traded = conceded.has(iss.id);
          return (
            <li key={iss.id} className={`dtm-row${traded ? " traded" : ""}`}>
              <span className="dtm-mark" aria-hidden="true">{traded ? "✓" : "○"}</span>
              <span className="dtm-label">{iss.label}</span>
              <span className="dtm-state">{traded ? t.terms.onTable : t.terms.notYet}</span>
            </li>
          );
        })}
      </ul>
      <p className="dtm-explain">{t.terms.explainer}</p>
    </div>
  );
}

```

---

## Scorecard

- **Path:** `frontend/src/components/Scorecard.tsx`
- Compact per-turn rubric chips derived from the deterministic engine analysis.

```tsx
// Scorecard.tsx — a compact, always-offline rubric read of the LATEST turn.
// Pure presentation of the deterministic engine's own output (analysis tags,
// flags, and meter deltas) — no backend, no live judge. Distinct from the
// "judge-cam" chips (Chat.tsx), which surface the LIVE judge's semantic read and
// are honestly absent offline. Shown under the meters; hidden in exam mode.
import type { Analysis, Deltas } from "../types";
import type { Strings } from "../i18n";

interface Props {
  analysis: Analysis | null;
  deltas: Deltas | null;
  labels: Strings["scorecard"];
}

// Thresholds for turning a raw meter swing into a rubric verdict. Kept modest so
// a chip fires on a genuine move but not on noise; mirrors the delta-chip cue.
const INFO_UP = 4;
const TRUST_UP = 6;
const TENSION_UP = 8;

export function Scorecard({ analysis, deltas, labels }: Props) {
  if (!analysis || !deltas) return null;
  const has = (key: string) => analysis.tags.some((t) => t.key === key);

  // Build the fired chips in priority order, then cap — compact, non-noisy.
  const chips: Array<{ label: string; tone: "good" | "warn" }> = [];
  if (has("criteria")) chips.push({ label: labels.criteria, tone: "good" });
  if (has("tradeoff")) chips.push({ label: labels.tradeoff, tone: "good" });
  if (deltas.info >= INFO_UP || has("interests")) chips.push({ label: labels.interest, tone: "good" });
  if (deltas.trust >= TRUST_UP) chips.push({ label: labels.trustUp, tone: "good" });
  if (analysis.flags.hostile) chips.push({ label: labels.aggression, tone: "warn" });
  if (deltas.tension >= TENSION_UP) chips.push({ label: labels.tensionUp, tone: "warn" });

  const shown = chips.slice(0, 4);
  if (!shown.length) return null;

  return (
    <div className="scorecard" aria-hidden="true">
      {shown.map((c, i) => (
        <span className={`sc-chip ${c.tone}`} key={i}>
          {c.tone === "good" ? "✓ " : "! "}
          {c.label}
        </span>
      ))}
    </div>
  );
}

```

---

## Composer

- **Path:** `frontend/src/components/Composer.tsx`
- Message input with quick-move chips, hint button and prefill support.

```tsx
// Composer.tsx — message composer: textarea with live technique preview,
// quick-move chips, hint button, send.
import { useEffect, useRef, useState } from "react";
import type { QuickMove } from "../i18n";
import { previewChips } from "../lib/techniques";
import { haptic, play } from "../lib/sound";
import { MAX_INPUT, clampInput, inputRemaining, showInputNote } from "../lib/net";

interface Props {
  disabled: boolean;
  placeholder: string;
  quickMoves: QuickMove[];
  onSend: (text: string) => void;
  onHint: () => void;
  hintEnabled: boolean;
  // showChips=false (exam mode) suppresses the live technique preview so the
  // player gets no read on how their line is being classified.
  showChips: boolean;
  // gentle "N chars left" note as the input nears the cap — "{n}" substituted.
  limitNote: string;
  // Turn-1 opener: a single tappable chip that pre-fills (never sends) an
  // interest-probing SPIN opener. Provided only on the very first move; hidden
  // here the moment the box is non-empty. Absent ⇒ no chip.
  suggestion?: { label: string; fill: string };
  // Externally-supplied text to drop into the box (the coach's worked example).
  // Keyed by a nonce, not by the text, so tapping the same suggestion twice
  // still re-fills after the player has edited or cleared it.
  prefill?: { text: string; nonce: number };
}

export function Composer({
  disabled, placeholder, quickMoves, onSend, onHint, hintEnabled, showChips, limitNote, suggestion, prefill,
}: Props) {
  const [text, setText] = useState("");
  const taRef = useRef<HTMLTextAreaElement>(null);
  const chips = showChips ? previewChips(text) : [];
  const nearLimit = showInputNote(text);

  const submit = () => {
    const t = text.trim();
    if (!t || disabled) return;
    // Soft send cue + a light haptic tap. This is also a genuine user gesture,
    // so it doubles as the first chance to unlock the AudioContext.
    play("send");
    haptic();
    onSend(t);
    setText("");
  };

  // Chips are sentence STARTERS: seed the box with the stem and hand the player
  // the caret at the end so they finish the thought (never a complete move).
  const insertStem = (stem: string) => {
    setText(stem);
    requestAnimationFrame(() => {
      const el = taRef.current;
      if (!el) return;
      el.focus();
      el.selectionStart = el.selectionEnd = el.value.length;
    });
  };

  useEffect(() => {
    if (prefill?.text) insertStem(prefill.text);
    // Only the nonce drives this: re-filling on text identity would fight the
    // player's edits on every re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill?.nonce]);

  // The opener chip earns its place only before the player has typed anything —
  // it de-blanks the first move, then yields the moment they start writing.
  const showSuggestion = !!suggestion && text.trim() === "" && !disabled;

  return (
    <div className="compose">
      {showSuggestion && suggestion ? (
        <div className="suggest">
          <button
            type="button"
            className="suggest-chip"
            onClick={() => insertStem(suggestion.fill)}
          >
            {suggestion.label}
          </button>
        </div>
      ) : null}
      {showChips ? (
        <div className="live">
          {chips.map((c, i) => (
            <span className={`tag ${c.key}`} key={i}>
              {c.label}
            </span>
          ))}
        </div>
      ) : null}
      <div className="crow">
        <textarea
          ref={taRef}
          rows={2}
          value={text}
          maxLength={MAX_INPUT}
          placeholder={placeholder}
          // Cap defensively even if maxLength is bypassed (paste, IME, autofill).
          onChange={(e) => setText(clampInput(e.target.value))}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <button className="send" onClick={submit} disabled={disabled || !text.trim()} aria-label="send">
          ➤
        </button>
      </div>
      {nearLimit ? (
        <div className="compose-note" role="status">
          {limitNote.replace("{n}", String(inputRemaining(text)))}
        </div>
      ) : null}
      <div className="quick">
        {hintEnabled ? (
          <button onClick={onHint} disabled={disabled}>
            💡
          </button>
        ) : null}
        {quickMoves.map((q, i) => (
          <button key={i} onClick={() => insertStem(q.text)}>
            {q.label}
          </button>
        ))}
      </div>
    </div>
  );
}

```

---

## Chat

- **Path:** `frontend/src/components/Chat.tsx`
- The negotiation log: bubbles, technique tags, coach lines, judge-cam chips, typing/judging indicator.

```tsx
// Chat.tsx — the negotiation chat log: opponent/player bubbles, technique tag
// badges + argumentation score on player lines, per-turn meter delta flashes,
// streaming opponent text, hint bubbles.
import { useEffect, useRef, useState } from "react";
import type { ChatEntry } from "../api/useNegotiation";
import type { Analysis, Deltas } from "../types";
import type { MeterLabels, Strings } from "../i18n";
import { tagText } from "../lib/tagLabel";

interface Props {
  log: ChatEntry[];
  metersShort: MeterLabels;
  // full meter names (for accessible delta-chip labels; the chips render short)
  metersFull: MeterLabels;
  // aria template for a delta chip — "{label}: {value}"
  deltaAria: string;
  // accessible name for the log live region
  logLabel: string;
  argLabel: string;
  tagLabels: Strings["tagLabels"];
  // exam mode withholds per-turn technique badges + arg score + meter deltas +
  // the judge's live coach line (exam gives its feedback only at the debrief).
  exam?: boolean;
  coachLabel: string;
  // Semantic-judge differentiator: when the live judge scored the move, badge the
  // coach line "graded by meaning". Never shown offline/mock (judgeActive=false),
  // where coaching comes from the deterministic keyword path — no claim to make.
  judgeActive?: boolean;
  judgeBadge: { label: string; aria: string };
  // "judge-cam" chip label (item 1): the struck-through "pattern, not meaning" chip
  // shown when the live judge flags a line as buzzword-spam. Technique chips reuse
  // the already-localized labels the judge returns on the coach entry.
  judgeReject: string;
  // While a turn is in flight (before the opponent's reply/stream lands) we show
  // an opponent-styled "typing…" bubble so the wait doesn't read as a dead chat.
  typing?: boolean;
  typingLabel: string;
  // Rendered at the top of an otherwise-empty log (turn 0). The log bottom-aligns
  // its content, which is right for a filling chat and leaves a tall void in an
  // empty one — this is what goes there.
  opening?: React.ReactNode;
  // True while the label refers to the JUDGE, not the opponent. The bubble then
  // drops its opponent styling — it is not the counterpart speaking.
  typingJudging?: boolean;
  // shown inside the 💡 bubble while the coach's answer is in flight
  hintPendingLabel: string;
  // Fills the composer with a coach-suggested line (the AI hint's worked
  // example). Absent ⇒ the line is shown but not offered as one tap.
  onUseLine?: (text: string) => void;
  useLineLabel: string;
}

export function Chat({ log, metersShort, metersFull, deltaAria, logLabel, argLabel, tagLabels, exam, coachLabel, judgeActive, judgeBadge, judgeReject, typing, typingLabel, typingJudging, opening, hintPendingLabel, onUseLine, useLineLabel }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  // Coach lines are dismissible — the player can wave off a nudge they've read.
  const [dismissed, setDismissed] = useState<Set<number>>(() => new Set());
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // At turn 0 there is no conversation to catch up to — the opening card IS
    // the content, and on a phone (where the log is capped at 48vh) chasing the
    // bottom cut its title and scene off the top.
    el.scrollTop = opening ? 0 : el.scrollHeight;
  }, [log, typing, opening]);

  return (
    // The log is a polite live region: new opponent replies and coach lines are
    // announced to screen readers as they arrive, without stealing focus.
    <div
      className={`log${opening ? " has-opening" : ""}`}
      ref={ref}
      role="log"
      aria-label={logLabel}
      aria-live="polite"
      aria-relevant="additions text"
      aria-atomic="false"
    >
      {opening}
      {log.map((e) => {
        if (e.kind === "hint") {
          // A hint with a `line` is a worked example — the strongest scaffold in
          // deliberate practice. It fills the composer, never sends: the move
          // stays the player's, and gets judged like anything they type.
          if (e.pending) {
            // The AI coach takes seconds to answer. Reuse the opponent's own
            // waiting language so the player reads it as "someone is composing",
            // not as a button that did nothing.
            return (
              <div className="hintbub pending" key={e.id} aria-live="polite">
                <div>
                  💡{" "}
                  <span className="typing-dots" aria-hidden="true"><i /><i /><i /></span>{" "}
                  <span className="typing-label">{hintPendingLabel}</span>
                </div>
              </div>
            );
          }
          return (
            <div className="hintbub" key={e.id}>
              <div>💡 {e.text}</div>
              {e.line && onUseLine ? (
                <div className="hintline">
                  <span className="hintline-q">«{e.line}»</span>
                  <button
                    type="button"
                    className="hintline-use"
                    onClick={() => onUseLine(e.line as string)}
                  >
                    {useLineLabel}
                  </button>
                </div>
              ) : null}
            </div>
          );
        }
        if (e.kind === "sys") return <div className="sys" key={e.id}>{e.text}</div>;
        if (e.kind === "coach") {
          if (exam || dismissed.has(e.id)) return null;
          // "judge-cam" chips: recognized techniques + an optional reject chip.
          // Both ride the coach entry ONLY when the LIVE judge scored this turn —
          // honestly absent offline/mock, so no need to gate them on judgeActive.
          const chips = e.techniques ?? [];
          const hasCam = chips.length > 0 || e.reject === true;
          // Two rows, not one run-on line: what the judge RECOGNIZED (chips +
          // badge) reads as a verdict on the move, and the coach's sentence
          // reads as advice. Inline they wrapped into a 12.5px blob and the
          // strongest thing this product does arrived as fine print.
          return (
            <div className="coachline" key={e.id}>
              {hasCam || judgeActive ? (
                <div className="cl-verdict">
                  {chips.map((label, i) => (
                    <span className="jc-chip on" key={i}>✓ {label}</span>
                  ))}
                  {e.reject ? <span className="jc-chip reject">{judgeReject}</span> : null}
                  {judgeActive ? (
                    <span className="judge-badge" title={judgeBadge.aria} aria-label={judgeBadge.aria}>
                      ⚖ {judgeBadge.label}
                    </span>
                  ) : null}
                </div>
              ) : null}
              {/* The label is a prefix for the note — without a note it dangled
                  as a bare "💡 тренер:" above the chips. */}
              {e.text ? (
                <div className="cl-note">
                  <span className="coachline-b">💡 {coachLabel}:</span> {e.text}
                </div>
              ) : null}
              <button
                className="coachline-x"
                aria-label="dismiss"
                onClick={() => setDismissed((s) => new Set(s).add(e.id))}
              >
                ×
              </button>
            </div>
          );
        }
        if (e.kind === "opp") {
          return (
            <div className="msg opp" key={e.id}>
              <div className="bub">
                {e.text}
                {e.streaming ? <span className="caret">▍</span> : null}
              </div>
            </div>
          );
        }
        return (
          <div className="msg me" key={e.id}>
            <div className="bub">{e.text}</div>
            {!exam && e.analysis ? <TagRow analysis={e.analysis} argLabel={argLabel} tagLabels={tagLabels} /> : null}
            {!exam && e.deltas ? (
              <DeltaRow deltas={e.deltas} labels={metersShort} full={metersFull} deltaAria={deltaAria} />
            ) : null}
          </div>
        );
      })}
      {typing ? (
        <div className={`msg opp typing-msg${typingJudging ? " judging" : ""}`} aria-live="polite">
          <div className="bub typing">
            <span className="typing-dots" aria-hidden="true"><i /><i /><i /></span>
            <span className="typing-label">{typingLabel}</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function TagRow({ analysis, argLabel, tagLabels }: {
  analysis: Analysis; argLabel: string; tagLabels: Strings["tagLabels"];
}) {
  return (
    <div className="tags">
      {analysis.tags.map((t, i) => (
        <span className={`tag ${t.key}`} key={i}>
          {tagText(t, analysis, tagLabels)}
        </span>
      ))}
      <span className="arg">
        <b>{analysis.arg_quality}</b>/100 {argLabel}
      </span>
    </div>
  );
}

function DeltaRow({
  deltas, labels, full, deltaAria,
}: {
  deltas: Deltas;
  labels: MeterLabels;
  full: MeterLabels;
  deltaAria: string;
}) {
  // tension is "inverted" — a drop is good (shown green).
  const cells: Array<{ label: string; full: string; v: number; invert?: boolean }> = [
    { label: labels.trust, full: full.trust, v: deltas.trust },
    { label: labels.tension, full: full.tension, v: deltas.tension, invert: true },
    { label: labels.info, full: full.info, v: deltas.info },
    { label: labels.leverage, full: full.leverage, v: deltas.leverage },
  ];
  const shown = cells.filter((c) => Math.abs(c.v) >= 0.5);
  if (!shown.length) return null;
  return (
    <div className="deltas">
      {shown.map((c, i) => {
        const good = c.invert ? c.v < 0 : c.v > 0;
        const signed = `${c.v > 0 ? "+" : ""}${Math.round(c.v)}`;
        // Chip shows the abbreviation; the aria-label spells out the full meter name.
        const label = deltaAria.replace("{label}", c.full).replace("{value}", signed);
        return (
          <span className={good ? "up" : "dn"} key={i} aria-label={label}>
            <span aria-hidden="true">
              {c.label} {signed}
            </span>
          </span>
        );
      })}
    </div>
  );
}

```

---

## ScreenHeading

- **Path:** `frontend/src/components/ScreenHeading.tsx`
- Screen-reader heading + focus target for each screen.

```tsx
// ScreenHeading.tsx — a screen's primary heading that grabs keyboard focus when it
// mounts. Because each screen (home/game/debrief/profile) is conditionally rendered,
// a mount == a screen transition, so moving focus here on mount lands screen-reader
// and keyboard users at the top of the new context (an ARIA route-change pattern).
// tabIndex={-1} makes it programmatically focusable without adding it to the tab order.
import { useEffect, useRef, type ReactNode } from "react";

interface Props {
  as?: "h1" | "h2";
  className?: string;
  children?: ReactNode;
  // Home's hero title carries inline <em>; allow the same raw-HTML seam h1 used.
  dangerouslySetInnerHTML?: { __html: string };
}

export function ScreenHeading({ as = "h2", className, children, dangerouslySetInnerHTML }: Props) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  const Tag = as;
  return (
    <Tag
      ref={ref}
      tabIndex={-1}
      data-screen-heading=""
      className={className}
      dangerouslySetInnerHTML={dangerouslySetInnerHTML}
    >
      {children}
    </Tag>
  );
}

```

---

## Onboarding

- **Path:** `frontend/src/components/Onboarding.tsx`
- First-run tutorial overlay.

```tsx
// Onboarding.tsx — the guided first-negotiation coach-mark overlay. A single
// lightweight step at a time: a dimmed backdrop with a "hole" cut over the
// element that matters right now, plus a small tooltip anchored to it (or a
// centered welcome card when there's no target). Every step is skippable.
//
// The overlay owns only presentation + measurement. WHICH step shows, and WHEN
// (welcome → meters → composer, then event-driven reveals tied to the real
// engine state), is decided by Table. Nothing here touches game state, so the
// deterministic engine stays the single source of truth.
import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export interface CoachStep {
  stepKey: string; // NOT `key` — that's reserved by React and stripped on spread
  // The element to spotlight. Omitted → a centered card (the welcome beat).
  targetRef?: React.RefObject<HTMLElement | null>;
  title: string;
  body: string;
  primaryLabel: string;
  onPrimary: () => void;
  // Optional prominent tap-to-act button (the suggested opening the player can
  // send for their very first turn).
  action?: { label: string; onClick: () => void };
  // Guided-intro position for the progress dots ("2 / 3"). 0 → no dots (event
  // reveals aren't part of the linear intro).
  step: number;
  steps: number;
  skipLabel: string;
  onSkip: () => void;
}

const reduceMotion = () =>
  typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

interface Rect { top: number; left: number; width: number; height: number; }

export function Onboarding(props: CoachStep) {
  const { stepKey, targetRef, title, body, primaryLabel, onPrimary, action, step, steps, skipLabel, onSkip } = props;
  const [rect, setRect] = useState<Rect | null>(null);
  const lastRect = useRef<Rect | null>(null);
  const tipRef = useRef<HTMLDivElement>(null);

  // Measure the spotlight target in viewport coords and keep it pinned as the
  // page settles: a phone re-lays-out under a coach-mark (e.g. the DealTracker
  // grows a sparkline the moment the opponent's price first moves, nudging the
  // element below it down). We track that via a ResizeObserver on the body, the
  // scroll/resize listeners, and a short settle loop after the (reduced-motion-
  // aware) scroll-into-view — so the hole never strands over a stale position.
  useLayoutEffect(() => {
    const el = targetRef?.current ?? null;
    if (!el) { setRect(null); lastRect.current = null; return; }
    const measure = () => {
      const r = el.getBoundingClientRect();
      const next = { top: r.top, left: r.left, width: r.width, height: r.height };
      const p = lastRect.current;
      if (!p || p.top !== next.top || p.left !== next.left || p.width !== next.width || p.height !== next.height) {
        lastRect.current = next;
        setRect(next);
      }
    };
    const reduce = reduceMotion();
    el.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
    measure();

    // A brief rAF settle loop converges the spotlight onto the element's final
    // resting rect as the smooth scroll and any reflow underneath complete.
    let raf = 0;
    const start = performance.now();
    const tick = () => {
      measure();
      if (performance.now() - start < 1000) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    ro?.observe(document.body);
    ro?.observe(el);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
    // stepKey changes with every step; that's the intended re-measure trigger.
  }, [stepKey, targetRef]);

  // Padding around the spotlighted element, and the hole geometry.
  const PAD = 8;
  const hole = rect
    ? { top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 }
    : null;

  // Tooltip placement: centered when there's no target; otherwise below the
  // element if there's room, else above. Horizontally clamped to the viewport.
  let tipStyle: React.CSSProperties;
  let arrow: "up" | "down" | null = null;
  if (!hole) {
    tipStyle = { top: "50%", left: "50%", transform: "translate(-50%, -50%)" };
  } else {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const TIP_W = Math.min(320, vw - 24);
    const EST_H = 210; // enough headroom for the decision; exact height not needed
    const below = hole.top + hole.height + 12;
    const placeBelow = below + EST_H <= vh || hole.top < EST_H + 24;
    const top = placeBelow ? below : Math.max(12, hole.top - 12 - EST_H);
    const cx = hole.left + hole.width / 2;
    const left = Math.max(12, Math.min(cx - TIP_W / 2, vw - TIP_W - 12));
    tipStyle = { top, left, width: TIP_W };
    arrow = placeBelow ? "up" : "down";
  }

  // Portal to <body>: the game screen sets an (identity) transform for its
  // fade-in, which would otherwise become the containing block for our fixed
  // overlay and strand the spotlight tens of px off the real element.
  return createPortal(
    <div className="onb" role="dialog" aria-modal="true" aria-label={title}>
      {hole ? (
        <div className="onb-hole" style={{ top: hole.top, left: hole.left, width: hole.width, height: hole.height }} />
      ) : (
        <div className="onb-scrim" />
      )}

      <div className={`onb-tip${arrow ? ` a-${arrow}` : " centered"}`} style={tipStyle} ref={tipRef}>
        {arrow ? <span className="onb-arrow" aria-hidden="true" /> : null}
        <div className="onb-title">{title}</div>
        <div className="onb-body">{body}</div>

        {action ? (
          <button className="onb-action" onClick={action.onClick}>
            {action.label}
          </button>
        ) : null}

        <div className="onb-foot">
          {steps > 0 ? (
            <span className="onb-dots" aria-hidden="true">
              {Array.from({ length: steps }, (_, i) => (
                <i className={i + 1 === step ? "on" : ""} key={i} />
              ))}
            </span>
          ) : (
            <span />
          )}
          <div className="onb-btns">
            <button className="onb-skip" onClick={onSkip}>{skipLabel}</button>
            <button className="onb-next" onClick={onPrimary}>{primaryLabel}</button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

```

---

## Gamification

- **Path:** `frontend/src/components/Gamification.tsx`
- XP/rank strip, daily goal, achievement toasts, milestone overlay.

```tsx
// Gamification.tsx — the Duolingo-style layer over the honest learning core.
// Everything here renders numbers the deterministic engine already produced
// (see lib/progress.ts): a rank + XP bar and a daily-goal ring for the home
// hero, a skill-mastery screen, a debrief XP count-up, and achievement toasts.
// Understated-premium, theme-aware, reduced-motion-safe, good on a 390px phone.
import { useEffect, useRef, useState } from "react";
import type { Lang } from "../types";
import type { Strings } from "../i18n";
import { ScreenHeading } from "./ScreenHeading";
import { haptic, play } from "../lib/sound";
import {
  ACHIEVEMENTS, DAILY_GOAL_MAX, DAILY_GOAL_MIN, dailyGoalView, getAchievement, rankForXp,
  skillViews, strongestWeakest,
  type GameResult, type MilestoneHit, type Profile, type SkillId,
} from "../lib/progress";

// Per-skill bar color. Labels carry the meaning; color just aids scanning.
const SKILL_COLOR: Record<SkillId, string> = {
  questions: "var(--info)",
  interests: "var(--trust)",
  criteria: "var(--brass)",
  listening: "var(--leverage)",
  tradeoff: "#d98a3c",
  tension: "var(--trust)",
};

const prefersReducedMotion = () =>
  typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

const sub = (tpl: string, vars: Record<string, string | number>) =>
  tpl.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));

// ---- Home hero stats: rank + XP progress, daily-goal ring, streak ----------
export function HeroStats({
  t, lang, profile, onOpenProfile, onSetGoal,
}: {
  t: Strings; lang: Lang; profile: Profile; onOpenProfile: () => void;
  onSetGoal: (target: number) => void;
}) {
  const r = rankForXp(profile.xp);
  const rankName = r.rank.name[lang];
  const goal = dailyGoalView(profile);
  const nextLine = r.next
    ? sub(t.gam.toNext, { n: r.toNext, name: r.next.name[lang] })
    : t.gam.maxRank;
  // 1..3 target buttons — a small, discoverable control right on the ring tile.
  const targets: number[] = [];
  for (let n = DAILY_GOAL_MIN; n <= DAILY_GOAL_MAX; n++) targets.push(n);

  return (
    <div className="herostats">
      <button className="hs-rank" onClick={onOpenProfile} aria-label={t.gam.skillsTitle}>
        <div className="hs-rank-top">
          <span className="hs-rank-kicker">{t.gam.rankLabel}</span>
          <span className="hs-xp">{sub(t.gam.totalXp, { n: profile.xp })}</span>
        </div>
        <div className="hs-rank-name">{rankName}</div>
        <div className="hs-bar" role="progressbar" aria-valuenow={Math.round(r.progress * 100)}>
          <div className="hs-bar-fill" style={{ width: `${Math.round(r.progress * 100)}%` }} />
        </div>
        <div className="hs-next">{nextLine}</div>
      </button>

      <div className="hs-aside">
        <div className={`hs-goal${goal.met ? " done" : ""}`} title={goal.met ? t.gam.dailyDone : t.gam.dailyTodo}>
          <DailyRing progress={goal.progress} met={goal.met} />
          <span className="hs-goal-l">{goal.met ? t.gam.dailyDone : t.gam.dailyGoal}</span>
          <span className="hs-goal-n">{sub(t.gam.dailyProgress, { done: goal.done, target: goal.target })}</span>
          <div className="hs-goalset" role="group" aria-label={t.gam.dailyTargetLabel}>
            {targets.map((n) => (
              <button
                key={n}
                className={goal.target === n ? "on" : ""}
                aria-pressed={goal.target === n}
                title={sub(t.gam.dailyTargetSet, { n })}
                // Stop the click from bubbling to any parent; just set the target.
                onClick={(e) => { e.stopPropagation(); onSetGoal(n); }}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
        {profile.streak > 0 ? (
          <div className="hs-streak" title={t.streakLabel.replace("{n}", String(profile.streak))}>
            <span className="hs-flame" aria-hidden="true">🔥</span>
            <b>{profile.streak}</b>
            {profile.freezes > 0 ? (
              <span className="hs-freeze" title={t.gam.freezeSaved}>
                🧊 {t.gam.freezeLabel} ×{profile.freezes}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

// A small ring that fills toward today's target; a flame lands once it's met.
function DailyRing({ progress, met }: { progress: number; met: boolean }) {
  const R = 15, C = 2 * Math.PI * R;
  const p = Math.max(0, Math.min(1, progress));
  return (
    <span className="hs-ring" aria-hidden="true">
      <svg viewBox="0 0 36 36" width="36" height="36">
        <circle cx="18" cy="18" r={R} className="hs-ring-track" fill="none" strokeWidth="3" />
        <circle
          cx="18" cy="18" r={R} className="hs-ring-fill" fill="none" strokeWidth="3"
          strokeDasharray={C} strokeDashoffset={C * (1 - p)} strokeLinecap="round"
          transform="rotate(-90 18 18)"
        />
      </svg>
      <span className="hs-ring-emoji">{met ? "🔥" : "◌"}</span>
    </span>
  );
}

// ---- Skill-mastery screen (director's #4) ----------------------------------
export function SkillsProfile({
  t, lang, profile, onHome,
}: {
  t: Strings; lang: Lang; profile: Profile; onHome: () => void;
}) {
  const r = rankForXp(profile.xp);
  const views = skillViews(profile);
  const { strong, weak } = strongestWeakest(profile);
  const hasGames = views.some((s) => s.n > 0);
  const grown = useGrown();

  return (
    <section className="screen">
      <div className="wrap">
        <div className="skills">
          <button className="skills-back" onClick={onHome}>{t.gam.back}</button>
          <div className="skills-head">
            <ScreenHeading as="h2">{t.gam.skillsTitle}</ScreenHeading>
            <div className="skills-rank">
              <b>{r.rank.name[lang]}</b> · {sub(t.gam.totalXp, { n: profile.xp })}
            </div>
          </div>
          <p className="skills-sub">{t.gam.skillsSub}</p>

          {hasGames ? (
            <p className="skills-read">
              {strong ? (<><span className="sr-up">{t.gam.strongIn}:</span> <b>{t.gam.skillNames[strong]}</b></>) : null}
              {weak ? (<> · <span className="sr-dn">{t.gam.workOn}:</span> <b>{t.gam.skillNames[weak]}</b></>) : null}
            </p>
          ) : (
            <p className="skills-empty">{t.gam.noGames}</p>
          )}

          {/* Zero-state: with no games there's nothing honest to score, so we skip
              the (all "—") bars entirely and let the friendly invite above stand. */}
          {hasGames ? (
          <div className="skillbars">
            {views.map((s) => {
              // One game isn't a mastery signal — a lone weak score would shame a
              // beginner ("you're a 0 at everything"). Below 2 games we withhold the
              // number/bar and invite another play instead of scoring them.
              const enough = s.n >= 2;
              return (
                <div className="skb" key={s.id}>
                  <div className="skb-h">
                    <span className="skb-n">{t.gam.skillNames[s.id]}</span>
                    <b>{enough ? s.mastery : "—"}</b>
                  </div>
                  <div className="skb-t">
                    <div
                      className="skb-f"
                      style={{ width: grown && enough ? `${s.mastery}%` : "0%", background: SKILL_COLOR[s.id] }}
                    />
                  </div>
                  <div className="skb-hint">
                    {enough ? (
                      <>
                        {t.gam.skillHints[s.id]}
                        <span className="skb-games"> · {sub(t.gam.gamesCount, { n: s.n })}</span>
                      </>
                    ) : (
                      <span className="skb-lowdata">{t.gam.lowData}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          ) : null}

          <h3 className="badges-title">{t.gam.achievementsTitle}</h3>
          <div className="badges">
            {ACHIEVEMENTS.map((a) => {
              const on = profile.achievements.includes(a.id);
              return (
                <div className={`badge${on ? " on" : ""}`} key={a.id} title={on ? a.desc[lang] : t.gam.locked}>
                  <span className="badge-ic">{a.icon}</span>
                  <span className="badge-nm">{a.name[lang]}</span>
                  <span className="badge-ds">{on ? a.desc[lang] : t.gam.locked}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

// ---- Debrief XP award: count-up + level-up flourish ------------------------
// `failed` (talks collapsed) drops the celebratory tone: muted styling, a sober
// caption, and no level-up flourish — a blown negotiation shouldn't feel rewarded.
export function XpAward({ t, lang, game, failed }: { t: Strings; lang: Lang; game: GameResult; failed?: boolean }) {
  const n = useCountUp(game.xpGain);
  // Audio choreography, once per debrief mount (ref-guarded against re-render):
  // the coin-cascade rides under the count-up, then a warm major sting lands if
  // the run leveled up. Staggered so it follows the grade sting the ring plays.
  const cued = useRef(false);
  useEffect(() => {
    if (cued.current) return;
    cued.current = true;
    const a = setTimeout(() => play("xp"), 480);
    let b: ReturnType<typeof setTimeout> | undefined;
    if (game.leveledUp && !failed) {
      b = setTimeout(() => {
        play("levelup");
        haptic(22);
      }, 1080);
    }
    return () => {
      clearTimeout(a);
      if (b) clearTimeout(b);
    };
  }, [game.leveledUp, failed]);
  return (
    <div className={failed ? "xpaward failed" : "xpaward"}>
      <div className="xpa-main">
        <span className="xpa-plus">+{n}</span>
        <span className="xpa-unit">XP</span>
      </div>
      <div className="xpa-cap">{failed ? t.gam.xpAwardFailed : t.gam.xpAwardLabel}</div>
      {game.leveledUp && !failed ? (
        <div className="xpa-level">
          <span className="xpa-spark" aria-hidden="true">✦</span> {t.gam.levelUp}
          <b> {game.rankAfter.rank.name[lang]}</b>
        </div>
      ) : null}
      {/* A freeze quietly saved the streak this game — an honest, gentle note (a
          missed day was covered), independent of the run's grade. */}
      {game.freezeUsed ? <div className="xpa-freeze">{t.gam.freezeSaved}</div> : null}
      {/* Honest note when a weak run (D/F) didn't extend an existing streak — the
          streak rewards competence (C+), not attendance. Only shown if there's a
          streak to speak of, so first-timers aren't nagged. */}
      {!game.streakCounted && game.profile.streak > 0 ? (
        <div className="xpa-streak-skip">{t.gam.streakSkipped}</div>
      ) : null}
    </div>
  );
}

// ---- Milestone celebration (near-full-screen, once each) -------------------
// A prominent overlay for REAL milestones only: a 7-day streak and each rank-up
// (the caller filters against already-celebrated ids and never passes any on a
// collapsed game). Reuses the XpAward count-up + play('levelup') + haptic. Shows
// one card at a time, dismissible; reduced-motion renders it statically (no bounce,
// no auto-motion) but still shows. Understated-premium — no confetti.
export function MilestoneCard({
  t, lang, game, onDone,
}: {
  t: Strings; lang: Lang; game: GameResult; onDone?: () => void;
}) {
  const ids = game.newMilestones;
  // Which card in the queue is showing; reset whenever a fresh game's list arrives.
  const [i, setI] = useState(0);
  const key = ids.map((m) => m.id).join(",");
  useEffect(() => { setI(0); }, [key]);
  // Warm sting + haptic once per card shown (a genuine milestone earns the fanfare).
  useEffect(() => {
    if (ids.length === 0 || i >= ids.length) return;
    play("levelup");
    haptic(22);
  }, [key, i, ids.length]);

  if (ids.length === 0 || i >= ids.length) return null;
  const m = ids[i];
  const last = i >= ids.length - 1;
  // Always step forward (past the end hides the overlay); notify the parent once
  // the final card is dismissed so it can drop the overlay entirely.
  const advance = () => {
    setI((n) => n + 1);
    if (last) onDone?.();
  };

  return (
    <div className="milestone-scrim" role="dialog" aria-modal="true" aria-label={t.gam.milestone.kicker}>
      <div className="milestone-card">
        <div className="milestone-kicker">
          {m.kind === "rank" ? t.gam.milestone.rankKicker : t.gam.milestone.kicker}
        </div>
        <MilestoneHero t={t} lang={lang} game={game} hit={m} />
        <p className="milestone-detail">
          {m.kind === "rank" ? t.gam.milestone.rankDetail : t.gam.milestone.streakDetail}
        </p>
        <button className="milestone-go" onClick={advance}>
          {last ? t.gam.milestone.dismiss : `${t.gam.milestone.dismiss} (${i + 1}/${ids.length})`}
        </button>
      </div>
    </div>
  );
}

// The card's animated hero: a big count-up (reused motion) with a milestone icon.
// Streak → counts to the day number; rank-up → counts the new lifetime XP and names
// the rank. Reduced-motion jumps straight to the final value (useCountUp handles it).
function MilestoneHero({
  t, lang, game, hit,
}: {
  t: Strings; lang: Lang; game: GameResult; hit: MilestoneHit;
}) {
  const isRank = hit.kind === "rank";
  const target = isRank ? game.xpAfter : hit.value;
  const n = useCountUp(target);
  return (
    <div className="milestone-hero">
      <span className="milestone-ic" aria-hidden="true">{isRank ? "✦" : "🔥"}</span>
      {isRank ? (
        <div className="milestone-rank">{game.rankAfter.rank.name[lang]}</div>
      ) : (
        <div className="milestone-title">{sub(t.gam.milestone.streakTitle, { n: hit.value })}</div>
      )}
      <div className="milestone-count">
        <b>{n}</b> <span>{isRank ? t.gam.milestone.rankUnit : t.gam.milestone.streakUnit}</span>
      </div>
    </div>
  );
}

// ---- Achievement toasts (fixed, auto-dismiss) ------------------------------
// Anchored bottom (see .ach-toasts) so it never overlaps the debrief header, and
// held back until the debrief's reveal beats have played (grade ring → XP count-up
// → badge) so the badge doesn't pop on top of the count-up. Reduced-motion skips
// the wait. Stack order in the same tick is preserved by keying on the id list.
export function AchievementToasts({ t, lang, ids }: { t: Strings; lang: Lang; ids: string[] }) {
  const [visible, setVisible] = useState<string[]>([]);
  useEffect(() => {
    if (ids.length === 0) {
      setVisible([]);
      return;
    }
    const lead = prefersReducedMotion() ? 0 : 1300; // let the ring + XP count-up land first
    const show = setTimeout(() => setVisible(ids), lead);
    const hide = setTimeout(() => setVisible([]), lead + 4600);
    return () => {
      clearTimeout(show);
      clearTimeout(hide);
    };
  }, [ids]);
  if (visible.length === 0) return null;
  return (
    <div className="ach-toasts">
      {visible.map((id, i) => {
        const a = getAchievement(id);
        if (!a) return null;
        return (
          <div className="ach-toast" key={id} style={{ animationDelay: `${i * 0.12}s` }}>
            <span className="ach-ic">{a.icon}</span>
            <span className="ach-txt">
              <b>{t.gam.unlockedToast}</b>
              <span>{a.name[lang]}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

// A one-shot "grow from 0" trigger after mount (bars animate in).
function useGrown() {
  const [grown, setGrown] = useState(false);
  const raf = useRef<number>();
  useEffect(() => {
    raf.current = requestAnimationFrame(() => setGrown(true));
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, []);
  return grown;
}

// Count from 0 to target over ~0.9s; reduced-motion jumps straight to target.
function useCountUp(target: number) {
  const [v, setV] = useState(() => (prefersReducedMotion() ? target : 0));
  useEffect(() => {
    if (prefersReducedMotion()) { setV(target); return; }
    let raf = 0;
    const start = performance.now();
    const dur = 900;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
      setV(Math.round(eased * target));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return v;
}

```

---

## WhyTeaches

- **Path:** `frontend/src/components/WhyTeaches.tsx`
- Home-page proof-of-method section (four method panels).

```tsx
// WhyTeaches.tsx — the director's #8 "why this teaches" section. A cold visitor
// (hackathon jury, a skeptical adult) lands on the hero and needs proof the
// product actually teaches a method before committing to "Начать переговоры".
// This sits under the hero, ABOVE the #play picker, so it never disrupts the
// CTA's scroll target. Each panel grounds one principle in a concrete in-game
// micro-example (interest-probing moves the price, criteria = leverage, logrolling,
// BATNA-as-leverage); the framing states the honesty guarantee. The price-dot
// strip is a decorative micro-animation (reduced-motion-safe via the global rule
// + an explicit resting position).
import type { Lang } from "../types";
import type { Strings } from "../i18n";

// Method-tag → meter color, so the pedagogy reads in the same visual language as
// the live game (Information/Leverage/Trust drive these very techniques).
const TAG_COLOR: Record<string, string> = {
  SPIN: "var(--info)",
  Гарвард: "var(--brass)",
  Harvard: "var(--brass)",
  BATNA: "var(--leverage)",
};

export function WhyTeaches({ t, lang }: { t: Strings; lang: Lang }) {
  return (
    <section className="teach" aria-labelledby="teach-title">
      <div className="teach-head">{t.teach.head}</div>
      <h2 className="teach-title" id="teach-title">
        {t.teach.title}
      </h2>

      {/* Micro-animation: their-offer dot easing toward the target tick as an
          interest is uncovered — the core "price moves without pressure" loop,
          in miniature. Decorative; the caption carries the meaning for SR/RM. */}
      <div className="teach-demo">
        <div className="td-track" aria-hidden="true">
          <span className="td-target" />
          <span className="td-target-lbl">{lang === "ru" ? "цель" : "target"}</span>
          <span className="td-dot">
            <span className="td-dot-lbl">{lang === "ru" ? "их цена" : "their price"}</span>
          </span>
        </div>
        <div className="teach-demo-cap">{t.teach.demoCap}</div>
      </div>

      <div className="teach-panels">
        {t.teach.panels.map((p, i) => (
          <div className="tp-panel" key={i}>
            <span className="tp-tag" style={{ color: TAG_COLOR[p.tag] || "var(--brass)" }}>
              {p.tag}
            </span>
            <div className="tp-name">{p.name}</div>
            <p className="tp-idea">{p.idea}</p>
            <p className="tp-example">{p.example}</p>
          </div>
        ))}
      </div>

      <p className="teach-framing">{t.teach.framing}</p>
    </section>
  );
}

```

---

