// Debrief.tsx — post-negotiation report: grade ring (A–F), three score bars
// (economic / relationship / technique), stat cells, coaching tips, retry/home.
import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { Debrief as DebriefData, Lang, Mode, SecondaryIssueView, WhatIfBranch, WhatIfRequest, WhatIfResponse } from "../types";
import type { Strings } from "../i18n";
import type { GameResult, RecordResult } from "../lib/progress";
import { pickPivotalTurn, pivotalTurnIndex } from "../lib/whatif";
import { formatDeal } from "../lib/format";
import { play } from "../lib/sound";
import { ScreenHeading } from "./ScreenHeading";
import { XpAward } from "./Gamification";

const GRADE_COLOR: Record<string, string> = {
  A: "var(--trust)",
  B: "var(--info)",
  C: "var(--brass)",
  D: "#d98a3c",
  F: "var(--tension)",
};

interface Props {
  t: Strings;
  d: DebriefData;
  mode: Mode;
  lang: Lang;
  scenarioTitle?: string;
  // Exam only: the name the player entered, printed on a passing certificate.
  // Empty ⇒ the certificate falls back to a neutral placeholder.
  playerName?: string;
  // This run's personal-best outcome (from the retention profile) — null if not
  // yet recorded. Drives the "Личный рекорд" line + the "new record!" flourish.
  record?: RecordResult | null;
  // The gamification outcome of this run (XP gained, rank, level-up). Drives the
  // "+XP" count-up award. Same object as `record` (GameResult extends RecordResult).
  game?: GameResult | null;
  onRetry: () => void;
  onHome: () => void;
  // Campaign mode: the primary action advances the arc instead of replaying.
  onNext?: () => void;
  nextLabel?: string;
  // "А что если…" replay: the callback that runs the deterministic branch (backend
  // or offline synth) plus the context it needs — the player's OWN lines in order,
  // the scenario id, and the display context (unit + which direction is better).
  // Omit any of these (or leave moves empty) to hide the card entirely.
  runWhatIf?: (req: WhatIfRequest) => Promise<WhatIfResponse | null>;
  whatIfMoves?: string[];
  whatIfScenarioId?: string;
  whatIfUnit?: string;
  whatIfLowerBetter?: boolean;
  // Visible logrolling recap: the scenario's tradeable secondary issues and the
  // ids actually traded (the final terms_conceded). Both engine-owned — the line
  // reinforces that trading created value, or gently flags the missed chance.
  // Absent/empty secondaryIssues ⇒ the line doesn't render (non-logrolling games).
  secondaryIssues?: SecondaryIssueView[];
  termsConceded?: string[];
}

