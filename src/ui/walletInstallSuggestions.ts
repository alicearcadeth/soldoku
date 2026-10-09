/** Install / get-wallet catalog shown when a named extension is not detected. */
export const WALLET_INSTALL_CATALOG = [
  { name: "Phantom", url: "https://phantom.com/download" },
  { name: "Solflare", url: "https://solflare.com/download" },
  { name: "Backpack", url: "https://backpack.app/downloads" },
] as const;

export type WalletChoiceName = { name: string };

/** True when Mobile Wallet Adapter is already offering a connect path (Seeker / Android). */
export function hasMobileWalletAdapter(choices: readonly WalletChoiceName[]): boolean {
  return choices.some((wallet) => /mobile wallet adapter/i.test(wallet.name));
}

/**
 * Desktop-style "Get wallet" links are wrong on Seeker: installed apps like Phantom
 * (`app.phantom`) do not register as Wallet Standard name "Phantom" inside the WebView.
 * MWA already covers Seed Vault and other MWA wallets including Phantom.
 */
export function walletInstallSuggestions(
  choices: readonly WalletChoiceName[],
  catalog: readonly { name: string; url: string }[] = WALLET_INSTALL_CATALOG,
): { name: string; url: string }[] {
  if (hasMobileWalletAdapter(choices)) return [];
  return catalog.filter(
    (item) => !choices.some((wallet) => wallet.name.toLowerCase().includes(item.name.toLowerCase())),
  );
}

/** Prefer MWA first so the primary mobile path is the top tap target. */
export function orderWalletChoices<T extends WalletChoiceName>(choices: readonly T[]): T[] {
  return [...choices].sort((a, b) => {
    const am = /mobile wallet adapter/i.test(a.name) ? 0 : 1;
    const bm = /mobile wallet adapter/i.test(b.name) ? 0 : 1;
    return am - bm || a.name.localeCompare(b.name);
  });
}
