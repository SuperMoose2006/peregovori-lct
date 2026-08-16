// App.tsx — screen router (home / game / debrief) with RU/EN + light/dark toggles.
import { useCallback, useEffect, useState } from "react";
import type { Lang, Mode } from "./types";
import { I18N } from "./i18n";
import { useNegotiation } from "./api/useNegotiation";
import { ScenarioPicker } from "./components/ScenarioPicker";
import { Table } from "./components/Table";
import { Debrief } from "./components/Debrief";

type Screen = "home" | "generating" | "game" | "debrief";
type Theme = "light" | "dark" | null;

export default function App() {
  const [lang, setLang] = useState<Lang>("ru");
  const [theme, setTheme] = useState<Theme>(null);
  const [screen, setScreen] = useState<Screen>("home");
  const [mode, setMode] = useState<Mode>("practice");
  const [currentScenario, setCurrentScenario] = useState<string | null>(null);
  const [situation, setSituation] = useState("");

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

  // Custom mode: while generating, the scenario is designed server-side (or by
  // the mock synth). The greeting's arrival drops us into the game; an error
  // sends us back to the situation input (with the message + a retry button).
  useEffect(() => {
    if (screen === "generating" && nego.scenario) setScreen("game");
  }, [screen, nego.scenario]);
  useEffect(() => {
    if (screen === "generating" && nego.error) setScreen("home");
  }, [screen, nego.error]);

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
              <div className="eyebrow">{t.eyebrow}</div>
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
        <Debrief t={t} d={nego.debrief} onRetry={retry} onHome={goHome} />
      )}

      <div className="foot">
        <span>Диалог · Negotiation Skills Simulator</span>
        <span>{t.footRight}</span>
      </div>
    </>
  );
}
