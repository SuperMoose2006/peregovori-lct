// DealTerms.tsx — makes multi-issue logrolling VISIBLE. Lists each tradeable
// secondary issue as a row; the moment its id shows up in state.terms_conceded
// (the engine's authoritative "package"), it flips to a brass "on the table"
// state. Nothing here is inferred — the deterministic engine owns terms_conceded;
// the panel only renders it. Renders nothing for scenarios without secondary
// issues (the parent also guards), so non-logrolling scenarios are unaffected.
import type { ScenarioView, StateView } from "../types";
import type { Strings } from "../i18n";

interface Props {
  scenario: ScenarioView;
  state: StateView | null;
  t: Strings;
}

export function DealTerms({ scenario, state, t }: Props) {
  const issues = scenario.secondary_issues ?? [];
  if (issues.length === 0) return null;
  const conceded = new Set(state?.terms_conceded ?? []);

  return (
    <div className="dealterms">
      <div className="dtm-head">🔄 {t.terms.title}</div>
      <ul className="dtm-list">
        {issues.map((iss) => {
          const traded = conceded.has(iss.id);
          return (
            <li key={iss.id} className={`dtm-row${traded ? " traded" : ""}`}>
              <span className="dtm-mark" aria-hidden="true">{traded ? "✓" : "○"}</span>
              <span className="dtm-label">{iss.label}</span>
              <span className="dtm-state">{traded ? t.terms.onTable : t.terms.notYet}</span>
            </li>
          );
        })}
      </ul>
      <p className="dtm-explain">{t.terms.explainer}</p>
    </div>
  );
}
