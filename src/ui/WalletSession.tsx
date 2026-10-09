import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { connectPlayWallet, connectedAddress, connectedWalletName, disconnectPlayWallet, listPlayWallets, onPlayAccount, onPlayWallets, reconnectPlayWallet, type PlayWallet } from "../solana/browserWallet";
import { shortAddress } from "./copy";
import { DialogFrame } from "./dialogFocus";
import { hasMobileWalletAdapter, orderWalletChoices, walletInstallSuggestions } from "./walletInstallSuggestions";

type Session = { address: string | null; requestWallet: () => Promise<string | null>; manageWallet: () => void };
const WalletContext = createContext<Session | null>(null);
export function useWalletSession() {
  const value = useContext(WalletContext);
  if (!value) throw new Error("Wallet provider is missing.");
  return value;
}
export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(connectedAddress);
  const [open, setOpen] = useState(false);
  const [choices, setChoices] = useState<PlayWallet[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const waiting = useRef<Array<(address: string | null) => void>>([]);
  useEffect(() => {
    const off = onPlayAccount(setAddress);
    void reconnectPlayWallet().catch(() => undefined);
    return off;
  }, []);
  useEffect(() => {
    if (!open) return;
    const refresh = () => setChoices(orderWalletChoices(listPlayWallets().filter(item => item.canSignMessage || item.canSignTransaction)));
    refresh();
    return onPlayWallets(refresh);
  }, [open]);
  function finish(next: string | null) {
    setOpen(false);
    waiting.current.splice(0).forEach(resolve => resolve(next));
  }
  function manageWallet() { setError(null); setOpen(true); }
  function requestWallet() {
    if (connectedAddress()) return Promise.resolve(connectedAddress());
    manageWallet();
    return new Promise<string | null>(resolve => waiting.current.push(resolve));
  }
  async function connect(name: string) {
    setBusy(name);
    setError(null);
    try { finish(await connectPlayWallet(name)); } catch (err) { setError(err instanceof Error ? err.message : "Wallet connection failed."); } finally { setBusy(null); }
  }
  const installHints = walletInstallSuggestions(choices);
  const mwa = hasMobileWalletAdapter(choices);
  return <WalletContext.Provider value={{ address, requestWallet, manageWallet }}>
    {children}
    {open && <DialogFrame id="wallet-title" onClose={() => finish(null)}>
      <h2 id="wallet-title">Connect wallet</h2>
      <p className="choice-note">{mwa
        ? "On this phone, use Mobile Wallet Adapter. It opens Seed Vault or another installed mobile wallet (including Phantom). You approve in the wallet app — not a download page."
        : "Choose your Solana wallet. You approve the connection in your wallet."}</p>
      {address ? <>
        <p>{connectedWalletName()} · {shortAddress(address)}</p>
        <button className="secondary" onClick={() => void disconnectPlayWallet().then(() => finish(null))}>Disconnect</button>
      </> : <>
        {choices.map(wallet => <button className="choice" key={wallet.name} disabled={Boolean(busy)} onClick={() => void connect(wallet.name)}><strong>{wallet.name}</strong><span className="choice-note">{busy === wallet.name ? "Waiting for approval…" : "Detected · connect"}</span></button>)}
        {!choices.length && <p role="status">No compatible wallet detected in this browser.</p>}
        {installHints.map(item => <a className="wallet-install" key={item.name} href={item.url} target="_blank" rel="noopener noreferrer"><strong>{item.name}</strong><span>Get wallet ↗</span></a>)}
      </>}
      {error && <p className="alert" role="alert">{error}</p>}
      <button className="text" onClick={() => finish(null)}>Close</button>
    </DialogFrame>}
  </WalletContext.Provider>;
}
export function WalletButton() {
  const { address, requestWallet, manageWallet } = useWalletSession();
  return <button className="secondary wallet-button" type="button" onClick={() => address ? manageWallet() : void requestWallet()}>{address ? shortAddress(address) : "Connect wallet"}</button>;
}
