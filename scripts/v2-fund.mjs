import { loadOperatorEnv } from "./operator-env.mjs";
/**
 * Funds the V2 upgrade key and match authority with Devnet SOL.
 * Prints public keys and lamport balances only.
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseEnv } from "node:util";
import { Connection, Keypair, SystemProgram, Transaction } from "@solana/web3.js";

const env = loadOperatorEnv();
const rpc = env.ARTPORTAL_SOLANA_RPC_URL?.trim();
if (!rpc?.startsWith("https://")) throw new Error("Devnet RPC URL is missing");
const connection = new Connection(rpc, "confirmed");
const key = (name) => Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(join(homedir(), ".config", "solana", name), "utf8"))));
const payer = key("sudoku-dev.json");
const targets = [
  ["upgrade", key("sudoku-v2-upgrade.json"), 1_500_000_000],
  ["matchAuthority", key("sudoku-v2-authority.json"), 1_200_000_000],
];

async function confirm(signature) {
  const started = Date.now();
  while (Date.now() - started < 45_000) {
    const status = (await connection.getSignatureStatuses([signature])).value[0];
    if (status?.err) throw new Error("Funding transaction failed");
    if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") return;
    await new Promise((resolve) => setTimeout(resolve, 800));
  }
  throw new Error("Funding confirmation timed out");
}

const report = [];
for (const [role, account, minimum] of targets) {
  const before = await connection.getBalance(account.publicKey);
  let signature = null;
  let source = "already-funded";
  if (before < minimum) {
    const needed = minimum - before;
    const transfer = async () => {
      const { blockhash } = await connection.getLatestBlockhash("confirmed");
      const tx = new Transaction({ feePayer: payer.publicKey, recentBlockhash: blockhash }).add(
        SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: account.publicKey, lamports: needed }),
      );
      tx.sign(payer);
      signature = await connection.sendRawTransaction(tx.serialize());
      source = "dev-wallet-transfer";
      await confirm(signature);
    };
    try {
      signature = await connection.requestAirdrop(account.publicKey, needed);
      source = "airdrop";
      await confirm(signature);
      if (await connection.getBalance(account.publicKey) < minimum) await transfer();
    } catch {
      await transfer();
    }
  }
  report.push({
    role,
    pubkey: account.publicKey.toBase58(),
    before,
    after: await connection.getBalance(account.publicKey),
    source,
    signature,
  });
}
console.log(JSON.stringify({ payer: payer.publicKey.toBase58(), payerAfter: await connection.getBalance(payer.publicKey), report }));
