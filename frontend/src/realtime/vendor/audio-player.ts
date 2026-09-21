// audio-player.ts — воспроизведение потокового PCM с джиттер-буфером.
//
// ╔══════════════════════════════════════════════════════════════════════════╗
// ║ ПОРТ UPSTREAM-КОДА                                                       ║
// ║ Источник: MiniCPM-o-Demo, Apache-2.0                                     ║
// ║ Коммит:   50b0865c819c2f0ca24ec7994e05044e5f39d451                       ║
// ║ Файлы:    static/duplex/lib/audio-player.js (295 стр.)                   ║
// ║           static/duplex/lib/duplex-utils.js  (resampleAudio)             ║
// ║ Изменено: JS → TS, убраны запись сессии и console-логи, добавлен         ║
// ║           `stopAll()` как явная точка перебивания                        ║
// ║ Полный провенанс: docs/upstream-code-map.md                              ║
// ╚══════════════════════════════════════════════════════════════════════════╝
//
// ПОЧЕМУ НЕ «просто new Audio()». Звук приходит кусками по мере синтеза, с
// неровными интервалами. Наивное «пришёл чанк — сыграл» даёт щелчки и разрывы:
// каждый source стартует «сейчас», а «сейчас» уже позже, чем кончился прошлый.
//
// Здесь чанки ПЛАНИРУЮТСЯ на шкале `AudioContext.currentTime`: каждый следующий
// ставится ровно на конец предыдущего. Плюс стартовая задержка (`playbackDelayMs`)
// — маленький джиттер-буфер, который переживает сетевую икоту, не прерывая речь.
//
// `stopAll()` — это перебивание. Оно обязано быть мгновенным: не «перестать
// планировать новое», а оборвать уже запланированное. Иначе оппонент продолжает
// говорить ещё секунду после того, как человек начал.

/** Линейная интерполяция между частотами. Перенос `resampleAudio` из duplex-utils.js. */
import { SpeechEnvelope } from "../../lib/speechEnvelope";

export function resampleAudio(samples: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate) return samples;
  const ratio = fromRate / toRate;
  const newLen = Math.round(samples.length / ratio);
  const result = new Float32Array(newLen);
  for (let i = 0; i < newLen; i++) {
    const srcIdx = i * ratio;
    const floor = Math.floor(srcIdx);
    const frac = srcIdx - floor;
    const next = Math.min(floor + 1, samples.length - 1);
    result[i] = samples[floor] * (1 - frac) + samples[next] * frac;
  }
  return result;
}

export interface AudioMetrics {
  /** На сколько миллисекунд вперёд наполнен буфер. Ноль — речь вот-вот прервётся. */
  ahead: number;
  /** Сколько раз буфер опустел посреди реплики. Растёт — сеть не тянет. */
  gapCount: number;
  turn: number;
}

export interface AudioPlayerOptions {
  /** Частота, в которой сервер шлёт PCM. Должна совпадать с `OUTPUT_SAMPLE_RATE`. */
  outputSampleRate?: number;
  /** Джиттер-буфер: сколько накопить перед стартом. */
  playbackDelayMs?: number;
  onMetrics?: (m: AudioMetrics) => void;
}

export class AudioPlayer {
  private readonly envelope = new SpeechEnvelope();
  private pcmTimeMs = 0;
  private clocks: { start: number; end: number; offset: number }[] = [];
  private ctx: AudioContext | null = null;
  private readonly expectedRate: number;
  private readonly delayMs: number;
  private readonly onMetrics?: (m: AudioMetrics) => void;

