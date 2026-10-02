import { describe, expect, it } from "vitest";
import { approveDeposit, approveSwap, assertFundingWallet, confirmEscrowFunding, fundingRestore, fundingSnapshot, noteDepositStep, noteSwapStep, prepareDepositStep, prepareSwapStep, quoteFunding, readyQuote, recoverOnLoad, rejectPrepared, requestQuote, signDepositStep, signSwapStep, submitDepositStep, submitSwapStep, verifySwapOutput, recordDeposit, recordSwap, retrySignature, type Funding, type FundingStep, type Quote } from "./funding";

const now = 1_000;
const sol = "So11111111111111111111111111111111111111112";
const usdc = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const quote: Quote = { inputMint: sol, outputMint: usdc, inAmount: "10000000", minOutAmount: "1000000", expiresAt: 2_000 };
const same: Quote = { ...quote, inputMint: usdc, outputMint: usdc };
const stake = 1_000_000n;

function quoted(next: Quote = quote): Funding {
  return quoteFunding({ kind: "idle" }, next, now);
}

describe("swap then deposit", () => {
  it("does not treat a confirmed swap as a funded escrow", () => {
    const swapped = recordSwap(approveSwap(quoted(), "swap-sig", now), { confirmed: true, received: stake });
    expect(swapped.kind).toBe("swapped");
    expect(retrySignature(swapped)).toBeNull();
  });

  it("keeps an unknown swap on the same signature and refuses a second quote", () => {
    const pending = recordSwap(approveSwap(quoted(), "swap-sig", now), { confirmed: false, received: 0n });
    expect(pending.kind).toBe("swap-unknown");
    expect(retrySignature(pending)).toBe("swap-sig");
    expect(() => quoteFunding(pending, quote, now)).toThrow(/current attempt/);
  });

  it("rejects an expired quote and a short output", () => {
    expect(() => approveSwap(quoted(), "swap-sig", 2_000)).toThrow(/expired/);
    const short = recordSwap(approveSwap(quoted(), "swap-sig", now), { confirmed: true, received: stake - 1n });
    expect(() => approveDeposit(short, "deposit-sig", stake)).toThrow(/short/);
  });

  it("requires a second approval for the deposit and retries that signature until it confirms", () => {
    const swapped = recordSwap(approveSwap(quoted(), "swap-sig", now), { confirmed: true, received: stake });
    const pending = recordDeposit(approveDeposit(swapped, "deposit-sig", stake), false);
    expect(pending.kind).toBe("deposit-unknown");
    expect(retrySignature(pending)).toBe("deposit-sig");
    const funded = recordDeposit(pending, true);
    expect(funded).toMatchObject({ kind: "funded", swapSignature: "swap-sig", depositSignature: "deposit-sig" });
  });

  it("skips the swap when the player already holds the settlement asset", () => {
    const direct = approveDeposit(quoted(same), "deposit-sig", stake);
    expect(direct).toMatchObject({ kind: "deposit-unknown", swapSignature: null });
    expect(() => approveSwap(quoted(same), "swap-sig", now)).toThrow(/does not need a swap/);
  });
});

const order = { inputMint: sol, outputMint: usdc, inAmount: "10000000", minOutAmount: "1000000", expiresAt: 2_000 };

