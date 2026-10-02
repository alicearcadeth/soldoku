import {
  ALL_DIGITS,
  BOXES,
  boxOf,
  colOf,
  combinations,
  PEERS,
  pop,
  onlyDigit,
  rowOf,
  UNITS,
} from "./grid";
import { TECHNIQUE_RANK, type Technique } from "./types";

export type State = {
  grid: Uint8Array;
  cand: Uint16Array;
};

const STEPS: { name: Technique; run: (state: State) => boolean }[] = [
  { name: "naked-single", run: nakedSingle },
  { name: "hidden-single", run: hiddenSingle },
  { name: "naked-pair", run: (state) => nakedSet(state, 2) },
  { name: "hidden-pair", run: (state) => hiddenSet(state, 2) },
  { name: "pointing", run: pointing },
  { name: "claiming", run: claiming },
  { name: "naked-triple", run: (state) => nakedSet(state, 3) },
  { name: "hidden-triple", run: (state) => hiddenSet(state, 3) },
  { name: "x-wing", run: xWing },
];

export function analyze(source: ArrayLike<number>): State {
  const grid = Uint8Array.from(source);
  const rows = new Uint16Array(9);
  const cols = new Uint16Array(9);
  const boxes = new Uint16Array(9);
  for (let i = 0; i < 81; i++) {
    if (!grid[i]) continue;
    const bit = 1 << grid[i];
    rows[rowOf(i)] |= bit;
    cols[colOf(i)] |= bit;
    boxes[boxOf(i)] |= bit;
  }
  const cand = new Uint16Array(81);
  for (let i = 0; i < 81; i++) {
    if (grid[i]) continue;
    cand[i] = ALL_DIGITS & ~rows[rowOf(i)] & ~cols[colOf(i)] & ~boxes[boxOf(i)];
  }
  return { grid, cand };
}

export type Grade = {
  solved: boolean;
  technique: Technique | null;
  rank: number;
  grid: Uint8Array;
};

export function grade(source: ArrayLike<number>, maxRank = 4): Grade {
  const state = analyze(source);
  let technique: Technique | null = null;
  for (let guard = 0; guard < 300; guard++) {
    if (isFull(state.grid)) {
      return { solved: true, technique, rank: technique ? TECHNIQUE_RANK[technique] : 0, grid: state.grid };
    }
    if (contradiction(state)) break;
    let moved = false;
    for (const step of STEPS) {
      if (TECHNIQUE_RANK[step.name] > maxRank) break;
      if (!step.run(state)) continue;
      if (!technique || TECHNIQUE_RANK[step.name] > TECHNIQUE_RANK[technique]) {
        technique = step.name;
      }
      moved = true;
      break;
    }
    if (!moved) break;
  }
  return {
    solved: isFull(state.grid),
    technique,
    rank: technique ? TECHNIQUE_RANK[technique] : 0,
    grid: state.grid,
  };
}

export type Hint = {
  technique: Technique | "check" | "none";
  index: number | null;
  digit: number | null;
  cells: number[];
  cuts: number[];
  cleared: number;
  text: string;
};

export function playerHint(values: ArrayLike<number>, solution: ArrayLike<number>, deduced: ArrayLike<number> = []): Hint {
  for (let index = 0; index < 81; index++) {
    if (values[index] && values[index] !== solution[index]) {
      return {
        technique: "check",
        index,
        digit: null,
        cells: [index],
        cuts: [],
        cleared: 0,
        text: "That cell does not fit. Erase it, then ask again.",
      };
    }
  }
  return nextHint(values, deduced) ?? {
    technique: "none",
    index: null,
    digit: null,
    cells: [],
    cuts: [],
    cleared: 0,
    text: "No supported step is left with the techniques in this game.",
  };
}

