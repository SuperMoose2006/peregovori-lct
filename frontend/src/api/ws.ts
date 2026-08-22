// ws.ts — выбор транспорта: realtime-сессия или офлайн-ядро.
//
// ЧТО ЗДЕСЬ БЫЛО И ЧЕГО БОЛЬШЕ НЕТ. Раньше файл содержал три транспорта:
// `WsTransport`, `LiveWsTransport` (с переподключением) и заглушку
// `RestTransport`. Все три говорили в старую ручку `/ws` протоколом
// «запрос-ответ». Она заменена на `/v1/realtime`, а переподключение переехало
// в `realtime/vendor/realtime-session.ts` — туда, где живёт жизненный цикл
// сессии. Оставлять здесь мёртвые классы значило бы врать о том, какие
// транспорты у продукта есть.
//
// Осталось ровно две реализации, и обе настоящие:
//   RealtimeTransport — сервер есть: полный дуплекс, голос, лицо, зрение;
//   MockServer        — сервера нет: детерминированная игра целиком в браузере.
//
// Второй вариант — не деградация и не заглушка. Это офлайн-ядро продукта:
// движок, шкалы, реакции, разбор и грейд считаются одинаково.

import type { ClientMsg } from "../types";
import type { ConnStatus, ServerMsgHandler, Transport, TransportKind } from "../api/transport";
import { MockServer } from "../mock/mockServer";
import { RealtimeTransport, type RealtimeTransportOptions } from "../realtime/transport";

/** Сколько ждём ответа от сервера, прежде чем уйти в офлайн-ядро. */
const OPEN_TIMEOUT_MS = 1500;

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
  options?: RealtimeTransportOptions,
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

  // Публичный прокси: копит отправки, пока транспорт не выбран.
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

  const adopt = (transport: Transport, kind: TransportKind) => {
    if (decided) return;
    decided = true;
    inner = transport;
    onKind(kind);
    if (kind === "mock") status("online");
    early.forEach((m) => transport.send(m));
    early.length = 0;
  };

  // Проба сервера REST-ом, а не сокетом: дешевле, и — главное — не занимает
  // realtime-сессию впустую. Сокет realtime-транспорта открывается один раз,
  // сразу под партию, а не «на разведку и заново».
  const probe = new AbortController();
  const timer = setTimeout(() => probe.abort(), OPEN_TIMEOUT_MS);

  fetch("/api/health", { signal: probe.signal })
    .then((r) => {
      clearTimeout(timer);
      if (!r.ok) throw new Error("health failed");
      adopt(new RealtimeTransport(onMessage, status, options ?? {}), "ws");
    })
    .catch(() => {
      clearTimeout(timer);
      // Офлайн-ядро: без сервера продукт остаётся играбельным целиком.
      if (!mockDisabled()) adopt(new MockServer(onMessage), "mock");
      else status("lost");
    });

  return proxy;
}

