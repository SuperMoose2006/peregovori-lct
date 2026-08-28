// Setup.tsx — панель слоёв.
//
// ЧЕМ ОНА БЫЛА. Полноэкранным шлюзом между выбором оппонента и столом: четыре
// тумблера, все выключенные, под каждым подпись «оценка та же» и абзац про то,
// что слои не влияют на грейд. Инженерный инвариант, объяснённый человеку,
// который ещё не сыграл ни одного хода: на вопрос «камера будет судить меня
// строже?» он отвечал до того, как этот вопрос у кого-нибудь возник.
//
// ЧЕМ СТАЛА. Шторкой ВНУТРИ партии и разделом в профиле. Путь «НАЧАТЬ → стол»
// стал прямым, а слои остались там, где вопрос про них и правда возникает —
// за столом, где видно, чем именно они заняты.
//
// Обещание «оценка та же» никуда не делось: оно по-прежнему напечатано на
// каждом тумблере, а не спрятано в справку. И граница между ВЫКЛЮЧЕНО и
// НЕДОСТУПНО осталась зримой — выключено это обычный выбор, недоступно это
// запрет, и путать их значит выдавать отсутствие возможности за решение игрока.
import type { Strings } from "../i18n";
import type { Lang } from "../types";
import { PRESETS, reasonText, type LayerId, type Layers, type LayerState } from "../lib/layers";

const ICONS: Record<LayerId, string> = { probe: "🎭", voice: "🎤", camera: "📷", avatar: "🙂", pokerface: "😐" };
// Порядок — от того, что работает всегда, к тому, что требует разрешений.
// «Покерфейс» стоит сразу за камерой: без неё он не поднимается, и
// соседство делает эту зависимость видимой без подписи.
const ORDER: LayerId[] = ["avatar", "probe", "voice", "camera", "pokerface"];

interface Props {
  t: Strings;
  lang: Lang;
  /** Что показывать тумблерами. За столом — слои ЭТОЙ партии, в профиле — выбор. */
  layers: Layers;
  states: Record<LayerId, LayerState>;
  onToggle: (id: LayerId) => void;
  onPreset: (layers: Layers) => void;
  /** Почему менять нельзя. Null — можно. Строка рисуется как честный запрет:
   *  экзамен гасит слои принудительно, а начатый стол их уже получил. */
  lockNote?: string | null;
}

export function LayersPanel({ t, lang, layers, states, onToggle, onPreset, lockNote = null }: Props) {
  const locked = !!lockNote;
  const activePreset = PRESETS.find((p) => ORDER.every((id) => p.layers[id] === layers[id]));

  return (
    <div className="lay-panel">
      {lockNote ? (
        <p className="lay-lock" role="status">🔒 {lockNote}</p>
      ) : null}

      <div className="setup-layers">
        {ORDER.map((id) => {
          const st = states[id];
          const on = layers[id];
          // `aria-disabled`, а не родной `disabled`: выключенный элемент уходит
          // из порядка обхода, и человек с клавиатуры никогда не встретил бы
          // недоступные слои и не узнал почему. Причина связана через
          // aria-describedby, а не просто лежит рядом.
          const cls = !st.available ? "off na" : on ? "on" : "off";
          const frozen = locked || !st.available;
          return (
            <div className={`layer ${cls}${locked ? " locked" : ""}`} key={id}>
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
                aria-disabled={frozen || undefined}
                aria-describedby={`ly-note-${id}`}
                onClick={() => (frozen ? undefined : onToggle(id))}
              >
                <span className="ly-knob" />
              </button>
              {/* Обещание стоит на самом переключателе; когда слой вообще не
                  может работать, его место занимает причина. */}
              <span id={`ly-note-${id}`} className={`ly-note${st.available ? "" : " na"}`}>
                {st.available ? t.layers.sameGrade : reasonText(st, lang)}
              </span>
            </div>
          );
        })}
      </div>

      <div className={`setup-presets${locked ? " locked" : ""}`}>
        <span className="sp-lab">{t.layers.presets}</span>
        {PRESETS.map((p) => (
          <button
            key={p.id}
            className={`sp-pill${activePreset?.id === p.id ? " on" : ""}`}
            aria-disabled={locked || undefined}
            aria-pressed={activePreset?.id === p.id}
            onClick={() => (locked ? undefined : onPreset(p.layers))}
          >
            {t.layers.presetNames[p.id] ?? p.id}
          </button>
        ))}
      </div>

      <div className="setup-explain">
        <h3>{t.layers.explainHead}</h3>
        <ul>{t.layers.explain.map((l, i) => <li key={i}>{l}</li>)}</ul>
      </div>
    </div>
  );
}
