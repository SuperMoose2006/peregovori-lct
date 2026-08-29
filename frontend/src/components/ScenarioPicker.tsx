// ScenarioPicker.tsx — mode picker (Практика · Своя сделка · Экзамен wired;
// Кампания shown as a "soon" card). For library modes it lists scenario cards;
// for "custom" it swaps in the free-text situation input (CustomSituation).
import type { CampaignView, Lang, Mode } from "../types";
import type { Strings } from "../i18n";
import { catalog, SCENARIO_MAP } from "../data/scenarios";
import { Avatar } from "./Avatar";
import { getRecord, type NextStepPick, type Profile } from "../lib/progress";
import { CustomSituation } from "./CustomSituation";
import { CampaignArc, CampaignPicker, type CampaignProgress } from "./CampaignScreen";
import { blockById } from "../lib/courseMap";
import { dailyTable } from "../lib/daily";
import { MascotImg } from "./Mascot";

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
  /** Все кампании и выбранная. Вторая кампания («Своё дело») до этого не имела
   *  входа вовсе: App показывал `cs[0]`. */
  campaigns?: CampaignView[];
  campaignProgressOf?: (id: string) => CampaignProgress;
  onPickCampaign?: (id: string) => void;
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
  /** Открыть конкретный блок курса — из акта кампании. */
  onCourseBlock?: (blockId: string) => void;
  /** Разминка перед актом кампании. */
  onWarmup?: (blockId: string) => void;
  courseDone?: number;
  courseTotal?: number;
  /** «Ваш следующий шаг»: что показать и куда это ведёт. null — карточки нет. */
  route?: NextStepPick | null;
  onRoute?: (pick: NextStepPick) => void;
}

/**
 * «Ваш следующий шаг» — первая карточка основной колонки.
 *
 * До неё главная предлагала девять одинаковых столов с девятью одинаковыми
 * зелёными «НАЧАТЬ →», шесть пунктов меню без порядка и пять виджетов с нулями.
 * Все входы честные, ни один не первый: новичок садился за «Раунд с инвестором»
 * (пять точек сложности) с тем же основанием, что за «Контракт с поставщиком»
 * (две). Карточка НАЗЫВАЕТ один шаг и говорит, почему именно он.
 *
 * Правило выбора здесь не живёт: его считает `chooseNextStep` (lib/progress.ts),
 * чистая функция под тестом. Здесь только показ и один клик.
 */
export function NextStepCard({ t, lang, pick, campaigns, onGo }: {
  t: Strings;
  lang: Lang;
  pick: NextStepPick;
  campaigns: CampaignView[];
  onGo: (pick: NextStepPick) => void;
}) {
  const sub = (s: string, vars: Record<string, string | number>) =>
    Object.entries(vars).reduce((acc, [k, v]) => acc.split(`{${k}}`).join(String(v)), s);
  const table = pick.scenarioId ? SCENARIO_MAP[pick.scenarioId] : undefined;
  const tableTitle = table ? table.title[lang] : (pick.scenarioId ?? "");
  const block = pick.blockId ? blockById(pick.blockId) : undefined;
  const camp = campaigns.find((c) => c.id === pick.campaignId) ?? null;

  let title = "";
  let why = "";
  let cta = "";
  let state = "point";
  switch (pick.kind) {
    case "first":
      title = sub(t.route.firstTitle, { table: tableTitle });
      why = sub(t.route.firstWhy, { diff: pick.difficulty });
      cta = t.route.firstCta;
      state = "wave";
      break;
    case "course":
      title = sub(t.route.courseTitle, { block: block ? block.title[lang] : "" });
      why = pick.resumed ? t.route.courseWhy : t.route.courseWhyNew;
      cta = t.route.courseCta;
      state = "study";
      break;
    case "rematch":
      title = sub(t.route.rematchTitle, { table: tableTitle });
      why = sub(t.route.rematchWhy, { grade: pick.grade ?? "", score: pick.score });
      cta = t.route.rematchCta;
      break;
    case "campaign":
      title = sub(t.route.campaignTitle, {
        campaign: camp ? camp.title : "",
        n: pick.stageIndex + 1,
        total: camp ? camp.stages.length : 0,
      });
      why = camp ? (camp.stages[pick.stageIndex]?.title ?? "") : "";
      why = sub(t.route.campaignWhy, { act: why });
      cta = t.route.campaignCta;
      break;
    default:
      title = sub(t.route.dailyTitle, { table: tableTitle });
      why = sub(t.route.dailyWhy, { mod: dailyTable().modifier.label[lang].toLowerCase() });
      cta = t.route.dailyCta;
      state = "cheer";
  }

  return (
    <section className={`route route--${pick.kind}`}>
      <div className="section-head">{t.route.head}</div>
      <div className="route-card">
        {/* Картинка декоративная: карточка и так называет шаг словами, а второй
            голос над ней диктор прочитал бы эхом. */}
        <MascotImg dir="karl" state={state} alt="" size={72} className="route-karl" />
        <div className="route-txt">
          <h2 className="route-title">{title}</h2>
          <p className="route-why">{why}</p>
        </div>
        <button className="primary route-cta" onClick={() => onGo(pick)}>{cta}</button>
      </div>
    </section>
  );
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
  campaigns = [], campaignProgressOf, onPickCampaign,
  examName, onExamNameChange, hideModes, onCourse, onCourseBlock, onWarmup,
  courseDone = 0, courseTotal = 0, route = null, onRoute,
}: Props) {
  const rows = catalog(lang);
  return (
    <>
      {/* Маршрут стоит ПЕРВЫМ и только в тренировке: в кампании колонку занимает
          арка, в «своей сделке» — поле ввода, а на экзамене подталкивать вообще
          нечем. Всё остальное на главной после этого — вторым весом. */}
      {route && onRoute && mode === "practice" ? (
        <NextStepCard t={t} lang={lang} pick={route} campaigns={campaigns} onGo={onRoute} />
      ) : null}
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
        <>
          {campaignProgressOf && onPickCampaign ? (
            <CampaignPicker t={t} campaigns={campaigns} active={campaign?.id ?? null}
                            progressOf={campaignProgressOf} onPick={onPickCampaign} />
          ) : null}
          <CampaignArc t={t} lang={lang} campaign={campaign} progress={campaignProgress}
                       onBegin={onBeginStage} onCourse={onCourseBlock} onWarmup={onWarmup} />
        </>
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
