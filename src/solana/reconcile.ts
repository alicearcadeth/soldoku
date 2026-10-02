/** Read-only comparison of one room. This module does not send a transaction. */

export type RoomBooks = {
  expectedProgramId: string;
  programId: string | null;
  expectedMint: string;
  mint: string | null;
  d1Funded: boolean;
  d1Status: "none" | "pending" | "funded" | "settled" | "refunded";
  vaultBalance: bigint | null;
  expectedStake: bigint;
  matchStatus: number | null;
  signatures: readonly string[];
  matchLamports: number | null;
  vaultLamports: number | null;
  unknownSignature?: boolean;
};

export type ReconciliationClass = "ok" | "pending" | "degraded" | "inconsistent" | "manual";

export type RoomReconciliation = {
  flags: string[];
  closeEligible: boolean;
  classification: ReconciliationClass;
};

const SETTLED = 2;
const CANCELLED = 3;

export function reconcileRoom(books: RoomBooks): RoomReconciliation {
  const flags: string[] = [];
  const closed = books.programId === null && books.matchLamports === null && books.vaultBalance === null
    && (books.d1Status === "settled" || books.d1Status === "refunded");
  if (!closed && (!books.programId || books.programId !== books.expectedProgramId)) flags.push("wrong-program");
  if (!closed && (!books.mint || books.mint !== books.expectedMint)) flags.push("wrong-mint");
  const vault = books.vaultBalance;
  if (books.d1Funded && (vault === null || vault < books.expectedStake)) flags.push("d1-funded-vault-short");
  if (vault !== null && vault > 0n && !books.d1Funded && books.d1Status !== "settled" && books.d1Status !== "refunded") {
    flags.push("vault-funded-d1-stale");
  }
  const fullStake = books.expectedStake * (books.matchStatus === 0 ? 1n : 2n);
  if (vault !== null && books.matchStatus !== null && books.matchStatus < SETTLED && vault > fullStake) flags.push("excess-vault");
  if ((books.matchStatus === SETTLED || books.d1Status === "settled") && vault !== null && vault > 0n) {
    flags.push("settled-nonzero-vault");
  }
  if ((books.matchStatus === CANCELLED || books.d1Status === "refunded") && vault !== null && vault > 0n) {
    flags.push("refunded-nonzero-vault");
  }
  const unique = new Set(books.signatures.filter(Boolean));
  if (books.signatures.filter(Boolean).length !== unique.size) flags.push("duplicate-signature");
  const terminal = books.matchStatus === SETTLED || books.matchStatus === CANCELLED;
  const closeEligible = terminal && vault === 0n && (books.matchLamports ?? 0) > 0 && !flags.includes("wrong-program") && !flags.includes("wrong-mint");
  if (closeEligible) flags.push("close-eligible");
  return { flags, closeEligible, classification: classify(flags, books, closed, closeEligible) };
}

function classify(flags: string[], books: RoomBooks, closed: boolean, closeEligible: boolean): ReconciliationClass {
  if (books.unknownSignature) return "manual";
  const inconsistent = ["wrong-program", "wrong-mint", "duplicate-signature", "settled-nonzero-vault", "refunded-nonzero-vault", "d1-funded-vault-short", "excess-vault"];
  if (flags.some((flag) => inconsistent.includes(flag))) return "inconsistent";
  if (flags.includes("vault-funded-d1-stale")) return "degraded";
  if (closeEligible) return "pending";
  if (closed) return "ok";
  if (books.matchStatus === null) return "pending";
  return "ok";
}
