import { describe, expect, it } from "vitest";
import { competitionOutcome } from "./outcome";

describe("funded competition outcome", () => {
  const entrants = [
    { wallet: "a", startedAt: 10000, completedMs: 20000 },
    { wallet: "b", startedAt: 40000, completedMs: 15000 },
    { wallet: "c", startedAt: null, completedMs: null },
  ];
  it("waits for the deadline and chooses fastest elapsed time regardless of finish order", () => {
    expect(competitionOutcome(entrants, 60000, 59999)).toEqual({ kind: "pending" });
    expect(competitionOutcome(entrants, 60000, 60000)).toEqual({ kind: "winner", wallet: "b", completedMs: 15000 });
    expect(competitionOutcome([...entrants].reverse(), 60000, 60000)).toEqual({ kind: "winner", wallet: "b", completedMs: 15000 });
  });
  it("refunds alone, no finishes, and exact fastest ties", () => {
    expect(competitionOutcome([entrants[0]], 60000, 60000)).toEqual({ kind: "refund", reason: "no-opponent" });
    expect(competitionOutcome(entrants.map(e => ({ ...e, completedMs: null })), 60000, 60000)).toEqual({ kind: "refund", reason: "no-finish" });
    expect(competitionOutcome([entrants[0], { ...entrants[1], completedMs: 20000 }], 61000, 61000)).toEqual({ kind: "refund", reason: "tie" });
  });
  it("rejects corrupt persisted results and duplicate wallets instead of signing a payout", () => {
    expect(() => competitionOutcome([entrants[0], entrants[0]], 60000, 60000)).toThrow(/Duplicate/);
    for (const completedMs of [1, -1, 20000.1, Infinity, NaN, 50000]) {
      expect(() => competitionOutcome([{ ...entrants[0], completedMs }, entrants[1]], 60000, 60000)).toThrow(/Invalid verified/);
    }
    expect(() => competitionOutcome([{ ...entrants[0], startedAt: null }, entrants[1]], 60000, 60000)).toThrow(/Invalid verified/);
  });
});
