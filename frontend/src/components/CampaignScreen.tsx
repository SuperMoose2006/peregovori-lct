// CampaignScreen.tsx — the "Восхождение" (campaign) UI: a vertical story arc of
// acts on the home screen (CampaignArc), and the end-of-campaign summary
// (CampaignComplete). The engine/backend own scoring; this only renders the
// running narrative + reputation the App tracks between stages.
import type { CampaignView, Lang } from "../types";
import type { Strings } from "../i18n";
import { COURSE_BLOCKS } from "../lib/course";

// Per-stage record the App accumulates as the player advances the arc.
export interface StageResult {
  grade: string;
  overall: number;
}

// Campaign progress lives in App state (see App.tsx). stageIndex is the act to
// play next (0..N); === stages.length means the campaign is finished.
export interface CampaignProgress {
  stageIndex: number;
  reputation: number; // running -100..100 carried into the next stage's trust
  results: StageResult[];
}

const GRADE_COLOR: Record<string, string> = {
  A: "var(--trust)",
  B: "var(--info)",
  C: "var(--brass)",
  D: "#d98a3c",
  F: "var(--tension)",
};

// Average overall → a coarse grade band → a verdict title on the summit screen.
export function averageGrade(results: StageResult[]): { avg: number; grade: string } {
  if (results.length === 0) return { avg: 0, grade: "F" };
  const avg = Math.round(results.reduce((s, r) => s + r.overall, 0) / results.length);
  const grade = avg >= 85 ? "A" : avg >= 70 ? "B" : avg >= 55 ? "C" : avg >= 40 ? "D" : "F";
  return { avg, grade };
}

function Difficulty({ n }: { n: number }) {
  return (
    <div className="diff">
      {Array.from({ length: 5 }, (_, i) => (
        <i className={i < n ? "on" : ""} key={i} />
      ))}
    </div>
  );
}

// One act row in the arc. `status` drives the node glyph + badge.
/** Блоки курса, которые тренируются на этом же сценарии.
 *
 *  Связь не выдумана «для красоты»: у блока курса ЕСТЬ сценарий, на котором он
 *  ставит навык, и это ровно те же восемь сценариев, из которых собрана
 *  кампания. Акт, у которого не сходится ни один блок, просто не покажет строку.
 */
function blocksForScenario(scenarioId: string) {
  return COURSE_BLOCKS.filter((b) => b.scenario_id === scenarioId);
}

function ActRow({
  t,
  lang,
  index,
  total,
  stage,
  status,
  result,
  onCourse,
  onWarmup,
}: {
  t: Strings;
  lang: Lang;
  index: number;
  total: number;
  stage: CampaignView["stages"][number];
  status: "done" | "current" | "locked";
  result?: StageResult;
  onCourse?: (blockId: string) => void;
  onWarmup?: (blockId: string) => void;
}) {
  const node =
    status === "done" && result ? (
      <span className="grade" style={{ color: GRADE_COLOR[result.grade] || "var(--brass)" }}>
        {result.grade}
      </span>
    ) : status === "locked" ? (
      <span className="lock" aria-hidden="true">🔒</span>
    ) : (
      <span className="num">{index + 1}</span>
    );

  const badge =
    status === "done" ? t.campaign.done : status === "current" ? t.campaign.current : t.campaign.locked;

  return (
    <li className={`act ${status}`}>
      <div className="act-node">
        {node}
        {/* The bouncing flag over the current node: on a path, the player must
            never have to read to find out where they are. */}
        {status === "current" ? <span className="act-flag">{t.campaign.startFlag}</span> : null}
      </div>
      <div className="act-body">
        <div className="act-label">{stage.act}</div>
        <div className="act-title">
          <span className="act-ic">{stage.icon}</span>
          {stage.title}
        </div>
        <div className="act-meta">
          <Difficulty n={stage.difficulty} />
          <span className="act-of">{t.campaign.actOf.replace("{n}", String(index + 1)).replace("{total}", String(total))}</span>
          <span className={`act-badge ${status}`}>{badge}</span>
        </div>
        {status === "current" ? <p className="act-intro">{stage.intro}</p> : null}
        {status === "current" && onCourse && blocksForScenario(stage.scenario_id).length ? (
          <p className="act-course">
            <span>{t.course.actTeaches}:</span>
            {blocksForScenario(stage.scenario_id).map((b) => (
              <button key={b.id} className="act-course-b" onClick={() => onCourse(b.id)}>
                {b.icon} {b.title[lang]}
              </button>
            ))}
            {/* Разминка: два задания на приём этого акта — и сразу за стол.
                Пропустить можно всегда, это разгон, а не пропуск в акт. */}
            {onWarmup ? (
              <button className="act-course-b warm"
                      onClick={() => onWarmup(blocksForScenario(stage.scenario_id)[0].id)}>
                {t.course.warmupCta}
              </button>
            ) : null}
          </p>
        ) : null}
      </div>
    </li>
  );
}

