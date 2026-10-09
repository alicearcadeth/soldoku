/**
 * Provider-neutral card → asset → escrow foundations.
 * External execution stays disabled. A provider callback never admits a competition entrant.
 * Inspired by Artportal's payment≠delivery≠escrow separation; no NFT/shipping/certificate import.
 */

import {
  applyProviderEvent,
  approveFiatDeposit,
  createFiatSession,
  noteChainDelivery,
  noteEscrowVault,
  noteWalletChange,
  requestDepositApproval,
  type FiatRecord,
  type ProviderEvent,
} from "./fiatFunding";
import { PUBLIC_FIAT_WAGERING } from "./providerPolicy";

export type PaymentLane =
  | "unavailable"
  | "preparing"
  | "awaiting-provider"
  | "verification-required"
  | "processing"
  | "pending-unknown"
  | "declined"
  | "cancelled"
  | "expired"
  | "provider-confirmed"
  | "refund-review";

export type DeliveryLane =
  | "not-started"
  | "pending"
  | "failed"
  | "wrong-wallet"
  | "wrong-network"
  | "wrong-asset"
  | "insufficient-amount"
  | "received";

export type EscrowLane =
  | "not-started"
  | "approval-needed"
  | "pending"
  | "unknown"
  | "failed"
  | "insufficient-gas"
  | "competition-unavailable"
  | "registration-closed"
  | "entry-finalized";

export type CardFundingIntent = {
  intentId: string;
  idempotencyKey: string;
  sessionActor: string | null;
  destinationWallet: string;
  roomCode: string;
  cluster: "devnet" | "localnet";
  assetMint: string;
  assetDecimals: number;
  expectedBaseUnits: string;
  quoteFiatMinor: string | null;
  quoteCurrency: "usd" | null;
  feeFiatMinor: string | null;
  minimumOutputBaseUnits: string | null;
  providerId: string;
  providerEnvironment: "off" | "sandbox" | "production" | "local-test";
  providerOrderId: string | null;
  quoteExpiresAt: number | null;
  registrationDeadlineAt: number | null;
  payment: PaymentLane;
  delivery: DeliveryLane;
  escrow: EscrowLane;
  paymentTxId: string | null;
  deliverySignature: string | null;
  escrowSignature: string | null;
  receivedBaseUnits: string | null;
  processedEventIds: string[];
  externalExecutionEnabled: false;
  createdAt: number;
  updatedAt: number;
  /** Nested fiat record keeps compatibility with the existing payment event helpers. */
  fiat: FiatRecord;
};

export type CardFundingCapabilities = {
  available: false;
  publicWagering: false;
  externalExecution: false;
  reason: string;
  blockers: string[];
  destinationMint: string | null;
  cluster: "devnet" | "localnet";
  providers: Array<{
    id: string;
    ready: false;
    role: "hosted-onramp" | "merchant-card" | "provider-wallet" | "nft-checkout" | "swap" | "escrow-deposit";
    blocker: string;
  }>;
};

export type NormalizedFundingEvent = {
  id: string;
  orderId: string | null;
  kind:
    | "processing"
    | "verification-required"
    | "cancelled"
    | "declined"
    | "expired"
    | "provider-confirmed"
    | "refund-review"
    | "delivery-observed";
  observedAt: number;
};

export type AssetDeliveryObservation = {
  wallet: string;
  mint: string;
  network: "solana-devnet" | "solana-localnet" | "other";
  amountBaseUnits: bigint;
  signature: string;
};

export type CardFundingAdapter = {
  id: string;
  capabilities(): CardFundingCapabilities;
  createCheckout(input: {
    existing: CardFundingIntent | null;
    sessionActor: string | null;
    destinationWallet: string;
    roomCode: string;
    cluster: "devnet" | "localnet";
    assetMint: string;
    assetDecimals: number;
    expectedBaseUnits: bigint;
    registrationDeadlineAt: number | null;
    nowMs: number;
  }): { ok: true; intent: CardFundingIntent; hostedUrl: string | null } | { ok: false; error: string; intent?: CardFundingIntent };
  status(intent: CardFundingIntent): { payment: PaymentLane; delivery: DeliveryLane; escrow: EscrowLane; admitsEntrant: false };
  normalizeEvent(raw: unknown): { ok: true; event: NormalizedFundingEvent } | { ok: false; error: string };
};

const OPEN_PAYMENT = new Set<PaymentLane>(["preparing", "awaiting-provider", "verification-required", "processing", "pending-unknown"]);
/** Intent body keeps a bounded recent window; durable dedupe is `(provider, event_id)` in D1. */
const MAX_PROCESSED_EVENT_IDS = 64;

