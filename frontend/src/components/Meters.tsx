// Meters.tsx — the four live negotiation meters with animated bars.
import type { StateView } from "../types";
import type { MeterLabels } from "../i18n";

type MeterKey = "trust" | "tension" | "info" | "leverage";
const ORDER: MeterKey[] = ["trust", "tension", "info", "leverage"];

export function Meters({ state, labels }: { state: StateView; labels: MeterLabels }) {
  return (
    <div className="meters">
      {ORDER.map((k) => {
        const v = state[k];
        return (
          <div className="m" key={k}>
            <div className="mh">
              <span>{labels[k]}</span>
              <b>{Math.round(v)}</b>
            </div>
            <div className="track">
              <div className={`fill ${k}`} style={{ width: `${Math.max(0, Math.min(100, v))}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
