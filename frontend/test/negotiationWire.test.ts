// negotiationWire.test.ts — стол глазами провода: события `/v1/realtime` в
// порядке сервера → настоящий `RealtimeTransport` → настоящий `reduce`.
//
// ЧТО ЗДЕСЬ ДЕРЖИТСЯ. `negotiation.test.ts` проверяет reducer на готовых
// `ServerMsg`. Но игрок видит не их, а то, во что транспорт переводит провод:
// `engine.state` копится до `response.done`, `judge.*` становится фазой, `error`
// до и после `session.created` значит разное. Ошибка перевода не видна ни
// тестам reducer'а, ни тестам сервера — она живёт ровно между ними.
//
// Порядок событий хода взят из `services/gateway/app/orchestrator/negotiation.py`
// (`on_player_turn`, шаги 1–6): разбор → судья → движок → слово судьи →
// реплика → вопрос по лицу → разбор партии.
import test from "node:test";
import assert from "node:assert/strict";

import { reduce, type ChatEntry, type NegotiationState } from "../src/api/useNegotiation";
import type { Lang } from "../src/types";

// --- минимальный браузер (тот же, что в takeover.test.ts) --------------------

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
    queueMicrotask(() => {
      this.readyState = FakeSocket.OPEN;
      this.onopen?.({});
    });
  }

  send(data: string): void { this.sent.push(data); }
  close(): void { this.readyState = 3; }
  deliver(event: Record<string, unknown>): void {
    this.onmessage?.({ data: JSON.stringify(event) });
  }
  shut(code: number): void {
    this.readyState = 3;
    this.onclose?.({ code });
  }
  /** Типы отправленных клиентом событий — по порядку. */
  types(): string[] { return this.sent.map((s) => (JSON.parse(s) as { type: string }).type); }
}

const g = globalThis as Record<string, unknown>;
g.WebSocket = FakeSocket;
g.location = { protocol: "http:", host: "localhost:5173" };

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// --- стол ----------------------------------------------------------------------

const EMPTY: NegotiationState = {
  kind: null, scenario: null, state: null, log: [], debrief: null, busy: false,
  phase: null, error: null, layerFail: {}, conn: "online", judgeActive: false,
  avatarState: null, oppSpeaking: false, oppAudio: false, userSpeaking: false,
  transcript: null, observations: [], tells: 0, tellFrames: 0, tellNow: false,
  framesSent: 0, capabilities: null,
};

const STATE0 = {
  trust: 50, tension: 20, info: 10, leverage: 30, offer_opp: 100, offer_player: null,
  interests_found: 0, interests_total: 3, turn: 0, max_turns: 12, status: "active",
};
const STATE1 = { ...STATE0, trust: 55, info: 20, offer_opp: 96, turn: 1 };

const DRAFT = {
  tags: [{ key: "objective_criteria", label: "объективный критерий" }],
  primary: "objective_criteria", arg_quality: 84, spin: null,
  flags: { hostile: false, threat: false, question: false },
};

// Предикат из `turn()` в useNegotiation.ts, дословно (хук в node не
// поднимается: выбор транспорта читает `import.meta.env`).
const canMove = (s: NegotiationState) =>
  s.conn === "online" && !s.busy && !!s.state && s.state.status === "active";

interface Table {
  get: () => NegotiationState;
  socket: FakeSocket;
  close: () => void;
  /** Напечатанный ход — так же, как его делает `turn()` хука. */
  move: (text: string) => void;
}

/**
 * Поднять стол до `session.created`. Колбэк связи повторяет хук: обрыв снимает
 * `busy`, чтобы баннер переподключения, а не вечный индикатор, говорил за стол.
 */