function rememberEventIds(existing: string[], eventId: string): string[] {
  const next = existing.includes(eventId) ? existing : [...existing, eventId];
  return next.length > MAX_PROCESSED_EVENT_IDS ? next.slice(next.length - MAX_PROCESSED_EVENT_IDS) : next;
}

export function cardFundingCapabilities(cluster: "devnet" | "localnet" = "devnet"): CardFundingCapabilities {
  return {
    available: false,
    publicWagering: PUBLIC_FIAT_WAGERING,
    externalExecution: false,
    reason: "Card funding unavailable. Competition entry still requires a wallet-signed escrow deposit.",
    blockers: [
      "No suitable provider has approved Soldoku competition use",
      "External checkout execution is disabled by construction",
      "Credentials alone cannot enable card execution",
      "Hosted provider UI and network allowlists are not activated",
    ],
    destinationMint: null,
    cluster,
    providers: [
      { id: "disabled-production", ready: false, role: "hosted-onramp", blocker: "Production adapter refuses all checkout creation" },
      { id: "local-test", ready: false, role: "hosted-onramp", blocker: "Local adapter is test-only and cannot admit real entrants" },
      { id: "moonpay", ready: false, role: "hosted-onramp", blocker: "Sandbox/live on-ramp not authorized for competition admission" },
      { id: "coinbase", ready: false, role: "hosted-onramp", blocker: "Not configured; skill-game use needs written approval" },
      { id: "crossmint-nft", ready: false, role: "nft-checkout", blocker: "NFT/certificate checkout is not used for fungible competition stakes" },
      { id: "competition-escrow", ready: false, role: "escrow-deposit", blocker: "Escrow deposit remains the separate admission path" },
    ],
  };
}

export function createCardFundingIntent(input: {
  existing: CardFundingIntent | null;
  sessionActor: string | null;
  destinationWallet: string;
  roomCode: string;
  cluster: "devnet" | "localnet";
  assetMint: string;
  assetDecimals: number;
  expectedBaseUnits: bigint;
  providerId: string;
  providerEnvironment: CardFundingIntent["providerEnvironment"];
  registrationDeadlineAt: number | null;
  quoteFiatMinor?: string | null;
  nowMs: number;
}): CardFundingIntent {
  if (input.expectedBaseUnits <= 0n) throw new Error("The stake amount is empty");
  if (!input.destinationWallet) throw new Error("Connect a wallet before adding funds");
  if (!input.roomCode) throw new Error("A room is required before card funding can prepare");
  const idempotencyKey = [
    input.providerId,
    input.cluster,
    input.roomCode,
    input.destinationWallet,
    input.assetMint,
    input.expectedBaseUnits.toString(),
  ].join(":");
  if (input.existing && input.existing.idempotencyKey === idempotencyKey && OPEN_PAYMENT.has(input.existing.payment)) {
    return input.existing;
  }
  const fiat = createFiatSession({
    existing: input.existing?.fiat ?? null,
    provider: input.providerId,
    matchId: input.roomCode,
    wallet: input.destinationWallet,
    assetMint: input.assetMint,
    expectedAtomic: input.expectedBaseUnits,
  });
  return {
    intentId: `card-${idempotencyKey}`,
    idempotencyKey,
    sessionActor: input.sessionActor,
    destinationWallet: input.destinationWallet,
    roomCode: input.roomCode,
    cluster: input.cluster,
    assetMint: input.assetMint,
    assetDecimals: input.assetDecimals,
    expectedBaseUnits: input.expectedBaseUnits.toString(),
    quoteFiatMinor: input.quoteFiatMinor ?? null,
    quoteCurrency: input.quoteFiatMinor ? "usd" : null,
    feeFiatMinor: null,
    minimumOutputBaseUnits: input.expectedBaseUnits.toString(),
    providerId: input.providerId,
    providerEnvironment: input.providerEnvironment,
    providerOrderId: null,
    quoteExpiresAt: input.nowMs + 30 * 60 * 1000,
    registrationDeadlineAt: input.registrationDeadlineAt,
    payment: input.providerEnvironment === "off" ? "unavailable" : "preparing",
    delivery: "not-started",
    escrow: "not-started",
    paymentTxId: null,
    deliverySignature: null,
    escrowSignature: null,
    receivedBaseUnits: null,
    processedEventIds: [],
    externalExecutionEnabled: false,
    createdAt: input.nowMs,
    updatedAt: input.nowMs,
    fiat,
  };
}

