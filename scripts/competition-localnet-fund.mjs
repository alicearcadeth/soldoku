import { readFileSync } from "node:fs";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";

const connection = new Connection("http://127.0.0.1:18999", "confirmed");
if (["EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG", "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d", "4uhcVJyU9pJkvQyS88uRDiswHXSCkY3zQawwpjk2NsNY"].includes(await connection.getGenesisHash())) throw new Error("Local fixture funding cannot run on a public cluster.");
connection.confirmTransaction = async strategy => {
  const signature = typeof strategy === "string" ? strategy : strategy.signature;
  for (let count = 0; count < 300; count++) {
    const status = await connection.getSignatureStatuses([signature]);
    const value = status.value[0];
    if (value && (value.err || ["confirmed", "finalized"].includes(value.confirmationStatus))) return { context: status.context, value: { err: value.err } };
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Confirmation pending: ${signature}`);
};
const mintAuthority = Keypair.fromSeed(Uint8Array.from({ length: 32 }, () => 72));
const mint = new PublicKey("7VaC5xJULHGQzsZsyUCaZ7BbLGNDENLjXiPbfbbRY84j");
const key = name => Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(`output/competition-validator/${name}.local.json`, "utf8"))));
const server = key("authority"); const players = [0, 1, 2].map(index => key(`player-${index}`));
for (const wallet of [mintAuthority, server, ...players]) {
  const signature = await connection.requestAirdrop(wallet.publicKey, 2_000_000_000);
  await connection.confirmTransaction(signature);
}
for (const player of players) {
  const ata = await getOrCreateAssociatedTokenAccount(connection, mintAuthority, mint, player.publicKey);
  await mintTo(connection, mintAuthority, mint, ata.address, mintAuthority, 20_000_000n);
  console.log(`Funded local test player ${player.publicKey.toBase58()}: 20 TEST`);
}
console.log("Local server and three test players funded. These are disposable local-validator keys.");
