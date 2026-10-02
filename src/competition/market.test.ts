import { afterEach, describe, expect, it, vi } from "vitest";
import { marketTokens, SOL_MINT, POLIS_MINT } from "./market";

afterEach(() => vi.unstubAllGlobals());
describe("Solana market prices", () => {
  it("does not let a partial POLIS name match suppress the Star Atlas ATLAS token", async () => {
    const mint = "ATLASXmbPQxBUYbxPsV97usA3fPQYEqzQBUHgiFCUsXx";
    vi.stubGlobal("fetch", vi.fn(async () => Response.json([{ chainId: "solana", baseToken: { address: mint, name: "Star Atlas", symbol: "ATLAS" }, priceUsd: "0.00123", liquidity: { usd: 150000 } }])));
    expect((await marketTokens("Star Atlas")).some(token => token.mint === mint)).toBe(true);
  });
  it("restores issuer-verified POLIS without a registry key and excludes ticker impersonators", async () => {
    const fetcher = vi.fn(async (_url: string) => Response.json([
      { chainId: "solana", baseToken: { address: POLIS_MINT, name: "Pool metadata", symbol: "POLIS" }, priceUsd: "0.01453000123", liquidity: { usd: 110000 } },
      { chainId: "solana", baseToken: { address: POLIS_MINT, name: "Pool metadata", symbol: "POLIS" }, priceUsd: "0.01454", liquidity: { usd: 15000 } },
      { chainId: "solana", baseToken: { address: "FwtKA62k47DYe3jHmPNjspjVdc7PhipbqZjxTMfp81m6", name: "Star Atlas DAO", symbol: "POLIS" }, priceUsd: "999", liquidity: { usd: 1000000 } },
    ]));
    vi.stubGlobal("fetch", fetcher);
    for (const query of ["polis", "POLIS", "Star Atlas DAO", POLIS_MINT]) {
      expect(await marketTokens(query)).toMatchObject([{ mint: POLIS_MINT, name: "Star Atlas DAO", symbol: "POLIS", priceUsdExact: "0.01453000123" }]);
    }
    expect(await marketTokens("", POLIS_MINT)).toHaveLength(1);
    expect(fetcher.mock.calls.every(([url]) => String(url).endsWith(POLIS_MINT))).toBe(true);
  });
  it("requires registry verification for broader discovery and still quotes only the exact mint", async () => {
    const mint = "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN";
    vi.stubGlobal("fetch", vi.fn(async (url: string) => url.includes("api.jup.ag") ? Response.json([
      { id: mint, symbol: "JUP", name: "Jupiter", isVerified: true },
      { id: "FwtKA62k47DYe3jHmPNjspjVdc7PhipbqZjxTMfp81m6", symbol: "JUP", name: "Impersonator", isVerified: false },
    ]) : Response.json([{ chainId: "solana", baseToken: { address: mint, name: "Untrusted pool name", symbol: "FAKE" }, priceUsd: "0.01284", liquidity: { usd: 100000 } }])));
    expect(await marketTokens("JUP", undefined, "test-registry-key")).toMatchObject([{ mint, symbol: "JUP", name: "Jupiter", priceUsdExact: "0.01284" }]);
  });
  it("uses the most liquid Solana pool and excludes unsupported or invalid prices", async () => {
    const pair = { chainId: "solana", baseToken: { address: SOL_MINT, name: "Wrapped SOL", symbol: "SOL" }, priceUsd: "120", liquidity: { usd: 100000 } };
    const fetcher = vi.fn(async () => Response.json({ pairs: [
      { ...pair, chainId: "ethereum", priceUsd: "999" },
      { ...pair, priceUsd: "100", liquidity: { usd: 2000 } }, pair,
      { ...pair, baseToken: { address: "BadPrice", name: "Invalid", symbol: "BAD" }, priceUsd: "NaN" },
      { ...pair, baseToken: { address: "ThinMarket", name: "Thin", symbol: "THIN" }, liquidity: { usd: 50 } },
    ] }));
    vi.stubGlobal("fetch", fetcher);
    const tokens = await marketTokens("SOL");
    expect(tokens).toHaveLength(1);
    expect(tokens[0]).toMatchObject({ symbol: "SOL", priceUsd: 120, name: "Solana" });
    expect(tokens[0].updatedAt).toBeGreaterThan(0);
    await marketTokens("SOL");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("rejects provider failures and invalid mint URLs instead of inventing prices", async () => {
    const fetcher = vi.fn(async () => new Response("unavailable", { status: 503 }));
    vi.stubGlobal("fetch", fetcher);
    await expect(marketTokens("USDC")).rejects.toThrow(/temporarily unavailable/);
    await expect(marketTokens("", "https://untrusted.invalid")).rejects.toThrow(/Invalid/);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("excludes spoofed SOL tickers even during direct mint lookup", async () => {
    const fetcher = vi.fn(async () => Response.json([
      { chainId: "solana", baseToken: { address: SOL_MINT, name: "Fake pool name", symbol: "WRONG" }, priceUsd: "198.420000123", liquidity: { usd: 100000 } },
      { chainId: "solana", baseToken: { address: "FwtKA62k47DYe3jHmPNjspjVdc7PhipbqZjxTMfp81m6", name: "Solana", symbol: "SOL" }, priceUsd: "10", liquidity: { usd: 1000000 } },
    ]));
    vi.stubGlobal("fetch", fetcher);
    const tokens = await marketTokens("", SOL_MINT);
    expect(tokens).toHaveLength(1);
    expect(tokens[0]).toMatchObject({ mint: SOL_MINT, name: "Solana", symbol: "SOL", priceUsdExact: "198.420000123" });
    expect(await marketTokens("", "FwtKA62k47DYe3jHmPNjspjVdc7PhipbqZjxTMfp81m6")).toEqual([]);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("searches arbitrary tokens on Solana without a registry key, deduplicates pools, and refreshes the selected mint", async () => {
    const mint = "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN";
    const pair = { chainId: "solana", baseToken: { address: mint, name: "Bitcoin token fixture", symbol: "BTC" }, priceUsd: "120.123456789", liquidity: { usd: 100000 } };
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ pairs: [
      { ...pair, chainId: "ethereum", priceUsd: "999" },
      pair, { ...pair, liquidity: { usd: 15000 }, priceUsd: "120.1" },
      { ...pair, baseToken: { address: "FwtKA62k47DYe3jHmPNjspjVdc7PhipbqZjxTMfp81m6", name: "Thin", symbol: "BTC" }, liquidity: { usd: 50 } },
    ] })));
    expect(await marketTokens("btc-fixture")).toMatchObject([{ mint, symbol: "BTC", verified: false, priceUsdExact: "120.123456789" }]);
    expect(await marketTokens("", mint)).toHaveLength(1);
  });
});
