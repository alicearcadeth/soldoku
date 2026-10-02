const url = new URL("https://dev-quote-api.dflow.net/order");
url.searchParams.set("inputMint", "So11111111111111111111111111111111111111112");
url.searchParams.set("outputMint", "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
url.searchParams.set("amount", "10000000");
url.searchParams.set("slippageBps", "50");
const response = await fetch(url);
const body = await response.json();
console.log(JSON.stringify({
  status: response.status,
  inAmount: body.inAmount,
  outAmount: body.outAmount,
  minOutAmount: body.minOutAmount ?? body.otherAmountThreshold,
  slippageBps: body.slippageBps,
  priceImpactPct: body.priceImpactPct,
  executionMode: body.executionMode,
  hasTransaction: typeof body.transaction === "string" && body.transaction.length > 0,
  platformFee: body.platformFee ?? null,
}));
