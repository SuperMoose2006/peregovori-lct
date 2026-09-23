// realtime-session.ts — WebSocket-клиент realtime-протокола.
//
// ╔══════════════════════════════════════════════════════════════════════════╗
// ║ ПОРТ UPSTREAM-КОДА                                                       ║
// ║ Источник: MiniCPM-o-Demo, Apache-2.0                                     ║
// ║ Коммит:   50b0865c819c2f0ca24ec7994e05044e5f39d451                       ║
// ║ Файл:     static/duplex/lib/realtime-session.js (627 стр.)               ║
// ║ Полный провенанс: docs/upstream-code-map.md                              ║
// ╚══════════════════════════════════════════════════════════════════════════╝
//
// ЧТО ВЗЯТО. Жизненный цикл целиком: ожидание `session.queue_done` перед
// `session.init`, разрешение промиса на `session.created`, разведение
// «стартового» и «рабочего» обработчиков сообщений, лог протокола, аккуратный
// `cleanup()`, из которого нельзя выйти в полурабочем состоянии.
//
// ЧТО ИЗМЕНЕНО.
//   • JS → TS, события — наши (`turn.analysis`, `engine.state`, `debrief`…).
//   • Выброшена совместимость со старым протоколом MiniCPM (ветки `result`,
//     `stopped`, `queued`): у нас нет их истории, а мёртвые ветки врут о том,
//     какие события бывают.
//   • Добавлено переподключение с восстановлением партии — у оригинала сессия
//     живёт в GPU-воркере и переподключиться к ней нельзя, а у нас состояние
//     игры лежит в движке и переживает обрыв сокета.
//   • Адрес сокета больше не собирается здесь из `location.host`: его выдаёт
//     `api/backend.ts` — единственное место, знающее, где живёт бэкенд. У них
//     фронтенд и сервер неразделимы по построению, у нас статику можно выложить
//     отдельно, и второе место с адресом разошлось бы с первым.
//
// ПОЧЕМУ ЛОГ ПРОТОКОЛА ОСТАЛСЯ. Он у них есть, и он оказался незаменим при
// отладке перебивания: без ленты событий «звук идёт после отмены» отлаживается
// гаданием. Стоит он один массив на двести записей.

// ЧТО ДОБАВЛЕНО НАМИ. Политика переподключения берётся из lib/net.ts, а не
// пишется числами здесь: раньше она существовала дважды и разошлась — тесты
// проверяли три попытки с базой 500 мс, работали четыре с базой 400.
import { canReconnect, reconnectDelay, GEN_TIMEOUT_MS } from "../../lib/net";
import { socketTicket, wsUrl } from "../../api/backend";

export type ServerEvent = Record<string, unknown> & { type: string };

export interface ProtocolEntry {
  ts: number;
  dir: "client" | "server";
  type: string;
  summary: string;
}

export interface SessionInitPayload {
  /** Вернуться в брошенную партию. Ставится автоматически при переподключении. */
  resume?: string;
  scenarioId?: string;
  lang?: "ru" | "en";
  /** Режим на проводе, не режим экрана: `drill` — капстоун курса.
   *  Зеркало `app/protocol.py::Mode` и `src/types.ts::Mode`. */
  gameMode?: "practice" | "campaign" | "custom" | "exam" | "drill";
  situation?: string | null;
  reputation?: number | null;
  layers?: Record<string, boolean>;
  /** ISO-дата «стола дня». Дату шлёт КЛИЕНТ: часовой пояс знает браузер, а
   *  сервер по своему UTC выдал бы игроку на востоке вчерашний стол. */
  daily?: string | null;
}

export interface RealtimeSessionOptions {
  mode?: "text" | "voice";
  /** Адрес сокета. СТРОКА ИЛИ ФУНКЦИЯ, и это не удобство: на разнесённом
   *  развёртывании в адрес входит короткоживущий билет, а переподключение
   *  случается когда угодно позже. Строка, вычисленная в конструкторе, к тому
   *  моменту протухла бы — и обрыв в середине партии стал бы отказом. */
  url?: string | (() => string | Promise<string>);
  onEvent: (event: ServerEvent) => void;
  onStatus?: (status: ConnectionStatus) => void;
  onProtocol?: (entry: ProtocolEntry) => void;
  onResume?: (created: ServerEvent) => void;
}