export function nextHint(source: ArrayLike<number>, deduced: ArrayLike<number> = []): Hint | null {
  const state = analyze(source);
  for (let cell = 0; cell < 81; cell++) {
    if (state.grid[cell] || !deduced[cell]) continue;
    state.cand[cell] &= ~deduced[cell];
  }
  if (contradiction(state) || isFull(state.grid)) return null;
  for (const step of STEPS) {
    const beforeGrid = state.grid.slice();
    const beforeCand = state.cand.slice();
    if (!step.run(state)) continue;
    const placed = firstPlacement(beforeGrid, state.grid);
    if (placed) {
      return {
        technique: step.name,
        index: placed.index,
        digit: placed.digit,
        cells: [placed.index],
        cuts: [],
        cleared: 0,
        text: hintText(step.name, placed.index, placed.digit),
      };
    }
    const pattern = changedCandidates(beforeCand, state.cand);
    const cuts = pattern.map((cell) => beforeCand[cell] & ~state.cand[cell]);
    const cleared = removedBits(beforeCand, state.cand, pattern);
    for (let guard = 0; guard < 40; guard++) {
      let moved = false;
      for (const follow of STEPS) {
        if (follow.name !== "naked-single" && follow.name !== "hidden-single") continue;
        const gridBefore = state.grid.slice();
        if (!follow.run(state)) continue;
        moved = true;
        const next = firstPlacement(gridBefore, state.grid);
        if (next) {
          return {
            technique: step.name,
            index: next.index,
            digit: next.digit,
            cells: pattern,
            cuts,
            cleared,
            text: `${eliminationLead(step.name, pattern, cleared)} A single follows in another cell.`,
          };
        }
        break;
      }
      if (!moved) break;
    }
    return {
      technique: step.name,
      index: null,
      digit: null,
      cells: pattern,
      cuts,
      cleared,
      text: eliminationText(step.name, pattern, cleared),
    };
  }
  return null;
}

export function runStep(state: State, name: Technique): boolean {
  const step = STEPS.find((item) => item.name === name);
  if (!step) return false;
  return step.run(state);
}

function firstPlacement(before: ArrayLike<number>, grid: Uint8Array): { index: number; digit: number } | null {
  for (let cell = 0; cell < 81; cell++) {
    if (before[cell] === grid[cell]) continue;
    return { index: cell, digit: grid[cell] };
  }
  return null;
}

function changedCandidates(before: ArrayLike<number>, cand: Uint16Array): number[] {
  const cells: number[] = [];
  for (let cell = 0; cell < 81; cell++) if (before[cell] !== cand[cell]) cells.push(cell);
  return cells;
}

function removedBits(before: ArrayLike<number>, cand: Uint16Array, cells: number[]): number {
  let bits = 0;
  for (const cell of cells) bits |= before[cell] & ~cand[cell];
  return bits;
}

function digitWords(bits: number): string {
  const digits: number[] = [];
  for (let digit = 1; digit <= 9; digit++) if (bits & (1 << digit)) digits.push(digit);
  if (digits.length === 0) return "Those candidates";
  if (digits.length === 1) return `Digit ${digits[0]}`;
  return `Digits ${digits.slice(0, -1).join(", ")} and ${digits[digits.length - 1]}`;
}

function eliminationLead(technique: Technique, cells: number[], cleared: number): string {
  const names: Record<Technique, string> = {
    "naked-single": "Naked single: one cell has only one candidate.",
    "hidden-single": "Hidden single: a digit fits in only one cell of its row, column, or box.",
    "naked-pair": "Naked pair: two cells share the same two candidates.",
    "hidden-pair": "Hidden pair: two digits appear in only two cells.",
    pointing: "Pointing: a digit in a box is locked to one row or column.",
    claiming: "Claiming: a digit in a row or column is locked inside one box.",
    "naked-triple": "Naked triple: three cells share three candidates.",
    "hidden-triple": "Hidden triple: three digits are confined to three cells.",
    "x-wing": "X-Wing: a digit forms a rectangle.",
  };
  const rows = new Set(cells.map((cell) => Math.floor(cell / 9) + 1));
  const cols = new Set(cells.map((cell) => (cell % 9) + 1));
  const where = cells.length === 0
    ? "the marked cells"
    : rows.size === 1
      ? `row ${[...rows][0]}`
      : cols.size === 1
        ? `column ${[...cols][0]}`
        : "the marked cells";
  let count = 0;
  for (let digit = 1; digit <= 9; digit++) if (cleared & (1 << digit)) count += 1;
  const verb = count === 1 ? "leaves" : "leave";
  return `${names[technique]} ${digitWords(cleared)} ${verb} ${where}.`;
}

