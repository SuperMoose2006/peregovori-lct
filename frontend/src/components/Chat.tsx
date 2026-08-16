// Chat.tsx — the negotiation chat log: opponent/player bubbles, technique tag
// badges + argumentation score on player lines, per-turn meter delta flashes,
// streaming opponent text, hint bubbles.
import { useEffect, useRef, useState } from "react";
import type { ChatEntry } from "../api/useNegotiation";
import type { Analysis, Deltas } from "../types";
import type { MeterLabels } from "../i18n";

interface Props {
  log: ChatEntry[];
  metersShort: MeterLabels;
  argLabel: string;
  // exam mode withholds per-turn technique badges + arg score + meter deltas +
  // the judge's live coach line (exam gives its feedback only at the debrief).
  exam?: boolean;
  coachLabel: string;
}

export function Chat({ log, metersShort, argLabel, exam, coachLabel }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  // Coach lines are dismissible — the player can wave off a nudge they've read.
  const [dismissed, setDismissed] = useState<Set<number>>(() => new Set());
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [log]);

  return (
    <div className="log" ref={ref}>
      {log.map((e) => {
        if (e.kind === "hint") return <div className="hintbub" key={e.id}>💡 {e.text}</div>;
        if (e.kind === "sys") return <div className="sys" key={e.id}>{e.text}</div>;
        if (e.kind === "coach") {
          if (exam || dismissed.has(e.id)) return null;
          return (
            <div className="coachline" key={e.id}>
              <span className="coachline-b">💡 {coachLabel}:</span> {e.text}
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
            {!exam && e.analysis ? <TagRow analysis={e.analysis} argLabel={argLabel} /> : null}
            {!exam && e.deltas ? <DeltaRow deltas={e.deltas} labels={metersShort} /> : null}
          </div>
        );
      })}
    </div>
  );
}

function TagRow({ analysis, argLabel }: { analysis: Analysis; argLabel: string }) {
  return (
    <div className="tags">
      {analysis.tags.map((t, i) => (
        <span className={`tag ${t.key}`} key={i}>
          {t.label}
        </span>
      ))}
      <span className="arg">
        <b>{analysis.arg_quality}</b>/100 {argLabel}
      </span>
    </div>
  );
}

function DeltaRow({ deltas, labels }: { deltas: Deltas; labels: MeterLabels }) {
  // tension is "inverted" — a drop is good (shown green).
  const cells: Array<{ label: string; v: number; invert?: boolean }> = [
    { label: labels.trust, v: deltas.trust },
    { label: labels.tension, v: deltas.tension, invert: true },
    { label: labels.info, v: deltas.info },
    { label: labels.leverage, v: deltas.leverage },
  ];
  const shown = cells.filter((c) => Math.abs(c.v) >= 0.5);
  if (!shown.length) return null;
  return (
    <div className="deltas">
      {shown.map((c, i) => {
        const good = c.invert ? c.v < 0 : c.v > 0;
        return (
          <span className={good ? "up" : "dn"} key={i}>
            {c.label} {c.v > 0 ? "+" : ""}
            {Math.round(c.v)}
          </span>
        );
      })}
    </div>
  );
}
