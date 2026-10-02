import { Connection, PublicKey } from "@solana/web3.js";

export const MAINNET_GENESIS = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";
export const MAINNET_USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

/** Read-only Mainnet checks. This does not build or send a transaction. */
export async function inspectMainnet(rpcUrl: string, address?: string) {
  const connection = new Connection(rpcUrl, "confirmed");
  const genesis = await connection.getGenesisHash();
  if (genesis !== MAINNET_GENESIS) throw new Error("That RPC is not Mainnet");
  const mint = await connection.getAccountInfo(new PublicKey(MAINNET_USDC));
  if (!mint) throw new Error("Mainnet USDC mint was not found");
  const owner = address ? await connection.getBalance(new PublicKey(address)) : null;
  return {
    cluster: "mainnet-beta",
    genesis,
    usdcOwner: mint.owner.toBase58(),
    usdcBytes: mint.data.length,
    sol: owner,
  };
}
