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
import type { ScenarioView, StateView } from "../types";
import type { Strings } from "../i18n";

interface Props {
  scenario: ScenarioView;
  state: StateView | null;
  t: Strings;
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

export function DealTracker({ scenario, state, t }: Props) {
  const hist = useOfferHistory(scenario.id, state);
  const unit = scenario.headline_unit;
  const target = scenario.target;
  const redline = scenario.reservation;
  // Direction is inferred from target vs red line — no engine `dir` needed and
  // nothing about the opponent's floor is used.
  const lowerIsBetter = target < redline;

  const opening = hist.length ? hist[0] : state?.offer_opp ?? redline;
  const current = state?.offer_opp ?? opening;
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

  return (
    <div className="dealtracker">
      <div className="dt-head">
        <div className="ob">
          <div className="l">{t.tracker.theirOffer}</div>
          <div className="v">{state ? current + unit : "—"}</div>
        </div>
        <div className="ob">
          <div className="l">{t.tracker.target}</div>
          <div className="v tg">{target + unit}</div>
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
