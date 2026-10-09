import { describe, expect, it } from "vitest";
import {
  activationRequirements,
  admitsCompetitionEntrant,
  applyNormalizedEvent,
  browserReturnNeverProvesPayment,
  cardFundingCapabilities,
  cardFundingStatusLabel,
  createCardFundingIntent,
  disabledProductionAdapter,
  localTestAdapter,
  markDepositApproval,
  markDepositFailed,
  markDepositSubmitted,
  markDepositUnknown,
  noteEscrowAdmission,
  observeAssetDelivery,
  selectCardFundingAdapter,
} from "./cardFunding";
import { applyEventToStoredIntent, ensureCardFundingTables, memoryCardFundingDb, saveIntent } from "./cardFundingPersist";

const wallet = "JCVsKd4TMg1fvEs7rjf5YgLYbJfNC8Dwb4x1PchFkGM7";
const other = "5Yj8tfWFSucMUyYZVdCRNFSw1QF3C1MbG7dbo8vFkkar";
const mint = "BtdrgokAvXQE4yj3zS48c4ktnMSy3TGoRkHCWD5fV8U4";
const now = 1_700_000_000_000;

function intent(overrides: Partial<Parameters<typeof createCardFundingIntent>[0]> = {}) {
  return createCardFundingIntent({
    existing: null,
    sessionActor: "actor-1",
    destinationWallet: wallet,
    roomCode: "ROOM0001",
    cluster: "localnet",
    assetMint: mint,
    assetDecimals: 6,
    expectedBaseUnits: 1_000_000n,
    providerId: "local-test",
    providerEnvironment: "local-test",
    registrationDeadlineAt: now + 60_000,
    quoteFiatMinor: "100",
    nowMs: now,
    ...overrides,
  });
}

