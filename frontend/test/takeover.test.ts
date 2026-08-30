// takeover.test.ts — что делает клиент, когда партию забрали в другом окне.
//
// ЧТО СЛОМАЛОСЬ БЫ БЕЗ ЭТОГО. Сервер теперь вытесняет прежнего владельца
// партии: второй сокет с тем же `resume` забирает её себе, а первый получает
// `session.closed {reason:"taken_over"}` и закрытие кодом 4409.
//
// Клиент до этого умел различать ровно одно — «оборвалось» — и на любое
// закрытие шёл переподключаться с `resume`. На вытеснении это буквально война
// двух вкладок: каждая возвращается и вытесняет другую, обе получают отказ, и
// человек не видит ни одного слова о происходящем.
//
// Поэтому здесь проверяются две вещи и обе про честность:
//   1. по коду 4409 клиент НЕ возвращается и говорит «связи нет»;
//   2. причина доезжает до стола словами, а не остаётся кодом в логе.
// И третья, контрольная: обычный обрыв (1006) по-прежнему переподключается —
// ради него `resume` и написан.
import test from "node:test";
import assert from "node:assert/strict";

import { I18N } from "../src/i18n";
import type { ServerMsg } from "../src/types";

// --- минимальный браузер ----------------------------------------------------
// Ровно тот кусок, который трогает realtime-клиент: сокет, адрес страницы и
// таймеры. Не jsdom: подделка должна быть видна глазом.

type Handler = ((e: unknown) => void) | null;

class FakeSocket {
  static readonly OPEN = 1;
  static instances: FakeSocket[] = [];

  readyState = 0;
  sent: string[] = [];
  onopen: Handler = null;
  onclose: Handler = null;
  onerror: Handler = null;
  onmessage: Handler = null;

  constructor(readonly url: string) {
    FakeSocket.instances.push(this);
    // Открываемся на следующем тике: настоящий сокет тоже не открыт в момент
    // возврата конструктора, и синхронное `onopen` спрятало бы гонку.
    queueMicrotask(() => {
      this.readyState = FakeSocket.OPEN;
      this.onopen?.({});
    });
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = 3;
  }

  /** Прислать событие с сервера. */
  deliver(event: Record<string, unknown>): void {
    this.onmessage?.({ data: JSON.stringify(event) });
  }

  /** Закрыться так, как закрывается настоящий сокет: с кодом. */
  shut(code: number): void {
    this.readyState = 3;
    this.onclose?.({ code });
  }
}

const g = globalThis as Record<string, unknown>;
g.WebSocket = FakeSocket;
g.location = { protocol: "http:", host: "localhost:5173" };

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Довести клиента до `session.created` на свежем сокете. */
async function handshake(deliverCreated = true): Promise<FakeSocket> {
  // ЖДЁМ ПЕРЕД ТЕМ, КАК БРАТЬ СОКЕТ. Адрес разрешается асинхронно (на
  // разнесённом развёртывании в него входит билет, api/backend.ts), поэтому
  // `new WebSocket` случается на такт позже вызова `start()`, а не внутри него.
  // Взятый раньше — это `undefined`, то есть падение подделки, а не находка.
  await wait(0);
  const socket = FakeSocket.instances[FakeSocket.instances.length - 1];
  socket.deliver({ type: "session.queue_done" });
  if (deliverCreated) {
    socket.deliver({
      type: "session.created", session_id: "sess_первая",
      scenario: { id: "supplier" }, state: {}, greeting: "Здравствуйте.",
      capabilities: {},
    });
  }
  await wait(0);
  return socket;
}

// ---------------------------------------------------------------------------
// 1. Код закрытия решает, возвращаться ли
// ---------------------------------------------------------------------------

test("вытеснение (4409) не заставляет клиента возвращаться поверх нового окна", async () => {
  const { RealtimeSession } = await import("../src/realtime/vendor/realtime-session");
  FakeSocket.instances = [];
  const statuses: string[] = [];

  const session = new RealtimeSession({
    mode: "text",
    onEvent: () => {},
    onStatus: (s) => statuses.push(s),
  });
  const started = session.start({ scenarioId: "supplier", lang: "ru" });
  const socket = await handshake();
  await started;

  assert.equal(FakeSocket.instances.length, 1);
  socket.shut(4409);

  // Ждём заведомо дольше первой паузы переподключения (400 мс из lib/net.ts).
  await wait(700);
  assert.equal(FakeSocket.instances.length, 1, "клиент полез обратно в занятую партию");
  assert.equal(statuses[statuses.length - 1], "lost");
  assert.ok(!statuses.includes("reconnecting"), "обещал переподключение, которого не будет");
});

