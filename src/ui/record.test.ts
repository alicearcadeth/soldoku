import { describe, expect, it } from "vitest";
import { emptyBook, noteResult, recordLine } from "./record";

describe("local records", () => {
  it("counts a practice result without inventing a staked one", () => {
    const book = noteResult(emptyBook(), "practice", "win");
    expect(recordLine(book, 2)).toBe("Classic 2 finished on this phone. Practice 1 won, 0 lost, 0 tied.");
    const compete = noteResult(book, "staked", "loss");
    expect(recordLine(compete, 2)).toContain("Compete 0 won, 1 lost, 0 tied");
    expect(book.staked).toEqual({ win: 0, loss: 0, draw: 0 });
  });
});
