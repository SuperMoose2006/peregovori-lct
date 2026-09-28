// negotiation.test.ts — машина состояний стола: `reduce` из useNegotiation.ts.
//
// ПОЧЕМУ ОТДЕЛЬНЫЙ ФАЙЛ. Весь стол — лента, шкалы, индикатор «оппонент
// печатает», разбор — рисуется из одного состояния, и это состояние собирает
// одна чистая функция. После слияния двух линий (b682bb4) в работе остался
// reducer одной из них, а тесты другой сняты вместе с её реализацией. Прибор
// `analysis-latency.test.ts` держит только тайминг разбора; всё остальное —
// кто снимает `busy`, что делает авторитетный текст с сырыми дельтами, как
// переживается переподключение — не держал никто.
//
// Здесь reducer проверяется на уровне `ServerMsg`, без транспорта. Как те же
// события приезжают с провода — в `negotiationWire.test.ts`.
import test from "node:test";
import assert from "node:assert/strict";

import { reduce, type ChatEntry, type NegotiationState } from "../src/api/useNegotiation";
import type { ServerMsg } from "../src/types";

const EMPTY: NegotiationState = {
  kind: null, scenario: null, state: null, log: [], debrief: null, busy: false,
  phase: null, error: null, layerFail: {}, conn: "online", judgeActive: false,
  avatarState: null, oppSpeaking: false, oppAudio: false, userSpeaking: false,
  transcript: null, observations: [], tells: 0, tellFrames: 0, tellNow: false,
  framesSent: 0, capabilities: null,
};

const STATE = {
  trust: 50, tension: 20, info: 10, leverage: 30,
  offer_opp: 100, offer_player: null, interests_found: 0, interests_total: 3,
  turn: 0, max_turns: 12, status: "active",
} as never;

const ANALYSIS = {
  tags: [{ key: "objective_criteria", label: "объективный критерий" }],
  primary: "objective_criteria", arg_quality: 84, spin: null,
  flags: { hostile: false, threat: false, question: false },
};

const DELTAS = { trust: 3, tension: -2, info: 5, leverage: 4 };

/** Прогнать поток сообщений; счётчик id — как у хука. */
function run(start: NegotiationState, msgs: ServerMsg[], from = 100) {
  let id = from;
  const next = () => ++id;
  return msgs.reduce((s, m) => reduce(s, m, next), start);
}

const me = (id: number, extra: Partial<ChatEntry & { kind: "me" }> = {}): ChatEntry =>
  ({ id, kind: "me", text: `реплика ${id}`, ...extra });

// Предикат из `turn()` в useNegotiation.ts: хук сам по себе в node не
// поднимается (выбор транспорта читает `import.meta.env`), поэтому условие
// «следующий ход принимается» повторено здесь дословно. Поменялось там —
// обязано поменяться здесь.
const canMove = (s: NegotiationState) =>
  s.conn === "online" && !s.busy && !!s.state && s.state.status === "active";

// ---------------------------------------------------------------------------
// 1. Начало партии и её продолжение после обрыва
// ---------------------------------------------------------------------------

test("новая партия начинается с чистой ленты: одно приветствие, никаких хвостов", () => {
  // Хвост прошлой партии в новой — чужие реплики под чужими шкалами.
  const stale: NegotiationState = {
    ...EMPTY, busy: true, phase: "replying", error: "прошлая ошибка",
    log: [me(1), { id: 2, kind: "opp", text: "старое", streaming: true }],
  };
  const s = run(stale, [{ type: "greeting", sessionId: "s1", scenario: { id: "supplier" } as never,
                          state: STATE, text: "Здравствуйте.", judge_active: true }]);
  assert.equal(s.log.length, 1);
  assert.deepEqual({ kind: s.log[0].kind, text: (s.log[0] as { text: string }).text },
                   { kind: "opp", text: "Здравствуйте." });
  assert.equal(s.busy, false);
  assert.equal(s.phase, null);
  assert.equal(s.error, null, "ошибка прошлой попытки не переживает начало новой партии");
  assert.equal(s.judgeActive, true);
  assert.equal(s.state, STATE);
});