function touch(intent: CardFundingIntent, nowMs: number, patch: Partial<CardFundingIntent>): CardFundingIntent {
  return { ...intent, ...patch, updatedAt: nowMs, externalExecutionEnabled: false };
}

export function applyNormalizedEvent(intent: CardFundingIntent, event: NormalizedFundingEvent): {
  intent: CardFundingIntent;
  duplicate: boolean;
} {
  if (intent.processedEventIds.includes(event.id)) return { intent, duplicate: true };
  if (intent.escrow === "entry-finalized") {
    return { intent: touch(intent, event.observedAt, { processedEventIds: rememberEventIds(intent.processedEventIds, event.id) }), duplicate: false };
  }
  if (intent.providerOrderId && event.orderId && intent.providerOrderId !== event.orderId) {
    return {
      intent: touch(intent, event.observedAt, {
        payment: "refund-review",
        processedEventIds: rememberEventIds(intent.processedEventIds, event.id),
      }),
      duplicate: false,
    };
  }
  const quoteExpired = intent.quoteExpiresAt != null && event.observedAt >= intent.quoteExpiresAt
    && (event.kind === "provider-confirmed" || event.kind === "processing" || event.kind === "verification-required");
  if (quoteExpired && intent.payment !== "provider-confirmed" && intent.delivery === "not-started") {
    return {
      intent: touch(intent, event.observedAt, {
        payment: event.kind === "provider-confirmed" ? "refund-review" : "expired",
        processedEventIds: rememberEventIds(intent.processedEventIds, event.id),
        providerOrderId: event.orderId ?? intent.providerOrderId,
      }),
      duplicate: false,
    };
  }
  const mapped: ProviderEvent = {
    id: event.id,
    orderId: event.orderId,
    kind:
      event.kind === "provider-confirmed" ? "provider-completed"
        : event.kind === "verification-required" ? "kyc"
          : event.kind === "refund-review" ? "processing"
            : event.kind === "delivery-observed" ? "processing"
              : event.kind,
  };
  const fiatNext = applyProviderEvent(intent.fiat, mapped);
  let payment: PaymentLane = intent.payment;
  if (event.kind === "processing") payment = "processing";
  if (event.kind === "verification-required") payment = "verification-required";
  if (event.kind === "cancelled") payment = "cancelled";
  if (event.kind === "declined") payment = "declined";
  if (event.kind === "expired") payment = "expired";
  if (event.kind === "provider-confirmed") payment = "provider-confirmed";
  if (event.kind === "refund-review") payment = "refund-review";
  return {
    intent: touch(intent, event.observedAt, {
      fiat: fiatNext.state,
      payment,
      providerOrderId: event.orderId ?? intent.providerOrderId,
      paymentTxId: event.orderId ?? intent.paymentTxId,
      delivery: payment === "provider-confirmed" && intent.delivery === "not-started" ? "pending" : intent.delivery,
      processedEventIds: rememberEventIds(intent.processedEventIds, event.id),
    }),
    duplicate: false,
  };
}

/** Lost provider response: keep recovery without inventing success or opening a second charge. */
export function markPaymentUnknown(intent: CardFundingIntent, nowMs: number): CardFundingIntent {
  if (intent.payment === "provider-confirmed" || intent.payment === "declined" || intent.payment === "cancelled" || intent.payment === "expired" || intent.payment === "unavailable") {
    return intent;
  }
  return touch(intent, nowMs, { payment: "pending-unknown" });
}

export function markDeliveryFailed(intent: CardFundingIntent, nowMs: number): CardFundingIntent {
  if (intent.delivery === "received" || intent.escrow === "entry-finalized") return intent;
  return touch(intent, nowMs, { delivery: "failed" });
}

