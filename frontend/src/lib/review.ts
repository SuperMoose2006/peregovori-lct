// review.ts — как показать «Глубокий разбор»: подписи, время, уверенность.
//
// Отчёт строит сервер (`services/gateway/app/review/merge.py`); здесь только
// перевод кодов в слова и чисел в строки. Код без подписи в словаре не
// рисуется вовсе: незнакомое слово из ответа модели до человека не доезжает —
// так же, как на сервере не доезжает до промпта.
import type { Strings } from "../i18n";
import type { Lang, ReviewChannel, ReviewEvidence, ReviewSoft } from "../types";
import type { TransportKind } from "../api/transport";

/** Сколько строк ленты сигналов видно сразу. */
export const TIMELINE_ROWS = 12;

/** Время от начала партии: «3:07». */
export function reviewClock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Число с одним знаком после запятой — по-русски запятой. */
export function decimal(v: number, lang: Lang): string {
  const s = (Math.round(v * 10) / 10).toFixed(1);
  return lang === "ru" ? s.replace(".", ",") : s;
}

export function pct(v: number): number {
  return Math.round(Math.max(0, Math.min(1, v)) * 100);
}

/** Уверенность системы — словом. Пороги те же, что у цветов карточки. */
export function confLevel(c: number): "high" | "mid" | "low" {
  return c >= 0.7 ? "high" : c >= 0.45 ? "mid" : "low";
}

/** Что произошло — словами. Пустая строка: кода нет в словаре, не рисуем. */
export function evidenceLabel(ev: ReviewEvidence, t: Strings, lang: Lang): string {
  if (ev.channel === "video") return t.review.cues[ev.kind] ?? "";
  const tmpl = t.review.kinds[ev.kind];
  if (!tmpl) return "";
  if (ev.kind === "pause" && typeof ev.value === "number") return tmpl.replace("{v}", decimal(ev.value / 1000, lang));
  if (ev.kind === "pitch_jump" && typeof ev.value === "number") return tmpl.replace("{v}", decimal(ev.value, lang));
  return tmpl.replace("{v}", "");
}

/** Когда: «Ход 3 · 1:42». Чего не знаем, того не пишем. */
export function evidenceWhen(ev: { turn: number | null; at_ms: number | null }, t: Strings): string {
  const parts: string[] = [];
  if (typeof ev.turn === "number" && ev.turn > 0) parts.push(t.review.turn.replace("{n}", String(ev.turn)));
  if (typeof ev.at_ms === "number") parts.push(reviewClock(ev.at_ms));
  return parts.join(" · ");
}

/** Можно ли нажать кнопку, и если нет — почему. */
export function reviewAvailability(kind: TransportKind | null,
                                   capabilities: Record<string, unknown> | null,
                                   t: Strings): { ok: boolean; reason: string | null } {
  if (kind === "mock") return { ok: false, reason: t.review.offline };
  if (capabilities?.review === true) return { ok: true, reason: null };
  return { ok: false, reason: t.review.noModels };
}

/** Состояние канала одной строкой: «42 с речи», «камера была выключена». */
export function channelText(name: "content" | "voice" | "video", ch: ReviewChannel | undefined,
                            t: Strings, lang: Lang): string {
  const st = t.review.channelState;
  if (!ch) return "";
  if (ch.state === "absent") return st[ch.reason ?? ""] ?? "";
  if (ch.state === "failed") return st.failed;
  if (name === "content") {
    return st.contentOk.replace("{ok}", String(ch.agents_ok ?? 0)).replace("{total}", String(ch.agents_total ?? 0));
  }
  if (name === "voice") {
    const secs = decimal(ch.seconds ?? 0, lang);
    return (ch.state === "measured" ? st.measured : st.voiceOk).replace("{s}", secs);
  }
  return st.videoOk.replace("{n}", String(ch.frames ?? 0));
}

/** Оговорки канала: запись упёрлась в предел, память была занята, кадры прорежены. */
export function channelCaveats(ch: ReviewChannel | undefined, t: Strings): string[] {
  if (!ch) return [];
  const st = t.review.channelState;
  return [ch.truncated && st.truncated, ch.starved && st.starved, ch.thinned && st.thinned]
    .filter((x): x is string => !!x);
}

/** Вывод «как вы говорили»: число и пояснение. */
export function softValue(item: ReviewSoft, t: Strings, lang: Lang): { value: string; detail: string } {
  if (item.unavailable) return { value: "—", detail: t.review.softUnavailable };
  if (item.value === null || item.value === undefined) return { value: "—", detail: t.review.softNone };
  const detail = typeof item.num === "number" && typeof item.den === "number" && item.den > 0
    ? t.review.ratio.replace("{num}", formatCount(item.num, lang)).replace("{den}", String(item.den))
    : "";
  return { value: `${pct(item.value)}%`, detail };
}

function formatCount(n: number, lang: Lang): string {
  return Number.isInteger(n) ? String(n) : decimal(n, lang);
}
