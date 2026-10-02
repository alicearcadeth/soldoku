import { clueCount, mulberry32, shuffle } from "./grid";
import { grade } from "./grade";
import { countSolutions, fillSolution } from "./solve";
import {
  BAND_RANK,
  CLUE_WINDOW,
  type Level,
  type Puzzle,
  type Technique,
} from "./types";

const BUDGET_MS: Record<Level, number> = {
  easy: 4000,
  medium: 8000,
  hard: 12000,
  expert: 20000,
};

export function generatePuzzle(level: Level, seed?: number): Puzzle {
  const random = seed === undefined ? Math.random : mulberry32(seed);
  const deadline = Date.now() + BUDGET_MS[level];
  const target = BAND_RANK[level];
  const window = CLUE_WINDOW[level];
  let attempts = 0;

  while (Date.now() < deadline) {
    attempts++;
    const solution = fillSolution(random);
    const grid = solution.slice();
    const groups = removalGroups(random);
    let best: Uint8Array | null = null;
    let technique: Technique | null = null;

    for (const group of groups) {
      const next = grid.slice();
      for (const index of group) next[index] = 0;
      if (clueCount(next) < window.min) continue;
      if (countSolutions(next, 2) !== 1) continue;
      const graded = grade(next, target);
      if (!graded.solved || graded.rank > target || !graded.technique) continue;
      grid.set(next);
      if (graded.rank === target && clueCount(grid) <= window.max) {
        best = grid.slice();
        technique = graded.technique;
      }
    }

    if (best && technique) {
      const checked = grade(best);
      if (
        checked.solved &&
        checked.rank === target &&
        sameDigits(best, solution) &&
        countSolutions(best, 2) === 1
      ) {
        return {
          level,
          givens: Array.from(best),
          solution: Array.from(solution),
          technique,
          clueCount: clueCount(best),
        };
      }
    }
  }

  throw new Error(`Could not generate a ${level} puzzle after ${attempts} attempts`);
}

function removalGroups(random: () => number): number[][] {
  const groups: number[][] = [];
  const seen = new Set<number>();
  for (let i = 0; i < 81; i++) {
    if (seen.has(i)) continue;
    const pair = 80 - i;
    seen.add(i);
    seen.add(pair);
    groups.push(i === pair ? [i] : [i, pair]);
  }
  return shuffle(groups, random);
}

function sameDigits(givens: Uint8Array, solution: Uint8Array): boolean {
  for (let i = 0; i < 81; i++) if (givens[i] && givens[i] !== solution[i]) return false;
  return true;
}
