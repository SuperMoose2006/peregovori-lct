// sound.ts — a tiny, dependency-free WebAudio cue engine + haptics.
//
// Why synthesized (OscillatorNode/GainNode) and not audio files: the app ships
// under a strict CSP with no external asset hosts, so every cue is generated in
// code — a handful of short, low-volume, pleasant tones. The goal is a quiet,
// confident UI (a soft tick, a gentle chime), NOT an arcade.
//
// Autoplay-policy safe: browsers forbid starting audio outside a user gesture,
// so the AudioContext is created lazily and, ideally, unlocked from the first
// real pointer/key event via `initAudioUnlock()`. All browser globals are
// guarded so the module imports and its pure bits run under Node (tests).

export type CueName = "send" | "reveal" | "xp" | "levelup" | "grade" | "correct" | "wrong";

const STORAGE_KEY = "dialog.muted";

// In-memory mirror of the mute flag. Doubles as the source of truth when there
// is no localStorage (SSR / tests), which keeps setMuted/isMuted testable.
let mutedCache: boolean | null = null;

function readStore(): boolean {
  try {
    if (typeof localStorage !== "undefined") return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    /* private-mode / disabled storage — fall through to the in-memory default */
  }
  return false;
}

/** Master mute — default UNMUTED. Read live by every cue so it always honors the toggle. */
export function isMuted(): boolean {
  if (mutedCache === null) mutedCache = readStore();
  return mutedCache;
}

/** Persist the mute flag (localStorage when available) and update the live mirror. */
export function setMuted(v: boolean): void {
  mutedCache = v;
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(STORAGE_KEY, v ? "1" : "0");
  } catch {
    /* ignore — the in-memory mirror still holds */
  }
}

/** Flip mute and return the new value (for the header toggle). */
export function toggleMuted(): boolean {
  setMuted(!isMuted());
  return isMuted();
}

// ---- AudioContext (lazy, gesture-unlocked) --------------------------------

let ctx: AudioContext | null = null;
let master: GainNode | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AC: typeof AudioContext | undefined =
    window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  if (!ctx) {
    try {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5; // keep the whole layer gentle regardless of per-cue gains
      master.connect(ctx.destination);
    } catch {
      ctx = null;
      return null;
    }
  }
  // A context may start suspended until a gesture resumes it.
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

/**
 * Register one-shot listeners that create + resume the AudioContext on the first
 * user gesture. Building the context INSIDE a gesture avoids the browser's
 * "AudioContext was not allowed to start" console warning. Idempotent.
 */
let unlockArmed = false;
export function initAudioUnlock(): void {
  if (unlockArmed || typeof window === "undefined") return;
  unlockArmed = true;
  const unlock = () => {
    getCtx();
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
    window.removeEventListener("touchstart", unlock);
  };
  window.addEventListener("pointerdown", unlock, { once: true });
  window.addEventListener("keydown", unlock, { once: true });
  window.addEventListener("touchstart", unlock, { once: true });
}

// ---- Tone helper -----------------------------------------------------------

interface ToneOpts {
  freq: number;
  dur: number;
  type?: OscillatorType;
  gain?: number;
  freqEnd?: number; // glide to this frequency over the note
  delay?: number; // start offset (seconds) — used to sequence little arpeggios
}

function tone(c: AudioContext, out: GainNode, o: ToneOpts): void {
  const t0 = c.currentTime + (o.delay ?? 0);
  const osc = c.createOscillator();
  const g = c.createGain();
  const peak = o.gain ?? 0.12;
  osc.type = o.type ?? "sine";
  osc.frequency.setValueAtTime(o.freq, t0);
  if (o.freqEnd) osc.frequency.exponentialRampToValueAtTime(o.freqEnd, t0 + o.dur);
  // Quick attack, exponential decay — soft, no clicks.
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(peak, t0 + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
  osc.connect(g).connect(out);
  osc.start(t0);
  osc.stop(t0 + o.dur + 0.03);
}

// Grade → a short sting that scales in pitch and brightness: A rises bright and
// triumphant, F sinks low and dull. Neutral C sits flat in the middle.
const GRADE_STING: Record<string, { f1: number; f2: number; type: OscillatorType }> = {
  A: { f1: 659, f2: 988, type: "triangle" }, // E5 → B5, rising, bright
  B: { f1: 587, f2: 784, type: "triangle" }, // D5 → G5, rising
  C: { f1: 523, f2: 523, type: "sine" }, //     C5 steady, plain
  D: { f1: 466, f2: 392, type: "sine" }, //     falling
  F: { f1: 349, f2: 262, type: "sine" }, //     low, deflating
};

/**
 * Play a named cue. No-ops when muted or when WebAudio is unavailable (Node,
 * old browsers) — never throws. `opts.grade` selects the grade sting's pitch.
 */
export function play(name: CueName, opts?: { grade?: string }): void {
  if (isMuted()) return;
  const c = getCtx();
  if (!c || !master) return;
  const m = master;
  switch (name) {
    case "send":
      // Soft tick — a single short blip, felt more than heard.
      tone(c, m, { freq: 660, dur: 0.05, type: "sine", gain: 0.05 });
      break;
    case "reveal":
      // Gentle rising two-note chime (a perfect fourth up).
      tone(c, m, { freq: 587, dur: 0.18, type: "sine", gain: 0.09 });
      tone(c, m, { freq: 880, dur: 0.24, type: "sine", gain: 0.09, delay: 0.11 });
      break;
    case "xp": {
      // Light coin-cascade riding under the count-up: a quick ascending sparkle.
      const notes = [1047, 1319, 1568, 1976, 2093];
      notes.forEach((f, i) => tone(c, m, { freq: f, dur: 0.07, type: "triangle", gain: 0.045, delay: i * 0.06 }));
      break;
    }
    case "levelup": {
      // Warm major sting — a C-major arpeggio landing on the octave (staggered).
      const chord = [523, 659, 784, 1047];
      chord.forEach((f, i) => tone(c, m, { freq: f, dur: 0.32, type: "triangle", gain: 0.075, delay: i * 0.05 }));
      break;
    }
    case "correct": {
      // Короткая восходящая терция: подтверждение, а не фанфары — в уроке таких
      // событий десятки, и празднование каждого быстро становится шумом.
      tone(c, m, { freq: 784, dur: 0.09, type: "sine", gain: 0.07 });
      tone(c, m, { freq: 1047, dur: 0.14, type: "sine", gain: 0.07, delay: 0.07 });
      break;
    }
    case "wrong":
      // Один низкий мягкий тон. Не «ошибка!», а «не то» — тон не должен
      // наказывать: ошибка в тренажёре и есть способ учиться.
      tone(c, m, { freq: 233, dur: 0.16, type: "sine", gain: 0.06 });
      break;
    case "grade": {
      const s = GRADE_STING[opts?.grade ?? "C"] ?? GRADE_STING.C;
      tone(c, m, { freq: s.f1, dur: 0.16, type: s.type, gain: 0.1 });
      if (s.f2 !== s.f1) tone(c, m, { freq: s.f2, dur: 0.26, type: s.type, gain: 0.1, delay: 0.13 });
      break;
    }
  }
}

/**
 * Light haptic tap (mobile only, guarded). Respects mute: when muted there is
 * neither sound NOR vibration. No-ops where `navigator.vibrate` is absent.
 */
export function haptic(ms = 15): void {
  if (isMuted()) return;
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") navigator.vibrate(ms);
  } catch {
    /* some browsers throw if called outside a gesture — ignore */
  }
}
