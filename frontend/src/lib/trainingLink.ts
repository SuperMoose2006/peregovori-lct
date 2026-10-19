// trainingLink.ts — тренировка из редактора, переданная участнику ссылкой (CE-03).
//
// Редактор собирал переговоры для другого человека, а передать их было нечем:
// стол живёт в реестре сервера ограниченное время, а черновик — в браузере
// организатора (аудит 17.10, CE-03; решение владельца 19.10 — ссылкой). В
// ссылке едут НАСТРОЙКИ, а не id стола: id истекает, а настройки дают тот же
// стол в любой момент — предпросмотр сервера детерминирован. Ни аккаунтов,
// ни хранения на сервере: ссылка и есть тренировка.
import type { Lang } from "../types";
import { normalizeDifficulty } from "./difficulty";
import { validAdminDraft, type AdminDraft } from "./adminContext";

export const TRAINING_PARAM = "training";
/** Длиннее заведомо честных настроек не бывает: тема до 120 знаков, роль до 80. */
const MAX_PARAM = 2048;

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(raw: string): string {
  const b64 = raw.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  return new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

/** Ссылка на тренировку с этими настройками. */
export function trainingLink(draft: AdminDraft, lang: Lang, origin: string): string {
  const payload = { ...draft, difficulty: normalizeDifficulty(draft.difficulty), lang };
  return `${origin.replace(/\/+$/, "")}/?${TRAINING_PARAM}=${toBase64Url(JSON.stringify(payload))}`;
}

/** Настройки тренировки из адресной строки или null. Ссылка приходит с улицы:
 *  всё, что не проходит ту же проверку, что черновик редактора, отбрасывается. */
export function readTrainingLink(search: string): { draft: AdminDraft; lang: Lang } | null {
  const raw = new URLSearchParams(search).get(TRAINING_PARAM);
  if (!raw || raw.length > MAX_PARAM || !/^[A-Za-z0-9_-]+$/.test(raw)) return null;
  try {
    const value: unknown = JSON.parse(fromBase64Url(raw));
    if (!validAdminDraft(value)) return null;
    const { lang, ...draft } = value as AdminDraft & { lang?: Lang };
    return { draft: { ...draft, difficulty: normalizeDifficulty(draft.difficulty) }, lang: lang === "en" ? "en" : "ru" };
  } catch {
    return null;
  }
}
