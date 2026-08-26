// transport.ts — новый realtime-путь под существующим интерфейсом транспорта.
//
// ПОЧЕМУ АДАПТЕР, А НЕ ПЕРЕПИСАННЫЕ ЭКРАНЫ. Кампания, экзамен, разбор,
// «что-если», XP и достижения написаны против `ServerMsg` и работают. Менять их
// одновременно с транспортом значило бы отлаживать две новые вещи сразу, не
// имея ни одной опорной. Здесь новый протокол переводится в старый словарь —
// экраны продолжают работать в первый же день, — а всё, чего в старом словаре
// нет (звук, лицо, зрение, лента протокола), выходит отдельными колбэками.
//
// ЧТО ИЗ ЭТОГО СЛЕДУЕТ ХОРОШЕГО. Слой `probe` («читай лицо») становится
// НАСТОЯЩИМ и на живом сервере. Раньше вопрос про реакцию оппонента умел
// задавать только мок, потому что реакция не доезжала до клиента. Теперь она
// приходит в `engine.state.reaction`, и `lib/probe.ts` строит вопрос из
// подлинного ответа движка — офлайн и онлайн одинаково.

import type { Analysis, ClientMsg, Deltas, ScenarioView, StateView } from "../types";
import type { ConnStatus, ServerMsgHandler, Transport } from "../api/transport";
import { buildProbe, shouldProbe } from "../lib/probe";
import { AudioPlayer } from "./vendor/audio-player";
import { MediaProvider, toBase64 } from "./vendor/media-provider";
import {
  RealtimeSession,
  type ConnectionStatus,
  type ProtocolEntry,
  type ServerEvent,
  type SessionInitPayload,
} from "./vendor/realtime-session";

/** Всё, чего нет в старом словаре `ServerMsg`. Экраны берут по мере готовности. */
export interface RealtimeExtras {
  /** Состояние лица оппонента (из реакции движка). */
  onAvatar?: (state: string, reaction: string | null, lipsync: boolean) => void;
  /** Наблюдение камеры. НИКОГДА не влияет на оценку — плашка едет в событии. */
  onObservation?: (text: string) => void;
  /** Расшифровка речи игрока. */
  onTranscript?: (text: string, final: boolean) => void;
  /** Игрок заговорил / замолчал (по VAD сервера). */
  onSpeech?: (speaking: boolean) => void;
  /** Говорит ли ОППОНЕНТ — по собственному звуку клиента, а не по слою аватара.
   *  Раньше это состояние приходило только из `avatar.state`, поэтому в режиме
   *  «только голос» кнопка перебивания не появлялась вовсе: слой аватара выключен
   *  → событий нет → клиент считает, что оппонент молчит, хотя он звучит. */
  onOppAudio?: (speaking: boolean) => void;
  /** Что умеет эта сессия — из `session.created`. */
  onCapabilities?: (capabilities: Record<string, unknown>) => void;
  /** Лента протокола: незаменима при отладке перебивания. */
  onProtocol?: (entry: ProtocolEntry) => void;
}

export interface RealtimeTransportOptions extends RealtimeExtras {
  // Микрофона и камеры здесь НЕТ намеренно. Слои выбираются на экране
  // подготовки и приезжают в сообщении `start`, то есть уже после того, как
  // транспорт создан. Читать их из опций конструктора значило бы читать
  // состояние на такт раньше, чем оно установлено, — и микрофон включался бы
  // с опозданием на одну партию.
  /* ССЫЛКИ, А НЕ ЭЛЕМЕНТЫ. Раньше сюда клали `ref.current`, и значение читалось
     в момент создания транспорта — то есть ДО того, как смонтируется панель с
     <video>. Запоминался null, поток камеры привязывать было не к чему, кадры
     не снимались, и слой камеры молча ничего не делал. Разрешаем ссылку в
     момент запуска камеры, когда элемент уже на месте. */
  videoEl?: { current: HTMLVideoElement | null } | null;
  canvasEl?: { current: HTMLCanvasElement | null } | null;
}

export class RealtimeTransport implements Transport {
  private readonly emit: ServerMsgHandler;
  private readonly onConn: (status: ConnStatus) => void;
  private readonly options: RealtimeTransportOptions;

  private session: RealtimeSession | null = null;
  private player: AudioPlayer | null = null;
  private media: MediaProvider | null = null;

  // Накопитель хода: старый `opponent` требует analysis+deltas+state разом,
  // новый протокол присылает их по частям и раньше реплики. Копим здесь.
  private pendingAnalysis: Analysis | null = null;
  private pendingDeltas: Deltas | null = null;
  private pendingState: StateView | null = null;
  private pendingCoach: { text: string; techniques?: string[]; reject?: boolean } | null = null;
  private lastReaction: string | null = null;
  private turnCounter = 0;
  private probeEnabled = false;
  private voiceWanted = false;
  private cameraWanted = false;
  private closed = false;

  constructor(onMessage: ServerMsgHandler, onConn: (status: ConnStatus) => void,
              options: RealtimeTransportOptions = {}) {
    this.emit = onMessage;
    this.onConn = onConn;
    this.options = options;
  }

