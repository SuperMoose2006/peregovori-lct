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
//
// ОБА ПРИЕЗЖАЮТ ОТДЕЛЬНЫМИ ФАЙЛАМИ. Выбор между ними и так асинхронный: сперва
// проба сервера, и только потом становится известно, чей это ход. Пока оба
// импорта были статическими, домашний экран платил за ОБА — и за realtime с
// его вендорным кодом, и за офлайн-ядро, — хотя до первой партии не нужен ни
// один. Теперь нужный файл едет ровно тогда, когда выбор уже сделан.
//
// ИНВАРИАНТ 5 ЭТИМ НЕ ЗАДЕТ, И ВОТ ПОЧЕМУ. «Сети нет» здесь значит «наш
// бэкенд не ответил», а статику отдаёт ТОТ ЖЕ адрес, что и страницу: раз
// страница открылась, файл офлайн-ядра доедет с того же места. Настоящий
// офлайн (самолёт, метро) обслуживает service worker, а в его кеш куски
// кладёт прогрев на простое сразу после первой отрисовки (App.tsx: warmScreens).
// Не доехало и это — падаем в `status("lost")` с честной панелью, а не в
// молчаливый спиннер.

import { apiFetch } from "./backend";
import type { ClientMsg } from "../types";
import type { ConnStatus, ServerMsgHandler, Transport, TransportKind } from "../api/transport";
import type { RealtimeTransportOptions } from "../realtime/transport";

/** Сколько ждём ответа от сервера, прежде чем уйти в офлайн-ядро. */
const OPEN_TIMEOUT_MS = 1500;

/** Сколько ждём файл транспорта. Зависший запрос — не «ещё грузится», а тот же
 *  отказ, только молчаливый: без этого срока стол остался бы с надписью
 *  «соединяемся» навсегда, потому что решение о транспорте так и не приняли. */
const CHUNK_TIMEOUT_MS = 10000;

function withDeadline<T>(load: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("transport chunk timed out")), CHUNK_TIMEOUT_MS);
    load.then(
      (mod) => { clearTimeout(timer); resolve(mod); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
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
  options?: RealtimeTransportOptions,
): Transport {
  const status = onStatus ?? (() => {});

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
    // Прокси обязан пробрасывать всё, что появилось на выбранном транспорте:
    // иначе полоска уровня и кнопка перебивания молча ничего не делают.
    micLevel: () => inner?.micLevel?.() ?? 0,
    interrupt: () => inner?.interrupt?.(),
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

  // Офлайн-ядро: без сервера продукт остаётся играбельным целиком.
  const goMock = () => {
    if (decided) return;
    if (mockDisabled()) { status("lost"); return; }
    withDeadline(import("../mock/mockServer"))
      .then((m) => { if (!decided) adopt(new m.MockServer(onMessage), "mock"); })
      // Не доехало и офлайн-ядро — играть не на чем, и сказать об этом надо
      // словами: «lost» рисует панель с переподключением, а не пустой стол.
      .catch(() => status("lost"));
  };

  if (mockForced()) {
    goMock();
    return proxy;
  }

  // Проба сервера REST-ом, а не сокетом: дешевле, и — главное — не занимает
  // realtime-сессию впустую. Сокет realtime-транспорта открывается один раз,
  // сразу под партию, а не «на разведку и заново».
  const probe = new AbortController();
  const timer = setTimeout(() => probe.abort(), OPEN_TIMEOUT_MS);

  // Адрес — через `api/backend.ts`: на разнесённом развёртывании это уже не
  // «тот же origin», а вписанный на сборке. Промах пробы значит ровно то же,
  // что и раньше: сервера нет — играем офлайн-ядром.
  apiFetch("/api/health", { signal: probe.signal })
    .then((r) => {
      clearTimeout(timer);
      if (!r.ok) throw new Error("health failed");
      return withDeadline(import("../realtime/transport"));
    })
    .then((m) => {
      // Проверка ПЕРЕД конструктором, а не внутри adopt: конструктор открывает
      // сокет, и созданный после закрытия сессии транспорт остался бы висеть
      // открытым, никому не принадлежа.
      if (decided) return;
      adopt(new m.RealtimeTransport(onMessage, status, options ?? {}), "ws");
    })
    .catch(() => {
      clearTimeout(timer);
      goMock();
    });

  return proxy;
}

