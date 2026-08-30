// backend.ts — ЕДИНСТВЕННОЕ место, где решается, ГДЕ живёт бэкенд.
//
// ЧТО БЫЛО. Четыре файла ходили относительными путями (`fetch("/api/health")`,
// `/api/whatif`, `/api/course/coach`, `/api/campaigns`), а пятый собирал адрес
// сокета из `location.host`. Ни одной строки с адресом в них не было — и именно
// поэтому сборка МОЛЧА предполагала, что бэкенд стоит на том же происхождении.
// Выложить `dist` на статический хостинг было нельзя: продукт открывался, проба
// `/api/health` уходила в пустоту, и он выглядел работающим — офлайн-ядром.
//
// ЧТО ЗДЕСЬ. Один переключатель — `VITE_API_BASE`, вписываемый НА СБОРКЕ:
//
//   пусто/нет   → адреса остаются относительными, поведение ровно сегодняшнее
//                 (совмещённое развёртывание: гейтвей сам раздаёт статику);
//   абсолютный  → `https://api.example.com` для HTTP и `wss://api.example.com`
//   origin        для сокета (`http→ws`, `https→wss`).
//
// ПОЧЕМУ ОДНО МЕСТО, А НЕ «ПОДСТАВИТЬ АДРЕС В КАЖДЫЙ FETCH». Разъезд доменов
// меняет не только строку: браузер перестаёт слать учётные данные без
// `credentials: "include"`, а куку `dlg_ok` (samesite=lax) не отправляет на
// чужой домен вовсе — и сокет остаётся без пропуска при полностью рабочем HTTP.
// Три решения обязаны приниматься вместе и один раз: второй файл, «который тоже
// знает адрес», разойдётся с первым ровно на том, чего не видно на одном origin.
//
// ПОЧЕМУ ФАБРИКА, А НЕ ПРОСТО ЭКСПОРТИРОВАННЫЕ ФУНКЦИИ. `import.meta.env` и
// `location` подделать снаружи модуля нельзя — у каждого модуля свой
// `import.meta`. Значит, проверить главное («на РАЗНЫХ origin ведёт себя иначе,
// на одном — ровно как раньше») было бы нечем, а это самая опасная развилка в
// продукте: одинаково выглядит и когда права, и когда врёт. Поэтому вся логика
// живёт в чистой фабрике, которой origin передают, а модуль держит один
// экземпляр — тот, что склеен из настоящих `import.meta.env` и `location`.
//
// ИНВАРИАНТ 5 ЭТИМ НЕ ЗАДЕТ: ни одного нового запроса в игровом пути нет, а
// отказ обрабатывается как раньше — не ответил бэкенд, играем офлайн-ядром.

/** Сколько ждём билет на сокет. Зависший запрос — не «ещё думаем», а тот же
 *  отказ, только молчаливый: без срока партия не начиналась бы вовсе, потому
 *  что до открытия сокета дело не доходит. */
const TICKET_TIMEOUT_MS = 3000;

/** Ручка билета. Имя и форма ответа — договор с гейтвеем (`main.py::
 *  ws_ticket_handle`), менять только вместе с ним. Отвечает
 *  `{required, ticket, expires_in}`: `required:false` значит «замка нет,
 *  пропуск не нужен» — и это НЕ отказ. */
export const TICKET_PATH = "/api/auth/ticket";

export interface Backend {
  /** Бэкенд на другом происхождении? Всё, что ниже отличается от «как
   *  сегодня», отличается ТОЛЬКО когда здесь `true`. */
  crossOrigin(): boolean;
  /** Абсолютный адрес ручки — или тот же относительный путь, если не вынесен. */
  apiUrl(path: string): string;
  /** Абсолютный адрес сокета: `http→ws`, `https→wss`. */
  wsUrl(path: string): string;
  /** `fetch` с разрешённым адресом и учётными данными там, где они нужны. */
  apiFetch(path: string, init?: RequestInit): Promise<Response>;
  /** Короткоживущий пропуск к сокету — или `null`, если он не нужен/не выдан. */
  socketTicket(): Promise<string | null>;
}

/** `http→ws`, `https→wss`. Схема сокета берётся у того, к КОМУ идём: статика на
 *  http и бэкенд на https — законное сочетание, а `ws://` к защищённому шлюзу
 *  браузер не откроет. */
function wsScheme(url: string): string {
  if (url.startsWith("https:")) return "wss:" + url.slice("https:".length);
  if (url.startsWith("http:")) return "ws:" + url.slice("http:".length);
  return url; // уже ws:// или wss:// — оставляем как написано
}

/**
 * Разрешение адресов для заданного `base` и заданного происхождения страницы.
 *
 * @param base абсолютный origin бэкенда или пустая строка («там же, где мы»)
 * @param pageOrigin происхождение страницы; пустое — среды без `location`
 */
export function makeBackend(base: string, pageOrigin: () => string): Backend {
  // Хвостовые слэши срезаны один раз здесь: пути ниже склеиваются вручную, и
  // `//api/health` уходит в 404.
  const BASE = base.trim().replace(/\/+$/, "");

  const crossOrigin = (): boolean => {
    if (!BASE) return false;
    const page = pageOrigin();
    // `VITE_API_BASE`, совпавший с адресом страницы, — то же самое
    // развёртывание. Вести себя на нём иначе значило бы врать.
    if (!page) return true;
    try {
      return new URL(BASE, page).origin !== page;
    } catch {
      return false;
    }
  };

  const apiUrl = (path: string): string => (BASE ? BASE + path : path);

  const wsUrl = (path: string): string => wsScheme(BASE || pageOrigin()) + path;

  const apiFetch = (path: string, init: RequestInit = {}): Promise<Response> =>
    // На своём origin `credentials` НЕ ставится: умолчание `same-origin` уже
    // шлёт что надо, а явное `include` меняло бы поведение там, где менять
    // нечего. На чужом — без него не поедет ни пароль, ни кука, и закрытый
    // паролем стенд ответит 401 на всё.
    fetch(apiUrl(path), crossOrigin() ? { ...init, credentials: "include" } : init);

  const socketTicket = async (): Promise<string | null> => {
    if (!crossOrigin()) return null;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TICKET_TIMEOUT_MS);
    try {
      const res = await apiFetch(TICKET_PATH, { signal: ctrl.signal });
      if (!res.ok) return null;
      const data = (await res.json()) as { ticket?: unknown };
      return data && typeof data.ticket === "string" && data.ticket ? data.ticket : null;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  };

  return { crossOrigin, apiUrl, wsUrl, apiFetch, socketTicket };
}

/** Происхождение страницы. `location.origin` есть не везде — в тестах браузер
 *  подделан минимально, там только `protocol` и `host`, — поэтому собираем. */
function currentOrigin(): string {
  if (typeof location === "undefined") return "";
  return location.origin || `${location.protocol}//${location.host}`;
}

/**
 * Тот самый экземпляр. `?.` не украшение: `import.meta.env` существует только
 * под Vite, а этот модуль импортируют тесты под голым Node — без него они
 * падали бы на импорте.
 */
const backend = makeBackend(String(import.meta.env?.VITE_API_BASE ?? ""), currentOrigin);

export const crossOrigin = (): boolean => backend.crossOrigin();
export const apiUrl = (path: string): string => backend.apiUrl(path);
export const wsUrl = (path: string): string => backend.wsUrl(path);
export const apiFetch = (path: string, init?: RequestInit): Promise<Response> =>
  backend.apiFetch(path, init);
export const socketTicket = (): Promise<string | null> => backend.socketTicket();
