// App.tsx — screen router (home / game / debrief / campaign) with RU/EN + light/dark toggles.
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { CampaignView, Debrief as DebriefData, Lang, Mode } from "./types";
import { I18N } from "./i18n";
import { useNegotiation } from "./api/useNegotiation";
import { getCampaigns } from "./api/campaigns";
import { whatIf } from "./api/whatif";
import { ScenarioPicker } from "./components/ScenarioPicker";
import { WhyTeaches } from "./components/WhyTeaches";
import { ScreenHeading } from "./components/ScreenHeading";
import { SideNav } from "./components/SideNav";
import { CourseScreen, type ExamCtx } from "./components/CourseScreen";
import { checkDrill } from "./lib/course";
import type { Exercise as CourseExercise } from "./lib/courseTypes";
import { recordExam, recordExercise } from "./lib/progress";
import { Setup } from "./components/Setup";
import { ProgressCards, MethodCard, RailCard } from "./components/Rail";
import { SCENARIO_MAP, toScenarioView } from "./data/scenarios";
import { detectLayers, pruneLayers, NO_LAYERS, type LayerId, type Layers } from "./lib/layers";
import { Table } from "./components/Table";
import { Debrief } from "./components/Debrief";
import { CampaignComplete, type CampaignProgress } from "./components/CampaignScreen";
import { HeroStats, SkillsProfile, AchievementToasts, MilestoneCard } from "./components/Gamification";
import { applyDebrief, loadProfile, saveProfile, setDailyGoalTarget, type GameResult, type Profile } from "./lib/progress";
import { initAudioUnlock, isMuted, toggleMuted } from "./lib/sound";
import { GEN_TIMEOUT_MS, genReducer } from "./lib/net";

type Screen = "home" | "setup" | "generating" | "gen_error" | "game" | "debrief" | "campaign_done" | "profile" | "course";

// How long the finished table stays on screen before the scorecard takes over.
// Long enough to read the closing line and the outcome stamp, short enough that
// nobody reaches for the button first.
const OUTCOME_HOLD_MS = 2200;
type Theme = "light" | "dark" | null;
// Visual skin, orthogonal to light/dark. "dojo" is the default lamplit-serif
// identity; "game" is the Duolingo-style one. Persisted so a juror's choice
// survives a reload mid-demo.
type Skin = "dojo" | "game";
const SKIN_KEY = "dialog.skin.v1";

