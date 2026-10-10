import { describe, expect, it, vi } from "vitest";
import { Keypair, Transaction, TransactionInstruction, type Connection } from "@solana/web3.js";
import { observeSignedEscrow } from "./transactionObservation";

function fixture() {
  const wallet = Keypair.generate(), program = Keypair.generate().publicKey, room = Keypair.generate().publicKey;
  const tx = new Transaction({ feePayer: wallet.publicKey, recentBlockhash: Keypair.generate().publicKey.toBase58() });
  tx.add(new TransactionInstruction({ programId: program, keys: [{ pubkey: room, isSigner: false, isWritable: true }], data: Buffer.from([5]) }));
  tx.sign(wallet);
  const statuses = vi.fn().mockResolvedValue({ value: [null] });
  const valid = vi.fn().mockResolvedValue({ value: false });
  const rpc = { getSignatureStatuses: statuses, isBlockhashValid: valid } as unknown as Pick<Connection, "getSignatureStatuses" | "isBlockhashValid">;
  const run = (owner = wallet.publicKey.toBase58(), code = room.toBase58(), action = "claim") => observeSignedEscrow(rpc, tx.serialize().toString("base64"), owner, program.toBase58(), code, action);
  return { run, statuses, valid, tx };
}
describe("signed escrow observation", () => {
  it("recovers a legacy zero-height receipt using its signed blockhash, with a second history lookup", async () => {
    const f = fixture(); expect((await f.run()).observation).toBe("expired");
    expect(f.valid).toHaveBeenCalledWith(f.tx.recentBlockhash, { commitment: "finalized" });
    expect(f.statuses).toHaveBeenCalledTimes(2);
  });
  it("keeps an absent signature unknown while its blockhash is valid", async () => {
    const f = fixture(); f.valid.mockResolvedValue({ value: true }); expect((await f.run()).observation).toBe("unknown");
  });
  it("does not clear pending transactions, including a nonfinal error", async () => {
    const f = fixture(); f.statuses.mockResolvedValue({ value: [{ confirmationStatus: "confirmed", err: { InstructionError: [0, "Custom"] } }] });
    expect((await f.run()).observation).toBe("pending"); expect(f.valid).not.toHaveBeenCalled();
  });
  it("handles finalized success, failure, and confirmation racing with expiry", async () => {
    for (const err of [null, { InstructionError: [0, "Custom"] }]) {
      const f = fixture(); f.statuses.mockResolvedValueOnce({ value: [null] }).mockResolvedValueOnce({ value: [{ confirmationStatus: "finalized", err }] });
      expect((await f.run()).observation).toBe(err ? "failed" : "confirmed");
    }
  });
  it("rejects another wallet, room or action before querying RPC", async () => {
    const f = fixture(); await expect(f.run(Keypair.generate().publicKey.toBase58())).rejects.toThrow(/signatures/);
    await expect(f.run(undefined, Keypair.generate().publicKey.toBase58())).rejects.toThrow(/competition/);
    await expect(f.run(undefined, undefined, "deposit")).rejects.toThrow(/action/); expect(f.statuses).not.toHaveBeenCalled();
  });
  it("leaves RPC failures unresolved", async () => {
    const f = fixture(); f.valid.mockRejectedValue(new Error("429")); await expect(f.run()).rejects.toThrow("429");
  });
});
