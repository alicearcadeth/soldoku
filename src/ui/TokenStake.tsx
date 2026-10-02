import { useEffect, useState } from "react";
import { SOL_MINT, USDC_MINT, POLIS_MINT } from "../competition/market";
import { usdLabel, type MarketToken } from "../competition/types";
import { DialogFrame } from "./dialogFocus";
import { multiplyDecimal, divideDecimal } from "../competition/decimal";

export function TokenStake({ onChange }: { onChange: (token: MarketToken | null, amount: string) => void }) {
  const [token, setToken] = useState<MarketToken | null>(null);
  const [mint, setMint] = useState(SOL_MINT);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<MarketToken[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [registryEnabled, setRegistryEnabled] = useState(false);
  const [kind, setKind] = useState<"tokens" | "usd">("tokens");
  const [input, setInput] = useState("1");
  const price = token?.priceUsd ?? 0;
  const precisePrice = token?.priceUsdExact ?? String(price);
  const entered = Number(input);
  const valid = input.trim() !== "" && Number.isFinite(entered) && entered > 0 && Number.isFinite(entered * price) && (price <= 0 || Number.isFinite(entered / price));
  let amountText = "", usdText = "";
  try {
    if (valid && price > 0) {
      amountText = kind === "tokens" ? input : divideDecimal(input, precisePrice);
      usdText = kind === "usd" ? input : multiplyDecimal(input, precisePrice);
    }
  } catch { /* Invalid or excessive decimal input has no quote. */ }
  const amount = Number(amountText);
  const usd = Number(usdText);
  useEffect(() => onChange(token, amountText), [token, amountText, onChange]);
  useEffect(() => {
    let stop = false;
    const controller = new AbortController();
    async function refresh() {
      setLoading(true);
      try {
        const response = await fetch(`/api/tokens?mint=${mint}`, { signal: controller.signal });
        const data = await response.json() as { tokens?: MarketToken[]; error?: string; registryEnabled?: boolean };
        const next = data.tokens?.find(item => item.mint === mint);
        if (!response.ok || !next) throw new Error(data.error ?? "No supported live price for this mint.");
        if (!stop) { setToken(next); setRegistryEnabled(data.registryEnabled === true); setError(null); }
      } catch (err) {
        if (!stop) { setToken(current => current ? { ...current, priceUsd: 0 } : null); setError(err instanceof Error ? err.message : "Price unavailable."); }
      } finally { if (!stop) setLoading(false); }
    }
    void refresh();
    const timer = window.setInterval(() => void refresh(), 30000);
    return () => { stop = true; controller.abort(); clearInterval(timer); };
  }, [mint]);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setSearching(true);
      setSearchError(null);
      const q = search.trim() || "SOL";
      void fetch(`/api/tokens?q=${encodeURIComponent(q)}`, { signal: controller.signal }).then(async response => {
        const data = await response.json() as { tokens?: MarketToken[]; error?: string; registryEnabled?: boolean };
        if (!response.ok) throw new Error(data.error ?? "Token search unavailable.");
        if (!controller.signal.aborted) { setResults(data.tokens ?? []); setRegistryEnabled(data.registryEnabled === true); }
      }).catch(err => { if (!controller.signal.aborted) setSearchError(err.message); }).finally(() => { if (!controller.signal.aborted) setSearching(false); });
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [search, open]);
  function select(next: MarketToken) { setToken(next); setMint(next.mint); setOpen(false); setError(null); }
  return <section className="stack stake-section" aria-label="Token entry">
    <button className="secondary token-picker" onClick={() => setOpen(true)}><span>Pick Your Token on Solana</span><strong>{token?.symbol ?? "Choose token"} ▾</strong></button>
    {token && <div className="quote-line"><strong>{token.name} · {token.symbol}</strong><span>{price > 0 ? `${usdLabel(price)} per token` : "Price unavailable"}</span></div>}
    <div className="tools stake-presets" role="group" aria-label="Entry amount">{[1, 2, 5].map(value => <button key={value} aria-pressed={kind === "tokens" && Number(input) === value} className={kind === "tokens" && Number(input) === value ? "on" : ""} onClick={() => { setKind("tokens"); setInput(String(value)); }}><strong>{value} {token?.symbol ?? "tokens"}</strong><span>{price > 0 ? `≈ ${usdLabel(value * price)}` : "USD unavailable"}</span></button>)}</div>
    <div className="amount-fields">
      <label>Token amount<input type="number" inputMode="decimal" step="any" min="0" aria-label="Token amount" value={kind === "tokens" ? input : amount > 0 ? amountText : ""} onChange={event => { setKind("tokens"); setInput(event.target.value); }} /></label>
      <label>USD value<input type="number" inputMode="decimal" step="any" min="0" aria-label="USD value" value={kind === "usd" ? input : usd > 0 ? usdText : ""} onChange={event => { setKind("usd"); setInput(event.target.value); }} /></label>
    </div>
    <p className="quote-total" aria-live="polite">{price > 0 && amountText ? `${amountText} ${token?.symbol} ≈ ${usdLabel(usd)}` : "Enter a positive amount when a price is available."}</p>
    <p className="choice-note">{loading ? "Updating price…" : token && price > 0 ? `DEX Screener · checked ${new Date(token.updatedAt).toLocaleTimeString()} · refreshes every 30 seconds` : "Waiting for a live market price."} Mainnet market estimates; prices can change. Token entry is not enabled for leaderboard rooms yet.</p>
    {error && <p className="alert" role="alert">{error}</p>}
    {open && <DialogFrame id="token-title" onClose={() => setOpen(false)}>
      <h2 id="token-title">Pick Your Token on Solana</h2>
      <label htmlFor="token-search">Search by name, symbol, or mint address</label>
      <input id="token-search" className="form-input" value={search} onChange={event => setSearch(event.target.value)} placeholder="BTC, BONK, POLIS, or Solana mint" />
      <div className="tools">{[["SOL", SOL_MINT], ["USDC", USDC_MINT], ["POLIS", POLIS_MINT]].map(([symbol, address]) => <button key={symbol} onClick={() => { if (mint !== address) { setMint(address); setToken(null); } setOpen(false); }}>{symbol}</button>)}</div>
      <p className="choice-note">Solana network only. Search any token by name, symbol, or mint. BTC results are tokens on Solana, not native Bitcoin. Different mints may share a name; check the address. {registryEnabled ? "Registry verification is enabled." : "Market listings are not issuer verification."}</p>
      {searching && <p role="status">Searching tokens…</p>}
      {searchError && <p role="alert" className="alert">{searchError}</p>}
      {!searching && !searchError && !results.length && <p>No Solana token with a supported liquid-market quote found. Try its mint address.</p>}
      {results.map(item => <button className="choice token-result" key={item.mint} onClick={() => select(item)}><strong>{item.symbol} · {item.name}</strong><span>{item.verified ? "Verified identity" : "Market listing · check mint"} · {usdLabel(item.priceUsd)} per token</span><small>{item.mint}</small></button>)}
      <button className="text" onClick={() => setOpen(false)}>Back</button>
    </DialogFrame>}
  </section>;
}
