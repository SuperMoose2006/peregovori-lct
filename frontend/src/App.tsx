// App.tsx — screen router (home / game / debrief / campaign) with RU/EN + light/dark toggles.
import { useCallback, useEffect, useRef, useState } from "react";
import type { CampaignView, Debrief as DebriefData, Lang, Mode } from "./types";
import { I18N } from "./i18n";
import { useNegotiation } from "./api/useNegotiation";
import { getCampaigns } from "./api/campaigns";
import { ScenarioPicker } from "./components/ScenarioPicker";
import { Table } from "./components/Table";
import { Debrief } from "./components/Debrief";
import { CampaignComplete, type CampaignProgress } from "./components/CampaignScreen";
import { loadProfile, recordDebrief, saveProfile, type Grade, type Profile, type RecordResult } from "./lib/progress";

type Screen = "home" | "generating" | "game" | "debrief" | "campaign_done";
type Theme = "light" | "dark" | null;

const INITIAL_PROGRESS: CampaignProgress = { stageIndex: 0, reputation: 0, results: [] };
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export default function App() {
  const [lang, setLang] = useState<Lang>("ru");
  const [theme, setTheme] = useState<Theme>(null);
  const [screen, setScreen] = useState<Screen>("home");
  const [mode, setMode] = useState<Mode>("practice");
  const [currentScenario, setCurrentScenario] = useState<string | null>(null);
  const [situation, setSituation] = useState("");
  // Campaign ("Восхождение"): the fetched arc + the player's running progress
  // (which act is next, accumulated reputation, and per-act grades).
  const [campaign, setCampaign] = useState<CampaignView | null>(null);
  const [progress, setProgress] = useState<CampaignProgress>(INITIAL_PROGRESS);
  // Dedupe recording a stage result: each debrief is a fresh object, so identity
  // tells one stage's debrief from the next (and from a reset).
  const recordedDebrief = useRef<DebriefData | null>(null);
  // Retention profile (localStorage): best grades, attempts, day streak. Loaded
  // once; each debrief folds in a result and re-persists. `lastRecord` carries
  // the just-finished run's personal-best delta to the Debrief screen.
  const [profile, setProfile] = useState<Profile>(() => loadProfile());
  const [lastRecord, setLastRecord] = useState<RecordResult | null>(null);
  const recordedProgress = useRef<DebriefData | null>(null);

  const nego = useNegotiation(lang);
  const t = I18N[lang];

  // Apply theme to the document root (drives the CSS variables).
  useEffect(() => {
    const root = document.documentElement;
    if (theme) root.setAttribute("data-theme", theme);
    else root.removeAttribute("data-theme");
  }, [theme]);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  // When a debrief arrives, advance to the debrief screen.
  useEffect(() => {
    if (nego.debrief) setScreen("debrief");
  }, [nego.debrief]);

  // Record every finished negotiation into the retention profile (any mode):
  // best-only-if-improved, attempts++, day streak. Deduped per debrief object.
  // Read fresh from storage before writing so the update is idempotent even if
  // React batching replays this effect.
  useEffect(() => {
    if (!nego.debrief) return;
    if (recordedProgress.current === nego.debrief) return;
    recordedProgress.current = nego.debrief;
    const scenarioId = nego.scenario?.id ?? currentScenario ?? "custom";
    const res = recordDebrief(loadProfile(), scenarioId, nego.debrief.grade as Grade, nego.debrief.overall);
    saveProfile(res.profile);
    setProfile(res.profile);
    setLastRecord(res);
  }, [nego.debrief, nego.scenario, currentScenario]);

  // Custom mode: while generating, the scenario is designed server-side (or by
  // the mock synth). The greeting's arrival drops us into the game; an error
  // sends us back to the situation input (with the message + a retry button).
  useEffect(() => {
    if (screen === "generating" && nego.scenario) setScreen("game");
  }, [screen, nego.scenario]);
  useEffect(() => {
    if (screen === "generating" && nego.error) setScreen("home");
  }, [screen, nego.error]);

  // Load the campaign arc when the mode is active (refetch on lang change to
  // relocalize). Falls back to an offline synth if the backend is unreachable.
  useEffect(() => {
    if (mode !== "campaign") return;
    let cancelled = false;
    getCampaigns(lang).then((cs) => {
      if (!cancelled) setCampaign(cs[0] ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [mode, lang]);

  // When a campaign stage's debrief lands, record its result: push the grade,
  // advance the arc, and fold (overall − 50) into the running reputation. The
  // engine still owns scoring — reputation is only the next stage's trust nudge.
  useEffect(() => {
    if (mode !== "campaign" || !nego.debrief || !campaign) return;
    if (recordedDebrief.current === nego.debrief) return;
    recordedDebrief.current = nego.debrief;
    const d = nego.debrief;
    setProgress((p) => ({
      stageIndex: p.stageIndex + 1,
      reputation: clamp(p.reputation + (d.overall - 50), -100, 100),
      results: [...p.results, { grade: d.grade, overall: d.overall }],
    }));
  }, [mode, nego.debrief, campaign]);

  const isDark = theme ? theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  const toggleTheme = () => setTheme(isDark ? "light" : "dark");

  const start = useCallback(
    (scenarioId: string) => {
      setCurrentScenario(scenarioId);
      nego.start(scenarioId, mode);
      setScreen("game");
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [mode, nego],
  );

  const startCustom = useCallback(() => {
    if (!situation.trim()) return;
    setCurrentScenario(null);
    nego.start("", "custom", situation);
    setScreen("generating");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [nego, situation]);

  // Launch the current campaign act, carrying the running reputation into it. If
  // the arc is already finished, jump to the summit summary instead.
  const beginStage = useCallback(() => {
    if (!campaign) return;
    const total = campaign.stages.length;
    if (progress.stageIndex >= total) {
      setScreen("campaign_done");
      return;
    }
    const stage = campaign.stages[progress.stageIndex];
    setCurrentScenario(stage.scenario_id);
    nego.start(stage.scenario_id, "campaign", undefined, progress.reputation);
    setScreen("game");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [campaign, progress.stageIndex, progress.reputation, nego]);

  // Debrief → advance: back to the arc overview (progress already recorded), or
  // to the summit summary after the final act.
  const nextAct = useCallback(() => {
    nego.reset();
    const total = campaign?.stages.length ?? 0;
    setScreen(progress.stageIndex >= total ? "campaign_done" : "home");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [nego, campaign, progress.stageIndex]);

  const replayCampaign = useCallback(() => {
    setProgress(INITIAL_PROGRESS);
    recordedDebrief.current = null;
    nego.reset();
    setScreen("home");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [nego]);

  // Switching modes clears a stale generation error from the custom view.
  const selectMode = useCallback(
    (m: Mode) => {
      nego.clearError();
      setMode(m);
    },
    [nego],
  );

  const goHome = useCallback(() => {
    nego.reset();
    setScreen("home");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [nego]);

  const retry = useCallback(() => {
    if (mode === "custom") startCustom();
    else if (currentScenario) start(currentScenario);
  }, [mode, currentScenario, start, startCustom]);

  return (
    <>
      <div className="top">
        <div className="brand">
          <span className="mark">
            Диалог<span className="dot">.</span>
          </span>
          <span className="sub">{t.tagline}</span>
        </div>
        <div className="controls">
          <div className="seg">
            <button className={lang === "ru" ? "on" : ""} onClick={() => setLang("ru")}>
              RU
            </button>
            <button className={lang === "en" ? "on" : ""} onClick={() => setLang("en")}>
              EN
            </button>
          </div>
          <div className="seg">
            <button onClick={toggleTheme} aria-label="theme">
              {isDark ? "☀" : "◐"}
            </button>
          </div>
        </div>
      </div>

      {screen === "home" && (
        <section className="screen">
          <div className="wrap">
            <div className="hero">
              <div className="eyebrow">
                {t.eyebrow}
                {profile.streak > 0 ? (
                  <span className="streak">{t.streakLabel.replace("{n}", String(profile.streak))}</span>
                ) : null}
              </div>
              <h1 dangerouslySetInnerHTML={{ __html: t.heroTitle }} />
              <p className="lead">{t.heroLead}</p>
              <div className="rule" />
              <div className="principles">
                {t.principles.map((p, i) => (
                  <span key={i} dangerouslySetInnerHTML={{ __html: p }} />
                ))}
              </div>
            </div>
            <ScenarioPicker
              t={t}
              lang={lang}
              mode={mode}
              onSelectMode={selectMode}
              onStart={start}
              situation={situation}
              customError={nego.error}
              onSituationChange={setSituation}
              onStartCustom={startCustom}
              campaign={campaign}
              campaignProgress={progress}
              onBeginStage={beginStage}
              profile={profile}
            />
          </div>
        </section>
      )}

      {screen === "generating" && (
        <section className="screen">
          <div className="wrap">
            <div className="gen">
              <div className="gen-lamp" aria-hidden="true">🎯</div>
              <div className="gen-dots" aria-hidden="true">
                <i /><i /><i />
              </div>
              <h2 className="gen-title">{t.custom.generating}</h2>
              <p className="gen-sub">{t.custom.generatingSub}</p>
            </div>
          </div>
        </section>
      )}

      {screen === "game" && nego.scenario && (
        <Table
          t={t}
          mode={mode}
          kind={nego.kind}
          scenario={nego.scenario}
          state={nego.state}
          log={nego.log}
          busy={nego.busy}
          onSend={nego.turn}
          onHint={nego.requestHint}
          onQuit={goHome}
        />
      )}

      {screen === "game" && !nego.scenario && (
        <section className="screen">
          <div className="wrap">
            <p className="lead" style={{ padding: "40px 0" }}>
              {t.connecting}
            </p>
          </div>
        </section>
      )}

      {screen === "debrief" && nego.debrief && (
        <Debrief
          t={t}
          d={nego.debrief}
          mode={mode}
          scenarioTitle={nego.scenario?.title}
          record={lastRecord}
          onRetry={retry}
          onHome={goHome}
          onNext={mode === "campaign" ? nextAct : undefined}
          nextLabel={
            mode === "campaign"
              ? progress.stageIndex >= (campaign?.stages.length ?? Infinity)
                ? t.campaign.seeResults
                : t.campaign.nextAct
              : undefined
          }
        />
      )}

      {screen === "campaign_done" && campaign && (
        <CampaignComplete
          t={t}
          campaign={campaign}
          progress={progress}
          onReplay={replayCampaign}
          onHome={goHome}
        />
      )}

      <div className="foot">
        <span>Диалог · Negotiation Skills Simulator</span>
        <span>{t.footRight}</span>
      </div>
    </>
  );
}
