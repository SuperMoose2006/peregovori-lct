// transport.ts — the abstraction the UI talks to. Both the real WebSocket client
// (ws.ts) and the local MockServer (mock/mockServer.ts) implement this, so the
// components/hook never care which one is behind them. A REST fallback would be a
// third implementation of the same interface (seam left in ws.ts).
import type { ClientMsg, ServerMsg } from "../types";

export type ServerMsgHandler = (msg: ServerMsg) => void;

export interface Transport {
  /** Push a client message toward the server (or mock). */
  send(msg: ClientMsg): boolean | void;
  /** Tear down the connection / cancel pending timers. */
  close(): void;
  /** Мгновенный уровень микрофона 0..1. Локальный, поэтому без задержки сети.
   *  Офлайн-ядро микрофона не держит и его не реализует. */
  micLevel?(): number;
  /** Amplitude of opponent audio on its playback clock; no input audio. */
  speechLevel?(): number;
  videoFrame?(): string | null;
  /** Звук ответа пришёл, но браузер его не играет — нужен жест пользователя. */
  audioBlocked?(): boolean;
  /** Жест пользователя: разрешить браузеру играть звук. */
  resumeAudio?(): void;
  /** Выключить/включить микрофон, не закрывая партию. */
  setMicMuted?(muted: boolean): void;
  /** Оборвать реплику оппонента вручную (кнопка, а не голос). */
  interrupt?(): void;
}

export type TransportKind = "ws" | "mock";

// Live connection health for the real WS transport. The mock is always "online".
// "reconnecting" = a mid-game drop is being retried; "lost" = retries exhausted.
export type ConnStatus = "connecting" | "online" | "reconnecting" | "lost";
