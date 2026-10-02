/** Quote-then-swap-then-deposit. A successful swap is never a funded escrow. */

export type Quote = {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  minOutAmount: string;
  expiresAt: number;
};

export type Funding =
  | { kind: "idle" }
  | { kind: "quoted"; quote: Quote }
  | { kind: "swap-unknown"; quote: Quote; signature: string }
  | { kind: "swapped"; quote: Quote; signature: string; received: bigint }
  | { kind: "deposit-unknown"; quote: Quote; swapSignature: string | null; depositSignature: string }
  | { kind: "funded"; swapSignature: string | null; depositSignature: string };

function sameAsset(quote: Quote) {
  return quote.inputMint === quote.outputMint;
}

export function quoteFunding(state: Funding, quote: Quote, now: number): Funding {
  if (state.kind === "swap-unknown" || state.kind === "deposit-unknown" || state.kind === "funded") {
    throw new Error("Finish or recover the current attempt before quoting again");
  }
  if (now >= quote.expiresAt) throw new Error("Quote expired");
  if (BigInt(quote.minOutAmount) <= 0n) throw new Error("The quote has no output");
  return { kind: "quoted", quote };
}

/** The player approves a swap. Same-asset rooms skip this step. */
export function approveSwap(state: Funding, signature: string, now: number): Funding {
  if (state.kind !== "quoted") throw new Error("There is no quote to swap");
  if (sameAsset(state.quote)) throw new Error("This room does not need a swap");
  if (now >= state.quote.expiresAt) throw new Error("Quote expired");
  if (!signature) throw new Error("The swap needs a signature");
  return { kind: "swap-unknown", quote: state.quote, signature };
}

/** Records a chain result. Unknown keeps the same signature so a retry cannot send a second swap. */
export function recordSwap(state: Funding, result: { confirmed: boolean; received: bigint }): Funding {
  if (state.kind !== "swap-unknown") throw new Error("No swap is waiting");
  if (!result.confirmed) return state;
  return { kind: "swapped", quote: state.quote, signature: state.signature, received: result.received };
}

/** A separate wallet approval. Short output cannot start a deposit. */
export function approveDeposit(state: Funding, signature: string, stake: bigint): Funding {
  if (!signature) throw new Error("The deposit needs a signature");
  if (state.kind === "quoted" && sameAsset(state.quote)) {
    return { kind: "deposit-unknown", quote: state.quote, swapSignature: null, depositSignature: signature };
  }
  if (state.kind !== "swapped") throw new Error("Confirm the swap before depositing");
  if (state.received < stake) throw new Error("The received amount is short of the stake");
  return {
    kind: "deposit-unknown",
    quote: state.quote,
    swapSignature: state.signature,
    depositSignature: signature,
  };
}

export function recordDeposit(state: Funding, confirmed: boolean): Funding {
  if (state.kind !== "deposit-unknown") throw new Error("No deposit is waiting");
  if (!confirmed) return state;
  return { kind: "funded", swapSignature: state.swapSignature, depositSignature: state.depositSignature };
}

export function assertFundingWallet(bound: string | null, current: string | null): void {
  if (bound && current && bound !== current) {
    throw new Error("The wallet changed. Recover the existing attempt before using another account.");
  }
}

export function retrySignature(state: Funding): string | null {
  if (state.kind === "swap-unknown") return state.signature;
  if (state.kind === "deposit-unknown") return state.depositSignature;
  return null;
}

export type OrderRef = {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  minOutAmount: string;
  expiresAt: number;
};

