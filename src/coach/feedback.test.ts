import { describe, expect, it } from "vitest";
import { feedbackAllowed, feedbackNote } from "./feedback";

describe("feedback notes", () => {
  it("keeps a short problem note", () => {
    expect(feedbackNote({ note: "  Quick match never seated me.  " })).toBe("Quick match never seated me.");
  });

  it("rejects a blank note, a pasted grid, and a missing field", () => {
    expect(feedbackNote({ note: "short" })).toBeNull();
    expect(feedbackNote({ note: "1".repeat(50) })).toBeNull();
    expect(feedbackNote(null)).toBeNull();
  });

  it("allows four notes an hour and blocks the fifth", () => {
    let hits: number[] = [];
    for (let i = 0; i < 4; i++) {
      const result = feedbackAllowed(hits, 1_000 + i);
      expect(result.ok).toBe(true);
      hits = result.next;
    }
    expect(feedbackAllowed(hits, 2_000).ok).toBe(false);
    expect(feedbackAllowed(hits, 1_000 + 60 * 60 * 1000).ok).toBe(true);
  });
});
