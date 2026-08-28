// layers.ts — опциональные слои модальностей и, что важнее, доступны ли они на самом деле.
//
// Правило первое (docs/modalities.md): слой НИКОГДА не касается оценки. Грейд,
// заработанный с камерой, обязан быть сравним с грейдом без неё — иначе
// сертификат экзамена ничего не значит, а акты кампании перестают быть
// сопоставимыми. Слои меняют только ТО, ЧТО ПОКАЗЫВАЕТ РАЗБОР, и то, насколько
// живым выглядит оппонент.
//
// Правило второе — честность в другую сторону: слой, который мы не умеем,
// объявляет себя НЕДОСТУПНЫМ. Он никогда не имитируется. Панель слоёв
// специально спроектирована с этим состоянием, поэтому «недоступно» — штатный
// исход, а не сбой.
//
// ЧТО ИЗМЕНИЛОСЬ ПОСЛЕ ПЕРЕСБОРКИ. Голос и камера были `STUB` — их не
// существовало. Теперь существуют: микрофон → VAD (ten-vad) → детектор конца
// реплики → распознавание → ход движка, и обратно синтез речи; камера → редкие
// кадры в модель зрения. Поэтому их доступность больше не «нет», а зависит от
// двух настоящих условий: браузер даёт `getUserMedia` и страница в защищённом
// контексте. Слоя лица не было вовсе — он добавлен.
import type { Lang, Mode } from "../types";

export type LayerId = "probe" | "voice" | "camera" | "avatar" | "pokerface";

export interface LayerState {
  id: LayerId;
  available: boolean;
  /** Почему недоступен — рисуется под переключателем. Null, когда доступен. */
  reason: { ru: string; en: string } | null;
}

export type Layers = Record<LayerId, boolean>;

export const NO_LAYERS: Layers = {
  probe: false, voice: false, camera: false, avatar: false, pokerface: false,
};

/** Пресеты — это имена, которые можно назвать со сцены; истина — переключатели под ними. */
export const PRESETS: { id: string; label: { ru: string; en: string }; layers: Layers }[] = [
  { id: "classic", label: { ru: "Классика", en: "Classic" }, layers: NO_LAYERS },
  { id: "read", label: { ru: "Читай лицо", en: "Read the face" },
    layers: { ...NO_LAYERS, probe: true, avatar: true } },
  { id: "call", label: { ru: "Видеозвонок", en: "Video call" },
    layers: { ...NO_LAYERS, voice: true, avatar: true } },
  // «Покерфейс» — единственный пресет, где камера включена ради ИГРОКА, а не
  // ради оппонента: она считает, сколько раз лицо выдало себя явным выражением.
  { id: "poker", label: { ru: "Покерфейс", en: "Poker face" },
    layers: { ...NO_LAYERS, camera: true, avatar: true, pokerface: true } },
  { id: "full", label: { ru: "Полный контакт", en: "Full contact" },
    layers: { probe: true, voice: true, camera: true, avatar: true, pokerface: false } },
];

/**
 * Микрофон и камера требуют защищённого контекста. Это не наша придирчивость:
 * браузер просто не отдаст поток по http с чужого хоста, и переключатель,
 * который «включается», но ничего не делает, — ровно тот четвёртый вид
 * состояния, которого в продукте не бывает.
 */
function mediaAllowed(): boolean {
  if (typeof navigator === "undefined") return false;
  if (!navigator.mediaDevices?.getUserMedia) return false;
  return typeof window === "undefined" || window.isSecureContext !== false;
}

export function detectLayers(): Record<LayerId, LayerState> {
  const media = mediaAllowed();
  const insecure = {
    ru: "нужен https или localhost — браузер не даёт микрофон и камеру иначе",
    en: "needs https or localhost — the browser withholds mic and camera otherwise",
  };

  return {
    // Полностью настоящий и офлайновый: движок и так считает реакцию каждый
    // ход, так что правильный ответ детерминирован и бесплатен.
    probe: { id: "probe", available: true, reason: null },
    // Настоящий: ten-vad → детектор конца реплики → распознавание → ход, и
    // синтез речи оппонента обратно. Голос и текст дают одинаковый ход.
    voice: { id: "voice", available: media, reason: media ? null : insecure },
    // Настоящий, но узко: кадры уходят в модель зрения редко и адаптивно, и
    // отвечают только на вопрос о присутствии и обстановке. Оценку не трогают.
    camera: { id: "camera", available: media, reason: media ? null : insecure },
    // Лицо оппонента: набор состояний, которые переключает РЕАКЦИЯ ДВИЖКА.
    // Работает всегда — картинки лежат рядом, сеть и разрешения не нужны.
    avatar: { id: "avatar", available: true, reason: null },
    // Считает кадры, на которых лицо несёт ЯВНОЕ выражение вместо нейтрального.
    // Наблюдаемый признак, а не вывод о внутреннем состоянии, и в грейд он не
    // входит: держать лицо — упражнение, а не критерий сделки.
    pokerface: { id: "pokerface", available: media, reason: media ? null : insecure },
  };
}

/** Выбросить слой, который окружение не может дать. Вызывается на старте, чтобы
 *  сохранённый пресет не включил то, чего нет. */
export function pruneLayers(want: Layers, have: Record<LayerId, LayerState>): Layers {
  return {
    probe: want.probe && have.probe.available,
    voice: want.voice && have.voice.available,
    camera: want.camera && have.camera.available,
    avatar: want.avatar && have.avatar.available,
    // Без камеры считать нечего. Сервер гасит этот тумблер у себя по той же
    // причине (session.py: правило, которое соблюдает только клиент, — не
    // правило); здесь он гасится, чтобы переключатель не горел впустую.
    pokerface: want.pokerface && want.camera && have.pokerface.available,
  };
}

/**
 * Какие слои реально получает партия — единственное место, где живёт правило
 * «партия на оценку идёт без слоёв».
 *
 * Раньше это правило стояло веткой в роутере, рядом с экраном подготовки: тот
 * экран убрали — и правило поехало бы вместе с ним. Здесь оно чистая функция,
 * и её держит тест. Принцип 3: грейд со слоями обязан быть сравним с грейдом
 * без них, поэтому слои живут только в тренировке. Экзамен, акт кампании,
 * капстоун курса (`fixedOff`) и своя сделка идут с погашенными слоями.
 */
export function sessionLayers(
  mode: Mode,
  want: Layers,
  have: Record<LayerId, LayerState>,
  fixedOff = false,
): Layers {
  if (fixedOff || mode !== "practice") return NO_LAYERS;
  return pruneLayers(want, have);
}

export function reasonText(s: LayerState, lang: Lang): string {
  return s.reason ? s.reason[lang] : "";
}
