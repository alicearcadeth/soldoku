import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Keypair } from "@solana/web3.js";

const dir = join(homedir(), ".config", "solana");
mkdirSync(dir, { recursive: true });

function ensure(name) {
  const path = join(dir, name);
  const key = existsSync(path)
    ? Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(path, "utf8"))))
    : Keypair.generate();
  if (!existsSync(path)) writeFileSync(path, JSON.stringify(Array.from(key.secretKey)));
  return key.publicKey.toBase58();
}

const names = [
  "sudoku-phantom-disposable.json",
  "sudoku-mainnet-match.json",
  "sudoku-mainnet-upgrade.json",
  "sudoku-mainnet-program.json",
];
for (const name of names) console.log(`${name} ${ensure(name)}`);
