// ScenarioPicker.tsx — содержимое главной колонки для выбранного режима.
// Сам ВЫБОР режима живёт в сайдбаре (SideNav) и только там: дублирующий ряд
// кнопок здесь был, но всегда отключался пропом, то есть не показывался никогда.
// practice/exam — полка сценариев, campaign — арка, custom — поле ввода.
import { useState } from "react";
import type { CampaignView, Lang, Mode, ScenarioContext } from "../types";
import type { Strings } from "../i18n";
import { catalog, SCENARIO_MAP } from "../data/scenarios";
import { Avatar } from "./Avatar";
import { getRecord, type NextStepPick, type Profile } from "../lib/progress";
import { CustomSituation } from "./CustomSituation";
import { CampaignArc, CampaignPicker, type CampaignProgress } from "./CampaignScreen";
import { blockById } from "../lib/courseMap";
import { dailyTable } from "../lib/daily";
import { MascotImg } from "./Mascot";
import { filterCatalog, scenarioTopic, type CatalogDifficulty, type CatalogTopic } from "../lib/catalogFilter";
import { Icon, DataIcon } from "./Icon";
import { DIFFICULTY_MODES, difficultyLabel, normalizeDifficulty } from "../lib/difficulty";
import { DifficultyIndicator } from "./DifficultyIndicator";

const BROWSE = {
  ru: {
    eyebrow: "Практика настоящих разговоров", title: "Договариваться — навык.", accent: "Тренируйте его здесь.",
    subtitle: "Пробуйте разные подходы, замечайте реакцию собеседника и находите решение, которое устроит обоих.",
    search: "Найти ситуацию", placeholder: "Зарплата, аренда, сложный разговор…",
    all: "Все ситуации", career: "Карьера", business: "Бизнес", life: "Жизнь", topicLabel: "Сфера переговоров",
    level: "Режим уступок", allLevels: "Любой режим уступок",
    count: "Показано {n} из {total}", empty: "Такой ситуации пока нет", emptyBody: "Попробуйте другое слово или снимите фильтры.", reset: "Сбросить фильтры",
    practice: "Можно ошибаться. Можно переиграть.",
    examTitle: "Проверьте себя без подсказок", examBody: "Выберите знакомую или новую ситуацию. В конце — оценка ваших решений и сертификат за успешную партию.",
  },
  en: {
    eyebrow: "Practice for real conversations", title: "Negotiation is a skill.", accent: "Make it yours.",
    subtitle: "Try a different approach, read your opponent’s response and find an agreement that works for both of you.",
    search: "Find a situation", placeholder: "Salary, rent, a difficult conversation…",
    all: "All situations", career: "Career", business: "Business", life: "Everyday life", topicLabel: "Negotiation context",
    level: "Concession mode", allLevels: "Any concession mode",
    count: "Showing {n} of {total}", empty: "No matching situations yet", emptyBody: "Try another search or clear your filters.", reset: "Clear filters",
    practice: "Room to make mistakes. Room to try again.",
    examTitle: "Put your skills to the test", examBody: "Choose a familiar situation or try a new one. Get feedback on your decisions and earn a certificate for a successful negotiation.",
  },
} as const;

const GRADE_COLOR: Record<string, string> = {
  A: "var(--trust-ink)",
  B: "var(--info-ink)",
  C: "var(--brass)",
  D: "var(--ink)",
  F: "var(--tension-ink)",
};

