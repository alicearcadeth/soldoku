import { describe, expect, it } from "vitest";
import { countSolutions } from "../engine/solve";
import { generatePuzzle } from "../engine/generate";
import { CLUE_WINDOW } from "../engine/types";
import { MIN_FINISH_MS, MIN_MOVE_GAP_MS } from "./rooms";

describe("fair-play measurement", () => {
  it("solves a public easy grid well inside the finish floor", () => {
    const puzzle = generatePuzzle("easy", 1);
    const started = Date.now();
    expect(countSolutions(Uint8Array.from(puzzle.givens), 2)).toBe(1);
    const elapsed = Date.now() - started;
    expect(elapsed).toBeLessThan(MIN_FINISH_MS);
    const empties = 81 - CLUE_WINDOW.expert.min;
    expect(empties * MIN_MOVE_GAP_MS).toBeGreaterThan(MIN_FINISH_MS);
  });
});
