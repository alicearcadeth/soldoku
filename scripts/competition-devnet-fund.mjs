import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Connection, Keypair } from "@solana/web3.js";
import { createMint, getAccount, getMint, getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";

const connection = new Connection("https://api.devnet.solana.com", { commitment: "finalized",
  fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(15000) }) });
if (await connection.getGenesisHash() !== "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG") throw new Error("Refusing non-Devnet funding.");
const key = name => Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(join(homedir(), ".config", "solana", name), "utf8"))));
const mintKey = key("soldoku-competition-test-mint.json"); const payer = key("sudoku-dev.json");
if (mintKey.publicKey.toBase58() !== "BtdrgokAvXQE4yj3zS48c4ktnMSy3TGoRkHCWD5fV8U4") throw new Error("Competition mint identity mismatch.");
connection.confirmTransaction = async strategy => {
  const signature = typeof strategy === "string" ? strategy : strategy.signature;
  for (let count = 0; count < 150; count++) {
    const status = await connection.getSignatureStatuses([signature], { searchTransactionHistory: true }); const value = status.value[0];
    if (value && (value.err || value.confirmationStatus === "finalized")) return { context: status.context, value: { err: value.err } };
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error(`Devnet transaction pending; inspect ${signature} before retrying.`);
};
if (!await connection.getAccountInfo(mintKey.publicKey)) {
  await createMint(connection, payer, mintKey.publicKey, null, 6, mintKey, { commitment: "finalized" });
}
const mint = await getMint(connection, mintKey.publicKey);
if (mint.decimals !== 6 || mint.freezeAuthority || !mint.mintAuthority?.equals(mintKey.publicKey)) throw new Error("Unexpected test mint configuration.");
for (const filename of ["sudoku-dev.json", "sudoku-player-b.json", "sudoku-phantom-disposable.json"]) {
  const player = key(filename);
  if (await connection.getBalance(player.publicKey) < 15000000) throw new Error(`Insufficient Devnet SOL for fees in ${filename}`);
  const ata = await getOrCreateAssociatedTokenAccount(connection, payer, mintKey.publicKey, player.publicKey, false, "finalized");
  const balance = (await getAccount(connection, ata.address)).amount;
  let signature = null;
  if (balance < 20000000n) signature = await mintTo(connection, payer, mintKey.publicKey, ata.address, mintKey, 20000000n - balance, [], { commitment: "finalized" });
  console.log(JSON.stringify({ wallet: player.publicKey.toBase58(), mint: mintKey.publicKey.toBase58(), testUnits: (await getAccount(connection, ata.address)).amount.toString(), signature,
    ...(signature ? { explorer: `https://explorer.solana.com/tx/${signature}?cluster=devnet` } : {}) }));
}
