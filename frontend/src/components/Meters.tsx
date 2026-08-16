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
