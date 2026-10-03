import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Keypair } from "@solana/web3.js";

// Private keys stay outside the checkout. Reruns preserve every existing identity.
const directory = join(homedir(), ".config", "solana"); mkdirSync(directory, { recursive: true });
const identities = {};
for (const [role, filename] of [["mint", "soldoku-competition-test-mint.json"], ["program", "soldoku-competition-program.json"]]) {
  const path = join(directory, filename);
  if (!existsSync(path)) writeFileSync(path, JSON.stringify(Array.from(Keypair.generate().secretKey)), { flag: "wx", mode: 0o600 });
  const identity = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(path, "utf8"))));
  identities[role] = { address: identity.publicKey.toBase58(), bytes: Array.from(identity.publicKey.toBytes()) };
}
console.log(JSON.stringify(identities, null, 2));
