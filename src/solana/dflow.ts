import { PublicKey, Transaction, VersionedTransaction } from "@solana/web3.js";

/** DFlow quote checks. A quote is not a swap, and a swap is not an escrow deposit. */

export const SOL_MINT = "So11111111111111111111111111111111111111112";
export const MAINNET_USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

export type QuoteDraft = {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  slippageBps: number;
  expiresAt: number;
};

export function allowlistedInput(cluster: string, mint: string, settlementMint: string): boolean {
  if (mint === settlementMint) return true;
  if (cluster === "mainnet-beta" && (mint === MAINNET_USDC || mint === SOL_MINT) && settlementMint === MAINNET_USDC) return true;
  return false;
}

export function validateQuote(quote: QuoteDraft, expectedOut: bigint, now: number): void {
  if (!quote.outputMint || !quote.inputMint) throw new Error("The quote is missing an asset");
  if (quote.expiresAt <= now) throw new Error("The quote expired. Request a new one.");
  if (!Number.isInteger(quote.slippageBps) || quote.slippageBps < 0 || quote.slippageBps > 100) {
    throw new Error("Slippage must stay at or below 1%");
  }
  let output: bigint;
  try {
    output = BigInt(quote.outAmount);
  } catch {
    throw new Error("The quote output is not an amount");
  }
  if (output < expectedOut) throw new Error("The quote does not cover the stake");
}

export type OrderView = QuoteDraft & {
  minOutAmount: string;
  priceImpactPct: string;
  executionMode: "sync" | "async";
  transaction: string | null;
  lastValidBlockHeight: number | null;
  platformFeeBps: number;
};

/** Documented DFlow GET /order. Omitting the wallet returns a quote and no transaction. */
export function orderUrl(base: string, inputMint: string, outputMint: string, amount: bigint, wallet?: string): string {
  const url = new URL("/order", base);
  url.searchParams.set("inputMint", inputMint);
  url.searchParams.set("outputMint", outputMint);
  url.searchParams.set("amount", amount.toString());
  url.searchParams.set("slippageBps", "50");
  if (wallet) url.searchParams.set("userPublicKey", wallet);
  return url.toString();
}

/** Checks a Trading API order. A parsed order is still not an on-chain swap. */
export function parseOrder(raw: Record<string, unknown>, expectedOut: bigint, now: number): OrderView {
  const inputMint = String(raw.inputMint ?? "");
  const outputMint = String(raw.outputMint ?? "");
  const inAmount = String(raw.inAmount ?? "");
  const outAmount = String(raw.outAmount ?? "");
  const minOutAmount = String(raw.minOutAmount ?? raw.otherAmountThreshold ?? "");
  const slippageBps = Number(raw.slippageBps);
  const priceImpactPct = String(raw.priceImpactPct ?? "0");
  const executionMode = raw.executionMode === "async" ? "async" : "sync";
  const transaction = typeof raw.transaction === "string" && raw.transaction.length > 0 ? raw.transaction : null;
  const lastValidBlockHeight = typeof raw.lastValidBlockHeight === "number" ? raw.lastValidBlockHeight : null;
  const platform = raw.platformFee as { feeBps?: number; amount?: string } | null | undefined;
  const platformFeeBps = Number(platform?.feeBps ?? 0);
  const view: OrderView = {
    inputMint,
    outputMint,
    inAmount,
    outAmount,
    slippageBps,
    expiresAt: now + 20_000,
    minOutAmount,
    priceImpactPct,
    executionMode,
    transaction,
    lastValidBlockHeight,
    platformFeeBps,
  };
  validateQuote(view, expectedOut, now);
  let minimum = 0n;
  try {
    minimum = BigInt(minOutAmount);
  } catch {
    throw new Error("The quote output is not an amount");
  }
  if (minimum < expectedOut) throw new Error("The quote does not cover the stake");
  if (platformFeeBps > 0 || (platform?.amount && BigInt(platform.amount) > 0n)) throw new Error("This app does not add a platform fee");
  const impact = Number(priceImpactPct);
  if (!Number.isFinite(impact) || impact > 1) throw new Error("The price impact is too high");
  if (executionMode === "async") throw new Error("Async swaps are not used");
  if (transaction && lastValidBlockHeight === null) throw new Error("The swap transaction has no expiry");
  assertQuotedDecimals(raw, outputMint);
  return view;
}