export type FundingStep =
  | { step: "idle" }
  | { step: "quote-requested"; order: Pick<OrderRef, "inputMint" | "outputMint" | "inAmount"> }
  | { step: "quote-ready"; order: OrderRef }
  | { step: "quote-expired"; order: OrderRef }
  | { step: "swap-rejected"; order: OrderRef }
  | { step: "swap-prepared"; order: OrderRef }
  | { step: "swap-signed"; order: OrderRef; signature: string }
  | { step: "swap-submitted"; order: OrderRef; signature: string }
  | { step: "swap-unknown"; order: OrderRef; signature: string }
  | { step: "swap-failed"; order: OrderRef; signature: string }
  | { step: "swap-confirmed"; order: OrderRef; signature: string }
  | { step: "output-verified"; order: OrderRef; signature: string; received: string }
  | { step: "deposit-prepared"; order: OrderRef; swapSignature: string | null }
  | { step: "deposit-rejected"; order: OrderRef; swapSignature: string | null }
  | { step: "deposit-signed"; order: OrderRef; swapSignature: string | null; depositSignature: string }
  | { step: "deposit-submitted"; order: OrderRef; swapSignature: string | null; depositSignature: string }
  | { step: "deposit-unknown"; order: OrderRef; swapSignature: string | null; depositSignature: string }
  | { step: "deposit-confirmed"; order: OrderRef; swapSignature: string | null; depositSignature: string }
  | { step: "room-funded"; swapSignature: string | null; depositSignature: string }
  | { step: "recovery-required"; reason: string; signature: string | null; order: OrderRef | null; swapSignature: string | null };

const REQUOTE = new Set(["idle", "quote-expired", "swap-rejected", "swap-failed", "quote-requested"]);

function sameOrder(order: OrderRef) {
  return order.inputMint === order.outputMint;
}

export function requestQuote(state: FundingStep, order: Pick<OrderRef, "inputMint" | "outputMint" | "inAmount">): FundingStep {
  if (!REQUOTE.has(state.step)) throw new Error("Finish or recover the current attempt before quoting again");
  return { step: "quote-requested", order };
}

export function readyQuote(state: FundingStep, order: OrderRef, now: number): FundingStep {
  if (state.step !== "quote-requested") throw new Error("No quote was requested");
  if (now >= order.expiresAt) return { step: "quote-expired", order };
  if (BigInt(order.minOutAmount) <= 0n) throw new Error("The quote has no output");
  return { step: "quote-ready", order };
}

export function prepareSwapStep(state: FundingStep, now: number): FundingStep {
  if (state.step !== "quote-ready") throw new Error("There is no quote to swap");
  if (sameOrder(state.order)) throw new Error("This room does not need a swap");
  if (now >= state.order.expiresAt) return { step: "quote-expired", order: state.order };
  return { step: "swap-prepared", order: state.order };
}

export function rejectPrepared(state: FundingStep): FundingStep {
  if (state.step === "swap-prepared") return { step: "swap-rejected", order: state.order };
  if (state.step === "deposit-prepared") return { step: "deposit-rejected", order: state.order, swapSignature: state.swapSignature };
  throw new Error("There is nothing to reject");
}

export function signSwapStep(state: FundingStep, signature: string): FundingStep {
  if (state.step !== "swap-prepared") throw new Error("The swap is not ready to sign");
  if (!signature) throw new Error("The swap needs a signature");
  return { step: "swap-signed", order: state.order, signature };
}

export function submitSwapStep(state: FundingStep): FundingStep {
  if (state.step !== "swap-signed") throw new Error("Sign the swap before submitting it");
  return { step: "swap-submitted", order: state.order, signature: state.signature };
}

export function noteSwapStep(state: FundingStep, result: "unknown" | "failed" | "confirmed"): FundingStep {
  if (state.step !== "swap-signed" && state.step !== "swap-submitted" && state.step !== "swap-unknown") throw new Error("No swap is waiting");
  if (result === "unknown") return { step: "swap-unknown", order: state.order, signature: state.signature };
  if (result === "failed") return { step: "swap-failed", order: state.order, signature: state.signature };
  return { step: "swap-confirmed", order: state.order, signature: state.signature };
}

export function verifySwapOutput(state: FundingStep, received: bigint, stake: bigint): FundingStep {
  if (state.step !== "swap-confirmed") throw new Error("The swap is not confirmed");
  if (received < stake) {
    return {
      step: "recovery-required",
      reason: "The swap paid less than the stake. Those tokens are in the wallet, not in escrow.",
      signature: state.signature,
      order: state.order,
      swapSignature: state.signature,
    };
  }
  return { step: "output-verified", order: state.order, signature: state.signature, received: received.toString() };
}

