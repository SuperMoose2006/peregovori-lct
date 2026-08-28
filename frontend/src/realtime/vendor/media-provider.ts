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

/**
 * Итог подъёма устройств. «ok» — слой работает, «off» — его не просили,
 * любая другая строка — причина, которую человек обязан увидеть на экране.
 */
export type LayerStart = "ok" | "off" | (string & {});

export interface MediaStartReport {
  camera: LayerStart;
  mic: LayerStart;
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
  /** Решётка яркостей прошлого кадра и доля изменившихся проб в последнем. */
  private lastGrid: number[] | null = null;
  private lastChange = 1;
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
   *
   * ПОЧЕМУ ЗДЕСЬ БОЛЬШЕ НЕТ `throw`. Устройства поднимались подряд в одном
   * потоке: сначала камера, потом микрофон. Отказ камеры выбрасывал исключение
   * ДО микрофона — и человек, разрешивший микрофон и запретивший камеру,
   * оставался без обоих. Хуже того, вызывающий видел одно исключение и называл
   * виновником микрофон, который никто не спрашивал.
   *
   * Отказ в устройстве — это НЕ сбой программы, это ответ пользователя. Поэтому
   * каждый слой поднимается в своей попытке, а метод возвращает отчёт по обоим:
   * «ok», «off» (не просили) или текст причины. Кто из них не встал — обязан
   * быть назван на экране поимённо, иначе получается запрещённое четвёртое
   * состояние: переключатель включён, а внутри пусто.
   */
  async start(options: { camera?: boolean; mic?: boolean } = {}): Promise<MediaStartReport> {
    const wantCamera = options.camera === true;
    const wantMic = options.mic !== false;
    const report: MediaStartReport = {
      camera: wantCamera ? "ok" : "off",
      mic: wantMic ? "ok" : "off",
    };

    if (!MediaProvider.supported()) {
      const why = "браузер не отдаёт устройства: нужен https или localhost";
      if (wantCamera) report.camera = why;
      if (wantMic) report.mic = why;
      return report;
    }

    if (wantCamera) {
      try {
        await this.startCamera();
      } catch (error) {
        report.camera = await explainMediaError(error, "videoinput");
      }
    }

    if (wantMic) {
      try {
        await this.startMic();
      } catch (error) {
        report.mic = await explainMediaError(error, "audioinput");
      }
    }

    // Без звукового конвейера кадры не к чему прицепить: они уходят вместе с
    // чанками микрофона. Значит камера, оставшаяся одна — по выбору человека
    // или потому что микрофон не дали, — заводит собственный такт.
    if (report.mic !== "ok" && report.camera === "ok") {
      this.running = true;
      this.frameTimer = setInterval(() => {
        const f = this.grabFrame();
        if (f) this.onFrame?.(f);
      }, this.frameIntervalMs);
    }

    return report;
  }

  private async startMic(): Promise<void> {
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

  /**
   * ДВЕ ПОПЫТКИ, И ЭТО НЕ ПЕРЕСТРАХОВКА. `facingMode`, ширина и высота — это
   * ПОЖЕЛАНИЯ (`ideal`), выполнять их браузер не обязан. Но часть сборок
   * (внешние камеры без сведений об ориентации, виртуальные устройства
   * OBS/Zoom, часть Android) отвечает на такой запрос отказом `NotFoundError`
   * или `OverconstrainedError` — при живой камере. Человек, который только что
   * нажал «разрешить», получал «устройство не найдено» и был прав, не поверив.
   *
   * Поэтому вторая попытка идёт вообще без требований: любая камера лучше, чем
   * никакой, а 640×480 нам нужны только чтобы не гонять лишние байты — кадр всё
   * равно ужимается до 320 в `grabFrame`. Второго вопроса о разрешении при этом
   * не будет: доступ уже выдан, повторный `getUserMedia` его не переспрашивает.
   */
  private async startCamera(): Promise<void> {
    try {
      this.videoStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
      });
    } catch (error) {
      const name = (error as { name?: string })?.name ?? "";
      // Отказ пользователя переспрашивать нельзя — это был бы второй запрос
      // разрешения там, где человек уже сказал «нет».
      if (name === "NotAllowedError" || name === "SecurityError") throw error;
      this.videoStream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
    }
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

