import { playCue } from "./audio";

export const THUMB = 40;
export const INSET = 6;

export type FontChoice = "system" | "modern" | "readable";
export type TextSize = "default" | "large";
export type Prefs = {
  sound: boolean;
  music: boolean;
  haptics: boolean;
  highlights: boolean;
  font: FontChoice;
  text: TextSize;
};

const KEY = "sudoku.prefs";
const defaults: Prefs = { sound: false, music: false, haptics: true, highlights: true, font: "system", text: "default" };

export function prefs(): Prefs {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "") as Partial<Prefs>;
    const font = saved.font === "modern" || saved.font === "readable" ? saved.font : defaults.font;
    const text = saved.text === "large" ? saved.text : defaults.text;
    return { ...defaults, ...saved, font, text };
  } catch {
    return defaults;
  }
}

export function appearance(font: FontChoice, text: TextSize) {
  return {
    font: font === "modern" || font === "readable" ? font : "",
    text: text === "large" ? "large" : "",
  };
}

export function applyAppearance(font: FontChoice, text: TextSize) {
  const next = appearance(font, text);
  if (next.font) document.documentElement.dataset.font = next.font;
  else delete document.documentElement.dataset.font;
  if (next.text) document.documentElement.dataset.text = next.text;
  else delete document.documentElement.dataset.text;
}

export function savePrefs(next: Prefs) {
  localStorage.setItem(KEY, JSON.stringify(next));
}

export function thumbOffset(value: number, width: number): number {
  const travel = Math.max(0, width - INSET * 2 - THUMB);
  return INSET + clamp(value) * travel;
}

export function valueFromPointer(clientX: number, left: number, width: number): number {
  const travel = Math.max(1, width - INSET * 2 - THUMB);
  return clamp((clientX - left - INSET - THUMB / 2) / travel);
}

export function hapticsSupported(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
}

export function feel(kind: "tap" | "wrong" | "hint" | "done") {
  const chosen = prefs();
  const reduce = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (chosen.haptics && !reduce && hapticsSupported()) {
    navigator.vibrate(kind === "done" ? [10, 30, 10] : kind === "wrong" ? [16] : 8);
  }
  if (chosen.sound) playCue(kind);
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}
