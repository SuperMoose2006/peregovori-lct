// deviceCheck.ts — проверка камеры и микрофона В МОМЕНТ ВКЛЮЧЕНИЯ СЛОЯ.
//
// ЗАЧЕМ. Раньше `getUserMedia` вызывался только при старте партии
// (realtime/vendor/media-provider.ts), и под тумблером было написано «браузер
// спросит разрешение, когда начнётся партия». То есть человек включал слой и не
// знал, работает ли камера: отказ, отсутствие устройства или камера, занятая
// видеозвонком, выяснялись посреди переговоров — системным окном поверх стола.
//
// Теперь нажатие тумблера (это пользовательский жест, браузер такой запрос
// разрешает) сразу спрашивает доступ, и ответ пишется рядом с тумблером.
// Полученный поток ЗАКРЫВАЕТСЯ ТУТ ЖЕ: нужна только проверка доступа, а
// горящий индикатор камеры, пока человек ходит по меню, выглядит как слежка.
// Партия потом откроет устройство заново — повторный `getUserMedia` доступ не
// переспрашивает (см. комментарий к `startCamera` в media-provider.ts).
//
// Слой, недоступный по другой причине (сервер не поднял зрение, нет связи —
// SERVER_SIDE_REASON / NO_SERVER_REASON в lib/layers.ts), сюда не попадает
// вовсе: у него тумблер заперт, и спрашивать устройство незачем.
import { pruneLayers, type LayerId, type Layers, type LayerState } from "./layers";

/** Какое устройство нужно слою. Покерфейс считает по кадрам камеры и своего
 *  устройства не просит: без проверенной камеры его не включить. */
export type DeviceLayer = "voice" | "camera";

export type DeviceCheck = "checking" | "granted" | "denied" | "missing" | "busy" | "failed";
export type DeviceChecks = Partial<Record<DeviceLayer, DeviceCheck>>;

/** Отказ браузера → то, что с ним делать человеку. */
export function classifyMediaError(error: unknown): Exclude<DeviceCheck, "checking" | "granted"> {
  const name = (error as { name?: string })?.name ?? "";
  if (name === "NotAllowedError" || name === "SecurityError" || name === "PermissionDeniedError") return "denied";
  if (name === "NotFoundError" || name === "OverconstrainedError" || name === "DevicesNotFoundError") return "missing";
  if (name === "NotReadableError" || name === "TrackStartError" || name === "AbortError") return "busy";
  return "failed";
}

type MediaLike = Pick<MediaDevices, "getUserMedia">;

/**
 * Спросить устройство и тут же отпустить. Без требований к формату (`true`):
 * проверяется доступ, а не разрешение кадра — узкие требования давали отказ
 * «устройство не найдено» при живой камере (см. media-provider.ts).
 */
export async function checkDevice(layer: DeviceLayer, media?: MediaLike | null): Promise<DeviceCheck> {
  const md = media ?? (typeof navigator !== "undefined" ? navigator.mediaDevices : undefined);
  if (!md?.getUserMedia) return "failed";
  try {
    const stream = await md.getUserMedia(layer === "camera" ? { video: true, audio: false } : { audio: true, video: false });
    stream.getTracks().forEach((track) => track.stop());
    return "granted";
  } catch (error) {
    return classifyMediaError(error);
  }
}

/**
 * Новый выбор слоёв с проверкой устройств. Спрашивается ТОЛЬКО то, что сейчас
 * включают (было выключено — стало включено) и что вообще доступно. Не
 * выданное устройство слой не включает: тумблер не остаётся «включён», будто
 * всё хорошо. Покерфейс гаснет вместе с камерой, которую не дали.
 */
export async function requestLayers(
  current: Layers,
  next: Layers,
  states: Record<LayerId, LayerState>,
  check: (layer: DeviceLayer) => Promise<DeviceCheck>,
  onProgress?: (layer: DeviceLayer, result: DeviceCheck) => void,
): Promise<{ layers: Layers; checks: DeviceChecks }> {
  const out: Layers = { ...next };
  const checks: DeviceChecks = {};
  for (const layer of ["camera", "voice"] as DeviceLayer[]) {
    if (!next[layer] || current[layer] || !states[layer].available) continue;
    onProgress?.(layer, "checking");
    const result = await check(layer);
    checks[layer] = result;
    onProgress?.(layer, result);
    if (result !== "granted") out[layer] = false;
  }
  return { layers: pruneLayers(out, states), checks };
}
