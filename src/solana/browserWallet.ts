import { getWallets } from "@wallet-standard/app";
import { ensureMwaRegistered } from "./mwa";
import { walletCall } from "./walletCall";

export type PlayWallet = {
  name: string;
  canSignMessage: boolean;
  canSignTransaction: boolean;
  canDisconnect: boolean;
};

type Account = { address?: string; publicKey?: Uint8Array; chains?: readonly string[] };
type ConnectFeature = { connect: (input?: { silent?: boolean }) => Promise<{ accounts: readonly Account[] }> };
type DisconnectFeature = { disconnect: () => Promise<void> };
type SignFeature = {
  signTransaction: (input: { account: Account; transaction: Uint8Array; chain?: string }) => Promise<{ signedTransaction: Uint8Array }[]>;
};
type MessageFeature = {
  signMessage: (input: { account: Account; message: Uint8Array }) => Promise<{ signature: Uint8Array }[]>;
};
type EventsFeature = {
  on: (event: "change", listener: (properties: { accounts: readonly Account[] }) => void) => () => void;
};

type StandardWallet = {
  name: string;
  accounts: readonly Account[];
  features: Record<string, unknown>;
};

let chosenName: string | null = null;
let chosenAccount: Account | null = null;
let appChain = "solana:devnet";
let stopEvents: (() => void) | null = null;
const accountListeners = new Set<(address: string | null) => void>();
function notifyAccount(address: string | null) { accountListeners.forEach(listener => listener(address)); }

export function setPlayChain(cluster: string) {
  appChain = cluster === "localnet" ? "solana:localnet" : cluster === "mainnet-beta" ? "solana:mainnet" : "solana:devnet";
}

/** Wallets that omit chains are not treated as mismatched. Sudoku does not switch the wallet. */
export function walletClusterWarning(chains: readonly string[] | undefined, cluster: string): string | null {
  if (!chains || chains.length === 0) return null;
  const needed = cluster === "localnet" ? "solana:localnet" : cluster === "mainnet-beta" ? "solana:mainnet" : "solana:devnet";
  if (chains.includes(needed)) return null;
  return `This wallet is not on ${cluster}. Switch it there before signing. This app cannot change the wallet network.`;
}

/** A second address is a different player. The same address is the same session. */
export function walletChanged(previous: string | null, next: string | null): boolean {
  return Boolean(previous && next && previous !== next);
}

export function declined(error: unknown): boolean {
  const text = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  return /reject|cancel|denied|declin/i.test(text);
}

export function onPlayAccount(listener: (address: string | null) => void) {
  accountListeners.add(listener);
  return () => { accountListeners.delete(listener); };
}

export function onPlayWallets(listener: () => void) {
  const registry = getWallets();
  const offRegister = registry.on("register", listener);
  const offUnregister = registry.on("unregister", listener);
  return () => { offRegister(); offUnregister(); };
}
export function connectedAddress(): string | null { return chosenAccount?.address ?? null; }

function wallets(): readonly StandardWallet[] {
  ensureMwaRegistered();
  return getWallets().get() as unknown as readonly StandardWallet[];
}

function named(name: string | null): StandardWallet | undefined {
  if (!name) return undefined;
  return wallets().find((wallet) => wallet.name === name);
}

export function listPlayWallets(): PlayWallet[] {
  return wallets()
    .filter((wallet) => wallet.features["standard:connect"])
    .map((wallet) => ({
      name: wallet.name,
      canSignMessage: Boolean(wallet.features["solana:signMessage"]),
      canSignTransaction: Boolean(wallet.features["solana:signTransaction"]),
      canDisconnect: Boolean(wallet.features["standard:disconnect"]),
    }));
}

export function connectedWalletName(): string | null {
  return chosenName;
}

export function connectedChains(): readonly string[] | undefined {
  return chosenAccount?.chains;
}

let addressBeforeConnect: string | null = null;

/** The address stored before the latest connect. Used to reject a stale seat. */
export function walletAddressBeforeConnect(): string | null {
  return addressBeforeConnect;
}

function remember(name: string, account: Account) {
  chosenName = name;
  chosenAccount = account;
  try {
    addressBeforeConnect = localStorage.getItem("sudoku.walletAddress");
    localStorage.setItem("sudoku.walletName", name);
    if (account.address) localStorage.setItem("sudoku.walletAddress", account.address);
  } catch {
    addressBeforeConnect = null;
    // Private mode can block storage. The session still works until reload.
  }
}

function storedName(): string | null {
  try {
    return localStorage.getItem("sudoku.walletName");
  } catch {
    return null;
  }
}

