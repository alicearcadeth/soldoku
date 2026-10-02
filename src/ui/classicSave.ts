export type ClassicBoard = {
  values: number[];
  notes: number[];
  deduced: number[];
  mistakes: number;
};

export type ClassicSave = ClassicBoard & {
  revision: number;
  level: string;
  puzzle: unknown;
  elapsed: number;
  selected: number;
  paused?: boolean;
};

function sameNumbers(left: number[], right: number[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function sameBoard(left: ClassicBoard, right: ClassicBoard): boolean {
  return left.mistakes === right.mistakes
    && sameNumbers(left.values, right.values)
    && sameNumbers(left.notes, right.notes)
    && sameNumbers(left.deduced, right.deduced);
}

function samePuzzle(stored: ClassicSave, local: Omit<ClassicSave, "revision">): boolean {
  const left = givensOf(stored.puzzle);
  const right = givensOf(local.puzzle);
  return left !== null && right !== null && sameNumbers(left, right);
}

function givensOf(puzzle: unknown): number[] | null {
  if (!puzzle || typeof puzzle !== "object" || !("givens" in puzzle)) return null;
  const givens = (puzzle as { givens?: unknown }).givens;
  return Array.isArray(givens) && givens.every((value) => typeof value === "number") ? givens : null;
}

/** Unfinished progress is the only Classic save a new puzzle should ask before replacing. */
export function classicProgress(raw: string | null): "none" | "unfinished" | "solved" {
  const saved = parseClassicSave(raw);
  if (!saved) return "none";
  const solution = (saved.puzzle as { solution?: unknown }).solution;
  if (!Array.isArray(solution) || solution.length !== saved.values.length) return "unfinished";
  return saved.values.every((value, index) => value === solution[index]) ? "solved" : "unfinished";
}

export function parseClassicSave(raw: string | null): ClassicSave | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ClassicSave>;
    if (!parsed.puzzle || !parsed.values || !parsed.notes || typeof parsed.level !== "string") return null;
    return {
      revision: typeof parsed.revision === "number" ? parsed.revision : 0,
      level: parsed.level,
      puzzle: parsed.puzzle,
      values: parsed.values,
      notes: parsed.notes,
      deduced: parsed.deduced?.length === parsed.values.length ? parsed.deduced : Array(parsed.values.length).fill(0),
      mistakes: parsed.mistakes ?? 0,
      elapsed: parsed.elapsed ?? 0,
      selected: parsed.selected ?? 0,
      paused: parsed.paused === true,
    };
  } catch {
    return null;
  }
}

/** A clock tick must not replace a newer board saved by another tab. */
export function nextClassicSave(
  stored: ClassicSave | null,
  local: Omit<ClassicSave, "revision">,
  seenRevision: number,
): { action: "save"; save: ClassicSave } | { action: "adopt"; save: ClassicSave } {
  if (stored && stored.revision > seenRevision && samePuzzle(stored, local) && !sameBoard(stored, local)) {
    return { action: "adopt", save: stored };
  }
  const changed = !stored || !sameBoard(stored, local);
  const revision = changed ? Math.max(seenRevision, stored?.revision ?? 0) + 1 : (stored?.revision ?? seenRevision);
  return { action: "save", save: { ...local, revision } };
}

/** Keep an optimistic race entry until its request finishes. Otherwise follow the server board. */
export function boardFromPoll(current: number[] | null, incoming: number[], movesInFlight: number): number[] {
  if (movesInFlight > 0 && current) return current;
  return incoming.slice();
}
