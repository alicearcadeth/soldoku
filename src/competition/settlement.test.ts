import { describe, expect, it } from "vitest";
import { createCompetitionStore } from "./store";
import { advanceRoomSettlement, mergeSettlementFields } from "./settlement";
import type { SettlementObservation } from "./chain";
import type { SettlementAttempt } from "./types";

const attempt = (patch: Partial<SettlementAttempt> = {}): SettlementAttempt => ({
  phase: "prepared", winner: "owner-wallet", signature: "sig-1", serialized: "same-bytes", blockhash: "block",
  lastValidBlockHeight: 20, preparedAt: 1, ...patch,
});
function room() {
  return {
    code: "DUE00001", owner: "owner-wallet", createdAt: 0, endsAt: 1_000_000,
    puzzle: { level: "easy", givens: [], solution: [] },
    entrants: [
      { actor: "owner-wallet", name: "a", startedAt: 0, completedMs: 20_000, values: [], sequence: 1, lastMoveAt: 0 },
      { actor: "other-wallet", name: "b", startedAt: 0, completedMs: 30_000, values: [], sequence: 1, lastMoveAt: 0, claimed: false as boolean },
    ],
    funded: {
      program: "program", authority: "authority", mint: "mint", decimals: 6, playMs: 60_000, graceMs: 3_600_000,
      id: "1", stakeUnits: "1000000", startsAt: 940_000, refundAt: 4_600_000,
      chainStatus: "open", confirmedParticipants: 2, chainTime: 1_000_000, winner: null,
    },
  };
}
function harness(seed = room()) {
  const store = createCompetitionStore(() => 2_000_000);
  store.replace(JSON.stringify({ rooms: [seed], gates: [], proofs: [], sessions: [], grants: [] }));
  const events: string[] = [];
  let observation: SettlementObservation = "confirmed";
  let next = attempt();
  let failSend = false;
  const chainRoom = {
    id: "1", creator: "owner-wallet", authority: "authority", mint: "mint", stakeUnits: "1000000",
    startsAt: 940_000, endsAt: 1_000_000, refundAt: 4_600_000, participants: 2, chainTime: 2_000_000,
    status: "open" as "open" | "awarded" | "refunding" | "paid", winner: null as string | null,
    entries: [{ wallet: "owner-wallet", claimed: false }, { wallet: "other-wallet", claimed: false }],
  };
  const chain = {
    read: async () => chainRoom,
    prepareSettlement: async () => { events.push("prepare"); return { serialized: next.serialized, signature: next.signature, blockhash: next.blockhash, lastValidBlockHeight: next.lastValidBlockHeight, winner: next.winner }; },
    broadcastSettlement: async (serialized: string) => { events.push(`broadcast:${serialized}`); if (failSend) throw new Error("dropped"); return next.signature; },
    observeSettlement: async (signature: string) => { events.push(`observe:${signature}`); return observation; },
  };
  const persist = async () => { events.push(`persist:${store.settlementAttempt("DUE00001")?.phase ?? "none"}:${store.settlementAttempt("DUE00001")?.signature ?? ""}`); return "saved" as const; };
  return { store, chain, events, chainRoom, persist, setObservation: (value: SettlementObservation) => { observation = value; }, setNext: (value: SettlementAttempt) => { next = value; }, setFailSend: (value: boolean) => { failSend = value; },
    advance: (code = "DUE00001") => advanceRoomSettlement(store, chain, code, persist, 2_000_000) };
}
describe("settlement recovery", () => {
  it("stores the signed transaction before broadcasting and completes only after finality", async () => {
    const h = harness();
    const report = await h.advance();
    expect(report).toMatchObject({ confirmed: true, signature: "sig-1", status: "confirmed" });
    expect(h.events.indexOf("persist:prepared:sig-1")).toBeLessThan(h.events.indexOf("broadcast:same-bytes"));
    expect(h.events.indexOf("broadcast:same-bytes")).toBeLessThan(h.events.indexOf("observe:sig-1"));
    expect(h.store.settlementAttempt("DUE00001")?.phase).toBe("confirmed");
    expect(h.store.dueSettlementCodes()).toEqual([]);
  });
  it("does not broadcast when the prepared record cannot be saved", async () => {
    const h = harness();
    const report = await advanceRoomSettlement(h.store, h.chain, "DUE00001", async () => "conflict", 2_000_000);
    expect(report.confirmed).toBe(false);
    expect(h.events.some(event => event.startsWith("broadcast"))).toBe(false);
  });
  it("keeps the same transaction when the send response is lost, then completes from chain status", async () => {
    const h = harness(); h.setFailSend(true);
    const lost = await h.advance();
    expect(lost).toMatchObject({ confirmed: false, signature: "sig-1", status: "unknown" });
    expect(h.store.dueSettlementCodes()).toEqual(["DUE00001"]);
    h.setFailSend(false); h.setObservation("confirmed"); h.events.length = 0;
    const recovered = await h.advance();
    expect(recovered.confirmed).toBe(true);
    expect(h.events).toContain("observe:sig-1");
    expect(h.events.some(event => event === "prepare")).toBe(false);
  });
  it("resends the original bytes while the signature is still pending", async () => {
    const h = harness(); h.setObservation("pending");
    await h.advance();
    h.events.length = 0;
    await h.advance();
    expect(h.events).toContain("broadcast:same-bytes");
    expect(h.events).not.toContain("prepare");
    expect(JSON.parse(h.store.snapshot()).rooms[0].funded.settlementSignature).toBeUndefined();
  });
  it("replaces a settlement only after the chain reports failure and keeps the failed signature", async () => {
    const h = harness(); h.setObservation("failed");
    await h.advance();
    expect(JSON.parse(h.store.snapshot()).rooms[0].funded.settlementSignature).toBeUndefined();
    h.setObservation("confirmed"); h.setNext(attempt({ signature: "sig-2", serialized: "replacement" }));
    const replaced = await h.advance();
    expect(replaced).toMatchObject({ confirmed: true, signature: "sig-2" });
    expect(h.events).toContain("broadcast:replacement");
    const funded = JSON.parse(h.store.snapshot()).rooms[0].funded;
    expect(funded.settlementAlso.map((item: { signature: string }) => item.signature)).toContain("sig-1");
  });
  it("completes a retained signature that confirms while another broadcast is still pending", async () => {
    const h = harness();
    h.store.stageSettlement("DUE00001", attempt({ signature: "sent-a", phase: "broadcast", serialized: "bytes-a" }));
    h.store.stageSettlement("DUE00001", attempt({ signature: "sent-b", phase: "unknown", serialized: "bytes-b" }));
    h.chain.observeSettlement = async (signature: string) => {
      h.events.push(`observe:${signature}`);
      return signature === "sent-b" ? "confirmed" : "pending";
    };
    const report = await h.advance();
    expect(report).toMatchObject({ confirmed: true, signature: "sent-b", status: "confirmed" });
    expect(h.events).toContain("observe:sent-a");
    expect(h.events).toContain("observe:sent-b");
    expect(h.events).not.toContain("prepare");
    expect(JSON.parse(h.store.snapshot()).rooms[0].funded.settlementSignature).toBe("sent-b");
  });
  it("does not let a stale broadcast observation erase a failed signature", () => {
    const current = room();
    const local = room();
    (current.funded as { settlement?: SettlementAttempt }).settlement = attempt({ signature: "sig-1", phase: "failed" });
    (local.funded as { settlement?: SettlementAttempt }).settlement = attempt({ signature: "sig-1", phase: "broadcast" });
    const merged = JSON.parse(mergeSettlementFields(JSON.stringify({ rooms: [current], gates: [], proofs: [], sessions: [], grants: [] }), JSON.stringify({ rooms: [local], gates: [], proofs: [], sessions: [], grants: [] }), ["DUE00001"]));
    expect(merged.rooms[0].funded.settlement.phase).toBe("failed");
  });
  it("does not prepare a replacement while another signature may still have been broadcast", async () => {
    const h = harness();
    h.store.stageSettlement("DUE00001", attempt({ signature: "sent-a", phase: "broadcast", serialized: "bytes-a" }));
    h.store.stageSettlement("DUE00001", attempt({ signature: "sent-b", phase: "unknown", serialized: "bytes-b" }));
    h.setObservation("pending");
    await h.advance();
    expect(h.events).not.toContain("prepare");
    const funded = JSON.parse(h.store.snapshot()).rooms[0].funded;
    const signatures = [funded.settlement.signature, ...funded.settlementAlso.map((item: { signature: string }) => item.signature)];
    expect(signatures).toEqual(expect.arrayContaining(["sent-a", "sent-b"]));
  });
  it("does not turn an uncertain closed-room signature into a chain-closed receipt", async () => {
    const h = harness();
    h.store.stageSettlement("DUE00001", attempt({ signature: "sent-a", phase: "unknown", serialized: "bytes-a" }));
    h.store.setSettlementAlert("DUE00001", "Settlement is unknown.");
    h.chainRoom.status = "awarded";
    h.chainRoom.winner = "owner-wallet";
    h.setObservation("unknown");
    const report = await h.advance();
    expect(report.confirmed).toBe(false);
    expect(h.events).not.toContain("prepare");
    expect(h.events.some(event => event.startsWith("broadcast"))).toBe(false);
    const funded = JSON.parse(h.store.snapshot()).rooms[0].funded;
    expect(funded.settlementSignature).toBeUndefined();
    expect(funded.settlement.phase).toBe("unknown");
    expect(funded.settlementAlert).toMatch(/not confirmed/i);
    h.events.length = 0;
    await h.advance();
    expect(h.events).not.toContain("prepare");
    expect(h.events.some(event => event.startsWith("broadcast"))).toBe(false);
  });
  it("promotes a retained signature when the escrow has already closed", async () => {
    const h = harness();
    h.store.stageSettlement("DUE00001", attempt({ signature: "sent-a", phase: "unknown", serialized: "bytes-a" }));
    h.store.setSettlementAlert("DUE00001", "Settlement is unknown.");
    h.chainRoom.status = "awarded";
    h.chainRoom.winner = "owner-wallet";
    h.setObservation("confirmed");
    const report = await h.advance();
    expect(report).toMatchObject({ confirmed: true, signature: "sent-a", status: "confirmed" });
    expect(h.events).toContain("observe:sent-a");
    expect(h.events).not.toContain("prepare");
    const funded = JSON.parse(h.store.snapshot()).rooms[0].funded;
    expect(funded.settlementSignature).toBe("sent-a");
    expect(funded.settlement.phase).toBe("confirmed");
    expect(funded.settlementAlert).toBe("");
  });
  it("replaces an expired blockhash only while the escrow is still open", async () => {
    const h = harness(); h.setObservation("expired");
    await h.advance();
    h.chainRoom.status = "awarded";
    h.events.length = 0;
    const closed = await h.advance();
    expect(closed).toMatchObject({ confirmed: true, signature: null });
    const funded = JSON.parse(h.store.snapshot()).rooms[0].funded;
    expect(funded.settlementSignature).toBeUndefined();
    expect(funded.settlementClosure).toBe("external");
    expect(h.events.some(event => event.startsWith("broadcast"))).toBe(false);
  });
  it("keeps the broadcast signature when the next cron finds it finalized", async () => {
    const h = harness();
    h.setObservation("unknown");
    await h.advance();
    expect(JSON.parse(h.store.snapshot()).rooms[0].funded.settlementSignature).toBeUndefined();
    h.chainRoom.status = "awarded";
    h.chainRoom.winner = "owner-wallet";
    h.setObservation("confirmed");
    h.events.length = 0;
    const reconciled = await h.advance();
    expect(reconciled).toMatchObject({ confirmed: true, signature: "sig-1" });
    expect(h.events).not.toContain("prepare");
    expect(h.events.some(event => event.startsWith("broadcast"))).toBe(false);
    const funded = JSON.parse(h.store.snapshot()).rooms[0].funded;
    expect(funded.settlement.phase).toBe("confirmed");
    expect(funded.settlementAlert).toBe("");
    h.events.length = 0;
    await h.advance();
    expect(h.events).toEqual([]);
  });
  it("keeps a winner claim that landed before receipt reconciliation", async () => {
    const h = harness();
    const seeded = JSON.parse(h.store.snapshot());
    seeded.rooms[0].entrants[0].claimed = true;
    seeded.rooms[0].entrants[0].sequence = 4;
    seeded.rooms[0].funded.chainStatus = "awarded";
    seeded.rooms[0].funded.winner = "owner-wallet";
    h.store.replace(JSON.stringify(seeded));
    h.store.stageSettlement("DUE00001", attempt({ signature: "sent-a", phase: "unknown" }));
    h.chainRoom.status = "paid";
    h.chainRoom.winner = "owner-wallet";
    h.chainRoom.entries[0].claimed = true;
    h.setObservation("confirmed");
    await h.advance();
    const roomState = JSON.parse(h.store.snapshot()).rooms[0];
    expect(roomState.funded.settlementSignature).toBe("sent-a");
    expect(roomState.funded.winner).toBe("owner-wallet");
    expect(roomState.entrants[0].claimed).toBe(true);
    expect(roomState.entrants[0].sequence).toBe(4);
    expect(roomState.entrants[1].claimed).toBe(false);
  });
  it("promotes the confirming signature and keeps the other pending signature", async () => {
    const h = harness();
    h.store.stageSettlement("DUE00001", attempt({ signature: "sent-a", phase: "broadcast", serialized: "bytes-a" }));
    h.store.stageSettlement("DUE00001", attempt({ signature: "sent-b", phase: "unknown", serialized: "bytes-b" }));
    h.chainRoom.status = "awarded";
    h.chainRoom.winner = "owner-wallet";
    h.chain.observeSettlement = async (signature: string) => {
      h.events.push(`observe:${signature}`);
      return signature === "sent-b" ? "confirmed" : "pending";
    };
    const report = await h.advance();
    expect(report).toMatchObject({ confirmed: true, signature: "sent-b" });
    expect(h.events).toContain("observe:sent-a");
    expect(h.events).toContain("observe:sent-b");
    expect(h.events.some(event => event.startsWith("broadcast"))).toBe(false);
    const funded = JSON.parse(h.store.snapshot()).rooms[0].funded;
    expect(funded.settlement.signature).toBe("sent-b");
    expect(funded.settlement.phase).toBe("confirmed");
    expect(funded.settlementAlso.map((item: { signature: string; phase: string }) => `${item.signature}:${item.phase}`)).toContain("sent-a:broadcast");
  });
  it("records an external closure without a synthetic receipt", async () => {
    const h = harness();
    h.chainRoom.status = "refunding";
    const report = await h.advance();
    expect(report).toMatchObject({ confirmed: true, signature: null });
    expect(h.events).not.toContain("prepare");
    const funded = JSON.parse(h.store.snapshot()).rooms[0].funded;
    expect(funded.settlementSignature).toBeUndefined();
    expect(funded.settlementClosure).toBe("external");
    expect(funded.settlementAlert).toBe("");
  });
  it("does not publish a closed-room receipt when the conditional write conflicts", async () => {
    const h = harness();
    h.store.stageSettlement("DUE00001", attempt({ signature: "sent-a", phase: "unknown" }));
    h.chainRoom.status = "awarded";
    h.chainRoom.winner = "owner-wallet";
    h.setObservation("confirmed");
    const report = await advanceRoomSettlement(h.store, h.chain, "DUE00001", async () => "conflict", 2_000_000);
    expect(report.confirmed).toBe(false);
    expect(h.events).not.toContain("prepare");
    expect(h.events.some(event => event.startsWith("broadcast"))).toBe(false);
  });
  it("keeps a concurrent claim and replaces a synthetic receipt during merge", () => {
    const current = room();
    current.funded.chainStatus = "paid";
    (current.funded as { winner: string | null }).winner = "owner-wallet";
    (current.funded as { settlementSignature?: string; settlement?: SettlementAttempt }).settlementSignature = "chain-closed";
    (current.funded as { settlement?: SettlementAttempt }).settlement = attempt({ signature: "sent-a", phase: "unknown" });
    const local = room();
    local.entrants[0].claimed = true;
    local.funded.chainStatus = "paid";
    (local.funded as { winner: string | null }).winner = "owner-wallet";
    (local.funded as { settlementSignature?: string; settlement?: SettlementAttempt }).settlementSignature = "sent-a";
    (local.funded as { settlement?: SettlementAttempt }).settlement = attempt({ signature: "sent-a", phase: "confirmed" });
    const merged = JSON.parse(mergeSettlementFields(JSON.stringify({ rooms: [current], gates: [], proofs: [], sessions: [], grants: [] }), JSON.stringify({ rooms: [local], gates: [], proofs: [], sessions: [], grants: [] }), ["DUE00001"]));
    expect(merged.rooms[0].funded.settlementSignature).toBe("sent-a");
    expect(merged.rooms[0].funded.settlement.phase).toBe("confirmed");
    expect(merged.rooms[0].entrants[0].claimed).toBe(true);
  });
  it("leaves the refund path open when settlement time has expired", async () => {
    const h = harness();
    h.chain.prepareSettlement = async () => { throw new Error("Settlement timed out. Each entrant can now claim their refund."); };
    const report = await h.advance();
    expect(report.confirmed).toBe(false);
    expect(JSON.parse(h.store.snapshot()).rooms[0].funded.settlementSignature).toBeUndefined();
    expect(JSON.parse(h.store.snapshot()).rooms[0].funded.settlementAlert).toMatch(/refund/i);
  });
  it("recovers a prepared transaction after a restart without signing a second one", async () => {
    const h = harness();
    h.store.stageSettlement("DUE00001", attempt());
    const restarted = createCompetitionStore(() => 2_000_000);
    restarted.replace(h.store.snapshot());
    h.setObservation("pending");
    await advanceRoomSettlement(restarted, h.chain, "DUE00001", async () => "saved", 2_000_000);
    expect(h.events.filter(event => event === "prepare")).toEqual([]);
    expect(h.events).toContain("broadcast:same-bytes");
  });
  it("does not award from server finishes that have no chain deposit", async () => {
    const h = harness();
    h.chainRoom.entries = [{ wallet: "other-wallet", claimed: false }];
    h.chainRoom.participants = 1;
    const report = await h.advance();
    expect(report.confirmed).toBe(false);
    expect(h.events).not.toContain("prepare");
  });
  it("merges a newer move, a claimed flag, and every signature that may have been broadcast", () => {
    const current = room();
    current.entrants[0].sequence = 9;
    const local = room();
    local.entrants[0].sequence = 1;
    local.entrants[1].claimed = true;
    (local.funded as { settlement?: SettlementAttempt }).settlement = attempt({ signature: "local-sig", phase: "unknown" });
    (current.funded as { settlement?: SettlementAttempt }).settlement = attempt({ signature: "first-sig", phase: "broadcast" });
    const merged = JSON.parse(mergeSettlementFields(JSON.stringify({ rooms: [current], gates: [], proofs: [], sessions: [], grants: [] }), JSON.stringify({ rooms: [local], gates: [], proofs: [], sessions: [], grants: [] }), ["DUE00001"]));
    expect(merged.rooms[0].entrants[0].sequence).toBe(9);
    expect(merged.rooms[0].entrants[1].claimed).toBe(true);
    expect(merged.rooms[0].funded.settlement.signature).toBe("first-sig");
    expect(merged.rooms[0].funded.settlementAlso.map((item: { signature: string }) => item.signature)).toContain("local-sig");
  });
});
