import { describe, expect, it } from "vitest";
import { reconcileRoom, type RoomBooks } from "./reconcile";

const base: RoomBooks = {
  expectedProgramId: "program",
  programId: "program",
  expectedMint: "mint",
  mint: "mint",
  d1Funded: true,
  d1Status: "funded",
  vaultBalance: 2_000_000n,
  expectedStake: 1_000_000n,
  matchStatus: 1,
  signatures: ["sig-a"],
  matchLamports: 2_025_360,
  vaultLamports: 2_039_280,
};

describe("room reconciliation", () => {
  it("accepts a funded room and flags the mismatches that matter", () => {
    expect(reconcileRoom(base).flags).toEqual([]);
    expect(reconcileRoom({ ...base, vaultBalance: 0n }).flags).toContain("d1-funded-vault-short");
    expect(reconcileRoom({ ...base, d1Funded: false, d1Status: "pending" }).flags).toContain("vault-funded-d1-stale");
    expect(reconcileRoom({ ...base, matchStatus: 2, d1Status: "settled", vaultBalance: 1n }).flags).toContain("settled-nonzero-vault");
    expect(reconcileRoom({ ...base, matchStatus: 3, d1Status: "refunded", vaultBalance: 1n }).flags).toContain("refunded-nonzero-vault");
    expect(reconcileRoom({ ...base, programId: "other" }).flags).toContain("wrong-program");
    expect(reconcileRoom({ ...base, mint: "other" }).flags).toContain("wrong-mint");
    expect(reconcileRoom({ ...base, signatures: ["same", "same"] }).flags).toContain("duplicate-signature");
  });

  it("classifies the books the operator has to tell apart", () => {
    expect(reconcileRoom(base).classification).toBe("ok");
    expect(reconcileRoom({ ...base, vaultBalance: 0n }).classification).toBe("inconsistent");
    expect(reconcileRoom({ ...base, d1Funded: false, d1Status: "pending" }).classification).toBe("degraded");
    expect(reconcileRoom({ ...base, vaultBalance: 3_000_000n }).classification).toBe("inconsistent");
    expect(reconcileRoom({ ...base, matchStatus: 2, d1Status: "settled", vaultBalance: 0n, d1Funded: false }).classification).toBe("pending");
    expect(reconcileRoom({
      ...base,
      programId: null,
      mint: null,
      matchStatus: null,
      vaultBalance: null,
      matchLamports: null,
      vaultLamports: null,
      d1Funded: false,
      d1Status: "settled",
    }).classification).toBe("ok");
    expect(reconcileRoom({ ...base, unknownSignature: true }).classification).toBe("manual");
  });

  it("marks a terminal empty vault as close-eligible", () => {
    const result = reconcileRoom({ ...base, d1Status: "settled", matchStatus: 2, vaultBalance: 0n, d1Funded: false });
    expect(result.closeEligible).toBe(true);
    expect(result.flags).toContain("close-eligible");
  });
});
