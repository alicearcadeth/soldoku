import { describe, expect, it } from "vitest";
import { createMatchStore } from "./rooms";

describe("match audit", () => {
  it("records the room events without the solution", () => {
    let clock = 10_000;
    const store = createMatchStore(() => clock);
    const gate = store.issueCaptcha();
    store.checkCaptcha(gate.id, gate.target);
    const room = store.createRoom("easy", gate.id, "wallet-a");
    const created = store.auditFor(room.code);
    expect(created[0]).toMatchObject({ kind: "created", wallet: "wallet-a", seat: 0 });
    expect(created[0].puzzleHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(created)).not.toContain(JSON.stringify(room.givens));
    store.markDeposit(room.code, room.playerId);
    store.markDeposit(room.code, room.playerId);
    expect(store.auditFor(room.code).filter((event) => event.kind === "deposited")).toHaveLength(1);
    store.claimSeat(room.code, "wallet-a");
    store.noteSettlement(room.code, "settled");
    store.noteSettlement(room.code, "settled");
    store.noteClose(room.code, "close-sig");
    store.noteClose(room.code, "close-sig-again");
    const kinds = store.auditFor(room.code).map((event) => event.kind);
    expect(kinds).toEqual(["created", "deposited", "resumed", "settled", "closed"]);
    expect(store.auditFor(room.code).find((event) => event.kind === "settled")?.closeEligible).toBe(true);
    expect(store.auditFor(room.code).find((event) => event.kind === "closed")?.signature).toBe("close-sig");
    expect(store.state(room.code, room.playerId)).not.toHaveProperty("audit");
    expect(JSON.stringify(store.auditFor(room.code))).not.toContain("solution");
  });
});
