// meeting.ts — созвон: когда в него можно войти и что показывает его экран.
//
// Созвон — отдельный режим партии, а не чат с микрофоном (lib/layers.ts,
// `textLayers`). Партия начинается чатом; кнопка «Созвон» уводит её на экран
// звонка, «Завершить» возвращает в чат с тем же ходом. Правила партии, шкалы
// и оценка от режима не зависят никак: голос и клавиатура дают один и тот же
// ход (инвариант 7).
import type { Lang } from "../types";
import { NO_SERVER_REASON, reasonText, type LayerState } from "./layers";

/** Кнопка «Созвон»: спрятана, доступна или видна с причиной отказа. */
export type CallOffer = { show: false } | { show: true; reason: string | null };

/**
 * Предлагать ли созвон за этим столом.
 *
 *   • партия на зачёт (экзамен, капстоун, акт кампании, своя сделка) — кнопки
 *     нет вовсе: слоёв там не бывает, и запрет читается шторкой слоёв;
 *   • тренировка, а голос в этом окружении не поднимется (нет https, сервер
 *     без распознавания, офлайн-ядро) — кнопка видна и называет причину, а не
 *     исчезает молча: иначе человек не узнает, что созвон вообще бывает;
 *   • иначе — можно звонить.
 */
export function callOffer(opts: {
  /** `callLayers(...) !== null` без учёта окружения — правило партии. */
  allowed: boolean;
  voice: LayerState;
  /** Партия идёт офлайн-ядром: созвона там нет, что бы ни сказал браузер. */
  offline: boolean;
  lang: Lang;
}): CallOffer {
  if (!opts.allowed) return { show: false };
  if (opts.offline) return { show: true, reason: NO_SERVER_REASON[opts.lang] };
  return { show: true, reason: opts.voice.available ? null : reasonText(opts.voice, opts.lang) };
}

/**
 * Что делает «Завершить» прямо сейчас.
 *
 *   switch — сменить сокет: та же партия уходит в чат (`relayer`);
 *   wait   — подождать: ход в полёте, звонок ещё подключается или связь
 *            возвращается. Сокет меняется только на спокойной связи и между
 *            ходами: уйти в чат сразу значило бы оставить партию в голосовом
 *            сокете под текстовым экраном;
 *   local  — менять сокет незачем (стол закрыт, связь потеряна насовсем):
 *            устройства гаснут, экран возвращается в чат.
 */
export type HangUp = "switch" | "wait" | "local";
export function hangUpAction(s: {
  open: boolean;
  busy: boolean;
  switching: boolean;
  conn: "connecting" | "online" | "reconnecting" | "lost";
}): HangUp {
  if (!s.open || s.conn === "lost") return "local";
  if (s.busy || s.switching || s.conn !== "online") return "wait";
  return "switch";
}

/**
 * Видео собеседника ещё подключается. Подключение к сервису живого видео
 * стартует вместе с партией, но холодный старт у сервиса — ~10 с (журнал
 * стенда 16.10: сокет 00:36:29, «на связи» 00:36:40), и приветствие звучит
 * раньше. Без этой подписи статичный портрет выглядел конечным состоянием —
 * «видео не работает». Флаг ведёт транспорт: снят первым кадром, поднят
 * портретом по причине `not_connected`.
 */
export function videoPending(capabilities: Record<string, unknown> | null | undefined): boolean {
  const a = capabilities?.avatar as { lipsync_mode?: unknown; pending?: unknown } | undefined;
  if (!a) return false;
  if (a.pending === true) return true;
  return a.lipsync_mode === "video" && a.pending === undefined;
}

/** Стенд обязан быть подписан как стенд. */
export function syntheticFace(capabilities: Record<string, unknown> | null | undefined): boolean {
  return (capabilities?.avatar as { synthetic?: unknown } | undefined)?.synthetic === true;
}

export type MeetingStatus = "connecting" | "reconnecting" | "lost" | "speaking" | "hearing" | "thinking" | "listening";

/** Одно слово о том, что сейчас происходит во встрече. Порядок — по важности:
 *  связь важнее всего, потом тот, кто говорит, потом ожидание ответа. */
export function meetingStatus(s: {
  conn: "connecting" | "online" | "reconnecting" | "lost";
  oppSpeaking: boolean;
  userSpeaking: boolean;
  busy: boolean;
}): MeetingStatus {
  if (s.conn === "reconnecting") return "reconnecting";
  if (s.conn === "lost") return "lost";
  if (s.conn === "connecting") return "connecting";
  if (s.oppSpeaking) return "speaking";
  if (s.userSpeaking) return "hearing";
  if (s.busy) return "thinking";
  return "listening";
}
