import type { Level } from "./types";

/**
 * Head-to-head format used by speed Sudoku: both players get the same puzzle,
 * and the first correct completion wins.
 *
 * Clocks sit on published casual bands so a regular solver can finish:
 * easy 5–15 min, medium 15–30, hard 30–60, expert often 45+.
 * Caps: 15 / 20 / 30 / 40 minutes. At 0:00, more correct cells wins.
 * An exact tie refunds both stakes.
 */
export const MATCH_LIMIT_MS: Record<Level, number> = {
  easy: 15 * 60 * 1000,
  medium: 20 * 60 * 1000,
  hard: 30 * 60 * 1000,
  expert: 40 * 60 * 1000,
};

/** About $1. Staked matches use USDC so the amount does not drift with SOL. */
export const MIN_STAKE_USDC = 1;

export type Racer = {
  id: string;
  values: ArrayLike<number>;
  completedMs: number | null;
};

export type Verdict =
  | { outcome: "win"; winnerId: string; reason: "finished-first" | "more-correct" }
  | { outcome: "draw"; reason: "same-time" | "same-progress" };

export function correctCells(values: ArrayLike<number>, solution: ArrayLike<number>): number {
  let n = 0;
  for (let i = 0; i < 81; i++) if (values[i] && values[i] === solution[i]) n++;
  return n;
}

export function isExactSolution(values: ArrayLike<number>, solution: ArrayLike<number>): boolean {
  for (let i = 0; i < 81; i++) if (values[i] !== solution[i]) return false;
  return true;
}

export function judgeMatch(
  a: Racer,
  b: Racer,
  solution: ArrayLike<number>,
  limitMs: number,
): Verdict {
  const aTime = validFinish(a, solution, limitMs);
  const bTime = validFinish(b, solution, limitMs);
  if (aTime !== null && bTime !== null) {
    if (aTime === bTime) return { outcome: "draw", reason: "same-time" };
    return {
      outcome: "win",
      winnerId: aTime < bTime ? a.id : b.id,
      reason: "finished-first",
    };
  }
  if (aTime !== null) return { outcome: "win", winnerId: a.id, reason: "finished-first" };
  if (bTime !== null) return { outcome: "win", winnerId: b.id, reason: "finished-first" };

  const aScore = correctCells(a.values, solution);
  const bScore = correctCells(b.values, solution);
  if (aScore === bScore) return { outcome: "draw", reason: "same-progress" };
  return {
    outcome: "win",
    winnerId: aScore > bScore ? a.id : b.id,
    reason: "more-correct",
  };
}

function validFinish(racer: Racer, solution: ArrayLike<number>, limitMs: number): number | null {
  if (racer.completedMs === null || racer.completedMs > limitMs) return null;
  if (!isExactSolution(racer.values, solution)) return null;
  return racer.completedMs;
}

/** Slider position is a 0–1 fraction of the track. Three misses and the gate fails. */
export function captchaHit(target: number, value: number, tolerance = 0.035): boolean {
  return Math.abs(target - value) <= tolerance;
}
