// _fresh.mjs — общее доказательство, что прибор измеряет ИМЕННО ЭТОТ код.
//
// ЧЕМ ПРИБОРЫ СОЛГАЛИ. `audit.mjs` эту проверку носил в себе — и не зря: на
// 127.0.0.1:5199 трое суток стоял забытый `python3 -m http.server` со сборкой
// от 25 августа, и обходчик исправно рапортовал «ноль находок» про код,
// которого в той сборке не было. Голосовые и медийные приборы такой защиты не
// имели вовсе: `rtvoice`, `bargein`, `mediacheck`, `reconnect` жёстко ходили на
// https://127.0.0.1:8443, где висел процесс, поднятый 25 августа и не знающий
// даже поля `build` в /api/health. Прогон сегодня отчитался бы об успехе,
// измерив четырёхдневный код.
//
// Отсюда правило: прибор, который не может ДОКАЗАТЬ свежесть того, что меряет,
// обязан отказаться от прогона. Молчаливый отчёт по чужому коду хуже
// отсутствующего — ему верят.
//
// Адрес шлюза берётся из DIALOG_HOST. Умолчание — локальный HTTPS-шлюз:
// голосовые и камерные слои требуют защищённого контекста, поэтому мерить их
// на http://127.0.0.1:8010 нельзя.
import { existsSync, readFileSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";

/** Публичный стенд — то, что видит жюри (docs/hosting.md). */
export const STAND = "https://185-154-194-88.nip.io";

/** Адрес шлюза: DIALOG_HOST, иначе умолчание прибора. Хвостовой слэш срезан —
 *  адреса здесь склеиваются вручную, и `//api/health` уходил в 404. */
export const hostOf = (fallback = "https://127.0.0.1:8443") =>
  (process.env.DIALOG_HOST ?? fallback).replace(/\/+$/, "");

export const HOST = hostOf();

// Пароль НЕ живёт в репозитории (ARCHITECTURE.md: секреты — в services/gateway/.env).
// Приборы берут его оттуда же, откуда его берёт сам гейтвей. Локальные запросы
// замок не проверяет, поэтому лишний заголовок ничему не мешает.
export const PASS = (() => {
  if (process.env.NEGO_HTTP_PASSWORD) return process.env.NEGO_HTTP_PASSWORD.trim();
  try {
    const env = readFileSync(new URL("../../services/gateway/.env", import.meta.url), "utf8");
    return (env.match(/^NEGO_HTTP_PASSWORD=(.*)$/m)?.[1] ?? "").trim();
  } catch {
    return "";
  }
})();

/**
 * GET через КОРНЕВЫЕ модули, а не через `fetch`.
 *
 * Две причины, обе стоили времени. Первая: локальный стенд стоит на
 * самоподписанном сертификате, и `fetch` на нём падает без права на
 * послабление. Вторая: в песочнице разработки исходящий HTTP идёт через прокси,
 * который отвечал 407 на публичный адрес — полдня это выглядело как «сайт
 * просит пароль и не принимает его» (см. remote.mjs и его --no-proxy-server).
 * `node:http(s)` не смотрит ни на прокси из окружения, ни на чужой корень.
 */
function get(url, { timeout = 15000 } = {}) {
  const u = new URL(url);
  const send = u.protocol === "https:" ? httpsRequest : httpRequest;
  const headers = {};
  if (PASS) headers.Authorization = "Basic " + Buffer.from(`dialog:${PASS}`).toString("base64");
  return new Promise((resolve, reject) => {
    const req = send(u, { headers, rejectUnauthorized: false, timeout }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString("utf8") }));
    });
    req.on("timeout", () => req.destroy(new Error(`нет ответа за ${timeout} мс`)));
    req.on("error", reject);
    req.end();
  });
}

const bundleOf = (html) => (html.match(/assets\/[A-Za-z0-9_.-]+\.js/) || [])[0] || null;

const refuse = (lines) => {
  console.error(lines.join("\n") + "\nПрогон отменён: отчёт относился бы не к этому коду.");
  process.exit(2);
};

