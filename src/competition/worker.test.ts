import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import nacl from "tweetnacl";
import bs58 from "bs58";
import worker from "../worker";
import { DAY_MS } from "./types";
import { competitionChain, type CompetitionChain } from "./chain";
import { createCompetitionStore } from "./store";
vi.mock("./chain", () => ({ competitionChain: vi.fn() }));

function database() {
  let saved: string | null = null;
  let conflicts = 0;
  let denials = 0;
  return {
    conflict: () => { conflicts++; },
    deny: (count: number) => { denials = count; },
    snapshot: () => saved,
    seed(body: string) { saved = body; },
    prepare(sql: string) {
      let args: unknown[] = [];
      const statement = {
        bind(...values: unknown[]) { args = values; return statement; },
        async first<T>() { return (saved ? { body: saved } : null) as T | null; },
        async all<T>() { return { results: [] as T[] }; },
        async run() {
          if (sql.startsWith("CREATE TABLE")) return { meta: { changes: 0 } };
          if (conflicts > 0) { conflicts--; return { meta: { changes: 0 } }; }
          if (denials > 0) { denials--; return { meta: { changes: 0 } }; }
          if (saved !== null && args[1] !== saved) return { meta: { changes: 0 } };
          saved = String(args[0]); return { meta: { changes: 1 } };
        },
      };
      return statement;
    },
  };
}
describe("Worker leaderboard persistence", () => {
  it("persists signed identity, slider, room and attempt through the Worker API and retries a write conflict", async () => {
    const db = database();
    const env = { DB: db, ASSETS: { fetch: async () => new Response("asset") } };
    async function request(path: string, body?: Record<string, unknown>) {
      const response = await worker.fetch(new Request(`https://sudoku.example/api/competitions${path}`, body ? { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } } : undefined), env);
      expect(response.status).toBe(200);
      return response.json() as Promise<Record<string, any>>;
    }
    const key = nacl.sign.keyPair(); const wallet = bs58.encode(key.publicKey);
    const proof = await request("/proof", { wallet });
    expect(proof.message).toContain("Origin: https://sudoku.example");
    const auth = await request("/authorize", { id: proof.id, signature: bs58.encode(nacl.sign.detached(new TextEncoder().encode(proof.message), key.secretKey)) });
    const gate = await request("/check", { actor: auth.actor });
    await request("/check/verify", { actor: auth.actor, id: gate.id, value: gate.target });
    db.conflict();
    const room = await request("/create", { actor: auth.actor, gateId: gate.id, mode: "free", level: "easy", durationMs: DAY_MS });
    const first = await request("/start", { code: room.code, actor: auth.actor });
    const second = await request("/start", { code: room.code, actor: auth.actor });
    expect(second.you.startedAt).toBe(first.you.startedAt);
    const publicRooms = await request("");
    expect(publicRooms.rooms).toHaveLength(1);
    expect(JSON.stringify(publicRooms)).not.toMatch(/solution|givens|actor/);
    const refused = await worker.fetch(new Request("https://sudoku.example/api/competitions/create", { method: "POST", body: JSON.stringify({ actor: auth.actor, mode: "tokens" }) }), env);
    expect(refused.status).toBe(400);
    expect(await refused.json()).toMatchObject({ error: expect.stringMatching(/Token entry is unavailable/) });
  });
  it("starts from a persisted finalized registration gate while another room is being polled", async () => {
    const db = database(); const at = Date.now();
    const key = nacl.sign.keyPair(); const wallet = bs58.encode(key.publicKey);
    const config = { program: "program", authority: "authority", mint: "mint", decimals: 6, playMs: 60000, graceMs: 60000 };
    const terms = { ...config, id: "10", stakeUnits: "1000000", startsAt: at - 1000, refundAt: at + 119000,
      chainStatus: "open", confirmedParticipants: 2, chainTime: at, winner: null };
    const entrants = [wallet, "other-wallet"].map(actor => ({ actor, name: actor, startedAt: null, completedMs: null, values: Array(81).fill(0), sequence: 0, lastMoveAt: 0, claimed: false }));
    const target = { code: "READY001", owner: wallet, createdAt: at - 60000, endsAt: at + 59000, puzzle: { level: "easy", givens: Array(81).fill(0), solution: Array(81).fill(1) }, entrants, funded: terms };
    db.seed(JSON.stringify({ rooms: [target, { ...target, code: "OTHER001", name: "Other room" }], gates: [], proofs: [],
      sessions: [{ id: "signed-session", wallet, expires: at + DAY_MS }], grants: [] }));
    let polls = 0;
    const read = vi.fn(async () => {
      // A different browser finishes its chain poll while this request is waiting on RPC.
      const observation = { id: "10", creator: wallet, authority: config.authority, mint: config.mint, stakeUnits: "1000000", startsAt: terms.startsAt,
        endsAt: target.endsAt, refundAt: terms.refundAt, status: "open", winner: null, chainTime: at, participants: 2,
        entries: entrants.map(entry => ({ wallet: entry.actor, claimed: false })) } as const;
      const otherPoll = createCompetitionStore(Date.now, undefined, config); otherPoll.replace(db.snapshot());
      otherPoll.syncChain("OTHER001", { ...observation, chainTime: at + (++polls) * 1000 });
      db.seed(otherPoll.snapshot());
      return observation;
    });
    const transaction = vi.fn(async () => ({ transaction: "unsigned", action: "deposit", wallet, cluster: "devnet", room: "pda", mint: config.mint,
      stakeUnits: "1000000", startsAt: terms.startsAt, endsAt: target.endsAt, refundAt: terms.refundAt, expiresAtBlockHeight: 1 }));
    const chain = { config, cluster: "devnet", verify: vi.fn(async () => {}), read, submit: vi.fn(), transaction, settle: vi.fn(),
      faucetConfigured: false, testerBalances: vi.fn(), fundTester: vi.fn() } as CompetitionChain;
    vi.mocked(competitionChain).mockReturnValue(chain);
    try {
      const env = { DB: db, ASSETS: { fetch: async () => new Response("asset") } };
      const request = () => worker.fetch(new Request("https://soldoku.test/api/competitions/start", { method: "POST",
        body: JSON.stringify({ code: target.code, actor: "signed-session" }) }), env);
      const response = await request(); expect(response.status, await response.clone().text()).toBe(200);
      const started = await response.json() as any;
      expect(started.you.startedAt).toBe(terms.startsAt); expect(started.you.givens).toHaveLength(81);
      expect(read).not.toHaveBeenCalled();
      expect((await (await request()).json() as any).you.startedAt).toBe(terms.startsAt);
      const prepared = await worker.fetch(new Request("https://soldoku.test/api/competitions/transaction", { method: "POST",
        body: JSON.stringify({ code: target.code, actor: "signed-session", action: "deposit" }) }), env);
      expect(prepared.status, await prepared.clone().text()).toBe(200);
      expect(transaction).toHaveBeenCalledTimes(1);
    } finally { vi.mocked(competitionChain).mockReset(); }
  });
  it("broadcasts only after the funded snapshot survives D1 conflicts, and never after exhausted retries", async () => {
    const db = database();
    const config = { program: "program", authority: "authority", mint: "mint", decimals: 6, playMs: 60000, graceMs: 60000 };
    const read = vi.fn();
    const settle = vi.fn(async () => {
      const stored = JSON.parse(db.snapshot()!);
      expect(stored.rooms[0].funded.confirmedParticipants).toBe(1);
      return "finalized-later";
    });
    const chain = { config, cluster: "devnet", verify: async () => {}, read, submit: vi.fn(), transaction: vi.fn(), settle,
      faucetConfigured: false, testerBalances: async () => ({ solLamports: 0, testUnits: 0n }), fundTester: async () => ({ solSignature: null, testSignature: null, note: null }) } as CompetitionChain;
    vi.mocked(competitionChain).mockReturnValue(chain);
    const env = { DB: db, ASSETS: { fetch: async () => new Response("asset") } };
    const request = async (path: string, body: Record<string, unknown>) => worker.fetch(new Request(`https://sudoku.example/api/competitions${path}`,
      { method: "POST", body: JSON.stringify(body) }), env);
    try {
      const key = nacl.sign.keyPair(); const wallet = bs58.encode(key.publicKey);
      const proof = await (await request("/proof", { wallet })).json() as any;
      const auth = await (await request("/authorize", { id: proof.id, signature: bs58.encode(nacl.sign.detached(new TextEncoder().encode(proof.message), key.secretKey)) })).json() as any;
      const gate = await (await request("/check", { actor: auth.actor })).json() as any;
      await request("/check/verify", { actor: auth.actor, id: gate.id, value: gate.target });
      const room = await (await request("/create", { actor: auth.actor, gateId: gate.id, mode: "tokens", mint: config.mint, stakeUnits: "1000000", level: "easy", durationMs: 60000 })).json() as any;
      const observation = { id: room.funded.id, creator: wallet, authority: config.authority, mint: config.mint, stakeUnits: "1000000",
        startsAt: room.funded.startsAt, endsAt: room.endsAt, refundAt: room.funded.refundAt, status: "open", winner: null,
        chainTime: Date.now(), participants: 1, entries: [{ wallet, claimed: false }] };
      read.mockResolvedValue(observation);
      for (let index = 0; index < 3; index++) db.conflict();
      const response = await request("/settle", { code: room.code, actor: auth.actor });
      expect(await response.json()).toEqual({ signature: "finalized-later" }); expect(response.status).toBe(200);
      expect(read).toHaveBeenCalledTimes(4); expect(settle).toHaveBeenCalledTimes(1);
      observation.participants = 2;
      observation.entries.push({ wallet: bs58.encode(nacl.sign.keyPair().publicKey), claimed: false });
      for (let index = 0; index < 4; index++) db.conflict();
      expect((await request("/settle", { code: room.code, actor: auth.actor })).status).toBe(409);
      expect(settle).toHaveBeenCalledTimes(1);
    } finally { vi.mocked(competitionChain).mockReset(); }
  });
  it("grants tester funds once, releases the reservation when the send fails, and settles only due rooms from the cron", async () => {
    const db = database();
    const fundTester = vi.fn(async (): Promise<{ solSignature: string | null; testSignature: string | null; note: string | null }> => ({ solSignature: "sol-sig", testSignature: "test-sig", note: null }));
    const settle = vi.fn(async () => "auto-signature");
    let observation: "pending" | "confirmed" = "pending";
    const prepareSettlement = vi.fn(async () => ({ serialized: "same-bytes", signature: "prepared-sig", blockhash: "bh", lastValidBlockHeight: 50, winner: "" }));
    const broadcastSettlement = vi.fn(async () => "prepared-sig");
    const observeSettlement = vi.fn(async () => observation);
    const chain = { config: { program: "program", authority: "authority", mint: "mint", decimals: 6, playMs: 60000, graceMs: 60000 },
      cluster: "devnet", verify: async () => {}, read: vi.fn(), submit: vi.fn(), transaction: vi.fn(), settle, prepareSettlement, broadcastSettlement, observeSettlement, faucetConfigured: true,
      testerBalances: async () => ({ solLamports: 0, testUnits: 0n }), fundTester } as CompetitionChain;
    vi.mocked(competitionChain).mockReturnValue(chain);
    const env = { DB: db, ASSETS: { fetch: async () => new Response("asset") } };
    const request = (path: string, body?: Record<string, unknown>) => worker.fetch(new Request(`https://soldoku.test/api/competitions${path}`,
      body ? { method: "POST", body: JSON.stringify(body) } : undefined), env);
    try {
      const key = nacl.sign.keyPair(); const wallet = bs58.encode(key.publicKey);
      const proof = await (await request("/proof", { wallet })).json() as { id: string; message: string };
      const auth = await (await request("/authorize", { id: proof.id, signature: bs58.encode(nacl.sign.detached(new TextEncoder().encode(proof.message), key.secretKey)) })).json() as { actor: string };
      const granted = await request("/faucet", { actor: auth.actor });
      expect(granted.status).toBe(200);
      expect(await granted.json()).toMatchObject({ solSignature: "sol-sig", testSignature: "test-sig" });
      expect(fundTester).toHaveBeenCalledTimes(1);
      expect((await request("/faucet", { actor: auth.actor })).status).toBe(400);
      expect(fundTester).toHaveBeenCalledTimes(1);
      fundTester.mockRejectedValueOnce(new Error("airdrop refused"));
      const other = nacl.sign.keyPair(); const otherWallet = bs58.encode(other.publicKey);
      const otherProof = await (await request("/proof", { wallet: otherWallet })).json() as { id: string; message: string };
      const otherAuth = await (await request("/authorize", { id: otherProof.id, signature: bs58.encode(nacl.sign.detached(new TextEncoder().encode(otherProof.message), other.secretKey)) })).json() as { actor: string };
      expect((await request("/faucet", { actor: otherAuth.actor })).status).toBe(400);
      fundTester.mockResolvedValueOnce({ solSignature: "sol-2", testSignature: null, note: null });
      expect((await request("/faucet", { actor: otherAuth.actor })).status).toBe(200);
      expect(fundTester).toHaveBeenCalledTimes(3);
      const at = Date.now();
      db.seed(JSON.stringify({ rooms: [
        { code: "DUE00001", owner: wallet, createdAt: at - 120000, endsAt: at - 1000, puzzle: { level: "easy", givens: [], solution: [] },
          entrants: [
            { actor: wallet, name: "a", startedAt: at - 80000, completedMs: 20000, values: [], sequence: 1, lastMoveAt: 0 },
            { actor: otherWallet, name: "b", startedAt: at - 80000, completedMs: 30000, values: [], sequence: 1, lastMoveAt: 0 },
          ],
          funded: { program: "program", authority: "authority", mint: "mint", decimals: 6, playMs: 60000, graceMs: 3600000, id: "1", stakeUnits: "1000000", startsAt: at - 61000, refundAt: at - 1000 + 3600000, chainStatus: "open", confirmedParticipants: 2, chainTime: at - 1000, winner: null } },
        { code: "EARLY001", owner: wallet, createdAt: at, endsAt: at + 60000, puzzle: { level: "easy", givens: [], solution: [] }, entrants: [],
          funded: { program: "program", authority: "authority", mint: "mint", decimals: 6, playMs: 60000, graceMs: 3600000, id: "2", stakeUnits: "1000000", startsAt: at + 30000, refundAt: at + 3600000, chainStatus: "open", confirmedParticipants: 1, chainTime: at, winner: null } },
      ], gates: [], proofs: [], sessions: [], grants: [] }));
      vi.mocked(chain.read).mockResolvedValue({ id: "1", creator: wallet, authority: "authority", mint: "mint", stakeUnits: "1000000",
        startsAt: at - 61000, endsAt: at - 1000, refundAt: at - 1000 + 3600000, status: "open", winner: null, chainTime: at, participants: 2,
        entries: [{ wallet, claimed: false }, { wallet: otherWallet, claimed: false }] });
      await worker.scheduled({}, env);
      expect(settle).not.toHaveBeenCalled();
      expect(prepareSettlement).toHaveBeenCalledTimes(1);
      expect(broadcastSettlement).toHaveBeenCalledTimes(1);
      expect(JSON.parse(db.snapshot()!).rooms.find((item: { code: string }) => item.code === "DUE00001").funded.settlementSignature).toBeUndefined();
      await worker.scheduled({}, env);
      expect(prepareSettlement).toHaveBeenCalledTimes(1);
      expect(broadcastSettlement).toHaveBeenCalledTimes(2);
      observation = "confirmed";
      await worker.scheduled({}, env);
      expect(broadcastSettlement).toHaveBeenCalledTimes(2);
      expect(JSON.parse(db.snapshot()!).rooms.find((item: { code: string }) => item.code === "DUE00001").funded.settlementSignature).toBe("prepared-sig");
      await worker.scheduled({}, env);
      expect(prepareSettlement).toHaveBeenCalledTimes(1);
    } finally { vi.mocked(competitionChain).mockReset(); }
  });
  it("does not broadcast a settlement when the conditional write reports no change", async () => {
    const db = database();
    const at = Date.now();
    const broadcastSettlement = vi.fn(async () => "sig");
    const chain = { config: { program: "program", authority: "authority", mint: "mint", decimals: 6, playMs: 60000, graceMs: 3600000 },
      cluster: "devnet", verify: async () => {}, read: vi.fn(async () => ({ id: "1", creator: "owner", authority: "authority", mint: "mint", stakeUnits: "1000000",
        startsAt: at - 61000, endsAt: at - 1000, refundAt: at - 1000 + 3600000, status: "open" as const, winner: null, chainTime: at, participants: 2,
        entries: [{ wallet: "owner", claimed: false }, { wallet: "other", claimed: false }] })),
      submit: vi.fn(), transaction: vi.fn(), settle: vi.fn(), prepareSettlement: vi.fn(async () => ({ serialized: "bytes", signature: "sig", blockhash: "bh", lastValidBlockHeight: 3, winner: "owner" })),
      broadcastSettlement, observeSettlement: vi.fn(async () => "confirmed" as const), faucetConfigured: false,
      testerBalances: vi.fn(), fundTester: vi.fn() } as CompetitionChain;
    vi.mocked(competitionChain).mockReturnValue(chain);
    db.seed(JSON.stringify({ rooms: [{ code: "DUE00001", owner: "owner", createdAt: at - 120000, endsAt: at - 1000, puzzle: { level: "easy", givens: [], solution: [] },
      entrants: [
        { actor: "owner", name: "a", startedAt: at - 80000, completedMs: 20000, values: [], sequence: 1, lastMoveAt: 0 },
        { actor: "other", name: "b", startedAt: at - 80000, completedMs: 30000, values: [], sequence: 1, lastMoveAt: 0 },
      ],
      funded: { program: "program", authority: "authority", mint: "mint", decimals: 6, playMs: 60000, graceMs: 3600000, id: "1", stakeUnits: "1000000", startsAt: at - 61000, refundAt: at - 1000 + 3600000, chainStatus: "open", confirmedParticipants: 2, chainTime: at - 1000, winner: null } }],
      gates: [], proofs: [], sessions: [], grants: [] }));
    db.deny(8);
    try {
      await worker.scheduled({}, { DB: db, ASSETS: { fetch: async () => new Response("asset") } });
      expect(broadcastSettlement).not.toHaveBeenCalled();
    } finally { vi.mocked(competitionChain).mockReset(); }
  });
  it("pauses new funded rooms and deposit relays while claims and settlement stay available", async () => {
    const db = database();
    const transaction = vi.fn(async () => ({ transaction: "unsigned", action: "claim", wallet: "wallet", cluster: "devnet", room: "pda", mint: "mint", stakeUnits: "1", startsAt: 1, endsAt: 2, refundAt: 3, expiresAtBlockHeight: 1 }));
    const chain = { config: { program: "program", authority: "authority", mint: "mint", decimals: 6, playMs: 60000, graceMs: 60000 },
      cluster: "devnet", verify: async () => {}, read: vi.fn(async () => null), submit: vi.fn(), transaction, settle: vi.fn(), faucetConfigured: false,
      testerBalances: vi.fn(), fundTester: vi.fn() } as CompetitionChain;
    vi.mocked(competitionChain).mockReturnValue(chain);
    const env = { DB: db, ASSETS: { fetch: async () => new Response("asset") }, SUDOKU_COMPETITION_PAUSED: "1" };
    try {
      const configPaused = await worker.fetch(new Request("https://soldoku.test/api/competitions/config"), env);
      expect(configPaused.status).toBe(200);
      expect(await configPaused.json()).toMatchObject({ enabled: true, paused: true, mint: "mint" });
      const key = nacl.sign.keyPair(); const wallet = bs58.encode(key.publicKey);
      const proof = await (await worker.fetch(new Request("https://soldoku.test/api/competitions/proof", { method: "POST", body: JSON.stringify({ wallet }) }), env)).json() as { id: string; message: string };
      const auth = await (await worker.fetch(new Request("https://soldoku.test/api/competitions/authorize", { method: "POST", body: JSON.stringify({ id: proof.id, signature: bs58.encode(nacl.sign.detached(new TextEncoder().encode(proof.message), key.secretKey)) }) }), env)).json() as { actor: string };
      const gate = await (await worker.fetch(new Request("https://soldoku.test/api/competitions/check", { method: "POST", body: JSON.stringify({ actor: auth.actor }) }), env)).json() as { id: string; target: number };
      await worker.fetch(new Request("https://soldoku.test/api/competitions/check/verify", { method: "POST", body: JSON.stringify({ actor: auth.actor, id: gate.id, value: gate.target }) }), env);
      const created = await worker.fetch(new Request("https://soldoku.test/api/competitions/create", { method: "POST", body: JSON.stringify({ actor: auth.actor, gateId: gate.id, mode: "tokens", mint: "mint", stakeUnits: "1000000", level: "easy", durationMs: 60000 }) }), env);
      expect(created.status).toBe(400);
      expect(await created.json()).toMatchObject({ error: expect.stringMatching(/paused/) });
      const free = await worker.fetch(new Request("https://soldoku.test/api/competitions/create", { method: "POST", body: JSON.stringify({ actor: auth.actor, gateId: gate.id, mode: "free", level: "easy", durationMs: DAY_MS }) }), env);
      expect(free.status).toBe(200);
      const deposit = await worker.fetch(new Request("https://soldoku.test/api/competitions/transaction", { method: "POST", body: JSON.stringify({ code: "MISSING1", actor: auth.actor, action: "deposit" }) }), env);
      expect(deposit.status).toBe(400);
      expect(await deposit.json()).toMatchObject({ error: expect.stringMatching(/paused|not found|no escrow/) });
      expect(transaction).not.toHaveBeenCalled();
    } finally { vi.mocked(competitionChain).mockReset(); }
  });
  it("keeps card funding unavailable and refuses checkout creation", async () => {
    const env = {
      DB: database(),
      ASSETS: { fetch: async () => new Response("asset") },
      FIAT_FUNDING_MODE: "sandbox",
      MOONPAY_PUBLISHABLE_KEY: "pk_test_example",
      MOONPAY_SECRET_KEY: "sk_test_example",
    };
    const caps = await worker.fetch(new Request("https://soldoku.test/api/funding/card"), env);
    expect(caps.status).toBe(200);
    expect(await caps.json()).toMatchObject({ available: false, externalExecution: false, funded: false, admitsEntrant: false, persistenceReady: true });
    const created = await worker.fetch(new Request("https://soldoku.test/api/funding/card", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        destinationWallet: "JCVsKd4TMg1fvEs7rjf5YgLYbJfNC8Dwb4x1PchFkGM7",
        roomCode: "ABCD1234",
        expectedBaseUnits: "1000000",
      }),
    }), env);
    expect(created.status).toBe(403);
    expect(await created.json()).toMatchObject({ funded: false, admitsEntrant: false, available: false, externalExecution: false });
    const report = await worker.fetch(new Request("https://soldoku.test/api/funding/capabilities"), env);
    expect(await report.json()).toMatchObject({ cardFunding: { available: false, externalExecution: false }, cardFundingAdapter: "disabled-production" });
  });
  it("sends isolation headers and a script policy only on HTML", async () => {
    const env = { DB: database(), ASSETS: { fetch: async () => new Response("<!doctype html><script>\nconst ready = true;\n</script>", { headers: { "content-type": "text/html" } }) } };
    const page = await worker.fetch(new Request("https://soldoku.test/"), env);
    expect(page.headers.get("x-content-type-options")).toBe("nosniff");
    expect(page.headers.get("referrer-policy")).toBe("no-referrer");
    expect(page.headers.get("content-security-policy")).toContain("script-src 'self' 'sha256-");
    expect(page.headers.get("content-security-policy")).not.toContain("unsafe-inline");
    expect(page.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    const api = await worker.fetch(new Request("https://soldoku.test/api/competitions"), env);
    expect(api.headers.get("content-security-policy")).toBe("frame-ancestors 'none'");
    expect(api.headers.get("content-security-policy")).not.toContain("script-src");
    expect(readFileSync("wrangler.soldoku.jsonc", "utf8")).toContain('"run_worker_first": true');
  });
  it("passes a revalidated document through without a hashless script policy", async () => {
    const env = { DB: database(), ASSETS: { fetch: async () => new Response(null, { status: 304, headers: { etag: "\"asset\"", "content-type": "text/html" } }) } };
    const page = await worker.fetch(new Request("https://soldoku.test/", { headers: { "if-none-match": "\"asset\"" } }), env);
    expect(page.status).toBe(304);
    expect(await page.text()).toBe("");
    expect(page.headers.get("content-security-policy") ?? "").not.toContain("script-src");
    expect(page.headers.get("x-content-type-options")).toBe("nosniff");
    expect(page.headers.get("referrer-policy")).toBe("no-referrer");
  });
  it("reconciles a closed room the open-room selector skips", async () => {
    const db = database();
    const at = Date.now();
    const observeSettlement = vi.fn(async () => "confirmed" as const);
    const broadcastSettlement = vi.fn();
    const prepareSettlement = vi.fn();
    const chain = { config: { program: "program", authority: "authority", mint: "mint", decimals: 6, playMs: 60000, graceMs: 3600000 },
      cluster: "devnet", verify: async () => {}, read: vi.fn(async () => ({ id: "1", creator: "owner", authority: "authority", mint: "mint", stakeUnits: "1000000",
        startsAt: at - 61000, endsAt: at - 1000, refundAt: at - 1000 + 3600000, status: "paid" as const, winner: "owner", chainTime: at, participants: 2,
        entries: [{ wallet: "owner", claimed: true }, { wallet: "other", claimed: false }] })),
      submit: vi.fn(), transaction: vi.fn(), settle: vi.fn(), prepareSettlement, broadcastSettlement, observeSettlement, faucetConfigured: false,
      testerBalances: vi.fn(), fundTester: vi.fn() } as CompetitionChain;
    vi.mocked(competitionChain).mockReturnValue(chain);
    db.seed(JSON.stringify({ rooms: [{ code: "2B4FB023", owner: "owner", createdAt: at - 120000, endsAt: at - 1000, puzzle: { level: "easy", givens: [], solution: [] },
      entrants: [
        { actor: "owner", name: "a", startedAt: at - 80000, completedMs: 35802, values: [], sequence: 4, lastMoveAt: 0, claimed: true },
        { actor: "other", name: "b", startedAt: at - 80000, completedMs: null, values: [], sequence: 0, lastMoveAt: 0, claimed: false },
      ],
      funded: { program: "program", authority: "authority", mint: "mint", decimals: 6, playMs: 60000, graceMs: 3600000, id: "1", stakeUnits: "1000000", startsAt: at - 61000, refundAt: at - 1000 + 3600000, chainStatus: "paid", confirmedParticipants: 2, chainTime: at - 1000, winner: "owner", settlementSignature: "chain-closed", settlementAlert: "Settlement is unknown.",
        settlement: { phase: "unknown", winner: "owner", signature: "sent-a", serialized: "bytes", blockhash: "bh", lastValidBlockHeight: 3, preparedAt: at - 500 } } }], gates: [], proofs: [], sessions: [], grants: [] }));
    try {
      const env = { DB: db, ASSETS: { fetch: async () => new Response("asset") } };
      await worker.scheduled({}, env);
      expect(prepareSettlement).not.toHaveBeenCalled();
      expect(broadcastSettlement).not.toHaveBeenCalled();
      const room = JSON.parse(db.snapshot()!).rooms[0];
      expect(room.funded.settlementSignature).toBe("sent-a");
      expect(room.funded.settlement.phase).toBe("confirmed");
      expect(room.funded.settlementAlert).toBe("");
      expect(room.funded.winner).toBe("owner");
      expect(room.entrants[0].claimed).toBe(true);
      expect(room.entrants[0].sequence).toBe(4);
      await worker.scheduled({}, env);
      expect(observeSettlement).toHaveBeenCalledTimes(1);
      expect(broadcastSettlement).not.toHaveBeenCalled();
    } finally { vi.mocked(competitionChain).mockReset(); }
  });
});
