/** Local amplitude animation, not phoneme recognition. Times use the audio clock. */
export class SpeechEnvelope {
  private frames: { start: number; end: number; level: number }[] = [];

  add(samples: Float32Array, rate: number, start: number): void {
    const step = Math.max(1, Math.round(rate * 0.02));
    for (let i = 0; i < samples.length; i += step) {
      const end = Math.min(i + step, samples.length);
      let energy = 0;
      for (let j = i; j < end; j++) {
        const sample = Number.isFinite(samples[j]) ? samples[j] : 0;
        energy += sample * sample;
      }
      const rms = Math.sqrt(energy / (end - i));
      this.frames.push({ start: start + i / rate, end: start + end / rate,
        level: Math.min(1, Math.max(0, (rms - 0.008) * 6)) });
    }
  }

  level(time: number): number {
    while (this.frames.length && this.frames[0].end <= time) this.frames.shift();
    const frame = this.frames[0];
    return frame && frame.start <= time ? frame.level : 0;
  }

  clear(): void { this.frames = []; }
}
