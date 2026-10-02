import { describe, expect, it } from "vitest";
import { INSET, THUMB, thumbOffset, valueFromPointer } from "./feel";

describe("slider geometry", () => {
  const width = 320;

  it("keeps the thumb inside the track at both ends", () => {
    expect(thumbOffset(0, width)).toBe(INSET);
    expect(thumbOffset(1, width) + THUMB).toBe(width - INSET);
  });

  it("maps the thumb center back to the same value", () => {
    for (const value of [0, 0.25, 0.62, 1]) {
      const center = thumbOffset(value, width) + THUMB / 2;
      expect(valueFromPointer(center, 0, width)).toBeCloseTo(value, 5);
    }
  });
});
