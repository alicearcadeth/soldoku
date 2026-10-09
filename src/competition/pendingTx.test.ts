import { describe, expect, it } from "vitest";
import { Keypair, Transaction } from "@solana/web3.js";
import { blockSecondApproval, openPending, readPending, recoveryMessage, rememberPending, signedTransactionIdentity, storageFailureMessage, writePending, type PendingEscrow } from "./pendingTx";

function memory() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
}
const pending = (signature: string, patch: Partial<PendingEscrow> = {}): PendingEscrow => ({
  code: "ROOM", wallet: "wallet", action: "deposit", signature, serialized: "bytes", cluster: "devnet", expiresAtBlockHeight: 10, status: "prepared", ...patch,
});
describe("pending escrow recovery", () => {
  it("keeps the signed identity before a lost response and blocks a second approval", () => {
    const signer = Keypair.generate();
    const tx = new Transaction({ feePayer: signer.publicKey, recentBlockhash: Keypair.generate().publicKey.toBase58() });
    tx.sign(signer);
    const identity = signedTransactionIdentity(tx.serialize());
    const first = rememberPending([], pending(identity.signature, { serialized: identity.serialized, status: "unknown" }));
    const decision = blockSecondApproval(first, "ROOM", "wallet");
    expect(decision.blocked).toBe(false);
    if (!decision.blocked) expect(decision.resume?.signature).toBe(identity.signature);
    expect(openPending(first, "ROOM", "wallet")?.serialized).toBe(identity.serialized);
    const switched = blockSecondApproval(first, "ROOM", "other-wallet");
    expect(switched.blocked).toBe(true);
  });
  it("survives a storage failure without dropping the in-memory record", () => {
    const list = rememberPending([], pending("sig"));
    expect(writePending({ setItem() { throw new Error("quota"); } }, list)).toBe("unavailable");
    expect(list[0].signature).toBe("sig");
    expect(storageFailureMessage()).toMatch(/could not store/i);
    const storage = memory();
    expect(writePending(storage, list)).toBe("saved");
    expect(readPending(storage)[0].status).toBe("prepared");
    expect(readPending({ getItem() { return "{"; } })).toEqual([]);
  });
  it("does not describe a timeout as a failed deposit", () => {
    expect(recoveryMessage(pending("sig"), "unknown")).toMatch(/timeout is not a failure/);
    expect(recoveryMessage(pending("sig"), "expired")).toMatch(/approve a new one/);
    expect(recoveryMessage(pending("sig"), "failed")).not.toMatch(/timeout is not a failure/);
  });
});
