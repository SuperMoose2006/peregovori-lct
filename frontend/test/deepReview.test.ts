// deepReview.test.ts — «Глубокий разбор» на клиенте: провод, состояние, подписи.
//
// Что держит набор:
//   - кнопка шлёт `review.request`, прогресс и отчёт доезжают до состояния;
//   - отказ сервера (`review_*`) ложится на кнопку, а «уже идёт» — не сбой;
//   - обрыв посреди разбора не оставляет вечный прогресс;
//   - офлайн-ядро честно отказывает, а не рисует пустой отчёт;
//   - у каждого кода, который может прислать сервер, есть подпись на обоих
//     языках, а словарь мимики совпадает с серверным `vision.py::CUES`.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { reduce, REVIEW_IDLE, type NegotiationState } from "../src/api/useNegotiation";
import { I18N } from "../src/i18n";
import {
  channelText, confLevel, evidenceLabel, evidenceWhen, reviewAvailability, softValue,
} from "../src/lib/review";
import { visionTape } from "../src/components/Debrief";
import type { DeepReview, ServerMsg } from "../src/types";

// --- минимальный браузер ------------------------------------------------------

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
    queueMicrotask(() => { this.readyState = FakeSocket.OPEN; this.onopen?.({}); });
  }
  send(data: string): void { this.sent.push(data); }
  close(): void { this.readyState = 3; }
  deliver(event: Record<string, unknown>): void { this.onmessage?.({ data: JSON.stringify(event) }); }
  types(): string[] { return this.sent.map((s) => (JSON.parse(s) as { type: string }).type); }
}

const g = globalThis as Record<string, unknown>;
g.WebSocket = FakeSocket;
g.location = { protocol: "http:", host: "localhost:5173" };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const STATE0 = {
  trust: 50, tension: 20, info: 10, leverage: 30, offer_opp: 100, offer_player: null,
  interests_found: 0, interests_total: 3, turn: 0, max_turns: 12, status: "breakdown",
};

const EMPTY = {
  kind: null, scenario: null, state: null, log: [], debrief: null, busy: false, phase: null,
  error: null, layerFail: {}, conn: "online", judgeActive: false, avatarState: null,
  oppSpeaking: false, oppAudio: false, userSpeaking: false, transcript: null, observations: [],
  tells: 0, tellFrames: 0, tellNow: false, capabilities: null, devices: { mic: "off", camera: "off" },
  switching: false, review: REVIEW_IDLE,
} as NegotiationState;

const REPORT = {
  version: 1, lang: "ru", affects_score: false, agents: [], agents_ok: 9, agents_total: 10,
  channels: { content: { state: "ok" }, voice: { state: "absent", reason: "chat" },
              video: { state: "absent", reason: "camera_off" } },
  competencies: [], soft: [], voice: null, face: null, convergences: [], timeline: [],
  timeline_total: 0, dropped_quotes: 0,
} as unknown as DeepReview;

async function table() {
  const { RealtimeTransport } = await import("../src/realtime/transport");
  FakeSocket.instances = [];
  let id = 0;
  let state: NegotiationState = { ...EMPTY };
  const transport = new RealtimeTransport((m) => { state = reduce(state, m, () => ++id); }, () => {});
  transport.send({ type: "start", scenarioId: "supplier", lang: "ru", mode: "practice" });
  await wait(0);
  const socket = FakeSocket.instances[FakeSocket.instances.length - 1];
  socket.deliver({ type: "session.queue_done" });
  socket.deliver({ type: "session.created", session_id: "s-review", resumed: false,
    scenario: { id: "supplier" }, state: STATE0, greeting: "Здравствуйте.",
    capabilities: { review: true } });
  await wait(0);
  return { get: () => state, set: (s: NegotiationState) => { state = s; }, socket, transport };
}

// ---------------------------------------------------------------------------
// Провод и состояние
// ---------------------------------------------------------------------------

test("кнопка шлёт review.request, прогресс и отчёт доезжают до состояния", async () => {
  const t = await table();
  try {
    t.transport.send({ type: "review" });
    assert.equal(t.socket.types().at(-1), "review.request");

    t.socket.deliver({ type: "review.progress", done: 1, total: 10, agent: "confidence" });
    t.socket.deliver({ type: "review.progress", done: 2, total: 10, agent: "voice" });
    let r = t.get().review;
    assert.equal(r.status, "running");
    assert.deepEqual([r.done, r.total, r.agents], [2, 10, ["confidence", "voice"]]);

    t.socket.deliver({ type: "review.done", review: REPORT });
    r = t.get().review;
    assert.equal(r.status, "done");
    assert.equal(r.report?.affects_score, false);
    assert.equal(t.get().log.filter((e) => e.kind === "sys").length, 0, "отчёт не строка в ленте");
  } finally { t.transport.close(); }
});

