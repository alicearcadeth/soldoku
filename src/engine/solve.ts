import { ALL_DIGITS, boxOf, colOf, rowOf } from "./grid";

export function countSolutions(source: ArrayLike<number>, limit = 2): number {
  const grid = Uint8Array.from(source);
  const rows = new Uint16Array(9);
  const cols = new Uint16Array(9);
  const boxes = new Uint16Array(9);
  let filled = 0;
  for (let i = 0; i < 81; i++) {
    const value = grid[i];
    if (!value) continue;
    const bit = 1 << value;
    const row = rowOf(i);
    const col = colOf(i);
    const box = boxOf(i);
    if (rows[row] & bit || cols[col] & bit || boxes[box] & bit) return 0;
    rows[row] |= bit;
    cols[col] |= bit;
    boxes[box] |= bit;
    filled++;
  }

  let found = 0;
  const walk = (): boolean => {
    if (filled === 81) {
      found++;
      return found >= limit;
    }
    let best = -1;
    let bestMask = 0;
    let bestCount = 10;
    for (let i = 0; i < 81; i++) {
      if (grid[i]) continue;
      const mask =
        ALL_DIGITS & ~rows[rowOf(i)] & ~cols[colOf(i)] & ~boxes[boxOf(i)];
      const count = popCount(mask);
      if (count < bestCount) {
        best = i;
        bestMask = mask;
        bestCount = count;
        if (count <= 1) break;
      }
    }
    if (best < 0 || bestCount === 0) return false;
    const row = rowOf(best);
    const col = colOf(best);
    const box = boxOf(best);
    let mask = bestMask;
    while (mask) {
      const bit = mask & -mask;
      mask ^= bit;
      grid[best] = Math.log2(bit);
      rows[row] |= bit;
      cols[col] |= bit;
      boxes[box] |= bit;
      filled++;
      if (walk()) return true;
      filled--;
      rows[row] ^= bit;
      cols[col] ^= bit;
      boxes[box] ^= bit;
      grid[best] = 0;
    }
    return false;
  };
  walk();
  return found;
}

function popCount(mask: number): number {
  let count = 0;
  let n = mask;
  while (n) {
    n &= n - 1;
    count++;
  }
  return count;
}

export function fillSolution(random: () => number): Uint8Array {
  const grid = new Uint8Array(81);
  const rows = new Uint16Array(9);
  const cols = new Uint16Array(9);
  const boxes = new Uint16Array(9);

  const walk = (index: number): boolean => {
    if (index === 81) return true;
    const row = rowOf(index);
    const col = colOf(index);
    const box = boxOf(index);
    const used = rows[row] | cols[col] | boxes[box];
    const digits: number[] = [];
    for (let digit = 1; digit <= 9; digit++) {
      if ((used & (1 << digit)) === 0) digits.push(digit);
    }
    for (let i = digits.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [digits[i], digits[j]] = [digits[j], digits[i]];
    }
    for (const digit of digits) {
      const bit = 1 << digit;
      grid[index] = digit;
      rows[row] |= bit;
      cols[col] |= bit;
      boxes[box] |= bit;
      if (walk(index + 1)) return true;
      rows[row] ^= bit;
      cols[col] ^= bit;
      boxes[box] ^= bit;
      grid[index] = 0;
    }
    return false;
  };

  if (!walk(0)) throw new Error("Failed to fill a Sudoku grid");
  return grid;
}
