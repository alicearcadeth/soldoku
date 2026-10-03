import type { createCompetitionStore } from "./store";
import type { CompetitionChain } from "./chain";

type Store = ReturnType<typeof createCompetitionStore>;
export type CompetitionRequest = { result: unknown; afterCommit?: () => Promise<unknown> };

/** Read/prepare inside persistence retries; broadcast only after the state write succeeds. */
export async function prepareCompetitionRequest(store: Store, chain: CompetitionChain | undefined, method: string, url: URL,
  body: Record<string, unknown>): Promise<CompetitionRequest> {
  if (method === "GET" && url.pathname === "/api/competitions/config") {
    if (!chain) return { result: { enabled: false, reason: "Multi-player Devnet escrow is not configured." } };
    try { await chain.verify(); return { result: { enabled: true, cluster: chain.cluster, ...chain.config } }; }
    catch (error) { return { result: { enabled: false, reason: error instanceof Error ? error.message : "Competition escrow is unavailable." } }; }
  }
  const special = ["/transaction", "/submit", "/sync", "/settle"].some(path => url.pathname === `/api/competitions${path}`);
  if (special) {
    if (method !== "POST") throw new Error("Use POST for escrow actions.");
    if (!chain) throw new Error("The multi-player competition escrow is not configured.");
    const context = store.fundingContext(body.code, body.actor);
    if (url.pathname.endsWith("/submit")) {
      return { result: null, afterCommit: async () => ({ signature: await chain.submit(body.transaction, context.wallet) }) };
    }
    await chain.verify();
    const verified = await chain.read(context);
    if (verified) store.syncChain(body.code, verified);
    const latest = store.fundingContext(body.code, body.actor);
    if (url.pathname.endsWith("/settle")) {
      if (!verified) throw new Error("This room has no confirmed escrow deposits.");
      if (!verified.entries.some(entry => entry.wallet === context.wallet)) throw new Error("Join this competition before requesting settlement.");
      return { result: null, afterCommit: async () => ({ signature: await chain.settle(latest) }) };
    }
    if (url.pathname.endsWith("/transaction")) return { result: await chain.transaction(latest, String(body.action), body.durationMs) };
    return { result: store.route("POST", new URL("/api/competitions/state", url), body) };
  }
  if (method === "POST" && url.pathname.endsWith("/create") && body.mode === "tokens") {
    if (!chain) throw new Error("Token entry is unavailable: the multi-player Devnet escrow is not configured. No tokens were taken.");
    await chain.verify();
  }
  // No grid until the blockchain itself has closed registration. Free rooms skip RPC.
  if (method === "POST" && url.pathname.endsWith("/start")) {
    const view = store.route("POST", new URL("/api/competitions/state", url), body) as { funded?: unknown };
    if (view.funded) {
      if (!chain) throw new Error("The competition escrow is unavailable.");
      await chain.verify();
      const verified = await chain.read(store.fundingContext(body.code, body.actor));
      if (!verified) throw new Error("Your escrow deposit is not confirmed.");
      store.syncChain(body.code, verified);
    }
  }
  return { result: store.route(method, url, body) };
}
