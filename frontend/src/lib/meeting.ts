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