interface Props {
  t: Strings;
  lang: Lang;
  mode: Mode;
  onStart: (scenarioId: string) => void;
  // custom-mode wiring
  situation: string;
  customError: string | null;
  onSituationChange: (v: string) => void;
  onStartCustom: () => void;
  customContext?: ScenarioContext;
  onCustomContextChange?: (context: ScenarioContext) => void;
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
  /** Открыть конкретный блок курса — из акта кампании. */
  onCourseBlock?: (blockId: string) => void;
  /** Разминка перед актом кампании. */
  onWarmup?: (blockId: string) => void;
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
      why = lang === "ru"
        ? `${difficultyLabel(pick.difficulty, lang)} — начните с этого режима, чтобы освоить вопросы, аргументы и размен условий.`
        : `${difficultyLabel(pick.difficulty, lang)} — start here to practise questions, arguments and trading terms.`;
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
  t, lang, mode, onStart,
  situation, customError, onSituationChange, onStartCustom, customContext, onCustomContextChange,
  campaign, campaignProgress, onBeginStage, profile,
  campaigns = [], campaignProgressOf, onPickCampaign,
  examName, onExamNameChange, onCourseBlock, onWarmup,
  route = null, onRoute,
}: Props) {
  const [query, setQuery] = useState("");
  const [topic, setTopic] = useState<CatalogTopic>("all");
  const [difficulty, setDifficulty] = useState<CatalogDifficulty>("all");
  const copy = BROWSE[lang];
  const allRows = catalog(lang);
  const rows = filterCatalog(allRows, query, topic, difficulty);
  const filtered = !!query.trim() || topic !== "all" || difficulty !== "all";
  const reset = () => { setQuery(""); setTopic("all"); setDifficulty("all"); };
  return (
    <>
      {mode === "practice" ? (
        <header className="practice-intro">
          <span className="practice-eyebrow"><span aria-hidden="true">✦</span> {copy.eyebrow}</span>
          <h2>{copy.title}<br /><span>{copy.accent}</span></h2>
          <p>{copy.subtitle}</p>
          <span className="practice-promise"><span aria-hidden="true">✓</span> {copy.practice}</span>
        </header>
      ) : null}
      {/* Маршрут стоит ПЕРВЫМ и только в тренировке: в кампании колонку занимает
          арка, в «своей сделке» — поле ввода, а на экзамене подталкивать вообще
          нечем. Всё остальное на главной после этого — вторым весом. */}
      {route && onRoute && mode === "practice" ? (
        <NextStepCard t={t} lang={lang} pick={route} campaigns={campaigns} onGo={onRoute} />
      ) : null}
      {mode === "custom" ? (
        <CustomSituation
          t={t}
          lang={lang}
          value={situation}
          error={customError}
          onChange={onSituationChange}
          onGenerate={onStartCustom}
          context={customContext}
          onContextChange={onCustomContextChange}
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
            <><header className="practice-intro exam-intro"><span className="practice-eyebrow">{t.modes.exam.title}</span><h2>{copy.examTitle}</h2><p>{copy.examBody}</p></header><div className="exam-name">
              <label htmlFor="exam-name-input"><Icon name="trophy" /> {t.exam.nameLabel}</label>
              <input
                id="exam-name-input"
                type="text"
                value={examName}
                maxLength={48}
                placeholder={t.exam.namePlaceholder}
                onChange={(e) => onExamNameChange(e.target.value)}
              />
            </div></>
          ) : null}
          <section className="catalog-browser" aria-label={t.pickHead}>
          <div className="catalog-heading"><h2>{t.pickHead}</h2><span role="status" aria-live="polite">{copy.count.replace("{n}", String(rows.length)).replace("{total}", String(allRows.length))}</span></div>
          <div className="catalog-toolbar">
            <label className="catalog-search"><span className="sr-only">{copy.search}</span><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4.5 4.5" /></svg><input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={copy.placeholder} maxLength={120} /></label>
            <label className="catalog-level"><span className="sr-only">{copy.level}</span><select value={difficulty} onChange={(e) => setDifficulty(e.target.value === "all" ? "all" : normalizeDifficulty(Number(e.target.value)))}><option value="all">{copy.allLevels}</option>{DIFFICULTY_MODES.map((value) => <option key={value} value={value}>{difficultyLabel(value, lang)}</option>)}</select></label>
          </div>
          <div className="catalog-topics" role="group" aria-label={copy.topicLabel}>
            {(["all", "career", "business", "life"] as const).map((value) => <button type="button" className={topic === value ? "selected" : ""} aria-pressed={topic === value} key={value} onClick={() => setTopic(value)}>{copy[value]}</button>)}
            {filtered ? <button className="catalog-reset" onClick={reset}>{copy.reset}</button> : null}
          </div>
          {rows.length === 0 ? <div className="catalog-empty"><span aria-hidden="true">⌕</span><h3>{copy.empty}</h3><p>{copy.emptyBody}</p><button className="ghost" onClick={reset}>{copy.reset}</button></div> : null}
          <div className="cards" id="scenario-results">
            {rows.map((sc) => (
              <button className="card" key={sc.id} onClick={() => onStart(sc.id)} data-scenario={sc.id}>
                {/* Meet-your-8-opponents: the same portrait as the table, at a
                    neutral expression (no live state to read yet). The deal-type
                    emoji rides in a small corner badge so the card stays legible. */}
                <div className="ic">
                  <Avatar scenarioId={sc.id} mood="neutral" label={sc.title} />
                  <span className="ic-badge" aria-hidden="true"><DataIcon name={sc.icon} /></span>
                </div>
                <span className="card-topic">{copy[scenarioTopic(sc.id)]}</span>
                <div className="ct">{sc.title}</div>
                <div className="cr">{sc.role}</div>
                <div className="cf">
                  <div className="cf-l">
                    <DifficultyIndicator value={sc.difficulty} lang={lang} />
                    <BestChip t={t} profile={profile} id={sc.id} />
                  </div>
                  <div className="go">{lang === "ru" ? "Начать →" : "Start →"}</div>
                </div>
              </button>
            ))}
          </div>
          </section>
        </>
      )}
    </>
  );
}
