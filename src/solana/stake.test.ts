import { describe, expect, it } from "vitest";
import { parseStake, stakeChoices, stakeLabel } from "./stake";

describe("devnet stake choices", () => {
  it("allows 1, 2, or 5 test tokens and rejects the rest", () => {
    expect(stakeChoices()).toEqual(["1000000", "2000000", "5000000"]);
    expect(parseStake("2000000")).toBe(2_000_000n);
    expect(parseStake(undefined)).toBe(1_000_000n);
    expect(() => parseStake("3")).toThrow(/1, 2, or 5/);
    expect(() => parseStake("0")).toThrow(/1, 2, or 5/);
  });

  it("labels the pool in whole tokens", () => {
    expect(stakeLabel(5_000_000n)).toBe("5 test tokens");
    expect(stakeLabel(1_000_000n)).toBe("1 test token");
  });
});
