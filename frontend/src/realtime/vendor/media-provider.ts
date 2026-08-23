// media-provider.ts — микрофон и камера браузера для realtime-сессии.
//
// ╔══════════════════════════════════════════════════════════════════════════╗
// ║ ПОРТ UPSTREAM-КОДА                                                       ║
// ║ Источник: MiniCPM-o-Demo, Apache-2.0                                     ║
// ║ Коммит:   50b0865c819c2f0ca24ec7994e05044e5f39d451                       ║
// ║ Файлы:    frontend/mobile/src/mobile-duplex.ts (MobileLiveMediaProvider) ║
// ║           static/duplex/lib/capture-processor.js (AudioWorklet)          ║
// ║ Полный провенанс: docs/upstream-code-map.md                              ║
// ╚══════════════════════════════════════════════════════════════════════════╝
//
// ЧТО ИЗМЕНЕНО И ПОЧЕМУ.
//
// 1. РАЗМЕР КУСКА: 1000 мс → 120 мс. У оригинала он равен секунде, потому что
//    их модель ест ровно секундные чанки. Нам это сломало бы перебивание: VAD
//    не увидит речь, пока кусок не долетел, то есть к 120 мс префикса VAD
//    добавилась бы почти секунда. 120 мс — компромисс: накладные расходы WS
//    ещё малы, а задержка уже незаметна.
//
// 2. Воркет грузится из Blob, а не из `/static/duplex/lib/capture-processor.js`.
//    Vite не отдаёт статику по этому пути, а плодить публичный файл ради
//    семидесяти строк не хочется.
//
// 3. Убрана мобильная специфика (переворот камеры, `rebindElements` для
//    ремаунта React-экрана): у нас один экран и он не пересоздаётся.
//
// ЧТО СОХРАНЕНО ДОСЛОВНО И ЭТО ВАЖНО:
//
//   • `echoCancellation: true` — ПЕРВЫЙ рубеж защиты от самоподслушивания.
//     Браузерный AEC вычитает то, что играет в колонках, из того, что слышит
//     микрофон. Без него без наушников VAD принимает голос оппонента за речь
//     игрока и оппонент перебивает сам себя. Второй рубеж — на сервере
//     (`perception/voice_pipeline.py`), но он надстройка, а не замена.
//
//   • `sinkGain.gain.value = 0` — узел захвата подключён к выходу, иначе в
//     некоторых браузерах граф не «тянется» и `process()` не вызывается. Но
//     громкость ноль: слышать собственный микрофон никто не должен.

const CAPTURE_PROCESSOR_SOURCE = `
class CaptureProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this._chunkSize = options.processorOptions?.chunkSize || 1920;
    this._buffer = new Float32Array(0);
    this._active = false;
    this.port.onmessage = (e) => {
      if (e.data?.command === 'start') { this._active = true; this._buffer = new Float32Array(0); }
      else if (e.data?.command === 'stop') { this._active = false; this._buffer = new Float32Array(0); }
    };
  }
  process(inputs, outputs) {
    const input = inputs[0]?.[0];
    const output = outputs[0]?.[0];
    if (input && output) output.set(input);
    if (!this._active || !input || input.length === 0) return true;
    const next = new Float32Array(this._buffer.length + input.length);
    next.set(this._buffer); next.set(input, this._buffer.length);
    this._buffer = next;
    while (this._buffer.length >= this._chunkSize) {
      const chunk = this._buffer.slice(0, this._chunkSize);
      this._buffer = this._buffer.slice(this._chunkSize);
      this.port.postMessage({ type: 'chunk', audio: chunk }, [chunk.buffer]);
    }
    return true;
  }
}
registerProcessor('capture-processor', CaptureProcessor);
`;

/** Частота, в которой сервер ждёт звук с микрофона (ten-vad работает на 16 кГц). */
export const CAPTURE_SAMPLE_RATE = 16000;

/** Длина куска в миллисекундах. См. пункт 1 выше — это про задержку перебивания. */
export const CAPTURE_CHUNK_MS = 120;

export interface MediaChunk {
  /** PCM16 моно 16 кГц, готовый к base64. */
  audio: Int16Array;
  /** Кадр с камеры (base64 JPEG), если камера включена и подошёл её черёд. */
  frame: string | null;
}