export function Debrief({
  t, d, mode, lang, scenarioTitle, playerName, record, game, onRetry, onHome, onNext, nextLabel,
  runWhatIf, whatIfMoves, whatIfScenarioId, whatIfUnit, whatIfLowerBetter,
  secondaryIssues, termsConceded,
}: Props) {
  const gc = GRADE_COLOR[d.grade] || "var(--brass)";
  // Exam reads like a certificate: same score/stats/tips, ceremonial framing.
  const exam = mode === "exam";
  // A passing exam earns a named, printable certificate (A/B/C — not D/F). Only
  // then do we show the awarded-to name, date and print action.
  const passed = exam && ["A", "B", "C"].includes(d.grade);
  // Certificate date — new Date() lives only here, in the browser render path
  // (never in the mock/engine or tests), so it stays deterministic-safe there.
  const certDate = passed
    ? new Date().toLocaleDateString(lang === "ru" ? "ru-RU" : "en-US", {
        year: "numeric", month: "long", day: "numeric",
      })
    : "";
  const certName = (playerName ?? "").trim() || t.exam.namePlaceholder;
  // Animate the bars in from 0 after mount.
  const [grown, setGrown] = useState(false);
  const raf = useRef<number>();
  useEffect(() => {
    raf.current = requestAnimationFrame(() => setGrown(true));
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, []);

  // Grade-ring reveal sting: a short tone whose pitch/brightness scales with the
  // grade (A rises bright, F sinks low). Once per debrief mount, timed to land as
  // the ring fills — ahead of the XP cascade the award plays.
  const graded = useRef(false);
  useEffect(() => {
    if (graded.current) return;
    graded.current = true;
    const id = setTimeout(() => play("grade", { grade: d.grade }), 160);
    return () => clearTimeout(id);
  }, [d.grade]);

  const bars: Array<{ label: string; v: number; color: string }> = [
    { label: t.sb.economic, v: d.economic, color: "var(--brass)" },
    { label: t.sb.relationship, v: d.relationship, color: "var(--trust)" },
    { label: t.sb.technique, v: d.technique, color: "var(--leverage)" },
  ];

  // The pivotal (most-damaging) turn to teach from, and its 0-based index into the
  // player's moves. The card renders only when everything lines up: a callback, the
  // player's lines, a scenario id, and a valid pivotal turn inside that move list.
  const pivotal = pickPivotalTurn(d.turning_points);
  const pivotIdx = pivotalTurnIndex(pivotal, whatIfMoves?.length ?? 0);
  const showWhatIf =
    !!runWhatIf && !!whatIfScenarioId && !!whatIfMoves && whatIfMoves.length > 0 &&
    pivotal !== null && pivotIdx !== null && !exam;

  // Mobile-only collapse for the hoisted what-if card (item 6): on ≤640px it
  // pushes the score bars far down, so on mobile it starts collapsed behind a
  // teaser + CTA and expands in place. Desktop ignores this (CSS always shows it).
  const [wiOpen, setWiOpen] = useState(false);

  // Technique-floor rule (item 4): a great price with thin method caps the grade.
  // Surfacing the rule makes a capped grade read as principled, not harsh.
  const techniqueFloored = d.technique < 45 && d.economic >= 65;

  // "Что сказал бы мастер" (item 3): spotlight the single weakest turning point and
  // reformulate it with the ONE most-relevant missing technique. The selection is
  // an engine fact (pivotal turn + which technique the debrief shows was missing);
  // the reformulation is a principled Harvard/SPIN template. Nothing when no turn.
  const master: { quote: string; line: string; why: string } | null = (() => {
    if (!pivotal || exam) return null;
    const m = t.master;
    if (d.threats > 0) return { quote: pivotal.quote, line: m.threat, why: m.whyThreat };
    if (d.objective_criteria === 0) return { quote: pivotal.quote, line: m.criteria, why: m.whyCriteria };
    if (d.interests_found < d.interests_total) return { quote: pivotal.quote, line: m.interest, why: m.whyInterest };
    if (d.tradeoffs === 0) return { quote: pivotal.quote, line: m.tradeoff, why: m.whyTradeoff };
    return null;
  })();

  const cells: Array<{ n: string; l: string }> = [
    { n: `${d.spin_stages}/3`, l: t.stat.spin },
    { n: String(d.objective_criteria), l: t.stat.criteria },
    { n: String(d.empathy), l: t.stat.empathy },
    { n: `${d.interests_found}/${d.interests_total}`, l: t.stat.interests },
    { n: String(d.tradeoffs), l: t.stat.tradeoffs },
    { n: String(d.threats), l: t.stat.threats },
    { n: String(d.avg_arg), l: t.stat.arg },
  ];

  // Visible logrolling recap. Only scenarios with tradeable issues show this line:
  // the labels of what actually went on the table, or — if nothing did — a gentle
  // note that value was left uncreated. Labels only; no hidden numbers leak here.
  const issues = secondaryIssues ?? [];
  const tradedIds = new Set(termsConceded ?? []);
  const tradedLabels = issues.filter((iss) => tradedIds.has(iss.id)).map((iss) => iss.label);
  const showTerms = issues.length > 0;

  return (
    <section className="screen">
      <div className="wrap">
        <div className={exam ? "debrief cert" : "debrief"}>
          <div className="gh">
            <div
              className="ring"
              role="img"
              aria-label={t.a11y.grade.replace("{grade}", d.grade).replace("{score}", String(d.overall))}
              style={
                {
                  ["--p" as string]: grown ? d.overall : 0,
                  ["--gc" as string]: gc,
                } as CSSProperties
              }
            >
              <span className="gl" style={{ color: gc }} aria-hidden="true">
                {d.grade}
              </span>
              <span className="gs" aria-hidden="true">{d.overall}/100</span>
            </div>
            <div>
              {exam ? <div className="cert-eyebrow">🏆 {t.exam.eyebrow}</div> : null}
              <ScreenHeading as="h2">{exam ? t.exam.resultTitle : t.debriefTitle}</ScreenHeading>
              {exam && scenarioTitle ? (
                <div className="cert-scenario">
                  {t.exam.scenarioLabel}: <b>{scenarioTitle}</b>
                </div>
              ) : null}
              {passed ? (
                <div className="cert-award">
                  <div className="cert-award-line">
                    <span className="cert-award-lab">{t.exam.awardedTo}</span>
                    <b className="cert-name">{certName}</b>
                  </div>
                  <div className="cert-award-line">
                    <span className="cert-award-lab">{t.exam.dateLabel}</span>
                    <span className="cert-date">{certDate}</span>
                  </div>
                </div>
              ) : null}
              <div className="oc">
                {t.outcome[d.status]} · <b>{d.deal_text}</b>
              </div>
              {record && record.record.bestGrade ? (
                <div className={`pb${game?.celebrate ? " beat" : ""}`}>
                  <span className="pb-l">
                    {t.personalBest}: <b>{record.record.bestGrade} ({record.record.bestScore})</b>
                  </span>
                  {/* "new record!" only when a real prior best was beaten with a
                      passing, non-collapsed outcome — never on a first attempt or a D/F. */}
                  {game?.celebrate ? (
                    <span className="pb-new">
                      ▲ {t.newRecord}
                      {record.prevBest && record.prevBest.grade
                        ? ` +${Math.max(0, record.record.bestScore - record.prevBest.score)}`
                        : ""}
                    </span>
                  ) : null}
                </div>
              ) : null}
              {game ? <XpAward t={t} lang={lang} game={game} failed={game.failed} /> : null}
              {passed ? (
                <button className="cert-print" type="button" onClick={() => window.print()}>
                  🖨 {t.exam.download}
                </button>
              ) : null}
            </div>
          </div>

          {passed ? <div className="cert-certifies">{t.exam.certifies}</div> : null}

          {/* Hoisted to the top (directly under the grade ring): the single
              pivotal-turn replay is the jury's magnet — an inviting teaser + the
              player's own costly line, before the metric bars. Deterministic
              replay logic is unchanged; only its position moved. */}
          {showWhatIf && pivotal && pivotIdx !== null ? (
            <div className={`whatif-wrap${wiOpen ? " open" : ""}`}>
              <button
                type="button"
                className="whatif-mtoggle"
                aria-expanded={wiOpen}
                onClick={() => setWiOpen((o) => !o)}
              >
                <span className="wi-teaser">{t.whatIf.teaser}</span>
                <span className="wmt-cta">{t.whatIf.mobileCta} ▾</span>
              </button>
              <WhatIfCard
                t={t}
                lang={lang}
                run={runWhatIf!}
                scenarioId={whatIfScenarioId!}
                moves={whatIfMoves!}
                turnIndex={pivotIdx}
                originalQuote={pivotal.quote}
                unit={whatIfUnit}
                lowerBetter={whatIfLowerBetter}
              />
            </div>
          ) : null}

          <div className="sb">
            {bars.map((b, i) => (
              <div
                className="sbi"
                key={i}
                role="img"
                aria-label={t.a11y.scoreBar.replace("{label}", b.label).replace("{v}", String(b.v))}
              >
                <div className="sbh" aria-hidden="true">
                  <span>{b.label}</span>
                  <b>{b.v}</b>
                </div>
                <div className="sbt" aria-hidden="true">
                  <div
                    className="sbf"
                    style={{ width: grown ? `${b.v}%` : "0%", background: b.color }}
                  />
                </div>
              </div>
            ))}
          </div>

          {techniqueFloored ? (
            <div className="tfloor" role="note">
              <span className="tfloor-i" aria-hidden="true">⚖</span>
              <span>{t.techniqueFloor}</span>
            </div>
          ) : null}

          <div className="stats">
            {cells.map((c, i) => (
              <div className="st" key={i} role="img" aria-label={`${c.l}: ${c.n}`}>
                <div className="n" aria-hidden="true">{c.n}</div>
                <div className="l" aria-hidden="true">{c.l}</div>
              </div>
            ))}
          </div>

          {showTerms ? (
            <div className={`dbterms${tradedLabels.length ? "" : " none"}`}>
              <span className="dbt-label">🔄 {t.terms.debriefLabel}</span>
              {tradedLabels.length ? (
                <span className="dbt-chips">
                  {tradedLabels.map((label, i) => (
                    <span className="dbt-chip" key={i}>✓ {label}</span>
                  ))}
                </span>
              ) : (
                <span className="dbt-miss">{t.terms.debriefNone}</span>
              )}
            </div>
          ) : null}

          {d.ai_verdict ? (
            <div className="mentor">
              <h3>🎓 {t.mentor.title}</h3>
              <p className="mn-verdict">{d.ai_verdict}</p>
              {d.ai_strength || d.ai_growth ? (
                <div className="mn-grid">
                  {d.ai_strength ? (
                    <div className="mn-cell good">
                      <span className="mn-lab">{t.mentor.strength}</span>
                      <p>{d.ai_strength}</p>
                    </div>
                  ) : null}
                  {d.ai_growth ? (
                    <div className="mn-cell grow">
                      <span className="mn-lab">{t.mentor.growth}</span>
                      <p>{d.ai_growth}</p>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          {d.turning_points && d.turning_points.length > 0 ? (
            <div className="tpoints">
              <h3>{t.turningPoints.title}</h3>
              <ol>
                {d.turning_points.map((p, i) => (
                  <li key={i}>
                    <span className="tp-turn">
                      {t.turningPoints.turn} {p.turn}
                    </span>
                    <blockquote className="tp-quote">«{p.quote}»</blockquote>
                    <div className="tp-what">{p.what}</div>
                    {p.coach ? <div className="tp-coach">{p.coach}</div> : null}
                  </li>
                ))}
              </ol>
            </div>
          ) : null}

          {master ? (
            <div className="master">
              <h3>✦ {t.master.title}</h3>
              <div className="ms-grid">
                <div className="ms-cell yours">
                  <span className="ms-lab">{t.master.yours}</span>
                  <blockquote className="ms-q">«{master.quote}»</blockquote>
                </div>
                <div className="ms-cell mstr">
                  <span className="ms-lab">✦ {t.master.label}</span>
                  <blockquote className="ms-q ms-line">«{master.line}»</blockquote>
                </div>
              </div>
              <div className="ms-why">
                <b>{t.master.why}</b> {master.why}
              </div>
            </div>
          ) : null}

          <div className="coach">
            <h3>{t.coachTitle}</h3>
            <ul>
              {d.tips.map((tip, i) => (
                <li key={i}>{tip}</li>
              ))}
            </ul>
          </div>

          <div className="dacts">
            {onNext ? (
              <button className="primary" onClick={onNext}>
                {nextLabel}
              </button>
            ) : (
              <button className="primary" onClick={onRetry}>
                ↻ {t.retry}
              </button>
            )}
            <button className="quit" onClick={onHome}>
              {t.toHome}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// "А что если…" — the what-if replay card. Shows the player's pivotal line, lets
// them pick (or type) a stronger one, then reveals a side-by-side divergence of
// the two deterministic branches: meter swings, the opponent's offer, and their
// line. Honest: the "better" banner shows only when the alternative truly wins.
// ---------------------------------------------------------------------------
interface WhatIfCardProps {
  t: Strings;
  lang: Lang;
  run: (req: WhatIfRequest) => Promise<WhatIfResponse | null>;
  scenarioId: string;
  moves: string[];
  turnIndex: number;
  originalQuote: string;
  unit?: string;
  lowerBetter?: boolean;
}

function WhatIfCard({ t, lang, run, scenarioId, moves, turnIndex, originalQuote, unit, lowerBetter }: WhatIfCardProps) {
  const w = t.whatIf;
  // Alt choice: two presets (0|1) or free text ("custom"). Default to the first
  // preset — a strong interest probe, the canonical "ask why" move.
  const [choice, setChoice] = useState<0 | 1 | "custom">(0);
  const [custom, setCustom] = useState("");
  const [loading, setLoading] = useState(false);
  const [res, setRes] = useState<WhatIfResponse | null>(null);
  const [failed, setFailed] = useState(false);
  // Grow the alt bars in from 0 once the divergence is revealed.
  const [grown, setGrown] = useState(false);
  const raf = useRef<number>();

  const altText = (choice === "custom" ? custom : w.presets[choice]).trim();

  const reveal = async () => {
    if (loading || !altText) return;
    setLoading(true);
    setFailed(false);
    const out = await run({ scenarioId, lang, moves, turnIndex, altText });
    setLoading(false);
    if (!out) {
      setFailed(true);
      return;
    }
    setRes(out);
    setGrown(false);
    raf.current = requestAnimationFrame(() => setGrown(true));
  };

  const resetChoice = () => {
    setRes(null);
    setFailed(false);
    setGrown(false);
    if (raf.current) cancelAnimationFrame(raf.current);
  };

  useEffect(() => () => {
    if (raf.current) cancelAnimationFrame(raf.current);
  }, []);

  return (
    <div className="whatif">
      <div className="wi-teaser">{w.teaser}</div>
      <h3>{w.title}</h3>
      <p className="wi-intro">{w.intro}</p>

      <blockquote className="wi-orig">«{originalQuote}»</blockquote>

      {!res ? (
        <>
          <div className="wi-altlabel">{w.altLabel}</div>
          <div className="wi-presets">
            {w.presets.map((p, i) => (
              <button
                key={i}
                type="button"
                className={`wi-preset${choice === i ? " on" : ""}`}
                onClick={() => setChoice(i as 0 | 1)}
              >
                {p}
              </button>
            ))}
          </div>
          <input
            className="wi-input"
            type="text"
            value={custom}
            placeholder={w.customPlaceholder}
            onChange={(e) => {
              setCustom(e.target.value);
              setChoice("custom");
            }}
            onFocus={() => setChoice("custom")}
          />
          <button className="wi-reveal" type="button" onClick={reveal} disabled={loading || !altText}>
            {loading ? w.loading : w.reveal}
          </button>
          {failed ? <p className="wi-fail">{w.unavailable}</p> : null}
        </>
      ) : (
        <Divergence
          t={t}
          lang={lang}
          res={res}
          grown={grown}
          unit={unit}
          lowerBetter={lowerBetter}
          onReset={resetChoice}
        />
      )}
    </div>
  );
}

// The revealed side-by-side: original vs alternative branch. Emphasizes the
// improvement honestly — the banner and summary are derived from the real deltas.
function Divergence({
  t, lang, res, grown, unit, lowerBetter, onReset,
}: {
  t: Strings;
  lang: Lang;
  res: WhatIfResponse;
  grown: boolean;
  unit?: string;
  lowerBetter?: boolean;
  onReset: () => void;
}) {
  const w = t.whatIf;
  const { original: o, alternative: a } = res;

  // Is the alternative genuinely better? Cooler room AND at least one real gain
  // (an interest uncovered, more trust, or a better price move). Keeps it honest.
  const priceBetter =
    lowerBetter === undefined
      ? false
      : lowerBetter
        ? a.state.offer_opp < o.state.offer_opp
        : a.state.offer_opp > o.state.offer_opp;
  const uncovered = a.state.interests_found > o.state.interests_found;
  const trustHigher = a.deltas.trust > o.deltas.trust;
  const cooler = a.deltas.tension < o.deltas.tension;
  const better = cooler && (uncovered || trustHigher || priceBetter);

  // The one-line proof, built only from what's actually true.
  const bits: string[] = [];
  if (a.deltas.tension !== o.deltas.tension) {
    bits.push(`${w.meters.tension.toLowerCase()} ${fmtDelta(a.deltas.tension)} ${w.insteadOf} ${fmtDelta(o.deltas.tension)}`);
  }
  if (uncovered) bits.push(w.uncovered);
  else if (trustHigher) bits.push(w.trustHigher);
  if (priceBetter) bits.push(w.priceFurther);

  return (
    <div className="wi-diverge">
      <div className={`wi-banner${better ? " good" : ""}`}>
        {better ? w.betterBanner : w.neutralBanner}
      </div>
      {bits.length ? <div className="wi-summary">{bits.join(" · ")}</div> : null}

      <div className="wi-cols">
        <Branch t={t} lang={lang} label={w.wasLabel} b={o} grown={grown} unit={unit} alt={false} />
        <Branch t={t} lang={lang} label={w.couldLabel} b={a} grown={grown} unit={unit} alt />
      </div>

      <button className="wi-reveal ghost" type="button" onClick={onReset}>
        ↺ {w.again}
      </button>
    </div>
  );
}

// One branch column: three meter bars (trust/tension/info), the opponent's offer,
// and their line. Only the alternative column animates its bars in.
function Branch({
  t, lang, label, b, grown, unit, alt,
}: {
  t: Strings;
  lang: Lang;
  label: string;
  b: WhatIfBranch;
  grown: boolean;
  unit?: string;
  alt: boolean;
}) {
  const w = t.whatIf;
  const rows: Array<{ label: string; v: number; goodPos: boolean }> = [
    { label: w.meters.trust, v: b.deltas.trust, goodPos: true },
    { label: w.meters.tension, v: b.deltas.tension, goodPos: false },
    { label: w.meters.info, v: b.deltas.info, goodPos: true },
  ];
  return (
    <div className={`wi-col${alt ? " alt" : ""}`}>
      <div className="wi-collabel">{label}</div>
      <div className="wi-meters">
        {rows.map((r, i) => {
          const good = r.v === 0 ? "neutral" : (r.goodPos ? r.v > 0 : r.v < 0) ? "good" : "bad";
          // Only the alt column grows on reveal; the original is static context.
          const width = alt ? (grown ? meterWidth(r.v) : 0) : meterWidth(r.v);
          return (
            <div className="wi-meter" key={i}>
              <span className="wi-mlabel">{r.label}</span>
              <span className={`wi-mval ${good}`}>{fmtDelta(r.v)}</span>
              <span className="wi-mtrack">
                <span className={`wi-mfill ${good}`} style={{ width: `${width}%` }} />
              </span>
            </div>
          );
        })}
      </div>
      <div className="wi-offer">
        <span>{w.offerLabel}</span>
        <b>{formatDeal(b.state.offer_opp, unit ?? "", lang)}</b>
      </div>
      <div className="wi-oline">
        <span className="wi-olabel">{w.opponentLabel}</span>
        «{b.opponent_line}»
      </div>
    </div>
  );
}

// Signed delta as "+5" / "−3" / "0" (typographic minus).
function fmtDelta(v: number): string {
  const r = Math.round(v);
  if (r === 0) return "0";
  return `${r > 0 ? "+" : "−"}${Math.abs(r)}`;
}

// Scale a meter delta to a bar width (capped). Tension can swing ~26 → ~68%.
function meterWidth(v: number): number {
  return Math.min(100, Math.abs(v) * 2.6);
}
