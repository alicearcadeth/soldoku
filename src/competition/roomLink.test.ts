import { expect, it } from "vitest";
import { roomCodeFromUrl, roomUrl, stakeBaseUnits, tokenUnitsLabel } from "./roomLink";
it("opens a valid shared room and preserves unrelated query parameters when leaving", () => {
  expect(roomCodeFromUrl("https://soldoku.com/?room=ab01ef22")).toBe("AB01EF22");
  expect(roomCodeFromUrl("https://soldoku.com/?room=<bad>")).toBeNull();
  const url = roomUrl("https://soldoku.com/?source=x#home", "AB01EF22");
  expect(url).toBe("https://soldoku.com/?source=x&room=AB01EF22");
  expect(roomUrl(url, null)).toBe("https://soldoku.com/?source=x");
});
it("converts stake units exactly without floating point rounding", () => {
  expect(stakeBaseUnits("1.000001", 6)).toBe("1000001");
  expect(stakeBaseUnits("3", 6)).toBe("3000000");
  expect(stakeBaseUnits("10", 6)).toBe("10000000");
  expect(tokenUnitsLabel("3000003", 6)).toBe("3.000003");
  for (const value of ["0", "0.0000001", "-1", "1e4", "NaN", "1000000"]) expect(() => stakeBaseUnits(value, 6)).toThrow();
});
