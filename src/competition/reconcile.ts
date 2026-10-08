import { SETTLEMENT_REFUND_WARNING_MS } from "./settlement";
import type { SettlementAttempt } from "./types";

type Entrant = { actor: string; claimed?: boolean };
type Funded = {
  stakeUnits: string; confirmedParticipants: number; chainStatus: string; refundAt: number;
  settlement?: SettlementAttempt; settlementAlso?: SettlementAttempt[]; settlementSignature?: string; winner: string | null;
};
export type RoomObligation = {
  code: string; pendingDeposits: number; unpaidPrize: bigint; outstandingRefund: bigint; unknownSignatures: string[];
  expectedVault: bigint; vault: bigint | null; inconsistent: boolean; unsolicited: bigint; deadline: "settlement" | "refund" | "none";
};

/** Compare one room's saved escrow with an optional on-chain vault balance. This does not move tokens. */
export function reconcileRoom(room: { code: string; endsAt: number; entrants: Entrant[]; funded?: Funded }, now: number, vault?: bigint): RoomObligation {
  const funded = room.funded;
  const stake = BigInt(funded?.stakeUnits ?? "0");
  const participants = funded?.confirmedParticipants ?? 0;
  const unclaimed = room.entrants.filter(entry => !entry.claimed).length;
  const signatures = [funded?.settlement, ...(funded?.settlementAlso ?? [])].filter((item): item is SettlementAttempt => Boolean(item));
  const unknownSignatures = funded?.settlementSignature ? [] : signatures.filter(item => item.phase === "unknown" || item.phase === "broadcast" || item.phase === "prepared").map(item => item.signature);
  let expectedVault = 0n;
  let unpaidPrize = 0n;
  let outstandingRefund = 0n;
  if (funded?.chainStatus === "open" || funded?.chainStatus === "pending") expectedVault = stake * BigInt(participants);
  if (funded?.chainStatus === "awarded") {
    expectedVault = stake * BigInt(participants);
    if (funded.winner && room.entrants.some(entry => entry.actor === funded.winner && !entry.claimed)) unpaidPrize = expectedVault;
  }
  if (funded?.chainStatus === "refunding") {
    outstandingRefund = stake * BigInt(unclaimed);
    expectedVault = outstandingRefund;
  }
  const held = vault ?? null;
  const unsolicited = held !== null && held > expectedVault ? held - expectedVault : 0n;
  const deadline = !funded || funded.settlementSignature ? "none"
    : now >= room.endsAt && now < funded.refundAt ? "settlement"
    : funded.refundAt - now <= SETTLEMENT_REFUND_WARNING_MS && now < funded.refundAt ? "refund" : "none";
  return {
    code: room.code, pendingDeposits: Math.max(0, room.entrants.length - participants), unpaidPrize, outstandingRefund, unknownSignatures,
    expectedVault, vault: held, inconsistent: held !== null && held !== expectedVault, unsolicited, deadline,
  };
}
