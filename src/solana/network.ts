import { CLUSTER_GENESIS } from "./rpc";
import { ESCROW_PROGRAM_ID, ESCROW_V2_PROGRAM_ID } from "./program";

/** Circle's Mainnet USDC mint. It is not a Devnet or Localnet settlement asset. */
export const MAINNET_USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

/** The Devnet test mint used by the public app. Staging must not reuse it. */
export const DEVNET_PUBLIC_MINT = "J7STDEHGniYdSjuY4HKZMoSdr1KckYiGNdfnmsrYiLw7";

const PLAYABLE = new Set(["devnet", "localnet"]);

export type RuntimeConfig = {
  cluster: string;
  programId: string;
  mint: string;
  authority: string;
  rpcUrl: string;
  staging?: boolean;
};

/** Rejects Mainnet, a Mainnet mint, or a program id that does not belong to this cluster. */
export function assertRuntimeConfig(config: RuntimeConfig): void {
  if (!PLAYABLE.has(config.cluster)) throw new Error("Mainnet is not enabled");
  if (!config.programId || !config.mint || !config.authority) throw new Error("Escrow configuration is incomplete");
  let host = "";
  try {
    host = new URL(config.rpcUrl).host;
  } catch {
    throw new Error("The RPC address is not a URL");
  }
  if (/mainnet/i.test(host) || /mainnet/i.test(config.rpcUrl)) throw new Error("This deployment cannot use a Mainnet RPC");
  if (config.mint === MAINNET_USDC_MINT) throw new Error("The Mainnet USDC mint is not a settlement asset here");
  if (config.staging) {
    if (config.programId === ESCROW_PROGRAM_ID) throw new Error("Staging cannot use the legacy escrow program");
    if (config.mint === DEVNET_PUBLIC_MINT) throw new Error("Staging cannot use the public Devnet mint");
  } else if (config.cluster === "devnet") {
    if (config.programId !== ESCROW_PROGRAM_ID && config.programId !== ESCROW_V2_PROGRAM_ID) {
      throw new Error("Devnet is pinned to the deployed escrow program");
    }
    if (config.mint !== DEVNET_PUBLIC_MINT) throw new Error("Devnet is pinned to the public test mint");
  }
  if (config.cluster === "localnet" && !/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host)) {
    throw new Error("Localnet must use a loopback RPC");
  }
}

export function genesisFor(cluster: string): string | null {
  if (cluster === "devnet" || cluster === "mainnet-beta" || cluster === "testnet") return CLUSTER_GENESIS[cluster];
  return null;
}
