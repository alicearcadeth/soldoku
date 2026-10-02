import { readFileSync } from "node:fs";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { AddressLookupTableAccount, Keypair, PublicKey, Transaction, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import { allowlistedInput, assertUnmodifiedSwap, decideQuote, inspectSwapTransaction, MAINNET_USDC, orderUrl, parseOrder, quoteRequest, SOL_MINT, validateQuote } from "./dflow";

describe("dflow quotes", () => {
  const now = 1_700_000_000_000;

  it("replays a sanitized production quote without a transaction", () => {
    const saved = JSON.parse(readFileSync(new URL("./fixtures/dflow-quote.json", import.meta.url), "utf8")) as Record<string, unknown>;
    expect(saved.broadcast).toBe(false);
    expect(saved).not.toHaveProperty("transaction");
    const view = parseOrder(saved, 1_000_000n, 0);
    expect(view.outAmount).toBe("1185900");
    expect(view.minOutAmount).toBe("1179971");
    expect(BigInt(view.minOutAmount) >= 1_000_000n).toBe(true);
    expect(view.transaction).toBeNull();
    const larger = JSON.parse(readFileSync(new URL("./fixtures/dflow-quote-002.json", import.meta.url), "utf8")) as Record<string, unknown>;
    expect(parseOrder(larger, 2_000_000n, 0).minOutAmount).toBe("2342298");
    expect(() => parseOrder(larger, 3_000_000n, 0)).toThrow(/cover the stake/i);
  });

  it("allows the settlement mint and a mainnet SOL to USDC route only", () => {
    expect(allowlistedInput("devnet", "room-mint", "room-mint")).toBe(true);
    expect(allowlistedInput("devnet", SOL_MINT, "room-mint")).toBe(false);
    expect(allowlistedInput("mainnet-beta", SOL_MINT, MAINNET_USDC)).toBe(true);
    expect(allowlistedInput("mainnet-beta", "random-token", MAINNET_USDC)).toBe(false);
  });

  it("rejects an expired, loose, or short quote", () => {
    const quote = {
      inputMint: SOL_MINT,
      outputMint: MAINNET_USDC,
      inAmount: "1000",
      outAmount: "1000000",
      slippageBps: 50,
      expiresAt: now + 30_000,
    };
    expect(() => validateQuote(quote, 1_000_000n, now)).not.toThrow();
    expect(() => validateQuote({ ...quote, expiresAt: now }, 1_000_000n, now)).toThrow(/expired/i);
    expect(() => validateQuote({ ...quote, slippageBps: 500 }, 1_000_000n, now)).toThrow(/slippage/i);
    expect(() => validateQuote({ ...quote, outAmount: "1" }, 1_000_000n, now)).toThrow(/cover the stake/i);
    expect(quoteRequest(MAINNET_USDC, 1_000_000n, SOL_MINT).slippageBps).toBe(50);
  });

  it("parses an order without treating it as an executed swap", () => {
    const now = 1_700_000_000_000;
    const raw = {
      inputMint: SOL_MINT,
      outputMint: MAINNET_USDC,
      inAmount: "10000000",
      outAmount: "1200000",
      minOutAmount: "1100000",
      slippageBps: 50,
      priceImpactPct: "0.1",
      executionMode: "sync",
    };
    const view = parseOrder(raw, 1_000_000n, now);
    expect(view.transaction).toBeNull();
    expect(orderUrl("https://dev-quote-api.dflow.net", SOL_MINT, MAINNET_USDC, 10_000_000n)).not.toContain("userPublicKey");
    const decision = decideQuote({
      cluster: "mainnet-beta",
      configured: true,
      executionArmed: false,
      inputMint: SOL_MINT,
      outputMint: MAINNET_USDC,
      stake: 1_000_000n,
      wallet: null,
      order: raw,
      now,
    });
    expect(decision.body).toMatchObject({ enabled: false, signable: false, executed: false });
    const unconfigured = decideQuote({
      cluster: "devnet",
      configured: false,
      executionArmed: false,
      inputMint: "room-mint",
      outputMint: "room-mint",
      stake: 1_000_000n,
      wallet: null,
      order: null,
      now,
    });
    expect(unconfigured.body).toMatchObject({ enabled: false, signable: false, executed: false });
    expect(unconfigured.body.quote).toBeUndefined();
    expect(decision.body.quote).toMatchObject({ transaction: null });
    expect(() => parseOrder({ ...raw, executionMode: "async" }, 1_000_000n, now)).toThrow(/async/i);
    expect(() => parseOrder({ ...raw, platformFee: { feeBps: 10 } }, 1_000_000n, now)).toThrow(/platform fee/i);
    expect(() => parseOrder({ ...raw, transaction: "aaaa", lastValidBlockHeight: null }, 1_000_000n, now)).toThrow(/no expiry/);
    const liveShape = {
      ...raw,
      otherAmountThreshold: "1100000",
      platformFee: null,
      routePlan: [
        { inputMint: SOL_MINT, outputMint: MAINNET_USDC, inputMintDecimals: 9, outputMintDecimals: 6 },
      ],
      transactionVersion: "v0",
    };
    expect(parseOrder(liveShape, 1_000_000n, now).minOutAmount).toBe("1100000");
    expect(() => parseOrder({
      ...liveShape,
      routePlan: [{ outputMint: MAINNET_USDC, outputMintDecimals: 9 }],
    }, 1_000_000n, now)).toThrow(/decimals/);
  });

  it("accepts a swap only when the fee payer and both assets match", () => {
    const user = Keypair.generate();
    const other = Keypair.generate();
    const raw = swapFor(user.publicKey);
    expect(inspectSwapTransaction(raw, user.publicKey.toBase58(), SOL_MINT, MAINNET_USDC).feePayer).toBe(user.publicKey.toBase58());
    expect(() => inspectSwapTransaction(raw, other.publicKey.toBase58(), SOL_MINT, MAINNET_USDC)).toThrow(/not for this wallet/);
    const armed = decideQuote({
      cluster: "mainnet-beta",
      configured: true,
      executionArmed: true,
      inputMint: SOL_MINT,
      outputMint: MAINNET_USDC,
      stake: 1_000_000n,
      wallet: user.publicKey.toBase58(),
      order: { ...orderBody(), transaction: raw, lastValidBlockHeight: 1 },
      now: 1_700_000_000_000,
    });
    expect(armed.body).toMatchObject({ enabled: true, signable: true, executed: false });
    const blocked = decideQuote({
      cluster: "devnet",
      configured: true,
      executionArmed: true,
      inputMint: MAINNET_USDC,
      outputMint: MAINNET_USDC,
      stake: 1_000_000n,
      wallet: user.publicKey.toBase58(),
      order: { ...orderBody(), inputMint: MAINNET_USDC, outputMint: MAINNET_USDC, transaction: raw, lastValidBlockHeight: 1 },
      now: 1_700_000_000_000,
    });
    expect(blocked.body.error).toMatch(/cannot run on this cluster/);
    const missing = decideQuote({
      cluster: "mainnet-beta",
      configured: true,
      executionArmed: true,
      inputMint: SOL_MINT,
      outputMint: MAINNET_USDC,
      stake: 1_000_000n,
      wallet: user.publicKey.toBase58(),
      order: orderBody(),
      now: 1_700_000_000_000,
    });
    expect(missing.body).toMatchObject({ enabled: false, signable: false, executed: false });
    expect(() => decideQuote({
      cluster: "mainnet-beta",
      configured: true,
      executionArmed: false,
      inputMint: SOL_MINT,
      outputMint: MAINNET_USDC,
      stake: 1_000_000n,
      wallet: null,
      order: { error: "Route not found" },
      now,
    })).toThrow(/route was not available/i);
    expect(() => decideQuote({
      cluster: "mainnet-beta",
      configured: true,
      executionArmed: false,
      inputMint: SOL_MINT,
      outputMint: MAINNET_USDC,
      stake: 1_000_000n,
      wallet: null,
      order: { ...orderBody(), outputMint: SOL_MINT },
      now,
    })).toThrow(/different asset/i);
    expect(() => decideQuote({
      cluster: "mainnet-beta",
      configured: true,
      executionArmed: true,
      inputMint: SOL_MINT,
      outputMint: MAINNET_USDC,
      stake: 1_000_000n,
      wallet: user.publicKey.toBase58(),
      order: { ...orderBody(), transaction: "not-a-transaction", lastValidBlockHeight: 1 },
      now: 1_700_000_000_000,
    })).toThrow(/could not be read/);
  });

  it("rejects an unexplained program and accepts a lookup-table swap only after the mints are resolved", () => {
    const user = Keypair.generate();
    const destination = getAssociatedTokenAddressSync(new PublicKey(MAINNET_USDC), user.publicKey, true);
    const unknown = new Transaction().add(
      {
        programId: new PublicKey("DF1ow4tspfHX9JwWJsAb9epbkA8hmpSEAtxXy1V27QBH"),
        keys: [
          { pubkey: user.publicKey, isSigner: true, isWritable: true },
          { pubkey: new PublicKey(SOL_MINT), isSigner: false, isWritable: false },
          { pubkey: new PublicKey(MAINNET_USDC), isSigner: false, isWritable: false },
          { pubkey: destination, isSigner: false, isWritable: true },
        ],
        data: Buffer.alloc(0),
      },
      {
        programId: Keypair.generate().publicKey,
        keys: [],
        data: Buffer.alloc(0),
      },
    );
    unknown.feePayer = user.publicKey;
    unknown.recentBlockhash = "11111111111111111111111111111111";
    const encoded = unknown.serialize({ requireAllSignatures: false, verifySignatures: false }).toString("base64");
    expect(() => inspectSwapTransaction(encoded, user.publicKey.toBase58(), SOL_MINT, MAINNET_USDC)).toThrow(/unexplained program/);

    const lookup = new AddressLookupTableAccount({
      key: Keypair.generate().publicKey,
      state: {
        deactivationSlot: 9_999_999_999n,
        lastExtendedSlot: 0,
        lastExtendedSlotStartIndex: 0,
        authority: user.publicKey,
        addresses: [new PublicKey(SOL_MINT), new PublicKey(MAINNET_USDC)],
      },
    });
    const message = new TransactionMessage({
      payerKey: user.publicKey,
      recentBlockhash: "11111111111111111111111111111111",
      instructions: [{
        programId: new PublicKey("DF1ow4tspfHX9JwWJsAb9epbkA8hmpSEAtxXy1V27QBH"),
        keys: [
          { pubkey: user.publicKey, isSigner: true, isWritable: true },
          { pubkey: new PublicKey(SOL_MINT), isSigner: false, isWritable: false },
          { pubkey: new PublicKey(MAINNET_USDC), isSigner: false, isWritable: false },
        ],
        data: Buffer.alloc(0),
      }],
    }).compileToV0Message([lookup]);
    const versioned = Buffer.from(new VersionedTransaction(message).serialize()).toString("base64");
    expect(() => inspectSwapTransaction(versioned, user.publicKey.toBase58(), SOL_MINT, MAINNET_USDC)).toThrow(/unresolved lookup table/);
    const outputAccount = getAssociatedTokenAddressSync(new PublicKey(MAINNET_USDC), user.publicKey, true).toBase58();
    expect(() => inspectSwapTransaction(versioned, user.publicKey.toBase58(), SOL_MINT, MAINNET_USDC, [SOL_MINT, MAINNET_USDC])).toThrow(/settlement account/);
    const inspected = inspectSwapTransaction(versioned, user.publicKey.toBase58(), SOL_MINT, MAINNET_USDC, [SOL_MINT, MAINNET_USDC, outputAccount]);
    expect(inspected.programs).toContain("DF1ow4tspfHX9JwWJsAb9epbkA8hmpSEAtxXy1V27QBH");
    expect(inspected.version).toBe("v0");
    expect(inspected.signers).toContain(user.publicKey.toBase58());
    expect(inspected.writable).toContain(user.publicKey.toBase58());
    expect(() => assertUnmodifiedSwap(versioned, `${versioned}x`)).toThrow(/modified/);
  });
});

function orderBody() {
  return {
    inputMint: SOL_MINT,
    outputMint: MAINNET_USDC,
    inAmount: "10000000",
    outAmount: "1200000",
    minOutAmount: "1100000",
    slippageBps: 50,
    priceImpactPct: "0.1",
    executionMode: "sync",
  };
}

function swapFor(user: PublicKey) {
  const destination = getAssociatedTokenAddressSync(new PublicKey(MAINNET_USDC), user, true);
  const tx = new Transaction().add({
    programId: new PublicKey("DF1ow4tspfHX9JwWJsAb9epbkA8hmpSEAtxXy1V27QBH"),
    keys: [
      { pubkey: user, isSigner: true, isWritable: true },
      { pubkey: new PublicKey(SOL_MINT), isSigner: false, isWritable: false },
      { pubkey: new PublicKey(MAINNET_USDC), isSigner: false, isWritable: false },
      { pubkey: destination, isSigner: false, isWritable: true },
    ],
    data: Buffer.alloc(0),
  });
  tx.feePayer = user;
  tx.recentBlockhash = "11111111111111111111111111111111";
  return tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString("base64");
}
