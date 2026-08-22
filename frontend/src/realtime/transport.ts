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
  videoEl?: HTMLVideoElement | null;
  canvasEl?: HTMLCanvasElement | null;
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
      if (this.voiceWanted) await this.startVoice();
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
  private async startVoice(): Promise<void> {
    this.player = new AudioPlayer({ outputSampleRate: 24000 });
    this.player.init();

    if (!MediaProvider.supported()) {
      this.emit({ type: "error", message: "Микрофон недоступен: нужен HTTPS." });
      return;
    }
    this.media = new MediaProvider({
      video: this.options.videoEl ?? undefined,
      canvas: this.options.canvasEl ?? undefined,
    });
    this.media.onChunk = ({ audio, frame }) => {
      this.session?.sendAudio(toBase64(audio.buffer), frame);
    };
    try {
      await this.media.start({ camera: this.cameraWanted });
    } catch (error) {
      this.media = null;
      this.emit({ type: "error", message: `Микрофон не включился: ${(error as Error).message}` });
    }
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
        } else if (kind === "transcript") {
          this.options.onTranscript?.(String(event.text ?? ""), Boolean(event.final));
        }
        return;
      }

      case "response.done":
        this.player?.endTurn();
        this.flushTurn(String(event.text ?? ""));
        return;

      case "generation.cancelled":
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
