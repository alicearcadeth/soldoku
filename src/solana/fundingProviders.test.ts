import { describe, expect, it } from "vitest";
import { applyVerifiedMoonpayEvent, capabilityBody, coinbaseCapabilities, createCoinbaseSession, fundingCapabilityReport, openMoonpaySandbox, sandboxSessionBody } from "./fundingProviders";
import { applyProviderEvent } from "./fiatFunding";
import { assertSandboxCheckout, interpretMoonpayStatus, moonpayOfframpUrl, moonpayQuerySignature, verifyMoonpayWebhook } from "./moonpay";
import { prohibitedForWagering, PUBLIC_FIAT_WAGERING } from "./providerPolicy";

const keys = {
  publishableKey: "pk_test_example",
  secretKey: "sk_test_example",
  webhookKey: "whsec_example",
};
const wallet = "JCVsKd4TMg1fvEs7rjf5YgLYbJfNC8Dwb4x1PchFkGM7";

describe("funding providers", () => {
  it("keeps public wagering off and does not select a prohibited provider", () => {
    expect(PUBLIC_FIAT_WAGERING).toBe(false);
    expect(prohibitedForWagering()).toEqual(["stripe", "transak"]);
    const report = fundingCapabilityReport({ dflowConfigured: true, moonpayPublishableKey: keys.publishableKey });
    expect(report.publicWagering).toBe(false);
    expect(report.dflow).toMatchObject({ role: "swap", exactOutput: false, publicWagering: false });
    expect(report.moonpay.environment).toBe("sandbox");
    expect(report.coinbase).toEqual(coinbaseCapabilities());
    expect(report.sandboxProviders).not.toContain("stripe");
  });

  it("matches MoonPay's published signature vector", async () => {
    const signature = await moonpayQuerySignature(
      "sk_test_DocsVector00",
      "?apiKey=pk_test_DocsVector00&currencyCode=eth&walletAddress=0xde0B295669a9FD93d5F28D9Ec85E40f4cb697BAe",
    );
    expect(signature).toBe("oIJxSghyzll/BLhUFdQZhkxf7DAS8REFaWr/ibO+K8Q=");
  });

  it("signs a sandbox USDC checkout and refuses a live key", async () => {
    const opened = await openMoonpaySandbox(keys, { existing: null, matchId: "ROOM", wallet, expectedAtomic: 5_000_000n });
    if (!opened.ok) throw new Error(opened.error);
    assertSandboxCheckout(opened.hostedUrl);
    expect(opened.hostedUrl).toContain("quoteCurrencyAmount=5");
    const bound = await openMoonpaySandbox(keys, { existing: null, matchId: "ROOM", wallet, expectedAtomic: 5_000_000n, customerIp: "203.0.113.42" });
    if (!bound.ok) throw new Error(bound.error);
    expect(bound.hostedUrl).toContain("allowedIpAddress=");
    expect(opened.record.status).toBe("session-created");
    const again = await openMoonpaySandbox(keys, { existing: opened.record, matchId: "ROOM", wallet, expectedAtomic: 5_000_000n });
    if (!again.ok) throw new Error(again.error);
    expect(again.record.sessionId).toBe(opened.record.sessionId);
    const live = await openMoonpaySandbox({ ...keys, publishableKey: "pk_live_example", secretKey: "sk_live_example" }, { existing: null, matchId: "ROOM", wallet, expectedAtomic: 5_000_000n });
    expect(live.ok).toBe(false);
    expect(createCoinbaseSession().ok).toBe(false);
    expect(moonpayOfframpUrl(keys.publishableKey)).toContain("sell-sandbox.moonpay.com");
    expect(interpretMoonpayStatus("completed")).toBe("provider-completed");
    expect(interpretMoonpayStatus("pending")).toBe("delivery-pending");
  });

  it("rejects a bad webhook and a replay, and still does not fund the room", async () => {
    const raw = JSON.stringify({ id: "tx_1", status: "completed", externalTransactionId: "order-1" });
    const timestamp = 1_700_000_000;
    const unsigned = await verifyMoonpayWebhook({ rawBody: raw, signatureHeader: `t=${timestamp},s=nope`, webhookKey: keys.webhookKey, nowMs: timestamp * 1000 });
    expect(unsigned.ok).toBe(false);
    const signature = await sign(`${timestamp}.${raw}`, keys.webhookKey);
    const verified = await verifyMoonpayWebhook({ rawBody: raw, signatureHeader: `t=${timestamp},s=${signature}`, webhookKey: keys.webhookKey, nowMs: timestamp * 1000 });
    expect(verified.ok).toBe(true);
    const opened = await openMoonpaySandbox(keys, { existing: null, matchId: "ROOM", wallet, expectedAtomic: 1_000_000n });
    if (!opened.ok) throw new Error(opened.error);
    const first = applyVerifiedMoonpayEvent(opened.record, { id: "tx_1", kind: "provider-completed", orderId: "order-1" });
    const replay = applyProviderEvent(first.state, { id: "tx_1", kind: "provider-completed", orderId: "order-1" });
    expect(first.state.status).toBe("delivery-pending");
    expect(replay.duplicate).toBe(true);
    expect(first.state.status).not.toBe("match-funded");
  });

  it("hides secrets and refuses checkout unless sandbox mode is explicit", async () => {
    const secret = "pk_test_hidden";
    const report = capabilityBody({ DFLOW_API_KEY: "dflow-secret-value", MOONPAY_PUBLISHABLE_KEY: secret, FIAT_FUNDING_MODE: "sandbox" });
    expect(JSON.stringify(report)).not.toContain("dflow-secret-value");
    expect(JSON.stringify(report)).not.toContain(secret);
    expect(report.sandboxCheckout).toBe(true);
    expect(report.publicWagering).toBe(false);
    const blocked = await sandboxSessionBody({}, { matchId: "ROOM", wallet, expectedAtomic: "1000000" });
    expect(blocked.status).toBe(403);
    expect(blocked.body.funded).toBe(false);
  });
});

async function sign(message: string, secret: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message)));
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
