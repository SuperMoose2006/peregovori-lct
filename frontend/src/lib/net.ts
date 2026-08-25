// net.ts — pure helpers for the client's network-resilience seams: WebSocket
// reconnect backoff, the custom-generation timeout state machine, and the
// composer input-length guard. Deliberately side-effect free so each little
// state machine is unit-testable without a browser or a live socket.

// ---------------------------------------------------------------------------
// Reconnect backoff (mid-game WS drop). We probe quickly at first, then back
// off, and give up after a small cap so we never hammer a downed server.
// ---------------------------------------------------------------------------
// ЕДИНСТВЕННЫЙ ИСТОЧНИК ПОЛИТИКИ ПЕРЕПОДКЛЮЧЕНИЯ. Раньше она существовала
// дважды: здесь — с тестами, и вписанными числами в realtime-session.ts, где
// работала на самом деле. Числа разошлись: тесты проверяли три попытки с базой
// 500 мс, продукт делал четыре с базой 400. То есть тест охранял политику,
// которой в приложении не было.
//
// Побеждают числа РАБОТАЮЩЕЙ ветки: четыре попытки щадят человека, у которого
// моргнул wifi, больше трёх (суммарно 6 с ожидания против 3.5).
export const MAX_RECONNECT_ATTEMPTS = 4;
const RECONNECT_BASE_MS = 400;
const RECONNECT_CAP_MS = 4000;

// 1-based attempt number → delay (ms) to wait before making that attempt.
// Exponential (500 → 1000 → 2000 …), capped, and defensive against junk input.
export function reconnectDelay(attempt: number): number {
  const a = Math.max(1, Math.floor(attempt));
  return Math.min(RECONNECT_CAP_MS, RECONNECT_BASE_MS * 2 ** (a - 1));
}

// Whether an attempt is still within the retry budget (attempts are 1-based, so
// 1..MAX are allowed; the first over-budget attempt trips the "lost" state).
export function canReconnect(attempt: number): boolean {
  return attempt <= MAX_RECONNECT_ATTEMPTS;
}

// ---------------------------------------------------------------------------
// Custom-generation flow. A tiny state machine so a hung or failed generation
// ALWAYS resolves into a visible outcome instead of an infinite "генерируем…".
// ---------------------------------------------------------------------------
export type GenPhase = "idle" | "generating" | "ready" | "failed";
export type GenEvent = "start" | "greeting" | "error" | "timeout" | "reset";

// A generation that takes longer than this with no greeting/error is treated as
// failed (the loading screen would otherwise spin forever).
export const GEN_TIMEOUT_MS = 30000;

export function genReducer(phase: GenPhase, ev: GenEvent): GenPhase {
  switch (ev) {
    case "start":
      return "generating";
    case "reset":
      return "idle";
    // Only a live generation can succeed or fail. A late greeting/error/timeout
    // arriving after we've already resolved must not clobber the running game or
    // flip a settled outcome (guards a slow backend racing the client timeout).
    case "greeting":
      return phase === "generating" ? "ready" : phase;
    case "error":
      return phase === "generating" ? "failed" : phase;
    case "timeout":
      return phase === "generating" ? "failed" : phase;
    default:
      return phase;
  }
}

// ---------------------------------------------------------------------------
// Composer input guard. Cap the turn text so a pasted wall of text can't blow up
// the payload; a gentle remaining-count note appears as the player nears the cap.
// ---------------------------------------------------------------------------
export const MAX_INPUT = 2000;
export const INPUT_NOTE_AT = 1800; // show the remaining-count note past this length

export function clampInput(text: string, max = MAX_INPUT): string {
  return text.length > max ? text.slice(0, max) : text;
}

export function inputRemaining(text: string, max = MAX_INPUT): number {
  return max - text.length;
}

// Whether to surface the gentle "N chars left" note for the current text.
export function showInputNote(text: string, at = INPUT_NOTE_AT): boolean {
  return text.length >= at;
}