// The arc shown on the home screen when "Кампания" is selected.
export function CampaignArc({
  t,
  lang,
  campaign,
  progress,
  onBegin,
  onCourse,
  onWarmup,
}: {
  t: Strings;
  lang: Lang;
  campaign: CampaignView | null;
  progress: CampaignProgress;
  onBegin: () => void;
  /** Открыть блок курса, который тренирует приём текущего акта. */
  onCourse?: (blockId: string) => void;
  /** Разминка перед актом: два задания из того же блока, потом сразу стол. */
  onWarmup?: (blockId: string) => void;
}) {
  if (!campaign) {
    return <p className="lead" style={{ padding: "24px 0" }}>{t.connecting}</p>;
  }
  const total = campaign.stages.length;
  const idx = progress.stageIndex;
  const finished = idx >= total;
  const cta = idx === 0 ? t.campaign.begin : finished ? t.campaign.seeResults : t.campaign.continue;

  return (
    <>
      <div className="section-head">{t.campaign.overviewHead}</div>
      <div className="camp">
        <div className="camp-head">
          <div className="camp-ic">{campaign.icon}</div>
          <div className="camp-heading">
            <h2 className="camp-title">{campaign.title}</h2>
            <p className="camp-tag">{campaign.tagline}</p>
          </div>
          {progress.results.length > 0 ? (
            <div className={`camp-rep ${progress.reputation >= 0 ? "pos" : "neg"}`}>
              <span className="camp-rep-l">{t.campaign.reputation}</span>
              <b>{progress.reputation >= 0 ? `+${progress.reputation}` : progress.reputation}</b>
            </div>
          ) : null}
        </div>

        <ol className="arc">
          {campaign.stages.map((stage, i) => (
            <ActRow
              key={stage.scenario_id + i}
              t={t}
              lang={lang}
              index={i}
              total={total}
              stage={stage}
              status={i < idx ? "done" : i === idx ? "current" : "locked"}
              result={progress.results[i]}
              onCourse={onCourse}
              onWarmup={onWarmup}
            />
          ))}
        </ol>

        <button className="primary camp-cta" onClick={onBegin}>
          {cta}
        </button>
      </div>
    </>
  );
}

// The end-of-campaign summit screen: the four acts with their grades + a verdict.
export function CampaignComplete({
  t,
  lang,
  campaign,
  progress,
  onReplay,
  onHome,
}: {
  t: Strings;
  lang: Lang;
  campaign: CampaignView;
  progress: CampaignProgress;
  onReplay: () => void;
  onHome: () => void;
}) {
  const { avg, grade } = averageGrade(progress.results);
  const gc = GRADE_COLOR[grade] || "var(--brass)";

  return (
    <section className="screen">
      <div className="wrap">
        <div className="debrief cert">
          <div className="camp-done-head">
            <div className="camp-ic big">{campaign.icon}</div>
            <div className="cert-eyebrow">🏔 {t.campaign.completeEyebrow}</div>
            <h2>{t.campaign.completeTitle}</h2>
            <div className="verdict serif" style={{ color: gc }}>
              {t.campaign.verdicts[grade]}
            </div>
            <div className="camp-avg">
              {t.campaign.avgLabel}: <b>{avg}/100</b>
            </div>
          </div>

          <ol className="arc final">
            {campaign.stages.map((stage, i) => (
              <ActRow
                key={stage.scenario_id + i}
                t={t}
                lang={lang}
                index={i}
                total={campaign.stages.length}
                stage={stage}
                status="done"
                result={progress.results[i]}
              />
            ))}
          </ol>

          <div className="dacts">
            <button className="primary" onClick={onReplay}>
              ↻ {t.campaign.replay}
            </button>
            <button className="quit" onClick={onHome}>
              {t.toHome}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
