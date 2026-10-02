export const ALL_DIGITS = 0x3fe;

export const UNITS: number[][] = (() => {
  const units: number[][] = [];
  for (let r = 0; r < 9; r++) {
    const row: number[] = [];
    for (let c = 0; c < 9; c++) row.push(r * 9 + c);
    units.push(row);
  }
  for (let c = 0; c < 9; c++) {
    const col: number[] = [];
    for (let r = 0; r < 9; r++) col.push(r * 9 + c);
    units.push(col);
  }
  for (let b = 0; b < 9; b++) {
    const r0 = Math.floor(b / 3) * 3;
    const c0 = (b % 3) * 3;
    const box: number[] = [];
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) box.push((r0 + r) * 9 + c0 + c);
    }
    units.push(box);
  }
  return units;
})();

export const BOXES = UNITS.slice(18);

export const PEERS: number[][] = Array.from({ length: 81 }, (_, index) => {
  const set = new Set<number>();
  for (const unit of UNITS) {
    if (!unit.includes(index)) continue;
    for (const cell of unit) if (cell !== index) set.add(cell);
  }
  return [...set];
});

export function rowOf(index: number): number {
  return Math.floor(index / 9);
}

export function colOf(index: number): number {
  return index % 9;
}

export function boxOf(index: number): number {
  return Math.floor(rowOf(index) / 3) * 3 + Math.floor(colOf(index) / 3);
}

export function pop(mask: number): number {
  let count = 0;
  let n = mask & 0x3ff;
  while (n) {
    n &= n - 1;
    count++;
  }
  return count;
}

export function onlyDigit(mask: number): number {
  return Math.log2(mask & -mask);
}

export function shuffle<T>(items: T[], random: () => number): T[] {
  const copy = items.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function combinations(items: number[], size: number): number[][] {
  const out: number[][] = [];
  const buf: number[] = [];
  const walk = (start: number) => {
    if (buf.length === size) {
      out.push(buf.slice());
      return;
    }
    for (let i = start; i <= items.length - (size - buf.length); i++) {
      buf.push(items[i]);
      walk(i + 1);
      buf.pop();
    }
  };
  if (size > 0 && items.length >= size) walk(0);
  return out;
}

export function clueCount(grid: ArrayLike<number>): number {
  let n = 0;
  for (let i = 0; i < 81; i++) if (grid[i]) n++;
  return n;
}

export function isValidComplete(grid: ArrayLike<number>): boolean {
  if (grid.length < 81) return false;
  for (const unit of UNITS) {
    let seen = 0;
    for (const index of unit) {
      const value = grid[index];
      if (value < 1 || value > 9) return false;
      const bit = 1 << value;
      if (seen & bit) return false;
      seen |= bit;
    }
  }
  return true;
}

export function peerConflicts(values: ArrayLike<number>): boolean[] {
  const bad = Array<boolean>(81).fill(false);
  for (const unit of UNITS) {
    const seen = new Map<number, number[]>();
    for (const index of unit) {
      const value = values[index];
      if (!value) continue;
      const list = seen.get(value);
      if (list) list.push(index);
      else seen.set(value, [index]);
    }
    for (const list of seen.values()) {
      if (list.length < 2) continue;
      for (const index of list) bad[index] = true;
    }
  }
  return bad;
}
