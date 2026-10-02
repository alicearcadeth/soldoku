import { Connection, Keypair, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";

const rpc = "https://api.mainnet-beta.solana.com";
const usdc = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
const expected = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";
const connection = new Connection(rpc, "confirmed");
const genesis = await connection.getGenesisHash();
const mint = await connection.getAccountInfo(usdc);
if (genesis !== expected) throw new Error("genesis mismatch");
if (!mint) throw new Error("USDC mint missing");
const decimals = mint.data[44];
const tokenProgram = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const devnetEscrow = new PublicKey("937BAWXVCW58oEKkA1FijkSXXtdgGEytUyPRV2Roge22");
const tokenInfo = await connection.getAccountInfo(tokenProgram);
const escrowOnMainnet = await connection.getAccountInfo(devnetEscrow);
const probe = Keypair.generate();
const tx = new Transaction().add(SystemProgram.transfer({
  fromPubkey: probe.publicKey,
  toPubkey: probe.publicKey,
  lamports: 0,
}));
const latest = await connection.getLatestBlockhash();
tx.recentBlockhash = latest.blockhash;
tx.feePayer = probe.publicKey;
const fee = await connection.getFeeForMessage(tx.compileMessage());
console.log(JSON.stringify({
  cluster: "mainnet-beta",
  genesis,
  usdcOwner: mint.owner.toBase58(),
  usdcBytes: mint.data.length,
  usdcDecimals: decimals,
  usdcLamports: mint.lamports,
  tokenProgramExecutable: tokenInfo?.executable ?? false,
  devnetEscrowOnMainnet: Boolean(escrowOnMainnet),
  feeLamports: fee.value,
  emptyAccountSimulation: "not run; an empty account is not an escrow test",
  broadcast: false,
}));
