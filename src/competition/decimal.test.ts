import { describe, expect, it } from "vitest";
import { divideDecimal, multiplyDecimal } from "./decimal";
import { usdLabel } from "./types";
describe("price precision", () => {
  it("formats price by magnitude without feeding display rounding into conversion", () => {
    expect(usdLabel(198.42)).toBe("$198.42");
    expect(usdLabel(1.24)).toBe("$1.24");
    expect(usdLabel(0.01284)).toBe("$0.01284");
    expect(usdLabel(0.00003482)).toBe("$0.00003482");
    expect(multiplyDecimal("10", "0.0144499996677041")).toBe("0.144499996677041");
    expect(divideDecimal("0.144499996677041", "0.0144499996677041")).toBe("10");
    expect(divideDecimal("50", "198.42")).toBe("0.251990726741255921782078");
  });
  it("handles scientific prices and rejects oversized input or zero divisors", () => {
    expect(multiplyDecimal("100000", "3.482e-5")).toBe("3.482");
    expect(() => divideDecimal("1", "0")).toThrow();
    expect(() => multiplyDecimal("1e10000", "1")).toThrow();
  });
});