export function observeAssetDelivery(intent: CardFundingIntent, observation: AssetDeliveryObservation, nowMs: number): CardFundingIntent {
  if (intent.escrow === "entry-finalized") return intent;
  if (observation.wallet !== intent.destinationWallet) {
    return touch(intent, nowMs, { delivery: "wrong-wallet", fiat: noteWalletChange(intent.fiat, observation.wallet) });
  }
  const expectedNetwork = intent.cluster === "devnet" ? "solana-devnet" : "solana-localnet";
  if (observation.network !== expectedNetwork) {
    return touch(intent, nowMs, { delivery: "wrong-network" });
  }
  const fiat = noteChainDelivery(intent.fiat, {
    wallet: observation.wallet,
    mint: observation.mint,
    amount: observation.amountBaseUnits,
    signature: observation.signature,
  });
  if (fiat.status === "wrong-asset") return touch(intent, nowMs, { delivery: "wrong-asset", fiat, deliverySignature: observation.signature });
  if (fiat.status === "wrong-amount") {
    return touch(intent, nowMs, {
      delivery: "insufficient-amount",
      fiat,
      deliverySignature: observation.signature,
      receivedBaseUnits: observation.amountBaseUnits.toString(),
    });
  }
  let escrow: EscrowLane = "approval-needed";
  if (intent.registrationDeadlineAt != null && nowMs >= intent.registrationDeadlineAt) {
    escrow = "registration-closed";
  }
  return touch(intent, nowMs, {
    fiat,
    payment: intent.payment === "provider-confirmed" ? intent.payment : "provider-confirmed",
    delivery: "received",
    deliverySignature: observation.signature,
    receivedBaseUnits: observation.amountBaseUnits.toString(),
    escrow,
  });
}

export function markDepositApproval(intent: CardFundingIntent, nowMs: number): CardFundingIntent {
  if (intent.delivery !== "received") throw new Error("Asset delivery is not confirmed in the bound wallet");
  if (intent.escrow === "registration-closed") return intent;
  if (intent.escrow === "competition-unavailable") return intent;
  const fiat = intent.fiat.status === "usdc-received" ? requestDepositApproval(intent.fiat) : intent.fiat;
  return touch(intent, nowMs, { fiat, escrow: "approval-needed" });
}

export function markDepositSubmitted(intent: CardFundingIntent, signature: string, nowMs: number): CardFundingIntent {
  if (intent.escrow !== "approval-needed" && intent.escrow !== "failed" && intent.escrow !== "unknown") {
    throw new Error("Deposit approval is not ready");
  }
  if (!signature) throw new Error("The deposit needs a signature");
  const ready = intent.fiat.status === "usdc-received" ? requestDepositApproval(intent.fiat) : intent.fiat;
  const fiat = approveFiatDeposit(ready.status === "deposit-approval-needed" ? ready : requestDepositApproval(intent.fiat), signature);
  return touch(intent, nowMs, { fiat, escrow: "pending", escrowSignature: signature });
}

export function markDepositUnknown(intent: CardFundingIntent, nowMs: number): CardFundingIntent {
  return touch(intent, nowMs, { escrow: "unknown" });
}

export function markDepositFailed(intent: CardFundingIntent, reason: "failed" | "insufficient-gas" | "competition-unavailable" | "registration-closed", nowMs: number): CardFundingIntent {
  return touch(intent, nowMs, { escrow: reason === "failed" ? "failed" : reason });
}

/** Vault coverage is the only transition that finalizes competition entry from this lane. */
export function noteEscrowAdmission(intent: CardFundingIntent, vaultCoversStake: boolean, nowMs: number): CardFundingIntent {
  if (intent.escrow !== "pending" && intent.escrow !== "unknown") throw new Error("The deposit is not in escrow yet");
  const fiat = noteEscrowVault(intent.fiat, vaultCoversStake);
  if (!vaultCoversStake) return touch(intent, nowMs, { fiat, escrow: "approval-needed" });
  return touch(intent, nowMs, { fiat, escrow: "entry-finalized" });
}

export function admitsCompetitionEntrant(intent: CardFundingIntent): false | true {
  return intent.escrow === "entry-finalized" && intent.fiat.status === "match-funded";
}

