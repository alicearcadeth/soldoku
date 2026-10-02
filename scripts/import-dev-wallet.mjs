import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { Keypair } from "@solana/web3.js";

const require = createRequire(import.meta.url);
const bs58 = require("bs58");
const EXPECTED = "JCVsKd4TMg1fvEs7rjf5YgLYbJfNC8Dwb4x1PchFkGM7";
const source = process.env.SUDOKU_IMPORT_WALLET_FILE;
if (!source) {
  console.error("Set SUDOKU_IMPORT_WALLET_FILE to a wallet export outside the repository.");
  process.exit(1);
}
const dest = join(homedir(), ".config", "solana", "sudoku-dev.json");

function fromBytes(bytes) {
  if (bytes.length === 64) return Keypair.fromSecretKey(bytes);
  if (bytes.length === 32) return Keypair.fromSeed(bytes);
  return null;
}

function matches(keypair) {
  return keypair?.publicKey.toBase58() === EXPECTED ? keypair : null;
}

function decode(raw) {
  const text = raw.replace(/^\uFEFF/, "");
  const compact = text.replace(/\s+/g, "");
  const chunks = text.split(/\s+/).filter((part) => part.length >= 32);
  for (const candidate of chunks) {
    try {
      const parsed = matches(fromBytes(bs58.decode(candidate)));
      if (parsed) return parsed;
    } catch { /* keep scanning */ }
    try {
      const parsed = matches(fromBytes(Uint8Array.from(Buffer.from(candidate, "base64"))));
      if (parsed) return parsed;
    } catch { /* keep scanning */ }
    if (/^[0-9a-fA-F]+$/.test(candidate) && candidate.length % 2 === 0) {
      const parsed = matches(fromBytes(Uint8Array.from(Buffer.from(candidate, "hex"))));
      if (parsed) return parsed;
    }
  }
  for (const len of [87, 88, 89]) {
    for (let i = 0; i + len <= compact.length; i++) {
      try {
        const parsed = matches(fromBytes(bs58.decode(compact.slice(i, i + len))));
        if (parsed) return parsed;
      } catch { /* keep scanning */ }
    }
  }
  throw new Error("Unrecognized wallet export");
}

let raw = "";
try {
  raw = readFileSync(source, "utf8");
} catch {
  console.log("MISMATCH missing");
  process.exit(1);
}
if (raw.trim().length < 32) {
  console.log("MISMATCH short");
  process.exit(1);
}
let keypair;
try {
  keypair = decode(raw);
} catch (error) {
  const trimmed = raw.trim();
  const kind = trimmed.startsWith("[") ? "json" : trimmed.startsWith("{") ? "object" : "text";
  const lineLens = trimmed.split(/\r?\n/).map((line) => line.trim().length);
  console.log("MISMATCH unreadable", kind, trimmed.length, "lines", lineLens.join(","));
  process.exit(1);
}
const derived = keypair.publicKey.toBase58();
if (derived !== EXPECTED) {
  console.log("MISMATCH", derived);
  process.exit(2);
}
mkdirSync(dirname(dest), { recursive: true });
writeFileSync(dest, JSON.stringify(Array.from(keypair.secretKey)));
console.log("MATCH", derived);
console.log("STORED");
