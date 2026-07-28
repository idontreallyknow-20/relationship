/**
 * The jar's sounds.
 *
 * Synthesised rather than sampled: no audio files to load, nothing to fetch,
 * and it works with the tab offline from the first tap. Everything is short,
 * soft and low, because this is a game you play in bed next to someone.
 *
 * The context is created on the first real gesture, which is the only moment a
 * browser will allow it, and is closed when the jar screen goes away.
 */

export type Cue =
  | "tap" | "crit" | "mega" | "charge" | "drop" | "collect"
  | "open" | "buy" | "unlock" | "tide";

interface Voice {
  /** Hertz at the start, and at the end of the slide. */
  from: number;
  to: number;
  seconds: number;
  gain: number;
  type: OscillatorType;
  /** A second oscillator a fifth or so up, for the louder cues. */
  harmonic?: number;
}

const VOICES: Record<Cue, Voice> = {
  tap: { from: 520, to: 660, seconds: 0.07, gain: 0.05, type: "sine" },
  crit: { from: 660, to: 990, seconds: 0.11, gain: 0.07, type: "triangle", harmonic: 1.5 },
  mega: { from: 440, to: 1320, seconds: 0.22, gain: 0.09, type: "triangle", harmonic: 2 },
  charge: { from: 200, to: 420, seconds: 0.3, gain: 0.05, type: "sine" },
  drop: { from: 300, to: 150, seconds: 0.16, gain: 0.06, type: "sine" },
  collect: { from: 720, to: 880, seconds: 0.09, gain: 0.05, type: "sine" },
  open: { from: 380, to: 760, seconds: 0.3, gain: 0.08, type: "triangle", harmonic: 1.5 },
  buy: { from: 600, to: 720, seconds: 0.06, gain: 0.04, type: "square" },
  unlock: { from: 520, to: 1040, seconds: 0.35, gain: 0.08, type: "sine", harmonic: 1.5 },
  tide: { from: 160, to: 520, seconds: 0.6, gain: 0.09, type: "sine", harmonic: 2 },
};

/** Never let a burst of taps stack into something loud. */
const MIN_GAP_MS = 28;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let lastAt = 0;

function context(): AudioContext | null {
  if (ctx) return ctx;
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext
    ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = 0.7;
    master.connect(ctx.destination);
    return ctx;
  } catch {
    // Autoplay policy, or no audio device. Silence is an acceptable outcome.
    return null;
  }
}

/**
 * Play one cue. `enabled` is the player's setting, passed in rather than read
 * from a store so this file stays free of React and of the save shape.
 */
export function play(cue: Cue, enabled: boolean): void {
  if (!enabled) return;
  const now = Date.now();
  if (now - lastAt < MIN_GAP_MS) return;
  lastAt = now;

  const audio = context();
  if (!audio || !master) return;
  if (audio.state === "suspended") void audio.resume().catch(() => {});

  const voice = VOICES[cue];
  const at = audio.currentTime;
  const envelope = audio.createGain();
  envelope.gain.setValueAtTime(0.0001, at);
  envelope.gain.exponentialRampToValueAtTime(voice.gain, at + 0.012);
  envelope.gain.exponentialRampToValueAtTime(0.0001, at + voice.seconds);
  envelope.connect(master);

  const tones: OscillatorNode[] = [];
  const add = (multiplier: number, gain: number) => {
    const osc = audio.createOscillator();
    osc.type = voice.type;
    osc.frequency.setValueAtTime(voice.from * multiplier, at);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, voice.to * multiplier), at + voice.seconds);
    if (gain === 1) {
      osc.connect(envelope);
    } else {
      const trim = audio.createGain();
      trim.gain.value = gain;
      osc.connect(trim);
      trim.connect(envelope);
    }
    tones.push(osc);
  };

  add(1, 1);
  if (voice.harmonic) add(voice.harmonic, 0.4);

  for (const osc of tones) {
    osc.start(at);
    osc.stop(at + voice.seconds + 0.02);
  }
  tones[0].onended = () => {
    for (const osc of tones) osc.disconnect();
    envelope.disconnect();
  };
}

/** Let go of the audio device when the jar closes. */
export function release(): void {
  if (!ctx) return;
  const closing = ctx;
  ctx = null;
  master = null;
  void closing.close().catch(() => {});
}
