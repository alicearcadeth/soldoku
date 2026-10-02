import { describe, expect, it } from "vitest";
import { generatePuzzle } from "./generate";
import { nextHint, playerHint } from "./grade";
import type { Level } from "./types";

function walk(level: Level, seed: number) {
  const puzzle = generatePuzzle(level, seed);
  const values = puzzle.givens.slice();
  const deduced = Array(81).fill(0);
  const seen = new Set<string>();
  let repeats = 0;
  for (let step = 0; step < 120 && values.some((cell) => cell === 0); step++) {
    const hint = nextHint(values, deduced);
    if (!hint || hint.technique === "none") return { solved: false, unsupported: true, step };
    const key = `${hint.technique}:${hint.index}:${hint.cells.join(".")}:${hint.cleared}`;
    if (seen.has(key)) repeats += 1;
    seen.add(key);
    if (hint.digit != null && hint.index != null) {
      expect(hint.text.includes("does not fill a cell")).toBe(false);
      expect(puzzle.solution[hint.index]).toBe(hint.digit);
      values[hint.index] = hint.digit;
      deduced[hint.index] = 0;
      continue;
    }
    expect(hint.text.includes("does not fill a cell")).toBe(true);
    const named = [];
    for (let digit = 1; digit <= 9; digit++) if (hint.cleared & (1 << digit)) named.push(digit);
    expect(hint.text.includes(named.length === 1 ? `Digit ${named[0]} leaves` : "leave")).toBe(true);
    expect(hint.cells.length).toBe(hint.cuts.length);
    expect(hint.cleared).toBeGreaterThan(0);
    for (let i = 0; i < hint.cells.length; i++) deduced[hint.cells[i]] |= hint.cuts[i];
  }
  return { solved: values.every((cell, index) => cell === puzzle.solution[index]), unsupported: false, repeats };
}

describe("hint state", () => {
  it("does not treat a wrong entry as a deduction", () => {
    const puzzle = generatePuzzle("easy", 7);
    const values = puzzle.givens.slice();
    const empty = values.findIndex((cell) => cell === 0);
    values[empty] = puzzle.solution[empty] === 1 ? 2 : 1;
    const deduced = Array(81).fill(0);
    deduced[empty] = 1 << puzzle.solution[empty];
    const hint = playerHint(values, puzzle.solution, deduced);
    expect(hint.technique).toBe("check");
    expect(hint.index).toBe(empty);
  });
});

describe("full hint sessions", () => {
  const levels: Level[] = ["easy", "medium", "hard", "expert"];
  for (const level of levels) {
    for (const seed of [7, 11]) {
      it(`seed ${seed} ${level} advances after eliminations`, () => {
        const result = walk(level, seed);
        expect(result.unsupported).toBe(false);
        expect(result.solved).toBe(true);
        expect(result.repeats ?? 0).toBe(0);
      }, 25000);
    }
  }
});
