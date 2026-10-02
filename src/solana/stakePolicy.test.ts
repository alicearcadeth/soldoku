import { describe, expect, it } from "vitest";
import { devnetStakeChoices, assertProposedPreset, MAINNET_STAKE_PROPOSAL, proposedMainnetStakeFits } from "./stakePolicy";

describe("settlement stake policy", () => {
  it("keeps the Mainnet range a proposal and separate from Devnet choices", () => {
    expect(MAINNET_STAKE_PROPOSAL.status).toBe("proposal");
    expect(MAINNET_STAKE_PROPOSAL.platformFeeBps).toBe(0);
    expect(MAINNET_STAKE_PROPOSAL.mint).toBe("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
    expect(proposedMainnetStakeFits(1_000_000n)).toBe(true);
    expect(proposedMainnetStakeFits(2_000_000n)).toBe(true);
    expect(proposedMainnetStakeFits(5_000_000n)).toBe(true);
    expect(proposedMainnetStakeFits(3_000_000n)).toBe(false);
    expect(proposedMainnetStakeFits(20_000_000n)).toBe(false);
    expect(MAINNET_STAKE_PROPOSAL.recommendedDefault).toBe("fixed-presets-1-2-5");
    expect(devnetStakeChoices()).toEqual([1_000_000n, 2_000_000n, 5_000_000n]);
    expect(assertProposedPreset("5000000")).toBe(5_000_000n);
    expect(() => assertProposedPreset("3000000")).toThrow(/1, 2, or 5/);
  });
});
