import { describe, expect, it, vi } from "vitest";
import nacl from "tweetnacl";
import bs58 from "bs58";
import worker from "../worker";
import { DAY_MS } from "./types";
import { competitionChain, type CompetitionChain } from "./chain";
vi.mock("./chain", () => ({ competitionChain: vi.fn() }));

function database() {
  let saved: string | null = null;
  let conflicts = 0;
  return {
    conflict: () => { conflicts++; },
    snapshot: () => saved,
    prepare(sql: string) {
      let args: unknown[] = [];
      const statement = {
        bind(...values: unknown[]) { args = values; return statement; },
        async first<T>() { return (saved ? { body: saved } : null) as T | null; },
        async all<T>() { return { results: [] as T[] }; },
        async run() {
          if (sql.startsWith("CREATE TABLE")) return { meta: { changes: 0 } };
          if (conflicts > 0) { conflicts--; return { meta: { changes: 0 } }; }
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
  it("broadcasts only after the funded snapshot survives D1 conflicts, and never after exhausted retries", async () => {
    const db = database();
    const config = { program: "program", authority: "authority", mint: "mint", decimals: 6, playMs: 60000, graceMs: 60000 };
    const read = vi.fn();
    const settle = vi.fn(async () => {
      const stored = JSON.parse(db.snapshot()!);
      expect(stored.rooms[0].funded.confirmedParticipants).toBe(1);
      return "finalized-later";
    });
    const chain = { config, cluster: "devnet", verify: async () => {}, read, submit: vi.fn(), transaction: vi.fn(), settle } as CompetitionChain;
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
      observation.chainTime += 1000;
      for (let index = 0; index < 4; index++) db.conflict();
      expect((await request("/settle", { code: room.code, actor: auth.actor })).status).toBe(409);
      expect(settle).toHaveBeenCalledTimes(1);
    } finally { vi.mocked(competitionChain).mockReset(); }
  });
});