describe("funding steps", () => {
  function ready(): FundingStep {
    return readyQuote(requestQuote({ step: "idle" }, order), order, now);
  }

  it("keeps an unknown swap signature across reload and will not quote again", () => {
    const signed = signSwapStep(prepareSwapStep(ready(), now), "swap-sig");
    const unknown = recoverOnLoad(submitSwapStep(signed), "unknown");
    expect(unknown).toMatchObject({ step: "swap-unknown", signature: "swap-sig" });
    expect(fundingRestore(fundingSnapshot(unknown))).toEqual(unknown);
    expect(() => requestQuote(unknown, order)).toThrow(/current attempt/);
  });

  it("resumes a deposit after a confirmed swap without starting another swap", () => {
    const confirmed = noteSwapStep(submitSwapStep(signSwapStep(prepareSwapStep(ready(), now), "swap-sig")), "confirmed");
    const verified = verifySwapOutput(confirmed, stake, stake);
    const rejected = rejectPrepared(prepareDepositStep(verified, now));
    expect(rejected.step).toBe("deposit-rejected");
    const confirmedDeposit = noteDepositStep(submitDepositStep(signDepositStep(prepareDepositStep(rejected, now), "deposit-sig")), "confirmed");
    expect(confirmedDeposit.step).toBe("deposit-confirmed");
    expect(confirmEscrowFunding(confirmedDeposit, false).step).toBe("recovery-required");
    expect(confirmEscrowFunding(confirmedDeposit, true)).toMatchObject({ step: "room-funded", swapSignature: "swap-sig", depositSignature: "deposit-sig" });
  });

  it("expires a quote, records a rejected swap, and does not swap again after a failed deposit", () => {
    const requested = requestQuote({ step: "idle" }, order);
    expect(readyQuote(requested, { ...order, expiresAt: now }, now).step).toBe("quote-expired");
    const rejected = rejectPrepared(prepareSwapStep(ready(), now));
    expect(rejected.step).toBe("swap-rejected");
    expect(requestQuote(rejected, order).step).toBe("quote-requested");
    const confirmed = noteSwapStep(submitSwapStep(signSwapStep(prepareSwapStep(ready(), now), "swap-sig")), "confirmed");
    const failed = noteDepositStep(submitDepositStep(signDepositStep(prepareDepositStep(verifySwapOutput(confirmed, stake, stake), now), "deposit-sig")), "failed");
    expect(failed.step).toBe("recovery-required");
    expect(() => requestQuote(failed, order)).toThrow(/current attempt/);
    expect(() => prepareSwapStep(failed, now)).toThrow(/no quote/);
  });

  it("keeps one deposit signature across reload and refuses a second quote", () => {
    const confirmed = noteSwapStep(submitSwapStep(signSwapStep(prepareSwapStep(ready(), now), "swap-sig")), "confirmed");
    const pending = submitDepositStep(signDepositStep(prepareDepositStep(verifySwapOutput(confirmed, stake, stake), now), "deposit-sig"));
    const unknown = recoverOnLoad(pending, "unknown");
    const again = recoverOnLoad(fundingRestore(fundingSnapshot(unknown)), "none");
    expect(again).toMatchObject({ step: "deposit-unknown", depositSignature: "deposit-sig", swapSignature: "swap-sig" });
    expect(() => requestQuote(again, order)).toThrow(/current attempt/);
    expect(noteDepositStep(again, "confirmed")).toMatchObject({ step: "deposit-confirmed", depositSignature: "deposit-sig" });
    expect(confirmEscrowFunding(noteDepositStep(again, "confirmed"), true)).toMatchObject({ step: "room-funded", depositSignature: "deposit-sig" });
  });

  it("keeps a quote as a quote on reload and will not deposit before the swap", () => {
    const quotedStep = ready();
    expect(recoverOnLoad(quotedStep, "none")).toEqual(quotedStep);
    expect(quotedStep.step).not.toBe("room-funded");
    expect(() => prepareDepositStep(quotedStep, now)).toThrow(/Confirm the swap/);
    const signed = signSwapStep(prepareSwapStep(quotedStep, now), "swap-sig");
    expect(recoverOnLoad(signed, "none")).toMatchObject({ step: "swap-unknown", signature: "swap-sig" });
    expect(() => requestQuote(signed, order)).toThrow(/current attempt/);
  });

  it("does not call a short swap a funded room", () => {
    const confirmed = noteSwapStep(signSwapStep(prepareSwapStep(ready(), now), "swap-sig"), "confirmed");
    const short = verifySwapOutput(confirmed, stake - 1n, stake);
    expect(short.step).toBe("recovery-required");
    expect(() => prepareSwapStep(short, now)).toThrow(/no quote/);
  });

  it("refuses a different wallet while an attempt is open", () => {
    expect(() => assertFundingWallet("wallet-a", "wallet-b")).toThrow(/wallet changed/i);
    expect(() => assertFundingWallet("wallet-a", "wallet-a")).not.toThrow();
    const unknown = noteSwapStep(signSwapStep(prepareSwapStep(ready(), now), "swap-sig"), "unknown");
    expect(() => requestQuote(unknown, order)).toThrow(/current attempt/);
  });
});