describe("card funding foundations", () => {
  it("reports unavailable capabilities and keeps external execution off", () => {
    const caps = cardFundingCapabilities("devnet");
    expect(caps.available).toBe(false);
    expect(caps.externalExecution).toBe(false);
    expect(caps.publicWagering).toBe(false);
    expect(caps.reason).toMatch(/unavailable/i);
    expect(caps.blockers.length).toBeGreaterThan(2);
    expect(activationRequirements().join(" ")).toMatch(/written approval/i);
  });

  it("keeps production adapter disabled even when credentials exist in the environment shape", () => {
    const adapter = disabledProductionAdapter();
    const opened = adapter.createCheckout({
      existing: null,
      sessionActor: null,
      destinationWallet: wallet,
      roomCode: "ROOM0001",
      cluster: "devnet",
      assetMint: mint,
      assetDecimals: 6,
      expectedBaseUnits: 1_000_000n,
      registrationDeadlineAt: now + 60_000,
      nowMs: now,
    });
    expect(opened.ok).toBe(false);
    if (opened.ok) throw new Error("expected disabled");
    expect(opened.error).toMatch(/unavailable/i);
    expect(opened.intent?.payment).toBe("unavailable");
    expect(opened.intent?.externalExecutionEnabled).toBe(false);
    expect(adapter.normalizeEvent({ id: "x" }).ok).toBe(false);
    expect(selectCardFundingAdapter(undefined).id).toBe("disabled-production");
  });

  it("dedupes checkout creation by idempotency key", () => {
    const first = intent();
    const second = intent({ existing: first });
    expect(second.intentId).toBe(first.intentId);
    expect(second.quoteFiatMinor).toBe("100");
    expect(second.expectedBaseUnits).toBe("1000000");
  });

  it("never treats browser return or provider payment as admission", () => {
    const opened = localTestAdapter().createCheckout({
      existing: null,
      sessionActor: "actor-1",
      destinationWallet: wallet,
      roomCode: "ROOM0001",
      cluster: "localnet",
      assetMint: mint,
      assetDecimals: 6,
      expectedBaseUnits: 1_000_000n,
      registrationDeadlineAt: now + 60_000,
      nowMs: now,
    });
    expect(opened.ok).toBe(true);
    if (!opened.ok) throw new Error(opened.error);
    expect(browserReturnNeverProvesPayment(opened.intent).paid).toBe(false);
    const paid = applyNormalizedEvent(opened.intent, {
      id: "evt-pay",
      kind: "provider-confirmed",
      orderId: opened.intent.providerOrderId,
      observedAt: now + 1,
    });
    expect(paid.intent.payment).toBe("provider-confirmed");
    expect(paid.intent.delivery).toBe("pending");
    expect(admitsCompetitionEntrant(paid.intent)).toBe(false);
    expect(cardFundingStatusLabel(paid.intent)).toMatch(/delivery pending/i);
  });

  it("handles duplicate, out-of-order, and mismatched order events", () => {
    let state = intent();
    state = applyNormalizedEvent(state, { id: "1", kind: "processing", orderId: "o1", observedAt: now }).intent;
    const dup = applyNormalizedEvent(state, { id: "1", kind: "provider-confirmed", orderId: "o1", observedAt: now + 1 });
    expect(dup.duplicate).toBe(true);
    state = applyNormalizedEvent(state, { id: "2", kind: "provider-confirmed", orderId: "o1", observedAt: now + 2 }).intent;
    const mismatch = applyNormalizedEvent(state, { id: "3", kind: "provider-confirmed", orderId: "other", observedAt: now + 3 });
    expect(mismatch.intent.payment).toBe("refund-review");
    expect(admitsCompetitionEntrant(mismatch.intent)).toBe(false);
  });

  it("separates delivery failures and late delivery after registration closes", () => {
    let state = applyNormalizedEvent(intent(), { id: "p", kind: "provider-confirmed", orderId: "o1", observedAt: now }).intent;
    expect(observeAssetDelivery(state, {
      wallet: other, mint, network: "solana-localnet", amountBaseUnits: 1_000_000n, signature: "sig-w",
    }, now + 1).delivery).toBe("wrong-wallet");
    expect(observeAssetDelivery(state, {
      wallet, mint, network: "other", amountBaseUnits: 1_000_000n, signature: "sig-n",
    }, now + 1).delivery).toBe("wrong-network");
    expect(observeAssetDelivery(state, {
      wallet, mint: "So11111111111111111111111111111111111111112", network: "solana-localnet", amountBaseUnits: 1_000_000n, signature: "sig-a",
    }, now + 1).delivery).toBe("wrong-asset");
    expect(observeAssetDelivery(state, {
      wallet, mint, network: "solana-localnet", amountBaseUnits: 999_999n, signature: "sig-s",
    }, now + 1).delivery).toBe("insufficient-amount");
    const late = observeAssetDelivery(state, {
      wallet, mint, network: "solana-localnet", amountBaseUnits: 1_000_000n, signature: "sig-ok",
    }, now + 120_000);
    expect(late.delivery).toBe("received");
    expect(late.escrow).toBe("registration-closed");
    expect(cardFundingStatusLabel(late)).toMatch(/registration closed/i);
    expect(admitsCompetitionEntrant(late)).toBe(false);
  });

  it("requires separate deposit approval and only finalizes after vault coverage", () => {
    let state = applyNormalizedEvent(intent(), { id: "p", kind: "provider-confirmed", orderId: "o1", observedAt: now }).intent;
    state = observeAssetDelivery(state, {
      wallet, mint, network: "solana-localnet", amountBaseUnits: 1_000_000n, signature: "delivery",
    }, now + 1);
    state = markDepositApproval(state, now + 2);
    expect(state.escrow).toBe("approval-needed");
    state = markDepositSubmitted(state, "deposit-sig", now + 3);
    expect(state.escrow).toBe("pending");
    expect(noteEscrowAdmission(state, false, now + 4).escrow).toBe("approval-needed");
    const funded = noteEscrowAdmission(state, true, now + 5);
    expect(funded.escrow).toBe("entry-finalized");
    expect(admitsCompetitionEntrant(funded)).toBe(true);
    expect(markDepositFailed(state, "insufficient-gas", now + 6).escrow).toBe("insufficient-gas");
    expect(markDepositUnknown(state, now + 7).escrow).toBe("unknown");
  });

  it("persists intents idempotently and rejects provider events that would finalize entry", async () => {
    const { db } = memoryCardFundingDb();
    await ensureCardFundingTables(db);
    const created = intent();
    const first = await saveIntent(db, created);
    const second = await saveIntent(db, created);
    expect(first.saved).toBe(true);
    expect(second.saved).toBe(false);
    expect(second.intent.intentId).toBe(created.intentId);
    const event = { id: "evt-1", kind: "provider-confirmed" as const, orderId: "o1", observedAt: now + 1 };
    const applied = await applyEventToStoredIntent(db, "local-test", created.intentId, event, "hash-1");
    expect(applied.ok).toBe(true);
    if (!applied.ok) throw new Error(applied.error);
    expect(applied.intent.payment).toBe("provider-confirmed");
    const replay = await applyEventToStoredIntent(db, "local-test", created.intentId, event, "hash-1");
    expect(replay.ok).toBe(true);
    if (!replay.ok) throw new Error(replay.error);
    expect(replay.duplicate).toBe(true);
  });

  it("keeps mock funding from admitting a real entrant without vault coverage", () => {
    const adapter = localTestAdapter();
    const opened = adapter.createCheckout({
      existing: null,
      sessionActor: "actor",
      destinationWallet: wallet,
      roomCode: "LIVEROOM1",
      cluster: "localnet",
      assetMint: mint,
      assetDecimals: 6,
      expectedBaseUnits: 1_000_000n,
      registrationDeadlineAt: now + 60_000,
      nowMs: now,
    });
    expect(opened.ok).toBe(true);
    if (!opened.ok) throw new Error(opened.error);
    const normalized = adapter.normalizeEvent({ id: "m1", kind: "provider-confirmed", orderId: "local-order" });
    expect(normalized.ok).toBe(true);
    if (!normalized.ok) throw new Error(normalized.error);
    const paid = applyNormalizedEvent(opened.intent, normalized.event).intent;
    expect(adapter.status(paid).admitsEntrant).toBe(false);
    expect(admitsCompetitionEntrant(paid)).toBe(false);
  });
});
