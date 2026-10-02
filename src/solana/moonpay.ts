import { MAINNET_USDC } from "./dflow";

const SANDBOX_HOST = "https://buy-sandbox.moonpay.com";
const SELL_SANDBOX_HOST = "https://sell-sandbox.moonpay.com";
const WEBHOOK_MAX_SKEW_MS = 5 * 60 * 1000;

export type MoonpayKeys = {
  publishableKey: string;
  secretKey: string;
  webhookKey: string;
};

export type MoonpaySessionInput = {
  wallet: string;
  /** Whole USDC units the player still needs, such as "5". */
  quoteCurrencyAmount: string;
  externalId: string;
  /** Public IP of the browser that will open the widget. Hashed into the signed URL. */
  customerIp?: string;
};

function bytesToBase64(bytes: ArrayBuffer): string {
  const view = new Uint8Array(bytes);
  let binary = "";
  for (const byte of view) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function timingSafeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return diff === 0;
}

export async function moonpayQuerySignature(secret: string, query: string): Promise<string> {
  return hmac(secret, query, "base64");
}

async function hmac(secret: string, message: string, encoding: "base64" | "hex"): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  if (encoding === "hex") {
    return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  return bytesToBase64(signature);
}

export function moonpayEnvironment(publishableKey: string): "sandbox" | "production" | "off" {
  if (publishableKey.startsWith("pk_test_")) return "sandbox";
  if (publishableKey.startsWith("pk_live_")) return "production";
  return "off";
}

export function moonpayDestination() {
  return { code: "usdc_sol", mint: MAINNET_USDC, network: "solana" };
}

/** Sandbox checkout only. A live key is refused even when it would sign. */
export async function createMoonpaySession(keys: MoonpayKeys, input: MoonpaySessionInput): Promise<{ ok: true; hostedUrl: string } | { ok: false; error: string }> {
  if (moonpayEnvironment(keys.publishableKey) !== "sandbox" || !keys.secretKey.startsWith("sk_test_")) {
    return { ok: false, error: "Production MoonPay keys cannot fund a paid match without written approval." };
  }
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(input.wallet)) return { ok: false, error: "Invalid wallet address" };
  if (!/^\d+$/.test(input.quoteCurrencyAmount) || input.quoteCurrencyAmount === "0") {
    return { ok: false, error: "Invalid USDC amount" };
  }
  const url = new URL(SANDBOX_HOST);
  url.searchParams.set("apiKey", keys.publishableKey);
  url.searchParams.set("currencyCode", "usdc_sol");
  url.searchParams.set("baseCurrencyCode", "usd");
  url.searchParams.set("quoteCurrencyAmount", input.quoteCurrencyAmount);
  url.searchParams.set("walletAddress", input.wallet);
  url.searchParams.set("externalTransactionId", input.externalId);
  if (input.customerIp) {
    url.searchParams.set("allowedIpAddress", await hmac(keys.secretKey, input.customerIp, "base64"));
  }
  const signature = await hmac(keys.secretKey, url.search, "base64");
  url.searchParams.set("signature", signature);
  return { ok: true, hostedUrl: url.toString() };
}

export function assertSandboxCheckout(hostedUrl: string): void {
  const url = new URL(hostedUrl);
  if (url.origin !== SANDBOX_HOST) throw new Error("Checkout must stay on the MoonPay sandbox");
  if (url.searchParams.get("currencyCode") !== "usdc_sol") throw new Error("Checkout must buy Solana USDC");
  if (!url.searchParams.get("signature")) throw new Error("Checkout URL is not signed");
  if (url.searchParams.get("walletAddress") === null) throw new Error("Checkout has no destination wallet");
}

/** Off-ramp is a separate user action. It is not how a match pays the winner. */
export function moonpayOfframpUrl(publishableKey: string): string | null {
  if (moonpayEnvironment(publishableKey) !== "sandbox") return null;
  const url = new URL(SELL_SANDBOX_HOST);
  url.searchParams.set("apiKey", publishableKey);
  url.searchParams.set("baseCurrencyCode", "usdc_sol");
  url.searchParams.set("quoteCurrencyCode", "usd");
  return url.toString();
}

export function interpretMoonpayStatus(status: string): "processing" | "cancelled" | "declined" | "kyc" | "provider-completed" | "delivery-pending" {
  const normalized = status.toLowerCase();
  if (normalized.includes("kyc")) return "kyc";
  if (normalized.includes("cancel")) return "cancelled";
  if (normalized === "failed" || normalized.includes("declin")) return "declined";
  if (normalized === "completed") return "provider-completed";
  if (normalized === "pending") return "delivery-pending";
  return "processing";
}

export async function verifyMoonpayWebhook(input: {
  rawBody: string;
  signatureHeader: string | null;
  webhookKey: string;
  nowMs?: number;
}): Promise<{ ok: true; timestamp: number } | { ok: false; error: string }> {
  if (!input.webhookKey) return { ok: false, error: "Webhook key missing" };
  if (!input.signatureHeader) return { ok: false, error: "Missing Moonpay-Signature-V2" };
  const parts = Object.fromEntries(input.signatureHeader.split(",").map((part) => {
    const [name, ...rest] = part.trim().split("=");
    return [name, rest.join("=")];
  })) as { t?: string; s?: string };
  const timestamp = Number(parts.t);
  if (!Number.isFinite(timestamp) || !parts.s) return { ok: false, error: "Malformed Moonpay-Signature-V2" };
  const now = input.nowMs ?? Date.now();
  if (Math.abs(now - timestamp * 1000) > WEBHOOK_MAX_SKEW_MS) return { ok: false, error: "Webhook timestamp outside replay window" };
  const expectedHex = await hmac(input.webhookKey, `${timestamp}.${input.rawBody}`, "hex");
  const expectedBase64 = await hmac(input.webhookKey, `${timestamp}.${input.rawBody}`, "base64");
  if (!timingSafeEqual(expectedHex, parts.s) && !timingSafeEqual(expectedBase64, parts.s)) {
    return { ok: false, error: "Invalid webhook signature" };
  }
  return { ok: true, timestamp };
}