export type ConnectionStatus = "idle" | "connecting" | "online" | "reconnecting" | "lost";

const OPEN_TIMEOUT_MS = 4000;
export const HANDSHAKE_TIMEOUT_MS = GEN_TIMEOUT_MS + 5000;
const MAX_LOG = 200;

/**
 * Коды закрытия, после которых возвращаться НЕЛЬЗЯ.
 *
 * Обычный обрыв (1006 «связь пропала», 1001 «вкладка ушла») значит «вернись» —
 * на нём и держится `resume`. Эти три значат «сервер отказал по существу»:
 *
 *   4401 — назовите пароль;
 *   4409 — партию забрал другой сокет (вторая вкладка, второе устройство);
 *   4429 — с этого адреса уже слишком много партий.
 *
 * ЧЕМ ПЛОХО БЫЛО БЕЗ НИХ. Клиент отличал только «оборвалось» и шёл
 * переподключаться с `resume`. На 4409 это буквально война двух вкладок: каждая
 * вытесняет другую и обе получают отказ. На 4429 — три попытки вместо одного
 * отказа, ровно в тот момент, когда сервер и так просил не давить.
 */
const NO_RETURN_CLOSE_CODES = new Set([4401, 4409, 4429]);

export class RealtimeSession {
  private ws: WebSocket | null = null;
  private readonly mode: "text" | "voice";
  private readonly resolveUrl: () => string | Promise<string>;
  private readonly onEvent: (event: ServerEvent) => void;
  private readonly onStatus?: (status: ConnectionStatus) => void;
  private readonly onProtocol?: (entry: ProtocolEntry) => void;
  private readonly onResume?: (created: ServerEvent) => void;
  private epoch = 0;
  private abortPending: (() => void) | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  private log: ProtocolEntry[] = [];
  private started = false;
  private closing = false;
  private initPayload: SessionInitPayload | null = null;
  private attempt = 0;

  sessionId = "";
  capabilities: Record<string, unknown> = {};

  constructor(options: RealtimeSessionOptions) {
    this.mode = options.mode ?? "text";
    const url = options.url;
    this.resolveUrl = typeof url === "function" ? url
      : url ? () => url
      : () => defaultUrl(this.mode);
    this.onEvent = options.onEvent;
    this.onStatus = options.onStatus;
    this.onProtocol = options.onProtocol;
    this.onResume = options.onResume;
  }

  get running(): boolean {
    return this.started;
  }

  get protocolLog(): ProtocolEntry[] {
    return this.log;
  }

  /** Открыть сокет и довести партию до `session.created`. */
  async start(payload: SessionInitPayload): Promise<ServerEvent> {
    const epoch = ++this.epoch;
    this.abortPending?.();
    this.closeSocket();
    this.initPayload = { ...payload, resume: undefined };
    this.closing = false;
    this.started = false;
    this.onStatus?.(payload.resume ? "reconnecting" : "connecting");
    const { socket, created } = await this.openAndInitialize(payload, epoch);
    if (this.closing || epoch !== this.epoch) throw new Error("Session cancelled");
    this.sessionId = String(created.session_id ?? "");
    this.capabilities = (created.capabilities as Record<string, unknown>) ?? {};
    this.started = true;
    this.attempt = 0;
    socket.onmessage = (e) => {
      if (epoch !== this.epoch || this.closing) return;
      try { this.handle(JSON.parse(e.data as string) as ServerEvent); }
      catch { this.handleClose(); }
    };
    socket.onclose = (event) => {
      if (epoch === this.epoch) this.handleClose(event);
    };
    this.onStatus?.("online");
    if (payload.resume) this.onResume?.(created);
    return created;
  }

  // -- отправка ------------------------------------------------------------

  /** Текстовый ход: накопить и сразу закрыть — клавиатура не делает пауз. */
  sendText(text: string): boolean {
    if (!this.started || this.closing) return false;
    return this.send({ type: "input.append", input: { text } }) && this.send({ type: "input.commit" });
  }

