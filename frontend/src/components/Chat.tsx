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
  // Copy + callback for the "read her face" layer. Absent when the layer is off.
  probeLabels: Strings["probe"];
  probeTally?: string;
  /** Compact meters shown inside an open question on narrow screens. */
  probeMeters?: React.ReactNode;
  onProbeAnswer?: (id: number, choice: number) => void;
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

export function Chat({ log, metersShort, metersFull, deltaAria, logLabel, argLabel, tagLabels, exam, coachLabel, judgeActive, judgeBadge, judgeReject, typing, typingLabel, typingJudging, opening, hintPendingLabel, probeLabels, probeTally, probeMeters, onProbeAnswer, onUseLine, useLineLabel }: Props) {
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
        if (e.kind === "probe") {
          // Deliberately inline rather than a modal: the answer is read off the
          // avatar's expression and the meters, and a modal would cover both.
          const answered = e.picked !== undefined;
          const right = answered && e.picked === e.answer;
          return (
            <div className={`probe${answered ? (right ? " right" : " wrong") : ""}`} key={e.id}>
              <div className="pb-head">
                <b>🎭 {probeLabels.ask}</b>
                {probeTally ? <span className="pb-tally">{probeTally}</span> : null}
              </div>
              {/* On a phone the instrument rail sits far above the question, so
                  the meters the player must read to answer are duplicated INTO
                  the card. Desktop hides this — the rail is already beside it. */}
              {probeMeters ? <div className="pb-meters">{probeMeters}</div> : null}
              <div className="pb-opts">
                {e.options.map((o, i) => {
                  const mark = !answered ? "" : i === e.answer ? " ok" : i === e.picked ? " bad" : " dim";
                  return (
                    <button
                      key={i}
                      className={`pb-opt${mark}`}
                      disabled={answered}
                      onClick={() => onProbeAnswer?.(e.id, i)}
                    >
                      {probeLabels.reactions[o] ?? o}
                      {answered && i === e.answer ? <span aria-hidden="true"> ✓</span> : null}
                      {answered && i === e.picked && i !== e.answer ? <span aria-hidden="true"> ✗</span> : null}
                    </button>
                  );
                })}
              </div>
              {/* Marking an answer wrong teaches nothing; the reason does. */}
              {answered ? (
                <div className="pb-why">
                  <b>{right ? probeLabels.right : probeLabels.wrong}</b>{" "}
                  {probeLabels.why[e.options[e.answer]] ?? ""}
                </div>
              ) : null}
            </div>
          );
        }
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
