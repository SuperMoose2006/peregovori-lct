// Setup.tsx — the pre-game screen where the optional modality layers are chosen.
//
// The one thing this screen has to communicate, and the reason it exists at all:
// turning a layer on does NOT change how you are graded. That promise is printed
// on every toggle rather than buried in a help page, because the question it
// answers ("will the camera judge me harder?") occurs exactly here.
//
// It also draws a hard visual line between OFF and UNAVAILABLE. Off is an
// ordinary choice; unavailable is a blocked one, and conflating them would make
// a missing capability look like the player's decision.
import type { Strings } from "../i18n";
import type { Lang, ScenarioView } from "../types";
import { PRESETS, reasonText, type LayerId, type Layers, type LayerState } from "../lib/layers";
import { ScreenHeading } from "./ScreenHeading";

const ICONS: Record<LayerId, string> = { probe: "🎭", voice: "🎤", camera: "📷", avatar: "🙂" };
// Порядок — от того, что работает всегда, к тому, что требует разрешений.
const ORDER: LayerId[] = ["avatar", "probe", "voice", "camera"];

interface Props {
  t: Strings;
  lang: Lang;
  scenario: ScenarioView;
  layers: Layers;
  states: Record<LayerId, LayerState>;
  onToggle: (id: LayerId) => void;
  onPreset: (layers: Layers) => void;
  onStart: () => void;
  onBack: () => void;
  /** Right-rail content — the shell's third column. */
  rail?: React.ReactNode;
}

export function Setup({ t, lang, scenario, layers, states, onToggle, onPreset, onStart, onBack, rail }: Props) {
  const activePreset = PRESETS.find((p) =>
    ORDER.every((id) => p.layers[id] === layers[id]));

  return (
    <section className="screen">
      <div className={`wrap setup${rail ? " withrail" : ""}`}>
        <div className="setup-main">
        <button className="setup-back" onClick={onBack}>← {t.layers.back}</button>
        <ScreenHeading as="h1" className="sr-only">{scenario.title}</ScreenHeading>

        <div className="setup-brief">
          <span className="sb-ic" aria-hidden="true">{scenario.icon}</span>
          <div className="sb-txt">
            <h2>{scenario.title}</h2>
            <p>{scenario.role}</p>
            <div className="sb-facts">
              <span>{t.yourTarget} {scenario.target}{scenario.headline_unit}</span>
              <span className="red">{t.tracker.redline} {scenario.reservation}{scenario.headline_unit}</span>
            </div>
          </div>
        </div>

        <h3 className="setup-head">
          {t.layers.head} <span className="setup-what">[i] {t.layers.what}</span>
        </h3>

        <div className="setup-layers">
          {ORDER.map((id) => {
            const st = states[id];
            const on = layers[id];
            // `aria-disabled`, never the native `disabled`: a disabled control
            // leaves the tab order, so a keyboard user would never meet the
            // unavailable layers nor learn why they are off. The reason is
            // linked with aria-describedby rather than merely sitting nearby.
            const cls = !st.available ? "off na" : on ? "on" : "off";
            return (
              <div className={`layer ${cls}`} key={id}>
                <span className="ly-ic" aria-hidden="true">{ICONS[id]}</span>
                <div className="ly-txt">
                  <b>{t.layers.names[id]}</b>
                  <span>{t.layers.blurbs[id]}</span>
                </div>
                <button
                  className={`ly-sw${on ? " on" : ""}`}
                  role="switch"
                  aria-checked={on}
                  aria-label={t.layers.names[id]}
                  aria-disabled={!st.available || undefined}
                  aria-describedby={`ly-note-${id}`}
                  onClick={() => (st.available ? onToggle(id) : undefined)}
                >
                  <span className="ly-knob" />
                </button>
                {/* The promise sits on the control itself; when the layer cannot
                    run at all, its reason takes that slot instead. */}
                <span id={`ly-note-${id}`} className={`ly-note${st.available ? "" : " na"}`}>
                  {st.available ? t.layers.sameGrade : reasonText(st, lang)}
                </span>
              </div>
            );
          })}
        </div>

        <div className="setup-presets">
          <span className="sp-lab">{t.layers.presets}</span>
          {PRESETS.map((p) => (
            <button
              key={p.id}
              className={`sp-pill${activePreset?.id === p.id ? " on" : ""}`}
              onClick={() => onPreset(p.layers)}
            >
              {t.layers.presetNames[p.id] ?? p.id}
            </button>
          ))}
        </div>

        <button className="primary setup-go" onClick={onStart}>{t.layers.start}</button>

        {/* When there is a rail, the explainer belongs in it — beside the
            toggles it explains, not below the button that leaves the screen. */}
        {rail ? null : (
          <div className="setup-explain">
            <h3>{t.layers.explainHead}</h3>
            <ul>{t.layers.explain.map((l, i) => <li key={i}>{l}</li>)}</ul>
          </div>
        )}
        </div>
        {rail}
      </div>
    </section>
  );
}
