import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { Keypair } from "@solana/web3.js";

const require = createRequire(import.meta.url);
const bs58 = require("bs58");
const expected = "5Yj8tfWFSucMUyYZVdCRNFSw1QF3C1MbG7dbo8vFkkar";
const source = process.env.SUDOKU_IMPORT_PLAYER_B_FILE;
if (!source) {
  console.error("Set SUDOKU_IMPORT_PLAYER_B_FILE to a wallet export outside the repository.");
  process.exit(1);
}
const out = join(homedir(), ".config", "solana", "sudoku-player-b.json");

function fromBytes(bytes) {
  if (bytes.length === 64) return Keypair.fromSecretKey(bytes);
  if (bytes.length === 32) return Keypair.fromSeed(bytes);
  return null;
}

function decode(raw) {
  const text = raw.replace(/^\uFEFF/, "");
  const compact = text.replace(/\s+/g, "");
  const chunks = text.split(/\s+/).filter((part) => part.length >= 32);
  for (const candidate of chunks) {
    for (const bytes of [tryDecode(candidate, "base58"), tryDecode(candidate, "base64"), tryDecode(candidate, "hex")]) {
      const key = bytes ? fromBytes(bytes) : null;
      if (key?.publicKey.toBase58() === expected) return key;
    }
  }
  for (const len of [87, 88, 89]) {
    for (let i = 0; i + len <= compact.length; i++) {
      const bytes = tryDecode(compact.slice(i, i + len), "base58");
      const key = bytes ? fromBytes(bytes) : null;
      if (key?.publicKey.toBase58() === expected) return key;
    }
  }
  throw new Error("Unrecognized wallet export");
}

function tryDecode(value, encoding) {
  try {
    if (encoding === "base58") return bs58.decode(value);
    if (encoding === "hex" && /^[0-9a-fA-F]+$/.test(value) && value.length % 2 === 0) return Uint8Array.from(Buffer.from(value, "hex"));
    if (encoding === "base64") return Uint8Array.from(Buffer.from(value, "base64"));
  } catch { /* try the next candidate */ }
  return null;
}

const key = decode(readFileSync(source, "utf8"));
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(Array.from(key.secretKey)));
console.log(JSON.stringify({ address: key.publicKey.toBase58(), saved: true, distinctFromA: key.publicKey.toBase58() !== "JCVsKd4TMg1fvEs7rjf5YgLYbJfNC8Dwb4x1PchFkGM7" }));
