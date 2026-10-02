import { Connection, PublicKey, VersionedTransaction } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import { inspectSwapTransaction, MAINNET_USDC, SOL_MINT, SWAP_PROGRAMS } from "./dflow";

const live = process.env.SUDOKU_DFLOW_LIVE === "1" && Boolean(process.env.DFLOW_API_KEY);
const wallet = "JCVsKd4TMg1fvEs7rjf5YgLYbJfNC8Dwb4x1PchFkGM7";

describe.skipIf(!live)("live DFlow order", () => {
  it("authenticates, refuses a bad key, and returns an unsigned mainnet swap", async () => {
    const quote = await order(process.env.DFLOW_API_KEY ?? "", {});
    expect(quote.status).toBe(200);
    expect(quote.body.outAmount).toBeTruthy();
    expect(quote.body.transaction).toBeUndefined();
    const invalid = await order("invalid-key", {});
    expect(invalid.status).toBe(403);
    const same = await order(process.env.DFLOW_API_KEY ?? "", { inputMint: MAINNET_USDC, outputMint: MAINNET_USDC });
    expect(same.status).toBe(400);
    const signed = await order(process.env.DFLOW_API_KEY ?? "", { userPublicKey: wallet });
    expect(signed.status).toBe(200);
    expect(signed.body.executionMode).toBe("sync");
    expect(signed.body.inputMint).toBe(SOL_MINT);
    expect(signed.body.outputMint).toBe(MAINNET_USDC);
    expect(signed.body.slippageBps).toBe(50);
    const raw = String(signed.body.transaction ?? "");
    const versioned = VersionedTransaction.deserialize(Buffer.from(raw, "base64"));
    const tables = versioned.message.addressTableLookups.map((lookup) => lookup.accountKey);
    const connection = new Connection("https://api.mainnet-beta.solana.com", "confirmed");
    const resolved: string[] = [];
    for (const table of tables) {
      const info = await connection.getAccountInfo(table);
      expect(info).toBeTruthy();
      const data = Buffer.from(info?.data ?? []);
      for (let offset = 56; offset + 32 <= data.length; offset += 32) {
        resolved.push(new PublicKey(data.subarray(offset, offset + 32)).toBase58());
      }
    }
    const inspection = inspectSwapTransaction(raw, wallet, SOL_MINT, MAINNET_USDC, resolved);
    expect(inspection.feePayer).toBe(wallet);
    expect(inspection.programs.every((program) => SWAP_PROGRAMS.has(program))).toBe(true);
    expect(inspection.programs).toContain("DF1ow4tspfHX9JwWJsAb9epbkA8hmpSEAtxXy1V27QBH");
    expect(BigInt(String(signed.body.minOutAmount))).toBeGreaterThan(0n);
  });
});

async function order(key: string, extra: Record<string, string>) {
  const url = new URL("https://quote-api.dflow.net/order");
  url.searchParams.set("inputMint", extra.inputMint ?? SOL_MINT);
  url.searchParams.set("outputMint", extra.outputMint ?? MAINNET_USDC);
  url.searchParams.set("amount", "10000000");
  url.searchParams.set("slippageBps", "50");
  if (extra.userPublicKey) url.searchParams.set("userPublicKey", extra.userPublicKey);
  const headers: Record<string, string> = { Accept: "application/json" };
  if (key) headers["x-api-key"] = key;
  const response = await fetch(url, { headers });
  const body = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!extra.userPublicKey) delete body.transaction;
  return { status: response.status, body };
}