async function table(opts: { lang?: Lang; layers?: Record<string, boolean>; created?: boolean } = {}): Promise<Table> {
  const { RealtimeTransport } = await import("../src/realtime/transport");
  FakeSocket.instances = [];
  let id = 0;
  let state: NegotiationState = { ...EMPTY };
  const transport = new RealtimeTransport(
    (m) => { state = reduce(state, m, () => ++id); },
    (conn) => { state = { ...state, conn, busy: conn === "online" ? state.busy : false }; },
  );
  transport.send({ type: "start", scenarioId: "supplier", lang: opts.lang ?? "ru", mode: "practice",
                   layers: opts.layers as never });
  await wait(0);
  const socket = FakeSocket.instances[FakeSocket.instances.length - 1];
  socket.deliver({ type: "session.queue_done" });
  if (opts.created !== false) {
    socket.deliver({ type: "session.created", session_id: "s-wire", resumed: false,
      scenario: { id: "supplier" }, state: STATE0, greeting: "Здравствуйте.",
      capabilities: { judge: true } });
    await wait(0);
  }
  return {
    get: () => state,
    socket,
    close: () => transport.close(),
    move: (text) => {
      assert.ok(canMove(state), `ход «${text}» не принят бы хуком: стол занят или закрыт`);
      state = { ...state, busy: true, phase: null, log: [...state.log, { id: ++id, kind: "me", text }] };
      transport.send({ type: "turn", text });
    },
  };
}

/** Серверная половина хода до реплики: разбор, судья, движок, слово судьи. */
function settle(socket: FakeSocket, state: object = STATE1, closed = false) {
  socket.deliver({ type: "turn.analysis", turn_id: 1, text: "реплика", analysis: DRAFT });
  socket.deliver({ type: "judge.started", turn_id: 1 });
  socket.deliver({ type: "judge.completed", turn_id: 1, semantic: true });
  socket.deliver({ type: "engine.state", turn_id: 1, state,
    deltas: { trust: 5, tension: 0, info: 10, leverage: 0 },
    arg_quality: 41, judged: true, reaction: "persuaded", closed });
  socket.deliver({ type: "turn.coach", turn_id: 1, text: "Сильный критерий.",
    techniques: ["объективный критерий"], reject: false });
}

const lastOpp = (s: NegotiationState) =>
  [...s.log].reverse().find((e) => e.kind === "opp") as (ChatEntry & { kind: "opp" }) | undefined;

// ---------------------------------------------------------------------------
// 1. Ход целиком, в порядке провода
// ---------------------------------------------------------------------------

test("session.created открывает стол: приветствие, шкалы, бейдж судьи, ход разрешён", async () => {
  const t = await table();
  try {
    const s = t.get();
    assert.deepEqual(s.log.map((e) => [e.kind, (e as { text: string }).text]), [["opp", "Здравствуйте."]]);
    assert.deepEqual(s.state, STATE0);
    assert.equal(s.judgeActive, true, "capabilities.judge не дошёл до бейджа");
    assert.ok(canMove(s));
  } finally { t.close(); }
});

test("ход в порядке провода: стол занят до response.done и отпускается ровно на нём", async () => {
  const t = await table();
  try {
    t.move("По рыночным данным цена 86.");
    // Отправилось ровно то, что сервер ждёт от клавиатуры.
    assert.deepEqual(t.socket.types().slice(-2), ["input.append", "input.commit"]);

    t.socket.deliver({ type: "turn.analysis", turn_id: 1, text: "реплика", analysis: DRAFT });
    assert.equal(t.get().busy, true);

    t.socket.deliver({ type: "judge.started", turn_id: 1 });
    assert.equal(t.get().phase, "judging", "ожидание судьи названо не своим именем");
    t.socket.deliver({ type: "judge.completed", turn_id: 1, semantic: true });
    assert.equal(t.get().phase, "replying");

    t.socket.deliver({ type: "engine.state", turn_id: 1, state: STATE1,
      deltas: { trust: 5, tension: 0, info: 10, leverage: 0 },
      arg_quality: 41, judged: true, reaction: "persuaded", closed: false });
    t.socket.deliver({ type: "turn.coach", turn_id: 1, text: "Сильный критерий.",
      techniques: ["объективный критерий"], reject: false });
    // Движок досчитал, но оппонент ещё не ответил: второй ход сейчас был бы
    // ходом поверх непрозвучавшей реплики.
    assert.equal(t.get().busy, true, "стол отпущен до реплики оппонента");
    assert.ok(!t.get().log.some((e) => e.kind === "coach"), "слово судьи обогнало реплику оппонента");

    t.socket.deliver({ type: "response.output.delta", kind: "text", generation_id: "g1", turn_id: 1, text: "Хорошо, " });
    assert.equal(lastOpp(t.get())?.streaming, true);
    assert.equal(t.get().busy, true, "первая дельта — не конец хода");

    t.socket.deliver({ type: "response.done", generation_id: "g1", turn_id: 1, text: "Хорошо, давайте посчитаем." });
    const s = t.get();
    assert.equal(s.busy, false);
    assert.equal(s.phase, null);
    assert.deepEqual(s.state, STATE1, "шкалы не взяли состояние движка");
    assert.deepEqual(s.log.map((e) => e.kind), ["opp", "me", "opp", "coach"]);
    assert.equal(lastOpp(s)?.text, "Хорошо, давайте посчитаем.");
    assert.ok(!lastOpp(s)?.streaming);
    const mine = s.log[1] as ChatEntry & { kind: "me" };
    assert.deepEqual(mine.deltas, { trust: 5, tension: 0, info: 10, leverage: 0 });
    assert.equal(mine.analysis?.arg_quality, 41, "на экране черновое число, а не движковое");
    const coach = s.log[3] as ChatEntry & { kind: "coach" };
    assert.deepEqual(coach.techniques, ["объективный критерий"]);
    assert.ok(canMove(s));
  } finally { t.close(); }
});