test("обычный обрыв по-прежнему возвращается в ту же партию", async () => {
  const { RealtimeSession } = await import("../src/realtime/vendor/realtime-session");
  FakeSocket.instances = [];
  const statuses: string[] = [];

  const session = new RealtimeSession({
    mode: "text",
    onEvent: () => {},
    onStatus: (s) => statuses.push(s),
  });
  const started = session.start({ scenarioId: "supplier", lang: "ru" });
  const socket = await handshake();
  await started;

  socket.shut(1006);                        // метро, а не отказ сервера
  assert.equal(statuses[statuses.length - 1], "reconnecting");

  await wait(700);
  assert.equal(FakeSocket.instances.length, 2, "не вернулись после обрыва");
  // И вернулись именно В ТУ ЖЕ партию, а не начали новую.
  const second = FakeSocket.instances[1];
  await wait(0);
  second.deliver({ type: "session.queue_done" });
  const init = JSON.parse(second.sent[0]) as { payload: { resume?: string } };
  assert.equal(init.payload.resume, "sess_первая");
});

test("отказ по пределу на адрес (4429) тоже не переспрашивают", async () => {
  const { RealtimeSession } = await import("../src/realtime/vendor/realtime-session");
  FakeSocket.instances = [];
  const statuses: string[] = [];

  const session = new RealtimeSession({
    mode: "text", onEvent: () => {}, onStatus: (s) => statuses.push(s),
  });
  const started = session.start({ scenarioId: "supplier", lang: "ru" });
  const socket = await handshake();
  await started;

  socket.shut(4429);
  await wait(700);
  assert.equal(FakeSocket.instances.length, 1);
  assert.equal(statuses[statuses.length - 1], "lost");
});

// ---------------------------------------------------------------------------
// 2. Причина доезжает до стола словами
// ---------------------------------------------------------------------------

test("«партию продолжили в другом окне» приезжает строкой на языке партии", async () => {
  const { RealtimeTransport } = await import("../src/realtime/transport");
  for (const lang of ["ru", "en"] as const) {
    FakeSocket.instances = [];
    const seen: ServerMsg[] = [];
    const transport = new RealtimeTransport((m) => seen.push(m), () => {});
    transport.send({ type: "start", scenarioId: "supplier", lang, mode: "practice" });

    const socket = await handshake();
    await wait(0);
    socket.deliver({ type: "session.closed", session_id: "sess_первая", reason: "taken_over" });

    const notice = seen.find((m) => m.type === "notice");
    assert.ok(notice, `${lang}: вытеснение прошло молча`);
    assert.equal((notice as { text: string }).text, I18N[lang].conn.takenOver);
    transport.close();
  }
});

test("собственное «я закончил» ничего человеку не объявляет", async () => {
  // `session.close` приезжает обратно как `session.closed {reason:"user_stop"}`.
  // Рассказывать человеку о том, что он сам только что нажал, — шум, а не
  // честность.
  const { RealtimeTransport } = await import("../src/realtime/transport");
  FakeSocket.instances = [];
  const seen: ServerMsg[] = [];
  const transport = new RealtimeTransport((m) => seen.push(m), () => {});
  transport.send({ type: "start", scenarioId: "supplier", lang: "ru", mode: "practice" });

  const socket = await handshake();
  await wait(0);
  socket.deliver({ type: "session.closed", session_id: "sess_первая", reason: "user_stop" });

  assert.equal(seen.filter((m) => m.type === "notice").length, 0);
  transport.close();
});

test("строка про вытеснение есть на обоих языках и они разные", () => {
  assert.ok(I18N.ru.conn.takenOver.trim().length > 20);
  assert.ok(I18N.en.conn.takenOver.trim().length > 20);
  assert.notEqual(I18N.ru.conn.takenOver, I18N.en.conn.takenOver);
});
