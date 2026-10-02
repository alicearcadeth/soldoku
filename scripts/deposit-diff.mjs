import { loadOperatorEnv } from "./operator-env.mjs";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";

const SITE = "https://sudoku.jamesbitarcade.workers.dev";
const WALLET = "6qtMCHsqEwxpYqqrdQWbDdJFFYzpKs8o5mmW1Zd9Bju2";
const V2 = "937BAWXVCW58oEKkA1FijkSXXtdgGEytUyPRV2Roge22";
const MAINNET = "https://api.mainnet-beta.solana.com";

function rpcUrl() {
  const env = loadOperatorEnv();
  const value = (env.SOLANA_RPC || env.ARTPORTAL_SOLANA_RPC_URL || "").trim();
  if (!value) throw new Error("Devnet RPC is not configured");
  return value;
}

function sha(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function simulate(url, bytes, config) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "simulateTransaction",
      params: [Buffer.from(bytes).toString("base64"), { encoding: "base64", commitment: "confirmed", ...config }],
    }),
  });
  const body = await response.json();
  const value = body.result?.value;
  return {
    http: response.status,
    rpcError: body.error?.message ?? null,
    err: value?.err ?? null,
    units: value?.unitsConsumed ?? null,
    logs: (value?.logs ?? []).slice(0, 8),
  };
}

function summarize(bytes) {
  const tx = Transaction.from(bytes);
  const message = tx.compileMessage();
  return {
    bytes: bytes.length,
    messageSha256: sha(message.serialize()),
    wireSha256: sha(bytes),
    version: "legacy",
    feePayer: tx.feePayer?.toBase58() ?? null,
    feePayerIsWallet: tx.feePayer?.toBase58() === WALLET,
    recentBlockhash: tx.recentBlockhash,
    requiredSigners: message.accountKeys.slice(0, message.header.numRequiredSignatures).map((key) => key.toBase58()),
    signatures: tx.signatures.map((item) => ({
      pubkey: item.publicKey.toBase58(),
      present: item.signature != null,
    })),
    instructions: tx.instructions.map((ix) => ({
      programId: ix.programId.toBase58(),
      data: [...ix.data],
      accounts: ix.keys.map((key) => ({
        pubkey: key.pubkey.toBase58(),
        signer: key.isSigner,
        writable: key.isWritable,
      })),
    })),
  };
}

const seat = await (await fetch(`${SITE}/api/rooms/prepare`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ code: "CG5M", playerId: "3cd24cf23dc01304" }),
})).json();
if (!seat.tx) throw new Error(seat.error ?? "Prepare did not return a transaction");
const original = Buffer.from(seat.tx, "base64");
const summary = summarize(original);
const devnet = new Connection(rpcUrl(), "confirmed");
const mainnet = new Connection(MAINNET, "confirmed");
const [devnetHash, mainnetHash, devnetBalance, mainnetBalance, rentMatch, rentToken, latest, blockhashValid, programDev, programMain, source] = await Promise.all([
  devnet.getGenesisHash(),
  mainnet.getGenesisHash(),
  devnet.getBalance(new PublicKey(WALLET)),
  mainnet.getBalance(new PublicKey(WALLET)),
  devnet.getMinimumBalanceForRentExemption(163),
  devnet.getMinimumBalanceForRentExemption(165),
  devnet.getLatestBlockhash(),
  devnet.isBlockhashValid(summary.recentBlockhash, { commitment: "confirmed" }),
  devnet.getAccountInfo(new PublicKey(V2)),
  mainnet.getAccountInfo(new PublicKey(V2)),
  devnet.getAccountInfo(new PublicKey(summary.instructions[0].accounts[2].pubkey)),
]);
const fee = await devnet.getFeeForMessage(Transaction.from(original).compileMessage(), "confirmed");
const unsigned = Transaction.from(original);
unsigned.signatures.forEach((item) => {
  item.signature = null;
});
const unsignedBytes = unsigned.serialize({ requireAllSignatures: false, verifySignatures: false });
const replaced = Transaction.from(original);
replaced.recentBlockhash = latest.blockhash;
const replacedBytes = replaced.serialize({ requireAllSignatures: false, verifySignatures: false });
const player = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(join(homedir(), ".config", "solana", "sudoku-phantom-disposable.json"), "utf8"))));
const authority = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(join(homedir(), ".config", "solana", "sudoku-authority.json"), "utf8"))));
if (player.publicKey.toBase58() !== WALLET) throw new Error("Disposable key does not match the public test wallet");
const complete = Transaction.from(original);
complete.partialSign(player);
complete.partialSign(authority);
const completeBytes = complete.serialize();
const stale = Transaction.from(completeBytes);
stale.recentBlockhash = latest.blockhash;
const staleBytes = stale.serialize({ requireAllSignatures: false, verifySignatures: false });
const [devFalse, devTrue, mainFalse, unsignedFalse, replacedTrue, completeTrue, staleTrue, partialReplaceFalse] = await Promise.all([
  simulate(rpcUrl(), original, { sigVerify: false, replaceRecentBlockhash: false }),
  simulate(rpcUrl(), original, { sigVerify: true, replaceRecentBlockhash: false }),
  simulate(MAINNET, original, { sigVerify: false, replaceRecentBlockhash: false }),
  simulate(rpcUrl(), unsignedBytes, { sigVerify: false, replaceRecentBlockhash: false }),
  simulate(rpcUrl(), replacedBytes, { sigVerify: true, replaceRecentBlockhash: false }),
  simulate(rpcUrl(), completeBytes, { sigVerify: true, replaceRecentBlockhash: false }),
  simulate(rpcUrl(), staleBytes, { sigVerify: true, replaceRecentBlockhash: false }),
  simulate(rpcUrl(), original, { sigVerify: false, replaceRecentBlockhash: true }),
]);

