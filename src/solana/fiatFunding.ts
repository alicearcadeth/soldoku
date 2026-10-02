/** Card funding, on-chain delivery, and escrow deposit stay separate records. */

export type FiatStatus =
  | "session-created"
  | "payment-processing"
  | "payment-cancelled"
  | "payment-declined"
  | "kyc-required"
  | "session-expired"
  | "delivery-pending"
  | "wrong-asset"
  | "wrong-amount"
  | "wallet-changed"
  | "usdc-received"
  | "deposit-approval-needed"
  | "escrow-confirming"
  | "match-funded";

export type FiatRecord = {
  sessionId: string;
  idempotencyKey: string;
  provider: string;
  providerOrderId: string | null;
  deliverySignature: string | null;
  swapSignature: string | null;
  depositSignature: string | null;
  matchId: string;
  wallet: string;
  assetMint: string;
  expectedAtomic: string;
  receivedAtomic: string | null;
  status: FiatStatus;
  seenEvents: string[];
};

export type ProviderEvent = {
  id: string;
  kind: "processing" | "cancelled" | "declined" | "kyc" | "expired" | "provider-completed";
  orderId: string | null;
};

const OPEN = new Set<FiatStatus>(["session-created", "payment-processing", "kyc-required", "delivery-pending"]);

export function createFiatSession(input: {
  existing: FiatRecord | null;
  provider: string;
  matchId: string;
  wallet: string;
  assetMint: string;
  expectedAtomic: bigint;
}): FiatRecord {
  if (input.expectedAtomic <= 0n) throw new Error("The stake amount is empty");
  if (!input.wallet) throw new Error("Connect a wallet before adding funds");
  const idempotencyKey = `${input.provider}:${input.matchId}:${input.wallet}:${input.expectedAtomic}`;
  if (input.existing && input.existing.idempotencyKey === idempotencyKey && input.existing.status !== "payment-cancelled" && input.existing.status !== "payment-declined") {
    return input.existing;
  }
  return {
    sessionId: `fiat-${idempotencyKey}`,
    idempotencyKey,
    provider: input.provider,
    providerOrderId: null,
    deliverySignature: null,
    swapSignature: null,
    depositSignature: null,
    matchId: input.matchId,
    wallet: input.wallet,
    assetMint: input.assetMint,
    expectedAtomic: input.expectedAtomic.toString(),
    receivedAtomic: null,
    status: "session-created",
    seenEvents: [],
  };
}

/** A provider callback never means the match escrow holds the stake. */
export function applyProviderEvent(state: FiatRecord, event: ProviderEvent): { state: FiatRecord; duplicate: boolean } {
  if (state.seenEvents.includes(event.id)) return { state, duplicate: true };
  const seenEvents = [...state.seenEvents, event.id];
  const providerOrderId = event.orderId ?? state.providerOrderId;
  if (state.status === "match-funded" || state.status === "usdc-received" || state.status === "deposit-approval-needed" || state.status === "escrow-confirming") {
    return { state: { ...state, seenEvents, providerOrderId }, duplicate: false };
  }
  const status: FiatStatus = event.kind === "cancelled"
    ? "payment-cancelled"
    : event.kind === "declined"
      ? "payment-declined"
      : event.kind === "kyc"
        ? "kyc-required"
        : event.kind === "expired"
          ? "session-expired"
          : event.kind === "provider-completed"
            ? "delivery-pending"
            : "payment-processing";
  return { state: { ...state, status, seenEvents, providerOrderId }, duplicate: false };
}

export function noteChainDelivery(state: FiatRecord, delivery: { wallet: string; mint: string; amount: bigint; signature: string }): FiatRecord {
  if (!delivery.signature) throw new Error("The delivery has no transaction");
  if (state.status === "wallet-changed") return state;
  if (delivery.wallet !== state.wallet) return { ...state, status: "wallet-changed" };
  if (delivery.mint !== state.assetMint) {
    return { ...state, status: "wrong-asset", deliverySignature: delivery.signature };
  }
  if (delivery.amount < BigInt(state.expectedAtomic)) {
    return { ...state, status: "wrong-amount", deliverySignature: delivery.signature, receivedAtomic: delivery.amount.toString() };
  }
  return {
    ...state,
    status: "usdc-received",
    deliverySignature: delivery.signature,
    receivedAtomic: delivery.amount.toString(),
  };
}

export function noteWalletChange(state: FiatRecord, nextWallet: string): FiatRecord {
  if (!nextWallet || nextWallet === state.wallet) return state;
  if (state.status === "match-funded") return state;
  return { ...state, status: "wallet-changed" };
}

export function requestDepositApproval(state: FiatRecord): FiatRecord {
  if (state.status !== "usdc-received") throw new Error("USDC is not in the wallet yet");
  return { ...state, status: "deposit-approval-needed" };
}

export function approveFiatDeposit(state: FiatRecord, signature: string): FiatRecord {
  if (state.status !== "deposit-approval-needed") throw new Error("Deposit approval is not ready");
  if (!signature) throw new Error("The deposit needs a signature");
  return { ...state, status: "escrow-confirming", depositSignature: signature };
}

/** Vault coverage is the only transition into a funded match. */
export function noteEscrowVault(state: FiatRecord, vaultCoversStake: boolean): FiatRecord {
  if (state.status !== "escrow-confirming") throw new Error("The deposit is not in escrow yet");
  if (!vaultCoversStake) return { ...state, status: "deposit-approval-needed" };
  return { ...state, status: "match-funded" };
}

export function fiatSnapshot(state: FiatRecord): string {
  return JSON.stringify(state);
}

export function fiatRestore(raw: string): FiatRecord {
  const parsed = JSON.parse(raw) as FiatRecord;
  if (!parsed || parsed.status === undefined || !parsed.sessionId || !parsed.wallet) throw new Error("The funding record is not usable");
  return parsed;
}

export function fiatStatusLabel(status: FiatStatus): string {
  switch (status) {
    case "session-created":
    case "payment-processing":
    case "kyc-required":
      return "Payment processing";
    case "payment-cancelled":
      return "Payment cancelled";
    case "payment-declined":
      return "Payment declined";
    case "session-expired":
      return "Payment session expired";
    case "delivery-pending":
      return "USDC delivery pending";
    case "wrong-asset":
      return "Wrong asset received";
    case "wrong-amount":
      return "Amount does not cover the stake";
    case "wallet-changed":
      return "Wallet changed";
    case "usdc-received":
      return "USDC received";
    case "deposit-approval-needed":
      return "Deposit approval needed";
    case "escrow-confirming":
      return "Escrow deposit confirming";
    case "match-funded":
      return "Match funded";
    default:
      return "Payment processing";
  }
}

export function canResumeDeposit(state: FiatRecord): boolean {
  return state.status === "usdc-received" || state.status === "deposit-approval-needed";
}

export function sessionIsOpen(state: FiatRecord): boolean {
  return OPEN.has(state.status) || state.status === "session-created";
}
