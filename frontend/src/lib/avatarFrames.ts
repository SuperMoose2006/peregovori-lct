/** Provider frames share the PCM generation and its sample-time origin. */
export class AvatarFrames {
  private generation = "";
  private frames: { pts: number; image: string }[] = [];
  private current: { pts: number; image: string } | null = null;
  private cancelled = new Set<string>();

  push(event: Record<string, unknown>): void {
    const generation = event.generation_id, pts = event.pts_ms, jpeg = event.jpeg;
    if (typeof generation !== 'string' || !generation || this.cancelled.has(generation)
        || typeof pts !== 'number' || !Number.isFinite(pts) || pts < 0
        || typeof jpeg !== 'string' || jpeg.length > 180000 || !/^[A-Za-z0-9+/]+=*$/.test(jpeg)) return;
    if (this.generation !== generation) { this.frames=[];this.current=null;this.generation=generation; }
    if (this.current && pts < this.current.pts) return;
    this.frames.push({pts,image:'data:image/jpeg;base64,'+jpeg});
    this.frames.sort((a,b)=>a.pts-b.pts);
    if (this.frames.length > 30) this.frames.splice(30);
  }

  at(timeMs: number | null): string | null {
    if (timeMs === null) return null;
    while (this.frames.length && this.frames[0].pts <= timeMs) this.current=this.frames.shift()!;
    // Don't freeze a disconnected provider's last open mouth over ongoing speech.
    return this.current && timeMs-this.current.pts < 250 ? this.current.image : null;
  }

  clear(): void {
    if(this.generation) this.cancelled.add(this.generation);
    if(this.cancelled.size>32)this.cancelled.delete(this.cancelled.values().next().value!);
    this.frames=[];this.current=null;this.generation='';
  }
}
