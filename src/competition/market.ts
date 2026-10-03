import type { MarketToken } from "./types";

export const SOL_MINT = "So11111111111111111111111111111111111111112";
export const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
// Official issuer endpoint: https://galaxy.staratlas.com/tokens/polis
export const POLIS_MINT = "poLisWXnNRwC6oBu1vHiuKQzFjGL4XDSu4g9qjz9qVk";
// https://galaxy.staratlas.com/tokens/atlas
export const ATLAS_MINT = "ATLASXmbPQxBUYbxPsV97usA3fPQYEqzQBUHgiFCUsXx";
const canonical = [
  { mint: SOL_MINT, name: "Solana", symbol: "SOL" },
  { mint: USDC_MINT, name: "USD Coin", symbol: "USDC" },
  { mint: POLIS_MINT, name: "Star Atlas DAO", symbol: "POLIS" },
  { mint: ATLAS_MINT, name: "Star Atlas", symbol: "ATLAS" },
];
type Pair = { chainId: string; baseToken: { address: string; name: string; symbol: string }; priceUsd?: string; liquidity?: { usd?: number } };
const cache = new Map<string, { at: number; tokens: MarketToken[] }>();
function tokensFrom(pairs: Pair[], identities: { mint: string; name: string; symbol: string; verified?: boolean }[] = canonical): MarketToken[] {
  const sorted = pairs.filter(pair => pair.chainId === "solana" && (pair.liquidity?.usd ?? 0) >= 10000 && Number(pair.priceUsd) > 0 && Number.isFinite(Number(pair.priceUsd))).sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0));
  const seen = new Set<string>();
  return sorted.flatMap(pair => {
    const identity = identities.find(token => token.mint === pair.baseToken.address);
    if (!identity || seen.has(pair.baseToken.address)) return [];
    seen.add(pair.baseToken.address);
    const peers = sorted.filter(other => other.baseToken.address === identity.mint && (other.liquidity?.usd ?? 0) >= (pair.liquidity?.usd ?? 0) / 10);
    if (peers.some(other => Math.abs(Number(other.priceUsd) / Number(pair.priceUsd) - 1) > 0.1)) return [];
    return [{ ...identity, priceUsd: Number(pair.priceUsd), priceUsdExact: pair.priceUsd!, verified: identity.verified === true || canonical.some(token => token.mint === identity.mint), updatedAt: Date.now() }];
  });
}
export async function marketTokens(query: string, mint?: string, registryKey?: string): Promise<MarketToken[]> {
  if (mint && !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint)) throw new Error("Invalid Solana token mint.");
  const search = query.trim().slice(0, 80);
  const key = `${registryKey ? "registry" : "canonical"}:${mint ?? search}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 15000) return hit.tokens;
  const normalized = search.toLowerCase().replace(/\s+/g, "");
  // Only exact symbols/mints bypass discovery. A partial project name must not hide other tokens.
  let identities: { mint: string; name: string; symbol: string; verified?: boolean }[] = canonical.filter(token => mint ? token.mint === mint : !search || token.symbol.toLowerCase() === normalized || token.name.toLowerCase().replace(/\s+/g, "") === normalized || token.mint === search);
  let discoveryPairs: Pair[] | undefined;
  if (!identities.length && registryKey) {
    const response = await fetch(`https://api.jup.ag/tokens/v2/search?query=${encodeURIComponent(mint ?? search)}`, { headers: { "x-api-key": registryKey }, signal: AbortSignal.timeout(6000) });
    if (!response.ok) throw new Error("Verified token search is temporarily unavailable. Try again.");
    const data = await response.json() as { id: string; name: string; symbol: string; isVerified?: boolean }[];
    const seen = new Set<string>();
    identities = (Array.isArray(data) ? data : []).filter(token => {
      const pinned = canonical.find(item => item.symbol.toUpperCase() === token.symbol?.toUpperCase());
      if (token.isVerified !== true || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(token.id) || typeof token.name !== "string" || typeof token.symbol !== "string" || seen.has(token.id) || (mint && token.id !== mint) || (pinned && token.id !== pinned.mint)) return false;
      seen.add(token.id); return true;
    }).map(token => ({ mint: token.id, name: token.name.slice(0, 80), symbol: token.symbol.slice(0, 20), verified: true }));
    // Symbol search never guesses between several verified mints sharing a ticker.
    identities = identities.filter(token => mint || identities.filter(other => other.symbol.toUpperCase() === token.symbol.toUpperCase()).length === 1).slice(0, 10);
  }
  if (!identities.length && !registryKey) {
    const address = mint ?? (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(search) ? search : undefined);
    const endpoint = address ? `https://api.dexscreener.com/token-pairs/v1/solana/${address}` : `https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(search)}`;
    const response = await fetch(endpoint, { signal: AbortSignal.timeout(6000) });
    if (!response.ok) throw new Error("Solana token search is temporarily unavailable. Try again.");
    const data = await response.json() as Pair[] | { pairs?: Pair[] };
    discoveryPairs = (Array.isArray(data) ? data : data.pairs ?? []).filter(pair => pair.chainId === "solana" && (!address || pair.baseToken?.address === address));
    const seen = new Set<string>();
    identities = discoveryPairs.flatMap(pair => {
      const token = pair.baseToken;
      if (!token || typeof token.name !== "string" || typeof token.symbol !== "string" || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(token.address) || seen.has(token.address)) return [];
      const pinned = canonical.find(item => item.symbol.toUpperCase() === token.symbol.toUpperCase() || item.name.toLowerCase() === token.name.toLowerCase());
      if (pinned && pinned.mint !== token.address) return [];
      seen.add(token.address);
      const official = canonical.find(item => item.mint === token.address);
      return [{ ...(official ?? { mint: token.address, name: token.name.slice(0, 80), symbol: token.symbol.slice(0, 20) }), verified: Boolean(official) }];
    });
  }
  if (!identities.length) return [];
  const endpoint = `https://api.dexscreener.com/tokens/v1/solana/${identities.map(token => token.mint).join(",")}`;
  let data: Pair[] | { pairs?: Pair[] } = discoveryPairs ?? [];
  if (!discoveryPairs) {
    const response = await fetch(endpoint, { signal: AbortSignal.timeout(6000) });
    if (!response.ok) throw new Error("Live token prices are temporarily unavailable. Try again.");
    data = await response.json() as Pair[] | { pairs?: Pair[] };
  }
  const quoted = tokensFrom(Array.isArray(data) ? data : data.pairs ?? [], identities).filter(token => !mint || token.mint === mint);
  // A ticker is not an identity. Never pick an arbitrary winner among unrelated mints.
  // An exact address remains searchable when someone deliberately wants that asset.
  const exactAddress = mint ?? (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(search) ? search : undefined);
  const result = quoted.filter(token => exactAddress || token.verified ||
    quoted.filter(other => other.symbol.trim().toUpperCase() === token.symbol.trim().toUpperCase()).length === 1).slice(0, 10);
  if (cache.size >= 100) cache.delete(cache.keys().next().value!);
  cache.set(key, { at: Date.now(), tokens: result });
  return result;
}
