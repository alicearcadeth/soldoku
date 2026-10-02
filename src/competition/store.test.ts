import { describe, expect, it } from "vitest";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { createCompetitionStore } from "./store";
import { DAY_MS, type CompetitionView } from "./types";

function fixture() {
  let time = 1800000000000;
  const store = createCompetitionStore(() => time);
  const call = (path: string, body: Record<string, unknown> = {}, method = "POST") => store.route(method, new URL(`https://sudoku.test/api/competitions${path}`), body) as any;
  function auth(key = nacl.sign.keyPair()) {
    const wallet = bs58.encode(key.publicKey);
    const proof = call("/proof", { wallet });
    const session = call("/authorize", { id: proof.id, signature: bs58.encode(nacl.sign.detached(new TextEncoder().encode(proof.message), key.secretKey)) });
    return { ...session, key };
  }
  function create(actor: string, durationMs = DAY_MS) {
    const gate = call("/check", { actor });
    call("/check/verify", { actor, id: gate.id, value: gate.target });
    return call("/create", { actor, gateId: gate.id, level: "easy", mode: "free", durationMs }) as CompetitionView;
  }
  function finish(actor: string, code: string, delay: number) {
    const started = call("/start", { code, actor }) as CompetitionView;
    const persisted = JSON.parse(store.snapshot()).rooms.find((room: { code: string }) => room.code === code);
    const values = [...started.you!.board!];
    const empty = values.flatMap((value, index) => value === 0 ? [index] : []);
    time += delay;
    let sequence = started.you!.sequence;
    for (const index of empty) {
      time += 400;
      values[index] = persisted.puzzle.solution[index];
      call("/move", { actor, code, values, sequence: ++sequence });
    }
    return call("/state", { actor, code }) as CompetitionView;
  }
  return { store, call, auth, create, finish, advance: (ms: number) => { time += ms; } };
}

