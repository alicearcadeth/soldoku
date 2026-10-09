import { describe, expect, it } from "vitest";
import {
  hasMobileWalletAdapter,
  orderWalletChoices,
  walletInstallSuggestions,
} from "./walletInstallSuggestions";

describe("walletInstallSuggestions", () => {
  it("hides Get-wallet links when Mobile Wallet Adapter is detected", () => {
    const choices = [{ name: "Mobile Wallet Adapter" }];
    expect(hasMobileWalletAdapter(choices)).toBe(true);
    expect(walletInstallSuggestions(choices)).toEqual([]);
  });

  it("still offers missing desktop wallets when only an extension is present", () => {
    const choices = [{ name: "Solflare" }];
    const urls = walletInstallSuggestions(choices).map((item) => item.name);
    expect(urls).toContain("Phantom");
    expect(urls).toContain("Backpack");
    expect(urls).not.toContain("Solflare");
  });

  it("offers the full catalog when nothing is detected", () => {
    expect(walletInstallSuggestions([]).map((item) => item.name)).toEqual([
      "Phantom",
      "Solflare",
      "Backpack",
    ]);
  });

  it("orders Mobile Wallet Adapter first", () => {
    const ordered = orderWalletChoices([
      { name: "Some Wallet" },
      { name: "Mobile Wallet Adapter" },
    ]);
    expect(ordered[0]?.name).toBe("Mobile Wallet Adapter");
  });
});
