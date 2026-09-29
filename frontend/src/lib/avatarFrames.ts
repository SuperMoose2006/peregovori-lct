/** Provider frames share the PCM generation and its sample-time origin. */
export class AvatarFrames {
  private generation = '';
  private frames: { pts: number; image: string }[] = [];
  private current: { pts: number; image: string } | null = null;
  private cancelled = new Set<string>();
  /** Кадр речи старше этого (к звучащему звуку) не держится на экране, мс.
   *  250 — прежнее правило; лицо от внешнего сервиса присылает своё
   *  (`capabilities.avatar.stale_ms`): при удержании звука кадры приходят
   *  раньше звука, и порог стал про дыру в потоке, а не про опоздание. */
  private staleMs = 250;
  /** Лицо сервиса между репликами (слушает). Показывается, когда кадра речи
   *  нет, — вместо рисованного портрета другого человека. */
  private idle: { image: string; at: number } | null = null;

  setStaleMs(ms: unknown): void {
    if (typeof ms === 'number' && Number.isFinite(ms) && ms >= 40 && ms <= 1000) this.staleMs = ms;
  }

  push(event: Record<string, unknown>): void {
    const generation = event.generation_id, pts = event.pts_ms, jpeg = event.jpeg;
    if (typeof generation !== 'string' || !generation || this.cancelled.has(generation)
        || typeof pts !== 'number' || !Number.isFinite(pts) || pts < 0
        || !validJpeg(jpeg)) return;
    if (this.generation !== generation) { this.frames=[];this.current=null;this.generation=generation; }
    if (this.current && pts < this.current.pts) return;
    this.frames.push({pts,image:'data:image/jpeg;base64,'+jpeg});
    this.frames.sort((a,b)=>a.pts-b.pts);
    if (this.frames.length > 30) this.frames.splice(30);
  }

  pushIdle(jpeg: unknown, now: number = performance.now()): void {
    if (!validJpeg(jpeg)) return;
    this.idle = { image: 'data:image/jpeg;base64,' + jpeg, at: now };
  }

  at(timeMs: number | null, now: number = performance.now()): string | null {
    if (timeMs !== null) {
      while (this.frames.length && this.frames[0].pts <= timeMs) this.current=this.frames.shift()!;
      // Don't freeze a disconnected provider's last open mouth over ongoing speech.
      if (this.current && timeMs-this.current.pts < this.staleMs) return this.current.image;
    }
    return this.idle && now - this.idle.at < IDLE_FRESH_MS ? this.idle.image : null;
  }

  /** Новое поколение или перебивание: кадры речи — прочь, лицо в простое остаётся. */
  clear(): void {
    if(this.generation) this.cancelled.add(this.generation);
    if(this.cancelled.size>32)this.cancelled.delete(this.cancelled.values().next().value!);
    this.frames=[];this.current=null;this.generation='';
  }

  /** Лицо сервиса больше не рисует (возврат к портрету): прочь всё, и простой тоже. */
  reset(): void {
    this.clear();
    this.idle = null;
  }
}

/** Кадр простоя старше этого — поток простоя кончился; сервер к тому времени
 *  уже вернул бы портрет, это страховка от вечного застывшего лица. */
const IDLE_FRESH_MS = 30000;

function validJpeg(jpeg: unknown): jpeg is string {
  return typeof jpeg === 'string' && jpeg.length <= 180000 && /^[A-Za-z0-9+/]+=*$/.test(jpeg);
}
