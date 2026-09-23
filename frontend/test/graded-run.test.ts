// graded-run.test.ts — партия НА ЗАЧЁТ: экзамен и капстоун курса.
//
// ДЕФЕКТ, РАДИ КОТОРОГО НАПИСАН ЭТОТ ФАЙЛ. Решение «на экзамене семантического
// судьи нет — сертификат обязан быть воспроизводимым» было принято, записано в
// docs/judge-reproducibility.md и закрыто гейтом `judge_enabled_for`. А
// капстоун блока — те самые два очка экзамена, которые весят вдвое, — уходил в
// партию режимом `practice`, потому что режим на проводе и режим экрана были
// одним значением: экзамен по сути, обычный разбор по виду. Судья двигает
// ровно те поля, по которым `checkDrill` выносит вердикт: вскрытые интересы,
// флаги приёмов, размер уступки.
//
// Здесь держится клиентская половина развязки: капстоун уходит на провод
// режимом `drill`, экран при этом остаётся тренировкой, а список зачётных
// режимов совпадает с серверным (инвариант 8).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { REPRODUCIBLE_MODES, reproducibleRun } from "../src/lib/modes";
import { NO_LAYERS, detectLayers, sessionLayers, type Layers } from "../src/lib/layers";
import { dailyTable } from "../src/lib/daily";

const PROTOCOL = "../services/gateway/app/protocol.py";
const ALL_ON: Layers = { probe: true, voice: true, camera: true, avatar: true, pokerface: true };

test("список зачётных режимов совпадает с серверным", () => {
  // Инвариант 8: правило живёт в двух местах и обязано меняться синхронно.
  // Разъехаться они могут молча — расхождение всплыло бы не ошибкой, а
  // непройденным экзаменом у живого человека.
  const py = readFileSync(PROTOCOL, "utf8");
  const decl = py.match(/REPRODUCIBLE_MODES:[^=]*=\s*frozenset\(\{([^}]*)\}\)/);
  assert.ok(decl, "REPRODUCIBLE_MODES не найден в protocol.py — зеркало устарело");
  const server = decl[1].match(/"([a-z]+)"/g)!.map((s) => s.replaceAll('"', "")).sort();
  assert.deepEqual([...REPRODUCIBLE_MODES].sort(), server);
  assert.ok(server.includes("drill"), "капстоун курса выпал из зачётных режимов");
});

test("режим на проводе шире экранного ровно на капстоун", () => {
  const py = readFileSync(PROTOCOL, "utf8");
  const wire = py.match(/^Mode = Literal\[([^\]]*)\]/m);
  assert.ok(wire, "Mode не найден в protocol.py");
  const server = wire[1].match(/"([a-z]+)"/g)!.map((s) => s.replaceAll('"', "")).sort();
  const ts = readFileSync("src/types.ts", "utf8");
  const screen = ts.match(/export type ScreenMode = ([^;]*);/);
  assert.ok(screen, "ScreenMode не найден в types.ts");
  const client = [
    ...screen[1].match(/"([a-z]+)"/g)!.map((s) => s.replaceAll('"', "")),
    "drill",
  ].sort();
  assert.deepEqual(client, server, "словарь режимов разъехался с сервером");
});

test("капстоун идёт БЕЗ слоёв — как экзамен", () => {
  // Третий принцип: грейд со слоями обязан быть сравним с грейдом без них.
  // Сервер гасит их сам, но клиент не должен и просить.
  for (const mode of REPRODUCIBLE_MODES) {
    assert.deepEqual(sessionLayers(mode, ALL_ON, detectLayers()), NO_LAYERS, mode);
  }
  assert.ok(reproducibleRun("drill") && reproducibleRun("exam"));
  assert.ok(!reproducibleRun("practice") && !reproducibleRun("campaign"));
});

test("капстоун уходит в партию зачётным режимом, а не тренировкой", () => {
  // Проверка по исходнику — единственная, которая падает на настоящей причине:
  // всё остальное (гейт судьи, слои, стол дня) уже стоит на сервере и молча
  // работает, пока клиент шлёт `practice`.
  const app = readFileSync("src/App.tsx", "utf8");
  const startDrill = app.match(/const startDrill = useCallback\(([\s\S]*?)\n  \);/);
  assert.ok(startDrill, "startDrill в App.tsx не найден — тест устарел вместе с кодом");
  const launched = startDrill[1].match(/launch\(ex\.scenario_id,\s*"([a-z]+)"/);
  assert.ok(launched, "startDrill больше не зовёт launch — тест устарел");
  assert.ok(REPRODUCIBLE_MODES.includes(launched[1] as never),
    `капстоун уходит режимом "${launched[1]}": судья на нём останется живым`);

  // Повторное подключение обязано вернуть ТУ ЖЕ партию, а не «похожую»:
  // капстоун, переподключённый тренировкой, снова получил бы судью.
  const launch = app.match(/const launch = useCallback\(([\s\S]*?)\n  \);/);
  assert.ok(launch, "launch в App.tsx не найден — тест устарел вместе с кодом");
  assert.match(launch[1], /activeRunRef\.current\s*=\s*\{\s*scenarioId,\s*mode:\s*m,\s*options:\s*opts\s*\}/,
    "запуск не сохраняет исходные сценарий, зачётный режим и параметры партии");
  assert.match(launch[1], /nego\.start\(scenarioId,\s*m,/,
    "запуск не передаёт сохранённый режим на провод");
  const retry = app.match(/const retry = useCallback\(\(\) => \{([\s\S]*?)\n  \}, \[/);
  assert.ok(retry, "retry в App.tsx не найден — тест устарел вместе с кодом");
  assert.match(retry[1], /const run = activeRunRef\.current/,
    "повтор не читает параметры исходной партии");
  assert.match(retry[1], /launch\(run\.scenarioId,\s*run\.mode,\s*run\.options\)/,
    "повтор теряет исходные сценарий, зачётный режим или параметры партии");
});

test("офлайн-ядро не кладёт условие дня на зачётный стол", async () => {
  // Зеркало app/realtime/endpoint.py. Условие дня режет лимит ходов, а лимит —
  // часть задания капстоуна, доказанного прогоном движка (инвариант 9).
  const { MockServer } = await import("../src/mock/mockServer");
  const table = dailyTable(new Date(2026, 7, 28)); // short: восемь ходов
  assert.equal(table.modifier.id, "short", "контракт расписания изменился");

  const maxTurnsFor = async (mode: string) => {
    let state: { max_turns: number } | null = null;
    const srv = new MockServer((m: { type: string; state?: Record<string, number> }) => {
      if (m.type === "greeting") state = m.state as never;
    });
    srv.send({ type: "start", lang: "ru", mode,
               scenarioId: table.scenarioId, daily: table.day } as never);
    for (let i = 0; i < 60 && !state; i++) await new Promise((r) => setTimeout(r, 10));
    assert.ok(state, `${mode}: приветствие не пришло`);
    return (state as { max_turns: number }).max_turns;
  };

  assert.equal(await maxTurnsFor("practice"), 8, "тренировка потеряла условие дня");
  for (const mode of REPRODUCIBLE_MODES) {
    assert.equal(await maxTurnsFor(mode), 12,
      `${mode}: условие дня срезало лимит ходов в зачётной партии`);
  }
});
