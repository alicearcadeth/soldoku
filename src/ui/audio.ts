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
const NOTES = [220, 247, 262, 294, 262, 247];

function audioContext(): AudioContext | null {
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  context ??= new Ctx();
  return context;
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
  if (!wanted) {
    window.setTimeout(() => {
      if (!wanted && context?.state === "running") void context.suspend();
    }, Math.ceil((seconds + 0.08) * 1000));
  }
}

export function playCue(kind: Cue) {
  const peak = kind === "done" ? 0.045 : kind === "wrong" ? 0.03 : 0.022;
  if (kind === "wrong") tone(196, 0.12, peak);
  else if (kind === "hint") tone(523, 0.1, peak);
  else if (kind === "done") {
    tone(392, 0.16, peak);
    window.setTimeout(() => tone(523, 0.22, peak), 90);
  } else tone(440, 0.06, peak);
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
