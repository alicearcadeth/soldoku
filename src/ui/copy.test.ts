import { describe, expect, it } from "vitest";
import { depositActionLabel, shortAddress, walletBalanceCopy, walletStatusDetail } from "./copy";

describe("player-facing money labels", () => {
  it("names the deposit amount without calling a wallet balance a deposit", () => {
    expect(depositActionLabel("1 test token", false)).toBe("Deposit stake · approve 1 test token");
    expect(depositActionLabel("5 test tokens", false)).toContain("5 test tokens");
    expect(depositActionLabel(null, true)).toBe("Check deposit");
    expect(walletBalanceCopy(1_500_000_000, "3000000")).toContain("not a match deposit");
    expect(walletBalanceCopy(1_500_000_000, "3000000")).toContain("3 test tokens");
  });

  it("separates wallet handoff from escrow confirmation", () => {
    expect(walletStatusDetail("Waiting for your approval")).toContain("Continue in your wallet");
    expect(walletStatusDetail("Transaction submitted")).toContain("not funded");
    expect(walletStatusDetail("Requesting test tokens")).toBeNull();
    expect(shortAddress("JCVsKd4TMg1fvEs7rjf5YgLYbJfNC8Dwb4x1PchFkGM7")).toBe("JCVs…kGM7");
  });
});
