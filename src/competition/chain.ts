import { Connection, Keypair, PublicKey, SystemProgram, SYSVAR_CLOCK_PUBKEY, Transaction, type TransactionInstruction } from "@solana/web3.js";
import { createAssociatedTokenAccountIdempotentInstruction, createMintToInstruction, getAssociatedTokenAddressSync, getMint } from "@solana/spl-token";
import { CLUSTER_GENESIS } from "../solana/rpc";
import { competitionInstructions, COMPETITION_TEST_MINT, COMPETITION_DEVNET_MINT, readCompetitionEntry, readCompetitionRoom } from "./escrow";
import { missingTesterTokenAccount, TESTER_SOL_AIRDROP, TESTER_SOL_FAUCET, TESTER_TOKEN_GRANT, type TesterPlan } from "./testerFunds";
import type { FundedConfig, VerifiedChainRoom } from "./types";
import type { createCompetitionStore } from "./store";

export type CompetitionEnvironment = {
  SUDOKU_COMPETITION_PROGRAM_ID?: string; SUDOKU_COMPETITION_AUTHORITY_KEY?: string;
  SUDOKU_COMPETITION_RPC?: string; SUDOKU_COMPETITION_LOCALNET?: string;
  SUDOKU_COMPETITION_PLAY_MS?: string; SUDOKU_COMPETITION_GRACE_MS?: string;
  SUDOKU_COMPETITION_MINT?: string; SUDOKU_COMPETITION_FAUCET_KEY?: string;
};
type Context = ReturnType<ReturnType<typeof createCompetitionStore>["fundingContext"]>;
export type PreparedCompetitionTransaction = { transaction: string; action: string; wallet: string; cluster: "devnet" | "localnet";
  room: string; mint: string; stakeUnits: string; startsAt: number; endsAt: number; refundAt: number; expiresAtBlockHeight: number };
export type CompetitionChain = {
  config: FundedConfig;
  cluster: "devnet" | "localnet";
  verify(): Promise<void>;
  read(context: Context): Promise<VerifiedChainRoom | null>;
  transaction(context: Context, action: string, extraMs?: unknown): Promise<PreparedCompetitionTransaction>;
  settle(context: Context): Promise<string | null>;
  submit(raw: unknown, wallet: string): Promise<string>;
  faucetConfigured: boolean;
  testerBalances(wallet: string): Promise<{ solLamports: number; testUnits: bigint }>;
  fundTester(wallet: string, plan: TesterPlan): Promise<{ solSignature: string | null; testSignature: string | null; note: string | null }>;
};