test("бейдж судьи горит только по слову сервера", () => {
  // Принцип 2: «судит ИИ по смыслу» без живого судьи — заявление того, чего нет.
  for (const judge_active of [undefined, false]) {
    const s = run({ ...EMPTY, judgeActive: true }, [{ type: "greeting", sessionId: "s", scenario: {} as never,
      state: STATE, text: "Привет.", judge_active }]);
    assert.equal(s.judgeActive, false, `judge_active=${judge_active}`);
  }
});

test("продолженная партия сохраняет ленту и не здоровается второй раз", () => {
  // После обрыва сервер присылает `session.created {resumed:true}`. Приветствие
  // уже звучало; стереть ленту — значит молча выбросить всё, что человек
  // наговорил. Оборванный на полуслове пузырь больше не «печатается», а
  // висящая заглушка подсказки не дождётся ответа — сокет-то новый.
  const log: ChatEntry[] = [
    { id: 1, kind: "opp", text: "Здравствуйте." },
    me(2, { analysis: ANALYSIS, deltas: DELTAS }),
    { id: 3, kind: "opp", text: "Хорошо, дав", streaming: true },
    { id: 4, kind: "hint", text: "", pending: true },
    { id: 5, kind: "hint", text: "Спросите про объём.", pending: false },
  ];
  const resumedState = { ...(STATE as object), turn: 1 } as never;
  const s = run({ ...EMPTY, busy: true, phase: "replying", log }, [{ type: "greeting",
    sessionId: "s1", resumed: true, scenario: {} as never, state: resumedState, text: "Здравствуйте." }]);
  assert.deepEqual(s.log.map((e) => e.id), [1, 2, 3, 5], "лента пережила обрыв, минус висящая заглушка");
  const cut = s.log[2] as ChatEntry & { kind: "opp" };
  assert.equal(cut.text, "Хорошо, дав");
  assert.ok(!cut.streaming, "оборванный пузырь остался с кареткой «печатает»");
  assert.equal(s.state, resumedState, "шкалы обязаны взять состояние сервера, а не своё");
  assert.equal(s.busy, false);
  assert.ok(canMove(s), "после переподключения стол обязан принимать ход");
});

// ---------------------------------------------------------------------------
// 2. Реплика оппонента: сырые дельты и авторитетный итог
// ---------------------------------------------------------------------------

test("дельты печатают один пузырь, а не пузырь на каждый кусок", () => {
  const s = run({ ...EMPTY, log: [me(1)] }, [
    { type: "opponent_delta", chunk: "Хорошо, " },
    { type: "opponent_delta", chunk: "давайте " },
    { type: "opponent_delta", chunk: "посчитаем." },
  ]);
  const opp = s.log.filter((e) => e.kind === "opp");
  assert.equal(opp.length, 1);
  assert.equal((opp[0] as { text: string }).text, "Хорошо, давайте посчитаем.");
  assert.equal((opp[0] as { streaming?: boolean }).streaming, true);
});

test("response.done заменяет сырые дельты авторитетным текстом в том же пузыре", () => {
  // CLAUDE.md, протокол: дельты сырые, санитайзер судит реплику целиком и
  // может её отвергнуть. Выход из роли, успевший напечататься, обязан исчезнуть
  // с экрана — иначе защита срабатывает после того, как человек всё прочитал.
  const s = run({ ...EMPTY, busy: true, phase: "replying", log: [me(1)] }, [
    { type: "opponent_delta", chunk: "Как языковая модель, " },
    { type: "opponent_delta", chunk: "я не могу вести переговоры." },
    { type: "opponent", text: "Давайте вернёмся к цене.", analysis: ANALYSIS, deltas: DELTAS, state: STATE },
  ]);
  const opp = s.log.filter((e) => e.kind === "opp") as (ChatEntry & { kind: "opp" })[];
  assert.equal(opp.length, 1, "итог лёг отдельным пузырём рядом с сырым");
  assert.equal(opp[0].text, "Давайте вернёмся к цене.");
  assert.ok(!opp[0].streaming);
  assert.ok(!JSON.stringify(s.log).includes("языковая модель"), "сырой текст остался в ленте");
  // Id прежний: React перерисовывает тот же пузырь, а не вставляет новый.
  assert.equal(opp[0].id, 101);
});

test("итог без дельт (шаблон движка, офлайн) кладётся новым пузырём", () => {
  const s = run({ ...EMPTY, busy: true, log: [me(1)] }, [
    { type: "opponent", text: "Шаблонная реплика.", analysis: ANALYSIS, deltas: DELTAS, state: STATE },
  ]);
  assert.deepEqual(s.log.map((e) => e.kind), ["me", "opp"]);
});