describe("leaderboard competition", () => {
  it("persists custom names, validates them before consuming the check, and restores unnamed older rooms", () => {
    const f = fixture(); const a = f.auth();
    const gate = f.call("/check", { actor: a.actor });
    f.call("/check/verify", { actor: a.actor, id: gate.id, value: gate.target });
    const body = { actor: a.actor, gateId: gate.id, mode: "free", level: "easy", durationMs: DAY_MS };
    expect(() => f.call("/create", { ...body, name: "x".repeat(61) })).toThrow(/60/);
    const room = f.call("/create", { ...body, name: "  Weekend   Sprint  " });
    expect(room.name).toBe("Weekend Sprint");
    const raw = JSON.parse(f.store.snapshot());
    f.store.replace(JSON.stringify(raw));
    expect(f.call("/state", { code: room.code }).name).toBe("Weekend Sprint");
    delete raw.rooms[0].name;
    f.store.replace(JSON.stringify(raw));
    expect(f.call("/state", { code: room.code }).name).toBe(`Room ${room.code}`);
  });
  it("requires a signed wallet proof, expires challenges, and prevents proof replay", () => {
    const f = fixture();
    const key = nacl.sign.keyPair();
    const proof = f.call("/proof", { wallet: bs58.encode(key.publicKey) });
    expect(() => f.call("/authorize", { id: proof.id, signature: bs58.encode(new Uint8Array(64)) })).toThrow(/rejected/);
    const signature = bs58.encode(nacl.sign.detached(new TextEncoder().encode(proof.message), key.secretKey));
    expect(f.call("/authorize", { id: proof.id, signature }).wallet).toBe(bs58.encode(key.publicKey));
    expect(() => f.call("/authorize", { id: proof.id, signature })).toThrow(/expired/);
    const expired = f.call("/proof", { wallet: bs58.encode(key.publicKey) });
    f.advance(120001);
    expect(() => f.call("/authorize", { id: expired.id, signature })).toThrow(/expired/);
    expect(() => f.call("/create", { actor: "pretend", mode: "free" })).toThrow(/Connect/);
  });
  it("requires an unexpired, single-use slider check bound to its creator", () => {
    const f = fixture(); const a = f.auth(); const b = f.auth();
    const gate = f.call("/check", { actor: a.actor });
    const body = { actor: a.actor, gateId: gate.id, mode: "free", level: "easy", durationMs: DAY_MS };
    expect(() => f.call("/create", body)).toThrow(/slider/);
    expect(f.call("/check/verify", { actor: a.actor, id: gate.id, value: gate.target }).ok).toBe(true);
    expect(() => f.call("/create", { ...body, actor: b.actor })).toThrow(/slider/);
    const room = f.call("/create", body);
    expect(room.participants).toBe(1);
    expect(() => f.call("/create", body)).toThrow(/slider/);
  });
  it("joins more than two participants, gives the same grid, and hides it until start", () => {
    const f = fixture(); const owner = f.auth(); const created = f.create(owner.actor);
    expect(created.you?.givens).toBeNull();
    expect(JSON.stringify(f.call("", {}, "GET"))).not.toMatch(/givens|solution|actor/);
    const started = f.call("/start", { actor: owner.actor, code: created.code });
    for (let index = 0; index < 12; index++) {
      const entrant = f.auth();
      f.call("/join", { actor: entrant.actor, code: created.code });
      const next = f.call("/start", { actor: entrant.actor, code: created.code });
      expect(next.you.givens).toEqual(started.you.givens);
      expect(JSON.stringify(next)).not.toMatch(/solution|secretKey/);
    }
    expect(f.call("/state", { code: created.code }).participants).toBe(13);
  });
  it("only lets the creator extend while alone; a join permanently locks duration", () => {
    const f = fixture(); const a = f.auth(); const b = f.auth(); const room = f.create(a.actor);
    expect(() => f.call("/extend", { code: room.code, actor: b.actor, durationMs: DAY_MS })).toThrow(/creator/);
    expect(f.call("/extend", { code: room.code, actor: a.actor, durationMs: DAY_MS }).endsAt).toBe(room.endsAt + DAY_MS);
    f.call("/join", { code: room.code, actor: b.actor });
    expect(() => f.call("/extend", { code: room.code, actor: a.actor, durationMs: DAY_MS })).toThrow(/locked/);
    expect(f.call("/state", { code: room.code, actor: a.actor }).you.canExtend).toBe(false);
  });
  it("rejects invalid extension atomically and stops entry, start, and moves at the deadline", () => {
    const f = fixture(); const a = f.auth(); const room = f.create(a.actor, 60000);
    const before = f.store.snapshot();
    expect(() => f.call("/extend", { code: room.code, actor: a.actor, durationMs: 365 * DAY_MS })).toThrow(/365/);
    expect(f.store.snapshot()).toBe(before);
    f.advance(60000);
    expect(f.call("/state", { code: room.code }).status).toBe("ended");
    for (const path of ["/join", "/start", "/move", "/extend"]) expect(() => f.call(path, { code: room.code, actor: a.actor })).toThrow(/ended/);
  });
  it("never restarts an attempt, including after reauthorization or store restoration", () => {
    const f = fixture(); const a = f.auth(); const room = f.create(a.actor);
    const start = f.call("/start", { code: room.code, actor: a.actor });
    f.advance(10000);
    const secondSession = f.auth(a.key);
    f.call("/join", { code: room.code, actor: secondSession.actor });
    const again = f.call("/start", { code: room.code, actor: secondSession.actor });
    expect(again.you.startedAt).toBe(start.you.startedAt);
    expect(again.participants).toBe(1);
    const restored = createCompetitionStore(); restored.replace(f.store.snapshot());
    const view = restored.route("POST", new URL("https://sudoku.test/api/competitions/state"), { code: room.code, actor: a.actor }) as CompetitionView;
    expect(view.you?.startedAt).toBe(start.you.startedAt);
  });
  it("ranks by individual elapsed time, not who finished first; completed attempts stay locked", () => {
    const f = fixture(); const a = f.auth(); const b = f.auth(); const room = f.create(a.actor);
    f.call("/join", { code: room.code, actor: b.actor });
    const first = f.finish(a.actor, room.code, 30000);
    const second = f.finish(b.actor, room.code, 16000);
    expect(second.bestMs).toBeLessThan(first.bestMs!);
    expect(second.you?.rank).toBe(1);
    expect(f.call("/state", { code: room.code, actor: a.actor }).you.rank).toBe(2);
    expect(f.call("/start", { code: room.code, actor: b.actor }).you.completedMs).toBe(second.you?.completedMs);
    expect(() => f.call("/move", { code: room.code, actor: b.actor })).toThrow(/finished/);
  });
  it("rejects edited givens, whole-grid submissions, stale sequences, and forged times", () => {
    const f = fixture(); const a = f.auth(); const room = f.create(a.actor);
    const start = f.call("/start", { code: room.code, actor: a.actor });
    const board = [...start.you.board];
    const given = board.findIndex(value => value !== 0); board[given] = 0;
    expect(() => f.call("/move", { code: room.code, actor: a.actor, sequence: 1, values: board })).toThrow(/Given/);
    expect(() => f.call("/move", { code: room.code, actor: a.actor, sequence: 50, values: start.you.board })).toThrow(/changed/);
    const persisted = JSON.parse(f.store.snapshot()).rooms[0];
    expect(() => f.call("/move", { code: room.code, actor: a.actor, sequence: 1, values: persisted.puzzle.solution, completedMs: 1 })).toThrow(/one cell/);
  });
  it("refuses token entry on the server instead of creating an unfunded paid room", () => {
    const f = fixture(); const a = f.auth();
    expect(() => f.call("/create", { actor: a.actor, mode: "tokens", token: { symbol: "SOL" }, stake: 5 })).toThrow(/unavailable/);
    expect(f.call("", {}, "GET").rooms).toEqual([]);
  });
});
