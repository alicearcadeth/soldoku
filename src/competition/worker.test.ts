import { describe, expect, it } from "vitest";
import nacl from "tweetnacl";
import bs58 from "bs58";
import worker from "../worker";
import { DAY_MS } from "./types";

function database() {
  let saved: string | null = null;
  let conflicts = 0;
  return {
    conflict: () => { conflicts++; },
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
});
