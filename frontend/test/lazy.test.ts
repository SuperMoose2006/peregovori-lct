// lazy.test.ts — что домашний экран НЕ грузит, и что всё отложенное прогрето.
//
// Куски сборки — не декларация в vite.config.ts, а свойство графа импортов:
// один статический `import` из App.tsx возвращает на критический путь тот же
// движок, ради выноса которого всё делалось, и заметить это по экрану нельзя —
// он просто загрузится на 200 КБ медленнее. Поэтому граф проверяется здесь.
//
// Второй тест страхует ИНВАРИАНТ 5. «Ленивый» экран без сети не откроется, если
// его файл не доехал заранее, — а это не «играем офлайн», это половина
// страницы. Ровно поэтому у каждого отложенного куска обязан быть прогрев на
// простое (App.tsx: WARM), и забыть его в списке нельзя молча.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, normalize, resolve } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src");

/** Разрешить спецификатор импорта в путь файла. Расширение дописываем сами:
 *  в исходниках его нет, а на диске есть. */
function resolveSpec(fromFile: string, spec: string): string | null {
  if (!spec.startsWith(".")) return null; // пакет, не наш модуль
  const base = resolve(dirname(fromFile), spec);
  for (const ext of [".ts", ".tsx", "/index.ts", "/index.tsx", ""]) {
    try {
      readFileSync(base + ext, "utf8");
      return normalize(base + ext);
    } catch { /* следующее расширение */ }
  }
  return null;
}

/**
 * Статические импорты модуля.
 *
 * `import type` пропускается намеренно: тип стирается компилятором и ребром
 * графа не является — иначе `import type { ExamCtx } from "./CourseScreen"`
 * «вернул» бы экран курса на критический путь, которого он там не занимает.
 * `import("…")` не ловится тем же выражением: до `from` он не доходит.
 */
function staticImports(file: string): string[] {
  const text = readFileSync(file, "utf8");
  const out: string[] = [];
  // Многострочный список специфаеров разрешён: `[^;]*?` не переходит границу
  // инструкции, а `from` внутри одного импорта встречается ровно один раз.
  for (const m of text.matchAll(/(?:^|\n)(?:import|export)\s(?!type\s)[^;]*?from\s*"([^"]+)"/g)) {
    out.push(m[1]);
  }
  for (const m of text.matchAll(/(?:^|\n)import\s+"([^"]+)"/g)) out.push(m[1]);
  return out;
}

/** Всё, до чего достаёт статический граф от точки входа. */
function staticGraph(entry: string): Set<string> {
  const seen = new Set<string>();
  const queue = [normalize(entry)];
  while (queue.length) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    for (const spec of staticImports(file)) {
      const target = resolveSpec(file, spec);
      if (target && !seen.has(target)) queue.push(target);
    }
  }
  return seen;
}

const GRAPH = staticGraph(join(SRC, "main.tsx"));
const has = (rel: string) => GRAPH.has(normalize(join(SRC, rel)));

test("офлайн-ядро и экраны не лежат на пути к первой отрисовке", () => {
  // Каждый пункт — то, что человек на домашнем экране не открыл и, возможно,
  // не откроет: движок партии, стол, разбор, курс, транспорты.
  const forbidden = [
    "mock/engine.ts",        // движок-зеркало: нужен партии, курсу и разбору
    "mock/mockServer.ts",    // офлайн-транспорт: только когда сервер не ответил
    "realtime/transport.ts", // realtime-сессия: только когда ответил
    "components/Table.tsx",
    "components/Debrief.tsx",
    "components/CourseScreen.tsx",
    "components/Exercise.tsx",
    "components/Rematch.tsx",
    "lib/courseCheck.ts",
    "lib/rematchReplay.ts",
    "api/whatif.ts",
  ];
  const leaked = forbidden.filter(has);
  assert.deepEqual(leaked, [], "статический импорт вернул это на критический путь:\n" + leaked.join("\n"));
});

test("карта курса на критическом пути есть, а банк и зачёт — нет", () => {
  // Счётчик «пройдено N из 10» в рейле — часть домашнего экрана, и БЛОКИ под
  // него ехать обязаны. А вот банк упражнений — нет: 116 КБ формулировок и
  // разборов на двух языках нужны только тому, кто открыл курс. Ровно поэтому
  // генератор пишет два файла: сборщик умеет не грузить лишний модуль, но не
  // умеет резать модуль пополам.
  //
  // Зачёт упражнения (он же движок) тоже не на критическом пути. Инвариант 9
  // держится тем, что проверка считает НАСТОЯЩИМ движком, а не тем, что она
  // лежит в одном файле с данными.
  assert.ok(has("lib/courseMap.ts"), "карта курса нужна рейлу домашнего экрана");
  assert.ok(has("data/course.blocks.generated.ts"), "блоки нужны рейлу");
  assert.ok(!has("data/course.generated.ts"),
    "банк упражнений вернулся на домашний экран — это 116 КБ на первую отрисовку");
  assert.ok(!has("lib/courseCheck.ts"), "зачёт упражнений уехал бы с движком обратно");
  assert.ok(!has("lib/courseExam.ts"), "экзамен мастера тянет банк");
});

test("каждый отложенный кусок прогревается на простое (инвариант 5)", () => {
  const app = readFileSync(join(SRC, "App.tsx"), "utf8");
  const ws = readFileSync(join(SRC, "api", "ws.ts"), "utf8");

  // Имя → путь: `const loadTable = () => import("./components/Table")…`
  const named = new Map<string, string>();
  for (const m of app.matchAll(/const\s+(load\w+)\s*=\s*\(\)\s*=>\s*\n?\s*import\("([^"]+)"\)/g)) {
    named.set(m[1], resolveSpec(join(SRC, "App.tsx"), m[2])!);
  }
  assert.ok(named.size >= 4, "отложенных экранов стало меньше — тест устарел вместе с кодом");

  const warmBlock = app.match(/const WARM[\s\S]*?=\s*\[([\s\S]*?)\n\];/);
  assert.ok(warmBlock, "список прогрева WARM в App.tsx не найден");
  const warmed = new Set<string>();
  for (const m of warmBlock[1].matchAll(/import\("([^"]+)"\)/g)) {
    warmed.add(resolveSpec(join(SRC, "App.tsx"), m[1])!);
  }
  for (const m of warmBlock[1].matchAll(/\bload\w+/g)) {
    const path = named.get(m[0]);
    if (path) warmed.add(path);
  }

  // Всё, что где-либо грузится динамически, обязано быть в этом списке.
  const dynamic = new Set<string>();
  for (const [file, text] of [[join(SRC, "App.tsx"), app], [join(SRC, "api", "ws.ts"), ws]] as const) {
    for (const m of text.matchAll(/\bimport\("([^"]+)"\)/g)) {
      const target = resolveSpec(file, m[1]);
      if (target) dynamic.add(target);
    }
  }
  const cold = [...dynamic].filter((f) => !warmed.has(f)).map((f) => f.replace(SRC, "src"));
  assert.deepEqual(cold, [], "без сети эти куски не доедут — добавьте их в WARM:\n" + cold.join("\n"));
});