test("итог хода отпускает стол: busy и фаза сняты, шкалы — от движка", () => {
  const settled = { ...(STATE as object), turn: 1, trust: 53 } as never;
  const s = run({ ...EMPTY, state: STATE, busy: true, phase: "replying", log: [me(1)] }, [
    { type: "opponent", text: "Хорошо.", analysis: ANALYSIS, deltas: DELTAS, state: settled },
  ]);
  assert.equal(s.busy, false);
  assert.equal(s.phase, null);
  assert.equal(s.state, settled);
  assert.ok(canMove(s));
  const mine = s.log[0] as ChatEntry & { kind: "me" };
  assert.deepEqual(mine.deltas, DELTAS, "сдвиг шкал не привязался к реплике игрока");
});

test("строка в ленте посреди печати не раскалывает реплику надвое", {
  todo: "useNegotiation.ts:336-345/393-398 смотрят только на ПОСЛЕДНЮЮ запись ленты: " +
        "notice (tts_unavailable, keepBusy) или заглушка подсказки посреди потока — и хвост " +
        "реплики уходит в новый пузырь, а первый навсегда остаётся «печатающимся» с сырым текстом",
}, () => {
  // Настоящий путь: синтез упал на первой фразе (`error {code:"tts_unavailable"}`
  // → notice c keepBusy), а текст ещё идёт. Или игрок нажал «подсказку», пока
  // оппонент печатает. Реплика оппонента от этого не становится двумя.
  for (const interloper of [
    { type: "notice", text: "Синтез речи недоступен.", keepBusy: true } as ServerMsg,
    { type: "hint", text: "Спросите про объём." } as ServerMsg,
  ]) {
    const s = run({ ...EMPTY, busy: true, log: [me(1)] }, [
      { type: "opponent_delta", chunk: "Хорошо, " },
      interloper,
      { type: "opponent_delta", chunk: "давайте." },
      { type: "opponent", text: "Хорошо, давайте.", analysis: ANALYSIS, deltas: DELTAS, state: STATE },
    ]);
    const opp = s.log.filter((e) => e.kind === "opp") as (ChatEntry & { kind: "opp" })[];
    assert.ok(opp.every((e) => !e.streaming), `${interloper.type}: пузырь остался «печатающимся» навсегда`);
    assert.deepEqual(opp.map((e) => e.text), ["Хорошо, давайте."],
      `${interloper.type}: реплика раскололась, сырой кусок остался на экране`);
  }
});

// ---------------------------------------------------------------------------
// 3. Судья и его слово
// ---------------------------------------------------------------------------

test("фаза ожидания называет, что делает сервер, и не трогает busy", () => {
  let s = run({ ...EMPTY, busy: true }, [{ type: "phase", phase: "judging" }]);
  assert.equal(s.phase, "judging");
  assert.equal(s.busy, true);
  s = run(s, [{ type: "phase", phase: "replying" }]);
  assert.equal(s.phase, "replying");
  assert.equal(s.busy, true, "фаза — подпись к ожиданию, а не его конец");
});

test("слово судьи ложится под обмен только когда судья что-то сказал", () => {
  // Принцип 2: чипы «судья увидел» рисуются, только если судья отработал.
  // Пустой список приёмов — не повод для карточки; офлайн полей нет вовсе.
  const opponent = (extra: Partial<Extract<ServerMsg, { type: "opponent" }>>) =>
    run({ ...EMPTY, busy: true, log: [me(1)] }, [{ type: "opponent", text: "Хорошо.",
      analysis: ANALYSIS, deltas: DELTAS, state: STATE, ...extra }]);
  const coachOf = (s: NegotiationState) =>
    s.log.filter((e) => e.kind === "coach") as (ChatEntry & { kind: "coach" })[];

  assert.equal(coachOf(opponent({})).length, 0, "офлайн (полей нет) — карточки нет");
  assert.equal(coachOf(opponent({ coach: "   ", coach_techniques: [], coach_reject: false })).length, 0,
    "пустое слово и пустой список — не повод для карточки");

  const text = coachOf(opponent({ coach: "Хороший критерий." }));
  assert.deepEqual(text.map((c) => [c.text, c.techniques, c.reject]), [["Хороший критерий.", undefined, undefined]]);

  const chips = coachOf(opponent({ coach_techniques: ["объективный критерий"] }));
  assert.equal(chips.length, 1, "чипы приёмов без текста потерялись");
  assert.deepEqual(chips[0].techniques, ["объективный критерий"]);

  const rejected = coachOf(opponent({ coach_reject: true }));
  assert.equal(rejected.length, 1, "флаг «набор слов, а не смысл» потерялся");
  assert.equal(rejected[0].reject, true);

  // Порядок: сначала реплика оппонента, под ней слово судьи.
  assert.deepEqual(opponent({ coach: "Да." }).log.map((e) => e.kind), ["me", "opp", "coach"]);
});

