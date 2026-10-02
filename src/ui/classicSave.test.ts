import { describe, expect, it } from "vitest";
import { boardFromPoll, classicProgress, nextClassicSave, parseClassicSave, type ClassicSave } from "./classicSave";

const board = {
  values: [0, 7],
  notes: [0, 0],
  deduced: [0, 0],
  mistakes: 0,
  level: "medium",
  puzzle: { givens: [0, 0] },
  elapsed: 10,
  selected: 1,
};

function save(revision: number, values: number[]): ClassicSave {
  return { ...board, revision, values, puzzle: { givens: [0, 0] } };
}

describe("classic save revisions", () => {
  it("bumps the revision only when the board changes", () => {
    const first = nextClassicSave(null, board, 0);
    expect(first.action).toBe("save");
    if (first.action !== "save") return;
    expect(first.save.revision).toBe(1);

    const clock = nextClassicSave(first.save, { ...board, values: first.save.values, elapsed: 14 }, 1);
    expect(clock.action).toBe("save");
    if (clock.action !== "save") return;
    expect(clock.save.revision).toBe(1);
    expect(clock.save.elapsed).toBe(14);
    expect(clock.save.values).toEqual([0, 7]);
  });

  it("adopts a newer board instead of overwriting it from a stale tab", () => {
    const stored = save(2, [7, 0]);
    const stale = { ...board, values: [0, 0], elapsed: 20, selected: 0 };
    expect(nextClassicSave(stored, stale, 1)).toEqual({ action: "adopt", save: stored });
  });

  it("replaces storage when the player starts a different puzzle", () => {
    const stored = save(4, [7, 0]);
    stored.puzzle = { givens: [1, 0] };
    const fresh = { ...board, puzzle: { givens: [0, 1] }, values: [0, 1] };
    const next = nextClassicSave(stored, fresh, 0);
    expect(next.action).toBe("save");
    if (next.action !== "save") return;
    expect(next.save.revision).toBe(5);
    expect(next.save.values).toEqual([0, 1]);
  });

  it("reads a save written before revisions existed", () => {
    const parsed = parseClassicSave(JSON.stringify({ ...board }));
    expect(parsed?.revision).toBe(0);
    expect(parsed?.values).toEqual([0, 7]);
    expect(parsed?.paused).toBe(false);
  });

  it("keeps a paused game paused across a reload", () => {
    const paused = parseClassicSave(JSON.stringify({ ...board, paused: true, elapsed: 42000 }));
    expect(paused?.paused).toBe(true);
    expect(paused?.elapsed).toBe(42000);
    const next = nextClassicSave(paused, { ...board, paused: true, elapsed: 42000 }, paused?.revision ?? 0);
    expect(next.action).toBe("save");
    if (next.action !== "save") return;
    expect(next.save.paused).toBe(true);
    expect(next.save.elapsed).toBe(42000);
  });
});

describe("classic progress", () => {
  it("treats a partial board as unfinished and a matching solution as solved", () => {
    const unfinished = { ...board, puzzle: { givens: [0, 0], solution: [1, 7] }, values: [0, 7] };
    expect(classicProgress(JSON.stringify(unfinished))).toBe("unfinished");
    const solved = { ...unfinished, values: [1, 7] };
    expect(classicProgress(JSON.stringify(solved))).toBe("solved");
    expect(classicProgress(null)).toBe("none");
  });
});

describe("race poll", () => {
  it("follows the server board when this tab has no move in flight", () => {
    expect(boardFromPoll([1, 0], [1, 2], 0)).toEqual([1, 2]);
    expect(boardFromPoll(null, [1, 2], 1)).toEqual([1, 2]);
  });

  it("keeps a digit that has not been acknowledged yet", () => {
    expect(boardFromPoll([1, 2], [1, 0], 1)).toEqual([1, 2]);
  });
});
