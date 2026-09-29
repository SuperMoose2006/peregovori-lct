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
import { Karl } from "./Mascot";
import { Icon } from "./Icon";
import type { IconName } from "./Icon";

const ICONS: Record<LayerId, IconName> = { probe: "masks", voice: "mic", camera: "camera", avatar: "smile", pokerface: "face" };
// Порядок — от того, что работает всегда, к тому, что требует разрешений.
//
// «ПОКЕРФЕЙСА» ЗДЕСЬ НЕТ, И ЭТО ГЛАВНОЕ В СПИСКЕ. Он считает по кадрам камеры,
// поэтому живёт ВНУТРИ её карточки подвыбором. Соседней карточкой он обещал
// самостоятельность, которой у него нет: `pruneLayers` гасит его при
// выключенной камере, то есть клик по нему молча откатывался — тумблер не
// двигался и не объяснял почему. Вложенность делает зависимость строением
// панели, а не подписью, которую надо прочитать.
const ORDER: LayerId[] = ["avatar", "probe", "voice", "camera"];
/** Для сверки с пресетами нужен ПОЛНЫЙ набор: «покерфейс» ушёл из карточек, но
 *  из выбора не исчез, и пресет, который его включает, обязан подсвечиваться. */
const ALL_IDS: LayerId[] = [...ORDER, "pokerface"];

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
  /** ЧТО НЕ ВСТАЛО В ИДУЩЕЙ ПАРТИИ. `detectLayers()` знает только про наличие
   *  `mediaDevices` — он вычисляется один раз и об ОТКАЗЕ устройства не знает
   *  ничего. Без этого шторка показывала «Голосом ✓» над микрофоном, которого
   *  человеку не дали: ровно то четвёртое состояние («выглядит настоящим, а
   *  внутри пусто»), которого в продукте не бывает. Ключи — сырые причины из
   *  хука (`useNegotiation.layerFail`). */
  fail?: { voice?: string; camera?: string };
}

/**
 * Подвыбор внутри карточки камеры.
 *
 * ПОЧЕМУ У НЕГО ТРИ СОСТОЯНИЯ, А НЕ ДВА. «Недоступен» (камеры нет в этом
 * браузере или она не встала в партии) и «камера выключена» — разные вещи, и
 * человек, который их перепутает, будет чинить не то: в первом случае чинить
 * нечего, во втором достаточно тумблера выше. Поэтому причина печатается
 * разная, а молчания нет ни в одном из них — молчание и было исходной жалобой.
 *
 * Тумблер тут обычного размера, не уменьшенный: подчинённость читается отступом
 * и линией, а ужатая мишень стоила бы 24×24 из WCAG 2.5.8 на телефоне.
 */
function PokerfaceRow({ t, lang, state, failed, on, cameraOn, locked, onToggle }: {
  t: Strings;
  lang: Lang;
  state: LayerState;
  failed: string | null;
  on: boolean;
  /** Камера ВКЛЮЧЕНА и работает — без этого считать нечего. */
  cameraOn: boolean;
  locked: boolean;
  onToggle: () => void;
}) {
  const usable = state.available && !failed;
  const ready = usable && cameraOn;
  const lit = on && ready;
  const frozen = locked || !ready;
  const note = !usable
    ? (failed ? `${t.live.offCamera} · ${failed}` : reasonText(state, lang))
    : !cameraOn ? t.layers.needsCamera
    : t.layers.sameGrade;
  // Тревожный цвет достаётся только настоящему запрету. «Включите камеру» —
  // подсказка на один клик, и красным она врала бы о серьёзности.
  const tone = !usable ? " na" : !cameraOn ? " idle" : "";
  return (
    <div className={`ly-sub${tone}`}>
      <span className="ly-ic" aria-hidden="true"><Icon name={ICONS.pokerface} /></span>
      <div className="ly-txt">
        <b>{t.layers.names.pokerface}</b>
        <span>{t.layers.blurbs.pokerface}</span>
      </div>
      <button
        className={`ly-sw${lit ? " on" : ""}`}
        role="switch"
        aria-checked={lit}
        aria-label={t.layers.names.pokerface}
        aria-disabled={frozen || undefined}
        aria-describedby="ly-note-pokerface"
        onClick={() => (frozen ? undefined : onToggle())}
      >
        <span className="ly-knob" />
      </button>
      <span id="ly-note-pokerface" className={`ly-note${usable ? "" : " na"}`}>{note}</span>
    </div>
  );
}

