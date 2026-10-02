import { describe, expect, it } from "vitest";
import { judgeMatch, captchaHit, correctCells } from "./compete";
import { generatePuzzle } from "./generate";
import { analyze, grade, nextHint, playerHint, runStep } from "./grade";
import { isValidComplete, peerConflicts } from "./grid";
import { countSolutions, fillSolution } from "./solve";
import { BAND_RANK, CLUE_WINDOW, type Level } from "./types";

const solution = () => Array.from(fillSolution(() => 0.5));

describe("rules", () => {
  it("fills a valid grid with one solution", () => {
    const grid = fillSolution(() => 0.25);
    expect(isValidComplete(grid)).toBe(true);
    expect(countSolutions(grid, 2)).toBe(1);
  });

  it("flags duplicate digits in a unit", () => {
    const values = Array(81).fill(0);
    values[0] = 5;
    values[1] = 5;
    const bad = peerConflicts(values);
    expect(bad[0]).toBe(true);
    expect(bad[1]).toBe(true);
    expect(bad[2]).toBe(false);
  });
});

describe("techniques", () => {
  it("places a naked single", () => {
    const state = analyze(Array(81).fill(0));
    state.cand.fill(0);
    state.cand[0] = 1 << 4;
    expect(runStep(state, "naked-single")).toBe(true);
    expect(state.grid[0]).toBe(4);
  });

  it("eliminates a naked pair from the rest of the unit", () => {
    const state = analyze(Array(81).fill(0));
    state.cand.fill(0x3fe);
    state.cand[0] = (1 << 1) | (1 << 2);
    state.cand[1] = (1 << 1) | (1 << 2);
    state.cand[2] = (1 << 1) | (1 << 2) | (1 << 3);
    expect(runStep(state, "naked-pair")).toBe(true);
    expect(state.cand[2] & ((1 << 1) | (1 << 2))).toBe(0);
    expect(state.cand[2] & (1 << 3)).toBeGreaterThan(0);
  });
});

describe("hints", () => {
  it("points at a digit that matches the unique solution and hides it from the text", () => {
    const puzzle = generatePuzzle("easy");
    const hint = nextHint(puzzle.givens);
    expect(hint).not.toBeNull();
    if (hint?.index != null && hint.digit != null) {
      expect(puzzle.solution[hint.index]).toBe(hint.digit);
      expect(hint.text.includes("The digit is")).toBe(false);
    }
  });

  it("returns nothing once the grid is complete", () => {
    const puzzle = generatePuzzle("easy");
    expect(nextHint(puzzle.solution)).toBeNull();
  });

  it("points at a wrong entry instead of inventing a step", () => {
    const puzzle = generatePuzzle("easy");
    const values = puzzle.givens.slice();
    const open = values.findIndex((cell) => cell === 0);
    values[open] = puzzle.solution[open] === 9 ? 1 : 9;
    const hint = playerHint(values, puzzle.solution);
    expect(hint.technique).toBe("check");
    expect(hint.index).toBe(open);
    expect(hint.digit).toBeNull();
    expect(hint.text.includes("9")).toBe(false);
  });

  it("says when the remaining position has no supported step", () => {
    const puzzle = generatePuzzle("easy");
    expect(playerHint(puzzle.solution, puzzle.solution).technique).toBe("none");
  });
});

describe("generator", () => {
  const levels: Level[] = ["easy", "medium", "hard", "expert"];

  for (const level of levels) {
    it(
      `builds a unique ${level} puzzle in that technique band`,
      () => {
        const started = Date.now();
        const puzzle = generatePuzzle(level, 7);
        const full = grade(puzzle.givens);
        const below = grade(puzzle.givens, BAND_RANK[level] - 1);
        expect(countSolutions(puzzle.givens, 2)).toBe(1);
        expect(full.solved).toBe(true);
        expect(full.rank).toBe(BAND_RANK[level]);
        expect(Array.from(full.grid)).toEqual(puzzle.solution);
        expect(isValidComplete(puzzle.solution)).toBe(true);
        if (level !== "easy") expect(below.solved).toBe(false);
        expect(puzzle.clueCount).toBeGreaterThanOrEqual(CLUE_WINDOW[level].min);
        expect(puzzle.clueCount).toBeLessThanOrEqual(CLUE_WINDOW[level].max);
        console.log(
          `${level} clues=${puzzle.clueCount} tech=${puzzle.technique} ms=${Date.now() - started}`,
        );
      },
      25000,
    );
  }
});

describe("match", () => {
  const solved = solution();

  it("gives the win to the faster correct finish", () => {
    const verdict = judgeMatch(
      { id: "a", values: solved, completedMs: 90_000 },
      { id: "b", values: solved, completedMs: 70_000 },
      solved,
      15 * 60 * 1000,
    );
    expect(verdict).toEqual({ outcome: "win", winnerId: "b", reason: "finished-first" });
  });

  it("ignores a finish that does not match the solution", () => {
    const wrong = solved.slice();
    wrong[80] = wrong[80] === 1 ? 2 : 1;
    const verdict = judgeMatch(
      { id: "a", values: wrong, completedMs: 10_000 },
      { id: "b", values: solved, completedMs: 40_000 },
      solved,
      15 * 60 * 1000,
    );
    expect(verdict.outcome).toBe("win");
    if (verdict.outcome === "win") expect(verdict.winnerId).toBe("b");
  });

  it("uses correct cells when nobody finishes", () => {
    const a = Array(81).fill(0);
    const b = Array(81).fill(0);
    a[0] = solved[0];
    a[1] = solved[1];
    b[0] = solved[0];
    const verdict = judgeMatch(
      { id: "a", values: a, completedMs: null },
      { id: "b", values: b, completedMs: null },
      solved,
      1000,
    );
    expect(verdict).toEqual({ outcome: "win", winnerId: "a", reason: "more-correct" });
    expect(correctCells(a, solved)).toBe(2);
  });

  it("refunds an exact progress tie", () => {
    const verdict = judgeMatch(
      { id: "a", values: Array(81).fill(0), completedMs: null },
      { id: "b", values: Array(81).fill(0), completedMs: null },
      solved,
      1000,
    );
    expect(verdict).toEqual({ outcome: "draw", reason: "same-progress" });
  });

  it("accepts a slider only inside the tolerance", () => {
    expect(captchaHit(0.7, 0.72)).toBe(true);
    expect(captchaHit(0.7, 0.2)).toBe(false);
  });
});