// ---------------------------------------------------------------------------
// 4. Разбор хода: теги и число — к своей реплике
// ---------------------------------------------------------------------------

test("теги и окончательное число ложатся на последнюю реплику игрока", () => {
  const log = [me(1, { analysis: ANALYSIS, argSettled: true, deltas: DELTAS }),
               { id: 2, kind: "opp", text: "Ответ." } as ChatEntry, me(3)];
  const s = run({ ...EMPTY, log }, [
    { type: "analysis", analysis: ANALYSIS },
    { type: "arg_quality", value: 41, judged: true },
  ]);
  const first = s.log[0] as ChatEntry & { kind: "me" };
  const last = s.log[2] as ChatEntry & { kind: "me" };
  assert.equal(first.analysis?.arg_quality, 84, "прошлый ход переписан разбором нового");
  assert.equal(last.analysis?.arg_quality, 41, "на экране осталось черновое число");
  assert.equal(last.argSettled, true);
  assert.equal(last.judged, true);
});

test("число без тегов не выдумывает разбор", () => {
  // `turn.analysis` потерялся — число есть, а тегов нет. Рисовать поле
  // разбора с пустыми тегами значило бы показать разбор, которого не было.
  const s = run({ ...EMPTY, log: [me(1)] }, [{ type: "arg_quality", value: 41, judged: false }]);
  const mine = s.log[0] as ChatEntry & { kind: "me" };
  assert.equal(mine.analysis, undefined);
  assert.equal(mine.argSettled, true);
  assert.equal(mine.judged, false, "словарь движка выдан за судью (принцип 2)");
});

test("разбор без реплики игрока ленту не трогает", () => {
  const start: NegotiationState = { ...EMPTY, log: [{ id: 1, kind: "opp", text: "Здравствуйте." }] };
  assert.equal(reduce(start, { type: "analysis", analysis: ANALYSIS as never }, () => 9), start);
  assert.equal(reduce(start, { type: "arg_quality", value: 1, judged: false }, () => 9), start);
});

// ---------------------------------------------------------------------------
// 5. Вопрос «Читай лицо», подсказка, слои
// ---------------------------------------------------------------------------

test("вопрос по лицу ложится под реплику открытым", () => {
  const s = run({ ...EMPTY, log: [me(1), { id: 2, kind: "opp", text: "Хм." }] }, [
    { type: "probe", turn: 3, options: ["warmed", "opened_up", "persuaded", "collaborated"], answer: 2 },
  ]);
  const probe = s.log[2] as ChatEntry & { kind: "probe" };
  assert.equal(probe.kind, "probe");
  assert.equal(probe.turn, 3);
  assert.equal(probe.answer, 2);
  assert.equal(probe.picked, undefined, "вопрос пришёл уже отвеченным");
});

test("ответ на подсказку встаёт на место заглушки, а не под неё", () => {
  const log: ChatEntry[] = [me(1), { id: 2, kind: "hint", text: "", pending: true }, me(3)];
  const s = run({ ...EMPTY, log }, [{ type: "hint", text: "Спросите про сроки.", line: "Какие сроки для вас критичны?" }]);
  assert.equal(s.log.length, 3, "заглушка и ответ стоят рядом двумя строками");
  const hint = s.log[1] as ChatEntry & { kind: "hint" };
  assert.deepEqual([hint.id, hint.text, hint.line, hint.pending], [2, "Спросите про сроки.", "Какие сроки для вас критичны?", false]);

  const unasked = run({ ...EMPTY, log: [me(1)] }, [{ type: "hint", text: "Совет." }]);
  assert.deepEqual(unasked.log.map((e) => e.kind), ["me", "hint"]);
});

