import type { createCompetitionStore } from "./store";
import type { CompetitionChain } from "./chain";
import type { RelayBinding } from "./escrow";
import { advanceRoomSettlement, type SettlementPersist } from "./settlement";
import { planTesterGrant } from "./testerFunds";
import type { CompetitionView } from "./types";

type Store = ReturnType<typeof createCompetitionStore>;
export type CompetitionRequest = { result: unknown; afterCommit?: () => Promise<unknown> };

/** Read/prepare inside persistence retries; broadcast only after the state write succeeds. */
const PAUSED = "New funded rooms are paused. Claims, refunds, and settlement still work.";
export async function prepareCompetitionRequest(store: Store, chain: CompetitionChain | undefined, method: string, url: URL,
  body: Record<string, unknown>, options?: { paused?: boolean; persist?: SettlementPersist }): Promise<CompetitionRequest> {
  if (method === "GET" && url.pathname === "/api/competitions/config") {
    if (!chain) return { result: { enabled: false, reason: "Multi-player Devnet escrow is not configured." } };
    try { await chain.verify(); return { result: { enabled: true, cluster: chain.cluster, testerFaucet: chain.faucetConfigured, ...chain.config } }; }
    catch (error) { return { result: { enabled: false, reason: error instanceof Error ? error.message : "Competition escrow is unavailable." } }; }
  }
  if (method === "POST" && url.pathname === "/api/competitions/faucet") {
    if (!chain) throw new Error("Tester funding is unavailable until the Devnet competition escrow is configured.");
    const context = store.faucetContext(body.actor);
    const balances = await chain.testerBalances(context.wallet);
    const plan = planTesterGrant({ ...balances, lastGrantAt: context.lastGrantAt, now: context.now, faucetConfigured: chain.faucetConfigured, recentGrants: context.recentGrants });
    store.reserveFaucet(context.wallet, context.now);
    return { result: null, afterCommit: async () => {
      try { return await chain.fundTester(context.wallet, plan); }
      catch (error) { store.releaseFaucet(context.wallet, context.now); throw error; }
    } };
  }
  const special = ["/transaction", "/submit", "/sync", "/settle"].some(path => url.pathname === `/api/competitions${path}`);
  if (special) {
    if (method !== "POST") throw new Error("Use POST for escrow actions.");
    if (!chain) throw new Error("The multi-player competition escrow is not configured.");
    if (options?.paused && (url.pathname.endsWith("/transaction") || url.pathname.endsWith("/submit")) && body.action === "deposit") {
      throw new Error("New deposits are paused. Claims, refunds, and settlement still work.");
    }
    const context = store.fundingContext(body.code, body.actor);
    if (url.pathname.endsWith("/submit")) {
      const action = body.action;
      if (action !== "deposit" && action !== "extend" && action !== "claim") throw new Error("Unknown competition transaction action.");
      const binding: RelayBinding = { action, wallet: context.wallet, roomId: context.terms.id, mint: context.terms.mint, stake: context.terms.stakeUnits,
        authority: context.terms.authority, owner: context.owner, startsAt: context.terms.startsAt, endsAt: context.endsAt, refundAt: context.terms.refundAt, program: context.terms.program };
      return { result: null, afterCommit: async () => ({ signature: await chain.submit(body.transaction, context.wallet, binding) }) };
    }
    await chain.verify();
    const verified = await chain.read(context);
    if (verified) store.syncChain(body.code, verified);
    const latest = store.fundingContext(body.code, body.actor);
    if (url.pathname.endsWith("/settle")) {
      if (!verified) throw new Error("This room has no confirmed escrow deposits.");
      if (!verified.entries.some(entry => entry.wallet === context.wallet)) throw new Error("Join this competition before requesting settlement.");
      const prepareSettlement = chain.prepareSettlement;
      const broadcastSettlement = chain.broadcastSettlement;
      const observeSettlement = chain.observeSettlement;
      if (prepareSettlement && broadcastSettlement && observeSettlement && options?.persist) {
        const code = String(body.code);
        return { result: null, afterCommit: async () => {
          const report = await advanceRoomSettlement(store, { read: chain.read, prepareSettlement, broadcastSettlement, observeSettlement }, code, options.persist!, Date.now());
          return { signature: report.signature, confirmed: report.confirmed, status: report.status, ...(report.attention ? { attention: report.attention } : {}) };
        } };
      }
      return { result: null, afterCommit: async () => ({ signature: await chain.settle(latest) }) };
    }
    if (url.pathname.endsWith("/transaction")) return { result: await chain.transaction(latest, String(body.action), body.durationMs) };
    return { result: store.route("POST", new URL("/api/competitions/state", url), body) };
  }
  if (method === "POST" && url.pathname.endsWith("/create") && body.mode === "tokens") {
    if (options?.paused) throw new Error(PAUSED);
    if (!chain) throw new Error("Token entry is unavailable: the multi-player Devnet escrow is not configured. No tokens were taken.");
    await chain.verify();
  }
  // No grid until the blockchain itself has closed registration. Free rooms skip RPC.
  if (method === "POST" && url.pathname.endsWith("/start")) {
    const view = store.route("POST", new URL("/api/competitions/state", url), body) as CompetitionView;
    if (view.funded) {
      if (!chain) throw new Error("The competition escrow is unavailable.");
      await chain.verify();
      const terms = view.funded;
      // Finalized admission and the closed registration gate are already persisted by sync.
      // Re-reading RPC during every D1 retry lets other rooms' polls starve a ready start.
      const ready = view.you && !view.you.claimed && terms.chainStatus === "open" && terms.confirmedParticipants >= 2
        && terms.chainTime >= terms.startsAt && terms.program === chain.config.program && terms.authority === chain.config.authority
        && terms.mint === chain.config.mint && terms.decimals === chain.config.decimals;
      if (!ready) {
        const verified = await chain.read(store.fundingContext(body.code, body.actor));
        if (!verified) throw new Error("Your escrow deposit is not confirmed.");
        store.syncChain(body.code, verified);
      }
    }
  }
  return { result: store.route(method, url, body) };
}
