import { loadOperatorEnv, wslLaunchArgs } from "./operator-env.mjs";
/**
 * Read-only preflight before the public V2 cutover.
 * Prints public keys, balances, and the deployed program hash only.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { parseEnv } from "node:util";
import { getAssociatedTokenAddressSync, getAccount } from "@solana/spl-token";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";

const V2 = new PublicKey("937BAWXVCW58oEKkA1FijkSXXtdgGEytUyPRV2Roge22");
const MINT = new PublicKey("J7STDEHGniYdSjuY4HKZMoSdr1KckYiGNdfnmsrYiLw7");
const env = loadOperatorEnv();
const rpc = env.ARTPORTAL_SOLANA_RPC_URL?.trim();
if (!rpc?.startsWith("https://")) throw new Error("Devnet RPC URL is missing");
const connection = new Connection(rpc, "confirmed");
const key = (name) => Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(join(homedir(), ".config", "solana", name), "utf8"))));
const authority = key("sudoku-authority.json");
const playerA = key("sudoku-dev.json");
const playerB = key("sudoku-player-b.json");
const program = await connection.getAccountInfo(V2);
const programData = new PublicKey(program.data.subarray(4, 36));
const data = await connection.getAccountInfo(programData);
const upgradeAuthority = data.data[12] === 1 ? new PublicKey(data.data.subarray(13, 45)).toBase58() : null;
const solana = process.env.SOLANA_BIN || "$HOME/.local/share/solana/install/active_release/bin/solana";
const dumped = spawnSync("wsl", wslLaunchArgs(`${solana} program dump 937BAWXVCW58oEKkA1FijkSXXtdgGEytUyPRV2Roge22 /tmp/sudoku-v2-now.so --url "$SOLANA_RPC" && sha256sum /tmp/sudoku-v2-now.so`), {
  env: { ...process.env, SOLANA_RPC: rpc, WSLENV: "SOLANA_RPC" },
  encoding: "utf8",
});
const local = createHash("sha256").update(readFileSync("programs/match-escrow/target/deploy/match_escrow.so")).digest("hex");
const remote = (dumped.stdout || "").split(/\s+/)[0];
async function tokens(owner) {
  const ata = getAssociatedTokenAddressSync(MINT, owner);
  const account = await getAccount(connection, ata).catch(() => null);
  return { ata: ata.toBase58(), amount: account ? account.amount.toString() : "0", sol: await connection.getBalance(owner) };
}
console.log(JSON.stringify({
  authority: authority.publicKey.toBase58(),
  authoritySol: await connection.getBalance(authority.publicKey),
  upgradeAuthority,
  programDataBytes: data.data.length,
  localSha256: local,
  remoteSha256: remote,
  bytecodeMatches: local === remote,
  playerA: { pubkey: playerA.publicKey.toBase58(), ...(await tokens(playerA.publicKey)) },
  playerB: { pubkey: playerB.publicKey.toBase58(), ...(await tokens(playerB.publicKey)) },
}, null, 2));