  private deviceRate = 0;
  private nextTime = 0;
  private playing = false;
  private turnActive = false;
  private turnIdx = 0;
  private gapCount = 0;
  private lastAheadMs = 0;
  private sources: AudioBufferSourceNode[] = [];
  private pending: Float32Array[] = [];
  private delayTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: AudioPlayerOptions = {}) {
    this.expectedRate = options.outputSampleRate ?? 24000;
    this.delayMs = options.playbackDelayMs ?? 160;
    this.onMetrics = options.onMetrics;
  }

  /** Создать AudioContext. Обязан вызываться из обработчика жеста пользователя. */
  init(): void {
    if (!this.ctx || this.ctx.state === "closed") {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctor();
      this.deviceRate = this.ctx.sampleRate;
    }
    this.stopAllSources();
    this.turnActive = false;
    this.turnIdx = 0;
    this.nextTime = 0;
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  /** Sample only audio scheduled for playback now, never network arrival time. */
  speechLevel(): number {
    return this.ctx?.state === "running" ? this.envelope.level(this.ctx.currentTime) : 0;
  }

  playbackTimeMs(): number | null {
    if (this.ctx?.state !== 'running') return null;
    const now = this.ctx.currentTime;
    while (this.clocks.length && this.clocks[0].end <= now) this.clocks.shift();
    const clock = this.clocks[0];
    return clock && clock.start <= now ? clock.offset + (now - clock.start) * 1000 : null;
  }

  /** Новая реплика оппонента. Всё, что осталось от прошлой, обрывается. */
  beginTurn(): void {
    if (this.turnActive) return;
    this.stopAllSources();
    this.turnActive = true;
    this.turnIdx++;
    this.gapCount = 0;
    this.nextTime = 0;
  }

  /** Чанк float32 PCM в base64, в частоте `outputSampleRate`. */
  playChunk(base64: string): void {
    if (!base64 || !this.ctx) return;
    const samples = decodeFloat32(base64);
    if (samples.length === 0) return;
    const resampled = resampleAudio(samples, this.expectedRate, this.deviceRate);

    if (this.playing) {
      this.schedule(resampled);
      return;
    }

    // Джиттер-буфер: копим `delayMs`, потом стартуем всё разом. Без этого
    // первая же сетевая задержка рвёт речь на первом слове.
    this.pending.push(resampled);
    if (!this.delayTimer) {
      if (this.delayMs <= 0) {
        this.startPlayback();
      } else {
        this.delayTimer = setTimeout(() => {
          this.delayTimer = null;
          if (this.pending.length > 0) this.startPlayback();
        }, this.delayMs);
      }
    }
  }

  /** Реплика кончилась: доиграть накопленное, новых чанков не ждать. */
  endTurn(): void {
    if (!this.turnActive) return;
    if (!this.playing && this.pending.length > 0) {
      if (this.delayTimer) {
        clearTimeout(this.delayTimer);
        this.delayTimer = null;
      }
      this.startPlayback();
    }
    this.turnActive = false;
  }

  /**
   * ПЕРЕБИВАНИЕ. Обрывает всё запланированное, а не только будущее.
   *
   * Половина работы barge-in делается здесь, в браузере: сервер гасит поколение
   * на шине, но чанки, которые уже долетели и стоят в расписании
   * AudioContext, остановит только это.
   */
  stopAll(): void {
    this.stopAllSources();
    this.turnActive = false;
  }

  /** Полная остановка сессии. */
  async dispose(): Promise<void> {
    this.stopAllSources();
    this.turnActive = false;
    if (this.ctx && this.ctx.state !== "closed") {
      try {
        await this.ctx.close();
      } catch {
        /* уже закрыт */
      }
    }
    this.ctx = null;
  }

  // -- внутреннее ----------------------------------------------------------

  private startPlayback(): void {
    if (this.playing || !this.ctx) return;
    this.playing = true;
    if (this.ctx.state === "suspended") void this.ctx.resume().catch(() => {});
    this.nextTime = this.ctx.currentTime;
    for (const chunk of this.pending) this.schedule(chunk);
    this.pending = [];
  }

  private schedule(samples: Float32Array): void {
    if (!this.ctx) return;
    const buffer = this.ctx.createBuffer(1, samples.length, this.deviceRate);
    buffer.getChannelData(0).set(samples);
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.ctx.destination);

    const now = this.ctx.currentTime;
    if (this.nextTime < now) {
      // Буфер опустел: речь уже прервалась. Считаем разрыв — по этому числу
      // видно, что сеть не тянет, и стоит поднять джиттер-буфер.
      if ((now - this.nextTime) * 1000 > 10) this.gapCount++;
      this.nextTime = now;
    }

    source.start(this.nextTime);
    this.clocks.push({ start: this.nextTime, end: this.nextTime + buffer.duration, offset: this.pcmTimeMs });
    this.pcmTimeMs += buffer.duration * 1000;
    this.envelope.add(samples, this.deviceRate, this.nextTime);
    this.nextTime += buffer.duration;
    this.sources.push(source);
    source.onended = () => {
      const i = this.sources.indexOf(source);
      if (i >= 0) this.sources.splice(i, 1);
      if (this.sources.length === 0 && this.pending.length === 0) this.playing = false;
    };

    this.lastAheadMs = (this.nextTime - this.ctx.currentTime) * 1000;
    this.onMetrics?.({ ahead: this.lastAheadMs, gapCount: this.gapCount, turn: this.turnIdx });
  }

  private stopAllSources(): void {
    this.envelope.clear();
    this.clocks = [];
    this.pcmTimeMs = 0;
    if (this.delayTimer) {
      clearTimeout(this.delayTimer);
      this.delayTimer = null;
    }
    for (const source of this.sources) {
      try {
        source.stop();
      } catch {
        /* уже кончился */
      }
      try {
        source.disconnect();
      } catch {
        /* уже отключён */
      }
    }
    this.sources = [];
    this.playing = false;
    this.pending = [];
  }
}

/** base64 → Float32Array. Побайтно, потому что atob отдаёт строку. */
function decodeFloat32(base64: string): Float32Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  if (bytes.byteLength === 0) return new Float32Array(0);
  return new Float32Array(bytes.buffer);
}
