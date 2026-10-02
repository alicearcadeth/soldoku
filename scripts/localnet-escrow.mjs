import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createMint,
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

const PROGRAM_ID = new PublicKey("HUkhJi8p1XXuErpEXkgpfQjwdapigXLECRoQSu3indyS");
const connection = new Connection("http://127.0.0.1:8899", "confirmed");
const STAKE = 1_000_000n;

function u64(value) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(value);
  return buf;
}

function i64(value) {
  const buf = Buffer.alloc(8);
  buf.writeBigInt64LE(value);
  return buf;
}

async function unixNow() {
  const info = await connection.getAccountInfo(SYSVAR_CLOCK_PUBKEY);
  if (!info) throw new Error("Clock sysvar missing");
  return info.data.readBigInt64LE(32);
}

async function send(payer, instructions, signers) {
  const tx = new Transaction().add(...instructions);
  await sendAndConfirmTransaction(connection, tx, [payer, ...signers.filter((signer) => signer !== payer)], {
    commitment: "confirmed",
  });
}

function matchPda(id) {
  const idBuf = u64(id);
  const [pda, bump] = PublicKey.findProgramAddressSync([Buffer.from("match"), idBuf], PROGRAM_ID);
  return { pda, bump, idBuf };
}

function openIx({ id, bump, idBuf, pda, mint, player, playerToken, vault, authority, joinDeadline, settleDeadline }) {
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: pda, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: playerToken, isSigner: false, isWritable: true },
      { pubkey: vault, isSigner: false, isWritable: true },
      { pubkey: player.publicKey, isSigner: true, isWritable: true },
      { pubkey: authority.publicKey, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([
      Buffer.from([0]),
      idBuf,
      u64(STAKE),
      i64(joinDeadline),
      i64(settleDeadline),
      Buffer.from([bump]),
    ]),
  });
}

function joinIx({ pda, mint, player, playerToken, vault }) {
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: pda, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: playerToken, isSigner: false, isWritable: true },
      { pubkey: vault, isSigner: false, isWritable: true },
      { pubkey: player.publicKey, isSigner: true, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.from([1]),
  });
}

function settleIx({ pda, mint, vault, tokenA, tokenB, authority, outcome }) {
  return new TransactionInstruction({
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
    data: Buffer.from([2, outcome]),
  });
}

function cancelIx({ pda, mint, vault, tokenA, tokenB, player }) {
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: pda, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: vault, isSigner: false, isWritable: true },
      { pubkey: tokenA, isSigner: false, isWritable: true },
      { pubkey: tokenB, isSigner: false, isWritable: true },
      { pubkey: player.publicKey, isSigner: true, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.from([3]),
  });
}

async function balance(tokenAccount) {
  const account = await getAccount(connection, tokenAccount);
  return account.amount;
}

async function fund(player, mint, mintAuthority) {
  const ata = await getOrCreateAssociatedTokenAccount(connection, player, mint, player.publicKey);
  await mintTo(connection, mintAuthority, mint, ata.address, mintAuthority, 5_000_000n);
  return ata.address;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const authority = Keypair.generate();
  const playerA = Keypair.generate();
  const playerB = Keypair.generate();
  for (const payer of [authority, playerA, playerB]) {
    const sig = await connection.requestAirdrop(payer.publicKey, 2_000_000_000);
    await connection.confirmTransaction(sig, "confirmed");
  }
  const mint = await createMint(connection, authority, authority.publicKey, null, 6);
  const tokenA = await fund(playerA, mint, authority);
  const tokenB = await fund(playerB, mint, authority);
  const now = await unixNow();

  const base = BigInt(Date.now());
  const opened = matchPda(base);
  const vault = getAssociatedTokenAddressSync(mint, opened.pda, true);
  await send(playerA, [
    openIx({
      ...opened,
      mint,
      player: playerA,
      playerToken: tokenA,
      vault,
      authority,
      joinDeadline: now + 3600n,
      settleDeadline: now + 7200n,
    }),
  ], [playerA]);
  await send(playerB, [joinIx({ pda: opened.pda, mint, player: playerB, playerToken: tokenB, vault })], [playerB]);
  await send(authority, [
    settleIx({ pda: opened.pda, mint, vault, tokenA, tokenB, authority, outcome: 1 }),
  ], [authority]);
  const afterWinA = await balance(tokenA);
  const afterWinB = await balance(tokenB);
  if (afterWinA !== 6_000_000n) throw new Error(`winner balance ${afterWinA}`);
  if (afterWinB !== 4_000_000n) throw new Error(`loser balance ${afterWinB}`);
  await send(authority, [
    settleIx({ pda: opened.pda, mint, vault, tokenA, tokenB, authority, outcome: 1 }),
  ], [authority]);
  if ((await balance(tokenA)) !== afterWinA || (await balance(tokenB)) !== afterWinB) {
    throw new Error("repeated settle moved tokens");
  }
  console.log("settle: winner received both stakes; replay was a no-op");

  const waiting = matchPda(base + 1n);
  const waitingVault = getAssociatedTokenAddressSync(mint, waiting.pda, true);
  const beforeCancel = await balance(tokenA);
  const cancelOpenAt = await unixNow();
  await send(playerA, [
    openIx({
      ...waiting,
      mint,
      player: playerA,
      playerToken: tokenA,
      vault: waitingVault,
      authority,
      joinDeadline: cancelOpenAt + 2n,
      settleDeadline: cancelOpenAt + 4000n,
    }),
  ], [playerA]);
  await sleep(4000);
  await send(playerA, [
    cancelIx({ pda: waiting.pda, mint, vault: waitingVault, tokenA, tokenB, player: playerA }),
  ], [playerA]);
  if ((await balance(tokenA)) !== beforeCancel) throw new Error("unjoined match did not refund");
  await send(playerA, [
    cancelIx({ pda: waiting.pda, mint, vault: waitingVault, tokenA, tokenB, player: playerA }),
  ], [playerA]);
  console.log("cancel: lone deposit refunded; replay was a no-op");

  const active = matchPda(base + 2n);
  const activeVault = getAssociatedTokenAddressSync(mint, active.pda, true);
  const freshNow = await unixNow();
  await send(playerA, [
    openIx({
      ...active,
      mint,
      player: playerA,
      playerToken: tokenA,
      vault: activeVault,
      authority,
      joinDeadline: freshNow + 4n,
      settleDeadline: freshNow + 6n,
    }),
  ], [playerA]);
  await send(playerB, [joinIx({ pda: active.pda, mint, player: playerB, playerToken: tokenB, vault: activeVault })], [playerB]);
  const lockedA = await balance(tokenA);
  const lockedB = await balance(tokenB);
  await sleep(8000);
  await send(playerB, [
    cancelIx({ pda: active.pda, mint, vault: activeVault, tokenA, tokenB, player: playerB }),
  ], [playerB]);
  if ((await balance(tokenA)) !== lockedA + STAKE) throw new Error("active cancel missed player A");
  if ((await balance(tokenB)) !== lockedB + STAKE) throw new Error("active cancel missed player B");
  console.log("cancel: both stakes refunded after the settle deadline");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