function eliminationText(technique: Technique, cells: number[], cleared: number): string {
  return `${eliminationLead(technique, cells, cleared)} This step does not fill a cell.`;
}

function hintText(technique: Technique, index: number | null, digit: number | null): string {
  const where = index === null ? "Look at the highlighted pattern." : `Look at row ${Math.floor(index / 9) + 1}, column ${(index % 9) + 1}.`;
  const names: Record<Technique, string> = {
    "naked-single": "Naked single: one cell has only one candidate.",
    "hidden-single": "Hidden single: a digit fits in only one cell of its row, column, or box.",
    "naked-pair": "Naked pair: two cells share the same two candidates, so those digits leave the rest of the unit.",
    "hidden-pair": "Hidden pair: two digits appear in only two cells, so other candidates leave those cells.",
    pointing: "Pointing: a digit in a box is locked to one row or column.",
    claiming: "Claiming: a digit in a row or column is locked inside one box.",
    "naked-triple": "Naked triple: three cells share three candidates.",
    "hidden-triple": "Hidden triple: three digits are confined to three cells.",
    "x-wing": "X-Wing: a digit forms a rectangle, so it leaves the crossing lines.",
  };
  if (digit === null) return `${names[technique]} ${where} This step removes candidates. It does not fill a cell.`;
  return `${names[technique]} ${where}`;
}

function isFull(grid: Uint8Array): boolean {
  for (let i = 0; i < 81; i++) if (!grid[i]) return false;
  return true;
}

function contradiction(state: State): boolean {
  for (let i = 0; i < 81; i++) if (!state.grid[i] && state.cand[i] === 0) return true;
  return false;
}

function place(state: State, index: number, digit: number) {
  state.grid[index] = digit;
  state.cand[index] = 0;
  const bit = 1 << digit;
  for (const peer of PEERS[index]) {
    if (state.grid[peer]) continue;
    state.cand[peer] &= ~bit;
  }
}

function nakedSingle(state: State): boolean {
  for (let i = 0; i < 81; i++) {
    if (state.grid[i] || pop(state.cand[i]) !== 1) continue;
    place(state, i, onlyDigit(state.cand[i]));
    return true;
  }
  return false;
}

function hiddenSingle(state: State): boolean {
  for (const unit of UNITS) {
    for (let digit = 1; digit <= 9; digit++) {
      const bit = 1 << digit;
      let found = -1;
      let count = 0;
      for (const index of unit) {
        if (state.grid[index] || (state.cand[index] & bit) === 0) continue;
        count++;
        found = index;
        if (count > 1) break;
      }
      if (count === 1 && pop(state.cand[found]) > 1) {
        place(state, found, digit);
        return true;
      }
    }
  }
  return false;
}

function nakedSet(state: State, size: number): boolean {
  for (const unit of UNITS) {
    const cells = unit.filter((index) => {
      if (state.grid[index]) return false;
      const count = pop(state.cand[index]);
      return count >= 2 && count <= size;
    });
    if (cells.length < size) continue;
    for (const combo of combinations(cells, size)) {
      let union = 0;
      for (const index of combo) union |= state.cand[index];
      if (pop(union) !== size) continue;
      let changed = false;
      const chosen = new Set(combo);
      for (const index of unit) {
        if (chosen.has(index) || state.grid[index]) continue;
        const next = state.cand[index] & ~union;
        if (next === state.cand[index]) continue;
        state.cand[index] = next;
        changed = true;
      }
      if (changed) return true;
    }
  }
  return false;
}

