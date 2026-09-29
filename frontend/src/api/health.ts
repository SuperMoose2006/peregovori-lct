// health.ts (api) — что сервер сказал о себе, для доступности слоёв ДО партии.
//
// Та же развилка, что у транспорта и каталога кампаний: сервер ответил — берём
// его слова; не ответил (или офлайн-сборка VITE_MOCK=1) — «offline», и партия
// пойдёт офлайн-ядром. Проба дешёвая и одна на загрузку страницы; решает она
// только подписи и доступность слоёв (lib/layers.ts::withServer), в игру и
// оценку не входит ничем.
import { apiFetch } from "./backend";
import type { ServerHealth } from "../lib/layers";

const HEALTH_TIMEOUT_MS = 1500;

export async function fetchServerHealth(): Promise<ServerHealth | "offline"> {
  if (import.meta.env.VITE_MOCK === "1") return "offline";
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), HEALTH_TIMEOUT_MS);
    const res = await apiFetch("/api/health", { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return "offline";
    const data = (await res.json()) as ServerHealth & { ok?: boolean };
    return { cloud_ai: data.cloud_ai, voice: data.voice };
  } catch {
    return "offline";
  }
}
