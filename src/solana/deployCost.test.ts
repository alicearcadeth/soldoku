import { describe, expect, it } from "vitest";
import { estimateDeployCost, mainnetDeployFunding, rentExemptLamports } from "./deployCost";

describe("deployment cost estimate", () => {
  it("separates program rent from fees and labels the match rent as recoverable", () => {
    const cost = estimateDeployCost({ artifactBytes: 25_552 });
    expect(cost.programDataRentLamports).toBe(rentExemptLamports(25_552));
    expect(cost.minimumLikelyLamports).toBe(cost.programDataRentLamports + cost.programAccountRentLamports + cost.transactionFeeLamports);
    expect(cost.recommendedLamports).toBeGreaterThan(cost.minimumLikelyLamports);
    expect(cost.recoverableMatchRentLamports).toBe(cost.matchRentLamports + cost.vaultRentLamports);
    expect(cost.depositFeeLamports).toBe(5_000);
    const measured = mainnetDeployFunding();
    expect(measured.minimumLikelyLamports).toBe(149_783_800 + 833_120 + 250_000);
    expect(measured.recommendedLamports).toBe(measured.minimumLikelyLamports + 149_783_800 + 20_000_000);
    expect(measured.recoverableLamports).toBe(1_478_280 + 1_488_440);
  });
});
