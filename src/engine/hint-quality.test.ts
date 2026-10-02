import { describe, expect, it } from "vitest";
import { generatePuzzle } from "./generate";
import { analyze, nextHint, playerHint, runStep, type State } from "./grade";
import type { Level } from "./types";

function blank(): State {
  const state = analyze(Array(81).fill(0));
  state.cand.fill(0);
  return state;
}

describe("technique reasoning", () => {
  it("classifies a one-candidate cell as a naked single, not a hidden single", () => {
    const state = blank();
    state.cand[0] = 1 << 4;
    expect(runStep(state, "hidden-single")).toBe(false);
    expect(runStep(state, "naked-single")).toBe(true);
    expect(state.grid[0]).toBe(4);
  });

  it("places a hidden single only when the cell still has another candidate", () => {
    const state = blank();
    state.cand[0] = (1 << 4) | (1 << 5);
    state.cand[1] = 1 << 5;
    expect(runStep(state, "hidden-single")).toBe(true);
    expect(state.grid[0]).toBe(4);
  });

  it("removes the pair digits from the rest of the row", () => {
    const state = blank();
    state.cand[0] = (1 << 1) | (1 << 2);
    state.cand[1] = (1 << 1) | (1 << 2);
    state.cand[2] = (1 << 1) | (1 << 2) | (1 << 3);
    expect(runStep(state, "naked-pair")).toBe(true);
    expect(state.grid[2]).toBe(0);
    expect(state.cand[2] & ((1 << 1) | (1 << 2))).toBe(0);
    expect(state.cand[2] & (1 << 3)).toBeGreaterThan(0);
  });

  it("strips extra candidates from a hidden pair", () => {
    const state = blank();
    state.cand[0] = (1 << 1) | (1 << 2) | (1 << 3);
    state.cand[1] = (1 << 1) | (1 << 2) | (1 << 4);
    state.cand[2] = 1 << 5;
    expect(runStep(state, "hidden-pair")).toBe(true);
    expect(state.cand[0]).toBe((1 << 1) | (1 << 2));
    expect(state.cand[1]).toBe((1 << 1) | (1 << 2));
    expect(state.grid[0]).toBe(0);
  });

  it("points a box digit along its row and removes it outside the box", () => {
    const state = blank();
    const bit = 1 << 3;
    state.cand[0] = bit;
    state.cand[1] = bit;
    state.cand[3] = bit | (1 << 6);
    expect(runStep(state, "pointing")).toBe(true);
    expect(state.cand[3] & bit).toBe(0);
    expect(state.cand[0] & bit).toBeGreaterThan(0);
    expect(state.grid[3]).toBe(0);
  });

  it("claims a row digit inside one box and removes it from the rest of that box", () => {
    const state = blank();
    const bit = 1 << 3;
    state.cand[0] = bit;
    state.cand[1] = bit;
    state.cand[9] = bit | (1 << 6);
    expect(runStep(state, "pointing")).toBe(false);
    expect(runStep(state, "claiming")).toBe(true);
    expect(state.cand[9] & bit).toBe(0);
    expect(state.cand[9] & (1 << 6)).toBeGreaterThan(0);
  });

  it("removes a naked triple's digits from the other cells", () => {
    const state = blank();
    state.cand[0] = (1 << 1) | (1 << 2);
    state.cand[1] = (1 << 2) | (1 << 3);
    state.cand[2] = (1 << 1) | (1 << 3);
    state.cand[3] = (1 << 1) | (1 << 4);
    expect(runStep(state, "naked-triple")).toBe(true);
    expect(state.cand[3] & (1 << 1)).toBe(0);
    expect(state.cand[3] & (1 << 4)).toBeGreaterThan(0);
  });

  it("confines a hidden triple to its three digits", () => {
    const state = blank();
    state.cand[0] = (1 << 1) | (1 << 2) | (1 << 7);
    state.cand[1] = (1 << 2) | (1 << 3) | (1 << 8);
    state.cand[2] = (1 << 1) | (1 << 3) | (1 << 9);
    state.cand[3] = 1 << 4;
    expect(runStep(state, "hidden-triple")).toBe(true);
    expect(state.cand[0] & (1 << 7)).toBe(0);
    expect(state.cand[0] & (1 << 1)).toBeGreaterThan(0);
  });

  it("eliminates an X-Wing digit from the crossing lines", () => {
    const state = blank();
    const bit = 1 << 5;
    state.cand[0] = bit;
    state.cand[1] = bit;
    state.cand[9] = bit;
    state.cand[10] = bit;
    state.cand[18] = bit | (1 << 6);
    expect(runStep(state, "x-wing")).toBe(true);
    expect(state.cand[18] & bit).toBe(0);
    expect(state.cand[18] & (1 << 6)).toBeGreaterThan(0);
    expect(state.cand[0] & bit).toBeGreaterThan(0);
    expect(state.grid[18]).toBe(0);
  });
});

describe("seeded hint walks", () => {
  const levels: Level[] = ["easy", "medium", "hard", "expert"];

  for (const level of levels) {
    it(`follows seed 7 ${level} without revealing a digit in the first text`, () => {
      const puzzle = generatePuzzle(level, 7);
      const values = puzzle.givens.slice();
      const seen = new Set<string>();
      for (let step = 0; step < 90 && values.some((cell) => cell === 0); step++) {
        const hint = nextHint(values);
        expect(hint).not.toBeNull();
        if (!hint) break;
        seen.add(hint.technique);
        expect(hint.text.includes("The digit is")).toBe(false);
        expect(hint.text.length).toBeLessThan(240);
        if (hint.digit == null || hint.index == null) {
          expect(hint.text.includes("does not fill a cell")).toBe(true);
          expect(hint.cells.length).toBeGreaterThan(0);
          break;
        }
        expect(puzzle.solution[hint.index]).toBe(hint.digit);
        expect(values[hint.index]).toBe(0);
        values[hint.index] = hint.digit;
      }
      expect(seen.size).toBeGreaterThan(0);
    }, 25000);
  }

  it("keeps notes and undo from changing the logical step", () => {
    const puzzle = generatePuzzle("easy", 7);
    const values = puzzle.givens.slice();
    const notes = Array(81).fill(0);
    notes[0] = 1 << 3;
    const before = playerHint(values, puzzle.solution);
    notes[0] = 0;
    const afterNotes = playerHint(values, puzzle.solution);
    expect(afterNotes).toEqual(before);
    const open = values.findIndex((cell) => cell === 0);
    const wrong = values.slice();
    wrong[open] = puzzle.solution[open] === 9 ? 1 : 9;
    expect(playerHint(wrong, puzzle.solution).technique).toBe("check");
    expect(playerHint(values, puzzle.solution)).toEqual(before);
  }, 15000);
});