export function prepareDepositStep(state: FundingStep, now: number): FundingStep {
  if (state.step === "quote-ready" && sameOrder(state.order)) {
    if (now >= state.order.expiresAt) return { step: "quote-expired", order: state.order };
    return { step: "deposit-prepared", order: state.order, swapSignature: null };
  }
  if (state.step === "output-verified") return { step: "deposit-prepared", order: state.order, swapSignature: state.signature };
  if (state.step === "deposit-rejected") return { step: "deposit-prepared", order: state.order, swapSignature: state.swapSignature };
  if (state.step === "recovery-required" && state.order && state.reason.includes("still in the wallet")) {
    return { step: "deposit-prepared", order: state.order, swapSignature: state.swapSignature };
  }
  throw new Error("Confirm the swap before depositing");
}

export function signDepositStep(state: FundingStep, signature: string): FundingStep {
  if (state.step !== "deposit-prepared") throw new Error("The deposit is not ready to sign");
  if (!signature) throw new Error("The deposit needs a signature");
  return { step: "deposit-signed", order: state.order, swapSignature: state.swapSignature, depositSignature: signature };
}

export function submitDepositStep(state: FundingStep): FundingStep {
  if (state.step !== "deposit-signed") throw new Error("Sign the deposit before submitting it");
  return { step: "deposit-submitted", order: state.order, swapSignature: state.swapSignature, depositSignature: state.depositSignature };
}

export function noteDepositStep(state: FundingStep, result: "unknown" | "failed" | "confirmed"): FundingStep {
  if (state.step !== "deposit-signed" && state.step !== "deposit-submitted" && state.step !== "deposit-unknown") {
    throw new Error("No deposit is waiting");
  }
  if (result === "unknown") {
    return { step: "deposit-unknown", order: state.order, swapSignature: state.swapSignature, depositSignature: state.depositSignature };
  }
  if (result === "failed") {
    return {
      step: "recovery-required",
      reason: "The deposit failed. The settlement tokens are still in the wallet.",
      signature: state.depositSignature,
      order: state.order,
      swapSignature: state.swapSignature,
    };
  }
  return {
    step: "deposit-confirmed",
    order: state.order,
    swapSignature: state.swapSignature,
    depositSignature: state.depositSignature,
  };
}

/** A confirmed deposit signature is not a funded room until the vault holds the stake. */
export function confirmEscrowFunding(state: FundingStep, vaultCoversStake: boolean): FundingStep {
  if (state.step !== "deposit-confirmed") throw new Error("The deposit is not confirmed");
  if (!vaultCoversStake) {
    return {
      step: "recovery-required",
      reason: "The deposit signature is confirmed, but the vault does not hold the stake.",
      signature: state.depositSignature,
      order: state.order,
      swapSignature: state.swapSignature,
    };
  }
  return { step: "room-funded", swapSignature: state.swapSignature, depositSignature: state.depositSignature };
}

/** Reload checks the saved signature. An unknown swap is not replaced. */
export function recoverOnLoad(state: FundingStep, chain: "confirmed" | "failed" | "unknown" | "none"): FundingStep {
  if (state.step === "swap-signed" || state.step === "swap-submitted" || state.step === "swap-unknown") {
    const waiting = { step: "swap-unknown" as const, order: state.order, signature: state.signature };
    if (chain === "none" || chain === "unknown") return waiting;
    return noteSwapStep(waiting, chain);
  }
  if (state.step === "deposit-signed" || state.step === "deposit-submitted" || state.step === "deposit-unknown") {
    const waiting = {
      step: "deposit-unknown" as const,
      order: state.order,
      swapSignature: state.swapSignature,
      depositSignature: state.depositSignature,
    };
    if (chain === "none" || chain === "unknown") return waiting;
    return noteDepositStep(waiting, chain);
  }
  return state;
}

export function fundingSnapshot(state: FundingStep): string {
  return JSON.stringify(state);
}

export function fundingRestore(raw: string): FundingStep {
  const parsed = JSON.parse(raw) as FundingStep;
  if (!parsed || typeof parsed !== "object" || typeof parsed.step !== "string") throw new Error("The funding record is not usable");
  return parsed;
}
