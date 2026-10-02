import { createHash } from "node:crypto";
import { Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction } from "@solana/web3.js";
import bs58 from "bs58";
import { describe, expect, it } from "vitest";
import { coSignOpenDeposit, compileOpenDeposit, payerSignature } from "./desk";
import { activeEscrowProgramId, ESCROW_PROGRAM_ID, roomEscrowProgramId } from "./program";

function messageHash(raw: string) {
  return createHash("sha256").update(Transaction.from(Buffer.from(raw, "base64")).serializeMessage()).digest("hex");
}

describe("open signatures", () => {
  it("keeps the authority signature when the player signs, and rejects a changed instruction", () => {
    const player = Keypair.generate();
    const authority = Keypair.generate();
    const tx = new Transaction().add(new TransactionInstruction({
      programId: SystemProgram.programId,
      keys: [
        { pubkey: player.publicKey, isSigner: true, isWritable: true },
        { pubkey: authority.publicKey, isSigner: true, isWritable: false },
      ],
      data: Buffer.from([0]),
    }));
    tx.feePayer = player.publicKey;
    tx.recentBlockhash = "11111111111111111111111111111111";
    tx.partialSign(authority);
    tx.partialSign(player);
    const raw = tx.serialize();
    expect(raw[0]).toBe(2);
    expect(payerSignature(raw)).toBe(bs58.encode(tx.signature!));
    expect(tx.verifySignatures()).toBe(true);

    const changed = Transaction.from(raw);
    changed.instructions[0].data = Buffer.from([1]);
    expect(changed.verifySignatures()).toBe(false);
  });

  it("adds the authority signature after the player and rejects a stake the wallet did not sign", () => {
    const player = Keypair.generate();
    const authority = Keypair.generate();
    const mint = Keypair.generate().publicKey;
    const programId = new PublicKey("11111111111111111111111111111111");
    const chainNow = 1_000_000n;
    const tx = compileOpenDeposit({
      programId,
      matchId: 42n,
      stake: 1_000_000n,
      player: player.publicKey,
      authority: authority.publicKey,
      mint,
      joinBy: chainNow + 600n,
      settleBy: chainNow + 1_200n,
    });
    tx.recentBlockhash = "11111111111111111111111111111111";
    const unsigned = tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString("base64");
    const expected = {
      programId: programId.toBase58(),
      matchId: 42n,
      stake: 1_000_000n,
      player: player.publicKey.toBase58(),
      mint: mint.toBase58(),
      chainNow,
      joinWindow: 600n,
      settleWindow: 1_200n,
    };
    expect(() => coSignOpenDeposit(unsigned, authority, expected)).toThrow(/wallet signature/);
    tx.partialSign(player);
    const playerSigned = tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString("base64");
    const signed = coSignOpenDeposit(playerSigned, authority, expected);
    expect(messageHash(signed)).toBe(messageHash(playerSigned));
    expect(Transaction.from(Buffer.from(signed, "base64")).verifySignatures()).toBe(true);
    expect(coSignOpenDeposit(signed, authority, expected)).toBe(signed);

    const tampered = Transaction.from(Buffer.from(playerSigned, "base64"));
    tampered.instructions[0].data[9] ^= 0xff;
    expect(() => coSignOpenDeposit(tampered.serialize({ requireAllSignatures: false, verifySignatures: false }).toString("base64"), authority, expected)).toThrow(/does not match this room/);

    const late = compileOpenDeposit({
      programId,
      matchId: 42n,
      stake: 1_000_000n,
      player: player.publicKey,
      authority: authority.publicKey,
      mint,
      joinBy: chainNow + 9_000n,
      settleBy: chainNow + 9_001n,
    });
    late.recentBlockhash = tx.recentBlockhash;
    late.partialSign(player);
    expect(() => coSignOpenDeposit(late.serialize({ requireAllSignatures: false, verifySignatures: false }).toString("base64"), authority, expected)).toThrow(/deadline/);
  });

  it("accepts the one-signature payload a mobile wallet returns for a two-signer deposit", () => {
    const player = Keypair.generate();
    const authority = Keypair.generate();
    const mint = Keypair.generate().publicKey;
    const programId = new PublicKey("11111111111111111111111111111111");
    const chainNow = 1_000_000n;
    const tx = compileOpenDeposit({
      programId,
      matchId: 42n,
      stake: 1_000_000n,
      player: player.publicKey,
      authority: authority.publicKey,
      mint,
      joinBy: chainNow + 600n,
      settleBy: chainNow + 1_200n,
    });
    tx.recentBlockhash = "11111111111111111111111111111111";
    tx.partialSign(player);
    const message = Buffer.from(tx.serializeMessage());
    const signature = tx.signatures[0]?.signature;
    if (!signature) throw new Error("missing player signature");
    const mobile = Buffer.concat([Buffer.from([1]), Buffer.from(signature), message]);
    const expected = {
      programId: programId.toBase58(),
      matchId: 42n,
      stake: 1_000_000n,
      player: player.publicKey.toBase58(),
      mint: mint.toBase58(),
      chainNow,
      joinWindow: 600n,
      settleWindow: 1_200n,
    };
    const signed = coSignOpenDeposit(mobile.toString("base64"), authority, expected);
    const parsed = Transaction.from(Buffer.from(signed, "base64"));
    expect(parsed.verifySignatures()).toBe(true);
    expect(messageHash(signed)).toBe(createHash("sha256").update(message).digest("hex"));
  });
});

describe("escrow program selection", () => {
  it("keeps a room without an id on the legacy program", () => {
    expect(roomEscrowProgramId(undefined)).toBe(ESCROW_PROGRAM_ID);
    expect(roomEscrowProgramId(ESCROW_PROGRAM_ID)).toBe(ESCROW_PROGRAM_ID);
  });

  it("enables only the verified V2 program for public rooms", () => {
    const previous = process.env.SUDOKU_ESCROW_PROGRAM_ID;
    const staging = process.env.SUDOKU_STAGING;
    const cutover = process.env.SUDOKU_ESCROW_V2;
    process.env.SUDOKU_ESCROW_PROGRAM_ID = "11111111111111111111111111111111";
    delete process.env.SUDOKU_STAGING;
    delete process.env.SUDOKU_ESCROW_V2;
    expect(() => activeEscrowProgramId()).toThrow(/not enabled/);
    process.env.SUDOKU_ESCROW_V2 = "1";
    expect(() => activeEscrowProgramId()).toThrow(/not enabled/);
    process.env.SUDOKU_ESCROW_PROGRAM_ID = "937BAWXVCW58oEKkA1FijkSXXtdgGEytUyPRV2Roge22";
    expect(activeEscrowProgramId()).toBe("937BAWXVCW58oEKkA1FijkSXXtdgGEytUyPRV2Roge22");
    delete process.env.SUDOKU_ESCROW_V2;
    process.env.SUDOKU_STAGING = "1";
    process.env.SUDOKU_ESCROW_PROGRAM_ID = "11111111111111111111111111111111";
    expect(activeEscrowProgramId()).toBe("11111111111111111111111111111111");
    if (previous === undefined) delete process.env.SUDOKU_ESCROW_PROGRAM_ID;
    else process.env.SUDOKU_ESCROW_PROGRAM_ID = previous;
    if (staging === undefined) delete process.env.SUDOKU_STAGING;
    else process.env.SUDOKU_STAGING = staging;
    if (cutover === undefined) delete process.env.SUDOKU_ESCROW_V2;
    else process.env.SUDOKU_ESCROW_V2 = cutover;
  });
});
