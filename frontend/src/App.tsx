// App.tsx — screen router (home / game / debrief) with RU/EN + light/dark toggles.
import { useCallback, useEffect, useState } from "react";
import type { Lang, Mode } from "./types";
import { I18N } from "./i18n";
import { useNegotiation } from "./api/useNegotiation";
import { ScenarioPicker } from "./components/ScenarioPicker";
import { Table } from "./components/Table";
import { Debrief } from "./components/Debrief";

type Screen = "home" | "game" | "debrief";
type Theme = "light" | "dark" | null;

export default function App() {
  const [lang, setLang] = useState<Lang>("ru");
  const [theme, setTheme] = useState<Theme>(null);
  const [screen, setScreen] = useState<Screen>("home");
  const [mode, setMode] = useState<Mode>("practice");
  const [currentScenario, setCurrentScenario] = useState<string | null>(null);

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

  const goHome = useCallback(() => {
    nego.reset();
    setScreen("home");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [nego]);

  const retry = useCallback(() => {
    if (currentScenario) start(currentScenario);
  }, [currentScenario, start]);

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
            <ScenarioPicker t={t} lang={lang} mode={mode} onSelectMode={setMode} onStart={start} />
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
