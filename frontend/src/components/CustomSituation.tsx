// CustomSituation.tsx — the "Своя сделка" input: a free-text description of a
// real negotiation the user faces. On submit the app generates a scenario (real
// backend, or the MockServer's synth) and drops the player into the normal game.
// Rendered in place of the scenario cards when the "custom" mode is selected.
import type { Lang } from "../types";
import type { Strings } from "../i18n";

interface Props {
  t: Strings;
  lang: Lang;
  value: string;
  error: string | null;
  onChange: (v: string) => void;
  onGenerate: () => void;
}

export function CustomSituation({ t, lang, value, error, onChange, onGenerate }: Props) {
  const canGo = value.trim().length > 0;
  const submit = () => {
    if (canGo) onGenerate();
  };
  return (
    <>
      <div className="section-head">{t.custom.head}</div>
      <div className="custom">
        {error ? (
          <div className="cust-err" role="alert">
            <b>{t.custom.errorHead}</b>
            <span>{error}</span>
          </div>
        ) : null}
        <textarea
          className="cust-ta"
          value={value}
          placeholder={t.custom.placeholder}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            // Ctrl/Cmd+Enter to generate, like a chat composer.
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
          rows={6}
        />
        <div className="cust-actions">
          <span className="cust-hint">
            {lang === "ru" ? "Ctrl+Enter — сгенерировать" : "Ctrl+Enter to generate"}
          </span>
          <button className="primary cust-go" disabled={!canGo} onClick={submit}>
            {error ? t.custom.retry : t.custom.generate}
          </button>
        </div>
      </div>
    </>
  );
}
