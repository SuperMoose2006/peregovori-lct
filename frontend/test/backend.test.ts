// backend.test.ts — фронтенд, выложенный ОТДЕЛЬНО от бэкенда.
//
// ПОЧЕМУ ЭТО НУЖНО СТОРОЖИТЬ. «Работает» на одном origin не говорит про разные
// НИЧЕГО. Браузер молча меняет три вещи, когда домены расходятся: не шлёт
// учётные данные без `credentials: "include"`, не отправляет куку `dlg_ok`
// (samesite=lax) на чужой домен, и не умеет слать заголовок при рукопожатии
// сокета. Ни одну из трёх нельзя увидеть, гоняя продукт на `localhost:5173`
// рядом с гейтвеем, — а именно так его и гоняют каждый день.
//
// И обратное, столь же важное: СОВМЕЩЁННОЕ РАЗВЁРТЫВАНИЕ ОБЯЗАНО РАБОТАТЬ БЕЗ
// НАСТРОЙКИ. Гейтвей раздаёт статику сам, `VITE_API_BASE` никто не задавал —
// адреса должны остаться в точности прежними, до символа, и ни одного лишнего
// запроса появиться не должно. Разделение — про развёртывание, а не про то,
// чтобы продукт перестал собираться «как раньше».
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { TICKET_PATH, makeBackend } from "../src/api/backend";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

/** Страница и бэкенд на одном происхождении — сегодняшнее развёртывание. */
const together = () => makeBackend("", () => "http://localhost:5173");
/** Статика на одном порту, бэкенд на другом. Для браузера это РАЗНЫЕ сайты. */
const apart = () => makeBackend("http://127.0.0.1:8010", () => "http://127.0.0.1:5200");

/** Подделка `fetch`, запоминающая адрес и настройки каждого запроса. */
function recorder(reply: () => unknown = () => ({ ok: true, json: async () => ({}) })) {
  const calls: { url: string; init: RequestInit }[] = [];
  const g = globalThis as Record<string, unknown>;
  const original = g.fetch;
  g.fetch = (url: unknown, init: RequestInit = {}) => {
    calls.push({ url: String(url), init });
    return Promise.resolve(reply() as Response);
  };
  return { calls, restore: () => { g.fetch = original; } };
}

// ---------------------------------------------------------------------------
// 1. Совмещённое развёртывание: поведение ровно прежнее
// ---------------------------------------------------------------------------

test("без VITE_API_BASE адреса остаются в точности сегодняшними", () => {
  const b = together();
  assert.equal(b.crossOrigin(), false);
  assert.equal(b.apiUrl("/api/health"), "/api/health");
  assert.equal(b.apiUrl("/api/campaigns?lang=ru"), "/api/campaigns?lang=ru");
  assert.equal(b.wsUrl("/v1/realtime?mode=text"), "ws://localhost:5173/v1/realtime?mode=text");
});

test("без VITE_API_BASE учётные данные не трогаются", async () => {
  const net = recorder();
  try {
    await together().apiFetch("/api/health", { signal: undefined });
    assert.equal(net.calls.length, 1);
    assert.equal(net.calls[0].url, "/api/health");
    // Именно ОТСУТСТВИЕ поля, а не `same-origin` строкой: умолчание браузера и
    // так `same-origin`, а вписанное значение — это изменение поведения там,
    // где менять нечего.
    assert.equal("credentials" in net.calls[0].init, false,
      "на своём origin появились учётные данные — это уже не «как было»");
  } finally {
    net.restore();
  }
});

test("на своём origin за билетом НЕ ходят вовсе", async () => {
  const net = recorder();
  try {
    assert.equal(await together().socketTicket(), null);
    assert.deepEqual(net.calls, [], "лишний запрос там, где кука доедет сама");
  } finally {
    net.restore();
  }
});

test("VITE_API_BASE, совпавший с адресом страницы, — это тоже совмещённое развёртывание", () => {
  const same = makeBackend("http://localhost:5173", () => "http://localhost:5173");
  assert.equal(same.crossOrigin(), false, "домены не разошлись — и вести себя иначе не за что");
});

// ---------------------------------------------------------------------------
// 2. Разнесённое развёртывание
// ---------------------------------------------------------------------------

test("с VITE_API_BASE каждый адрес становится абсолютным", () => {
  const b = apart();
  assert.equal(b.crossOrigin(), true);
  assert.equal(b.apiUrl("/api/whatif"), "http://127.0.0.1:8010/api/whatif");
  assert.equal(b.wsUrl("/v1/realtime?mode=voice"), "ws://127.0.0.1:8010/v1/realtime?mode=voice");
});

test("схема сокета берётся у БЭКЕНДА, а не у страницы", () => {
  // Статика на http (объектное хранилище), бэкенд на https — законное
  // сочетание. `ws://` к защищённому шлюзу браузер не откроет, а `wss://` к
  // незащищённому не соединится: путать эти две схемы нельзя ни в какую сторону.
  const secure = makeBackend("https://api.example.com", () => "http://static.example.com");
  assert.equal(secure.wsUrl("/v1/realtime?mode=text"), "wss://api.example.com/v1/realtime?mode=text");
  const plain = makeBackend("http://api.example.com", () => "https://static.example.com");
  assert.equal(plain.wsUrl("/v1/realtime?mode=text"), "ws://api.example.com/v1/realtime?mode=text");
});

