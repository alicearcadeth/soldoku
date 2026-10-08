import { describe, expect, it } from "vitest";
import { createCompetitionStore } from "./store";

function room(patch: Record<string, unknown> = {}) {
  return {
    code: "DUE00001", owner: "owner-wallet", createdAt: 0, endsAt: 1_000_000,
    puzzle: { level: "easy", givens: [], solution: [] },
    entrants: [
      { actor: "owner-wallet", name: "a", startedAt: 0, completedMs: 20_000, values: [], sequence: 1, lastMoveAt: 0 },
      { actor: "other-wallet", name: "b", startedAt: 0, completedMs: 30_000, values: [], sequence: 1, lastMoveAt: 0 },
    ],
    funded: {
      program: "program", authority: "authority", mint: "mint", decimals: 6, playMs: 60_000, graceMs: 3_600_000,
      id: "1", stakeUnits: "1000000", startsAt: 940_000, refundAt: 5_000_000,
      chainStatus: "open", confirmedParticipants: 2, chainTime: 1_000_000, winner: null,
    },
    ...patch,
  };
}
function storeWith(rooms: unknown[]) {
  const store = createCompetitionStore(() => 2_000_000);
  store.replace(JSON.stringify({ rooms, gates: [], proofs: [], sessions: [] }));
  return store;
}
describe("automatic settlement selection", () => {
  it("selects only open funded rooms inside the settlement window", () => {
    const early = room({ code: "EARLY001", endsAt: 3_000_000 });
    const closed = room({ code: "CLOSED01" });
    (closed.funded as { chainStatus: string }).chainStatus = "awarded";
    const recorded = room({ code: "RECORDED" });
    (recorded.funded as { settlementSignature?: string }).settlementSignature = "already";
    const expired = room({ code: "EXPIRED1" });
    (expired.funded as { refundAt: number }).refundAt = 1_500_000;
    const pending = room({ code: "PENDING1" });
    (pending.funded as { chainStatus: string; confirmedParticipants: number }).chainStatus = "pending";
    (pending.funded as { confirmedParticipants: number }).confirmedParticipants = 0;
    const store = storeWith([room(), early, closed, recorded, expired, pending]);
    expect(store.dueSettlementCodes()).toEqual(["DUE00001"]);
    expect(store.settlementContext("DUE00001").outcome).toMatchObject({ kind: "winner", wallet: "owner-wallet" });
  });
  it("stops selecting a room after its settlement signature is recorded", () => {
    const store = storeWith([room()]);
    store.rememberSettlement("DUE00001", "auto-signature");
    expect(store.dueSettlementCodes()).toEqual([]);
    const restored = createCompetitionStore(() => 2_000_000);
    restored.replace(store.snapshot());
    expect(restored.dueSettlementCodes()).toEqual([]);
  });
  it("selects a closed room whose receipt is still unknown", () => {
    const paid = room({ code: "PAID0001" });
    (paid.funded as { chainStatus: string }).chainStatus = "paid";
    const synthetic = room({ code: "CHAIN001" });
    (synthetic.funded as { chainStatus: string; settlementSignature?: string }).chainStatus = "awarded";
    (synthetic.funded as { settlementSignature?: string }).settlementSignature = "chain-closed";
    (synthetic.funded as { settlement?: { phase: string; signature: string } }).settlement = { phase: "unknown", signature: "sent-a" };
    const external = room({ code: "EXTERNAL" });
    (external.funded as { chainStatus: string; settlementClosure?: string }).chainStatus = "refunding";
    (external.funded as { settlementClosure?: string }).settlementClosure = "external";
    const store = storeWith([paid, synthetic, external]);
    expect(store.dueSettlementCodes()).toEqual([]);
    expect(store.receiptReconciliationCodes()).toEqual(["CHAIN001"]);
  });
});
