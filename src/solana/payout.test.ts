import { describe, expect, it } from "vitest";
import { payouts } from "./payout";

describe("stake payout", () => {
  it("pays the winner both deposits and refunds a tie", () => {
    expect(
      payouts(1, { outcome: "win", winnerId: "alice", reason: "finished-first" }, ["alice", "bob"]),
    ).toEqual([{ to: "alice", amount: 2 }]);
    expect(payouts(1, { outcome: "draw", reason: "same-progress" }, ["alice", "bob"])).toEqual([
      { to: "alice", amount: 1 },
      { to: "bob", amount: 1 },
    ]);
  });
});
