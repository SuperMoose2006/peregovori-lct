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

/**
 * УМОЛЧАНИЕ ДЛЯ НОВОГО ПРОФИЛЯ — ВСЕ СЛОИ ВКЛЮЧЕНЫ. Человек, зашедший впервые
 * (жюри — с чистым профилем), с выключенными слоями не увидел бы ни голоса, ни
 * лица, ни вопросов о реакции — половины продукта. Три оговорки держат это
 * честным:
 *   1. выбор человека сильнее умолчания: есть сохранённый набор — он и
 *      действует, умолчание касается только профиля, где выбора ещё не было;
 *   2. недоступный слой не горит: `pruneLayers`/`withServer` гасят его с той же
 *      причиной, что и всегда (браузер, сервер, нет связи);
 *   3. камеру и микрофон умолчание НЕ выпрашивает при открытии страницы —
 *      доступ спрашивается при первом осмысленном действии (начало партии или
 *      нажатие), а отказ гасит слой (lib/deviceCheck.ts::dropFailedLayers).
 */
export const DEFAULT_LAYERS: Layers = {
  probe: true, voice: true, camera: true, avatar: true, pokerface: true,
};

/** Сохранённый выбор слоёв. Нет записи — выбора не было, действует умолчание.
 *  Запись испорчена — выбора не разобрать, и включать камеру по догадке нельзя:
 *  всё выключено. */
export function parseLayerPrefs(raw: string | null): Layers {
  if (!raw) return { ...DEFAULT_LAYERS };
  try {
    const saved = JSON.parse(raw) as Partial<Layers>;
    if (!saved || typeof saved !== "object") return { ...NO_LAYERS };
    return {
      probe: !!saved.probe, voice: !!saved.voice, camera: !!saved.camera,
      avatar: !!saved.avatar, pokerface: !!saved.pokerface,
    };
  } catch {
    return { ...NO_LAYERS };
  }
}

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
    layers: { probe: true, voice: true, camera: true, avatar: true, pokerface: true } },
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

/**
 * ПОЧЕМУ ПРИЧИНЫ ЖИВУТ ЗДЕСЬ, А НЕ ТОЛЬКО В `detectLayers`.
 *
 * `detectLayers()` знает про БРАУЗЕР: даёт ли он `getUserMedia`, защищён ли
 * контекст. Про облако он не знает ничего, а слой камеры поднимается только
 * если на сервере есть ключ модели зрения. До сих пор сервер честно сообщал об
 * этом в `session.created.capabilities.camera`, а клиент это поле НЕ ЧИТАЛ
 * НИГДЕ: камера открывалась, кадры уходили раз в секунду, чип за столом горел
 * «кадры идут» — и ни один из них никто не смотрел. Открытый поток не
 * доказывает работу зрения; ушедший кадр, как выяснилось, тоже: он уходит и в
 * мёртвый слой. Доказывает только ответ модели.
 *
 * Отсюда эти строки: слой, который сервер не поднял, обязан назвать себя
 * словами — теми же, что и отказ браузера.
 */
export const SERVER_SIDE_REASON: Record<"camera" | "voice", { ru: string; en: string }> = {
  camera: {
    ru: "на сервере нет облачного зрения — смотреть на кадры некому, поэтому камера не включалась",
    en: "the server has no cloud vision — nobody would look at the frames, so the camera was not opened",
  },
  voice: {
    ru: "на сервере не поднялось распознавание речи — ход голосом не уедет, печатайте; оппонента при этом слышно",
    en: "speech recognition did not come up on the server — a spoken turn will not go through, so type; you can still hear the opponent",
  },
};

/** Сервера нет вовсе — партия идёт офлайн-ядром в браузере, и ни голоса, ни
 *  камеры, ни реакций лица от сервера там не будет. */
export const NO_SERVER_REASON: { ru: string; en: string } = {
  ru: "нет связи с сервером — это работает только через него; партия идёт офлайн, текстом",
  en: "no connection to the server — this only works through it; the game runs offline, in text",
};

/** Что сервер сказал о себе в `/api/health` — ровно те поля, что решают слои. */
export interface ServerHealth {
  cloud_ai?: boolean;
  voice?: string;
}

/**
 * Доступность слоёв С УЧЁТОМ СЕРВЕРА — до партии, а не после неё.
 *
 * ЗАЧЕМ. `detectLayers` знает только браузер. Без сервера (или с сервером без
 * облака) «Голосом» и «Камера» в профиле выглядели рабочими: тумблер
 * включался, подпись обещала своё, — а честная причина появлялась только за
 * столом, после перезапуска партии. Для человека это и был «переключатель,
 * который не работает» (разбор первого захода; e2e: layers-offline-offered).
 *
 * Правила — только из того, что сервер САМ сказал:
 *   null      — ещё не ответил: утверждать нечего, остаётся браузерное;
 *   "offline" — сервера нет: голос, камера, покерфейс и реакции лица с сервера
 *               недоступны (офлайн-ядро их не умеет);
 *   cloud_ai === false — нет облачного зрения: камера и покерфейс недоступны;
 *   voice начинается с "unavailable" — голос недоступен.
 * Уже недоступное браузером не переписывается: его причина первичнее.
 */
export function withServer(
  states: Record<LayerId, LayerState>,
  server: ServerHealth | "offline" | null,
): Record<LayerId, LayerState> {
  if (server === null) return states;
  const out = { ...states };
  const deny = (id: LayerId, reason: { ru: string; en: string }) => {
    if (out[id].available) out[id] = { id, available: false, reason };
  };
  if (server === "offline") {
    for (const id of ["voice", "camera", "pokerface", "avatar"] as LayerId[]) deny(id, NO_SERVER_REASON);
    return out;
  }
  if (server.cloud_ai === false) {
    deny("camera", SERVER_SIDE_REASON.camera);
    deny("pokerface", SERVER_SIDE_REASON.camera);
  }
  if (typeof server.voice === "string" && server.voice.startsWith("unavailable")) {
    deny("voice", SERVER_SIDE_REASON.voice);
  }
  return out;
}

/**
 * Разбор, когда камера смотрела и ничего не сказала.
 *
 * Пустая лента и невставший слой выглядели в разборе одинаково — то есть слой,
 * честно отработавший всю партию, был неотличим от отсутствующего. Разница
 * между «нечего сказать» и «некому было смотреть» и есть весь принцип 2, и
 * стоит она одного числа: сколько кадров модель досмотрела до ответа.
 */
export const LOOKED_IN_SILENCE = {
  ru: "Камера смотрела {n} раз и ничего примечательного не увидела. Это ответ слоя, а не его отсутствие.",
  en: "The camera looked {n} times and saw nothing notable. That is the layer answering, not the layer missing.",
};
