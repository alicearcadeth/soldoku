import { beforeEach, describe, expect, it, vi } from "vitest";

const registered = vi.hoisted(() => ({ wallets: [] as unknown[] }));

vi.mock("@wallet-standard/app", () => ({
  getWallets: () => ({ get: () => registered.wallets, on: () => () => undefined }),
}));

vi.mock("./mwa", () => ({ ensureMwaRegistered: () => undefined }));

import { connectPlayWallet, connectedAddress, declined, disconnectPlayWallet, onPlayAccount, reconnectPlayWallet, signPlayMessage, signPlayTransaction, walletAddressBeforeConnect, walletChanged, walletClusterWarning } from "./browserWallet";

const memory = new Map<string, string>();

beforeEach(() => {
  registered.wallets = [];
  memory.clear();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => memory.set(key, value),
    removeItem: (key: string) => memory.delete(key),
  });
});

describe("browser wallet", () => {
  it("shares connection and disconnect events and lets subscribers unsubscribe", async () => {
    const a = vi.fn(); const b = vi.fn();
    const offA = onPlayAccount(a); const offB = onPlayAccount(b);
    registered.wallets = [{ name: "Test Wallet", accounts: [], features: { "standard:connect": { connect: async () => ({ accounts: [{ address: "Wallet111", chains: ["solana:devnet"] }] }) } } }];
    await connectPlayWallet("Test Wallet");
    expect(a).toHaveBeenCalledWith("Wallet111"); expect(b).toHaveBeenCalledWith("Wallet111");
    offA();
    await disconnectPlayWallet();
    expect(a).toHaveBeenCalledTimes(1); expect(b).toHaveBeenLastCalledWith(null);
    expect(connectedAddress()).toBeNull();
    offB();
  });
  it("chooses the Solana account when a wallet returns multiple chain accounts", async () => {
    registered.wallets = [{ name: "Multi Wallet", accounts: [], features: { "standard:connect": { connect: async () => ({ accounts: [{ address: "EvmAccount", chains: ["eip155:1"] }, { address: "SolanaAccount", chains: ["solana:devnet"] }] }) } } }];
    expect(await connectPlayWallet("Multi Wallet")).toBe("SolanaAccount");
    await disconnectPlayWallet();
  });
  it("names a mismatched cluster without pretending it can switch the wallet", () => {
    expect(walletClusterWarning(["solana:mainnet"], "devnet")).toMatch(/not on devnet/i);
    expect(walletClusterWarning(undefined, "devnet")).toBeNull();
    expect(walletClusterWarning(["solana:devnet"], "devnet")).toBeNull();
    expect(declined(new Error("User rejected the request"))).toBe(true);
    expect(walletChanged("Wallet111", "Wallet222")).toBe(true);
    expect(walletChanged("Wallet111", "Wallet111")).toBe(false);
    expect(walletChanged(null, "Wallet111")).toBe(false);
  });

  it("signs one transaction object and remembers a silent reconnect", async () => {
    const calls: unknown[] = [];
    const account = { address: "Wallet111", publicKey: new Uint8Array(32), chains: ["solana:devnet"] };
    registered.wallets = [{
      name: "Test Wallet",
      accounts: [],
      features: {
        "standard:connect": {
          connect: async (input?: { silent?: boolean }) => {
            if (input?.silent && !memory.get("sudoku.walletName")) throw new Error("not authorized");
            return { accounts: [account] };
          },
        },
        "solana:signMessage": {
          signMessage: async (input: unknown) => {
            calls.push(input);
            return [{ signature: new Uint8Array([7]) }];
          },
        },
        "solana:signTransaction": {
          signTransaction: async (input: unknown) => {
            calls.push(input);
            return [{ signedTransaction: new Uint8Array([8]) }];
          },
        },
      },
    }];
    await expect(connectPlayWallet("Missing")).rejects.toThrow(/no longer available/i);
    expect(await connectPlayWallet("Test Wallet")).toBe("Wallet111");
    expect(await signPlayMessage(new Uint8Array([1]))).toEqual(new Uint8Array([7]));
    expect(await signPlayTransaction(new Uint8Array([2]))).toEqual(new Uint8Array([8]));
    expect(Array.isArray(calls[0])).toBe(false);
    expect(calls[1]).toMatchObject({ transaction: new Uint8Array([2]), chain: "solana:devnet" });
    expect(await reconnectPlayWallet()).toBe("Wallet111");
    expect(walletChanged(walletAddressBeforeConnect(), "Wallet111")).toBe(false);
    account.address = "Wallet222";
    expect(await connectPlayWallet("Test Wallet")).toBe("Wallet222");
    expect(walletAddressBeforeConnect()).toBe("Wallet111");
    expect(walletChanged(walletAddressBeforeConnect(), "Wallet222")).toBe(true);
  });

  it("reports a rejected connection", async () => {
    registered.wallets = [{
      name: "Test Wallet",
      accounts: [],
      features: {
        "standard:connect": {
          connect: async () => {
            throw new Error("User rejected the request");
          },
        },
      },
    }];
    await expect(connectPlayWallet("Test Wallet")).rejects.toThrow(/declined the connection/i);
  });

  it("explains a wallet that is installed but not set up", async () => {
    registered.wallets = [{
      name: "Phantom",
      accounts: [],
      features: {
        "standard:connect": {
          connect: async () => {
            throw new Error("Unexpected error");
          },
        },
      },
    }];
    await expect(connectPlayWallet("Phantom")).rejects.toThrow(/not ready/i);
  });
});
