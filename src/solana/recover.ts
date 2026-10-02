/** Pending and settled saves are different, so a later confirmation can replace a pending history row. */
export function historyStamp(staked: boolean, chain: string | null | undefined): string {
  if (!staked) return "free";
  return chain === "settled" || chain === "refunded" ? chain : "pending";
}

/** A settled or refunded room response can correct a history row that was saved while payment was still pending. */
export function settledChainUpdate(result: unknown): { code: string; chain: "settled" | "refunded" } | null {
  if (!result || typeof result !== "object") return null;
  const row = result as { code?: unknown; chain?: unknown };
  if (typeof row.code !== "string" || (row.chain !== "settled" && row.chain !== "refunded")) return null;
  return { code: row.code, chain: row.chain };
}

/** A saved signature is rechecked. A new signature is signed only after the old one has expired. */
export function depositClick(pending: boolean, lastError: string | null): "recheck" | "sign" {
  if (pending && !/expired|deadline/i.test(lastError ?? "")) return "recheck";
  return "sign";
}

/** Fill a missing settlement signature from the durable table. A signature already on the room stays. */
export function applySettleSignatures(body: string, signatures: Readonly<Record<string, string>>): string {
  if (!body) return body;
  const parsed = JSON.parse(body) as { rooms?: { code?: string; settleSignature?: string }[] };
  let changed = false;
  for (const room of parsed.rooms ?? []) {
    const saved = room.code ? signatures[room.code] : undefined;
    if (saved && room.settleSignature !== saved) {
      room.settleSignature = saved;
      changed = true;
    }
  }
  return changed ? JSON.stringify(parsed) : body;
}

export function settleSignaturesIn(body: string): { code: string; signature: string }[] {
  if (!body) return [];
  const parsed = JSON.parse(body) as { rooms?: { code?: string; settleSignature?: string }[] };
  return (parsed.rooms ?? []).flatMap((room) => (
    room.code && room.settleSignature ? [{ code: room.code, signature: room.settleSignature }] : []
  ));
}

/** Status 2 is settled. An unknown or confirmed signature is rechecked. A new settlement is sent only when there is nothing to recheck. */
export function settlementStep(status: number | null, known: "none" | "unknown" | "confirmed" | "failed"): "send" | "wait" | "done" {
  if (status === 2) return "done";
  if (known === "unknown" || known === "confirmed") return "wait";
  return "send";
}

/** Waiting matches can still be joined. Active matches play until the settle deadline. */
export function refundOpen(status: number | null, joinDeadline: number | null, settleDeadline: number | null, nowSec: number): boolean {
  if (status === 3) return true;
  if (status === 0) return joinDeadline != null && nowSec >= joinDeadline;
  if (status === 1) return settleDeadline != null && nowSec >= settleDeadline;
  return false;
}
