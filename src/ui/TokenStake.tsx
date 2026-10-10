import { useEffect, useState } from "react";
import { SOL_MINT, USDC_MINT } from "../competition/market";
import { usdLabel, type MarketToken } from "../competition/types";
import { DialogFrame } from "./dialogFocus";
import { multiplyDecimal, divideDecimal } from "../competition/decimal";

export function TokenStake({ onChange, supportedMint }: { onChange: (token: MarketToken | null, amount: string) => void; supportedMint?: string }) {
  const [token, setToken] = useState<MarketToken | null>(null);
  const [mint, setMint] = useState(supportedMint ?? SOL_MINT);
  const isTest = Boolean(supportedMint && mint === supportedMint);
  // Product label only: keep the configured mint and TEST symbol unchanged.
  const displaySymbol = isTest ? "Soldoku" : token?.symbol ?? "tokens";
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
    if (valid && kind === "tokens") amountText = input;
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
    if (mint === supportedMint) {
      setToken({ mint, symbol: "TEST", name: "Soldoku Token (Devnet)", priceUsd: 0, updatedAt: 0 });
      setError(null); setLoading(false); return;
    }
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
  }, [mint, supportedMint]);
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [open]);
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
    <button className="secondary token-picker" onClick={() => setOpen(true)}><span>Choose token</span><strong>{isTest ? "Soldoku Token" : token?.symbol ?? "Choose token"} ▾</strong></button>
    {token && <div className="quote-line"><strong>{token.name} · {displaySymbol}</strong><span>{price > 0 ? `${usdLabel(price)} per token` : isTest ? "No cash value" : "Price unavailable"}</span></div>}
    <div className="tools stake-presets" role="group" aria-label="Entry amount">{[1, 2, 5].map(value => <button key={value} aria-pressed={kind === "tokens" && Number(input) === value} className={kind === "tokens" && Number(input) === value ? "on" : ""} onClick={() => { setKind("tokens"); setInput(String(value)); }}><strong>{value} {displaySymbol}</strong><span>{price > 0 ? `≈ ${usdLabel(value * price)}` : isTest ? "No cash value" : "USD unavailable"}</span></button>)}</div>
    <p className="choice-note">Choose a preset or enter your own amount, such as 3 or 10.</p>
    <div className="amount-fields">
      <label>Custom token amount<input type="number" inputMode="decimal" step="any" min="0" aria-label="Token amount" value={kind === "tokens" ? input : amount > 0 ? amountText : ""} onChange={event => { setKind("tokens"); setInput(event.target.value); }} /></label>
      <label>USD value<input type="number" inputMode="decimal" step="any" min="0" aria-label="USD value" disabled={price <= 0} value={kind === "usd" ? input : usd > 0 ? usdText : ""} onChange={event => { setKind("usd"); setInput(event.target.value); }} /></label>
    </div>
    <p className="quote-total" aria-live="polite">{price > 0 && amountText ? `${amountText} ${displaySymbol} ≈ ${usdLabel(usd)}` : amountText && token ? `${amountText} ${displaySymbol}` : "Enter a positive amount."}</p>
    {!isTest && <p className="choice-note">{loading ? "Updating price…" : "Approximate market value; prices may change."}</p>}
    {error && <p className="alert" role="alert">{error}</p>}
    {open && <DialogFrame id="token-title" onClose={() => setOpen(false)}>
      <div className="token-dialog-nav"><button className="secondary" onClick={() => setOpen(false)}>← Back</button><h2 id="token-title">Choose token</h2></div>
      {supportedMint && <><button className="secondary" onClick={() => { setMint(supportedMint); setToken({ mint: supportedMint, symbol: "TEST", name: "Soldoku Token (Devnet)", priceUsd: 0, updatedAt: 0 }); setKind("tokens"); setOpen(false); }}>Soldoku Token (Devnet) · available</button><details className="token-address"><summary>Show token address</summary><small>{supportedMint}</small></details></>}
      <label htmlFor="token-search">Search by name, symbol, or mint address</label>
      <input id="token-search" className="form-input" value={search} onChange={event => setSearch(event.target.value)} placeholder="Token name, symbol, or mint" />
      <div className="tools">{[["SOL", SOL_MINT], ["USDC", USDC_MINT]].map(([symbol, address]) => <button key={symbol} onClick={() => { if (mint !== address) { setMint(address); setToken(null); } setOpen(false); }}>{symbol}</button>)}</div>
      <p className="choice-note">Solana tokens only. Check the mint address before selecting. {registryEnabled ? "Registry verification enabled." : "Market listings are not issuer verification."}</p>
      {searching && <p role="status">Searching tokens…</p>}
      {searchError && <p role="alert" className="alert">{searchError}</p>}
      {!searching && !searchError && !results.length && <p>No unambiguous Solana token found. Search by mint address. Native BTC, ETH and ADA use other networks.</p>}
      {results.map(item => <div className="token-result" key={item.mint}><button className="choice" onClick={() => select(item)}><strong>{item.symbol} · {item.name}</strong><span>{item.verified ? "Verified identity" : "Market listing · check mint"} · {usdLabel(item.priceUsd)} per token</span></button><details className="token-address"><summary>Show token address</summary><small>{item.mint}</small></details></div>)}
    </DialogFrame>}
  </section>;
}