export interface MediaProviderOptions {
  /** Куда рисовать кадры перед кодированием. Может быть скрытым. */
  canvas?: HTMLCanvasElement;
  video?: HTMLVideoElement;
  /* ССЫЛКИ НА ЕЩЁ НЕ СМОНТИРОВАННЫЕ ЭЛЕМЕНТЫ. Камера поднимается по
     `session.created`, а панель с <video> появляется только следующей
     перерисовкой — на момент старта элементов ещё нет. Держим ссылки и
     привязываемся, как только они появятся. */
  videoRef?: { current: HTMLVideoElement | null } | null;
  canvasRef?: { current: HTMLCanvasElement | null } | null;
  /** Как часто снимать кадр. Транспорт камеры и обращение к модели — разные вещи:
   *  сервер сам решает, какой кадр показать модели (`perception/vision.py`). */
  frameIntervalMs?: number;
}

export class MediaProvider {
  private audioStream: MediaStream | null = null;
  private videoStream: MediaStream | null = null;
  private ctx: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private capture: AudioWorkletNode | null = null;
  private sink: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private workletUrl: string | null = null;

  private canvas: HTMLCanvasElement | null;
  private video: HTMLVideoElement | null;
  private ctx2d: CanvasRenderingContext2D | null = null;
  private videoRef: { current: HTMLVideoElement | null } | null = null;
  private canvasRef: { current: HTMLCanvasElement | null } | null = null;
  private lastFrameAt = 0;
  private readonly frameIntervalMs: number;

  private micEnabled = true;
  running = false;
  onChunk: ((chunk: MediaChunk) => void) | null = null;
  /** Кадр без звука — путь для режима «камера без микрофона». */
  onFrame: ((frame: string) => void) | null = null;
  private frameTimer: ReturnType<typeof setInterval> | null = null;

  constructor(options: MediaProviderOptions = {}) {
    this.canvas = options.canvas ?? null;
    this.video = options.video ?? null;
    this.videoRef = options.videoRef ?? null;
    this.canvasRef = options.canvasRef ?? null;
    this.frameIntervalMs = options.frameIntervalMs ?? 1000;
  }

  /** Доступен ли микрофон в принципе. HTTPS обязателен — кроме localhost. */
  static supported(): boolean {
    return typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
  }

