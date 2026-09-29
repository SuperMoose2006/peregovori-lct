// transport.ts — новый realtime-путь под существующим интерфейсом транспорта.
//
// ПОЧЕМУ АДАПТЕР, А НЕ ПЕРЕПИСАННЫЕ ЭКРАНЫ. Кампания, экзамен, разбор,
// «что-если», XP и достижения написаны против `ServerMsg` и работают. Менять их
// одновременно с транспортом значило бы отлаживать две новые вещи сразу, не
// имея ни одной опорной. Здесь новый протокол переводится в старый словарь —
// экраны продолжают работать в первый же день, — а всё, чего в старом словаре
// нет (звук, лицо, зрение, лента протокола), выходит отдельными колбэками.
//
// Вопрос «Читай лицо» приезжает с сервера после окончательной реплики.
// Онлайн-транспорт не вычисляет ни ответ, ни такт: это состояние сессии.

import type { Analysis, ClientMsg, Deltas, Lang, ScenarioView, StateView } from "../types";
import type { ConnStatus, ServerMsgHandler, Transport } from "../api/transport";
import { I18N } from "../i18n";
import { SERVER_SIDE_REASON } from "../lib/layers";
import { normalizeDifficulty } from "../lib/difficulty";
import { AudioPlayer } from "./vendor/audio-player";
import { AvatarFrames } from "../lib/avatarFrames";
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
  /** «Покерфейс»: кадр показал явное выражение вместо нейтрального.
   *  `total` — счётчик сервера, а не наш: пересчитывать его на клиенте
   *  значило бы завести второй источник правды на ровном месте. */
  onTell?: (expressive: boolean, total: number) => void;
  /** Кадр ДЕЙСТВИТЕЛЬНО ушёл на сервер. Чип камеры обязан гореть от этого, а
   *  не от факта, что поток открыт: открытый поток без кадров выглядит на
   *  экране точно так же, как работающая камера. */
  onCameraFrame?: () => void;
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
  private readonly faceFrames = new AvatarFrames();
  /** ПРИНЯТОЕ ПОКОЛЕНИЕ ОТВЕТА И ЕГО ИСТОРИЯ.
   *
   *  Поколение принимается ровно один раз — первым событием с новым id, будь
   *  то текст или звук, — и в этот момент прежнее уходит целиком: звук, кадры,
   *  часы проигрывателя. Раньше часы сбрасывал первый ТЕКСТОВЫЙ кусок: звук,
   *  пришедший раньше текста, продолжал старые часы, а запоздавший текст обрывал
   *  уже звучащий ответ. Ушедшие id помнятся, и их хвосты (звук, кадр, `done`,
   *  отмена) не оживляют и не глушат новое поколение. Id непрозрачны: их никто
   *  не сравнивает по порядку — только «тот же / виденный / новый». */
  private audioGeneration = "";
  private readonly retiredGenerations = new Set<string>();
  /** Текст принятого поколения — чтобы довести ход, если его перебили до `done`. */
  private generationText = "";
  /** Ход этого поколения уже собран (`response.done` или отмена) — второй раз нельзя. */
  private generationFlushed = false;
  private serverSessionId = "";
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
  private probeEnabled = false;
  private lastProbeTurn = 0;
  private voiceWanted = false;
  private microphoneAllowed = true;
  private cameraWanted = false;
  private closed = false;
  /** Партия уже началась: `session.created` пришёл. До него ошибка —
   *  провал запуска, после — сообщение со стола. */
  private live = false;
  // Язык партии. Нужен ровно для одного: причина закрытия приезжает КОДОМ
  // (`session.closed {reason}`), а человеку её надо сказать словами и на его
  // языке. Сервер тут не помощник — он не должен сочинять текст интерфейса.
  private lang: Lang = "ru";

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

  speechLevel(): number { return this.player?.speechLevel() ?? 0; }
  videoFrame(): string | null { return this.faceFrames.at(this.player?.playbackTimeMs() ?? null); }
  /** Звук ответа пришёл, а браузер его не играет (политика автозапуска). */
  audioBlocked(): boolean { return this.player?.blocked ?? false; }
  /** Жест пользователя: разрешить браузеру играть звук. */
  resumeAudio(): void { this.player?.resume(); }
  /** Выключить микрофон, не закрывая его: дорожка молчит, партия идёт. */
  setMicMuted(muted: boolean): void { this.media?.setMicEnabled(!muted); }

  /** Перебивание с кнопки. Голосовое сервер замечает сам, через VAD. */
  interrupt(): void {
    this.faceFrames.clear();
    this.player?.stopAll();
    this.markOppAudio(false);
    this.session?.cancel();
  }

  private retireGeneration(id: string): void {
    if (!id) return;
    this.retiredGenerations.add(id);
    // Помнить вечно незачем: хвост приходит в пределах секунд. Сотня — с запасом.
    if (this.retiredGenerations.size > 128) {
      const oldest = this.retiredGenerations.values().next().value;
      if (oldest !== undefined) this.retiredGenerations.delete(oldest);
    }
  }

  /** Пропустить событие поколения `id` или выбросить как хвост ушедшего. */
  private admitGeneration(id: string): boolean {
    if (!id || id === this.audioGeneration) return true;
    if (this.retiredGenerations.has(id)) return false;
    this.retireGeneration(this.audioGeneration);
    this.audioGeneration = id;
    this.generationText = "";
    this.generationFlushed = false;
    this.faceFrames.clear();
    this.player?.stopAll();
    this.player?.beginTurn();
    this.markOppAudio(false);
    return true;
  }

  close(): void {
    this.closed = true;
    this.live = false;
    if (this.drainTimer) { clearInterval(this.drainTimer); this.drainTimer = null; }
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
    this.live = false;
    this.lang = message.lang;
    this.probeEnabled = !!layers.probe;
    this.lastProbeTurn = 0;
    this.voiceWanted = !!layers.voice;
    this.cameraWanted = !!layers.camera;

    const payload: SessionInitPayload = {
      scenarioId: message.scenarioId,
      lang: message.lang,
      gameMode: message.mode,
      situation: message.situation ?? null,
      context: message.context ? { ...message.context, difficulty: normalizeDifficulty(message.context.difficulty) } : undefined,
      reputation: message.reputation ?? null,
      daily: message.daily ?? null,
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
      this.serverSessionId = String(created.session_id ?? "");
      this.live = true;
      this.faceFrames.setStaleMs((this.session.capabilities.avatar as Record<string, unknown> | undefined)?.stale_ms);
      this.options.onCapabilities?.(this.session.capabilities);
      this.emit({
        type: "greeting",
        sessionId: String(created.session_id ?? ""),
        scenario: created.scenario as ScenarioView,
        state: created.state as StateView,
        text: String(created.greeting ?? ""),
        judge_active: Boolean((created.capabilities as Record<string, unknown>)?.judge),
      });
      // ЧТО СЕРВЕР СКАЗАЛ ПРО СЛОИ — ЧИТАЕТСЯ, А НЕ ЛЕЖИТ. `capabilities`
      // приезжали в состояние и не читались НИГДЕ, кроме бейджа судьи. Из-за
      // этого партия с камерой на сервере без ключа зрения выглядела ровно как
      // рабочая: браузер спрашивал доступ, кадр уходил раз в секунду, чип горел
      // «кадры идут» — а смотреть на них было некому. Ушедший кадр доказывает
      // транспорт, а не зрение; тот же признак получается при мёртвом слое.
      this.honourServerCapabilities(this.session.capabilities);
      // Камера — самостоятельный слой: без этого условия она включалась
      // только заодно с голосом, а сама по себе молча не работала.
      if (this.voiceWanted || this.cameraWanted) await this.startMedia();
    } catch (error) {
      this.emit({ type: "error", message: (error as Error).message });
      this.onConn("lost");
    }
  }

  /**
   * Слой, который сервер не поднял, называется поимённо и НЕ ОТКРЫВАЕТСЯ.
   *
   * Второе здесь важнее первого. Просить у человека камеру ради кадров, которые
   * никто не посмотрит, — это не только неправда на экране: это разрешение,
   * взятое ни за чем, и четыре с половиной мегабайта наружу за пятиминутную
   * партию. Слой гасится ДО `startMedia`, поэтому браузер даже не спрашивает
   * доступ.
   *
   * «Покерфейс» отдельной строки не получает намеренно: он считает кадры той же
   * камеры и без неё не существует, поэтому одна причина объясняет оба.
   */
  private honourServerCapabilities(capabilities: Record<string, unknown>): void {
    this.microphoneAllowed = capabilities.microphone !== false;
    if (this.cameraWanted && capabilities.camera === false) {
      this.cameraWanted = false;
      this.emit({ type: "layer_failed", layer: "camera",
                  reason: SERVER_SIDE_REASON.camera[this.lang] });
    }
    if (this.voiceWanted && capabilities.microphone === false) {
      // Disable capture separately: the opponent's working TTS stays enabled.
      this.emit({ type: "layer_failed", layer: "voice",
                  reason: SERVER_SIDE_REASON.voice[this.lang] });
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
      // Лицо от внешнего сервиса (у него свой порог `stale_ms`): звук держится
      // сервером под кадры — проигрыватель не срезает свой буфер досрочно.
      const avatar = (this.session?.capabilities.avatar ?? {}) as Record<string, unknown>;
      this.player.holdOnEnd = typeof avatar.stale_ms === "number";
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
      this.session?.sendAudio(toBase64(audio.buffer), frame,
                              frame ? this.media?.lastChangeRatio() : undefined);
      if (frame) this.options.onCameraFrame?.();
    };
    this.media.onFrame = (frame) => {
      this.session?.sendFrame(frame, this.media?.lastChangeRatio());
      this.options.onCameraFrame?.();
    };
    // `start` больше не бросает на отказ устройства: отказ — это ответ
    // пользователя, а не сбой. Он возвращает отчёт по каждому слою, и каждый
    // невставший слой называется на экране поимённо.
    const report = await this.media.start({ camera: this.cameraWanted, mic: this.voiceWanted && this.microphoneAllowed });
    if (this.voiceWanted && this.microphoneAllowed && report.mic !== "ok")
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
    // Сторож тишины гасится ВСЕГДА, а не только при смене состояния. Раньше
    // выход был через `on === this.oppAudio` выше, и в текстовом режиме — где
    // звука не бывает вовсе — сторож, заведённый на `response.done`, крутился
    // до конца жизни вкладки: каждый ход добавлял ещё один таймер на 200 мс.
    if (!on && this.drainTimer) { clearInterval(this.drainTimer); this.drainTimer = null; }
    if (this.oppAudio === on) return;
    this.oppAudio = on;
    this.options.onOppAudio?.(on);
  }

  /** `response.done` значит «модель дописала», а звук играет секундами дольше —
   *  поэтому конец речи ловим по опустевшему проигрывателю, а не по событию.
   *  И начало речи — тоже по нему: «говорит» горит, пока под указателем
   *  воспроизведения стоит запланированный звук, а не пока летят чанки. */
  private watchDrain(): void {
    if (this.drainTimer) return;
    let quiet = 0;
    const tick = () => {
      if (this.player?.playbackTimeMs() != null) { quiet = 0; this.markOppAudio(true); return; }
      if (this.player?.busy && !this.player.blocked) { quiet = 0; return; } // джиттер-буфер
      if (++quiet >= 2) this.markOppAudio(false);   // 2 × тишина
    };
    this.drainTimer = setInterval(tick, 100);
  }

  // -- перевод событий -----------------------------------------------------

  private route(event: ServerEvent): void {
    switch (event.type) {
      case "session.created": {
        const nextSessionId = String(event.session_id ?? "");
        const replaced = !!this.serverSessionId && nextSessionId !== this.serverSessionId;
        this.serverSessionId = nextSessionId;
        // Reconnect handshake must update the visible state, not only the socket.
        this.pendingState = null;
        this.pendingAnalysis = null;
        this.pendingDeltas = null;
        this.pendingCoach = null;
        // Поколения прежнего сокета не вернутся: новый пишет свои. Текущее
        // уходит в историю, чтобы его запоздавший хвост ничего не тронул.
        this.retireGeneration(this.audioGeneration);
        this.audioGeneration = "";
        this.generationText = "";
        this.generationFlushed = true;
        this.faceFrames.clear();
        this.faceFrames.setStaleMs(((event.capabilities as Record<string, unknown> | undefined)
          ?.avatar as Record<string, unknown> | undefined)?.stale_ms);
        this.player?.stopAll();
        this.markOppAudio(false);
        this.options.onCapabilities?.((event.capabilities as Record<string, unknown>) ?? {});
        this.emit({ type: "greeting", sessionId: String(event.session_id ?? ""),
          resumed: Boolean(event.resumed),
          scenario: event.scenario as ScenarioView, state: event.state as StateView,
          text: String(event.greeting ?? ""),
          judge_active: Boolean((event.capabilities as Record<string, unknown>)?.judge) });
        this.emit({ type: "notice", text: replaced
          ? (this.lang === "ru"
            ? "Предыдущая попытка недоступна. Начата новая попытка; прошлый результат не восстановлен."
            : "The previous attempt is unavailable. A new attempt has started; the previous result was not restored.")
          : (this.lang === "ru"
            ? "Связь восстановлена. Состояние стола получено с сервера; последний ответ мог прерваться."
            : "Connection restored. The table state was received from the server; the last reply may have been interrupted.") });
        return;
      }

      case "turn.analysis":
        // ТЕГИ УХОДЯТ НА ЭКРАН СРАЗУ, А НЕ ЧЕРЕЗ СЕКУНДУ С ЛИШНИМ.
        //
        // Раньше разбор целиком лежал здесь до `response.done` — то есть до
        // ~1300 мс, — и обещание «через 3 мс под репликой уже горят теги»
        // было неправдой ровно на эти 1300 мс. Копить его было нечего:
        // классификатор детерминирован, и ни судья, ни `apply_move` тегов не
        // трогают. Копить надо ЧИСЛО, и оно приезжает отдельно (`engine.state`).
        this.pendingAnalysis = event.analysis as Analysis;
        this.emit({ type: "analysis", analysis: this.pendingAnalysis });
        return;

      case "engine.state": {
        this.pendingState = event.state as StateView;
        this.pendingDeltas = event.deltas as Deltas;
        // Авторитетное качество аргумента: судья уже высказался, штраф за
        // повтор уже наложен. Черновик из `turn.analysis` заменяем и здесь,
        // чтобы `opponent` ниже не увёз на экран число, которого движок не
        // считал (спам-реплика: черновик 84, в грейд ушло 12).
        if (typeof event.arg_quality === "number") {
          const value = event.arg_quality as number;
          if (this.pendingAnalysis) this.pendingAnalysis = { ...this.pendingAnalysis, arg_quality: value };
          this.emit({ type: "arg_quality", value, judged: Boolean(event.judged) });
        }
        return;
      }

      case "probe": {
        // Повтор после переподключения не создаёт вторую карточку. Чужой или
        // повреждённый вопрос не должен показывать заведомо неверный ответ.
        const { turn, options, answer } = event;
        if (!this.probeEnabled || !Number.isInteger(turn) || Number(turn) <= this.lastProbeTurn
            || !Array.isArray(options) || options.length !== 4
            || options.some((option) => typeof option !== "string")
            || new Set(options).size !== 4 || !Number.isInteger(answer)
            || Number(answer) < 0 || Number(answer) >= options.length) return;
        this.lastProbeTurn = Number(turn);
        this.emit({ type: "probe", turn: Number(turn), options: options as string[], answer: Number(answer) });
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
        if (kind === "text" || kind === "audio") {
          if (!this.admitGeneration(String(event.generation_id ?? ""))) return;
        }
        if (kind === "text") {
          const chunk = String(event.text ?? "");
          this.generationText += chunk;
          this.emit({ type: "opponent_delta", chunk });
        } else if (kind === "audio") {
          this.player?.playChunk(String(event.audio ?? ""));
          // «Говорит» ставит не приход чанка, а проигрыватель: сторож ниже
          // смотрит на его часы. Чанк, пришедший в приостановленный браузером
          // AudioContext, звучать не будет — и лицо не должно делать вид.
          this.watchDrain(); // TTS may arrive after response.done's quiet timer expired.
        } else if (kind === "transcript") {
          this.options.onTranscript?.(String(event.text ?? ""), Boolean(event.final));
        }
        return;
      }

      case "response.done": {
        // `done` — конец ТЕКСТА. Звук того же поколения после него доигрывает:
        // поколение остаётся принятым, пока его не сменит новое или отмена.
        if (!this.admitGeneration(String(event.generation_id ?? ""))) return;
        this.player?.endTurn();
        this.watchDrain();
        if (!this.generationFlushed) {
          this.generationFlushed = true;
          this.flushTurn(String(event.text ?? ""));
        }
        return;
      }

      case "generation.cancelled": {
        const id = String(event.generation_id ?? "");
        if (id && id !== this.audioGeneration) {
          // Отмена чужого поколения — старого или ещё не пришедшего — текущее
          // не трогает: только запоминаем, чтобы его хвост не прошёл.
          this.retireGeneration(id);
          return;
        }
        this.markOppAudio(false);
        // Сервер погасил реплику. Звук, уже стоящий в расписании браузера,
        // остановит только это — вторая половина перебивания живёт здесь.
        this.faceFrames.clear();
        this.player?.stopAll();
        // ПЕРЕБИТЫЙ ДО `done` ХОД ДОВОДИТ КЛИЕНТ. Движок ход уже применил
        // (`engine.state` пришёл раньше реплики), а `response.done` погашенного
        // поколения сервер не пришлёт. Без этого стол висел занятым до
        // переподключения. В ленте остаётся то, что успело прийти.
        if (!this.generationFlushed) {
          this.generationFlushed = true;
          this.flushTurn(this.generationText);
        }
        this.retireGeneration(this.audioGeneration);
        this.audioGeneration = "";
        return;
      }

      case "avatar.frame":
        // Лицо сервиса между репликами: без поколения и места в звуке.
        if (event.idle === true) { this.faceFrames.pushIdle(event.jpeg); return; }
        if (event.generation_id === this.audioGeneration
            && !this.retiredGenerations.has(String(event.generation_id))) this.faceFrames.push(event);
        return;

      case "avatar.state":
        if (this.session && event.lipsync_mode === "amplitude") {
          this.faceFrames.reset();
          // `synthetic: false`: подпись «тестовый видеопоток» относится к
          // потоку, а потока больше нет — на экране рисованный портрет.
          this.session.capabilities = { ...this.session.capabilities,
            avatar: { ...(this.session.capabilities.avatar as object),
              lipsync: true, lipsync_mode: "amplitude", transport: "local", synthetic: false } };
          this.options.onCapabilities?.(this.session.capabilities);
        } else if (this.session && event.lipsync_mode === "video" && event.transport === "jpeg") {
          // Сервис видео снова на связи (сервер переподключился между
          // репликами) — лицо возвращается к кадрам. Только если лицо сейчас
          // НЕ видео: повтор того же режима на каждом состоянии не должен
          // перерисовывать экран. Без кредов сервер этого не шлёт никогда.
          const avatar = (this.session.capabilities.avatar ?? {}) as Record<string, unknown>;
          this.faceFrames.setStaleMs(event.stale_ms);
          if (avatar.lipsync_mode !== "video") {
            this.session.capabilities = { ...this.session.capabilities,
              avatar: { ...avatar, lipsync: true, lipsync_mode: "video", transport: "jpeg",
                synthetic: event.synthetic === true } };
            this.options.onCapabilities?.(this.session.capabilities);
          }
        }
        this.options.onAvatar?.(String(event.state ?? "listening"),
                                (event.reaction as string) ?? null,
                                Boolean(event.lipsync));
        return;

      case "vision.tell":
        this.options.onTell?.(!!event.expressive, Number(event.total ?? 0));
        break;
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
        this.faceFrames.clear();
        this.player?.stopAll();
        return;

      case "user.speech.stopped":
        this.options.onSpeech?.(false);
        return;

      case "debrief":
        this.emit({ type: "debrief", debrief: event.debrief as never });
        return;

      // Сервер закрыл партию по существу — это НЕ обрыв связи.
      // `taken_over` значит «партию продолжили в другом окне»: она жива, просто
      // не здесь. Молчание в этом месте выглядело бы как зависший стол, а
      // баннер «переподключаемся» был бы прямой неправдой — возвращаться некуда.
      // Наше собственное `session.close` тоже приезжает сюда (`user_stop`), и
      // объявлять человеку то, что он сам только что нажал, незачем.
      case "session.closed": {
        const reason = String(event.reason ?? "");
        if (reason === "taken_over") this.emit({ type: "notice", text: I18N[this.lang].conn.takenOver });
        return;
      }

      case "error": {
        const message = String((event.error as { message?: string })?.message ?? "ошибка");
        // ОТКАЗ ВНУТРИ ПАРТИИ — СТРОКА В ЛЕНТЕ, А НЕ ПРОВАЛ ЗАПУСКА.
        //
        // `error` со стола (кончился бюджет зрения, не поднялось распознавание,
        // ход не состоялся) уезжал в `state.error`, а `state.error` рисуется
        // ТОЛЬКО на экране подготовки — в «своей сделке». То есть сервер честно
        // говорил «слой недоступен», а за столом не появлялось ни строчки:
        // молчащий слой снова становился неотличим от сломанного микрофона.
        //
        // До `session.created` смысл обратный: там ошибка и есть провал
        // запуска, и она обязана дойти до машины состояний генерации сценария.
        if (this.live) this.emit({ type: "notice", text: message,
          keepBusy: (event.error as { code?: string })?.code === "tts_unavailable" });
        else this.emit({ type: "error", message });
        return;
      }
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
