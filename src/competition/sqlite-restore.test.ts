import { describe, expect, it } from "vitest";
import { copyFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import nacl from "tweetnacl";
import bs58 from "bs58";
import worker from "../worker";
import { reconcileRoom } from "./reconcile";
import { mergeSettlementFields } from "./settlement";
import { DAY_MS } from "./types";

function sqlite(path: string) {
  const db = new DatabaseSync(path);
  db.exec("CREATE TABLE IF NOT EXISTS competition_state (id INTEGER PRIMARY KEY, body TEXT NOT NULL)");
  let conflicts = 0;
  let reads = 0;
  let writes = 0;
  return {
    conflicts: () => conflicts, reads: () => reads, writes: () => writes,
    prepare(sql: string) {
      const statement = db.prepare(sql);
      const bound = (args: unknown[]) => ({
        async first<T>() { reads++; if (!sql.startsWith("CREATE")) await new Promise(resolve => setTimeout(resolve, 5)); return (statement.get(...(args as never[])) as T | undefined) ?? null; },
        async all() { return { results: statement.all(...(args as never[])) }; },
        async run() {
          writes++;
          const info = statement.run(...(args as never[]));
          if (sql.includes("ON CONFLICT") && info.changes < 1 && args.length > 1) conflicts++;
          return { meta: { changes: info.changes } };
        },
      });
      return { ...bound([]), bind(...args: unknown[]) { return bound(args); } };
    },
  };
}

describe("disposable sqlite competition state", () => {
  it("keeps concurrent free rooms, both settlement signatures, a paid claim, and a file-copy restore", async () => {
    const dir = mkdtempSync(join(tmpdir(), "soldoku-db-"));
    const path = join(dir, "competition.sqlite");
    const db = sqlite(path);
    const env = { DB: db, ASSETS: { fetch: async () => new Response("asset") } } as never;
    async function post(pathName: string, body: Record<string, unknown>) {
      const response = await worker.fetch(new Request(`https://soldoku.test/api/competitions${pathName}`, { method: "POST", body: JSON.stringify(body) }), env);
      return { status: response.status, body: await response.json() as Record<string, any> };
    }
    const players = await Promise.all(Array.from({ length: 6 }, async () => {
      const key = nacl.sign.keyPair();
      const wallet = bs58.encode(key.publicKey);
      const proof = await post("/proof", { wallet });
      const auth = await post("/authorize", { id: proof.body.id, signature: bs58.encode(nacl.sign.detached(new TextEncoder().encode(proof.body.message), key.secretKey)) });
      const gate = await post("/check", { actor: auth.body.actor });
      await post("/check/verify", { actor: auth.body.actor, id: gate.body.id, value: gate.body.target });
      return post("/create", { actor: auth.body.actor, gateId: gate.body.id, mode: "free", level: "easy", durationMs: DAY_MS });
    }));
    expect(players.every(item => item.status === 200)).toBe(true);
    const row = await db.prepare("SELECT body FROM competition_state WHERE id = 1").bind().first<{ body: string }>();
    expect(row).toBeTruthy();
    const parsed = JSON.parse(row!.body);
    expect(parsed.rooms).toHaveLength(6);
    const cas = "INSERT INTO competition_state (id, body) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET body = excluded.body WHERE body = ?";
    const funded = {
      stakeUnits: "1000000", confirmedParticipants: 2, chainStatus: "awarded", refundAt: 5_000, winner: "owner",
      program: "6uuszYMoZ2bBX8oVccpYPUgdhW6CSvASziN2m8LpJxYs", authority: "authority", mint: "mint", decimals: 6,
      playMs: 1, graceMs: 1, id: "1", startsAt: 0, chainTime: 1_500,
      settlement: { phase: "unknown", signature: "sent-a", serialized: "aa", blockhash: "bh", lastValidBlockHeight: 10, preparedAt: 1, winner: "owner" },
    };
    const base = JSON.parse(row!.body);
    base.rooms.push({
      code: "FUNDED01", endsAt: 2_000, owner: "owner",
      entrants: [
        { actor: "owner", claimed: false, sequence: 1, values: Array(81).fill(1) },
        { actor: "opponent", claimed: false, sequence: 1, values: Array(81).fill(2) },
      ],
      funded,
    }, {
      code: "FUNDED02", endsAt: 2_000, owner: "owner",
      entrants: [{ actor: "owner", claimed: true, sequence: 2 }, { actor: "opponent", claimed: false, sequence: 1 }],
      funded: { ...funded, chainStatus: "paid", settlementSignature: "final-sig", settlement: { ...funded.settlement, phase: "confirmed", signature: "final-sig" } },
    });
    const withFunded = JSON.stringify(base);
    expect((await db.prepare(cas).bind(withFunded, row!.body).run()).meta.changes).toBe(1);
    const writerOne = JSON.parse(withFunded);
    writerOne.rooms.find((item: { code: string }) => item.code === "FUNDED01").funded.settlement = { ...funded.settlement, phase: "broadcast", signature: "writer-one", serialized: "w1" };
    const writerTwo = JSON.parse(withFunded);
    writerTwo.rooms.find((item: { code: string }) => item.code === "FUNDED01").funded.settlement = { ...funded.settlement, phase: "unknown", signature: "writer-two", serialized: "w2" };
    expect((await db.prepare(cas).bind(JSON.stringify(writerOne), withFunded).run()).meta.changes).toBe(1);
    expect((await db.prepare(cas).bind(JSON.stringify(writerTwo), withFunded).run()).meta.changes).toBe(0);
    const currentRaw = (await db.prepare("SELECT body FROM competition_state WHERE id = 1").bind().first<{ body: string }>())!.body;
    const merged = JSON.parse(mergeSettlementFields(currentRaw, JSON.stringify(writerTwo), ["FUNDED01"]));
    const signatures = [merged.rooms.find((item: { code: string }) => item.code === "FUNDED01").funded.settlement.signature,
      ...merged.rooms.find((item: { code: string }) => item.code === "FUNDED01").funded.settlementAlso.map((item: { signature: string }) => item.signature)];
    expect(signatures).toEqual(expect.arrayContaining(["writer-one", "writer-two"]));
    const paid = merged.rooms.find((item: { code: string }) => item.code === "FUNDED02");
    expect(paid.entrants[0].claimed).toBe(true);
    expect(paid.funded.settlementSignature).toBe("final-sig");
    const staleWinner = JSON.parse(currentRaw);
    staleWinner.rooms.find((item: { code: string }) => item.code === "FUNDED02").funded.winner = "opponent";
    staleWinner.rooms.find((item: { code: string }) => item.code === "FUNDED02").entrants[0].claimed = false;
    expect((await db.prepare(cas).bind(JSON.stringify(staleWinner), withFunded).run()).meta.changes).toBe(0);
    const restoredPath = join(dir, "restored.sqlite");
    copyFileSync(path, restoredPath);
    const restored = new DatabaseSync(restoredPath).prepare("SELECT body FROM competition_state WHERE id = 1").get() as { body: string };
    const rooms = JSON.parse(restored.body).rooms;
    const pending = rooms.find((item: { code: string }) => item.code === "FUNDED01");
    const report = reconcileRoom(pending, 3_000, 2_000_000n);
    expect(report.unknownSignatures).toEqual(["writer-one"]);
    expect(report.unpaidPrize).toBe(2_000_000n);
    expect(rooms.find((item: { code: string }) => item.code === "FUNDED02").entrants[0].claimed).toBe(true);
    expect(db.conflicts()).toBeGreaterThan(0);
    expect(rooms).toHaveLength(8);
  }, 20000);
});