test("санитайзер отверг реплику: на экране итог, а не то, что успело напечататься", async () => {
  const t = await table();
  try {
    t.move("реплика");
    settle(t.socket);
    t.socket.deliver({ type: "response.output.delta", kind: "text", generation_id: "g1", text: "Как языковая модель, " });
    t.socket.deliver({ type: "response.output.delta", kind: "text", generation_id: "g1", text: "я не могу." });
    t.socket.deliver({ type: "response.done", generation_id: "g1", text: "Давайте вернёмся к цене." });
    const opps = t.get().log.filter((e) => e.kind === "opp");
    assert.equal(opps.length, 2, "приветствие + ОДИН пузырь хода");
    assert.equal(lastOpp(t.get())?.text, "Давайте вернёмся к цене.");
    assert.ok(!JSON.stringify(t.get().log).includes("языковая модель"));
  } finally { t.close(); }
});

test("вопрос по лицу встаёт под реплику, а разбор партии закрывает стол", async () => {
  const t = await table({ layers: { probe: true } });
  try {
    t.move("Договорились на 86.");
    settle(t.socket, { ...STATE1, status: "agreement" }, true);
    t.socket.deliver({ type: "response.done", generation_id: "g1", text: "По рукам." });
    t.socket.deliver({ type: "probe", turn: 1, options: ["warmed", "opened_up", "persuaded", "collaborated"], answer: 2 });
    t.socket.deliver({ type: "debrief", debrief: { grade: "B", overall: 71 } });
    const s = t.get();
    assert.deepEqual(s.log.map((e) => e.kind), ["opp", "me", "opp", "coach", "probe"]);
    assert.deepEqual(s.debrief, { grade: "B", overall: 71 });
    assert.equal(s.busy, false);
    assert.equal(canMove(s), false, "закрытый стол принимает ход");
  } finally { t.close(); }
});

// ---------------------------------------------------------------------------
// 2. Ошибка до и после начала партии — это разные вещи
// ---------------------------------------------------------------------------

test("ошибка до session.created — провал запуска: связь «lost», текст в state.error", async () => {
  // Экран «своей сделки» и панель «связи нет» читают именно `state.error`.
  const t = await table({ created: false });
  try {
    t.socket.deliver({ type: "error", error: { code: "bad_scenario", message: "unknown scenario" } });
    await wait(0);
    const s = t.get();
    assert.equal(s.error, "unknown scenario");
    assert.equal(s.conn, "lost");
    assert.equal(s.log.length, 0);
  } finally { t.close(); }
});

test("сокет закрылся до session.created — запуск честно проваливается, а не висит", {
  todo: "realtime/vendor/realtime-session.ts:234-239/250-277: после `onopen` обрыв до " +
        "`session.created` никого не будит — `open()` уже разрешён, а `handshake()` не слушает " +
        "onclose и не имеет срока. `start()` не завершается никогда: ни ошибки, ни «lost», экран " +
        "«соединяемся» (App.tsx:1178) без кнопки выхода. Тест на это снят слиянием b682bb4",
}, async () => {
  // Настоящие причины: перезапуск гейтвея на выкладке, прокси, обрыв сети на
  // телефоне между открытием сокета и ответом на `session.init`.
  const t = await table({ created: false, lang: "en" });
  try {
    t.socket.shut(1006);
    await wait(1500);
    const s = t.get();
    assert.ok(s.error !== null || s.conn === "lost" || s.conn === "reconnecting",
      `запуск завис молча: conn=${s.conn}, error=${s.error}`);
  } finally { t.close(); }
});

