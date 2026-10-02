import type { Level } from "../engine/types";

const LEVELS = new Set(["easy", "medium", "hard", "expert"]);

export type PlayEvent =
  | { event: "start"; level: Level; audience: "player" | "check" }
  | { event: "hint"; stage: 1 | 2; audience: "player" | "check" }
  | { event: "finish"; level: Level; hints: number; reveals: number; mistakes: number; seconds: number; audience: "player" | "check" };

export function playEvent(body: unknown): PlayEvent | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const record = body as Record<string, unknown>;
  if (Array.isArray(record.solution) || Array.isArray(record.givens) || Array.isArray(record.values) || Array.isArray(record.grid)) {
    return null;
  }
  if ("wallet" in record || "room" in record || "board" in record) return null;
  const audience = record.audience === "player" ? "player" : "check";
  if (record.event === "start" && isLevel(record.level)) return { event: "start", level: record.level, audience };
  if (record.event === "hint" && (record.stage === 1 || record.stage === 2)) return { event: "hint", stage: record.stage, audience };
  if (record.event === "finish" && isLevel(record.level)) {
    const hints = count(record.hints, 81);
    const reveals = count(record.reveals, 81);
    const mistakes = count(record.mistakes, 99);
    const seconds = count(record.seconds, 86_400);
    if (hints == null || reveals == null || mistakes == null || seconds == null) return null;
    return { event: "finish", level: record.level, hints, reveals, mistakes, seconds, audience };
  }
  return null;
}

function isLevel(value: unknown): value is Level {
  return typeof value === "string" && LEVELS.has(value);
}

function count(value: unknown, max: number): number | null {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0 || number > max) return null;
  return number;
}