  send(message: ClientMsg): void {
    if (this.closed) return;
    switch (message.type) {
      case "start":
        void this.begin(message);
        break;
      case "turn":
        this.session?.sendText(message.text);
        break;
      case "hint":
        this.session?.requestHint();
        break;
    }
  }

  /** Уровень входа 0..1 для полоски «вас слышно». Ноль, если микрофона нет. */
  micLevel(): number {
    return this.media?.level() ?? 0;
  }

  /** Перебивание с кнопки. Голосовое сервер замечает сам, через VAD. */
  interrupt(): void {
    this.player?.stopAll();
    this.session?.cancel();
  }

  close(): void {
    this.closed = true;
    this.session?.stop();
    this.session = null;
    void this.media?.stop();
    this.media = null;
    void this.player?.dispose();
    this.player = null;
  }

  // -- запуск партии -------------------------------------------------------

  private async begin(message: Extract<ClientMsg, { type: "start" }>): Promise<void> {
    const layers = { ...(message.layers ?? {}) } as Record<string, boolean>;
    this.probeEnabled = !!layers.probe;
    this.voiceWanted = !!layers.voice;
    this.cameraWanted = !!layers.camera;

    const payload: SessionInitPayload = {
      scenarioId: message.scenarioId,
      lang: message.lang,
      gameMode: message.mode,
      situation: message.situation ?? null,
      reputation: message.reputation ?? null,
      layers,
    };

    this.session = new RealtimeSession({
      mode: this.voiceWanted ? "voice" : "text",
      onEvent: (event) => this.route(event),
      onStatus: (status) => this.onConn(mapStatus(status)),
      onProtocol: this.options.onProtocol,
    });

    try {
      const created = await this.session.start(payload);
      this.options.onCapabilities?.(this.session.capabilities);
      this.emit({
        type: "greeting",
        sessionId: String(created.session_id ?? ""),
        scenario: created.scenario as ScenarioView,
        state: created.state as StateView,
        text: String(created.greeting ?? ""),
        judge_active: Boolean((created.capabilities as Record<string, unknown>)?.judge),
      });
      // Камера — самостоятельный слой: без этого условия она включалась
      // только заодно с голосом, а сама по себе молча не работала.
      if (this.voiceWanted || this.cameraWanted) await this.startMedia();
    } catch (error) {
      this.emit({ type: "error", message: (error as Error).message });
      this.onConn("lost");
    }
  }

  /**
   * Голос поднимается ПОСЛЕ `session.created` намеренно.
   *
   * Если микрофон не дали, партия уже идёт и играется текстом — вместо
   * пустого экрана человек видит ошибку и продолжает. Обратный порядок сделал
   * бы отказ в микрофоне отказом в игре.
   */
  private async startMedia(): Promise<void> {
    if (this.voiceWanted) {
      this.player = new AudioPlayer({ outputSampleRate: 24000 });
      this.player.init();
    }

    if (!MediaProvider.supported()) {
      if (this.voiceWanted) this.emit({ type: "layer_failed", layer: "voice", reason: "нужен https или localhost" });
      if (this.cameraWanted) this.emit({ type: "layer_failed", layer: "camera", reason: "нужен https или localhost" });
      return;
    }
    this.media = new MediaProvider({
      video: this.options.videoEl?.current ?? undefined,
      canvas: this.options.canvasEl?.current ?? undefined,
      videoRef: this.options.videoEl ?? null,
      canvasRef: this.options.canvasEl ?? null,
    });
    this.media.onChunk = ({ audio, frame }) => {
      this.session?.sendAudio(toBase64(audio.buffer), frame);
    };
    this.media.onFrame = (frame) => { this.session?.sendFrame(frame); };
    // `start` больше не бросает на отказ устройства: отказ — это ответ
    // пользователя, а не сбой. Он возвращает отчёт по каждому слою, и каждый
    // невставший слой называется на экране поимённо.
    const report = await this.media.start({ camera: this.cameraWanted, mic: this.voiceWanted });
    if (this.voiceWanted && report.mic !== "ok")
      this.emit({ type: "layer_failed", layer: "voice", reason: String(report.mic) });
    if (this.cameraWanted && report.camera !== "ok")
      this.emit({ type: "layer_failed", layer: "camera", reason: String(report.camera) });
    // Провайдер выбрасывается, только если не встало НИЧЕГО: пока жив хоть один
    // слой, он держит его поток — и обязан дожить до `stop()`, иначе дорожка
    // останется гореть.
    if (report.mic !== "ok" && report.camera !== "ok") {
      await this.media.stop().catch(() => { /* нечего гасить */ });
      this.media = null;
    }
  }

  // -- «оппонент звучит» ----------------------------------------------------

  private oppAudio = false;
  private drainTimer: ReturnType<typeof setInterval> | null = null;

  private markOppAudio(on: boolean): void {
    if (this.oppAudio === on) return;
    this.oppAudio = on;
    this.options.onOppAudio?.(on);
    if (!on && this.drainTimer) { clearInterval(this.drainTimer); this.drainTimer = null; }
  }

