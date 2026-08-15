// ScenarioPicker.tsx — mode picker (only Практика fully wired; others shown as
// "soon" cards) + scenario cards drawn from the catalog.
import type { Lang, Mode } from "../types";
import type { Strings } from "../i18n";
import { catalog } from "../data/scenarios";

const MODES: Mode[] = ["practice", "campaign", "custom", "exam"];
const WIRED: Record<Mode, boolean> = { practice: true, campaign: false, custom: false, exam: false };

interface Props {
  t: Strings;
  lang: Lang;
  mode: Mode;
  onSelectMode: (m: Mode) => void;
  onStart: (scenarioId: string) => void;
}

export function ScenarioPicker({ t, lang, mode, onSelectMode, onStart }: Props) {
  const rows = catalog(lang);
  return (
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
      </div>

      <div className="section-head">{t.pickHead}</div>
      <div className="cards">
        {rows.map((sc) => (
          <button className="card" key={sc.id} onClick={() => onStart(sc.id)}>
            <div className="ic">{sc.icon}</div>
            <div className="ct">{sc.title}</div>
            <div className="cr">{sc.role}</div>
            <div className="cf">
              <div className="diff">
                {Array.from({ length: 5 }, (_, i) => (
                  <i className={i < sc.difficulty ? "on" : ""} key={i} />
                ))}
              </div>
              <div className="go">{lang === "ru" ? "Начать →" : "Start →"}</div>
            </div>
          </button>
        ))}
      </div>
    </>
  );
}
