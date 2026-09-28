// faceSource.ts — какой источник рисует лицо оппонента. Решение явное и одно.
//
// ПОЧЕМУ ОТДЕЛЬНО. Раньше выбор жил внутри разметки `OpponentFace` тремя
// вложенными тернарниками, и в режиме видео между кадрами лицо молча
// переключалось на рисованный SVG — другое лицо, другой стиль, — а при первом
// кадре обратно. Скачок на ЧУЖОЕ лицо — худшее, что может случиться в
// разговоре, который тренирует чтение собеседника.

/** Чем сервер умеет рисовать лицо — по `capabilities.avatar.lipsync_mode`. */
export type FaceRenderer = "portrait" | "amplitude" | "video";

/** Что именно на экране прямо сейчас. */
export type FaceSource =
  /** Свежий кадр модели/стенда по часам звука. */
  | "frame"
  /** Портрет ТОГО ЖЕ персонажа в текущем состоянии — согласованная пауза. */
  | "still"
  /** Существующий циклический ролик состояния (дыхание, без губ). */
  | "loop"
  /** Рисованный портрет: либо амплитудный режим, либо набора картинок нет. */
  | "drawn";

export function faceRenderer(capabilities: Record<string, unknown> | null | undefined): FaceRenderer {
  const mode = String((capabilities?.avatar as { lipsync_mode?: unknown } | undefined)?.lipsync_mode ?? "");
  if (mode === "video") return "video";
  if (mode === "amplitude") return "amplitude";
  return "portrait";
}

export interface FaceInputs {
  renderer: FaceRenderer;
  exam: boolean;
  reducedMotion: boolean;
  /** Есть свежий кадр (не старше порога очереди кадров). */
  hasFrame: boolean;
  /** Картинка состояния не загрузилась. */
  stillFailed: boolean;
  /** Ролик состояния не загрузился. */
  loopFailed: boolean;
}

export function pickFaceSource(i: FaceInputs): FaceSource {
  // Экзамен: лицо неподвижно и нейтрально — оно не должно выдавать шкалы.
  if (i.exam) return i.stillFailed ? "drawn" : "still";
  if (i.renderer === "video") {
    // Между кадрами — портрет того же человека, а не рисованная замена.
    if (i.hasFrame) return "frame";
    return i.stillFailed ? "drawn" : "still";
  }
  if (i.renderer === "amplitude") return "drawn";
  if (!i.reducedMotion && !i.loopFailed) return "loop";
  return i.stillFailed ? "drawn" : "still";
}
