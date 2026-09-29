// DealTerms.tsx — makes multi-issue logrolling VISIBLE. Lists each tradeable
// secondary issue as a row; the moment its id shows up in state.terms_conceded
// (the engine's authoritative "package"), it flips to a brass "offered" state.
// Nothing here is inferred — the deterministic engine owns terms_conceded; the
// panel only renders it. Renders nothing for scenarios without secondary issues
// (the parent also guards), so non-logrolling scenarios are unaffected.
//
// ЧТО БЫЛО НЕПОНЯТНО. Панель называлась «Условия сделки», а строки под ней
// читались как список того, что НАДО выполнить, — человек либо пропускал её,
// либо бился не туда. На деле это то, что игрок МОЖЕТ ДАТЬ второй стороне в
// обмен на цену. Поэтому заголовок называет именно это, первая строка говорит,
// что с этим делать, пример собран из ПЕРВОГО условия этого же стола (готовая
// фраза без темы стола ничему бы не научила), а последняя — когда строка
// отметится: только после того, как игрок сам предложит это в разговоре.
import type { ScenarioView, StateView } from "../types";
import type { Strings } from "../i18n";
import { Icon } from "./Icon";

interface Props {
  scenario: ScenarioView;
  state: StateView | null;
  t: Strings;
}

/** Пример реплики на ЭТОМ столе. Чистая: проверяется тестом, что подставлено
 *  условие отсюда, а не абстрактное «что-нибудь». Ярлык встаёт в середину
 *  фразы, поэтому заглавная первая буква опускается — но не у аббревиатуры
 *  («KPI…» так и остаётся KPI). */
export function termsExample(t: Strings, issueLabel: string): string {
  const mid = /^\p{Lu}\p{Ll}/u.test(issueLabel)
    ? issueLabel.charAt(0).toLowerCase() + issueLabel.slice(1)
    : issueLabel;
  return t.terms.example.replace("{issue}", mid);
}

export function DealTerms({ scenario, state, t }: Props) {
  const issues = scenario.secondary_issues ?? [];
  if (issues.length === 0) return null;
  const conceded = new Set(state?.terms_conceded ?? []);

  return (
    <div className="dealterms">
      <div className="dtm-head"><Icon name="refresh" /> {t.terms.title}</div>
      <p className="dtm-lead">{t.terms.lead}</p>
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
      <p className="dtm-explain">{termsExample(t, issues[0].label)}</p>
      <p className="dtm-explain">{t.terms.howMarked}</p>
    </div>
  );
}
