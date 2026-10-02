import { describe, expect, it } from "vitest";
import {
  applyProviderEvent,
  approveFiatDeposit,
  canResumeDeposit,
  createFiatSession,
  fiatRestore,
  fiatSnapshot,
  fiatStatusLabel,
  noteChainDelivery,
  noteEscrowVault,
  noteWalletChange,
  requestDepositApproval,
} from "./fiatFunding";
import { MAINNET_USDC } from "./dflow";

const wallet = "JCVsKd4TMg1fvEs7rjf5YgLYbJfNC8Dwb4x1PchFkGM7";
const other = "5Yj8tfWFSucMUyYZVdCRNFSw1QF3C1MbG7dbo8vFkkar";
const stake = 5_000_000n;

function session() {
  return createFiatSession({ existing: null, provider: "moonpay", matchId: "ROOM", wallet, assetMint: MAINNET_USDC, expectedAtomic: stake });
}

describe("fiat funding records", () => {
  it("keeps one session when the same wallet asks twice", () => {
    const first = session();
    const second = createFiatSession({ existing: first, provider: "moonpay", matchId: "ROOM", wallet, assetMint: MAINNET_USDC, expectedAtomic: stake });
    expect(second.sessionId).toBe(first.sessionId);
    expect(second.status).not.toBe("match-funded");
  });

  it("does not treat a completed card payment as a funded match", () => {
    const paid = applyProviderEvent(session(), { id: "evt-1", kind: "provider-completed", orderId: "order-1" });
    expect(paid.duplicate).toBe(false);
    expect(paid.state.status).toBe("delivery-pending");
    expect(fiatStatusLabel(paid.state.status)).toBe("USDC delivery pending");
    expect(fiatStatusLabel(paid.state.status)).not.toMatch(/stake paid/i);
    const replay = applyProviderEvent(paid.state, { id: "evt-1", kind: "provider-completed", orderId: "order-1" });
    expect(replay.duplicate).toBe(true);
    expect(replay.state).toEqual(paid.state);
  });

  it("records decline, cancel, KYC, and expiry without a deposit", () => {
    expect(applyProviderEvent(session(), { id: "c", kind: "cancelled", orderId: null }).state.status).toBe("payment-cancelled");
    expect(applyProviderEvent(session(), { id: "d", kind: "declined", orderId: null }).state.status).toBe("payment-declined");
    expect(applyProviderEvent(session(), { id: "k", kind: "kyc", orderId: null }).state.status).toBe("kyc-required");
    expect(applyProviderEvent(session(), { id: "e", kind: "expired", orderId: null }).state.status).toBe("session-expired");
  });

  it("accepts a late delivery after expiry only as wallet USDC", () => {
    const expired = applyProviderEvent(session(), { id: "e", kind: "expired", orderId: null }).state;
    const arrived = noteChainDelivery(expired, { wallet, mint: MAINNET_USDC, amount: stake, signature: "delivery-sig" });
    expect(arrived.status).toBe("usdc-received");
    expect(arrived.deliverySignature).toBe("delivery-sig");
    expect(arrived.depositSignature).toBeNull();
    expect(fiatRestore(fiatSnapshot(arrived))).toEqual(arrived);
  });

  it("rejects the wrong asset, a short amount, and a wallet change", () => {
    const start = session();
    expect(noteChainDelivery(start, { wallet, mint: "So11111111111111111111111111111111111111112", amount: stake, signature: "sig" }).status).toBe("wrong-asset");
    expect(noteChainDelivery(start, { wallet, mint: MAINNET_USDC, amount: stake - 1n, signature: "sig" }).status).toBe("wrong-amount");
    const changed = noteWalletChange(start, other);
    expect(changed.status).toBe("wallet-changed");
    expect(noteChainDelivery(changed, { wallet, mint: MAINNET_USDC, amount: stake, signature: "sig" }).status).toBe("wallet-changed");
  });

  it("funds the match only after a separate approved deposit reaches the vault", () => {
    const received = noteChainDelivery(session(), { wallet, mint: MAINNET_USDC, amount: stake, signature: "delivery-sig" });
    expect(canResumeDeposit(received)).toBe(true);
    const ready = requestDepositApproval(received);
    expect(fiatStatusLabel(ready.status)).toBe("Deposit approval needed");
    const confirming = approveFiatDeposit(ready, "deposit-sig");
    expect(fiatStatusLabel(confirming.status)).toBe("Escrow deposit confirming");
    expect(noteEscrowVault(confirming, false).status).toBe("deposit-approval-needed");
    expect(noteEscrowVault(confirming, true)).toMatchObject({
      status: "match-funded",
      deliverySignature: "delivery-sig",
      depositSignature: "deposit-sig",
      providerOrderId: null,
    });
    expect(fiatStatusLabel("match-funded")).toBe("Match funded");
  });
});
