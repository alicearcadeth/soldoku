import { describe, expect, it } from "vitest";
import { DEPOSIT_HOLD_NOTE, NEW_DEPOSITS_HELD } from "./depositHold";

describe("deposit hold", () => {
  it("keeps new deposits paused without telling the player to retry", () => {
    expect(NEW_DEPOSITS_HELD).toBe(true);
    expect(DEPOSIT_HOLD_NOTE).toMatch(/paused/i);
    expect(DEPOSIT_HOLD_NOTE).toMatch(/refund/i);
    expect(DEPOSIT_HOLD_NOTE).not.toMatch(/try again/i);
  });
});