test("отказ ложится на кнопку, а «уже идёт» — не сбой", async () => {
  const t = await table();
  try {
    t.socket.deliver({ type: "review.progress", done: 1, total: 8, agent: "facts" });
    t.socket.deliver({ type: "error", error: { code: "review_busy", message: "Разбор уже идёт.", type: "review" } });
    assert.equal(t.get().review.status, "running", "второе нажатие не роняет идущий разбор");

    t.socket.deliver({ type: "error", error: { code: "review_rate_limited", message: "Попробуйте через минуту.",
                                               type: "rate_limited" } });
    const r = t.get().review;
    assert.equal(r.status, "failed");
    assert.equal(r.code, "review_rate_limited");
    assert.equal(r.message, "Попробуйте через минуту.");
    assert.equal(t.get().log.filter((e) => e.kind === "sys").length, 0, "отказ не уехал строкой в ленту стола");
  } finally { t.transport.close(); }
});

test("отчёт без единого ответившего агента — сбой, а не разбор", () => {
  const s = reduce({ ...EMPTY, review: { ...REVIEW_IDLE, status: "running" } },
                   { type: "review", review: { ...REPORT, agents_ok: 0 } }, () => 1);
  assert.equal(s.review.status, "failed");
  assert.equal(s.review.code, "review_empty");
  assert.ok(I18N.ru.review.failed.review_empty && I18N.en.review.failed.review_empty);
});

test("возвращение посреди разбора не оставляет вечный прогресс; новая партия — с нуля", () => {
  const greeting = (resumed: boolean): ServerMsg => ({
    type: "greeting", sessionId: "s", resumed, scenario: { id: "supplier" } as never,
    state: STATE0 as never, text: "Здравствуйте." });
  const running = { ...EMPTY, review: { ...REVIEW_IDLE, status: "running" as const, done: 3, total: 10 } };
  const back = reduce(running, greeting(true), () => 1);
  assert.equal(back.review.status, "failed");
  assert.equal(back.review.code, "review_interrupted");

  const done = { ...EMPTY, review: { ...REVIEW_IDLE, status: "done" as const, report: REPORT } };
  assert.equal(reduce(done, greeting(true), () => 1).review.status, "done", "готовый отчёт переживает обрыв");
  assert.equal(reduce(done, greeting(false), () => 1).review.status, "idle", "новая партия — новый разбор");
});

test("офлайн-ядро отказывает словами, а не рисует пустой отчёт", async () => {
  const { MockServer } = await import("../src/mock/mockServer");
  const got: ServerMsg[] = [];
  const mock = new MockServer((m) => got.push(m));
  mock.send({ type: "review" });
  mock.close();
  const err = got.find((m) => m.type === "review_error") as Extract<ServerMsg, { type: "review_error" }>;
  assert.ok(err, "офлайн-ядро промолчало");
  assert.equal(err.code, "review_unavailable");
  assert.equal(err.message, I18N.ru.review.offline);
});

// ---------------------------------------------------------------------------
// Подписи
// ---------------------------------------------------------------------------

test("пауза и скачок высоты — с числом и запятой по-русски, незнакомый код не рисуется", () => {
  const t = I18N.ru;
  assert.equal(evidenceLabel({ channel: "voice", kind: "pause", turn: 2, at_ms: 1000, value: 1240 }, t, "ru"),
               "пауза 1,2 с");
  assert.equal(evidenceLabel({ channel: "voice", kind: "pitch_jump", turn: 2, at_ms: 1, value: 5.4 }, I18N.en, "en"),
               "pitch jumped 5.4 st");
  assert.equal(evidenceLabel({ channel: "video", kind: "frown", turn: 2, at_ms: 1 }, t, "ru"), "нахмуренные брови");
  assert.equal(evidenceLabel({ channel: "video", kind: "anxious", turn: 2, at_ms: 1 }, t, "ru"), "",
               "вывод о чувствах — не код мимики, и подписи у него нет");
  assert.equal(evidenceLabel({ channel: "content", kind: "made_up", turn: 1, at_ms: null }, t, "ru"), "");
});

test("время находки: ход и минута, а чего не знаем — того не пишем", () => {
  const t = I18N.ru;
  assert.equal(evidenceWhen({ turn: 3, at_ms: 102_000 }, t), "Ход 3 · 1:42");
  assert.equal(evidenceWhen({ turn: 3, at_ms: null }, t), "Ход 3");
  assert.equal(evidenceWhen({ turn: 0, at_ms: 5_000 }, t), "0:05");
});

test("кнопка знает, почему её нельзя нажать", () => {
  const t = I18N.ru;
  assert.deepEqual(reviewAvailability("mock", { review: true }, t), { ok: false, reason: t.review.offline });
  assert.deepEqual(reviewAvailability("ws", { review: false }, t), { ok: false, reason: t.review.noModels });
  assert.deepEqual(reviewAvailability("ws", null, t), { ok: false, reason: t.review.noModels });
  assert.deepEqual(reviewAvailability("ws", { review: true }, t), { ok: true, reason: null });
});

