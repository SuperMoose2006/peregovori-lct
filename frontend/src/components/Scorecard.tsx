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
