import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createMint,
  createTransferInstruction,
  getAccount,
  getAssociatedTokenAddressSync,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import {
  Connection,
  Keypair,
  PublicKey,
  SYSVAR_CLOCK_PUBKEY,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import { closeEscrowInstruction } from "../solana/closeEscrow";
import { ensureTestMint, testSettlementMint } from "../solana/testMint";

const PROGRAM_ID = new PublicKey("HUkhJi8p1XXuErpEXkgpfQjwdapigXLECRoQSu3indyS");
const connection = new Connection("http://127.0.0.1:8899", "confirmed");
const STAKE = 1_000_000n;

async function localnetUp() {
  try {
    const response = await fetch("http://127.0.0.1:8899", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getHealth" }),
      signal: AbortSignal.timeout(2000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

const up = await localnetUp();

function u64(value: bigint) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(value);
  return buf;
}
function i64(value: bigint) {
  const buf = Buffer.alloc(8);
  buf.writeBigInt64LE(value);
  return buf;
}
function textOf(error: unknown) {
  const logs = error && typeof error === "object" && "logs" in error && Array.isArray(error.logs) ? error.logs.join(" ") : "";
  return `${error instanceof Error ? error.message : String(error)} ${logs}`;
}
async function fails(run: () => Promise<unknown>, pattern: RegExp) {
  try {
    await run();
  } catch (error) {
    expect(textOf(error)).toMatch(pattern);
    return;
  }
  throw new Error(`expected ${pattern}`);
}
async function send(signers: Keypair[], ix: TransactionInstruction) {
  const tx = new Transaction().add(ix);
  return sendAndConfirmTransaction(connection, tx, signers);
}

describe.skipIf(!up)("escrow v2 on localnet", () => {
  it("binds open to the signing authority and still refunds without that authority", async () => {
    const playerA = Keypair.generate();
    const playerB = Keypair.generate();
    const appAuthority = Keypair.generate();
    const otherAuthority = Keypair.generate();
    const mintAuthority = Keypair.generate();
    for (const payer of [playerA, playerB, appAuthority, otherAuthority, mintAuthority]) {
      const sig = await connection.requestAirdrop(payer.publicKey, 2_000_000_000);
      await connection.confirmTransaction(sig, "confirmed");
    }
    const mint = await ensureTestMint(connection, mintAuthority);
    const otherMint = await createMint(connection, mintAuthority, mintAuthority.publicKey, null, 6);
    const tokenA = (await getOrCreateAssociatedTokenAccount(connection, playerA, mint, playerA.publicKey)).address;
    const tokenB = (await getOrCreateAssociatedTokenAccount(connection, playerB, mint, playerB.publicKey)).address;
    await mintTo(connection, mintAuthority, mint, tokenA, testSettlementMint(), 8_000_000n);
    await mintTo(connection, mintAuthority, mint, tokenB, testSettlementMint(), 8_000_000n);
    const now = async () => (await connection.getAccountInfo(SYSVAR_CLOCK_PUBKEY))!.data.readBigInt64LE(32);
    let sequence = BigInt(Date.now());
    const next = () => {
      sequence += 1n;
      const id = u64(sequence);
      const [pda, bump] = PublicKey.findProgramAddressSync([Buffer.from("match"), id], PROGRAM_ID);
      return { id: sequence, idBuf: id, pda, bump, vault: getAssociatedTokenAddressSync(mint, pda, true) };
    };
    const openIx = (match: ReturnType<typeof next>, authority: PublicKey, authoritySigns: boolean, token = tokenA, joinBy: bigint, settleBy: bigint, vault = match.vault, stake = STAKE) =>
      new TransactionInstruction({
        programId: PROGRAM_ID,
        keys: [
          { pubkey: match.pda, isSigner: false, isWritable: true },
          { pubkey: mint, isSigner: false, isWritable: false },
          { pubkey: token, isSigner: false, isWritable: true },
          { pubkey: vault, isSigner: false, isWritable: true },
          { pubkey: playerA.publicKey, isSigner: true, isWritable: true },
          { pubkey: authority, isSigner: authoritySigns, isWritable: false },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
          { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        data: Buffer.concat([Buffer.from([0]), match.idBuf, u64(stake), i64(joinBy), i64(settleBy), Buffer.from([match.bump])]),
      });
    const joinIx = (match: ReturnType<typeof next>) => new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: match.pda, isSigner: false, isWritable: true },
        { pubkey: mint, isSigner: false, isWritable: false },
        { pubkey: tokenB, isSigner: false, isWritable: true },
        { pubkey: match.vault, isSigner: false, isWritable: true },
        { pubkey: playerB.publicKey, isSigner: true, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      data: Buffer.from([1]),
    });
    const settleIx = (match: ReturnType<typeof next>, authority: Keypair, outcome: number) => new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: match.pda, isSigner: false, isWritable: true },
        { pubkey: mint, isSigner: false, isWritable: false },
        { pubkey: match.vault, isSigner: false, isWritable: true },
        { pubkey: tokenA, isSigner: false, isWritable: true },
        { pubkey: tokenB, isSigner: false, isWritable: true },
        { pubkey: authority.publicKey, isSigner: true, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      data: Buffer.from([2, outcome]),
    });
    const cancelIx = (match: ReturnType<typeof next>, signer: Keypair) => new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: match.pda, isSigner: false, isWritable: true },
        { pubkey: mint, isSigner: false, isWritable: false },
        { pubkey: match.vault, isSigner: false, isWritable: true },
        { pubkey: tokenA, isSigner: false, isWritable: true },
        { pubkey: tokenB, isSigner: false, isWritable: true },
        { pubkey: signer.publicKey, isSigner: true, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      data: Buffer.from([3]),
    });

    const clock = await now();
    const hijack = next();
    await fails(() => send([playerA], openIx(hijack, otherAuthority.publicKey, false, tokenA, clock + 600n, clock + 1200n)), /signature/i);
    expect(await connection.getAccountInfo(hijack.pda)).toBeNull();

    const opened = next();
    const first = new Transaction().add(openIx(opened, appAuthority.publicKey, true, tokenA, clock + 600n, clock + 1200n));
    first.feePayer = playerA.publicKey;
    first.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
    first.partialSign(appAuthority, playerA);
    const preview = await connection.simulateTransaction(first);
    expect(preview.value.err).toBeNull();
    expect(await connection.getAccountInfo(opened.pda)).toBeNull();
    const raw = first.serialize();
    const signature = await connection.sendRawTransaction(raw);
    await connection.confirmTransaction(signature, "confirmed");
    await connection.sendRawTransaction(raw).catch((error: unknown) => {
      expect(textOf(error)).toMatch(/processed|already/i);
    });
    const record = (await connection.getAccountInfo(opened.pda))!;
    expect(record.owner.equals(PROGRAM_ID)).toBe(true);
    expect(new PublicKey(record.data.subarray(8, 40)).equals(appAuthority.publicKey)).toBe(true);
    expect((await getAccount(connection, opened.vault)).amount).toBe(STAKE);
    await fails(() => send([appAuthority], settleIx(opened, appAuthority, 1)), /invalid account data/i);

    const wrongToken = next();
    await fails(() => send([playerA, appAuthority], openIx(wrongToken, appAuthority.publicKey, true, tokenB, clock + 600n, clock + 1200n)), /invalid account data|incorrect program/i);
    const wrongVault = next();
    await fails(() => send([playerA, appAuthority], openIx(wrongVault, appAuthority.publicKey, true, tokenA, clock + 600n, clock + 1200n, Keypair.generate().publicKey)), /seed|associated address|invalid account data/i);
    await fails(() => send([playerA, appAuthority], new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: openIx(wrongVault, appAuthority.publicKey, true, tokenA, clock + 600n, clock + 1200n).keys.map((key, index) => index === 0 ? { ...key, pubkey: mint } : key),
      data: openIx(wrongVault, appAuthority.publicKey, true, tokenA, clock + 600n, clock + 1200n).data,
    })), /seed|invalid/i);
    await fails(() => send([playerA, appAuthority], openIx(opened, appAuthority.publicKey, true, tokenA, clock + 600n, clock + 1200n)), /already in use|invalid/i);

    await send([playerB], joinIx(opened));
    await fails(() => send([playerB], joinIx(opened)), /invalid account data/i);
    expect((await getAccount(connection, opened.vault)).amount).toBe(STAKE * 2n);
    const beforeWin = await getAccount(connection, tokenA);
    await send([appAuthority], settleIx(opened, appAuthority, 1));
    await send([appAuthority], settleIx(opened, appAuthority, 1));
    expect((await getAccount(connection, tokenA)).amount).toBe(beforeWin.amount + STAKE * 2n);
    expect((await getAccount(connection, opened.vault)).amount).toBe(0n);
    expect((await connection.getAccountInfo(opened.pda))!.data[160]).toBe(2);
    await fails(() => send([playerA], cancelIx(opened, playerA)), /invalid account data/i);
    const closeFor = (match: ReturnType<typeof next>, signer: Keypair) => closeEscrowInstruction(PROGRAM_ID, match.pda, mint, match.vault, signer.publicKey);
    const expectRentReturned = async (match: ReturnType<typeof next>, signer: Keypair) => {
      const solBefore = await connection.getBalance(signer.publicKey);
      const matchLamports = (await connection.getAccountInfo(match.pda))!.lamports;
      const vaultLamports = (await connection.getAccountInfo(match.vault))!.lamports;
      await send([signer], closeFor(match, signer));
      expect(await connection.getAccountInfo(match.pda)).toBeNull();
      expect(await connection.getAccountInfo(match.vault)).toBeNull();
      expect(await connection.getBalance(signer.publicKey)).toBe(solBefore + matchLamports + vaultLamports - 5_000);
      await fails(() => send([signer], closeFor(match, signer)), /not found|invalid|debit|insufficient|AccountNotFound/i);
    };
    const substituted = next();
    const swappedProgram = openIx(substituted, appAuthority.publicKey, true, tokenA, clock + 600n, clock + 1200n);
    swappedProgram.keys[6] = { pubkey: SystemProgram.programId, isSigner: false, isWritable: false };
    await fails(() => send([playerA, appAuthority], swappedProgram), /seed|associated|incorrect program|invalid|privilege|owner/i);
    expect(await connection.getAccountInfo(substituted.pda)).toBeNull();
    await fails(() => send([playerB], closeFor(opened, playerB)), /signature|missing|invalid/i);
    await fails(() => send([playerA], closeEscrowInstruction(PROGRAM_ID, opened.pda, Keypair.generate().publicKey, opened.vault, playerA.publicKey)), /invalid/i);
    await fails(() => send([playerA], closeEscrowInstruction(PROGRAM_ID, opened.pda, mint, tokenA, playerA.publicKey)), /invalid|associated|seed/i);
    await expectRentReturned(opened, playerA);

    const foreign = next();
    await send([playerA, otherAuthority], openIx(foreign, otherAuthority.publicKey, true, tokenA, clock + 600n, clock + 1200n));
    const foreignRecord = (await connection.getAccountInfo(foreign.pda))!;
    expect(new PublicKey(foreignRecord.data.subarray(8, 40)).equals(otherAuthority.publicKey)).toBe(true);
    expect(new PublicKey(foreignRecord.data.subarray(8, 40)).equals(appAuthority.publicKey)).toBe(false);

    const drawn = next();
    const later = await now();
    await send([playerA, appAuthority], openIx(drawn, appAuthority.publicKey, true, tokenA, later + 600n, later + 1200n));
    await send([playerB], joinIx(drawn));
    const drawA = (await getAccount(connection, tokenA)).amount;
    const drawB = (await getAccount(connection, tokenB)).amount;
    await send([appAuthority], settleIx(drawn, appAuthority, 3));
    await send([appAuthority], settleIx(drawn, appAuthority, 3));
    expect((await getAccount(connection, tokenA)).amount).toBe(drawA + STAKE);
    expect((await getAccount(connection, tokenB)).amount).toBe(drawB + STAKE);
    expect((await getAccount(connection, drawn.vault)).amount).toBe(0n);
    await fails(() => send([playerB], closeFor(drawn, playerB)), /signature|missing|invalid/i);
    await fails(() => send([appAuthority], closeFor(drawn, appAuthority)), /signature|missing|invalid/i);
    await expectRentReturned(drawn, playerA);

    const waiting = next();
    const refundClock = await now();
    await send([playerA, appAuthority], openIx(waiting, appAuthority.publicKey, true, tokenA, refundClock + 3n, refundClock + 30n));
    const waitingBefore = (await getAccount(connection, tokenA)).amount;
    await fails(() => send([playerA], cancelIx(waiting, playerA)), /invalid account data/i);
    const stuck = next();
    const stuckClock = await now();
    await send([playerA, appAuthority], openIx(stuck, appAuthority.publicKey, true, tokenA, stuckClock + 20n, stuckClock + 25n));
    await send([playerB], joinIx(stuck));
    const stuckA = (await getAccount(connection, tokenA)).amount;
    const stuckB = (await getAccount(connection, tokenB)).amount;
    const sinceStuck = Number((await now()) - stuckClock);
    await new Promise((resolve) => setTimeout(resolve, Math.max(5_000, (26 - sinceStuck) * 1000)));
    await send([playerA], cancelIx(waiting, playerA));
    await send([playerA], cancelIx(waiting, playerA));
    expect((await getAccount(connection, tokenA)).amount).toBe(waitingBefore);
    expect((await connection.getAccountInfo(waiting.pda))!.data[160]).toBe(3);
    await fails(() => send([appAuthority], settleIx(waiting, appAuthority, 1)), /invalid account data/i);
    await expectRentReturned(waiting, playerA);
    await send([playerB], cancelIx(stuck, playerB));
    await send([playerB], cancelIx(stuck, playerB));
    expect((await getAccount(connection, tokenA)).amount).toBe(stuckA + STAKE * 2n);
    expect((await getAccount(connection, tokenB)).amount).toBe(stuckB + STAKE);
    expect((await getAccount(connection, stuck.vault)).amount).toBe(0n);
    expect((await connection.getAccountInfo(stuck.pda))!.data[160]).toBe(3);
    await expectRentReturned(stuck, playerA);

    const priced = next();
    const pricedClock = await now();
    const zero = next();
    await fails(() => send([playerA, appAuthority], openIx(zero, appAuthority.publicKey, true, tokenA, pricedClock + 600n, pricedClock + 1200n, zero.vault, 0n)), /invalid/i);
    const overflow = next();
    await fails(() => send([playerA, appAuthority], openIx(overflow, appAuthority.publicKey, true, tokenA, pricedClock + 600n, pricedClock + 1200n, overflow.vault, 1n << 63n)), /invalid/i);
    const wrongMint = next();
    const wrongMintIx = openIx(wrongMint, appAuthority.publicKey, true, tokenA, pricedClock + 600n, pricedClock + 1200n);
    wrongMintIx.keys[1] = { pubkey: otherMint, isSigner: false, isWritable: false };
    await fails(() => send([playerA, appAuthority], wrongMintIx), /invalid account data|invalid account owner/i);
    expect(await connection.getAccountInfo(wrongMint.pda)).toBeNull();
    await send([playerA, appAuthority], openIx(priced, appAuthority.publicKey, true, tokenA, pricedClock + 600n, pricedClock + 1200n, priced.vault, 2_000_000n));
    const pricedData = (await connection.getAccountInfo(priced.pda))!.data;
    expect(pricedData.readBigUInt64LE(136)).toBe(2_000_000n);
    expect((await getAccount(connection, priced.vault)).amount).toBe(2_000_000n);
    await send([playerB], joinIx(priced));
    expect((await getAccount(connection, priced.vault)).amount).toBe(4_000_000n);
    await fails(() => send([playerA], closeFor(priced, playerA)), /invalid account data/i);
    await fails(() => send([playerA], closeFor(foreign, playerA)), /invalid account data/i);
    const pricedA = (await getAccount(connection, tokenA)).amount;
    await send([appAuthority], settleIx(priced, appAuthority, 1));
    expect((await getAccount(connection, tokenA)).amount).toBe(pricedA + 4_000_000n);
    expect((await getAccount(connection, priced.vault)).amount).toBe(0n);
    await send([playerA], createTransferInstruction(tokenA, priced.vault, playerA.publicKey, 1n));
    expect((await getAccount(connection, priced.vault)).amount).toBe(1n);
    await fails(() => send([playerA], closeFor(priced, playerA)), /invalid account data/i);
    expect(await connection.getAccountInfo(priced.pda)).not.toBeNull();
  }, 120_000);
});
