// Loud emergency siren (Web Audio) plus vibration. No audio file: a sweeping square wave is generated,
// so it works offline. Browsers only allow audio after a user gesture, so unlockSiren() is called from
// the SOS press; startSiren() then works even though the hold timer fires later.

const MUTE_KEY = "raksha.siren.muted";

let ctx: AudioContext | null = null;
let nodes: { osc: OscillatorNode; lfo: OscillatorNode; gain: GainNode } | null = null;
let vibrateTimer: ReturnType<typeof setInterval> | null = null;

export function isSirenMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setSirenMuted(muted: boolean) {
  try {
    localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch {
    // storage unavailable: the choice only lasts for this emergency
  }
}

/** Call from a user gesture (pointer/key down). Safe to call repeatedly. */
export function unlockSiren() {
  if (typeof window === "undefined") return;
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    ctx ??= new Ctor();
    if (ctx.state === "suspended") void ctx.resume();
  } catch {
    // audio unsupported: the visual alert and vibration still work
  }
}

export function startSiren() {
  if (typeof window === "undefined" || nodes || isSirenMuted()) return;
  unlockSiren();
  if (!ctx) return;
  try {
    const osc = ctx.createOscillator();
    const lfo = ctx.createOscillator();
    const lfoDepth = ctx.createGain();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = 1100; // centre of the sweep
    lfo.type = "triangle";
    lfo.frequency.value = 1.6; // ~1.6 sweeps per second: a two-tone wail
    lfoDepth.gain.value = 450; // sweeps 650 Hz to 1550 Hz
    lfo.connect(lfoDepth).connect(osc.frequency);
    gain.gain.value = 0.9;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    lfo.start();
    nodes = { osc, lfo, gain };
  } catch {
    nodes = null;
  }
  if ("vibrate" in navigator && !vibrateTimer) {
    const buzz = () => navigator.vibrate([400, 200, 400, 200, 400]);
    buzz();
    vibrateTimer = setInterval(buzz, 2000);
  }
}

export function stopSiren() {
  if (nodes) {
    try {
      nodes.osc.stop();
      nodes.lfo.stop();
      nodes.osc.disconnect();
      nodes.gain.disconnect();
    } catch {
      // already stopped
    }
    nodes = null;
  }
  if (vibrateTimer) {
    clearInterval(vibrateTimer);
    vibrateTimer = null;
    if ("vibrate" in navigator) navigator.vibrate(0);
  }
}
