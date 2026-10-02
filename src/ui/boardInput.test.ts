import { describe, expect, it } from "vitest";
import { boardCommand, cellLabel, moveSelection, playerFacingError, roomStatusError, roomStatusRecovered, WALLET_SESSION_INCOMPLETE } from "./boardInput";

describe("board keys", () => {
  it("reads a digit and ignores the same key in a text field", () => {
    expect(boardCommand({ key: "2" })).toEqual({ type: "digit", digit: 2 });
    expect(boardCommand({ key: "2", target: { tagName: "INPUT" } as unknown as EventTarget })).toBeNull();
  });

  it("maps erase, notes, undo, and arrows", () => {
    expect(boardCommand({ key: "Backspace" })?.type).toBe("erase");
    expect(boardCommand({ key: "n" })?.type).toBe("notes");
    expect(boardCommand({ key: "z", ctrlKey: true })).toEqual({ type: "undo" });
    expect(moveSelection(0, "ArrowRight")).toBe(1);
    expect(moveSelection(0, "ArrowLeft")).toBe(8);
  });

  it("names a cell from its position", () => {
    expect(cellLabel(0, 0, false)).toBe("Row 1 column 1, empty");
    expect(cellLabel(10, 4, true)).toBe("Row 2 column 2, given 4");
    expect(cellLabel(0, 0, false, (1 << 1) | (1 << 7))).toBe("Row 1 column 1, notes 1 7");
    expect(cellLabel(0, 3, false, 0, true)).toBe("Row 1 column 1, entered 3, conflict");
  });

  it("turns a browser network failure into a player-facing sentence", () => {
    expect(playerFacingError(new TypeError("Failed to fetch"), "Move rejected")).toBe("You are offline. That action was not saved.");
    expect(playerFacingError(new Error("That room is full"), "Could not join")).toBe("That room is full");
    expect(playerFacingError(new Error("Failed to connect to the wallet websocket at ws://localhost:1/solana-wallet."), "Deposit was not confirmed")).toBe("The wallet did not respond. Try again.");
    expect(playerFacingError(new Error("authorization request failed"), "Wallet connection failed")).toBe("The wallet did not finish authorization. Try again.");
    expect(playerFacingError(new Error("D1_ERROR: Network connection lost."), "Request failed")).toBe("That action was not saved. Try again.");
    expect(playerFacingError(new Error("session timeout"), "Refund was not confirmed")).toBe(WALLET_SESSION_INCOMPLETE);
    expect(playerFacingError(new Error("session dropped"), "Deposit was not confirmed")).toBe(WALLET_SESSION_INCOMPLETE);
    expect(WALLET_SESSION_INCOMPLETE).not.toMatch(/try again/i);
  });

  it("clears a room refresh failure after the next successful load", () => {
    const refresh = "The room could not be refreshed. Try again.";
    expect(roomStatusError(null, "That action was not saved. Try again.")).toBe(refresh);
    expect(roomStatusError("The wallet declined the transaction.", "D1_ERROR: Network connection lost.")).toBe("The wallet declined the transaction.");
    expect(roomStatusRecovered(refresh)).toBeNull();
    expect(roomStatusRecovered("The wallet declined the transaction.")).toBe("The wallet declined the transaction.");
  });
});
