import { FIREWORKS, FIREWORK_FLIGHT } from "./fireworks";
/**
 * Original tones synthesized in the browser. No recorded music and no third-party file.
 * Music stays off until the player turns it on, then fades in quietly.
 */

type Cue = "tap" | "wrong" | "hint" | "done";

let context: AudioContext | null = null;
let wanted = false;
let held = false;
let armed = false;
let step = 0;
let timer = 0;
let idleTimer = 0;
let cueEndsAt = 0;
const NOTES = [220, 247, 262, 294, 262, 247];

function audioContext(): AudioContext | null {
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  context ??= new Ctx();
  return context;
}

/** One shared idle deadline keeps overlapping effects from cutting each other off. */
function idleAfter(audio: AudioContext, end: number) {
  cueEndsAt = Math.max(cueEndsAt, end);
  window.clearTimeout(idleTimer);
  if (!wanted) {
    idleTimer = window.setTimeout(() => {
      if (!wanted && context?.state === "running") void context.suspend();
    }, Math.ceil((cueEndsAt - audio.currentTime + 0.08) * 1000));
  }
}

function tone(frequency: number, seconds: number, peak: number) {
  const audio = audioContext();
  if (!audio || document.visibilityState === "hidden" || held) return;
  if (audio.state === "suspended") void audio.resume();
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = "triangle";
  osc.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, audio.currentTime);
  gain.gain.exponentialRampToValueAtTime(peak, audio.currentTime + 0.03);
  gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + seconds);
  osc.connect(gain);
  gain.connect(audio.destination);
  osc.start();
  osc.stop(audio.currentTime + seconds + 0.02);
  idleAfter(audio, audio.currentTime + seconds + 0.02);
}

/** Rocket whistles, deep explosions, and scattered crackles timed to the visual shells. */
function victory() {
  const audio = audioContext();
  if (!audio || document.visibilityState === "hidden" || held) return;
  if (audio.state === "suspended") void audio.resume();
  const start = audio.currentTime + 0.01;
  const master = audio.createGain();
  master.gain.value = 0.8;
  const limiter = audio.createDynamicsCompressor();
  limiter.threshold.value = -12; limiter.knee.value = 8; limiter.ratio.value = 12;
  limiter.attack.value = 0.003; limiter.release.value = 0.18;
  master.connect(limiter); limiter.connect(audio.destination);
  const noise = audio.createBuffer(1, audio.sampleRate, audio.sampleRate);
  const samples = noise.getChannelData(0);
  let seed = 23;
  for (let i = 0; i < samples.length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    samples[i] = seed / 2147483648 - 1;
  }
  function sweep(frequency: number, endFrequency: number, at: number, duration: number, peak: number) {
    const osc = audio!.createOscillator();
    const gain = audio!.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(frequency, at);
    osc.frequency.exponentialRampToValueAtTime(endFrequency, at + duration * 0.8);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(peak, at + Math.min(0.03, duration * 0.1));
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    osc.connect(gain); gain.connect(master);
    osc.start(at); osc.stop(at + duration + 0.02);
  }
  function hiss(at: number, duration: number, peak: number, frequency: number, endFrequency: number, type: BiquadFilterType) {
    const source = audio!.createBufferSource();
    const filter = audio!.createBiquadFilter();
    const gain = audio!.createGain();
    source.buffer = noise;
    filter.type = type; filter.Q.value = 0.5;
    filter.frequency.setValueAtTime(frequency, at);
    filter.frequency.exponentialRampToValueAtTime(endFrequency, at + duration);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(peak, at + Math.min(0.015, duration * 0.1));
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    source.connect(filter); filter.connect(gain); gain.connect(master);
    source.start(at, 0, duration); source.stop(at + duration + 0.02);
  }
  FIREWORKS.forEach((shell, index) => {
    const launch = start + shell.delay;
    const boom = launch + FIREWORK_FLIGHT;
    const finale = index >= FIREWORKS.length - 3;
    sweep(850 + index * 80, 1900 + index * 90, launch, FIREWORK_FLIGHT, 0.035);
    hiss(launch, FIREWORK_FLIGHT, 0.065, 1300, 3300, "bandpass");
    sweep(finale ? 180 : 145, 42, boom, 0.65, finale ? 0.38 : 0.28);
    // A sharp broad impact carries the explosion on phone speakers; the bass adds weight.
    hiss(boom, 0.62, finale ? 0.65 : 0.48, 4800, 350, "lowpass");
    for (let spark = 0; spark < (finale ? 16 : 9); spark++) {
      const offset = 0.13 + spark * 0.031 + spark % 3 * 0.012;
      hiss(boom + offset, 0.025 + spark % 3 * 0.012, 0.1 + spark % 4 * 0.018, 1900 + spark % 5 * 380, 1400, "highpass");
    }
  });
  idleAfter(audio, start + FIREWORKS.at(-1)!.delay + FIREWORK_FLIGHT + 0.85);
}
export function playCue(kind: Cue) {
  const peak = kind === "wrong" ? 0.03 : 0.022;
  if (kind === "wrong") tone(196, 0.12, peak);
  else if (kind === "hint") tone(523, 0.1, peak);
  else if (kind === "done") victory();
  else tone(440, 0.06, peak);
}

function tick() {
  if (!wanted || held || document.visibilityState === "hidden") return;
  tone(NOTES[step % NOTES.length] ?? 220, 1.4, 0.012);
  step += 1;
}

function startLoop() {
  if (timer || !wanted || held || document.visibilityState === "hidden") return;
  const audio = audioContext();
  if (!audio) return;
  void audio.resume();
  tick();
  timer = window.setInterval(tick, 1800);
}

function stopLoop() {
  window.clearInterval(timer);
  timer = 0;
  if (context?.state === "running") void context.suspend();
}

export function setMusicWanted(next: boolean) {
  wanted = next;
  armed = next;
  if (next) startLoop();
  else stopLoop();
}

export function setMusicHeld(next: boolean) {
  held = next;
  if (next) stopLoop();
  else if (wanted) startLoop();
}

export function syncMusicFromPage() {
  if (document.visibilityState === "hidden" || held) stopLoop();
  else if (wanted) startLoop();
}

/** A returning player who already chose music hears it after the next tap, not at full volume on launch. */
export function armSavedMusic(enabled: boolean) {
  armed = enabled;
  if (!enabled) return;
  const start = () => {
    window.removeEventListener("pointerdown", start);
    if (armed) setMusicWanted(true);
  };
  window.addEventListener("pointerdown", start);
}