test("хвостовой слэш в VITE_API_BASE не даёт `//api`", () => {
  const b = makeBackend("https://api.example.com/", () => "https://ui.example.com");
  assert.equal(b.apiUrl("/api/health"), "https://api.example.com/api/health");
});

test("на чужой origin запросы идут с учётными данными", async () => {
  const net = recorder();
  try {
    await apart().apiFetch("/api/course/coach", { method: "POST" });
    assert.equal(net.calls[0].url, "http://127.0.0.1:8010/api/course/coach");
    assert.equal(net.calls[0].init.credentials, "include",
      "без этого браузер не пошлёт ни пароля, ни куки — закрытый стенд ответит 401 на всё");
    assert.equal(net.calls[0].init.method, "POST", "настройки вызывающего потерялись");
  } finally {
    net.restore();
  }
});

// ---------------------------------------------------------------------------
// 3. Билет на сокет
// ---------------------------------------------------------------------------

test("на чужом origin билет берётся с учётными данными и приезжает строкой", async () => {
  const net = recorder(() => ({ ok: true, json: async () => ({ ticket: "t-42" }) }));
  try {
    assert.equal(await apart().socketTicket(), "t-42");
    assert.equal(net.calls[0].url, "http://127.0.0.1:8010" + TICKET_PATH);
    assert.equal(net.calls[0].init.credentials, "include");
  } finally {
    net.restore();
  }
});

test("имя ручки билета — то же, что у гейтвея", () => {
  // Договор двух половин продукта. Разъедется — фронтенд будет брать билет там,
  // где его никто не выдаёт, и сокет молча закроется 4401 на закрытом стенде.
  assert.equal(TICKET_PATH, "/api/auth/ticket",
    "имя менять только вместе с `main.py::ws_ticket_handle`");
});

test("нет ручки билета — это не отказ, а `null`", async () => {
  // Гейтвей без пароля пропуска не спрашивает, а старый — про ручку не знает.
  // В обоих случаях сокет обязан открыться как открывался: отказать, если
  // откажут, — право сервера, а не наше.
  for (const reply of [
    () => ({ ok: false, json: async () => ({}) }),
    () => ({ ok: true, json: async () => ({}) }),
    // Замка на гейтвее нет: ручка отвечает «не требуется» и НЕ выдумывает
    // строку, которую сокет всё равно не спросит.
    () => ({ ok: true, json: async () => ({ required: false, ticket: null, expires_in: 0 }) }),
    () => { throw new Error("сети нет"); },
  ]) {
    const net = recorder(reply);
    try {
      assert.equal(await apart().socketTicket(), null);
    } finally {
      net.restore();
    }
  }
});

// ---------------------------------------------------------------------------
// 4. Второго места с адресом не существует
// ---------------------------------------------------------------------------

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

test("адрес бэкенда разрешается ровно в одном файле", () => {
  // ЗАЧЕМ ЭТО ЗДЕСЬ. Пятый файл с вписанным адресом — ровно то, от чего уходили:
  // он не сломает ни один экран на одном origin и молча промахнётся мимо
  // бэкенда на разных. Найти его глазами нельзя — там нет строки с адресом,
  // там относительный путь.
  const offenders: string[] = [];
  for (const file of walk(SRC)) {
    const rel = file.replace(SRC, "src");
    if (rel === "src/api/backend.ts") continue;
    const text = readFileSync(file, "utf8");
    text.split("\n").forEach((line, i) => {
      if (line.trimStart().startsWith("//") || line.trimStart().startsWith("*")) return;
      // Прямой `fetch` по нашей ручке — мимо `apiFetch`, то есть и мимо адреса,
      // и мимо учётных данных.
      if (/\bfetch\(\s*[`"']\/(api|v1)\//.test(line)) {
        offenders.push(`${rel}:${i + 1} — fetch мимо apiUrl/apiFetch`);
      }
      // Сборка адреса сокета из адреса страницы.
      if (/location\.(host|hostname|origin|protocol)/.test(line) && /\bwss?:|\/v1\//.test(line)) {
        offenders.push(`${rel}:${i + 1} — адрес сокета собирается из location`);
      }
    });
  }
  assert.deepEqual(offenders, [],
    "адрес бэкенда узнают в обход api/backend.ts:\n" + offenders.join("\n"));
});

test("VITE_API_BASE читает только api/backend.ts", () => {
  const readers = walk(SRC)
    .filter((f) => /VITE_API_BASE/.test(readFileSync(f, "utf8")))
    .map((f) => f.replace(SRC, "src"))
    .sort();
  assert.deepEqual(readers, ["src/api/backend.ts", "src/vite-env.d.ts"],
    "переменную читают в двух местах — они разойдутся");
});
