import type { CompetitionChain, PreparedSettlement, SettlementObservation } from "./chain";
import type { createCompetitionStore } from "./store";
import type { SettlementAttempt, SettlementPhase } from "./types";

type Store = ReturnType<typeof createCompetitionStore>;
type SettlementChain = {
  read: CompetitionChain["read"];
  prepareSettlement: NonNullable<CompetitionChain["prepareSettlement"]>;
  broadcastSettlement: NonNullable<CompetitionChain["broadcastSettlement"]>;
  observeSettlement: NonNullable<CompetitionChain["observeSettlement"]>;
};
export const SETTLEMENT_REFUND_WARNING_MS = 10 * 60 * 1000;
const phaseRank: Record<SettlementPhase, number> = { prepared: 1, broadcast: 2, unknown: 2, failed: 2, expired: 2, confirmed: 3 };

export type SettlementPersist = () => Promise<"saved" | "conflict" | "error">;
export type SettlementAdvance = { confirmed: boolean; signature: string | null; status: SettlementPhase | "refused"; attention?: string; handedOff?: boolean };

function listAttempts(funded?: { settlement?: SettlementAttempt; settlementAlso?: SettlementAttempt[] }): SettlementAttempt[] {
  if (!funded) return [];
  return [funded.settlement, ...(funded.settlementAlso ?? [])].filter((item): item is SettlementAttempt => Boolean(item));
}

function sameSignature(current: SettlementAttempt, local: SettlementAttempt): SettlementAttempt {
  return phaseRank[local.phase] >= phaseRank[current.phase] ? local : current;
}

/** Keep every signature that may have been broadcast. A newer prepared transaction must not hide an older one. */
export function mergeSettlementFields(currentRaw: string, localRaw: string, codes: string[]): string {
  const current = JSON.parse(currentRaw) as { rooms: { code: string; entrants?: { actor: string; claimed?: boolean }[]; funded?: Record<string, unknown> }[] };
  const local = JSON.parse(localRaw) as { rooms: { code: string; entrants?: { actor: string; claimed?: boolean }[]; funded?: { settlement?: SettlementAttempt; settlementAlso?: SettlementAttempt[]; settlementSignature?: string; settlementAlert?: string } }[] };
  for (const code of codes) {
    const into = current.rooms.find(item => item.code === code);
    const from = local.rooms.find(item => item.code === code);
    if (!into?.funded || !from?.funded) continue;
    const localFunded = from.funded;
    const bySignature = new Map<string, SettlementAttempt>();
    for (const attempt of [...listAttempts(into.funded as { settlement?: SettlementAttempt; settlementAlso?: SettlementAttempt[] }), ...listAttempts(from.funded)]) {
      const previous = bySignature.get(attempt.signature);
      bySignature.set(attempt.signature, previous ? sameSignature(previous, attempt) : attempt);
    }
    const attempts = [...bySignature.values()];
    const preferred = (into.funded.settlement as SettlementAttempt | undefined)?.signature;
    const confirmed = attempts.find(item => item.phase === "confirmed");
    const chosen = confirmed ?? attempts.find(item => item.signature === preferred) ?? attempts.find(item => item.phase !== "failed" && item.phase !== "expired") ?? attempts[0];
    if (chosen) {
      into.funded.settlement = chosen;
      const rest = attempts.filter(item => item.signature !== chosen.signature);
      if (rest.length) into.funded.settlementAlso = rest;
      else delete into.funded.settlementAlso;
    }
    const signature = into.funded.settlementSignature as string | undefined;
    if (!signature && localFunded.settlementSignature && (localFunded.settlementSignature === "chain-closed" || attempts.some(item => item.signature === localFunded.settlementSignature && item.phase === "confirmed"))) {
      into.funded.settlementSignature = localFunded.settlementSignature;
    }
    if (!into.funded.settlementSignature && localFunded.settlementAlert && !into.funded.settlementAlert) into.funded.settlementAlert = localFunded.settlementAlert;
    for (const entrant of from.entrants ?? []) {
      if (!entrant.claimed) continue;
      const target = into.entrants?.find(item => item.actor === entrant.actor);
      if (target) target.claimed = true;
    }
  }
  return JSON.stringify(current);
}

function warn(store: Store, code: string, now: number, note: string) {
  const terms = store.settlementContext(code).terms;
  const close = terms.refundAt - now <= SETTLEMENT_REFUND_WARNING_MS;
  if (close || note) store.setSettlementAlert(code, close ? `${note} Refunds become available at ${terms.refundAt}.` : note);
}

function liveAttempts(store: Store, code: string) {
  return store.settlementAttempts(code).filter(item => item.phase !== "failed" && item.phase !== "expired");
}

/**
 * One step of the settlement lifecycle. The signed transaction is stored before it is sent.
 * A returned signature is not completion. Every signature that may have been broadcast stays until it fails or expires.
 */
