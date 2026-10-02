import { applyProviderEvent, createFiatSession, type FiatRecord, type ProviderEvent } from "./fiatFunding";
import { createMoonpaySession, interpretMoonpayStatus, moonpayDestination, moonpayEnvironment, verifyMoonpayWebhook, type MoonpayKeys } from "./moonpay";
import { prohibitedForWagering, PUBLIC_FIAT_WAGERING, selectableForSandbox } from "./providerPolicy";

export type FundingCapabilities = {
  provider: string;
  role: "fiat" | "swap";
  configured: boolean;
  environment: "sandbox" | "production" | "off";
  publicWagering: false;
  destinationMint: string | null;
  exactOutput: boolean;
};

export function dflowSwapCapabilities(configured: boolean): FundingCapabilities {
  return {
    provider: "dflow",
    role: "swap",
    configured,
    environment: configured ? "production" : "off",
    publicWagering: false,
    destinationMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    exactOutput: false,
  };
}

export function moonpayCapabilities(publishableKey: string): FundingCapabilities {
  const environment = moonpayEnvironment(publishableKey);
  return {
    provider: "moonpay",
    role: "fiat",
    configured: environment !== "off",
    environment,
    publicWagering: false,
    destinationMint: environment === "off" ? null : moonpayDestination().mint,
    exactOutput: false,
  };
}

export function coinbaseCapabilities(): FundingCapabilities {
  return {
    provider: "coinbase",
    role: "fiat",
    configured: false,
    environment: "off",
    publicWagering: false,
    destinationMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    exactOutput: false,
  };
}

export function fundingCapabilityReport(input: { dflowConfigured: boolean; moonpayPublishableKey: string }) {
  return {
    publicWagering: PUBLIC_FIAT_WAGERING,
    sandboxProviders: selectableForSandbox().map((item) => item.id),
    prohibited: prohibitedForWagering(),
    dflow: dflowSwapCapabilities(input.dflowConfigured),
    moonpay: moonpayCapabilities(input.moonpayPublishableKey),
    coinbase: coinbaseCapabilities(),
  };
}

/** Coinbase has no credential in this environment, and the skill-game use still needs written approval. */
export function createCoinbaseSession(): { ok: false; error: string } {
  return { ok: false, error: "Coinbase Onramp is not configured. Games of skill that charge an entry fee and pay a prize need Coinbase's written approval." };
}

export async function openMoonpaySandbox(keys: MoonpayKeys, input: { existing: FiatRecord | null; matchId: string; wallet: string; expectedAtomic: bigint; customerIp?: string }): Promise<{ ok: true; record: FiatRecord; hostedUrl: string } | { ok: false; error: string }> {
  if (PUBLIC_FIAT_WAGERING) return { ok: false, error: "Public card wagering is not enabled." };
  const record = createFiatSession({
    existing: input.existing,
    provider: "moonpay",
    matchId: input.matchId,
    wallet: input.wallet,
    assetMint: moonpayDestination().mint,
    expectedAtomic: input.expectedAtomic,
  });
  const whole = (BigInt(record.expectedAtomic) / 1_000_000n).toString();
  const session = await createMoonpaySession(keys, {
    wallet: record.wallet,
    quoteCurrencyAmount: whole,
    externalId: record.sessionId,
    customerIp: input.customerIp,
  });
  if (!session.ok) return session;
  return { ok: true, record, hostedUrl: session.hostedUrl };
}

export async function moonpayWebhookEvent(keys: Pick<MoonpayKeys, "webhookKey">, rawBody: string, signatureHeader: string | null, nowMs?: number): Promise<{ ok: true; event: ProviderEvent } | { ok: false; error: string }> {
  const verified = await verifyMoonpayWebhook({ rawBody, signatureHeader, webhookKey: keys.webhookKey, nowMs });
  if (!verified.ok) return verified;
  const body = JSON.parse(rawBody) as { id?: string; status?: string; externalTransactionId?: string };
  const kind = interpretMoonpayStatus(String(body.status ?? ""));
  return {
    ok: true,
    event: {
      id: String(body.id ?? `${verified.timestamp}`),
      kind: kind === "delivery-pending" ? "provider-completed" : kind,
      orderId: body.externalTransactionId ?? null,
    },
  };
}

export function capabilityBody(env: { DFLOW_API_KEY?: string; MOONPAY_PUBLISHABLE_KEY?: string; FIAT_FUNDING_MODE?: string }) {
  return {
    ...fundingCapabilityReport({
      dflowConfigured: Boolean(env.DFLOW_API_KEY),
      moonpayPublishableKey: env.MOONPAY_PUBLISHABLE_KEY ?? "",
    }),
    sandboxCheckout: env.FIAT_FUNDING_MODE === "sandbox",
  };
}

export async function sandboxSessionBody(env: { FIAT_FUNDING_MODE?: string; MOONPAY_PUBLISHABLE_KEY?: string; MOONPAY_SECRET_KEY?: string; MOONPAY_WEBHOOK_KEY?: string }, input: { matchId?: string; wallet?: string; expectedAtomic?: string; customerIp?: string }) {
  if (env.FIAT_FUNDING_MODE !== "sandbox") {
    return { status: 403, body: { error: "Card funding is not enabled for paid matches.", funded: false, publicWagering: false } };
  }
  const opened = await openMoonpaySandbox({
    publishableKey: env.MOONPAY_PUBLISHABLE_KEY ?? "",
    secretKey: env.MOONPAY_SECRET_KEY ?? "",
    webhookKey: env.MOONPAY_WEBHOOK_KEY ?? "",
  }, {
    existing: null,
    matchId: String(input.matchId ?? ""),
    wallet: String(input.wallet ?? ""),
    expectedAtomic: BigInt(input.expectedAtomic ?? "0"),
    customerIp: input.customerIp,
  });
  if (!opened.ok) return { status: 400, body: { error: opened.error, funded: false, publicWagering: false } };
  return { status: 200, body: { funded: false, publicWagering: false, sessionId: opened.record.sessionId, hostedUrl: opened.hostedUrl, statusLabel: "Payment processing" } };
}

export async function webhookBody(env: { FIAT_FUNDING_MODE?: string; MOONPAY_WEBHOOK_KEY?: string }, rawBody: string, signatureHeader: string | null) {
  if (env.FIAT_FUNDING_MODE !== "sandbox") {
    return { status: 403, body: { funded: false, error: "Card funding is not enabled for paid matches." } };
  }
  const result = await moonpayWebhookEvent({ webhookKey: env.MOONPAY_WEBHOOK_KEY ?? "" }, rawBody, signatureHeader);
  if (!result.ok) return { status: 401, body: { funded: false, error: result.error } };
  return { status: 200, body: { funded: false, accepted: true, providerEvent: result.event.kind } };
}

export function applyVerifiedMoonpayEvent(state: FiatRecord, event: ProviderEvent) {
  const next = applyProviderEvent(state, event);
  if (next.state.status === "match-funded" && state.status !== "match-funded") {
    throw new Error("A card event cannot mark the match funded");
  }
  return next;
}