function milliseconds(raw: string | undefined, fallback: number, minimum: number) {
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > 86400000 || value % 1000) throw new Error("Invalid competition time configuration.");
  return value;
}
export function competitionChain(env: CompetitionEnvironment): CompetitionChain | undefined {
  if (!env.SUDOKU_COMPETITION_PROGRAM_ID || !env.SUDOKU_COMPETITION_AUTHORITY_KEY) return undefined;
  const cluster = env.SUDOKU_COMPETITION_LOCALNET === "1" ? "localnet" : "devnet";
  const endpoint = env.SUDOKU_COMPETITION_RPC ?? "https://api.devnet.solana.com";
  const parsed = new URL(endpoint);
  if (cluster === "localnet" && !["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname)) throw new Error("Local competition tests require a loopback RPC.");
  if (cluster === "devnet" && parsed.protocol !== "https:") throw new Error("Devnet competition RPC requires HTTPS.");
  let authority: Keypair;
  try { authority = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(env.SUDOKU_COMPETITION_AUTHORITY_KEY))); }
  catch { throw new Error("Competition authority is not configured correctly."); }
  const program = new PublicKey(env.SUDOKU_COMPETITION_PROGRAM_ID);
  // Reject known existing two-player program identities, including undeployed Mainnet builds.
  if (["HUkhJi8p1XXuErpEXkgpfQjwdapigXLECRoQSu3indyS", "GTJ68bR2Fwkc9JcYefH9Eas9gvHnR6AkZ3TincmJsst4", "937BAWXVCW58oEKkA1FijkSXXtdgGEytUyPRV2Roge22"].includes(program.toBase58())) {
    throw new Error("Multi-player competitions require a separate program identity.");
  }
  const supportedMint = new PublicKey(env.SUDOKU_COMPETITION_MINT ?? (cluster === "localnet" ? COMPETITION_TEST_MINT : COMPETITION_DEVNET_MINT));
  if (!supportedMint.equals(COMPETITION_TEST_MINT) && !supportedMint.equals(COMPETITION_DEVNET_MINT)) throw new Error("Unsupported competition mint configuration.");
  let faucet: Keypair | null = null;
  if (env.SUDOKU_COMPETITION_FAUCET_KEY) {
    try { faucet = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(env.SUDOKU_COMPETITION_FAUCET_KEY))); }
    catch { throw new Error("Competition tester faucet key is not configured correctly."); }
    if (!faucet.publicKey.equals(supportedMint)) throw new Error("Tester faucet key is not the TEST mint authority.");
  }
  const config: FundedConfig = { program: program.toBase58(), authority: authority.publicKey.toBase58(), mint: supportedMint.toBase58(), decimals: 6,
    playMs: milliseconds(env.SUDOKU_COMPETITION_PLAY_MS, 1800000, 15000), graceMs: milliseconds(env.SUDOKU_COMPETITION_GRACE_MS, 3600000, 60000) };
  const connection = new Connection(endpoint, { commitment: "finalized", fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(12000) }) });
  // No process-global environment mutation. Each request's bindings own their connection/key.
  let verified: Promise<void> | undefined;
  async function verifyOnce() {
    const genesis = await connection.getGenesisHash();
    if (cluster === "devnet" ? genesis !== CLUSTER_GENESIS.devnet : Object.values(CLUSTER_GENESIS).includes(genesis as typeof CLUSTER_GENESIS.devnet)) {
      throw new Error("Competition RPC is not on the configured test network.");
    }
    const account = await connection.getAccountInfo(program, "finalized");
    if (!account?.executable) throw new Error("The multi-player competition program is not deployed on this network.");
    const mint = await getMint(connection, supportedMint, "finalized");
    if (mint.decimals !== config.decimals || mint.freezeAuthority || !mint.isInitialized) throw new Error("The configured competition test mint is unsupported.");
  }
  async function verify() {
    verified ??= verifyOnce().catch(error => { verified = undefined; throw error; });
    await verified;
  }
  function bound(context: Context) {
    if (context.terms.program !== config.program || context.terms.authority !== config.authority || context.terms.mint !== config.mint
      || context.terms.decimals !== config.decimals) throw new Error("This room uses a different escrow configuration.");
    return competitionInstructions(program, BigInt(context.terms.id), supportedMint);
  }
  async function read(context: Context): Promise<VerifiedChainRoom | null> {
    const ix = bound(context);
    const result = await connection.getMultipleAccountsInfoAndContext([ix.room, SYSVAR_CLOCK_PUBKEY], { commitment: "finalized" });
    const [account, clock] = result.value;
    if (!account) return null;
    if (account.owner.equals(SystemProgram.programId) && !account.executable && account.data.length === 0) return null;
    if (!account.owner.equals(program) || !clock) throw new Error("Invalid competition escrow owner or clock.");
    const room = readCompetitionRoom(account.data);
    const entries: VerifiedChainRoom["entries"] = [];
    const visited = new Set<string>();
    async function readEntry(address: PublicKey, allowMissing = false) {
      const item = await connection.getAccountInfo(address, { commitment: "finalized", minContextSlot: result.context.slot });
      if (allowMissing && (!item || item.owner.equals(SystemProgram.programId) && !item.executable && item.data.length === 0)) return null;
      if (!item?.owner.equals(program)) throw new Error("Invalid competition entry owner.");
      const entry = readCompetitionEntry(item.data);
      if (!entry.room.equals(ix.room) || !address.equals(ix.entry(entry.wallet)) || visited.has(address.toBase58())) throw new Error("Invalid competition entry PDA or cycle.");
      visited.add(address.toBase58()); entries.push({ wallet: entry.wallet.toBase58(), claimed: entry.claimed });
      if (BigInt(entries.length) > room.entrants) throw new Error("Invalid escrow entrant count.");
      return entry;
    }
    if (room.head) {
      let address = room.head;
      while (!address.equals(PublicKey.default)) {
        const entry = await readEntry(address);
        if (!entry?.next) throw new Error("Invalid linked escrow entry.");
        address = entry.next;
      }
    } else {
      // Existing funded rooms predate linked entries. Recover their known entrants
      // through ordinary account reads; new rooms never need getProgramAccounts.
      for (const wallet of context.wallets) await readEntry(ix.entry(new PublicKey(wallet)), true);
    }
    if (room.entrants !== BigInt(entries.length)) throw new Error("Deposits are still being finalized. Refresh this room.");
    const safeMs = (seconds: bigint) => {
      const value = Number(seconds) * 1000;
      if (!Number.isSafeInteger(value) || value < 0) throw new Error("Invalid escrow clock value.");
      return value;
    };
    return { id: room.id.toString(), creator: room.creator.toBase58(), authority: room.authority.toBase58(), mint: room.mint.toBase58(), stakeUnits: room.stake.toString(),
      startsAt: safeMs(room.joinDeadline), endsAt: safeMs(room.deadline), refundAt: safeMs(room.refundAt), participants: entries.length,
      chainTime: safeMs(clock.data.readBigInt64LE(32)), status: room.status, winner: room.winner.equals(PublicKey.default) ? null : room.winner.toBase58(), entries };
  }
  async function transaction(context: Context, action: string, extraMs?: unknown): Promise<PreparedCompetitionTransaction> {
    await verify();
    const ix = bound(context); const wallet = new PublicKey(context.wallet); const terms = context.terms;
    const chain = await read(context); const now = Date.now();
    const instructions: TransactionInstruction[] = [];
    const toSeconds = (ms: number) => BigInt(ms / 1000);
    if (action === "deposit") {
      if (chain?.entries.some(entry => entry.wallet === context.wallet)) throw new Error("Your deposit is already confirmed. Refresh this room to resume.");
      if (now >= terms.startsAt) throw new Error("Registration has closed. No new deposits are accepted.");
      if (!chain) {
        if (context.wallet !== context.owner) throw new Error("The creator must fund this room first.");
        instructions.push(ix.open(wallet, authority.publicKey, BigInt(terms.stakeUnits), toSeconds(terms.startsAt), toSeconds(context.endsAt), toSeconds(terms.refundAt)));
      } else if (chain.status !== "open" || now >= chain.startsAt) throw new Error("This room is closed for deposits.");
      const ata = getAssociatedTokenAddressSync(ix.mint, wallet);
      const account = await connection.getAccountInfo(ata);
      const balance = account ? await connection.getTokenAccountBalance(ata) : null;
      if (!balance || BigInt(balance.value.amount) < BigInt(terms.stakeUnits)) throw new Error("Insufficient TEST token balance on Devnet. Use Get Devnet SOL and TEST, then join again.");
      instructions.push(ix.join(wallet));
    } else if (action === "extend") {
      if (!chain || chain.status !== "open" || chain.participants !== 1 || context.wallet !== context.owner || now >= chain.startsAt) throw new Error("Only the solo creator can extend registration before it closes.");
      if (typeof extraMs !== "number" || !Number.isInteger(extraMs) || extraMs < 60000 || extraMs > 365 * 86400000 || extraMs % 1000) throw new Error("Choose a valid extension.");
      instructions.push(ix.extend(wallet, toSeconds(chain.startsAt + extraMs)));
    } else if (action === "claim") {
      if (!chain) throw new Error("Escrow deposit not found.");
      const entry = chain.entries.find(entry => entry.wallet === context.wallet);
      if (!entry) throw new Error("This wallet has no deposit in this competition.");
      if (entry.claimed) throw new Error("Your escrow claim is already complete.");
      const refund = chain.status === "refunding" || (chain.status === "open" && (chain.chainTime >= chain.refundAt || (chain.participants === 1 && chain.chainTime >= chain.startsAt)));
      if (!refund && (chain.status !== "awarded" || chain.winner !== context.wallet)) throw new Error("No payout or refund is available for this wallet yet.");
      // Recreate a closed recipient ATA at the claimant's expense; recipient remains immutable.
      instructions.push(createAssociatedTokenAccountIdempotentInstruction(wallet, getAssociatedTokenAddressSync(ix.mint, wallet), wallet, ix.mint), ix.claim(wallet, refund));
    } else throw new Error("Unknown competition transaction action.");
    const latest = await connection.getLatestBlockhash("finalized");
    const tx = new Transaction({ feePayer: wallet, recentBlockhash: latest.blockhash }).add(...instructions);
    if (action === "deposit" && !chain) tx.partialSign(authority);
    return { transaction: tx.serialize({ requireAllSignatures: false }).toString("base64"), action, wallet: context.wallet, cluster,
      room: ix.room.toBase58(), mint: config.mint, stakeUnits: terms.stakeUnits, startsAt: chain?.startsAt ?? terms.startsAt,
      endsAt: chain?.endsAt ?? context.endsAt, refundAt: chain?.refundAt ?? terms.refundAt, expiresAtBlockHeight: latest.lastValidBlockHeight };
  }
  async function settle(context: Context): Promise<string | null> {
    await verify(); const ix = bound(context); const chain = await read(context);
    if (!chain) throw new Error("Competition escrow has not been funded.");
    if (chain.status !== "open") return null;
    if (chain.chainTime < chain.endsAt || context.outcome.kind === "pending") throw new Error("The competition is still running.");
    if (chain.chainTime >= chain.refundAt) throw new Error("Settlement timed out. Each entrant can now claim their refund.");
    const winner = context.outcome.kind === "winner" ? new PublicKey(context.outcome.wallet) : null;
    const latest = await connection.getLatestBlockhash("finalized");
    const tx = new Transaction({ feePayer: authority.publicKey, recentBlockhash: latest.blockhash }).add(ix.settle(authority.publicKey, winner));
    tx.sign(authority);
    return connection.sendRawTransaction(tx.serialize(), { preflightCommitment: "finalized", maxRetries: 3 });
  }
  async function submit(raw: unknown, wallet: string): Promise<string> {
    await verify();
    if (typeof raw !== "string" || raw.length > 2400) throw new Error("Invalid signed competition transaction.");
    const bytes = Buffer.from(raw, "base64"); const tx = Transaction.from(bytes);
    if (!tx.feePayer?.equals(new PublicKey(wallet)) || !tx.verifySignatures()) throw new Error("Competition transaction signatures do not match this wallet.");
    // Relay only the exact purpose-built competition instructions, plus idempotent ATA recreation.
    if (tx.instructions.some(instruction => !instruction.programId.equals(program)
      && !instruction.programId.equals(new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL")))) throw new Error("Unrelated instructions cannot be relayed by the competition API.");
    return connection.sendRawTransaction(bytes, { preflightCommitment: "finalized", maxRetries: 3 });
  }
  async function testerBalances(wallet: string) {
    const owner = new PublicKey(wallet);
    const solLamports = await connection.getBalance(owner, "finalized");
    let testUnits = 0n;
    try {
      const balance = await connection.getTokenAccountBalance(getAssociatedTokenAddressSync(supportedMint, owner), "finalized");
      testUnits = BigInt(balance.value.amount);
    } catch (error) {
      if (!missingTesterTokenAccount(error)) throw error;
    }
    return { solLamports, testUnits };
  }
  async function fundTester(wallet: string, plan: TesterPlan) {
    await verify();
    const owner = new PublicKey(wallet);
    let solSignature: string | null = null;
    let note = plan.note;
    if (plan.sol) {
      try { solSignature = await connection.requestAirdrop(owner, TESTER_SOL_AIRDROP); }
      catch {
        note = `Devnet refused the SOL airdrop. Request Devnet SOL at ${TESTER_SOL_FAUCET} for this wallet to cover entry fees. Any TEST sent by this request is separate from the SOL airdrop.`;
        if (!plan.test) throw new Error(note);
      }
    }
    let testSignature: string | null = null;
    if (plan.test) {
      if (!faucet) throw new Error("TEST minting is not enabled on this server yet.");
      const ata = getAssociatedTokenAddressSync(supportedMint, owner);
      const latest = await connection.getLatestBlockhash("finalized");
      const tx = new Transaction({ feePayer: authority.publicKey, recentBlockhash: latest.blockhash }).add(
        createAssociatedTokenAccountIdempotentInstruction(authority.publicKey, ata, owner, supportedMint),
        createMintToInstruction(supportedMint, ata, faucet.publicKey, TESTER_TOKEN_GRANT),
      );
      tx.sign(...(faucet.publicKey.equals(authority.publicKey) ? [authority] : [authority, faucet]));
      testSignature = await connection.sendRawTransaction(tx.serialize(), { preflightCommitment: "finalized", maxRetries: 3 });
    }
    return { solSignature, testSignature, note };
  }
  return { config, cluster, verify, read, transaction, settle, submit, faucetConfigured: faucet !== null, testerBalances, fundTester };
}