    // Кадр УЖЕ нарисован в canvas, поэтому настоящая межкадровая разница стоит
    // здесь одного прохода по пикселям — и заменяет прежний прокси «размер JPEG
    // изменился». Прокси ловил смену освещения и крупное движение, но тихий
    // уход из кадра не ловил вовсе: пустая комната жмётся не хуже человека в ней.
    this.lastChange = this.frameChange(this.canvas.width, this.canvas.height);

    // Качество ниже среднего осознанно: модель зрения отвечает на вопрос
    // «человек в кадре?», а не читает мелкий текст.
    return this.canvas.toDataURL("image/jpeg", 0.6).split(",", 2)[1] ?? null;
  }

  /** Доля заметно изменившихся пикселей, 0..1. Считается по решётке, а не по
   *  каждому пикселю: тысячи проб хватает, а 320×240 каждую секунду — нет. */
  private frameChange(w: number, h: number): number {
    if (!this.ctx2d) return 1;
    let data: Uint8ClampedArray;
    try {
      data = this.ctx2d.getImageData(0, 0, w, h).data;
    } catch {
      // Кадр из чужого источника пометил бы canvas «нечистым», и чтение
      // пикселей бросает. Не знаем — считаем, что изменилось: пропущенный
      // взгляд дешевле, чем застрявший.
      return 1;
    }
    const step = Math.max(4, Math.floor((w * h) / 1200)) * 4;
    const grid: number[] = [];
    for (let i = 0; i < data.length; i += step) {
      // Яркость по Rec. 601 — дешевле и устойчивее к шуму сенсора, чем RGB.
      grid.push(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    }
    const previous = this.lastGrid;
    this.lastGrid = grid;
    if (!previous || previous.length !== grid.length) return 1;

    let moved = 0;
    for (let i = 0; i < grid.length; i++) {
      if (Math.abs(grid[i] - previous[i]) > 12) moved++;   // 12 из 255 — выше шума
    }
    return moved / grid.length;
  }

  /** Насколько последний кадр отличался от предыдущего. Едет вместе с кадром. */
  lastChangeRatio(): number {
    return this.lastChange;
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

/**
 * Отказ устройства человеку показывают словами, а не именем класса ошибки.
 * `NotAllowedError` на экране — это не сообщение, а расписка в том, что текст
 * никто не писал.
 */
export function describeMediaError(error: unknown): string {
  const name = (error as { name?: string })?.name ?? "";
  if (name === "NotAllowedError" || name === "SecurityError")
    return "доступ не разрешён — браузер отказал в устройстве";
  if (name === "NotFoundError")
    return "устройство не найдено";
  if (name === "OverconstrainedError")
    return "устройство есть, но не отдаёт нужный формат";
  if (name === "NotReadableError")
    return "устройство занято другой программой";
  const message = (error as { message?: string })?.message;
  return message ? String(message) : "не удалось включить";
}

/**
 * «Устройство не найдено» — плохая новость не потому, что плохая, а потому, что
 * человек не знает, что с ней делать: камеры нет вовсе или она есть и занята?
 * Ответ лежит в одном вызове. Пересчитываем входы и говорим прямо; счёт берётся
 * ПОСЛЕ неудачной попытки, когда разрешение уже спрошено, поэтому список
 * настоящий, а не обрезанный из соображений приватности.
 */
export async function explainMediaError(error: unknown, kind: "videoinput" | "audioinput"): Promise<string> {
  const why = describeMediaError(error);
  const name = (error as { name?: string })?.name ?? "";
  if (name !== "NotFoundError" && name !== "OverconstrainedError") return why;

  let count: number | null = null;
  try {
    const list = await navigator.mediaDevices.enumerateDevices();
    count = list.filter((d) => d.kind === kind).length;
  } catch {
    count = null;
  }
  const thing = kind === "videoinput" ? "камер" : "микрофонов";
  if (count === 0) return `${thing} в системе нет — подключите устройство`;
  if (count && count > 0)
    return `${why} (${thing} в системе: ${count} — возможно, устройство занято другой программой)`;
  return why;
}
