import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { getMint } from "@solana/spl-token";

// Read-only. Public addresses/balances only; never displays key contents or credential URLs.
const connection = new Connection("https://api.devnet.solana.com", { commitment: "confirmed",
  fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(15000) }) });
const genesis = await connection.getGenesisHash();
if (genesis !== "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG") throw new Error("Refusing a non-Devnet connection.");
const mint = new PublicKey("BtdrgokAvXQE4yj3zS48c4ktnMSy3TGoRkHCWD5fV8U4");
const account = await getMint(connection, mint);
console.log(JSON.stringify({ cluster: "devnet", mint: mint.toBase58(), decimals: account.decimals,
  initialized: account.isInitialized, mintAuthority: account.mintAuthority?.toBase58() ?? null,
  freezeAuthority: account.freezeAuthority?.toBase58() ?? null }));
for (const name of ["sudoku-v2-authority.json", "sudoku-authority.json", "sudoku-staging-upgrade.json", "sudoku-dev.json", "sudoku-player-b.json", "sudoku-phantom-disposable.json"]) {
  let wallet;
  try { wallet = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(join(homedir(), ".config", "solana", name), "utf8")))); }
  catch { console.log(JSON.stringify({ file: name, available: false })); continue; }
  const solLamports = await connection.getBalance(wallet.publicKey);
  const tokens = await connection.getParsedTokenAccountsByOwner(wallet.publicKey, { mint });
  const stakeUnits = tokens.value.reduce((sum, token) => sum + BigInt(token.account.data.parsed.info.tokenAmount.amount), 0n);
  console.log(JSON.stringify({ file: name, wallet: wallet.publicKey.toBase58(), solLamports, stakeUnits: stakeUnits.toString() }));
}