  /** `response.done` значит «модель дописала», а звук играет секундами дольше —
   *  поэтому конец речи ловим по опустевшему проигрывателю, а не по событию. */
  private watchDrain(): void {
    if (this.drainTimer) return;
    let quiet = 0;
    this.drainTimer = setInterval(() => {
      if (this.player?.isPlaying) { quiet = 0; return; }
      if (++quiet >= 2) this.markOppAudio(false);   // 2 × 200 мс тишины
    }, 200);
  }

  // -- перевод событий -----------------------------------------------------

  private route(event: ServerEvent): void {
    switch (event.type) {
      case "turn.analysis":
        this.pendingAnalysis = event.analysis as Analysis;
        return;

      case "engine.state": {
        this.pendingState = event.state as StateView;
        this.pendingDeltas = event.deltas as Deltas;
        this.lastReaction = (event.reaction as string) ?? null;
        this.turnCounter = Number(event.turn_id ?? this.turnCounter + 1);
        return;
      }

      case "judge.started":
        this.emit({ type: "phase", phase: "judging" });
        return;

      case "judge.completed":
        this.emit({ type: "phase", phase: "replying" });
        return;

      case "turn.coach":
        if (event.kind === "hint") {
          this.emit({ type: "hint", text: String(event.text ?? ""),
                      line: event.line ? String(event.line) : undefined });
        } else {
          this.pendingCoach = {
            text: String(event.text ?? ""),
            techniques: (event.techniques as string[]) ?? undefined,
            reject: Boolean(event.reject),
          };
        }
        return;

      case "response.output.delta": {
        const kind = String(event.kind ?? "");
        if (kind === "text") {
          this.player?.beginTurn();
          this.emit({ type: "opponent_delta", chunk: String(event.text ?? "") });
        } else if (kind === "audio") {
          this.player?.playChunk(String(event.audio ?? ""));
          this.markOppAudio(true);
        } else if (kind === "transcript") {
          this.options.onTranscript?.(String(event.text ?? ""), Boolean(event.final));
        }
        return;
      }

      case "response.done":
        this.player?.endTurn();
        this.watchDrain();
        this.flushTurn(String(event.text ?? ""));
        return;

      case "generation.cancelled":
        this.markOppAudio(false);
        // Сервер погасил реплику. Звук, уже стоящий в расписании браузера,
        // остановит только это — вторая половина перебивания живёт здесь.
        this.player?.stopAll();
        return;

      case "avatar.state":
        this.options.onAvatar?.(String(event.state ?? "listening"),
                                (event.reaction as string) ?? null,
                                Boolean(event.lipsync));
        return;

      case "vision.observation":
        this.options.onObservation?.(String(event.text ?? ""));
        return;

      case "user.transcript":
        this.options.onTranscript?.(String(event.text ?? ""), Boolean(event.final));
        return;

      case "user.speech.started":
        this.options.onSpeech?.(true);
        // Человек заговорил — глушим оппонента в браузере, не дожидаясь
        // подтверждения с сервера. Оно придёт, но эти сто миллисекунд слышны.
        this.player?.stopAll();
        return;

      case "user.speech.stopped":
        this.options.onSpeech?.(false);
        return;

      case "debrief":
        this.emit({ type: "debrief", debrief: event.debrief as never });
        return;

      case "error":
        this.emit({ type: "error",
                    message: String((event.error as { message?: string })?.message ?? "ошибка") });
        return;
    }
  }

  /** Собрать старый `opponent` из накопленных частей хода. */
  private flushTurn(text: string): void {
    if (!this.pendingState) return;
    this.emit({
      type: "opponent",
      text,
      analysis: this.pendingAnalysis ?? emptyAnalysis(),
      deltas: this.pendingDeltas ?? { trust: 0, tension: 0, info: 0, leverage: 0 },
      state: this.pendingState,
      coach: this.pendingCoach?.text || undefined,
      coach_techniques: this.pendingCoach?.techniques,
      coach_reject: this.pendingCoach?.reject,
    });

    // «Читай лицо»: вопрос строится из НАСТОЯЩЕЙ реакции движка, поэтому он
    // одинаково честен онлайн и офлайн. Ни одна модель тут не участвует.
    const closed = this.pendingState.status !== "active";
    if (this.probeEnabled && this.lastReaction && shouldProbe(this.turnCounter, closed)) {
      const probe = buildProbe(this.lastReaction, this.turnCounter);
      if (probe) {
        this.emit({ type: "probe", turn: probe.turn, options: probe.options as unknown as string[],
                    answer: probe.answer });
      }
    }

    this.pendingAnalysis = null;
    this.pendingDeltas = null;
    this.pendingCoach = null;
  }
}

function emptyAnalysis(): Analysis {
  return { tags: [], primary: "statement", arg_quality: 0, spin: null,
           flags: { hostile: false, threat: false, question: false } };
}

function mapStatus(status: ConnectionStatus): ConnStatus {
  if (status === "reconnecting") return "reconnecting";
  if (status === "lost") return "lost";
  return "online";
}
