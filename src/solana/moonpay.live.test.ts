import { chromium } from "playwright";
import { describe, expect, it } from "vitest";
import { assertSandboxCheckout, createMoonpaySession, verifyMoonpayWebhook } from "./moonpay";

const live = process.env.SUDOKU_MOONPAY_LIVE === "1" && Boolean(process.env.MOONPAY_PUBLISHABLE_KEY);
const keys = {
  publishableKey: process.env.MOONPAY_PUBLISHABLE_KEY ?? "",
  secretKey: process.env.MOONPAY_SECRET_KEY ?? "",
  webhookKey: process.env.MOONPAY_WEBHOOK_KEY ?? "",
};

describe.skipIf(!live)("live MoonPay sandbox", () => {
  it("quotes Solana USDC and signs a sandbox checkout with the paired secret", async () => {
    const currency = new URL("https://api.moonpay.com/v3/currencies");
    currency.searchParams.set("apiKey", keys.publishableKey);
    const described = await fetch(currency, { headers: { Accept: "application/json" } });
    const assets = await described.json() as Array<{ code?: string; supportsTestMode?: boolean; minBuyAmount?: number }>;
    const asset = assets.find((item) => item.code === "usdc_sol");
    expect(described.status).toBe(200);
    expect(asset).toBeTruthy();
    if (!asset) return;
    expect(asset.code).toBe("usdc_sol");
    expect(asset.supportsTestMode).toBe(true);
    const amount = String(Math.max(20, Math.ceil(asset.minBuyAmount ?? 20)));
    const quote = new URL("https://api.moonpay.com/v3/currencies/usdc_sol/buy_quote");
    quote.searchParams.set("apiKey", keys.publishableKey);
    quote.searchParams.set("baseCurrencyCode", "usd");
    quote.searchParams.set("quoteCurrencyAmount", amount);
    const quoted = await fetch(quote);
    const body = await quoted.json() as { quoteCurrencyAmount?: number; baseCurrencyAmount?: number };
    expect(quoted.status).toBe(200);
    expect(body.quoteCurrencyAmount).toBeGreaterThan(0);
    const customerIp = (await (await fetch("https://api.ipify.org")).text()).trim();
    const session = await createMoonpaySession(keys, {
      wallet: "JCVsKd4TMg1fvEs7rjf5YgLYbJfNC8Dwb4x1PchFkGM7",
      quoteCurrencyAmount: amount,
      externalId: "sudoku-sandbox",
      customerIp,
    });
    if (!session.ok) throw new Error(session.error);
    assertSandboxCheckout(session.hostedUrl);
    expect(session.hostedUrl).toContain("allowedIpAddress=");
    const browser = await chromium.launch({ channel: "chrome", headless: true });
    const page = await browser.newPage();
    await page.goto(session.hostedUrl, { waitUntil: "networkidle", timeout: 30000 });
    const text = await page.locator("body").innerText();
    await browser.close();
    expect(text).not.toMatch(/signature check failed/i);
    expect(text).toMatch(/USDC/);
    const stamped = Math.floor(Date.now() / 1000);
    const raw = JSON.stringify({ id: "live-check", status: "completed" });
    const signature = await hmacHex(keys.webhookKey, `${stamped}.${raw}`);
    const verified = await verifyMoonpayWebhook({
      rawBody: raw,
      signatureHeader: `t=${stamped},s=${signature}`,
      webhookKey: keys.webhookKey,
      nowMs: stamped * 1000,
    });
    expect(verified.ok).toBe(true);
  }, 30000);
});

async function hmacHex(secret: string, message: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message)));
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
