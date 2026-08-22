// layers.ts — the optional modality layers and, more importantly, whether they
// are actually available.
//
// The governing rule (docs/modalities.md): a layer never touches scoring. A
// grade earned with the camera on must be comparable to one earned without it,
// otherwise the exam certificate means nothing and campaign acts stop being
// comparable. Layers only change WHAT THE DEBRIEF SHOWS.
//
// The second rule is about honesty in the other direction: a layer we cannot
// actually deliver reports itself UNAVAILABLE. It is never faked. The setup
// screen was designed with an "unavailable" state precisely so that this is a
// first-class outcome and not a failure.
import type { Lang } from "../types";

export type LayerId = "probe" | "voice" | "camera";

export interface LayerState {
  id: LayerId;
  available: boolean;
  /** Why it is unavailable — rendered under the toggle. Null when available. */
  reason: { ru: string; en: string } | null;
}

export type Layers = Record<LayerId, boolean>;

export const NO_LAYERS: Layers = { probe: false, voice: false, camera: false };

/** Presets are names you can say on stage; the toggles underneath are the truth. */
export const PRESETS: { id: string; label: { ru: string; en: string }; layers: Layers }[] = [
  { id: "classic", label: { ru: "Классика", en: "Classic" }, layers: NO_LAYERS },
  { id: "read", label: { ru: "Читай лицо", en: "Read the face" },
    layers: { probe: true, voice: false, camera: false } },
  { id: "full", label: { ru: "Полный контакт", en: "Full contact" },
    layers: { probe: true, voice: true, camera: true } },
];

// STUB(voice): нет ни STT, ни TTS — слой объявляет себя недоступным, а не имитирует
//   разговор. Настоящим станет: адаптер распознавания, отдающий тот же turn.text,
//   плюс правило «расшифровка редактируется до отправки». См. docs/modalities.md §3.
// STUB(camera): нет распознавания лица. Настоящим станет: MediaPipe Face Landmarker
//   в WASM локально, наружу только агрегаты (взгляд/устойчивость/моргание), кадры не
//   покидают браузер. См. docs/modalities.md §2.
export function detectLayers(): Record<LayerId, LayerState> {
  return {
    // Fully real: the engine already computes a reaction every turn, so reading
    // it is deterministic, offline and free. No AI and no permissions involved.
    probe: { id: "probe", available: true, reason: null },
    voice: {
      id: "voice", available: false,
      reason: { ru: "распознавание речи ещё не подключено", en: "speech recognition not wired yet" },
    },
    camera: {
      id: "camera", available: false,
      reason: { ru: "чтение мимики ещё не подключено", en: "face reading not wired yet" },
    },
  };
}

/** Drop any layer the environment cannot actually deliver. Called on start, so a
 *  stale saved preset can never switch on something that does not exist. */
export function pruneLayers(want: Layers, have: Record<LayerId, LayerState>): Layers {
  return {
    probe: want.probe && have.probe.available,
    voice: want.voice && have.voice.available,
    camera: want.camera && have.camera.available,
  };
}

export function reasonText(s: LayerState, lang: Lang): string {
  return s.reason ? s.reason[lang] : "";
}
