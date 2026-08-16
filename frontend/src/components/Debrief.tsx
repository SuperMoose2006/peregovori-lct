// Debrief.tsx — post-negotiation report: grade ring (A–F), three score bars
// (economic / relationship / technique), stat cells, coaching tips, retry/home.
import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { Debrief as DebriefData, Lang, Mode } from "../types";
import type { Strings } from "../i18n";
import type { GameResult, RecordResult } from "../lib/progress";
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
}

export function Debrief({ t, d, mode, lang, scenarioTitle, record, game, onRetry, onHome, onNext, nextLabel }: Props) {
  const gc = GRADE_COLOR[d.grade] || "var(--brass)";
  // Exam reads like a certificate: same score/stats/tips, ceremonial framing.
  const exam = mode === "exam";
  // Animate the bars in from 0 after mount.
  const [grown, setGrown] = useState(false);
  const raf = useRef<number>();
  useEffect(() => {
    raf.current = requestAnimationFrame(() => setGrown(true));
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, []);

  const bars: Array<{ label: string; v: number; color: string }> = [
    { label: t.sb.economic, v: d.economic, color: "var(--brass)" },
    { label: t.sb.relationship, v: d.relationship, color: "var(--trust)" },
    { label: t.sb.technique, v: d.technique, color: "var(--leverage)" },
  ];

  const cells: Array<{ n: string; l: string }> = [
    { n: `${d.spin_stages}/3`, l: t.stat.spin },
    { n: String(d.objective_criteria), l: t.stat.criteria },
    { n: String(d.empathy), l: t.stat.empathy },
    { n: `${d.interests_found}/${d.interests_total}`, l: t.stat.interests },
    { n: String(d.tradeoffs), l: t.stat.tradeoffs },
    { n: String(d.threats), l: t.stat.threats },
    { n: String(d.avg_arg), l: t.stat.arg },
  ];

  return (
    <section className="screen">
      <div className="wrap">
        <div className={exam ? "debrief cert" : "debrief"}>
          <div className="gh">
            <div
              className="ring"
              style={
                {
                  ["--p" as string]: grown ? d.overall : 0,
                  ["--gc" as string]: gc,
                } as CSSProperties
              }
            >
              <span className="gl" style={{ color: gc }}>
                {d.grade}
              </span>
              <span className="gs">{d.overall}/100</span>
            </div>
            <div>
              {exam ? <div className="cert-eyebrow">🏆 {t.exam.eyebrow}</div> : null}
              <h2>{exam ? t.exam.resultTitle : t.debriefTitle}</h2>
              {exam && scenarioTitle ? (
                <div className="cert-scenario">
                  {t.exam.scenarioLabel}: <b>{scenarioTitle}</b>
                </div>
              ) : null}
              <div className="oc">
                {t.outcome[d.status]} · <b>{d.deal_text}</b>
              </div>
              {record && record.record.bestGrade ? (
                <div className={`pb${record.improved ? " beat" : ""}`}>
                  <span className="pb-l">
                    {t.personalBest}: <b>{record.record.bestGrade} ({record.record.bestScore})</b>
                  </span>
                  {record.improved ? (
                    <span className="pb-new">
                      ▲ {t.newRecord}
                      {record.prevBest && record.prevBest.grade
                        ? ` +${Math.max(0, record.record.bestScore - record.prevBest.score)}`
                        : ""}
                    </span>
                  ) : null}
                </div>
              ) : null}
              {game ? <XpAward t={t} lang={lang} game={game} /> : null}
            </div>
          </div>

          <div className="sb">
            {bars.map((b, i) => (
              <div className="sbi" key={i}>
                <div className="sbh">
                  <span>{b.label}</span>
                  <b>{b.v}</b>
                </div>
                <div className="sbt">
                  <div
                    className="sbf"
                    style={{ width: grown ? `${b.v}%` : "0%", background: b.color }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="stats">
            {cells.map((c, i) => (
              <div className="st" key={i}>
                <div className="n">{c.n}</div>
                <div className="l">{c.l}</div>
              </div>
            ))}
          </div>

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