test("ошибка за столом — строка в ленте, а не ошибка запуска", async () => {
  // `state.error` рисуется только на экране подготовки. Уйди туда отказ хода —
  // за столом не появилось бы ни слова, а индикатор крутился бы вечно.
  const t = await table();
  try {
    t.move("реплика");
    t.socket.deliver({ type: "error", error: { code: "turn_failed", message: "turn failed" } });
    const s = t.get();
    assert.equal(s.error, null, "отказ хода выдан за провал запуска");
    assert.equal(s.busy, false, "ход не состоялся, а стол всё ещё «ждёт оппонента»");
    const sys = s.log[s.log.length - 1];
    assert.deepEqual([sys.kind, (sys as { text: string }).text], ["sys", "turn failed"]);
    assert.ok(canMove(s), "после отказа хода стол обязан принять следующий");
  } finally { t.close(); }
});

// ---------------------------------------------------------------------------
// 3. Перебивание
// ---------------------------------------------------------------------------

test("перебивание после response.done гасит только звук: ход уже посчитан", async () => {
  // Текст дописан, а звук ещё играет секундами (CLAUDE.md, правило 3).
  // Кнопка «перебить» в этот момент не имеет права трогать ленту и шкалы.
  const t = await table();
  try {
    t.move("реплика");
    settle(t.socket);
    t.socket.deliver({ type: "response.output.delta", kind: "text", generation_id: "g1", text: "Хорошо." });
    t.socket.deliver({ type: "response.done", generation_id: "g1", text: "Хорошо." });
    const before = t.get();
    t.socket.deliver({ type: "generation.cancelled", generation_id: "g1", reason: "client_cancel" });
    const after = t.get();
    assert.deepEqual(after.log, before.log);
    assert.deepEqual(after.state, STATE1);
    assert.equal(after.busy, false);
    assert.ok(canMove(after));
  } finally { t.close(); }
});

test("реплику перебили на полуслове: посчитанный ход остаётся, следующий ход разрешён", {
  todo: "realtime/transport.ts:427-433 на `generation.cancelled` глушит только звук: накопленный " +
        "engine.state не сливается, `busy` не снимается, пузырь остаётся «печатающимся». Сервер " +
        "(test_probe.py::test_cancelled_reply_does_not_consume_the_question) ход применил и " +
        "response.done уже не пришлёт — стол висит до переподключения",
}, async () => {
  // Серверный контракт: `interrupt()` гасит поток модели, но ход движка уже
  // применён (`engine.turn` сдвинут, `engine.state` ушёл) — отменять его
  // некому и незачем. `response.done` для погашенного поколения не приходит,
  // вопроса по лицу тоже. Клиент обязан сам довести ход до конца: иначе
  // кнопка «перебить», нажатая пока текст ещё печатается, запирает стол.
  const t = await table();
  try {
    t.move("реплика");
    settle(t.socket);
    t.socket.deliver({ type: "response.output.delta", kind: "text", generation_id: "g1", text: "Хорошо, " });
    t.socket.deliver({ type: "generation.cancelled", generation_id: "g1", reason: "client_cancel" });
    const s = t.get();
    assert.equal(s.state?.turn, 1, "посчитанный движком ход пропал со шкал");
    assert.equal(s.busy, false, "стол остался занят: ответа, которого ждёт индикатор, не будет");
    assert.equal(s.phase, null);
    assert.equal(lastOpp(s)?.text, "Хорошо, ", "услышанный кусок реплики обязан остаться в ленте");
    assert.ok(!lastOpp(s)?.streaming, "оборванный пузырь навсегда «печатается»");
    assert.ok(canMove(s), "следующий ход не принимается");
  } finally { t.close(); }
});

// ---------------------------------------------------------------------------
// 4. Обрыв и возвращение в ту же партию
// ---------------------------------------------------------------------------