const INITIAL_PROGRESS: CampaignProgress = { stageIndex: 0, reputation: 0, results: [] };
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export default function App() {
  const [lang, setLang] = useState<Lang>("ru");
  const [theme, setTheme] = useState<Theme>(null);
  // Optional modality layers. `detectLayers` is the single source of truth for
  // what this environment can actually deliver — a saved preset can never switch
  // on something that does not exist (see pruneLayers).
  const layerStates = useMemo(() => detectLayers(), []);
  const [layers, setLayers] = useState<Layers>(NO_LAYERS);
  const [pendingScenario, setPendingScenario] = useState<string | null>(null);

  const [skin, setSkin] = useState<Skin>(() => {
    // "game" is the DEFAULT: it is the product's current face, and requiring a
    // click to reach it meant every first visit — including a jury's — landed on
    // the older look. "dojo" survives as an explicit opt-out, not as the fallback.
    // Storage can throw (private mode, blocked site data), and the default is
    // always a correct answer, so never let a read break the app.
    try {
      return localStorage.getItem(SKIN_KEY) === "dojo" ? "dojo" : "game";
    } catch {
      return "game";
    }
  });
  const [screen, setScreen] = useState<Screen>("home");
  const [mode, setMode] = useState<Mode>("practice");
  const [currentScenario, setCurrentScenario] = useState<string | null>(null);
  const [situation, setSituation] = useState("");
  // Exam mode: the name printed on the certificate (optional; falls back to a
  // placeholder on the certificate itself). Collected on the exam-mode picker.
  const [examName, setExamName] = useState("");
  // Custom-generation flow (net.genReducer): "generating" → "ready" (drop into
  // the game) or "failed" (show the retry/fallback screen). Guards a slow backend
  // racing the client timeout, and a hung generation always resolves to failure.
  const [genPhase, dispatchGen] = useReducer(genReducer, "idle");
  const [genErr, setGenErr] = useState<string | null>(null);
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
  const [lastGame, setLastGame] = useState<GameResult | null>(null);
  // Капстоун курса: настоящая партия, запущенная из урока или экзамена блока.
  // Она идёт по обычному пути (движок судит, слои выключены), а курс узнаёт
  // результат из состояния партии — никакой отдельной «учебной» механики.
  const [drill, setDrill] = useState<{ ex: CourseExercise; blockId: string; exam?: ExamCtx } | null>(null);
  const [drillVerdict, setDrillVerdict] = useState<{ ok: boolean } | null>(null);
  const recordedDrill = useRef<DebriefData | null>(null);
  const recordedProgress = useRef<DebriefData | null>(null);
  // Sound layer: local mirror of the persisted mute flag drives the header
  // toggle's icon; the cues themselves read the flag live from lib/sound.
  const [muted, setMuted] = useState<boolean>(() => isMuted());

  // Arm the AudioContext to unlock on the first user gesture (autoplay-safe).
  useEffect(() => {
    initAudioUnlock();
  }, []);

  // Один <video> и один <canvas> на всё приложение: провайдер медиа привязывает
  // к ним поток единожды. Пере-монтирование заставило бы браузер заново спросить
  // доступ к камере — посреди партии это выглядит как сбой.
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const nego = useNegotiation(lang, { videoRef, canvasRef });
  const t = I18N[lang];

  // Apply theme to the document root (drives the CSS variables).
  useEffect(() => {
    const root = document.documentElement;
    if (theme) root.setAttribute("data-theme", theme);
    else root.removeAttribute("data-theme");
  }, [theme]);

  // The skin drives the same CSS variables from a parallel attribute, so the
  // default one is the plain absence of it.
  useEffect(() => {
    const root = document.documentElement;
    if (skin === "game") root.setAttribute("data-skin", "game");
    else root.removeAttribute("data-skin");
    try {
      localStorage.setItem(SKIN_KEY, skin);
    } catch {
      /* not being able to remember the choice is not a reason to refuse it */
    }
  }, [skin]);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  // Hold on the table for a beat when the debrief arrives, instead of swapping
  // the whole layout out from under the closing line. The handshake (or the
  // walk-out) is the climax of a negotiation; every game holds on the winning
  // shot before showing the box score. The player can skip the hold by pressing
  // the outcome strip's button, and the timer guarantees they never get stuck.
  useEffect(() => {
    if (!nego.debrief) return;
    const id = setTimeout(() => setScreen("debrief"), OUTCOME_HOLD_MS);
    return () => clearTimeout(id);
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
    const res = applyDebrief(loadProfile(), scenarioId, nego.debrief);
    saveProfile(res.profile);
    setProfile(res.profile);
    setLastGame(res);
  }, [nego.debrief, nego.scenario, currentScenario]);

  // Custom mode: while generating, the scenario is designed server-side (or by
  // the mock synth). Drive the outcome through the gen state machine: a greeting
  // resolves to "ready", a server error or the client timeout to "failed".
  useEffect(() => {
    if (genPhase !== "generating") return;
    if (nego.scenario) dispatchGen("greeting");
    else if (nego.error) {
      setGenErr(nego.error);
      dispatchGen("error");
    }
  }, [genPhase, nego.scenario, nego.error]);

  // Client-side timeout: a hung generation (~25s+ backend, or a silent stall)
  // must surface the failure UI, never an infinite "генерируем…".
  useEffect(() => {
    if (genPhase !== "generating") return;
    const id = setTimeout(() => {
      setGenErr(t.custom.timeout);
      dispatchGen("timeout");
    }, GEN_TIMEOUT_MS);
    return () => clearTimeout(id);
  }, [genPhase, t.custom.timeout]);

  // The gen state machine is the single source of truth for the custom sub-flow's
  // screen: generating spinner → game (ready) or the failure screen.
  useEffect(() => {
    if (genPhase === "generating") setScreen("generating");
    else if (genPhase === "ready") setScreen("game");
    else if (genPhase === "failed") setScreen("gen_error");
  }, [genPhase]);

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

  // Итог капстоуна снимается с ТОГО ЖЕ состояния, что и грейд: предикат смотрит
  // только в поля движка, поэтому «сдал» здесь значит ровно то же, что в партии.
  useEffect(() => {
    if (!drill || !nego.debrief || !nego.state) return;
    if (recordedDrill.current === nego.debrief) return;
    recordedDrill.current = nego.debrief;
    const verdict = checkDrill(drill.ex, nego.state);
    setDrillVerdict({ ok: verdict.ok });
    setProfile((prev) => {
      const next = drill.exam
        ? recordExam(prev, drill.blockId, drill.exam.score + (verdict.ok ? 2 : 0),
                     drill.exam.total, drill.exam.passMark).profile
        : recordExercise(prev, drill.blockId, drill.ex.id, drill.ex.xp, verdict.ok).profile;
      saveProfile(next);
      return next;
    });
  }, [drill, nego.debrief, nego.state]);

  const isDark = theme ? theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  const toggleTheme = () => setTheme(isDark ? "light" : "dark");

  /** Picking an opponent goes to SETUP first — where the layers are chosen —
   *  except in exam mode, which fixes them off so certificates stay comparable
   *  (docs/modalities.md §0) and therefore has nothing to choose. */
  const start = useCallback(
    (scenarioId: string) => {
      dispatchGen("reset"); // leave any stale custom-gen state behind
      setCurrentScenario(scenarioId);
      if (mode === "exam") {
        setLayers(NO_LAYERS);
        nego.start(scenarioId, mode, undefined, undefined, NO_LAYERS);
        setScreen("game");
      } else {
        setPendingScenario(scenarioId);
        setScreen("setup");
      }
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [mode, nego],
  );

  const startDrill = useCallback(
    (ex: CourseExercise, ctx: { blockId: string; exam?: ExamCtx }) => {
      if (!ex.scenario_id) return;
      setDrill({ ex, blockId: ctx.blockId, exam: ctx.exam });
      setDrillVerdict(null);
      recordedDrill.current = null;
      // Слои выключены принудительно — капстоун обязан быть сравним с экзаменом.
      setMode("practice");
      setLayers(NO_LAYERS);
      setCurrentScenario(ex.scenario_id);
      nego.start(ex.scenario_id, "practice", undefined, undefined, NO_LAYERS);
      setScreen("game");
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [nego],
  );

  const backToCourse = useCallback(() => {
    setDrill(null);
    setDrillVerdict(null);
    nego.reset?.();
    setScreen("course");
  }, [nego]);

  const startWithLayers = useCallback(() => {
    if (!pendingScenario) return;
    const use = pruneLayers(layers, layerStates);
    setLayers(use);
    nego.start(pendingScenario, mode, undefined, undefined, use);
    setScreen("game");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [pendingScenario, layers, layerStates, mode, nego]);

  /** "прочитано n из m" — answered-correctly over asked. Counted from the log,
   *  so it needs no extra state and survives a re-render. */
  /** Same counts, shaped for the debrief card. Undefined when nothing was asked,
   *  so the card is absent rather than showing a hollow "0 / 0". */
  const probeStats = useMemo(() => {
    const asked = nego.log.filter((e) => e.kind === "probe");
    if (!asked.length) return undefined;
    return {
      asked: asked.length,
      right: asked.filter((e) => e.kind === "probe" && e.picked === e.answer).length,
    };
  }, [nego.log]);

  const probeTally = useMemo(() => {
    const asked = nego.log.filter((e) => e.kind === "probe");
    if (!asked.length) return undefined;
    const right = asked.filter((e) => e.kind === "probe" && e.picked === e.answer).length;
    return t.probe.tally.replace("{n}", String(right)).replace("{m}", String(asked.length));
  }, [nego.log, t]);

  const toggleLayer = useCallback((id: LayerId) => {
    setLayers((p) => (layerStates[id].available ? { ...p, [id]: !p[id] } : p));
  }, [layerStates]);

  const startCustom = useCallback(() => {
    if (!situation.trim()) return;
    setCurrentScenario(null);
    setGenErr(null);
    nego.start("", "custom", situation);
    // dispatch drives the screen → "generating" (see the gen-phase effect above).
    dispatchGen("start");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [nego, situation]);

  // gen_error fallback: abandon the custom generation and jump to the ready-made
  // scenario picker (practice mode) so a failed generation is never a dead end.
  const pickReadyScenario = useCallback(() => {
    dispatchGen("reset");
    setGenErr(null);
    nego.clearError();
    setMode("practice");
    setScreen("home");
    requestAnimationFrame(() => {
      document.getElementById("play")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [nego]);

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
    dispatchGen("reset");
    setGenErr(null);
    nego.reset();
    setScreen("home");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [nego]);

  const openProfile = useCallback(() => {
    setScreen("profile");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  // Customizable daily goal: persist the chosen target (1..3). Read fresh from
  // storage so we never clobber a concurrently-recorded debrief's fields.
  const setGoalTarget = useCallback((target: number) => {
    const next = setDailyGoalTarget(loadProfile(), target);
    saveProfile(next);
    setProfile(next);
  }, []);

  // Mobile hero CTA: bring the opponent picker into view (it sits just below the
  // hero on the same home screen). Reduced-motion callers still land there.
  const scrollToPlay = useCallback(() => {
    const el = document.getElementById("play");
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const retry = useCallback(() => {
    if (mode === "custom") startCustom();
    else if (currentScenario) start(currentScenario);
  }, [mode, currentScenario, start, startCustom]);

  return (
    // The "game" skin wraps everything in a two-column app shell; "dojo" keeps
    // the plain single column, so `.app`/`.appbody` are inert there by default.
    <div className="app">
      {skin === "game" ? (
        <SideNav
          t={t}
          active={screen === "profile" ? "profile" : screen === "course" ? "course" : mode}
          onMode={(m) => { setMode(m); if (screen !== "home") goHome(); }}
          onProfile={openProfile}
          onCourse={() => setScreen("course")}
        />
      ) : null}
      <div className="appbody">
      <div className="top">
        {/* Live counters, the way a game shows them. Only in the game skin —
            the dojo header is a wordmark and controls, deliberately quiet. */}
        {skin === "game" ? (
          <div className="hudstats" aria-label={t.a11y.stats}>
            <span className="st-c" title={t.streakLabel.replace("{n}", String(profile.streak))}>
              <b aria-hidden="true">🔥</b> {profile.streak}
            </span>
            <span className="st-c">
              <b aria-hidden="true">💎</b> {profile.xp} XP
            </span>
          </div>
        ) : null}
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
          <div className="seg">
            <button
              onClick={() => setSkin(skin === "game" ? "dojo" : "game")}
              aria-label={t.skin.label}
              aria-pressed={skin === "game"}
              title={skin === "game" ? t.skin.toDojo : t.skin.toGame}
            >
              {skin === "game" ? "🎮" : "🎓"}
            </button>
          </div>
          <div className="seg">
            <button
              onClick={() => setMuted(toggleMuted())}
              aria-label={muted ? t.sound.unmute : t.sound.mute}
              aria-pressed={muted}
            >
              {muted ? "🔇" : "🔊"}
            </button>
          </div>
        </div>
      </div>

      {screen === "home" && (
        <section className="screen">
          <div className="wrap">
            {/* The game skin drops the marketing hero and the proof-of-method
                explainer: in an app shell the product IS the path, and a juror
                must reach a negotiation without scrolling past 1.4 screens of
                pitch. The XP strip moves into the right rail, and the heading
                still exists for screen readers. */}
            {skin === "game" ? (
              <ScreenHeading as="h1" className="sr-only">{t.pickHead}</ScreenHeading>
            ) : (
              <>
                <div className="hero">
                  <div className="eyebrow">{t.eyebrow}</div>
                  <ScreenHeading as="h1" dangerouslySetInnerHTML={{ __html: t.heroTitle }} />
                  <HeroStats t={t} lang={lang} profile={profile} onOpenProfile={openProfile} onSetGoal={setGoalTarget} />
                  {/* Mobile-only: a single clear call-to-action above the fold that jumps
                      to the opponent picker. Desktop shows the picker inline, so it's hidden there. */}
                  <button className="hero-cta" onClick={scrollToPlay}>{t.heroCta}</button>
                  <p className="lead">{t.heroLead}</p>
                  <div className="rule" />
                  <div className="principles">
                    {t.principles.map((p, i) => (
                      <span key={i} dangerouslySetInnerHTML={{ __html: p }} />
                    ))}
                  </div>
                </div>
                {/* Director's #8: proof-of-method for a cold visitor, between the hero
                    and the picker. Sits OUTSIDE #play so the CTA still lands on the
                    opponent picker, not this explainer. */}
                <WhyTeaches t={t} lang={lang} />
              </>
            )}
            {/* Three-part shell: the rail is what makes the layout read as an
                app rather than a wide document. Absent in the dojo skin. */}
            <div className={skin === "game" ? "withrail" : ""}>
            <div id="play">
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
              examName={examName}
              onExamNameChange={setExamName}
              hideModes={skin === "game"}
            />
            </div>
            {skin === "game" ? (
              <aside className="rail">
                <ProgressCards t={t} lang={lang} profile={profile} />
                <MethodCard t={t} />
              </aside>
            ) : null}
            </div>
          </div>
        </section>
      )}

      {screen === "setup" && pendingScenario && (
        <Setup
          t={t}
          lang={lang}
          scenario={toScenarioView(SCENARIO_MAP[pendingScenario], lang)}
          layers={layers}
          states={layerStates}
          onToggle={toggleLayer}
          onPreset={setLayers}
          onStart={startWithLayers}
          onBack={goHome}
          rail={skin === "game" ? (
            <aside className="rail">
              <RailCard title={t.layers.explainHead}>
                <ul className="rc-method">
                  {t.layers.explain.map((l, i) => <li key={i}>{l}</li>)}
                </ul>
              </RailCard>
              <ProgressCards t={t} lang={lang} profile={profile} />
            </aside>
          ) : undefined}
        />
      )}

      {screen === "generating" && (
        <section className="screen">
          <div className="wrap">
            <div className="gen">
              <div className="gen-lamp" aria-hidden="true">🎯</div>
              <div className="gen-dots" aria-hidden="true">
                <i /><i /><i />
              </div>
              <ScreenHeading as="h2" className="gen-title">{t.custom.generating}</ScreenHeading>
              <p className="gen-sub">{t.custom.generatingSub}</p>
            </div>
          </div>
        </section>
      )}

      {screen === "gen_error" && (
        <section className="screen">
          <div className="wrap">
            <div className="gen genfail">
              <div className="genfail-mark" aria-hidden="true">⚠️</div>
              <ScreenHeading as="h2" className="gen-title">{t.custom.errorHead}</ScreenHeading>
              {genErr ? <p className="genfail-msg">{genErr}</p> : null}
              <p className="gen-sub">{t.custom.errorSub}</p>
              <div className="genfail-actions">
                <button className="primary" onClick={startCustom}>{t.custom.retry}</button>
                <button className="ghost" onClick={pickReadyScenario}>{t.custom.orPickReady}</button>
              </div>
            </div>
          </div>
        </section>
      )}

      {screen === "game" && nego.scenario && (
        <>
          {/* Mid-game connection health. "reconnecting" is a calm, non-blocking
              banner; "lost" degrades to a small panel offering a restart (which
              reconnects to the backend, or continues on the offline demo) or home.
              Progress/profile are already persisted, so neither loses the player's
              standing — only the in-flight server session. */}
          {nego.conn === "reconnecting" ? (
            <div className="conn-banner" role="status">
              <span className="conn-spin" aria-hidden="true" />
              <span>{t.conn.reconnecting}</span>
            </div>
          ) : null}
          {nego.conn === "lost" ? (
            <div className="conn-lost" role="alert">
              <div className="conn-lost-body">
                <b>{t.conn.lostTitle}</b>
                <span>{t.conn.lostBody}</span>
              </div>
              <div className="conn-lost-actions">
                <button className="primary" onClick={retry}>{t.conn.retry}</button>
                <button className="ghost" onClick={goHome}>{t.conn.home}</button>
              </div>
            </div>
          ) : null}
          <Table
            t={t}
            lang={lang}
            mode={mode}
            kind={nego.kind}
            scenario={nego.scenario}
            state={nego.state}
            log={nego.log}
            busy={nego.busy}
            phase={nego.phase}
            judgeActive={nego.judgeActive}
            avatarState={nego.avatarState}
            oppSpeaking={nego.oppSpeaking}
            layers={{ voice: layers.voice, camera: layers.camera }}
            userSpeaking={nego.userSpeaking}
            transcript={nego.transcript}
            getMicLevel={nego.getMicLevel}
            onInterrupt={nego.interrupt}
            videoRef={videoRef}
            canvasRef={canvasRef}
            onSend={nego.turn}
            onHint={nego.requestHint}
            onQuit={goHome}
            debriefReady={!!nego.debrief}
            probeTally={layers.probe ? probeTally : undefined}
            onProbeAnswer={layers.probe ? nego.answerProbe : undefined}
            onSeeDebrief={() => setScreen("debrief")}
          />
        </>
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

      {screen === "debrief" && drillVerdict && drill ? (
        <div className="wrap">
          <div className={`drill-verdict ${drillVerdict.ok ? "ok" : "bad"}`}>
            <b>{drillVerdict.ok ? t.course.drillPass : t.course.drillFail}</b>
            <span>{drill.ex.goal ? drill.ex.goal[lang] : ""}</span>
            <button className="btn primary" onClick={backToCourse}>{t.course.backToCourse}</button>
          </div>
        </div>
      ) : null}

      {screen === "debrief" && nego.debrief && (
        <Debrief
          t={t}
          d={nego.debrief}
          probeStats={layers.probe ? probeStats : undefined}
          mode={mode}
          lang={lang}
          scenarioTitle={nego.scenario?.title}
          playerName={examName}
          record={lastGame}
          game={lastGame}
          onRetry={retry}
          onHome={goHome}
          // "А что если…" replay: the player's OWN lines in order (from the chat
          // log) drive the deterministic branch. Runs over the same transport the
          // game used (real backend or offline synth) via the kind passed through.
          runWhatIf={(req) => whatIf(nego.kind, req)}
          whatIfMoves={nego.log.filter((e) => e.kind === "me").map((e) => e.text)}
          whatIfScenarioId={nego.scenario?.id ?? currentScenario ?? undefined}
          whatIfUnit={nego.scenario?.headline_unit}
          // Direction: target below reservation = the player wants a LOWER number.
          whatIfLowerBetter={
            nego.scenario ? nego.scenario.target < nego.scenario.reservation : undefined
          }
          // Visible logrolling recap: the tradeable issues + the final package.
          // terms_conceded rides on the last StateView, retained through debrief.
          secondaryIssues={nego.scenario?.secondary_issues}
          termsConceded={nego.state?.terms_conceded}
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

      {screen === "profile" && (
        <SkillsProfile t={t} lang={lang} profile={profile} onHome={goHome} />
      )}

      {screen === "course" && (
        <CourseScreen
          t={t}
          lang={lang}
          profile={profile}
          onProfile={(p) => { setProfile(p); saveProfile(p); }}
          onStartDrill={startDrill}
          onExit={goHome}
        />
      )}

      {/* Milestone celebration rides over any screen; it self-dismisses per card and
          never repeats a milestone (the ids are deduped against the saved profile). */}
      {lastGame ? <MilestoneCard t={t} lang={lang} game={lastGame} /> : null}
      {lastGame ? <AchievementToasts t={t} lang={lang} ids={lastGame.newAchievements} /> : null}

      <div className="foot">
        <span>Диалог · Negotiation Skills Simulator</span>
        <span>{t.footRight}</span>
      </div>
      </div>
    </div>
  );
}
