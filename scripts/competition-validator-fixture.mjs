import { mkdirSync, writeFileSync } from "node:fs";
import { Keypair } from "@solana/web3.js";
import { MintLayout, TOKEN_PROGRAM_ID } from "@solana/spl-token";

// Public disposable local-validator fixture. Contains no deployment or user key.
const authority = Keypair.fromSeed(Uint8Array.from({ length: 32 }, () => 72)).publicKey;
const data = Buffer.alloc(MintLayout.span);
MintLayout.encode({ mintAuthorityOption: 1, mintAuthority: authority, supply: 0n, decimals: 6, isInitialized: true,
  freezeAuthorityOption: 0, freezeAuthority: authority }, data);
mkdirSync("output/competition-validator", { recursive: true });
writeFileSync("output/competition-validator/mint.json", JSON.stringify({ pubkey: "7VaC5xJULHGQzsZsyUCaZ7BbLGNDENLjXiPbfbbRY84j",
  account: { lamports: 1461600, data: [data.toString("base64"), "base64"], owner: TOKEN_PROGRAM_ID.toBase58(), executable: false, rentEpoch: 0 } }));
const server = Keypair.fromSeed(Uint8Array.from({ length: 32 }, () => 73));
writeFileSync("output/competition-validator/authority.local.json", JSON.stringify(Array.from(server.secretKey)));
for (let index = 0; index < 3; index++) {
  const player = Keypair.fromSeed(Uint8Array.from({ length: 32 }, () => 75 + index));
  writeFileSync(`output/competition-validator/player-${index}.local.json`, JSON.stringify(Array.from(player.secretKey)));
}
console.log(`Local validator program: ${Keypair.fromSeed(Uint8Array.from({ length: 32 }, () => 71)).publicKey.toBase58()}`);