export function cardFundingStatusLabel(intent: CardFundingIntent): string {
  if (intent.payment === "unavailable") return "Card funding unavailable";
  if (intent.escrow === "entry-finalized") return "Competition entry finalized in escrow";
  if (intent.escrow === "registration-closed") return "Asset may be in the wallet, but registration closed before deposit";
  if (intent.escrow === "competition-unavailable") return "Competition unavailable for deposit";
  if (intent.escrow === "insufficient-gas") return "Insufficient SOL for rent or fees";
  if (intent.escrow === "failed") return "Escrow deposit failed";
  if (intent.escrow === "unknown" || intent.escrow === "pending") return "Escrow deposit pending or unknown";
  if (intent.escrow === "approval-needed") return "Asset received. Separate deposit approval is still required";
  if (intent.delivery === "received") return "Asset received in the bound wallet. Competition not entered yet";
  if (intent.delivery === "failed") return "Asset delivery failed";
  if (intent.delivery === "wrong-wallet") return "Asset went to a different wallet";
  if (intent.delivery === "wrong-network") return "Asset arrived on the wrong network";
  if (intent.delivery === "wrong-asset") return "Wrong asset received";
  if (intent.delivery === "insufficient-amount") return "Delivered amount does not cover the stake";
  if (intent.delivery === "pending") return "Provider payment confirmed. Asset delivery pending";
  if (intent.payment === "refund-review") return "Provider refund or review required. This is not an escrow refund";
  if (intent.payment === "declined") return "Card payment declined";
  if (intent.payment === "cancelled") return "Card payment cancelled";
  if (intent.payment === "expired") return "Quote or payment session expired";
  if (intent.payment === "verification-required") return "Provider verification required";
  if (intent.payment === "provider-confirmed") return "Provider payment confirmed";
  if (intent.payment === "processing" || intent.payment === "pending-unknown") return "Provider processing or outcome unknown";
  if (intent.payment === "awaiting-provider" || intent.payment === "preparing") return "Preparing provider checkout";
  return "Card funding unavailable";
}

export function browserReturnNeverProvesPayment(intent: CardFundingIntent): { paid: false; intent: CardFundingIntent } {
  return { paid: false, intent };
}

export function disabledProductionAdapter(): CardFundingAdapter {
  return {
    id: "disabled-production",
    capabilities: () => cardFundingCapabilities("devnet"),
    createCheckout(input) {
      const intent = createCardFundingIntent({
        ...input,
        providerId: "disabled-production",
        providerEnvironment: "off",
      });
      return {
        ok: false,
        error: "Card funding unavailable. External checkout execution is disabled.",
        intent: touch(intent, input.nowMs, { payment: "unavailable" }),
      };
    },
    status(intent) {
      return { payment: intent.payment, delivery: intent.delivery, escrow: intent.escrow, admitsEntrant: false };
    },
    normalizeEvent() {
      return { ok: false, error: "Production card webhooks are not enabled" };
    },
  };
}

/** Deterministic local/test adapter. Mock completion never mutates real competition admission. */
export function localTestAdapter(): CardFundingAdapter {
  return {
    id: "local-test",
    capabilities() {
      const base = cardFundingCapabilities("localnet");
      return {
        ...base,
        reason: "Local test adapter only. Mock events cannot admit a real competition entrant.",
        blockers: [...base.blockers, "Mock completion cannot mutate real competition admission"],
      };
    },
    createCheckout(input) {
      if (input.cluster !== "localnet" && process.env.SUDOKU_CARD_FUNDING_LOCAL !== "1") {
        return { ok: false, error: "Local test adapter refuses non-local clusters unless SUDOKU_CARD_FUNDING_LOCAL=1" };
      }
      const intent = createCardFundingIntent({
        ...input,
        providerId: "local-test",
        providerEnvironment: "local-test",
      });
      return {
        ok: true,
        intent: touch(intent, input.nowMs, { payment: "awaiting-provider", providerOrderId: `local-${intent.intentId}` }),
        hostedUrl: null,
      };
    },
    status(intent) {
      return { payment: intent.payment, delivery: intent.delivery, escrow: intent.escrow, admitsEntrant: false };
    },
    normalizeEvent(raw) {
      if (!raw || typeof raw !== "object") return { ok: false, error: "Invalid local event" };
      const body = raw as { id?: string; kind?: NormalizedFundingEvent["kind"]; orderId?: string | null; observedAt?: number };
      if (!body.id || !body.kind) return { ok: false, error: "Local event needs id and kind" };
      return {
        ok: true,
        event: {
          id: body.id,
          kind: body.kind,
          orderId: body.orderId ?? null,
          observedAt: body.observedAt ?? Date.now(),
        },
      };
    },
  };
}

export function selectCardFundingAdapter(mode: string | undefined): CardFundingAdapter {
  if (mode === "local-test") return localTestAdapter();
  return disabledProductionAdapter();
}

export function activationRequirements(): string[] {
  return [
    "Suitable provider written approval for skill-game entry stakes and prizes",
    "Provider credentials stored as Worker secrets, never in git",
    "Confirmed network and asset compatibility with competition mint terms",
    "Signed raw-body webhook verification with replay window",
    "Wallet signing/custody model that still requires escrow deposit authorization",
    "Fee, rent, and gas handling for delivery and deposit",
    "Operational support for refund/chargeback review distinct from escrow refunds",
    "Separate owner authorization before any real-value or production enablement",
    "CSP and network allowlists reviewed before hosted provider UI is added",
  ];
}
