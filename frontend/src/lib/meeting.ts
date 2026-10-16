// meeting.ts — когда стол превращается во встречу с крупным собеседником.
//
// Встреча строится вокруг ЗВУЧАЩЕГО собеседника. Поэтому она включается только
// там, где звук действительно будет, и только там, где слои вообще разрешены:
//   • режим «тренировка» — единственный, где слои включаются (`sessionLayers`);
//   • слой голоса поднят в этой партии;
//   • сервер ответил `capabilities.speech === true` — синтез есть. Голос,
//     которого просили, но который не зазвучит (офлайн, нет ключа), — это
//     большая немая картинка, то самое «выглядит настоящим, а внутри пусто»;
//   • не экзамен и не капстоун: там слои погашены сервером, и лицо нейтрально.
// Правила партии, шкалы и оценка от встречи не зависят никак.
import type { Mode } from "../types";
import type { Layers } from "./layers";

export function meetingMode(opts: {
  mode: Mode;
  layers: Layers | null | undefined;
  capabilities: Record<string, unknown> | null | undefined;
}): boolean {
  if (opts.mode !== "practice") return false;
  if (!opts.layers?.voice) return false;
  return opts.capabilities?.speech === true;
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
