import { loadOperatorEnv } from "./operator-env.mjs";
import { readFileSync, writeFileSync } from "node:fs";
import { parseEnv } from "node:util";

const env = loadOperatorEnv();
const key = env.DFLOW_API_KEY?.trim();
if (!key) throw new Error("missing quote credential");
const amounts = ["20000000", "50000000"];
const saved = [];
for (const amount of amounts) {
  const url = new URL("https://quote-api.dflow.net/order");
  url.searchParams.set("inputMint", "So11111111111111111111111111111111111111112");
  url.searchParams.set("outputMint", "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
  url.searchParams.set("amount", amount);
  url.searchParams.set("slippageBps", "50");
  const response = await fetch(url, { headers: { Accept: "application/json", "x-api-key": key } });
  const body = await response.json();
  if (!response.ok) throw new Error(`quote ${response.status}`);
  if (body.transaction) throw new Error("quote included a transaction");
  const hops = Array.isArray(body.routePlan) ? body.routePlan.length : null;
  const fixture = {
    inputMint: body.inputMint,
    outputMint: body.outputMint,
    inAmount: body.inAmount,
    outAmount: body.outAmount,
    minOutAmount: body.minOutAmount ?? body.otherAmountThreshold,
    otherAmountThreshold: body.otherAmountThreshold,
    slippageBps: body.slippageBps,
    priceImpactPct: body.priceImpactPct,
    executionMode: body.executionMode,
    routeHops: hops,
    capturedOn: "2026-09-28",
    broadcast: false,
  };
  const name = amount === "20000000" ? "dflow-quote-002.json" : "dflow-quote-005.json";
  writeFileSync(new URL(`../src/solana/fixtures/${name}`, import.meta.url), JSON.stringify(fixture, null, 2));
  saved.push({ amount, status: response.status, outAmount: fixture.outAmount, minOutAmount: fixture.minOutAmount, hops });
}
console.log(JSON.stringify(saved, null, 2));
