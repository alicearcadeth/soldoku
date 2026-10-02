import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
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
import { ensureTestMint, testSettlementMint } from "../solana/testMint";
import { createMatchStore, MIN_MOVE_GAP_MS } from "./rooms";

const EXPECTED = "JCVsKd4TMg1fvEs7rjf5YgLYbJfNC8Dwb4x1PchFkGM7";
const PROGRAM_ID = new PublicKey("HUkhJi8p1XXuErpEXkgpfQjwdapigXLECRoQSu3indyS");
const connection = new Connection("http://127.0.0.1:8899", "confirmed");

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

describe.skipIf(!up)("staked match on localnet", () => {
  it("pays the dev wallet after that wallet finishes the shared puzzle", async () => {
    const playerA = Keypair.fromSecretKey(
      Uint8Array.from(JSON.parse(readFileSync(join(homedir(), ".config", "solana", "sudoku-dev.json"), "utf8"))),
    );
    expect(playerA.publicKey.toBase58()).toBe(EXPECTED);
    const playerB = Keypair.generate();
    const authority = Keypair.generate();
    for (const payer of [playerA, playerB, authority]) {
      const sig = await connection.requestAirdrop(payer.publicKey, 2_000_000_000);
      await connection.confirmTransaction(sig, "confirmed");
    }
    const mint = await ensureTestMint(connection, authority);
    const tokenA = (await getOrCreateAssociatedTokenAccount(connection, playerA, mint, playerA.publicKey)).address;
    const tokenB = (await getOrCreateAssociatedTokenAccount(connection, playerB, mint, playerB.publicKey)).address;
    const beforeA = (await getAccount(connection, tokenA)).amount;
    const beforeB = (await getAccount(connection, tokenB)).amount;
    await mintTo(connection, authority, mint, tokenA, testSettlementMint(), 5_000_000n);
    await mintTo(connection, authority, mint, tokenB, testSettlementMint(), 5_000_000n);

    const clock = (await connection.getAccountInfo(SYSVAR_CLOCK_PUBKEY))!;
    const chainNow = clock.data.readBigInt64LE(32);
    const idBuf = Buffer.alloc(8);
    idBuf.writeBigUInt64LE(BigInt(Date.now()));
    const [pda, bump] = PublicKey.findProgramAddressSync([Buffer.from("match"), idBuf], PROGRAM_ID);
    const vault = getAssociatedTokenAddressSync(mint, pda, true);
    const stake = Buffer.alloc(8);
    stake.writeBigUInt64LE(1_000_000n);
    const joinBy = Buffer.alloc(8);
    joinBy.writeBigInt64LE(chainNow + 600n);
    const settleBy = Buffer.alloc(8);
    settleBy.writeBigInt64LE(chainNow + 1200n);
    await send(
      playerA,
      new TransactionInstruction({
        programId: PROGRAM_ID,
        keys: [
          { pubkey: pda, isSigner: false, isWritable: true },
          { pubkey: mint, isSigner: false, isWritable: false },
          { pubkey: tokenA, isSigner: false, isWritable: true },
          { pubkey: vault, isSigner: false, isWritable: true },
          { pubkey: playerA.publicKey, isSigner: true, isWritable: true },
          { pubkey: authority.publicKey, isSigner: true, isWritable: false },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
          { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
          data: Buffer.concat([Buffer.from([0]), idBuf, stake, joinBy, settleBy, Buffer.from([bump])]),
        }),
      [authority],
    );
    await send(
      playerB,
      new TransactionInstruction({
        programId: PROGRAM_ID,
        keys: [
          { pubkey: pda, isSigner: false, isWritable: true },
          { pubkey: mint, isSigner: false, isWritable: false },
          { pubkey: tokenB, isSigner: false, isWritable: true },
          { pubkey: vault, isSigner: false, isWritable: true },
          { pubkey: playerB.publicKey, isSigner: true, isWritable: false },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        ],
        data: Buffer.from([1]),
      }),
    );

    let gameClock = 5_000_000;
    const store = createMatchStore(() => gameClock, true);
    const hostGate = store.issueCaptcha();
    store.checkCaptcha(hostGate.id, hostGate.target);
    const host = store.createRoom("easy", hostGate.id) as {
      code: string;
      playerId: string;
      givens: number[];
      solution: number[];
    };
    const guestGate = store.issueCaptcha();
    store.checkCaptcha(guestGate.id, guestGate.target);
    store.joinRoom(host.code, guestGate.id);
    let board = host.givens.slice();
    for (let cell = 0; cell < 81; cell++) {
      if (board[cell]) continue;
      board = board.slice();
      board[cell] = host.solution[cell];
      gameClock += MIN_MOVE_GAP_MS + 100;
      store.move(host.code, host.playerId, board);
    }
    const verdict = store.state(host.code, host.playerId).verdict;
    expect(verdict).toMatchObject({ outcome: "win", winnerId: host.playerId });

    await send(
      authority,
      new TransactionInstruction({
        programId: PROGRAM_ID,
        keys: [
          { pubkey: pda, isSigner: false, isWritable: true },
          { pubkey: mint, isSigner: false, isWritable: false },
          { pubkey: vault, isSigner: false, isWritable: true },
          { pubkey: tokenA, isSigner: false, isWritable: true },
          { pubkey: tokenB, isSigner: false, isWritable: true },
          { pubkey: authority.publicKey, isSigner: true, isWritable: false },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        ],
        data: Buffer.from([2, 1]),
      }),
    );
    await send(
      authority,
      new TransactionInstruction({
        programId: PROGRAM_ID,
        keys: [
          { pubkey: pda, isSigner: false, isWritable: true },
          { pubkey: mint, isSigner: false, isWritable: false },
          { pubkey: vault, isSigner: false, isWritable: true },
          { pubkey: tokenA, isSigner: false, isWritable: true },
          { pubkey: tokenB, isSigner: false, isWritable: true },
          { pubkey: authority.publicKey, isSigner: true, isWritable: false },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        ],
        data: Buffer.from([2, 1]),
      }),
    );
    expect((await getAccount(connection, tokenA)).amount).toBe(beforeA + 6_000_000n);
    expect((await getAccount(connection, tokenB)).amount).toBe(beforeB + 4_000_000n);
  }, 60_000);
});

async function send(payer: Keypair, ix: TransactionInstruction, extra: Keypair[] = []) {
  await sendAndConfirmTransaction(connection, new Transaction().add(ix), [payer, ...extra]);
}
