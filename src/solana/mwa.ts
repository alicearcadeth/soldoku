import { getWallets } from "@wallet-standard/app";
import { connectedWalletName, signPlayMessage, signPlayTransaction } from "./browserWallet";
import { restorePartialSignature } from "./partialSignature";
import { walletCall } from "./walletCall";
import {
  createDefaultAuthorizationCache,
  createDefaultChainSelector,
  createDefaultWalletNotFoundHandler,
  registerMwa,
} from "@solana-mobile/wallet-standard-mobile";

let registered = false;

/** Name and icon path sent to Mobile Wallet Adapter. The icon is resolved against the page origin. */
export const mwaIdentity = { name: "Soldoku", icon: "brand/soldoku-logo.png" } as const;

/** Registers Seed Vault and other Mobile Wallet Adapter wallets. No-op in a desktop browser. */
export function ensureMwaRegistered(): void {
  if (registered || typeof window === "undefined") return;
  try {
    registerMwa({
      appIdentity: { name: mwaIdentity.name, uri: window.location.origin, icon: mwaIdentity.icon },
      authorizationCache: createDefaultAuthorizationCache(),
      chains: ["solana:devnet", "solana:localnet"],
      chainSelector: createDefaultChainSelector(),
      onWalletNotFound: createDefaultWalletNotFoundHandler(),
    });
    registered = true;
  } catch {
    // Desktop browsers do not expose the Mobile Wallet Adapter.
  }
}

type SignFeature = {
  signTransaction: (input: { account: unknown; transaction: Uint8Array }) => Promise<{ signedTransaction: Uint8Array }[]>;
};

type ConnectFeature = {
  connect: () => Promise<{ accounts: readonly { address: string }[] }>;
};

type MessageFeature = {
  signMessage: (input: { account: unknown; message: Uint8Array }) => Promise<{ signature: Uint8Array }[]>;
};

export function mobileWalletAvailable(): boolean {
  return Boolean(mobileWallet());
}

function mobileWallet() {
  ensureMwaRegistered();
  return getWallets().get().find((item) => item.name.includes("Mobile Wallet Adapter"));
}

/** Returns the authorized Seeker address. Returns null when no wallet is available. */
export async function connectMobileWallet(): Promise<string | null> {
  const wallet = mobileWallet();
  if (!wallet) return null;
  let account = wallet.accounts[0] as { address?: string } | undefined;
  if (!account) {
    const connect = wallet.features["standard:connect"] as ConnectFeature | undefined;
    if (!connect) return null;
    account = (await walletCall(connect.connect())).accounts[0];
  }
  return account?.address ?? null;
}

/** Signs a seat-recovery message with the connected wallet. */
export async function signMessageWithMobileWallet(message: Uint8Array): Promise<Uint8Array | null> {
  if (connectedWalletName()) return signPlayMessage(message);
  const wallet = mobileWallet();
  const feature = wallet?.features["solana:signMessage"] as MessageFeature | undefined;
  if (!wallet || !feature) return null;
  let account = wallet.accounts[0];
  if (!account) {
    const connect = wallet.features["standard:connect"] as ConnectFeature | undefined;
    if (!connect) return null;
    account = (await walletCall(connect.connect())).accounts[0] as typeof account;
  }
  const signed = await walletCall(feature.signMessage({ account, message }));
  return signed[0]?.signature ?? null;
}

/** Signs with Seed Vault when the Web Shell registered it. Returns null in a desktop browser. */
export async function signWithMobileWallet(bytes: Uint8Array): Promise<Uint8Array | null> {
  if (connectedWalletName()) return signPlayTransaction(bytes);
  const wallet = mobileWallet();
  const feature = wallet?.features["solana:signTransaction"] as SignFeature | undefined;
  if (!wallet || !feature) return null;
  let account = wallet.accounts[0];
  if (!account) {
    const connect = wallet.features["standard:connect"] as { connect: () => Promise<{ accounts: readonly unknown[] }> };
    account = (await walletCall(connect.connect())).accounts[0] as typeof account;
  }
  const signed = await walletCall(feature.signTransaction({ account, transaction: bytes }));
  const payload = signed[0]?.signedTransaction;
  return payload ? restorePartialSignature(payload) : null;
}