/** Route hops name their own decimals. A 6-decimal settlement asset cannot arrive as another precision. */
function assertQuotedDecimals(raw: Record<string, unknown>, outputMint: string): void {
  if (!Array.isArray(raw.routePlan)) return;
  for (const hop of raw.routePlan) {
    if (!hop || typeof hop !== "object") continue;
    const row = hop as { outputMint?: unknown; outputMintDecimals?: unknown };
    if (row.outputMint !== outputMint || row.outputMintDecimals === undefined) continue;
    if (!Number.isInteger(row.outputMintDecimals) || row.outputMintDecimals !== 6) {
      throw new Error("The quoted output decimals do not match the 6-decimal settlement asset");
    }
  }
}

export function decideQuote(input: {
  cluster: string;
  configured: boolean;
  executionArmed: boolean;
  inputMint: string;
  outputMint: string;
  stake: bigint;
  wallet: string | null;
  order: Record<string, unknown> | null;
  now: number;
}): { status: number; body: Record<string, unknown> } {
  if (!allowlistedInput(input.cluster, input.inputMint, input.outputMint)) {
    return { status: 400, body: { enabled: false, executed: false, signable: false, error: "That asset is not allowlisted for this room." } };
  }
  if (input.executionArmed && input.cluster !== "mainnet-beta") {
    return { status: 400, body: { enabled: false, executed: false, signable: false, error: "Conversion cannot run on this cluster." } };
  }
  if (!input.configured || !input.order) {
    return {
      status: 200,
      body: { enabled: false, executed: false, signable: false, reason: "Live conversion is off. Deposit the test token for this room. A quote is not a deposit." },
    };
  }
  rejectUnusableOrder(input.order);
  const view = parseOrder(input.order, input.stake, input.now);
  if (view.inputMint !== input.inputMint || view.outputMint !== input.outputMint) {
    throw new Error("The quote is for a different asset.");
  }
  const signable = input.executionArmed && input.cluster === "mainnet-beta" && view.transaction !== null;
  if (signable) {
    if (!input.wallet) return { status: 400, body: { enabled: false, executed: false, signable: false, error: "Connect a wallet before asking for a swap." } };
    inspectSwapTransaction(view.transaction ?? "", input.wallet, view.inputMint, view.outputMint);
  }
  const quote = { ...view, transaction: signable ? view.transaction : null };
  if (!signable) {
    return {
      status: 200,
      body: {
        enabled: false,
        signable: false,
        executed: false,
        reason: "Live conversion is off. Deposit the test token for this room. A quote is not a deposit.",
        quote,
      },
    };
  }
  return { status: 200, body: { enabled: true, signable: true, executed: false, quote } };
}

/** Documented DFlow GET /quote. Calling it does not send a transaction. */
export function quoteUrl(base: string, inputMint: string, outputMint: string, amount: bigint): string {
  const url = new URL("/quote", base);
  url.searchParams.set("inputMint", inputMint);
  url.searchParams.set("outputMint", outputMint);
  url.searchParams.set("amount", amount.toString());
  url.searchParams.set("slippageBps", "50");
  return url.toString();
}

/** An error body or an empty route is not a quote that can be signed. */
export function rejectUnusableOrder(raw: Record<string, unknown>): void {
  if (typeof raw.error === "string" && raw.error.length > 0) throw new Error("The route was not available.");
  if (Array.isArray(raw.routePlan) && raw.routePlan.length === 0 && !raw.outAmount) {
    throw new Error("The route was not available.");
  }
}

/** Programs a DFlow versioned swap is allowed to name. Anything else is rejected. */
export const SWAP_PROGRAMS = new Set([
  "ComputeBudget111111111111111111111111111111",
  "11111111111111111111111111111111",
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
  "DF1ow4tspfHX9JwWJsAb9epbkA8hmpSEAtxXy1V27QBH",
]);

