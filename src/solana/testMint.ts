import { existsSync, readFileSync } from "node:fs";
import { createMint } from "@solana/spl-token";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";

/** Local-only key used when the gitignored fixture is absent. It is not a Devnet or Mainnet authority. */
const localFallback = Uint8Array.from({ length: 32 }, (_, index) => index + 1);

/** Localnet and Devnet staging mint. It cannot mint Mainnet USDC. */
export function testSettlementMint(): Keypair {
  // Workers have no local fixture URL. Resolve it only in a file-backed runtime.
  const fixture = import.meta.url?.startsWith("file:")
    ? new URL("../../programs/match-escrow/fixtures/test-settlement-mint.json", import.meta.url)
    : undefined;
  if (fixture && existsSync(fixture)) {
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(fixture, "utf8")) as number[]));
  }
  if (process.env.SUDOKU_STAGING === "1") {
    throw new Error("The staging test mint file is missing. Keep it outside Git.");
  }
  return Keypair.fromSeed(localFallback);
}

export async function ensureTestMint(connection: Connection, payer: Keypair): Promise<PublicKey> {
  const mint = testSettlementMint();
  const existing = await connection.getAccountInfo(mint.publicKey);
  if (existing) return mint.publicKey;
  return createMint(connection, payer, mint.publicKey, null, 6, mint);
}