test("вывод без повода и вывод упавшего агента — разные слова, не ноль", () => {
  const t = I18N.ru;
  assert.deepEqual(softValue({ id: "facts", value: null, confidence: null, examples: [] }, t, "ru"),
                   { value: "—", detail: t.review.softNone });
  assert.deepEqual(softValue({ id: "facts", value: null, confidence: null, unavailable: true, examples: [] }, t, "ru"),
                   { value: "—", detail: t.review.softUnavailable });
  assert.deepEqual(softValue({ id: "comprehension", value: 0.75, confidence: 0.5, num: 1.5, den: 2, examples: [] }, t, "ru"),
                   { value: "75%", detail: "1,5 из 2" });
  assert.equal(confLevel(0.8), "high");
  assert.equal(confLevel(0.5), "mid");
  assert.equal(confLevel(0.2), "low");
});

test("канал без данных называет причину", () => {
  const t = I18N.ru;
  assert.equal(channelText("voice", { state: "absent", reason: "chat" }, t, "ru"), t.review.channelState.chat);
  assert.equal(channelText("video", { state: "absent", reason: "camera_off" }, t, "ru"), "камера была выключена");
  assert.equal(channelText("voice", { state: "measured", seconds: 4.2 }, t, "ru"), "4,2 с речи — измерено без модели");
  assert.equal(channelText("video", { state: "ok", frames: 64 }, t, "ru"), "64 кадров");
});

// ---------------------------------------------------------------------------
// Словари: всё, что шлёт сервер, подписано на обоих языках
// ---------------------------------------------------------------------------

const SERVER = (path: string) => readFileSync(new URL(`../../services/gateway/app/${path}`, import.meta.url), "utf8");

function pyTuple(source: string, name: string): string[] {
  const m = source.match(new RegExp(`${name} = \\(([^)]*)\\)`));
  assert.ok(m, `на сервере не нашлось ${name}`);
  return [...m[1].matchAll(/"([a-z_]+)"/g)].map((x) => x[1]);
}

test("словарь мимики — тот же, что у сервера, и подписи совпадают", () => {
  const vision = SERVER("perception/vision.py");
  const block = vision.slice(vision.indexOf("CUES: dict"), vision.indexOf("def cue_labels"));
  const server = [...block.matchAll(/"([a-z_]+)": \{"ru": "([^"]+)", "en": "([^"]+)"\}/g)];
  assert.ok(server.length >= 10, "словарь мимики на сервере не прочитан");
  for (const [, code, ru, en] of server) {
    assert.equal(I18N.ru.review.cues[code], ru, `ru: ${code}`);
    assert.equal(I18N.en.review.cues[code], en, `en: ${code}`);
  }
  assert.equal(Object.keys(I18N.ru.review.cues).length, server.length, "лишний код мимики на клиенте");
});

test("у каждого кода находки, который шлёт сервер, есть подпись", () => {
  const agents = SERVER("review/agents.py");
  const kinds = [
    ...pyTuple(agents, "VOICE_KINDS"), ...pyTuple(agents, "CONFIDENCE_KINDS"),
    "number", "example", "fact", "deadline", "generic",
    "position", "reasoning", "conclusion", "proposal", "unspoken", "shift", "question",
    "answer_full", "answer_partial", "answer_no",
    "followup_steady", "followup_defensive", "followup_evasive", "followup_conceded",
    "contradiction", "claim_matches", "claim_contradicts", "claim_unsupported",
    "pause", "pitch_jump", "fading", "pro", "con",
  ];
  for (const lang of ["ru", "en"] as const) {
    const missing = kinds.filter((k) => !I18N[lang].review.kinds[k]);
    assert.deepEqual(missing, [], `${lang}: без подписи`);
  }
  const competencies = pyTuple(agents, "COMPETENCIES");
  for (const lang of ["ru", "en"] as const) {
    assert.deepEqual(competencies.filter((c) => !I18N[lang].review.competencyNames[c]), [], lang);
  }
});

test("у агентов прогресса и у выводов «как вы говорили» есть имена", () => {
  const merge = SERVER("review/merge.py");
  const softIds = [...merge.matchAll(/soft_item\("([a-z_]+)"/g)].map((m) => m[1]);
  assert.ok(softIds.length >= 7);
  for (const lang of ["ru", "en"] as const) {
    assert.deepEqual(softIds.filter((id) => !I18N[lang].review.softNames[id] || !I18N[lang].review.softHints[id]), []);
    for (const id of ["confidence", "competency", "thinking", "specificity", "comprehension",
                      "followups", "consistency", "facts", "voice", "face"]) {
      assert.ok(I18N[lang].review.agents[id], `${lang}: агент ${id}`);
    }
  }
});

test("лента камеры в итогах держит строку, где есть только мимика", () => {
  const { tape } = visionTape([{ turn: 2, at_ms: 9000, text: "", expressive: null, cues: ["frown", 7] }]);
  assert.equal(tape.length, 1);
  assert.deepEqual(tape[0].cues, ["frown"], "в ленту не доезжает ничего, кроме кодов");
});

test("на экзамене карточки нет: разбор рисуется только вне зачёта", () => {
  const src = readFileSync(new URL("../src/components/Debrief.tsx", import.meta.url), "utf8");
  assert.match(src, /at\(2\) && !exam && review \?/);
});