export type SwapInspection = {
  feePayer: string;
  programs: string[];
  lookupTables: string[];
  signers: string[];
  writable: string[];
  version: "legacy" | "v0";
};

/** Rejects a swap whose fee payer, assets, destination, or programs do not match the approved quote. */
export function inspectSwapTransaction(
  raw: string,
  user: string,
  inputMint: string,
  outputMint: string,
  resolvedKeys: string[] = [],
): SwapInspection {
  const bytes = Buffer.from(raw, "base64");
  let feePayer = "";
  let keys: string[] = [];
  let programs: string[] = [];
  let lookupTables: string[] = [];
  let signers: string[] = [];
  let writable: string[] = [];
  let version: SwapInspection["version"] = "legacy";
  try {
    const versioned = VersionedTransaction.deserialize(bytes);
    const message = versioned.message;
    keys = message.staticAccountKeys.map((key) => key.toBase58());
    feePayer = keys[0] ?? "";
    programs = message.compiledInstructions.map((ix) => keys[ix.programIdIndex] ?? "");
    lookupTables = message.addressTableLookups.map((lookup) => lookup.accountKey.toBase58());
    const signed = message.header.numRequiredSignatures;
    const writableSigners = signed - message.header.numReadonlySignedAccounts;
    const writableUnsigned = keys.length - signed - message.header.numReadonlyUnsignedAccounts;
    signers = keys.slice(0, signed);
    writable = [...keys.slice(0, writableSigners), ...keys.slice(signed, signed + writableUnsigned)];
    version = "v0";
  } catch {
    try {
      const legacy = Transaction.from(bytes);
      feePayer = legacy.feePayer?.toBase58() ?? "";
      programs = legacy.instructions.map((ix) => ix.programId.toBase58());
      signers = [...new Set(legacy.instructions.flatMap((ix) => ix.keys.filter((key) => key.isSigner).map((key) => key.pubkey.toBase58())))];
      if (feePayer && !signers.includes(feePayer)) signers.unshift(feePayer);
      writable = [...new Set(legacy.instructions.flatMap((ix) => ix.keys.filter((key) => key.isWritable).map((key) => key.pubkey.toBase58())))];
      keys = [feePayer, ...legacy.instructions.flatMap((ix) => [ix.programId.toBase58(), ...ix.keys.map((key) => key.pubkey.toBase58())])];
    } catch {
      throw new Error("The swap transaction could not be read");
    }
  }
  if (!feePayer || feePayer !== user) throw new Error("The swap is not for this wallet");
  if (!programs.includes("DF1ow4tspfHX9JwWJsAb9epbkA8hmpSEAtxXy1V27QBH")) {
    throw new Error("The swap does not use the DFlow program");
  }
  const unknown = programs.find((program) => !SWAP_PROGRAMS.has(program));
  if (unknown) throw new Error("The swap includes an unexplained program");
  const accounts = new Set([...keys, ...resolvedKeys]);
  if (!accounts.has(inputMint) || !accounts.has(outputMint)) {
    if (lookupTables.length > 0 && resolvedKeys.length === 0) throw new Error("The swap assets are in an unresolved lookup table");
    throw new Error("The swap does not match the quoted assets");
  }
  const destination = settlementAccount(outputMint, user);
  const resolved = lookupTables.length === 0 || resolvedKeys.length > 0;
  if (resolved && !accounts.has(destination)) throw new Error("The swap output is not this wallet's settlement account");
  return { feePayer, programs: [...new Set(programs)], lookupTables, signers, writable, version };
}

export function assertUnmodifiedSwap(expected: string, presented: string): void {
  if (expected !== presented) throw new Error("The swap payload was modified");
}

function settlementAccount(mint: string, owner: string): string {
  const [account] = PublicKey.findProgramAddressSync(
    [
      new PublicKey(owner).toBuffer(),
      new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA").toBuffer(),
      new PublicKey(mint).toBuffer(),
    ],
    new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"),
  );
  return account.toBase58();
}

export function quoteRequest(settlementMint: string, stake: bigint, inputMint: string) {
  return {
    inputMint,
    outputMint: settlementMint,
    amount: stake.toString(),
    slippageBps: 50,
  };
}