export async function advanceRoomSettlement(store: Store, chain: SettlementChain,
  code: string, persist: SettlementPersist, now: number): Promise<SettlementAdvance> {
  let observed;
  try { observed = await chain.read(store.settlementContext(code)); }
  catch (error) {
    const note = error instanceof Error ? error.message : "Chain state could not be read.";
    warn(store, code, now, note);
    await persist();
    return { confirmed: false, signature: null, status: "unknown", attention: note };
  }
  if (observed && observed.status !== "open") {
    try { store.syncChain(code, observed); } catch { /* The chain outcome still stops another settlement send. */ }
    store.completeSettlement(code, "chain-closed");
    await persist();
    return { confirmed: true, signature: "chain-closed", status: "confirmed" };
  }
  if (observed) {
    try { store.syncChain(code, observed); }
    catch (error) {
      const note = error instanceof Error ? error.message : "Escrow observation does not match this room.";
      warn(store, code, now, note);
      await persist();
      return { confirmed: false, signature: null, status: "refused", attention: note };
    }
  }
  for (const existing of liveAttempts(store, code)) {
    const status = await chain.observeSettlement(existing.signature, existing.lastValidBlockHeight);
    if (status === "confirmed") {
      store.completeSettlement(code, existing.signature);
      await persist();
      return { confirmed: true, signature: existing.signature, status: "confirmed" };
    }
    if (status === "failed" || status === "expired") {
      store.stageSettlement(code, { ...existing, phase: status, note: status });
      await persist();
      continue;
    }
    const phase: SettlementPhase = status === "unknown" ? "unknown" : "broadcast";
    store.stageSettlement(code, { ...existing, phase, note: status === "unknown" ? "The signature status is not known yet." : existing.note });
    if (await persist() !== "saved") return { confirmed: false, signature: existing.signature, status: "unknown", attention: "Settlement progress could not be saved." };
    try { await chain.broadcastSettlement(existing.serialized); }
    catch {
      store.stageSettlement(code, { ...existing, phase: "unknown", note: "Broadcast response was lost. The same signed transaction is kept." });
      warn(store, code, now, "Broadcast response was lost.");
      await persist();
      return { confirmed: false, signature: existing.signature, status: "unknown", attention: "Broadcast response was lost." };
    }
    warn(store, code, now, status === "unknown" ? "Settlement is not confirmed." : "");
    await persist();
    return { confirmed: false, signature: existing.signature, status: phase, attention: status === "unknown" ? "Settlement is not confirmed." : undefined };
  }
  let prepared: PreparedSettlement | null;
  try { prepared = await chain.prepareSettlement(store.settlementContext(code)); }
  catch (error) {
    const note = error instanceof Error ? error.message : "Settlement was not prepared.";
    if (note.includes("refund")) warn(store, code, now, note);
    await persist();
    return { confirmed: false, signature: null, status: "refused", attention: note.includes("refund") ? note : undefined };
  }
  if (!prepared) {
    store.completeSettlement(code, "chain-closed");
    await persist();
    return { confirmed: true, signature: "chain-closed", status: "confirmed" };
  }
  const attempt: SettlementAttempt = { phase: "prepared", winner: prepared.winner, signature: prepared.signature, serialized: prepared.serialized,
    blockhash: prepared.blockhash, lastValidBlockHeight: prepared.lastValidBlockHeight, preparedAt: now };
  store.stageSettlement(code, attempt);
  if (await persist() !== "saved") return { confirmed: false, signature: null, status: "prepared", attention: "Settlement was not sent because its record was not saved." };
  const staged = store.settlementAttempt(code);
  if (!staged || staged.signature !== prepared.signature) return { confirmed: false, signature: staged?.signature ?? null, status: staged?.phase ?? "prepared", handedOff: true };
  try { await chain.broadcastSettlement(staged.serialized); }
  catch {
    store.stageSettlement(code, { ...staged, phase: "unknown", note: "Broadcast response was lost. The same signed transaction is kept." });
    warn(store, code, now, "Broadcast response was lost.");
    await persist();
    return { confirmed: false, signature: staged.signature, status: "unknown", attention: "Broadcast response was lost." };
  }
  store.stageSettlement(code, { ...staged, phase: "broadcast" });
  await persist();
  const status: SettlementObservation = await chain.observeSettlement(staged.signature, staged.lastValidBlockHeight);
  if (status === "confirmed") {
    store.completeSettlement(code, staged.signature);
    await persist();
    return { confirmed: true, signature: staged.signature, status: "confirmed" };
  }
  const phase: SettlementPhase = status === "pending" ? "broadcast" : status;
  store.stageSettlement(code, { ...staged, phase, note: status === "pending" ? "Submitted. Finality is not known yet." : status });
  if (status !== "pending") warn(store, code, now, `Settlement is ${status}.`);
  else warn(store, code, now, "");
  await persist();
  return { confirmed: false, signature: staged.signature, status: phase, attention: status === "pending" ? undefined : `Settlement is ${status}.` };
}
