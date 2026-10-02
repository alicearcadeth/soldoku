import { loadOperatorEnv } from "./operator-env.mjs";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseEnv } from "node:util";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";

const env = loadOperatorEnv();
const rpc = env.ARTPORTAL_SOLANA_RPC_URL?.trim();
if (!rpc) throw new Error("missing devnet rpc");
const connection = new Connection(rpc, "confirmed");
const genesis = await connection.getGenesisHash();
const devnet = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";
if (genesis !== devnet) throw new Error("rpc is not devnet");

function loadOrCreate(name) {
  const file = join(homedir(), ".config", "solana", name);
  if (!existsSync(file)) {
    const created = Keypair.generate();
    writeFileSync(file, JSON.stringify(Array.from(created.secretKey)));
  }
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(file, "utf8"))));
}

const program = loadOrCreate("sudoku-staging-program.json");
const upgrade = loadOrCreate("sudoku-staging-upgrade.json");
const forbidden = new Set([
  "4GqmVjmNLwfJ8UrtGTV9C2RZAqNqRiaGGmCsKRX7EKMH",
  "937BAWXVCW58oEKkA1FijkSXXtdgGEytUyPRV2Roge22",
  "HUkhJi8p1XXuErpEXkgpfQjwdapigXLECRoQSu3indyS",
  "7pxUUSe4jNiN4bwV6a4gtaLwfpz5JBseHGC9j2mvwzW7",
]);
if (forbidden.has(program.publicKey.toBase58()) || forbidden.has(upgrade.publicKey.toBase58())) {
  throw new Error("staging key collided with a protected identity");
}

async function balance(label, key) {
  const lamports = await connection.getBalance(key);
  return { label, pubkey: key.toBase58(), sol: lamports / 1_000_000_000 };
}

const before = [
  await balance("program", program.publicKey),
  await balance("upgrade", upgrade.publicKey),
];
async function requestAirdrop(target) {
  const attempts = [connection, new Connection("https://api.devnet.solana.com", "confirmed")];
  const errors = [];
  for (const endpoint of attempts) {
    try {
      const sig = await endpoint.requestAirdrop(target, 1_000_000_000);
      await endpoint.confirmTransaction(sig, "confirmed");
      return "confirmed";
    } catch (error) {
      errors.push(String(error instanceof Error ? error.message : error).replace(/https?:\/\/\S+/g, "<rpc>").slice(0, 180));
    }
  }
  return errors.join(" | ");
}

let airdrop = "not-requested";
if (process.argv.includes("--airdrop") && before[1].sol < 2) airdrop = await requestAirdrop(upgrade.publicKey);
const after = await balance("upgrade", upgrade.publicKey);
const known = [
  ["dev-player", "JCVsKd4TMg1fvEs7rjf5YgLYbJfNC8Dwb4x1PchFkGM7"],
  ["player-b", "5Yj8tfWFSucMUyYZVdCRNFSw1QF3C1MbG7dbo8vFkkar"],
  ["old-staging-authority", "4uBUqMExgkzqW2WWKyrq1uSoAQAi3YenKnSsXTrB6T3N"],
  ["public-match-authority", "AixXFtny6qq792Pzt8G7ytLbM1eKRXZGSAx91EqBRo7s"],
];
const funded = [];
for (const [label, pubkey] of known) funded.push(await balance(label, new PublicKey(pubkey)));
console.log(JSON.stringify({ genesis: "devnet", before, airdrop, after, funded }, null, 2));