  /** Кусок звука с микрофона. Конец хода определит сервер. */
  sendAudio(base64: string, frame?: string | null, change?: number): boolean {
    if (!this.started || this.closing) return false;
    const input: Record<string, unknown> = { audio: base64 };
    if (frame) {
      input.video_frames = [frame];
      if (change !== undefined) input.frame_change = change;
    }
    return this.send({ type: "input.append", input }, /* quiet */ true);
  }

  /**
   * Кадр без звука. Нужен, когда включена ОДНА камера: кадры ездили прицепом
   * к звуковым чанкам, поэтому без микрофона на сервер не уходило ничего —
   * слой камеры рисовал окно и молча не работал.
   */
  /** `change` — доля изменившихся пикселей относительно прошлого кадра (0..1).
   *  Считает браузер: кадр уже нарисован в canvas, поэтому это бесплатно, а
   *  сервер по сжатому JPEG честной разницы получить не может. */
  sendFrame(frame: string, change?: number): boolean {
    if (!this.started || this.closing) return false;
    return this.send({ type: "input.append",
                input: { video_frames: [frame], frame_change: change } },
              /* quiet */ true);
  }

  /** Явное «я закончил» — когда человек не хочет ждать детектора конца хода. */
  commit(): void {
    this.send({ type: "input.commit" });
  }

  /** Перебивание с кнопки. Голосовое перебивание сервер замечает сам. */
  cancel(): void {
    this.send({ type: "response.cancel" });
  }

  requestHint(): boolean {
    if (!this.started || this.closing) return false;
    return this.send({ type: "coach.request" });
  }

  stop(reason = "user_stop"): void {
    this.closing = true;
    this.epoch += 1;
    this.abortPending?.();
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.send({ type: "session.close", reason });
    this.cleanup();
  }

  // -- внутреннее ----------------------------------------------------------

