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
  // Тимур — кандидат, relationship: тёплый тон, короткая стрижка, без галстука
  // (он на собеседовании, а не на встрече с советом директоров).
  candidate_offer: { skin: SKIN.tan, hair: HAIR.black, brow: "#2a231d", style: "buzz",
    collar: "#4a6d6a", rx: 12.6, ry: 14.4 },
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