test("после обрыва стол возвращается с лентой, шкалами сервера и словом на языке партии", async () => {
  const t = await table({ lang: "en" });
  try {
    t.move("My offer is 86.");
    settle(t.socket);
    t.socket.deliver({ type: "response.output.delta", kind: "text", generation_id: "g1", text: "Well, " });
    t.socket.shut(1006);                               // метро, а не отказ сервера
    assert.equal(t.get().conn, "reconnecting");
    assert.equal(t.get().busy, false, "обрыв оставил вечный индикатор «печатает»");

    await wait(700);                                   // первая пауза — 400 мс (lib/net.ts)
    const second = FakeSocket.instances[FakeSocket.instances.length - 1];
    assert.notEqual(second, t.socket, "не вернулись после обрыва");
    second.deliver({ type: "session.queue_done" });
    await wait(0);
    second.deliver({ type: "session.created", session_id: "s-wire", resumed: true,
      scenario: { id: "supplier" }, state: STATE1, greeting: "Hello.", capabilities: { judge: true } });
    await wait(0);

    const s = t.get();
    assert.equal(s.conn, "online");
    assert.deepEqual(s.state, STATE1, "шкалы после обрыва не взяли состояние сервера");
    const kinds = s.log.map((e) => e.kind);
    assert.deepEqual(kinds, ["opp", "me", "opp", "sys"], "лента не пережила обрыв или поздоровалась заново");
    assert.ok(!lastOpp(s)?.streaming, "оборванный пузырь всё ещё «печатается»");
    const notice = (s.log[3] as { text: string }).text;
    assert.ok(notice.length > 20 && !/[а-яё]/i.test(notice),
      `английской партии объяснили обрыв не по-английски: «${notice}»`);
    assert.ok(canMove(s));
  } finally { t.close(); }
});

test("закрытый стол не отправляет поздний ход в сокет", async () => {
  // Хук закрывает транспорт при выходе из партии. Поздний ход, доехавший до
  // сервера, сыграл бы в партии, которую человек уже покинул.
  const { RealtimeTransport } = await import("../src/realtime/transport");
  FakeSocket.instances = [];
  const transport = new RealtimeTransport(() => {}, () => {});
  transport.send({ type: "start", scenarioId: "supplier", lang: "ru", mode: "practice" });
  await wait(0);
  const socket = FakeSocket.instances[0];
  socket.deliver({ type: "session.queue_done" });
  socket.deliver({ type: "session.created", session_id: "s", scenario: {}, state: STATE0, greeting: "", capabilities: {} });
  await wait(0);
  transport.close();
  const sent = socket.sent.length;
  transport.send({ type: "turn", text: "поздний ход" });
  transport.send({ type: "hint" });
  assert.equal(socket.sent.length, sent);
  assert.ok(!socket.types().includes("input.append"));
});

// ---------------------------------------------------------------------------
// 5. Инвариант 4: всё, что транспорт говорит человеку, — на языке партии
// ---------------------------------------------------------------------------

test("причина невставшего слоя в английской партии написана по-английски", {
  todo: "realtime/transport.ts:252-253 шлёт `layer_failed` с причиной «нужен https или localhost» " +
        "на любом языке партии — английский игрок видит русскую строку (инвариант 4); " +
        "готовая пара строк уже есть в lib/layers.ts::detectLayers",
}, async () => {
  const { AudioPlayer } = await import("../src/realtime/vendor/audio-player");
  const init = AudioPlayer.prototype.init;
  AudioPlayer.prototype.init = () => {};             // в node нет AudioContext
  // Node не даёт `navigator.mediaDevices` — ровно как страница по http.
  const t = await table({ lang: "en", layers: { voice: true, camera: true } });
  try {
    await wait(0);
    const reasons = Object.entries(t.get().layerFail);
    assert.deepEqual(reasons.map(([k]) => k).sort(), ["camera", "voice"], "невставший слой не назван вовсе");
    for (const [layer, reason] of reasons) {
      assert.ok(!/[а-яё]/i.test(String(reason)), `${layer}: «${reason}» в английской партии`);
    }
  } finally {
    t.close();
    AudioPlayer.prototype.init = init;
  }
});