  /**
   * `mic` отделён от `camera` НАМЕРЕННО. Раньше метод всегда открывал микрофон,
   * поэтому слой камеры не мог работать сам по себе: включив одну камеру,
   * человек молча отдавал и микрофон. Просить больше, чем включил пользователь,
   * — это не мелочь интерфейса, а нарушение обещания на экране подготовки.
   */
  async start(options: { camera?: boolean; mic?: boolean } = {}): Promise<void> {
    if (!MediaProvider.supported()) {
      throw new Error("Браузер не даёт доступ к микрофону. Нужен HTTPS.");
    }
    if (options.camera) await this.startCamera();
    if (options.mic === false) {
      // Без микрофона нет и звукового конвейера, к чанкам которого прицеплены
      // кадры. Заводим собственный такт с тем же интервалом.
      this.running = true;
      this.frameTimer = setInterval(() => {
        const f = this.grabFrame();
        if (f) this.onFrame?.(f);
      }, this.frameIntervalMs);
      return;
    }

    this.audioStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        // Первый рубеж защиты от самоподслушивания — см. шапку файла.
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });

    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctor({ sampleRate: CAPTURE_SAMPLE_RATE });

    const blob = new Blob([CAPTURE_PROCESSOR_SOURCE], { type: "application/javascript" });
    this.workletUrl = URL.createObjectURL(blob);
    await this.ctx.audioWorklet.addModule(this.workletUrl);

    this.source = this.ctx.createMediaStreamSource(this.audioStream);
    this.capture = new AudioWorkletNode(this.ctx, "capture-processor", {
      processorOptions: {
        chunkSize: Math.round((CAPTURE_SAMPLE_RATE * CAPTURE_CHUNK_MS) / 1000),
      },
    });

    // Индикатор «вас слышно»: та же дорожка, отдельная ветка графа.
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 512;
    this.source.connect(this.analyser);

    this.sink = this.ctx.createGain();
    this.sink.gain.value = 0; // граф должен «тянуться», но слышать себя нельзя
    this.source.connect(this.capture);
    this.capture.connect(this.sink);
    this.sink.connect(this.ctx.destination);

    this.capture.port.onmessage = (event: MessageEvent<{ type: string; audio: Float32Array }>) => {
      if (event.data?.type !== "chunk" || !this.running) return;
      if (!this.micEnabled) return;
      this.onChunk?.({
        audio: floatToPcm16(event.data.audio),
        frame: this.grabFrame(),
      });
    };

    this.capture.port.postMessage({ command: "start" });
    this.running = true;
  }

  setMicEnabled(enabled: boolean): void {
    this.micEnabled = enabled;
    this.audioStream?.getAudioTracks().forEach((t) => (t.enabled = enabled));
  }

  /** Уровень входа 0..1 — для полоски «вас слышно». */
  level(): number {
    if (!this.analyser) return 0;
    const data = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteTimeDomainData(data);
    let peak = 0;
    for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i] - 128));
    return Math.min(1, peak / 90);
  }

  async stop(): Promise<void> {
    this.running = false;
    this.capture?.port.postMessage({ command: "stop" });
    this.capture?.disconnect();
    this.sink?.disconnect();
    this.source?.disconnect();
    this.analyser?.disconnect();
    this.capture = this.sink = this.source = null;
    this.analyser = null;

    this.audioStream?.getTracks().forEach((t) => t.stop());
    this.videoStream?.getTracks().forEach((t) => t.stop());
    this.audioStream = this.videoStream = null;

    if (this.ctx && this.ctx.state !== "closed") {
      try {
        await this.ctx.close();
      } catch {
        /* уже закрыт */
      }
    }
    this.ctx = null;
    if (this.frameTimer) { clearInterval(this.frameTimer); this.frameTimer = null; }
    if (this.workletUrl) {
      URL.revokeObjectURL(this.workletUrl);
      this.workletUrl = null;
    }
  }

  // -- камера --------------------------------------------------------------

  private async startCamera(): Promise<void> {
    this.videoStream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
    });
    this.bindElements();
    if (this.video) {
      this.video.srcObject = this.videoStream;
      await this.video.play().catch(() => {
        /* политика автоплея — поток всё равно привязан */
      });
    }
    if (this.canvas) this.ctx2d = this.canvas.getContext("2d");
  }

  /** Привязать поток к элементам, как только они появились в разметке. */
  private bindElements(): void {
    if (!this.video && this.videoRef?.current) {
      this.video = this.videoRef.current;
      if (this.videoStream) {
        this.video.srcObject = this.videoStream;
        void this.video.play().catch(() => { /* политика автоплея */ });
      }
    }
    if (!this.canvas && this.canvasRef?.current) {
      this.canvas = this.canvasRef.current;
      this.ctx2d = this.canvas.getContext("2d");
    }
  }

  private grabFrame(): string | null {
    this.bindElements();
    if (!this.videoStream || !this.video || !this.canvas || !this.ctx2d) return null;
    const now = performance.now();
    if (now - this.lastFrameAt < this.frameIntervalMs) return null;
    if (!this.video.videoWidth) return null;
    this.lastFrameAt = now;

    this.canvas.width = 320;
    this.canvas.height = Math.round((320 * this.video.videoHeight) / this.video.videoWidth);
    this.ctx2d.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);
    // Качество ниже среднего осознанно: модель зрения отвечает на вопрос
    // «человек в кадре?», а не читает мелкий текст.
    return this.canvas.toDataURL("image/jpeg", 0.6).split(",", 2)[1] ?? null;
  }
}

/** float32 [-1,1] → PCM16, как ждёт сервер. */
export function floatToPcm16(samples: Float32Array): Int16Array {
  const out = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    out[i] = v < 0 ? v * 0x8000 : v * 0x7fff;
  }
  return out;
}

/** ArrayBuffer → base64. Кусками, иначе большой массив роняет стек. */
export function toBase64(buffer: ArrayBufferLike): string {
  const bytes = new Uint8Array(buffer);
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += 8192) {
    parts.push(String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 8192))));
  }
  return btoa(parts.join(""));
}
