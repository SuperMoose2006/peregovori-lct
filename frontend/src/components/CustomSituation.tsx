// CustomSituation.tsx — экран «Своя сделка»: свободное описание реальных
// переговоров, из которого генератор собирает сценарий (настоящий бэкенд или
// синтез MockServer), после чего игрок садится за обычный стол.
//
// Экран был заголовком, полем и кнопкой над восемью сотнями пикселей пустоты:
// самый амбициозный режим продукта выглядел самым заброшенным и молчал о том,
// что вообще произойдёт по нажатию. Теперь под полем стоят три примера в один
// клик (конфликты РАЗНОГО типа — срыв обязательств, доля, цена) и честная
// строка о том, что соберут и сколько это займёт. Двух секунд ожидания без
// объяснения хватает, чтобы человек решил, что кнопка не работает.
import type { Lang, ScenarioContext } from "../types";
import type { Strings } from "../i18n";
import { Icon } from "./Icon";
import { DifficultySelect } from "./DifficultySelect";

interface Props {
  t: Strings;
  lang: Lang;
  value: string;
  error: string | null;
  onChange: (v: string) => void;
  onGenerate: () => void;
  context?: ScenarioContext;
  onContextChange?: (context: ScenarioContext) => void;
}

export function CustomSituation({ t, lang, value, error, onChange, onGenerate,
                                  context, onContextChange }: Props) {
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
          id="custom-situation"
          className="cust-ta"
          value={value}
          placeholder={t.custom.placeholder}
          aria-label={t.custom.head}
          maxLength={1500}
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

        {context && onContextChange ? (
          <details className="cust-context">
            <summary>{t.custom.context.head}</summary>
            <p>{t.custom.context.help}</p>
            <div className="cust-context-grid">
              {([['sector', 80], ['topic', 120], ['opponent_role', 120], ['opponent_goal', 240]] as const)
                .map(([field, limit]) => (
                  <label key={field}>
                    <span>{t.custom.context[field]}</span>
                    <input value={context[field]} maxLength={limit}
                      onChange={(e) => onContextChange({ ...context, [field]: e.target.value })} />
                  </label>
                ))}
              <label>
                <span>{t.custom.context.difficulty}</span>
                <DifficultySelect lang={lang} value={context.difficulty}
                  onChange={(difficulty) => onContextChange({ ...context, difficulty })} />
              </label>
              <label>
                <span>{t.custom.context.style}</span>
                <select value={context.style}
                  onChange={(e) => onContextChange({ ...context, style: e.target.value as ScenarioContext['style'] })}>
                  {(['analytical', 'relationship', 'tough'] as const).map((style) => (
                    <option key={style} value={style}>{t.custom.context.styles[style]}</option>
                  ))}
                </select>
              </label>
            </div>
          </details>
        ) : null}

        {/* Примеры СРАЗУ под полем: это подсказка ко вводу, а не витрина.
            Кнопка, а не карточка-ссылка: клик меняет содержимое поля выше,
            поэтому она и объявляет себя полю через aria-controls. */}
        <div className="cust-ex">
          <div className="cust-ex-head" id="cust-ex-head">{t.custom.examplesHead}</div>
          <div className="cust-ex-row" role="group" aria-labelledby="cust-ex-head">
            {t.custom.examples.map((ex) => (
              <button
                key={ex.title}
                type="button"
                className={`cust-ex-card${value.trim() === ex.text ? " on" : ""}`}
                aria-controls="custom-situation"
                onClick={() => onChange(ex.text)}
              >
                <b>{ex.title}</b>
                <span>{ex.text}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="cust-actions">
          <span className="cust-hint">
            {lang === "ru" ? "Ctrl+Enter — сгенерировать" : "Ctrl+Enter to generate"}
          </span>
          <button className="primary cust-go" disabled={!canGo} onClick={submit}>
            {error ? t.custom.retry : t.custom.generate}
          </button>
        </div>

        {/* Стоит ПОД кнопкой: это ответ на вопрос «что случится, если нажать».
            Никакого «мгновенно» — генерация занимает секунды, и обещать иное
            значит заставить человека нажать второй раз. */}
        <p className="cust-promise">
          <span aria-hidden="true"><Icon name="dice" /></span> {t.custom.promise}
        </p>
      </div>
    </>
  );
}