  private send(message: Record<string, unknown>, quiet = false): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
    try { this.ws.send(JSON.stringify(message)); }
    catch { return false; }
    if (!quiet) this.record("client", String(message.type), "");
    return true;
  }

  /** One cancellable lifetime covers URL resolution, opening and session init. */
  private openAndInitialize(payload: SessionInitPayload, epoch: number): Promise<{ socket: WebSocket; created: ServerEvent }> {
    return new Promise((resolve, reject) => {
      let settled = false;
      let socket: WebSocket | null = null;
      let initTimer: ReturnType<typeof setTimeout> | undefined;
      const en = payload.lang === "en";
      let timer = setTimeout(() => fail(en ? "Connection timed out" : "Время подключения истекло"), OPEN_TIMEOUT_MS);
      const finish = () => {
        settled = true;
        clearTimeout(timer);
        clearTimeout(initTimer);
        if (this.abortPending === abort) this.abortPending = null;
      };
      const fail = (message: string) => {
        if (settled) return;
        finish();
        if (socket) {
          socket.onopen = socket.onmessage = socket.onerror = socket.onclose = null;
          try { socket.close(); } catch { /* already closed */ }
          if (this.ws === socket) this.ws = null;
        }
        reject(new Error(message));
      };
      const abort = () => fail(en ? "Session cancelled" : "Запуск партии отменён");
      this.abortPending = abort;
      Promise.resolve().then(() => this.resolveUrl()).then((url) => {
        if (settled || epoch !== this.epoch || this.closing) { abort(); return; }
        socket = new WebSocket(url);
        this.ws = socket;
        let sent = false;
        const sendInit = () => {
          if (settled || sent || !socket || socket.readyState !== WebSocket.OPEN) return;
          sent = true;
          try { socket.send(JSON.stringify({ type: "session.init", payload })); }
          catch { fail(en ? "Connection closed" : "Соединение закрыто"); return; }
          this.record("client", "session.init", String(payload.scenarioId ?? ""));
        };
        socket.onopen = () => {
          clearTimeout(timer);
          timer = setTimeout(() => fail(en ? "The game did not start in time" : "Не удалось вовремя начать партию"), HANDSHAKE_TIMEOUT_MS);
          initTimer = setTimeout(sendInit, 150);
        };
        socket.onerror = () => fail(en ? "WebSocket unavailable" : "WebSocket недоступен");
        socket.onclose = () => fail(en ? "Connection closed before the game started" : "Соединение закрыто до начала партии");
        socket.onmessage = (e) => {
          if (settled) return;
          try {
            const message = JSON.parse(e.data as string) as ServerEvent;
            this.record("server", message.type, "");
            if (message.type === "session.queue_done") sendInit();
            else if (message.type === "session.created") {
              finish();
              resolve({ socket: socket!, created: message });
            } else if (message.type === "error") {
              fail(String((message.error as { message?: string })?.message ?? (en ? "Could not start the game" : "Не удалось начать партию")));
            } else if (message.type === "session.closed") {
              fail(en ? "The session was closed" : "Сессия закрыта");
            } else this.onEvent(message);
          } catch { fail(en ? "Invalid server response" : "Некорректный ответ сервера"); }
        };
      }).catch((error) => fail(String((error as Error).message)));
    });
  }

  private handle(message: ServerEvent): void {
    this.record("server", message.type, summarize(message));
    this.onEvent(message);
  }

  /**
   * Обрыв связи. Партия при этом ЖИВА: состояние игры держит движок на сервере,
   * а не сокет. Поэтому переподключаемся и продолжаем, а не начинаем заново.
   */
  private handleClose(event?: { code?: number }): void {
    this.closeSocket();
    this.started = false;
    if (this.closing || !this.initPayload) {
      this.onStatus?.("idle");
      return;
    }
    if (event && NO_RETURN_CLOSE_CODES.has(Number(event.code))) {
      // Отказ по существу. Причину сервер уже прислал отдельным событием
      // (`session.closed {reason}` или `error`), поэтому здесь остаётся только
      // не делать хуже: не возвращаться и честно сказать, что связи больше нет.
      this.closing = true;
      this.onStatus?.("lost");
      return;
    }
    this.attempt += 1;
    // Политика переподключения живёт в lib/net.ts и покрыта тестами —
    // здесь она раньше дублировалась вписанными числами и разошлась с ними.
    if (!canReconnect(this.attempt)) {
      this.onStatus?.("lost");
      return;
    }
    this.onStatus?.("reconnecting");
    const delay = reconnectDelay(this.attempt);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    const epoch = this.epoch;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.closing || epoch !== this.epoch || !this.initPayload) return;
      // Возвращаемся в ТУ ЖЕ партию, а не начинаем новую. Без `resume` человек
      // после обрыва молча терял всё, что наговорил, — и это было бы хуже,
      // чем не переподключаться вовсе.
      void this.start({ ...this.initPayload, resume: this.sessionId || undefined })
        .catch(() => { if (!this.closing && this.epoch === epoch + 1) this.handleClose(); });
    }, delay);
  }

  private closeSocket(): void {
    const socket = this.ws;
    this.ws = null;
    if (!socket) return;
    socket.onopen = socket.onclose = socket.onerror = socket.onmessage = null;
    try { socket.close(); } catch { /* already closed */ }
  }

  private cleanup(): void {
    this.started = false;
    this.closeSocket();
    this.onStatus?.("idle");
  }

  private record(dir: "client" | "server", type: string, summary: string): void {
    const entry: ProtocolEntry = { ts: Date.now(), dir, type, summary };
    this.log.push(entry);
    if (this.log.length > MAX_LOG) this.log.shift();
    this.onProtocol?.(entry);
  }
}

/**
 * Адрес нашей ручки. Хост и схему даёт `api/backend.ts`, здесь остаётся путь.
 *
 * Билет приезжает параметром адреса, потому что заголовок при рукопожатии
 * сокета браузер слать не умеет, а кука `dlg_ok` (samesite=lax) на чужой домен
 * не поедет. На своём origin `socketTicket()` возвращает `null` без единого
 * запроса — строка получается ровно та же, что была.
 */
async function defaultUrl(mode: string): Promise<string> {
  const ticket = await socketTicket();
  const query = ticket
    ? `mode=${mode}&ticket=${encodeURIComponent(ticket)}`
    : `mode=${mode}`;
  return wsUrl(`/v1/realtime?${query}`);
}

function summarize(message: ServerEvent): string {
  if (message.type === "response.output.delta") {
    const kind = String(message.kind ?? "");
    return kind === "text" ? `text "${String(message.text ?? "").slice(0, 24)}"` : kind;
  }
  if (message.type === "engine.state") return `реакция ${String(message.reaction ?? "")}`;
  if (message.type === "generation.cancelled") return String(message.reason ?? "");
  return "";
}
