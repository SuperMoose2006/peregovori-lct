// ScenarioPicker.tsx — mode picker (Практика · Своя сделка · Экзамен wired;
// Кампания shown as a "soon" card). For library modes it lists scenario cards;
// for "custom" it swaps in the free-text situation input (CustomSituation).
import type { CampaignView, Lang, Mode } from "../types";
import type { Strings } from "../i18n";
import { catalog } from "../data/scenarios";
import { Avatar } from "./Avatar";
import { getRecord, type Profile } from "../lib/progress";
import { CustomSituation } from "./CustomSituation";
import { CampaignArc, type CampaignProgress } from "./CampaignScreen";

const GRADE_COLOR: Record<string, string> = {
  A: "var(--trust)",
  B: "var(--info)",
  C: "var(--brass)",
  D: "#d98a3c",
  F: "var(--tension)",
};

const MODES: Mode[] = ["practice", "campaign", "custom", "exam"];
const WIRED: Record<Mode, boolean> = { practice: true, campaign: true, custom: true, exam: true };

interface Props {
  t: Strings;
  lang: Lang;
  mode: Mode;
  onSelectMode: (m: Mode) => void;
  onStart: (scenarioId: string) => void;
  // custom-mode wiring
  situation: string;
  customError: string | null;
  onSituationChange: (v: string) => void;
  onStartCustom: () => void;
  // campaign-mode wiring
  campaign: CampaignView | null;
  campaignProgress: CampaignProgress;
  onBeginStage: () => void;
  // retention profile → best-grade badges on scenario cards
  profile: Profile;
  // exam-mode wiring: the (optional) name printed on a passing certificate.
  examName: string;
  onExamNameChange: (v: string) => void;
  /** True in the game skin, whose sidebar already lists the modes. */
  hideModes?: boolean;
  /** Курс приёмов — не режим партии, но входить в него надо оттуда же.
      В скине «додзё» сайдбара нет вовсе, и без этой карточки курс недостижим. */
  onCourse?: () => void;
  courseDone?: number;
  courseTotal?: number;
}

// Best-grade chip in a card's difficulty-row: the letter + best score in brass
// when the player has cleared it, a subtle "—" when they haven't. This is the
// at-a-glance "beat your record" hook on the scenario shelf.
function BestChip({ t, profile, id }: { t: Strings; profile: Profile; id: string }) {
  const r = getRecord(profile, id);
  if (!r || !r.bestGrade) {
    return <span className="best empty" title={t.notPlayed}>—</span>;
  }
  return (
    <span className="best" style={{ color: GRADE_COLOR[r.bestGrade] || "var(--brass)" }}>
      {r.bestGrade} · {r.bestScore}
    </span>
  );
}

export function ScenarioPicker({
  t, lang, mode, onSelectMode, onStart,
  situation, customError, onSituationChange, onStartCustom,
  campaign, campaignProgress, onBeginStage, profile,
  examName, onExamNameChange, hideModes, onCourse, courseDone = 0, courseTotal = 0,
}: Props) {
  const rows = catalog(lang);
  return (
    <>
      {/* The game skin's sidebar already carries all four modes, so the row is a
          duplicate there. Removed rather than CSS-hidden: a hidden-but-focusable
          copy of the navigation is worse for keyboard users than none at all. */}
      {hideModes ? null : (
      <>
      <div className="section-head">{t.modesHead}</div>
      <div className="modes">
        {MODES.map((m) => {
          const wired = WIRED[m];
          const cls = `mode${mode === m ? " sel" : ""}${wired ? "" : " disabled"}`;
          return (
            <button
              key={m}
              className={cls}
              disabled={!wired}
              onClick={() => wired && onSelectMode(m)}
            >
              {!wired ? <span className="soon">{t.soon}</span> : null}
              <span className="mt">{t.modes[m].title}</span>
              <span className="md">{t.modes[m].desc}</span>
            </button>
          );
        })}
        {onCourse ? (
          <button className="mode course-mode" onClick={onCourse}>
            <span className="mt">{t.course.title}</span>
            <span className="md">
              {t.course.blocksDone.replace("{n}", String(courseDone)).replace("{total}", String(courseTotal))}
            </span>
          </button>
        ) : null}
      </div>
      </>
      )}

      {mode === "custom" ? (
        <CustomSituation
          t={t}
          lang={lang}
          value={situation}
          error={customError}
          onChange={onSituationChange}
          onGenerate={onStartCustom}
        />
      ) : mode === "campaign" ? (
        <CampaignArc t={t} campaign={campaign} progress={campaignProgress} onBegin={onBeginStage} />
      ) : (
        <>
          {mode === "exam" ? (
            <div className="exam-name">
              <label htmlFor="exam-name-input">🏆 {t.exam.nameLabel}</label>
              <input
                id="exam-name-input"
                type="text"
                value={examName}
                maxLength={48}
                placeholder={t.exam.namePlaceholder}
                onChange={(e) => onExamNameChange(e.target.value)}
              />
            </div>
          ) : null}
          <div className="section-head">{t.pickHead}</div>
          <div className="cards">
            {rows.map((sc) => (
              <button className="card" key={sc.id} onClick={() => onStart(sc.id)}>
                {/* Meet-your-8-opponents: the same portrait as the table, at a
                    neutral expression (no live state to read yet). The deal-type
                    emoji rides in a small corner badge so the card stays legible. */}
                <div className="ic">
                  <Avatar scenarioId={sc.id} mood="neutral" label={sc.title} />
                  <span className="ic-badge" aria-hidden="true">{sc.icon}</span>
                </div>
                <div className="ct">{sc.title}</div>
                <div className="cr">{sc.role}</div>
                <div className="cf">
                  <div className="cf-l">
                    <div className="diff">
                      {Array.from({ length: 5 }, (_, i) => (
                        <i className={i < sc.difficulty ? "on" : ""} key={i} />
                      ))}
                    </div>
                    <BestChip t={t} profile={profile} id={sc.id} />
                  </div>
                  <div className="go">{lang === "ru" ? "Начать →" : "Start →"}</div>
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </>
  );
}