console.log(JSON.stringify({
  boundary: "worker-prepare",
  feePayer: summary.feePayer,
  feePayerIsDisposableWallet: summary.feePayerIsWallet,
  version: summary.version,
  messageSha256: summary.messageSha256,
  wireSha256: summary.wireSha256,
  recentBlockhash: summary.recentBlockhash,
  blockhashStillValid: blockhashValid,
  latestBlockhashDiffers: latest.blockhash !== summary.recentBlockhash,
  lastValidBlockHeight: latest.lastValidBlockHeight,
  requiredSigners: summary.requiredSigners,
  signatures: summary.signatures,
  programId: summary.instructions[0]?.programId ?? null,
  programIsV2: summary.instructions[0]?.programId === V2,
  instructionCount: summary.instructions.length,
  discriminator: summary.instructions[0]?.data[0] ?? null,
  dataLength: summary.instructions[0]?.data.length ?? null,
  accounts: summary.instructions[0]?.accounts ?? [],
  computeBudget: summary.instructions.some((ix) => ix.programId === "ComputeBudget111111111111111111111111111111"),
  vault: seat.vault ?? null,
  devnetGenesis: devnetHash,
  mainnetGenesis: mainnetHash,
  devnetLamports: devnetBalance,
  mainnetLamports: mainnetBalance,
  feeLamports: fee.value,
  rentMatchLamports: rentMatch,
  rentTokenLamports: rentToken,
  rentPlusFee: rentMatch + rentToken + (fee.value ?? 0),
  sourceTokenExists: Boolean(source),
  sourceTokenLamports: source?.lamports ?? 0,
  programOnDevnet: Boolean(programDev),
  programExecutable: programDev?.executable ?? false,
  programOnMainnet: Boolean(programMain),
  simDevnetSigVerifyFalse: devFalse,
  simDevnetSigVerifyTrue: devTrue,
  simMainnetSigVerifyFalse: mainFalse,
  simUnsignedSigVerifyFalse: unsignedFalse,
  simReplacedBlockhashSigVerifyTrue: replacedTrue,
  localCompleteSigVerifyTrue: completeTrue,
  localCompleteThenNewBlockhashSigVerifyTrue: staleTrue,
  partialReplaceBlockhashSigVerifyFalse: partialReplaceFalse,
  unsignedMessageSame: summarize(unsignedBytes).messageSha256 === summary.messageSha256,
  completeMessageSame: summarize(completeBytes).messageSha256 === summary.messageSha256,
  broadcast: false,
}, null, 2));
