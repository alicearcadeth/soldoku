import { Buffer } from "buffer";
import bs58 from "bs58";
import { PublicKey, Transaction, type Connection } from "@solana/web3.js";
import type { SettlementObservation } from "./chain";

/** Read-only recovery: derives identity and blockhash from verified signed bytes, including old receipts with height=0. */
export async function observeSignedEscrow(rpc: Pick<Connection, "getSignatureStatuses" | "isBlockhashValid">, raw: unknown,
  wallet: string, program: string, room: string, action: string): Promise<{ signature: string; observation: SettlementObservation }> {
  if (typeof raw !== "string" || raw.length > 2400) throw new Error("Invalid signed competition transaction.");
  const tx = Transaction.from(Buffer.from(raw, "base64"));
  if (!tx.feePayer?.equals(new PublicKey(wallet)) || !tx.verifySignatures() || !tx.signature || !tx.recentBlockhash) {
    throw new Error("Competition transaction signatures do not match this wallet.");
  }
  const tags = action === "deposit" ? [0, 1] : action === "extend" ? [2] : action === "claim" ? [4, 5] : [];
  const instructions = tx.instructions.filter(ix => ix.programId.toBase58() === program);
  if (!instructions.length || instructions.some(ix => ix.keys[0]?.pubkey.toBase58() !== room || !tags.includes(ix.data[0]))) {
    throw new Error("Recovery transaction does not match this competition and action.");
  }
  const signature = bs58.encode(tx.signature);
  const status = async (): Promise<SettlementObservation | null> => {
    const value = (await rpc.getSignatureStatuses([signature], { searchTransactionHistory: true })).value[0];
    if (!value) return null;
    if (value.confirmationStatus !== "finalized") return "pending";
    return value.err ? "failed" : "confirmed";
  };
  const first = await status();
  if (first) return { signature, observation: first };
  const valid = await rpc.isBlockhashValid(tx.recentBlockhash, { commitment: "finalized" });
  if (valid.value) return { signature, observation: "unknown" };
  // A transaction may land between the first lookup and blockhash check.
  return { signature, observation: await status() ?? "expired" };
}
