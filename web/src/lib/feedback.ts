import { useState } from "react";

/**
 * Haptics and sound for the moments that matter: a coin when you log, a bloop when a
 * pot overflows, a little fanfare at inbox zero. Sounds are synthesised with Web Audio
 * (no files to download) and kept short and quiet. Vibration works on Android; iPhones
 * don't support it in web apps, so there it's sound only.
 * Both can be turned off in Settings; the choice is kept on this device.
 */

export type Cue =
  | "log" // saved an expense, or added money to a pot
  | "keep" // kept a charge from the Inbox
  | "toss" // tossed a charge
  | "delete"
  | "undo"
  | "error"
  | "celebrate" // inbox zero
  | "overflow" // a pot just went over budget
  | "target" // a saving pot hit its target
  | "fresh"; // started a new budget period

export type FeedbackPrefs = { sound: boolean; haptics: boolean };

const KEY = "lazy-ledger.feedback";
const DEFAULTS: FeedbackPrefs = { sound: true, haptics: true };

function load(): FeedbackPrefs {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<FeedbackPrefs>;
    return { sound: p.sound ?? DEFAULTS.sound, haptics: p.haptics ?? DEFAULTS.haptics };
  } catch {
    return DEFAULTS;
  }
}

let prefs = load();

/** Sound and haptics switches for Settings. */
export function useFeedbackPrefs() {
  const [state, setState] = useState(prefs);
  const update = (change: Partial<FeedbackPrefs>) => {
    prefs = { ...prefs, ...change };
    setState(prefs);
    try {
      localStorage.setItem(KEY, JSON.stringify(prefs));
    } catch {
      // Private mode: lasts until the app closes.
    }
  };
  return [state, update] as const;
}

export const canVibrate = () => typeof navigator !== "undefined" && "vibrate" in navigator;

const HAPTICS: Record<Cue, number | number[]> = {
  log: 15,
  keep: 15,
  toss: 10,
  delete: 25,
  undo: 10,
  error: [10, 40, 10],
  celebrate: [20, 60, 20],
  overflow: [30, 50, 30, 50, 60],
  target: [20, 60, 20, 60, 40],
  fresh: [15, 40, 15],
};

// ── Sound ────────────────────────────────────────────────────────────────────

let ctx: AudioContext | null = null;

/** Browsers only allow audio after a tap, so the context is created on the first one. */
function unlock() {
  if (ctx) {
    if (ctx.state === "suspended") void ctx.resume();
    return;
  }
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (Ctor) ctx = new Ctor();
}
if (typeof window !== "undefined") {
  window.addEventListener("pointerdown", unlock, { capture: true, passive: true });
  window.addEventListener("keydown", unlock, { capture: true });
}

const VOLUME = 0.14;

/** One note: a pitch (or a glide between two) with a quick attack and a soft tail. */
function tone(
  at: number,
  freq: number,
  length: number,
  { to, type = "sine", gain = 1 }: { to?: number; type?: OscillatorType; gain?: number } = {},
) {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  const t = ctx.currentTime + at;
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t + length);
  amp.gain.setValueAtTime(0.0001, t);
  amp.gain.exponentialRampToValueAtTime(VOLUME * gain, t + 0.008);
  amp.gain.exponentialRampToValueAtTime(0.0001, t + length);
  osc.connect(amp).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + length + 0.02);
}

const SOUNDS: Record<Cue, () => void> = {
  // Coin: B5 then E6, the classic pickup.
  log: () => {
    tone(0, 988, 0.08, { type: "triangle" });
    tone(0.07, 1319, 0.28, { type: "triangle" });
  },
  keep: () => {
    tone(0, 988, 0.07, { type: "triangle", gain: 0.8 });
    tone(0.06, 1319, 0.22, { type: "triangle", gain: 0.8 });
  },
  toss: () => tone(0, 700, 0.16, { to: 180, gain: 0.7 }),
  delete: () => tone(0, 240, 0.16, { to: 110, gain: 1.1 }),
  undo: () => {
    tone(0, 1319, 0.06, { type: "triangle", gain: 0.7 });
    tone(0.05, 988, 0.16, { type: "triangle", gain: 0.7 });
  },
  error: () => {
    tone(0, 220, 0.09, { type: "square", gain: 0.35 });
    tone(0.12, 196, 0.14, { type: "square", gain: 0.35 });
  },
  // C6 E6 G6 C7 arpeggio.
  celebrate: () => [1047, 1319, 1568, 2093].forEach((f, i) => tone(i * 0.08, f, i === 3 ? 0.4 : 0.14, { type: "triangle" })),
  // Two bubbles rising: liquid spilling over.
  overflow: () => {
    tone(0, 260, 0.12, { to: 720, gain: 1.2 });
    tone(0.14, 300, 0.12, { to: 880, gain: 1.1 });
    tone(0.3, 240, 0.18, { to: 620, gain: 0.9 });
  },
  target: () => [784, 1047, 1319, 1568].forEach((f, i) => tone(i * 0.1, f, i === 3 ? 0.45 : 0.16, { type: "triangle" })),
  // G5 C6 E6, slower and softer: a fresh start.
  fresh: () => [784, 1047, 1319].forEach((f, i) => tone(i * 0.13, f, 0.35, { gain: 0.8 })),
};

/** Play a cue: vibration and/or sound, as switched on in Settings. */
export function feedback(cue: Cue) {
  if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
  if (prefs.haptics && canVibrate()) navigator.vibrate(HAPTICS[cue]);
  if (prefs.sound) {
    try {
      unlock();
      if (ctx?.state === "running") SOUNDS[cue]();
      // Just woken by this tap: play once it's ready rather than dropping the sound.
      else if (ctx?.state === "suspended") void ctx.resume().then(() => SOUNDS[cue]()).catch(() => {});
    } catch {
      // Audio is a nicety; never let it break an action.
    }
  }
}
