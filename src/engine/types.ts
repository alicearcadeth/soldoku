export type Level = "easy" | "medium" | "hard" | "expert";

export type Technique =
  | "naked-single"
  | "hidden-single"
  | "naked-pair"
  | "hidden-pair"
  | "pointing"
  | "claiming"
  | "naked-triple"
  | "hidden-triple"
  | "x-wing";

export type Puzzle = {
  level: Level;
  givens: number[];
  solution: number[];
  technique: Technique;
  clueCount: number;
};

export const LEVELS: Level[] = ["easy", "medium", "hard", "expert"];

/** Hardest technique that defines each published band. */
export const BAND_RANK: Record<Level, number> = {
  easy: 1,
  medium: 2,
  hard: 3,
  expert: 4,
};

export const TECHNIQUE_RANK: Record<Technique, number> = {
  "naked-single": 1,
  "hidden-single": 1,
  "naked-pair": 2,
  "hidden-pair": 2,
  pointing: 2,
  claiming: 2,
  "naked-triple": 3,
  "hidden-triple": 3,
  "x-wing": 4,
};

/**
 * Clue windows are a sanity band. The label itself is the hardest technique,
 * matching how Sudoku.com / NYT-style ladders are actually graded.
 * Easy: singles. Medium: pairs and locked candidates. Hard: triples. Expert: X-Wing.
 */
export const CLUE_WINDOW: Record<Level, { min: number; max: number }> = {
  easy: { min: 36, max: 45 },
  medium: { min: 28, max: 36 },
  hard: { min: 24, max: 32 },
  expert: { min: 22, max: 28 },
};
