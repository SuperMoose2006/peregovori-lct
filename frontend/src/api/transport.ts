// transport.ts — the abstraction the UI talks to. Both the real WebSocket client
// (ws.ts) and the local MockServer (mock/mockServer.ts) implement this, so the
// components/hook never care which one is behind them. A REST fallback would be a
// third implementation of the same interface (seam left in ws.ts).
import type { ClientMsg, ServerMsg } from "../types";

export type ServerMsgHandler = (msg: ServerMsg) => void;

export interface Transport {
  /** Push a client message toward the server (or mock). */
  send(msg: ClientMsg): void;
  /** Tear down the connection / cancel pending timers. */
  close(): void;
}

export type TransportKind = "ws" | "mock";