function hiddenSet(state: State, size: number): boolean {
  for (const unit of UNITS) {
    const digitCells: number[][] = Array.from({ length: 10 }, () => []);
    for (const index of unit) {
      if (state.grid[index]) continue;
      for (let digit = 1; digit <= 9; digit++) {
        if (state.cand[index] & (1 << digit)) digitCells[digit].push(index);
      }
    }
    const pool: number[] = [];
    for (let digit = 1; digit <= 9; digit++) if (digitCells[digit].length > 0) pool.push(digit);
    if (pool.length < size) continue;
    for (const combo of combinations(pool, size)) {
      const cells = new Set<number>();
      for (const digit of combo) for (const index of digitCells[digit]) cells.add(index);
      if (cells.size !== size) continue;
      const mask = combo.reduce((bits, digit) => bits | (1 << digit), 0);
      let changed = false;
      for (const index of cells) {
        const next = state.cand[index] & mask;
        if (next === state.cand[index]) continue;
        state.cand[index] = next;
        changed = true;
      }
      if (changed) return true;
    }
  }
  return false;
}

function pointing(state: State): boolean {
  for (let box = 0; box < 9; box++) {
    const cells = BOXES[box];
    for (let digit = 1; digit <= 9; digit++) {
      const bit = 1 << digit;
      const hits = cells.filter((index) => !state.grid[index] && state.cand[index] & bit);
      if (hits.length < 2) continue;
      const sameRow = hits.every((index) => rowOf(index) === rowOf(hits[0]));
      const sameCol = hits.every((index) => colOf(index) === colOf(hits[0]));
      if (!sameRow && !sameCol) continue;
      let changed = false;
      if (sameRow) {
        const row = rowOf(hits[0]);
        for (let col = 0; col < 9; col++) {
          const index = row * 9 + col;
          if (boxOf(index) === box || state.grid[index] || (state.cand[index] & bit) === 0) continue;
          state.cand[index] &= ~bit;
          changed = true;
        }
      } else {
        const col = colOf(hits[0]);
        for (let row = 0; row < 9; row++) {
          const index = row * 9 + col;
          if (boxOf(index) === box || state.grid[index] || (state.cand[index] & bit) === 0) continue;
          state.cand[index] &= ~bit;
          changed = true;
        }
      }
      if (changed) return true;
    }
  }
  return false;
}

function claiming(state: State): boolean {
  for (const base of ["row", "col"] as const) {
    for (let line = 0; line < 9; line++) {
      for (let digit = 1; digit <= 9; digit++) {
        const bit = 1 << digit;
        const hits: number[] = [];
        for (let cross = 0; cross < 9; cross++) {
          const index = base === "row" ? line * 9 + cross : cross * 9 + line;
          if (!state.grid[index] && state.cand[index] & bit) hits.push(index);
        }
        if (hits.length < 2) continue;
        const box = boxOf(hits[0]);
        if (!hits.every((index) => boxOf(index) === box)) continue;
        let changed = false;
        for (const index of BOXES[box]) {
          if (hits.includes(index) || state.grid[index] || (state.cand[index] & bit) === 0) continue;
          state.cand[index] &= ~bit;
          changed = true;
        }
        if (changed) return true;
      }
    }
  }
  return false;
}

function xWing(state: State): boolean {
  return fish(state, "row") || fish(state, "col");
}

function fish(state: State, base: "row" | "col"): boolean {
  for (let digit = 1; digit <= 9; digit++) {
    const bit = 1 << digit;
    const lines: { line: number; pos: [number, number] }[] = [];
    for (let line = 0; line < 9; line++) {
      const pos: number[] = [];
      for (let cross = 0; cross < 9; cross++) {
        const index = base === "row" ? line * 9 + cross : cross * 9 + line;
        if (!state.grid[index] && state.cand[index] & bit) pos.push(cross);
      }
      if (pos.length === 2) lines.push({ line, pos: [pos[0], pos[1]] });
    }
    for (let i = 0; i < lines.length; i++) {
      for (let j = i + 1; j < lines.length; j++) {
        const a = lines[i];
        const b = lines[j];
        if (a.pos[0] !== b.pos[0] || a.pos[1] !== b.pos[1]) continue;
        let changed = false;
        for (let line = 0; line < 9; line++) {
          if (line === a.line || line === b.line) continue;
          for (const cross of a.pos) {
            const index = base === "row" ? line * 9 + cross : cross * 9 + line;
            if (state.grid[index] || (state.cand[index] & bit) === 0) continue;
            state.cand[index] &= ~bit;
            changed = true;
          }
        }
        if (changed) return true;
      }
    }
  }
  return false;
}
