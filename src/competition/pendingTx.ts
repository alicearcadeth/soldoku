import { Transaction } from "@solana/web3.js";
import bs58 from "bs58";
import type { SettlementObservation } from "./chain";

export const PENDING_ESCROW_KEY = "sudoku.pendingEscrow";
export type PendingEscrow = {
  code: string; wallet: string; action: "deposit" | "extend" | "claim"; signature: string; serialized: string;
  cluster: "devnet" | "localnet"; expiresAtBlockHeight: number;
  status: "prepared" | "broadcast" | "unknown" | "failed" | "expired" | "confirmed"; note?: string;
};
type Storage = { getItem(key: string): string | null; setItem(key: string, value: string): void };
const OPEN = new Set<PendingEscrow["status"]>(["prepared", "broadcast", "unknown"]);

export function signedTransactionIdentity(bytes: Uint8Array): { signature: string; serialized: string } {
  const tx = Transaction.from(Buffer.from(bytes));
  const raw = tx.signatures[0]?.signature;
  if (!raw) throw new Error("The wallet did not sign this transaction.");
  return { signature: bs58.encode(raw), serialized: Buffer.from(bytes).toString("base64") };
}

export function rememberPending(existing: readonly PendingEscrow[], next: PendingEscrow): PendingEscrow[] {
  return [next, ...existing.filter(item => item.signature !== next.signature)].slice(0, 20);
}

export function openPending(list: readonly PendingEscrow[], code: string, wallet: string): PendingEscrow | undefined {
  return [...list].reverse().find(item => item.code === code && item.wallet === wallet && OPEN.has(item.status));
}

/** A wallet switch or a second approval must not replace an operation that may already have been signed. */
export function blockSecondApproval(list: readonly PendingEscrow[], code: string, wallet: string):
  { blocked: true; message: string } | { blocked: false; resume?: PendingEscrow } {
  const open = list.filter(item => item.code === code && OPEN.has(item.status));
  const foreign = open.find(item => item.wallet !== wallet);
  if (foreign) return { blocked: true, message: `A ${foreign.action} is still open for the original wallet. Switching accounts does not start another approval.` };
  const same = [...open].reverse().find(item => item.wallet === wallet);
  if (same) return { blocked: false, resume: same };
  return { blocked: false };
}

export function readPending(storage: Pick<Storage, "getItem">): PendingEscrow[] {
  try {
    const parsed = JSON.parse(storage.getItem(PENDING_ESCROW_KEY) ?? "[]") as PendingEscrow[];
    return Array.isArray(parsed) ? parsed.filter(item => item && typeof item.signature === "string" && typeof item.serialized === "string") : [];
  } catch { return []; }
}

export function writePending(storage: Pick<Storage, "setItem">, list: readonly PendingEscrow[]): "saved" | "unavailable" {
  try { storage.setItem(PENDING_ESCROW_KEY, JSON.stringify(list)); return "saved"; }
  catch { return "unavailable"; }
}

export function recoveryMessage(item: Pick<PendingEscrow, "action" | "signature">, observation: SettlementObservation | "stored"): string {
  if (observation === "confirmed") return "The earlier transaction is confirmed. Refresh the room before approving another.";
  if (observation === "failed" || observation === "expired") return "The earlier transaction did not land. You can approve a new one.";
  return `A ${item.action} for this wallet is still unconfirmed (${item.signature}). Check it again before approving another. A timeout is not a failure.`;
}

export function storageFailureMessage(): string {
  return "This device could not store the recovery receipt. Do not approve another transaction until the previous one is checked.";
}
