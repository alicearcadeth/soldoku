export type Tally = { win: number; loss: number; draw: number };

export type RecordBook = { practice: Tally; staked: Tally };

export function emptyBook(): RecordBook {
  return { practice: { win: 0, loss: 0, draw: 0 }, staked: { win: 0, loss: 0, draw: 0 } };
}

export function noteResult(book: RecordBook, mode: "practice" | "staked", outcome: keyof Tally): RecordBook {
  const next = {
    practice: { ...book.practice },
    staked: { ...book.staked },
  };
  next[mode][outcome] += 1;
  return next;
}

export function recordLine(book: RecordBook, classicFinished: number): string | null {
  const parts: string[] = [];
  if (classicFinished > 0) parts.push(`Classic ${classicFinished} finished on this phone`);
  const practice = tally(book.practice);
  if (practice) parts.push(`Practice ${practice}`);
  const staked = tally(book.staked);
  if (staked) parts.push(`Compete ${staked}`);
  return parts.length ? parts.join(". ") + "." : null;
}

function tally(row: Tally): string | null {
  if (row.win + row.loss + row.draw === 0) return null;
  return `${row.win} won, ${row.loss} lost, ${row.draw} tied`;
}
