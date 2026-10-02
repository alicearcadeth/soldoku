import { describe, expect, it } from "vitest";
import { applySettleSignatures, depositClick, historyStamp, refundOpen, settledChainUpdate, settlementStep, settleSignaturesIn } from "./recover";

describe("submitted transaction retry", () => {
  it("rechecks an unknown deposit and signs again only after expiry", () => {
    expect(depositClick(false, null)).toBe("sign");
    expect(depositClick(true, "Deposit status is unknown. The same signature will be checked again.")).toBe("recheck");
    expect(depositClick(true, "The signed deposit expired before confirmation. It did not move funds. Sign a new deposit.")).toBe("sign");
    expect(depositClick(true, "The deposit deadline does not match this room")).toBe("sign");
  });

  it("keeps a waiting stake locked until the join window ends", () => {
    expect(refundOpen(0, 1_000, 2_000, 999)).toBe(false);
    expect(refundOpen(0, 1_000, 2_000, 1_000)).toBe(true);
    expect(refundOpen(1, 1_000, 2_000, 1_500)).toBe(false);
    expect(refundOpen(1, 1_000, 2_000, 2_000)).toBe(true);
    expect(refundOpen(2, 1_000, 2_000, 9_000)).toBe(false);
    expect(refundOpen(3, 1_000, 2_000, 0)).toBe(true);
  });

  it("does not send a second settlement while the first signature is unknown", () => {
    expect(settlementStep(1, "unknown")).toBe("wait");
    expect(settlementStep(1, "confirmed")).toBe("wait");
    expect(settlementStep(2, "unknown")).toBe("done");
    expect(settlementStep(1, "failed")).toBe("send");
    expect(settlementStep(1, "none")).toBe("send");
  });

  it("saves a pending stake again after the payment is confirmed", () => {
    expect(historyStamp(false, null)).toBe("free");
    expect(historyStamp(true, "pending")).toBe("pending");
    expect(historyStamp(true, "settled")).toBe("settled");
    expect(historyStamp(true, "refunded")).toBe("refunded");
    expect(settledChainUpdate({ code: "MBAY", chain: "settled" })).toEqual({ code: "MBAY", chain: "settled" });
    expect(settledChainUpdate({ code: "MBAY", chain: "pending" })).toBeNull();
  });

  it("keeps the first settlement signature when a later snapshot omits it", () => {
    const saved = JSON.stringify({ rooms: [{ code: "FJTY", chain: "pending", settleSignature: "sig-a" }] });
    const clobber = JSON.stringify({ rooms: [{ code: "FJTY", chain: "settled" }] });
    expect(settleSignaturesIn(saved)).toEqual([{ code: "FJTY", signature: "sig-a" }]);
    const restored = JSON.parse(applySettleSignatures(clobber, { FJTY: "sig-a" })) as { rooms: { settleSignature: string }[] };
    expect(restored.rooms[0].settleSignature).toBe("sig-a");
    const kept = applySettleSignatures(saved, { FJTY: "sig-a" });
    expect(kept).toBe(saved);
    const replaced = JSON.parse(applySettleSignatures(saved, { FJTY: "sig-first" })) as { rooms: { settleSignature: string }[] };
    expect(replaced.rooms[0].settleSignature).toBe("sig-first");
  });
});