export function LayersPanel({ t, lang, layers, states, onToggle, onPreset, lockNote = null, fail }: Props) {
  const locked = !!lockNote;
  /** Почему именно этот слой не поднялся — или null. «Покерфейс» считает по
   *  кадрам камеры, поэтому её отказ гасит и его. */
  const failOf = (id: LayerId): string | null =>
    (id === "voice" ? fail?.voice : id === "camera" || id === "pokerface" ? fail?.camera : null) ?? null;
  const activePreset = PRESETS.find((p) => ALL_IDS.every((id) => p.layers[id] === layers[id]));
  // ЧЕСТНОЕ «НЕДОСТУПНО» ПОЛУЧАЕТ ЛИЦО. Причина у каждого слоя уже написана под
  // его переключателем, но список тумблеров читается как настройки, а не
  // как ответ: человек, у которого не встал микрофон, ищет глазами именно этот
  // ответ. Карл его не сочиняет — он перечисляет ИМЕНА слоёв, которые
  // `detectLayers`/`layerFail` уже признали неподнявшимися, и отсылает к
  // причине под каждым. Ничего не сломалось — сводки нет вовсе.
  const naNames = ORDER.filter((id) => !states[id].available || failOf(id))
                       .map((id) => t.layers.names[id]);

  return (
    <div className="lay-panel">
      {/* ЧТО ЭТО И ГДЕ РАБОТАЕТ — ДО ТУМБЛЕРОВ. Переключатели в профиле
          выглядели мёртвыми: их включали, уходили в кампанию, а там слои
          погашены всегда (sessionLayers), и нигде рядом об этом не было ни
          слова. Замер на стенде: в «Тренировке» голос поднимается
          (session.created → voice: true, «микрофон активен») — то есть
          сломанным был не слой, а объяснение. */}
      <div className="lay-intro">
        <p>{t.layers.lead}</p>
        <p className="lay-where"><Icon name="target" /> {t.layers.where}</p>
      </div>
      {lockNote ? (
        <p className="lay-lock" role="status"><Icon name="lock" /> {lockNote}</p>
      ) : null}

      {naNames.length ? (
        <div className="karl-note lay-na">
          <Karl state="shrug" compact name={t.mascot.karl} alt={t.mascot.alt} />
          <p role="status">{t.layers.naSummary.replace("{list}", naNames.join(", "))}</p>
        </div>
      ) : null}

      <div className="setup-layers">
        {ORDER.map((id) => {
          const st = states[id];
          const failed = failOf(id);
          // Тумблер горит, только если слой И ВПРАВДУ работает. Отказ читается
          // как «недоступно», а не как выбор игрока. Недоступность — любая:
          // браузерная, серверная или отказ устройства; сохранённый в профиле
          // выбор при этом не стирается — он вернётся, когда слой встанет.
          const on = layers[id] && st.available && !failed;
          // `aria-disabled`, а не родной `disabled`: выключенный элемент уходит
          // из порядка обхода, и человек с клавиатуры никогда не встретил бы
          // недоступные слои и не узнал почему. Причина связана через
          // aria-describedby, а не просто лежит рядом.
          const available = st.available && !failed;
          const cls = !available ? "off na" : on ? "on" : "off";
          const frozen = locked || !available;
          return (
            <div className={`layer ${cls}${locked ? " locked" : ""}`} key={id}>
              <span className="ly-ic" aria-hidden="true"><Icon name={ICONS[id]} /></span>
              <div className="ly-txt">
                <b>{t.layers.names[id]}</b>
                <span>{t.layers.blurbs[id]}</span>
                {/* Что понадобится от браузера — заранее, а не отказом посреди
                    партии. Только у доступных: у недоступных под тумблером
                    уже стоит причина. */}
                {available && (id === "voice" || id === "camera")
                  ? <span className="ly-req">{t.layers.needs[id]}</span> : null}
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
              <span id={`ly-note-${id}`} className={`ly-note${available ? "" : " na"}`}>
                {failed
                  ? `${id === "voice" ? t.live.offVoice : t.live.offCamera} · ${failed}`
                  : available ? t.layers.sameGrade : reasonText(st, lang)}
              </span>
              {/* STUB(live-video): живого видео-лица у собеседника НЕТ — есть
                  нарисованные выражения, и тумблер выше честно включает только
                  их. Строка без переключателя и с пометкой «недоступно»:
                  выключателя у того, чего нет, быть не может. Станет настоящим,
                  когда адаптер живого видео (ветка feature/live-video-adapter)
                  будет влит и получит ключ поставщика — тогда здесь встанет
                  тумблер по `capabilities.avatar.lipsync_mode === "video"`. */}
              {id === "avatar" ? (
                <div className="ly-later">
                  <span className="ly-ic" aria-hidden="true"><Icon name="camera" /></span>
                  <div className="ly-txt">
                    <b>{t.layers.avatarLater}</b>
                  </div>
                  <span className="ly-note na">{t.layers.unavailable}</span>
                </div>
              ) : null}
              {id === "camera" ? (
                <PokerfaceRow
                  t={t}
                  lang={lang}
                  state={states.pokerface}
                  failed={failOf("pokerface")}
                  on={layers.pokerface}
                  cameraOn={on}
                  locked={locked}
                  onToggle={() => onToggle("pokerface")}
                />
              ) : null}
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
