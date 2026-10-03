import { describe, expect, it } from "vitest";
import { missingTesterTokenAccount, planTesterGrant, TESTER_COOLDOWN_MS, TESTER_SOL_FLOOR, TESTER_TOKEN_FLOOR } from "./testerFunds";

const now = 1_700_000_000_000;
describe("tester fund grants", () => {
  it("sends SOL and TEST when both balances are below the floor", () => {
    expect(planTesterGrant({ solLamports: TESTER_SOL_FLOOR - 1, testUnits: TESTER_TOKEN_FLOOR - 1n, lastGrantAt: null, now, faucetConfigured: true }))
      .toEqual({ sol: true, test: true, note: null });
  });
  it("skips a wallet that can already pay fees and enter", () => {
    expect(() => planTesterGrant({ solLamports: TESTER_SOL_FLOOR, testUnits: TESTER_TOKEN_FLOOR, lastGrantAt: null, now, faucetConfigured: true }))
      .toThrow(/already has enough/);
  });
  it("blocks a second grant inside the daily cooldown", () => {
    expect(() => planTesterGrant({ solLamports: 0, testUnits: 0n, lastGrantAt: now - TESTER_COOLDOWN_MS + 1, now, faucetConfigured: true }))
      .toThrow(/already sent/);
  });
  it("allows another grant after the cooldown", () => {
    expect(planTesterGrant({ solLamports: 0, testUnits: 0n, lastGrantAt: now - TESTER_COOLDOWN_MS, now, faucetConfigured: true }).sol).toBe(true);
  });
  it("still requests SOL when the TEST mint faucet is not configured", () => {
    expect(planTesterGrant({ solLamports: 0, testUnits: 0n, lastGrantAt: null, now, faucetConfigured: false }))
      .toMatchObject({ sol: true, test: false, note: expect.stringMatching(/faucet\.solana\.com/) });
  });
  it("treats a missing token account as an empty balance", () => {
    expect(missingTesterTokenAccount(Object.assign(new Error("failed to get token account balance: Invalid param: could not find account"), { name: "Error" }))).toBe(true);
    expect(missingTesterTokenAccount(Object.assign(new Error("missing"), { name: "TokenAccountNotFoundError" }))).toBe(true);
    expect(missingTesterTokenAccount(new Error("429 Too Many Requests"))).toBe(false);
  });
  it("refuses a TEST-only request when minting is not configured", () => {
    expect(() => planTesterGrant({ solLamports: TESTER_SOL_FLOOR, testUnits: 0n, lastGrantAt: null, now, faucetConfigured: false }))
      .toThrow(/not enabled/);
  });
});