test("невставший слой назван, а партия продолжается", () => {
  const s = run({ ...EMPTY, busy: true, layerFail: { voice: "микрофон запрещён" } }, [
    { type: "layer_failed", layer: "camera", reason: "камера занята" },
  ]);
  assert.deepEqual(s.layerFail, { voice: "микрофон запрещён", camera: "камера занята" });
  assert.equal(s.busy, true, "отказ слоя не имеет права отменять ход");
});

// ---------------------------------------------------------------------------
// 6. Ошибки, строки со стола и конец партии
// ---------------------------------------------------------------------------

test("строка со стола снимает ожидание, если не просили его держать", () => {
  const s = run({ ...EMPTY, busy: true, phase: "judging", log: [me(1)] }, [{ type: "notice", text: "Ход не состоялся." }]);
  assert.equal(s.busy, false);
  assert.equal(s.phase, null, "фаза пережила остановленный ход");
  assert.deepEqual(s.log.map((e) => e.kind), ["me", "sys"]);
});

test("ошибка снимает ожидание и не трогает ленту", () => {
  const log = [me(1)];
  const s = run({ ...EMPTY, busy: true, log }, [{ type: "error", message: "Сценарий не найден" }]);
  assert.equal(s.error, "Сценарий не найден");
  assert.equal(s.busy, false, "индикатор «печатает» над ошибкой — обещание ответа, которого не будет");
  assert.equal(s.log, log);
});

test("разбор партии кладётся целиком и закрывает ожидание", () => {
  const debrief = { grade: "B", overall: 72, observations: [{ turn: 1, at_ms: 0, text: "в кадре", expressive: null }] } as never;
  const s = run({ ...EMPTY, busy: true }, [{ type: "debrief", debrief }]);
  assert.equal(s.debrief, debrief, "лента наблюдений обязана ехать из разбора как есть");
  assert.equal(s.busy, false);
});

test("неизвестное событие возвращает то же состояние, а не копию", () => {
  // Копия на каждый шум провода — лишняя перерисовка всего стола.
  const start = { ...EMPTY, log: [me(1)] };
  assert.equal(reduce(start, { type: "что-то новое" } as never, () => 1), start);
});

// ---------------------------------------------------------------------------
// 7. Чистота: React видит изменения только через новые объекты
// ---------------------------------------------------------------------------

function deepFreeze<T>(o: T): T {
  if (o && typeof o === "object" && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o as object)) deepFreeze(v);
  }
  return o;
}

test("reducer не мутирует прежнее состояние ни на одном событии", () => {
  // Мутация prev.log на месте — и React не видит новой реплики, пока что-то
  // другое не перерисует стол. Модули строгие, поэтому запись в замороженный
  // объект здесь бросает, а не проходит молча.
  const base = (): NegotiationState => deepFreeze({
    ...EMPTY, busy: true, state: STATE,
    log: [me(1), { id: 2, kind: "opp", text: "Хо", streaming: true },
          { id: 3, kind: "hint", text: "", pending: true }, me(4)],
  });
  const all: ServerMsg[] = [
    { type: "greeting", sessionId: "s", scenario: {} as never, state: STATE, text: "Привет." },
    { type: "greeting", sessionId: "s", resumed: true, scenario: {} as never, state: STATE, text: "Привет." },
    { type: "opponent_delta", chunk: "рошо" },
    { type: "analysis", analysis: ANALYSIS as never },
    { type: "arg_quality", value: 10, judged: true },
    { type: "opponent", text: "Хорошо.", analysis: ANALYSIS as never, deltas: DELTAS, state: STATE,
      coach: "Да.", coach_techniques: ["x"], coach_reject: true },
    { type: "debrief", debrief: {} as never },
    { type: "phase", phase: "judging" },
    { type: "probe", turn: 3, options: ["a", "b", "c", "d"], answer: 1 },
    { type: "hint", text: "Совет." },
    { type: "layer_failed", layer: "voice", reason: "нет" },
    { type: "notice", text: "Строка." },
    { type: "error", message: "Ошибка." },
  ];
  for (const msg of all) {
    assert.doesNotThrow(() => reduce(base(), msg, () => 99), `${msg.type} мутирует prev`);
  }
});
