/** Shared launch timing keeps the visual shells and their explosions in sync. */
export const FIREWORK_FLIGHT = 0.45;
export const FIREWORK_CELEBRATION_MS = 6800;
export const FIREWORKS = [
  { x: 50, y: 28, delay: 0, color: "#ffd166" },
  { x: 18, y: 21, delay: 0.35, color: "#14f195" },
  { x: 83, y: 25, delay: 0.55, color: "#c18bff" },
  { x: 24, y: 64, delay: 0.9, color: "#00d9ff" },
  { x: 78, y: 59, delay: 1.1, color: "#ff719d" },
  { x: 48, y: 16, delay: 1.4, color: "#ffe9a3" },
  { x: 12, y: 40, delay: 1.65, color: "#ffd166" },
  { x: 90, y: 40, delay: 1.8, color: "#14f195" },
  { x: 35, y: 27, delay: 2.1, color: "#c18bff" },
  { x: 70, y: 19, delay: 2.2, color: "#00d9ff" },
  { x: 20, y: 72, delay: 2.45, color: "#ff719d" },
  { x: 85, y: 73, delay: 2.55, color: "#ffe9a3" },
  { x: 50, y: 55, delay: 2.8, color: "#ffd166" },
  { x: 15, y: 22, delay: 3.1, color: "#14f195" },
  { x: 82, y: 22, delay: 3.15, color: "#ff719d" },
  { x: 36, y: 68, delay: 3.45, color: "#00d9ff" },
  { x: 67, y: 67, delay: 3.5, color: "#c18bff" },
  { x: 20, y: 35, delay: 3.9, color: "#ffe9a3" },
  { x: 80, y: 35, delay: 3.98, color: "#ffe9a3" },
  { x: 50, y: 26, delay: 4.1, color: "#ffd166" },
] as const;