/** Сколько упражнений лежит в зеркале курса НА ДИСКЕ. */
function exercisesOnDisk() {
  const mirror = new URL("../src/data/course.generated.ts", import.meta.url);
  let src;
  try {
    src = readFileSync(mirror, "utf8");
  } catch {
    return 0;
  }
  // Считаем ТОЛЬКО внутри COURSE_BANK: следом в том же файле лежит
  // COURSE_MASTER, и первая версия этой проверки посчитала его три упражнения
  // вместе с банком — 72 против 69, и прибор объявил свежий шлюз старым.
  // Ложная тревога стоит доверия к прибору дороже, чем пропущенная находка.
  const from = src.indexOf("export const COURSE_BANK");
  const to = src.indexOf("export const COURSE_MASTER");
  const bank = from >= 0 && to > from ? src.slice(from, to) : "";
  return (bank.match(/"id":\s*"[a-z]{2}-\d\d"/g) || []).length;
}

/**
 * Отдаёт ли `base` ту сборку фронтенда, что лежит в `frontend/dist`.
 *
 * `distPath` можно переопределить: `audit.mjs` гоняется против офлайн-сборки и
 * сверяется со своим каталогом.
 */
export async function assertBundle(base, distPath = new URL("../dist/index.html", import.meta.url)) {
  base = base.replace(/\/+$/, "");   // адреса склеиваются вручную: `//` уходил в 404
  if (!existsSync(distPath)) {
    console.error("НЕТ СБОРКИ: dist/index.html отсутствует. Сначала `npm run build`.");
    process.exit(2);
  }
  const want = bundleOf(readFileSync(distPath, "utf8"));
  let got = null;
  try {
    const res = await get(base + "/");
    if (res.status === 401) refuse([`СТЕНД ПРОСИТ ПАРОЛЬ на ${base}: NEGO_HTTP_PASSWORD не подошёл.`]);
    got = bundleOf(res.body);
  } catch (e) {
    console.error(`СЕРВЕР НЕ ОТВЕЧАЕТ на ${base}: ${e.message}`);
    process.exit(2);
  }
  if (!want || want !== got) {
    refuse([`ЧУЖАЯ СБОРКА на ${base}`, `  раздаётся: ${got}`, `  на диске:  ${want}`]);
  }
  console.log(`сборка сверена: ${want}`);
  return want;
}

/**
 * Отвечает ли шлюз на `base` кодом с диска.
 *
 * `optional` — для приборов, которым шлюз не обязателен (обходчик UI умеет
 * работать по офлайн-ядру). Для голосовых и медийных приборов шлюз — и есть
 * предмет замера, поэтому его отсутствие обязано валить прогон.
 */
export async function assertGateway(base, { optional = false } = {}) {
  base = base.replace(/\/+$/, "");
  let served;
  try {
    const res = await get(base + "/api/health");
    if (res.status === 401) refuse([`ШЛЮЗ ПРОСИТ ПАРОЛЬ на ${base}: NEGO_HTTP_PASSWORD не подошёл.`]);
    if (res.status >= 400) throw new Error(`HTTP ${res.status}`);
    served = JSON.parse(res.body).build;
  } catch (e) {
    if (optional) { console.log(`шлюза нет (${e.message}) — прогон по офлайн-ядру`); return null; }
    refuse([`ШЛЮЗ НЕ ОТВЕЧАЕТ на ${base}/api/health: ${e.message}`,
            "Этот прибор меряет ШЛЮЗ — без него мерить нечего."]);
  }
  if (!served) {
    refuse([`СТАРЫЙ ШЛЮЗ на ${base}: /api/health не знает про build.`,
            "Так отвечает процесс, поднятый до того, как отпечаток появился, —",
            "то есть заведомо не этот код. Перезапустите гейтвей (docs/hosting.md)."]);
  }
  const onDisk = exercisesOnDisk();
  if (onDisk && served.exercises !== onDisk) {
    refuse([`СТАРЫЙ ШЛЮЗ на ${base}`,
            `  отвечает про ${served.exercises} упражнений`,
            `  на диске их ${onDisk}`]);
  }
  console.log(`шлюз сверен: упражнений ${served.exercises}`);
  return served;
}

/** Обе сверки разом — то, что зовут почти все приборы. */
export async function assertFresh(base = HOST, { bundle = true, gatewayOptional = false } = {}) {
  if (bundle) await assertBundle(base);
  await assertGateway(base, { optional: gatewayOptional });
  return base;
}