export async function connectPlayWallet(name: string): Promise<string> {
  const wallet = named(name);
  const connect = wallet?.features["standard:connect"] as ConnectFeature | undefined;
  if (!wallet || !connect) throw new Error("That wallet is no longer available.");
  return authorize(wallet, connect, false);
}

/** Reuses an earlier approval. A missing wallet or a silent refusal returns null and does not prompt. */
export async function reconnectPlayWallet(): Promise<string | null> {
  const name = storedName();
  const wallet = named(name);
  const connect = wallet?.features["standard:connect"] as ConnectFeature | undefined;
  if (!wallet || !connect) return null;
  try {
    return await authorize(wallet, connect, true);
  } catch {
    return null;
  }
}

async function authorize(wallet: StandardWallet, connect: ConnectFeature, silent: boolean): Promise<string> {
  let accounts: readonly Account[];
  try {
    const connecting = connect.connect(silent ? { silent: true } : undefined);
    accounts = (await (silent ? connecting : walletCall(connecting))).accounts;
  } catch (error) {
    if (silent) throw error;
    if (declined(error)) throw new Error("The wallet declined the connection.");
    const message = error instanceof Error ? error.message : "";
    if (!message || /unexpected error/i.test(message)) {
      throw new Error("This wallet is not ready. Finish its setup, then connect again.");
    }
    throw new Error(message);
  }
  const account = accounts.find(item => item.chains?.some(chain => chain.startsWith("solana:"))) ?? accounts[0] ?? wallet.accounts[0];
  if (!account?.address) throw new Error("The wallet did not share an address.");
  remember(wallet.name, account);
  watchAccounts(wallet);
  notifyAccount(account.address);
  return account.address;
}

export async function disconnectPlayWallet(): Promise<void> {
  const wallet = named(chosenName);
  const disconnect = wallet?.features["standard:disconnect"] as DisconnectFeature | undefined;
  stopEvents?.();
  stopEvents = null;
  chosenName = null;
  chosenAccount = null;
  notifyAccount(null);
  try {
    localStorage.removeItem("sudoku.walletName");
    localStorage.removeItem("sudoku.walletAddress");
  } catch {
    // Storage may already be unavailable.
  }
  if (disconnect) await disconnect.disconnect().catch(() => undefined);
}

export function watchAccounts(wallet: StandardWallet, onChange?: (address: string | null) => void) {
  stopEvents?.();
  const events = wallet.features["standard:events"] as EventsFeature | undefined;
  if (!events?.on) return;
  stopEvents = events.on("change", ({ accounts }) => {
    const account = accounts.find(item => item.chains?.some(chain => chain.startsWith("solana:"))) ?? accounts[0];
    chosenAccount = account ?? null;
    const address = account?.address ?? null;
    if (address) {
      try {
        localStorage.setItem("sudoku.walletAddress", address);
      } catch {
        // The visible address still updates for this session.
      }
    } else {
      try { localStorage.removeItem("sudoku.walletAddress"); } catch { /* Storage may be unavailable. */ }
    }
    onChange?.(address);
    notifyAccount(address);
  });
}

function signingAccount(wallet: StandardWallet): Account {
  const account = chosenAccount ?? wallet.accounts[0];
  if (!account?.address) throw new Error("The wallet has no account to sign with.");
  return account;
}

export async function signPlayMessage(message: Uint8Array): Promise<Uint8Array | null> {
  const wallet = named(chosenName);
  const feature = wallet?.features["solana:signMessage"] as MessageFeature | undefined;
  if (!wallet || !feature) return null;
  const account = signingAccount(wallet);
  try {
    const signed = await walletCall(feature.signMessage({ account, message }));
    return signed[0]?.signature ?? null;
  } catch (error) {
    if (declined(error)) throw new Error("The wallet declined the signature.");
    const text = error instanceof Error ? error.message : "";
    throw new Error(text || "The wallet declined the signature.");
  }
}

export async function signPlayTransaction(bytes: Uint8Array): Promise<Uint8Array | null> {
  const wallet = named(chosenName);
  const feature = wallet?.features["solana:signTransaction"] as SignFeature | undefined;
  if (!wallet || !feature) return null;
  const account = signingAccount(wallet);
  try {
    const signed = await walletCall(feature.signTransaction({ account, transaction: bytes, chain: appChain }));
    return signed[0]?.signedTransaction ?? null;
  } catch (error) {
    if (declined(error)) throw new Error("The wallet declined the transaction.");
    const text = error instanceof Error ? error.message : "";
    throw new Error(text || "The wallet declined the transaction. This app is on Devnet.");
  }
}
