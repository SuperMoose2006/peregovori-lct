// ScenarioPicker.tsx — mode picker (Практика · Своя сделка · Экзамен wired;
// Кампания shown as a "soon" card). For library modes it lists scenario cards;
// for "custom" it swaps in the free-text situation input (CustomSituation).
import type { Lang, Mode } from "../types";
import type { Strings } from "../i18n";
import { catalog } from "../data/scenarios";
import { CustomSituation } from "./CustomSituation";

const MODES: Mode[] = ["practice", "campaign", "custom", "exam"];
const WIRED: Record<Mode, boolean> = { practice: true, campaign: false, custom: true, exam: true };

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
}

export function ScenarioPicker({
  t, lang, mode, onSelectMode, onStart,
  situation, customError, onSituationChange, onStartCustom,
}: Props) {
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

      {mode === "custom" ? (
        <CustomSituation
          t={t}
          lang={lang}
          value={situation}
          error={customError}
          onChange={onSituationChange}
          onGenerate={onStartCustom}
        />
      ) : (
        <>
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
      )}
    </>
  );
}
