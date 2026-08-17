// ws.ts — WebSocket client over the turn protocol (types.ts), plus a transport
// factory that transparently falls back to the local MockServer when the backend
// is unreachable (or when VITE_MOCK forces it). A REST fallback seam is stubbed.
import type { ClientMsg, ServerMsg } from "../types";
import type { ConnStatus, ServerMsgHandler, Transport, TransportKind } from "./transport";
import { MockServer } from "../mock/mockServer";
import { canReconnect, reconnectDelay } from "../lib/net";

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
// onStatus (optional) reports live connection health AFTER the WS is chosen — a
// mid-game drop drives "reconnecting" → "online" (recovered) or "lost" (gave up).
//
// ROBUSTNESS INVARIANT (item 7): the mock fallback is INITIAL-CONNECT ONLY. It can
// fire solely while `decided === false` — and `decided` flips true the instant the
// socket opens (`ws.onopen` → useWs). So a slow/failed PER-TURN opponent or judge
// response on an ALREADY-CONNECTED session never triggers useMock: the socket stays
// open (no drop event), the "demo mode (no server)" banner never appears, judge_active
// stays as the greeting set it, and the typing indicator holds. Only a real socket
// close/error mid-session engages LiveWsTransport's reconnect path (a distinct
// "reconnecting" banner), never the mock swap.
export function createTransport(
  onMessage: ServerMsgHandler,
  onKind: (kind: TransportKind) => void,
  onStatus?: (status: ConnStatus) => void,
): Transport {
  const status = onStatus ?? (() => {});
  if (mockForced()) {
    onKind("mock");
    status("online");
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
    status("online");
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
    const url = wsUrl();
    const ws = new WebSocket(url);
    const timer = setTimeout(() => {
      if (!decided && !mockDisabled()) {
        try { ws.close(); } catch { /* ignore */ }
        useMock();
      }
    }, OPEN_TIMEOUT_MS);

    ws.onopen = () => {
      clearTimeout(timer);
      // Hand the already-open socket to the reconnecting transport; it owns the
      // socket's lifecycle from here (drops → backoff retries → online/lost).
      const wsT = new LiveWsTransport(ws, url, onMessage, status);
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

// Wraps an already-open socket and keeps the connection alive across mid-game
// drops. On close/error it reports "reconnecting", retries with capped backoff
// (lib/net), and reports "online" on recovery or "lost" once the budget is spent.
// Sends issued while down are queued and flushed on reconnect (best-effort — the
// server session is in-memory, so a resumed turn may come back as an error the
// UI already handles; the point is to never freeze on a dead socket).
class LiveWsTransport implements Transport {
  private ws: WebSocket | null = null;
  private readonly url: string;
  private readonly onMessage: ServerMsgHandler;
  private readonly onStatus: (s: ConnStatus) => void;
  private attempts = 0;
  private closed = false;
  private open = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private outbox: ClientMsg[] = [];

  constructor(
    ws: WebSocket,
    url: string,
    onMessage: ServerMsgHandler,
    onStatus: (s: ConnStatus) => void,
  ) {
    this.url = url;
    this.onMessage = onMessage;
    this.onStatus = onStatus;
    this.adopt(ws, true); // the initial socket is already open
  }

  // Wire a socket's lifecycle. alreadyOpen=true for the first (handed-in) socket;
  // reconnect sockets report open via onopen.
  private adopt(ws: WebSocket, alreadyOpen: boolean): void {
    this.ws = ws;
    ws.onopen = () => this.markOpen();
    ws.onmessage = (ev) => {
      try {
        this.onMessage(JSON.parse(ev.data) as ServerMsg);
      } catch {
        this.onMessage({ type: "error", message: "Malformed server message" });
      }
    };
    ws.onerror = () => this.onDrop(ws);
    ws.onclose = () => this.onDrop(ws);
    if (alreadyOpen) this.markOpen();
  }

  private markOpen(): void {
    if (this.closed || this.open) return;
    this.open = true;
    this.attempts = 0;
    this.onStatus("online");
    const pending = this.outbox;
    this.outbox = [];
    pending.forEach((m) => this.raw(m));
  }

  private onDrop(ws: WebSocket): void {
    if (this.closed || ws !== this.ws) return; // ignore stale handlers
    this.open = false;
    ws.onopen = ws.onmessage = ws.onerror = ws.onclose = null;
    this.ws = null;
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.closed || this.timer) return;
    this.attempts += 1;
    if (!canReconnect(this.attempts)) {
      this.onStatus("lost");
      return;
    }
    this.onStatus("reconnecting");
    this.timer = setTimeout(() => {
      this.timer = null;
      this.reopen();
    }, reconnectDelay(this.attempts));
  }

  private reopen(): void {
    if (this.closed) return;
    try {
      this.adopt(new WebSocket(this.url), false);
    } catch {
      this.scheduleReconnect();
    }
  }

  private raw(msg: ClientMsg): void {
    try {
      this.ws?.send(JSON.stringify(msg));
    } catch {
      /* dropped mid-flight; the reconnect path will recover or give up */
    }
  }

  send(msg: ClientMsg): void {
    if (this.open && this.ws) this.raw(msg);
    else this.outbox.push(msg);
  }

  close(): void {
    this.closed = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.ws) {
      this.ws.onopen = this.ws.onmessage = this.ws.onerror = this.ws.onclose = null;
      try { this.ws.close(); } catch { /* ignore */ }
      this.ws = null;
    }
  }
}
