import { describe, expect, it } from "vitest";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { createCompetitionStore } from "./store";
import { prepareCompetitionRequest } from "./funded";
import type { FundedConfig, VerifiedChainRoom } from "./types";
import type { CompetitionChain } from "./chain";

const config: FundedConfig = { program: "program", authority: "authority", mint: "test-mint", decimals: 6, playMs: 60000, graceMs: 60000 };
function fixture() {
  let time = 1800000000000;
  const store = createCompetitionStore(() => time, undefined, config);
  const url = (path: string) => new URL(`https://soldoku.test/api/competitions${path}`);
  const call = (path: string, body: Record<string, unknown> = {}) => store.route("POST", url(path), body) as any;
  const auth = (key = nacl.sign.keyPair()) => {
    const wallet = bs58.encode(key.publicKey); const proof = call("/proof", { wallet });
    return { ...call("/authorize", { id: proof.id, signature: bs58.encode(nacl.sign.detached(new TextEncoder().encode(proof.message), key.secretKey)) }), key };
  };
  const owner = auth(); const b = auth(); const c = auth();
  const gate = call("/check", { actor: owner.actor }); call("/check/verify", { actor: owner.actor, id: gate.id, value: gate.target });
  const created = call("/create", { actor: owner.actor, gateId: gate.id, mode: "tokens", mint: config.mint, stakeUnits: "1000000", level: "easy", durationMs: 60000 });
  const context = store.fundingContext(created.code, owner.actor);
  const chain: VerifiedChainRoom = { id: context.terms.id, creator: owner.wallet, authority: config.authority, mint: config.mint, stakeUnits: "1000000",
    startsAt: context.terms.startsAt, endsAt: context.endsAt, refundAt: context.terms.refundAt, status: "open", winner: null,
    chainTime: time, participants: 3, entries: [owner, b, c].map(player => ({ wallet: player.wallet, claimed: false })) };
  let sends = 0;
  const adapter: CompetitionChain = { config, cluster: "localnet", verify: async () => {}, read: async () => chain,
    transaction: async () => ({ transaction: "prepared", action: "deposit", wallet: owner.wallet, cluster: "localnet", room: "pda", mint: config.mint,
      stakeUnits: "1000000", startsAt: chain.startsAt, endsAt: chain.endsAt, refundAt: chain.refundAt, expiresAtBlockHeight: 100 }),
    settle: async () => { sends++; return "settlement-signature"; }, submit: async () => { sends++; return "submitted-signature"; },
    faucetConfigured: false, testerBalances: async () => ({ solLamports: 0, testUnits: 0n }), fundTester: async () => { throw new Error("unused"); } };
  const prepare = (path: string, body: Record<string, unknown>) => prepareCompetitionRequest(store, adapter, "POST", url(path), body);
  return { store, call, auth, owner, b, c, created, chain, adapter, prepare, setTime: (at: number) => { time = at; }, sends: () => sends };
}
describe("funded leaderboard admission and integrity", () => {
  it("keeps intents unfunded and blocks free-join bypass until actual verified entries are supplied", () => {
    const f = fixture(); expect(f.created.participants).toBe(0); expect(f.created.you).toBeNull();
    expect(f.created.funded.chainStatus).toBe("pending");
    expect(() => f.call("/join", { code: f.created.code, actor: f.b.actor, signature: "fake" })).toThrow(/deposit/);
    expect(() => f.call("/start", { code: f.created.code, actor: f.owner.actor })).toThrow(/Join/);
    f.store.syncChain(f.created.code, f.chain);
    expect(f.call("/state", { code: f.created.code, actor: f.b.actor }).participants).toBe(3);
    expect(f.call("/state", { code: f.created.code, actor: f.b.actor }).you.givens).toBeNull();
    f.store.syncChain(f.created.code, f.chain);
    expect(JSON.parse(f.store.snapshot()).rooms[0].entrants).toHaveLength(3);
    expect(() => f.call("/extend", { code: f.created.code, actor: f.owner.actor, durationMs: 60000 })).toThrow(/transaction/);
  });
  it("reveals the same grid only after chain registration closes, with a common timer and wallet-bound resume", async () => {
    const f = fixture(); const body = { code: f.created.code, actor: f.b.actor };
    f.setTime(f.chain.startsAt);
    await expect(f.prepare("/start", body)).rejects.toThrow(/Registration/);
    f.chain.chainTime = f.chain.startsAt;
    const b = (await f.prepare("/start", body)).result as any;
    f.setTime(f.chain.startsAt + 5000);
    const owner = (await f.prepare("/start", { code: f.created.code, actor: f.owner.actor })).result as any;
    expect(owner.you.startedAt).toBe(b.you.startedAt); expect(owner.you.startedAt).toBe(f.chain.startsAt);
    expect(owner.you.givens).toEqual(b.you.givens); expect(JSON.stringify(owner)).not.toContain("solution");
    const session = f.auth(f.b.key);
    expect((await f.prepare("/start", { code: f.created.code, actor: session.actor })).result).toMatchObject({ you: { startedAt: f.chain.startsAt } });
  });
  it("never admits unverified deposits or modifies immutable terms", () => {
    const f = fixture(); const before = f.store.snapshot();
    for (const patch of [{ stakeUnits: "2000000" }, { authority: "attacker" }, { mint: "fake" }, { creator: f.b.wallet },
      { participants: 2 }, { entries: [f.chain.entries[0], f.chain.entries[0], f.chain.entries[2]] }, { endsAt: f.chain.endsAt + 1 }]) {
      expect(() => f.store.syncChain(f.created.code, { ...f.chain, ...patch })).toThrow(/immutable/);
      expect(f.store.snapshot()).toBe(before);
    }
  });
  it("does not write clock-only polls between finalized gates, but advances every required gate", () => {
    const f = fixture(); f.store.syncChain(f.created.code, f.chain);
    let before = f.store.snapshot();
    f.chain.chainTime += 1000; f.store.syncChain(f.created.code, f.chain);
    expect(f.store.snapshot()).toBe(before);
    for (const boundary of [f.chain.startsAt, f.chain.endsAt, f.chain.refundAt]) {
      f.chain.chainTime = boundary; f.store.syncChain(f.created.code, f.chain);
      expect(f.call("/state", { code: f.created.code, actor: f.owner.actor }).funded.chainTime).toBe(boundary);
      before = f.store.snapshot();
      f.chain.chainTime = boundary + 1000; f.store.syncChain(f.created.code, f.chain);
      expect(f.store.snapshot()).toBe(before);
      expect(() => f.store.syncChain(f.created.code, { ...f.chain, chainTime: boundary - 1 })).toThrow(/regressed/);
    }
  });
  it("preserves attempt sequences, rejects forged timing, and derives the winner only from accepted moves", async () => {
    const f = fixture(); f.chain.chainTime = f.chain.startsAt; f.setTime(f.chain.startsAt);
    await f.prepare("/start", { code: f.created.code, actor: f.b.actor });
    const persisted = JSON.parse(f.store.snapshot()).rooms[0]; const values = [...persisted.puzzle.givens];
    let sequence = 0;
    for (const index of values.flatMap((value, index) => value ? [] : [index])) {
      f.setTime(f.chain.startsAt + 16000 + sequence * 200);
      values[index] = persisted.puzzle.solution[index];
      f.call("/move", { code: f.created.code, actor: f.b.actor, values, sequence: ++sequence, completedMs: 1, winner: f.owner.wallet });
    }
    const completed = f.call("/state", { code: f.created.code, actor: f.b.actor });
    expect(completed.you.completedMs).toBeGreaterThan(15000);
    expect(() => f.call("/move", { code: f.created.code, actor: f.b.actor, values, sequence: sequence + 1 })).toThrow(/finished/);
    f.setTime(f.chain.endsAt); f.chain.chainTime = f.chain.endsAt;
    expect(f.store.fundingContext(f.created.code, f.owner.actor).outcome).toMatchObject({ kind: "winner", wallet: f.b.wallet });
    await f.prepare("/settle", { code: f.created.code, actor: f.owner.actor, winner: f.c.wallet, completedMs: 1 });
    expect(f.sends()).toBe(0);
  });
  it("defers broadcasts until persistence succeeds, so preparing a CAS retry cannot resend", async () => {
    const f = fixture(); f.setTime(f.chain.endsAt); f.chain.chainTime = f.chain.endsAt;
    const body = { code: f.created.code, actor: f.owner.actor };
    const first = await f.prepare("/settle", body); const retry = await f.prepare("/settle", body);
    expect(f.sends()).toBe(0); expect(first.afterCommit).toBeDefined();
    expect(await retry.afterCommit!()).toEqual({ signature: "settlement-signature" }); expect(f.sends()).toBe(1);
  });
  it("rejects stale chain state that tries to reopen an awarded room or clear a claim", () => {
    const f = fixture(); f.store.syncChain(f.created.code, { ...f.chain, status: "paid", winner: f.b.wallet,
      entries: f.chain.entries.map(entry => ({ ...entry, claimed: entry.wallet === f.b.wallet })) });
    const before = f.store.snapshot();
    expect(() => f.store.syncChain(f.created.code, f.chain)).toThrow(/regressed/);
    expect(f.store.snapshot()).toBe(before);
  });
});
