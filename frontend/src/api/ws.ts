// ws.ts — WebSocket client over the turn protocol (types.ts), plus a transport
// factory that transparently falls back to the local MockServer when the backend
// is unreachable (or when VITE_MOCK forces it). A REST fallback seam is stubbed.
import type { ClientMsg, ServerMsg } from "../types";
import type { ServerMsgHandler, Transport, TransportKind } from "./transport";
import { MockServer } from "../mock/mockServer";

const WS_PATH = "/ws";
const OPEN_TIMEOUT_MS = 1500;

// ---------------------------------------------------------------------------
// Real WebSocket transport
// ---------------------------------------------------------------------------
export class WsTransport implements Transport {
  private ws: WebSocket;
  private onMessage: ServerMsgHandler;
  private queue: ClientMsg[] = [];
  private ready = false;

  constructor(url: string, onMessage: ServerMsgHandler) {
    this.onMessage = onMessage;
    this.ws = new WebSocket(url);
    this.ws.onopen = () => {
      this.ready = true;
      this.queue.forEach((m) => this.rawSend(m));
      this.queue = [];
    };
    this.ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data) as ServerMsg;
        this.onMessage(msg);
      } catch {
        this.onMessage({ type: "error", message: "Malformed server message" });
      }
    };
    this.ws.onerror = () => {
      this.onMessage({ type: "error", message: "WebSocket error" });
    };
  }

  private rawSend(msg: ClientMsg): void {
    this.ws.send(JSON.stringify(msg));
  }

  send(msg: ClientMsg): void {
    if (this.ready) this.rawSend(msg);
    else this.queue.push(msg);
  }

  close(): void {
    try {
      this.ws.close();
    } catch {
      /* ignore */
    }
  }
}

// ---------------------------------------------------------------------------
// REST fallback (seam only — not implemented). A real implementation would POST
// each ClientMsg to /api/session/... and translate responses into ServerMsg.
// ---------------------------------------------------------------------------
export class RestTransport implements Transport {
  constructor(_onMessage: ServerMsgHandler) {
    void _onMessage;
    throw new Error("RestTransport not implemented — WebSocket is the primary transport.");
  }
  send(_msg: ClientMsg): void {
    void _msg;
  }
  close(): void {}
}

// ---------------------------------------------------------------------------
// Factory: choose WS or Mock. Resolves once a working transport is decided.
// ---------------------------------------------------------------------------
function wsUrl(): string {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.host}${WS_PATH}`;
}

function mockForced(): boolean {
  // VITE_MOCK=1 forces mock; VITE_MOCK=0 forces WS only (no fallback).
  return import.meta.env.VITE_MOCK === "1";
}
function mockDisabled(): boolean {
  return import.meta.env.VITE_MOCK === "0";
}

export interface CreatedTransport {
  transport: Transport;
  kind: TransportKind;
}

// Attempts a real WS connection; if it doesn't open within OPEN_TIMEOUT_MS
// (backend not running) it swaps in the MockServer so the UI still works.
export function createTransport(
  onMessage: ServerMsgHandler,
  onKind: (kind: TransportKind) => void,
): Transport {
  if (mockForced()) {
    onKind("mock");
    return new MockServer(onMessage);
  }

  let decided = false;
  let inner: Transport | null = null;
  const early: ClientMsg[] = [];

  // Public-facing proxy: buffers sends until a transport is chosen.
  const proxy: Transport = {
    send(msg) {
      if (inner) inner.send(msg);
      else early.push(msg);
    },
    close() {
      decided = true;
      inner?.close();
    },
  };

  const useMock = () => {
    if (decided) return;
    decided = true;
    const mock = new MockServer(onMessage);
    inner = mock;
    onKind("mock");
    early.forEach((m) => mock.send(m));
    early.length = 0;
  };

  const useWs = (ws: Transport) => {
    if (decided) return;
    decided = true;
    inner = ws;
    onKind("ws");
    early.forEach((m) => ws.send(m));
    early.length = 0;
  };

  try {
    const ws = new WebSocket(wsUrl());
    const timer = setTimeout(() => {
      if (!decided && !mockDisabled()) {
        try { ws.close(); } catch { /* ignore */ }
        useMock();
      }
    }, OPEN_TIMEOUT_MS);

    ws.onopen = () => {
      clearTimeout(timer);
      const wsT = new WsTransportFromSocket(ws, onMessage);
      useWs(wsT);
    };
    ws.onerror = () => {
      clearTimeout(timer);
      if (!mockDisabled()) useMock();
    };
    ws.onclose = () => {
      clearTimeout(timer);
      if (!decided && !mockDisabled()) useMock();
    };
  } catch {
    useMock();
  }

  return proxy;
}

// Wraps an already-open socket (avoids opening a second connection).
class WsTransportFromSocket implements Transport {
  private ws: WebSocket;
  constructor(ws: WebSocket, onMessage: ServerMsgHandler) {
    this.ws = ws;
    ws.onmessage = (ev) => {
      try {
        onMessage(JSON.parse(ev.data) as ServerMsg);
      } catch {
        onMessage({ type: "error", message: "Malformed server message" });
      }
    };
    ws.onerror = () => onMessage({ type: "error", message: "WebSocket error" });
  }
  send(msg: ClientMsg): void {
    this.ws.send(JSON.stringify(msg));
  }
  close(): void {
    try { this.ws.close(); } catch { /* ignore */ }
  }
}
