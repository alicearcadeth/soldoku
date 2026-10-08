import { describe, expect, it } from "vitest";
import { reconcileRoom } from "./reconcile";
import { mergeSettlementFields } from "./settlement";
import type { SettlementAttempt } from "./types";

const attempt = (signature: string, phase: SettlementAttempt["phase"]): SettlementAttempt => ({
  phase, signature, serialized: "raw", blockhash: "b", lastValidBlockHeight: 1, preparedAt: 1, winner: "winner",
});
const room = (funded?: Record<string, unknown>) => ({
  code: "ROOM0001", endsAt: 1_000, entrants: [{ actor: "winner", claimed: false }, { actor: "other", claimed: false }],
  funded: { stakeUnits: "1000000", confirmedParticipants: 2, chainStatus: "awarded", refundAt: 5_000, winner: "winner", ...funded },
});
describe("room reconciliation", () => {
  it("keeps an unpaid prize and an unknown signature until the room is marked complete", () => {
    const pending = reconcileRoom(room({ settlement: attempt("sig-b", "unknown") }), 2_000, 2_000_000n);
    expect(pending.unpaidPrize).toBe(2_000_000n);
    expect(pending.unknownSignatures).toEqual(["sig-b"]);
    expect(pending.deadline).toBe("settlement");
    const paid = reconcileRoom(room({ chainStatus: "paid", settlementSignature: "done" }), 2_000, 0n);
    expect(paid.unpaidPrize).toBe(0n);
    expect(paid.unknownSignatures).toEqual([]);
    const synthetic = reconcileRoom(room({ settlementSignature: "chain-closed", settlement: attempt("sent-a", "unknown") }), 2_000, 0n);
    expect(synthetic.unknownSignatures).toEqual(["sent-a"]);
  });
  it("retains both signatures when a conditional merge sees two broadcasts", () => {
    const currentRoom = room({ settlement: attempt("sent-a", "broadcast") });
    const localRoom = room({ settlement: attempt("sent-b", "unknown") });
    const current = { rooms: [currentRoom] };
    const local = { rooms: [localRoom] };
    const merged = JSON.parse(mergeSettlementFields(JSON.stringify(current), JSON.stringify(local), ["ROOM0001"]));
    const signatures = [merged.rooms[0].funded.settlement.signature, ...merged.rooms[0].funded.settlementAlso.map((item: { signature: string }) => item.signature)];
    expect(signatures).toEqual(expect.arrayContaining(["sent-a", "sent-b"]));
  });
});
