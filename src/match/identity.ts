import nacl from "tweetnacl";
import bs58 from "bs58";

const WINDOW_MS = 120_000;

export function historyMessage(wallet: string, code: string, at: number): Uint8Array {
  return new TextEncoder().encode(`sudoku-history:${wallet}:${code}:${Math.floor(at / 1000)}`);
}

export function historyListMessage(wallet: string, at: number): Uint8Array {
  return new TextEncoder().encode(`sudoku-history:${wallet}:${Math.floor(at / 1000)}`);
}

export function verifyHistory(wallet: string, code: string, signature: string, at: number, now = Date.now()): void {
  if (Math.abs(now - at) > WINDOW_MS) throw new Error("History proof expired. Sign it again.");
  let sig: Uint8Array;
  let key: Uint8Array;
  try {
    sig = bs58.decode(signature);
    key = bs58.decode(wallet);
  } catch {
    throw new Error("Wallet proof was rejected");
  }
  if (!nacl.sign.detached.verify(historyMessage(wallet, code, at), sig, key)) throw new Error("Wallet proof was rejected");
}

/** A new session can list its own rows. The signature covers the wallet, so another address is not accepted. */
export function verifyHistoryList(wallet: string, signature: string, at: number, now = Date.now()): void {
  if (Math.abs(now - at) > WINDOW_MS) throw new Error("History proof expired. Sign it again.");
  let sig: Uint8Array;
  let key: Uint8Array;
  try {
    sig = bs58.decode(signature);
    key = bs58.decode(wallet);
  } catch {
    throw new Error("Wallet proof was rejected");
  }
  if (!nacl.sign.detached.verify(historyListMessage(wallet, at), sig, key)) throw new Error("Wallet proof was rejected");
}

export function nameMessage(wallet: string, name: string, at: number): Uint8Array {
  return new TextEncoder().encode(`sudoku-name:${wallet}:${name}:${Math.floor(at / 1000)}`);
}

export function classicMessage(wallet: string, completed: number, at: number): Uint8Array {
  return new TextEncoder().encode(`sudoku-classic:${wallet}:${completed}:${Math.floor(at / 1000)}`);
}

/** Each signed finish may raise that wallet's own total by one. An address alone cannot import guest games. */
export function verifyClassic(wallet: string, completed: number, signature: string, at: number, previous: number, now = Date.now()): void {
  if (!Number.isInteger(completed) || completed !== previous + 1) throw new Error("Classic totals move one finished game at a time");
  if (Math.abs(now - at) > WINDOW_MS) throw new Error("History proof expired. Sign it again.");
  let sig: Uint8Array;
  let key: Uint8Array;
  try {
    sig = bs58.decode(signature);
    key = bs58.decode(wallet);
  } catch {
    throw new Error("Wallet proof was rejected");
  }
  if (!nacl.sign.detached.verify(classicMessage(wallet, completed, at), sig, key)) throw new Error("Wallet proof was rejected");
}

export function cleanName(name: string): string {
  const trimmed = name.trim().replace(/\s+/g, " ");
  if (trimmed.length < 2 || trimmed.length > 16) throw new Error("Use 2 to 16 characters");
  if (!/^[\p{L}\p{N} ]+$/u.test(trimmed)) throw new Error("Use letters, numbers, and spaces");
  return trimmed;
}

/** Accepts a signature over the exact name. A wallet address alone is not enough. */
export function verifyName(wallet: string, name: string, signature: string, at: number, now = Date.now()): string {
  const clean = cleanName(name);
  if (Math.abs(now - at) > WINDOW_MS) throw new Error("Name proof expired. Sign it again.");
  let sig: Uint8Array;
  let key: Uint8Array;
  try {
    sig = bs58.decode(signature);
    key = bs58.decode(wallet);
  } catch {
    throw new Error("Wallet proof was rejected");
  }
  if (!nacl.sign.detached.verify(nameMessage(wallet, clean, at), sig, key)) {
    throw new Error("Wallet proof was rejected");
  }
  return clean;
}
