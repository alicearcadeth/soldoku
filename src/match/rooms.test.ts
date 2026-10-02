import { describe, expect, it } from "vitest";
import { ESCROW_PROGRAM_ID } from "../solana/program";
import { createMatchStore } from "./rooms";

describe("quick match", () => {
  it("pairs the second practice player and ignores private or staked rooms", () => {
    let clock = 5_000_000;
    const store = createMatchStore(() => clock);
    const hostGate = store.issueCaptcha();
    store.checkCaptcha(hostGate.id, hostGate.target);
    const host = store.createRoom("medium", hostGate.id, "wallet-a");
    expect(host.staked).toBe(true);
    expect(store.stakeInfo(host.code)?.programId).toBe(ESCROW_PROGRAM_ID);

    const privateGate = store.issueCaptcha();
    store.checkCaptcha(privateGate.id, privateGate.target);
    const privateRoom = store.createRoom("medium", privateGate.id);
    expect(privateRoom.listed).toBe(false);

    const firstGate = store.issueCaptcha();
    store.checkCaptcha(firstGate.id, firstGate.target);
    const waiting = store.quickMatch("medium", firstGate.id);
    expect(waiting.startedAt).toBeNull();
    expect(waiting.listed).toBe(true);
    expect(store.listOpen().map((room) => room.code)).toEqual([waiting.code]);

    const secondGate = store.issueCaptcha();
    store.checkCaptcha(secondGate.id, secondGate.target);
    const matched = store.quickMatch("medium", secondGate.id);
    expect(matched.code).toBe(waiting.code);
    expect(matched.startedAt).not.toBeNull();
    expect(matched.givens).toEqual(waiting.givens);
    expect(store.listOpen()).toEqual([]);
    expect(store.state(privateRoom.code, privateRoom.playerId).opponent?.joined).toBe(false);
    expect(store.state(host.code, host.playerId).opponent?.joined).toBe(false);
  });

  it("drops a listed room after twenty minutes", () => {
    let clock = 5_000_000;
    const store = createMatchStore(() => clock);
    const gate = store.issueCaptcha();
    store.checkCaptcha(gate.id, gate.target);
    const waiting = store.quickMatch("easy", gate.id);
    clock += 21 * 60 * 1000;
    expect(store.listOpen()).toEqual([]);
    const nextGate = store.issueCaptcha();
    store.checkCaptcha(nextGate.id, nextGate.target);
    const fresh = store.quickMatch("easy", nextGate.id);
    expect(fresh.code).not.toBe(waiting.code);
  });

  it("rejects a third player and drops an unjoined private room after two hours", () => {
    let clock = 5_000_000;
    const store = createMatchStore(() => clock);
    const captcha = () => {
      const gate = store.issueCaptcha();
      store.checkCaptcha(gate.id, gate.target);
      return gate.id;
    };
    const host = store.createRoom("easy", captcha());
    store.joinRoom(host.code, captcha());
    expect(() => store.joinRoom(host.code, captcha())).toThrow(/full/);

    const idle = store.createRoom("easy", captcha());
    clock += 2 * 60 * 60 * 1000 + 1;
    store.listOpen();
    expect(() => store.state(idle.code, idle.playerId)).toThrow(/No room/);
    expect(store.state(host.code, host.playerId).code).toBe(host.code);
  });

  it("reads a saved room with no program id as the legacy program", () => {
    const store = createMatchStore();
    store.replace(JSON.stringify({
      rooms: [{
        code: "OLD1",
        level: "easy",
        givens: [],
        solution: [],
        limitMs: 1,
        startedAt: null,
        players: [{ id: "p", values: [], completedMs: null, moves: 0, lastMoveAt: 0, wallet: "w", deposited: false }],
        verdict: null,
        staked: true,
        matchId: "1",
        chain: "pending",
      }],
    }));
    expect(store.stakeInfo("OLD1")?.programId).toBe(ESCROW_PROGRAM_ID);
    expect(store.state("OLD1", "p").expired).toBe(false);
  });

  it("expires an unfunded legacy room when new rooms use V2, and tags a new room with V2", () => {
    const previous = process.env.SUDOKU_ESCROW_PROGRAM_ID;
    const cutover = process.env.SUDOKU_ESCROW_V2;
    process.env.SUDOKU_ESCROW_PROGRAM_ID = "937BAWXVCW58oEKkA1FijkSXXtdgGEytUyPRV2Roge22";
    process.env.SUDOKU_ESCROW_V2 = "1";
    const store = createMatchStore();
    store.replace(JSON.stringify({
      rooms: [{
        code: "OLD1",
        level: "easy",
        givens: [],
        solution: [],
        limitMs: 1,
        startedAt: null,
        players: [{ id: "p", values: [], completedMs: null, moves: 0, lastMoveAt: 0, wallet: "w", deposited: false }],
        verdict: null,
        staked: true,
        matchId: "1",
        chain: "pending",
      }],
    }));
    expect(store.state("OLD1", "p").expired).toBe(true);
    expect(store.stakeInfo("OLD1")?.programId).toBe(ESCROW_PROGRAM_ID);
    const gate = store.issueCaptcha();
    store.checkCaptcha(gate.id, gate.target);
    const created = store.createRoom("easy", gate.id, "wallet-a", undefined, false, "5000000");
    expect(store.stakeInfo(created.code)?.programId).toBe("937BAWXVCW58oEKkA1FijkSXXtdgGEytUyPRV2Roge22");
    expect(store.stakeInfo(created.code)?.stake).toBe("5000000");
    expect(created.stake).toBe("5 test tokens");
    const rejected = store.issueCaptcha();
    store.checkCaptcha(rejected.id, rejected.target);
    expect(() => store.createRoom("easy", rejected.id, "wallet-a", undefined, false, "3000000")).toThrow(/1, 2, or 5/);
    if (previous === undefined) delete process.env.SUDOKU_ESCROW_PROGRAM_ID;
    else process.env.SUDOKU_ESCROW_PROGRAM_ID = previous;
    if (cutover === undefined) delete process.env.SUDOKU_ESCROW_V2;
    else process.env.SUDOKU_ESCROW_V2 = cutover;
  });

  it("does not turn a refunded stake into a draw after the clock ends", () => {
    let clock = 5_000_000;
    const store = createMatchStore(() => clock);
    store.replace(JSON.stringify({
      rooms: [{
        code: "REF1",
        level: "easy",
        givens: Array(81).fill(0),
        solution: Array(81).fill(1),
        limitMs: 1_000,
        startedAt: clock,
        players: [
          { id: "a", values: Array(81).fill(0), completedMs: null, moves: 0, lastMoveAt: 0, wallet: "w1", deposited: true },
          { id: "b", values: Array(81).fill(0), completedMs: null, moves: 0, lastMoveAt: 0, wallet: "w2", deposited: true },
        ],
        verdict: null,
        staked: true,
        matchId: "9",
        chain: "refunded",
        programId: "937BAWXVCW58oEKkA1FijkSXXtdgGEytUyPRV2Roge22",
      }],
    }));
    clock += 60_000;
    expect(store.state("REF1", "a").verdict).toBeNull();
    expect(store.state("REF1", "a").chain).toBe("refunded");
    store.replace(JSON.stringify({
      rooms: [{
        code: "REF1",
        level: "easy",
        givens: Array(81).fill(0),
        solution: Array(81).fill(1),
        limitMs: 1_000,
        startedAt: clock,
        players: [
          { id: "a", values: Array(81).fill(0), completedMs: null, moves: 0, lastMoveAt: 0, wallet: "w1", deposited: true },
          { id: "b", values: Array(81).fill(0), completedMs: null, moves: 0, lastMoveAt: 0, wallet: "w2", deposited: true },
        ],
        verdict: { outcome: "draw", reason: "same-progress" },
        staked: true,
        matchId: "9",
        chain: "refunded",
        programId: "937BAWXVCW58oEKkA1FijkSXXtdgGEytUyPRV2Roge22",
      }],
    }));
    expect(store.state("REF1", "a").verdict).toBeNull();
  });
});

describe("practice rooms", () => {
  it("starts a shared race after the second player passes the slider", () => {
    const store = createMatchStore();
    const hostGate = store.issueCaptcha();
    expect(store.checkCaptcha(hostGate.id, hostGate.target)).toBe(true);
    const host = store.createRoom("easy", hostGate.id);
    expect(host.startedAt).toBeNull();
    expect(host.givens.filter(Boolean).length).toBeGreaterThan(20);

    const guestGate = store.issueCaptcha();
    store.checkCaptcha(guestGate.id, guestGate.target);
    const guest = store.joinRoom(host.code, guestGate.id);
    expect(guest.givens).toEqual(host.givens);
    expect(guest.startedAt).not.toBeNull();
    expect(guest.opponent?.joined).toBe(true);

    const failed = store.issueCaptcha();
    expect(store.checkCaptcha(failed.id, 0.01)).toBe(false);
    expect(() => store.createRoom("easy", failed.id)).toThrow(/slider/i);
  });

  it("rejects a pasted solution and a finish that is faster than a person", () => {
    let clock = 1_000_000;
    const store = createMatchStore(() => clock);
    const hostGate = store.issueCaptcha();
    store.checkCaptcha(hostGate.id, hostGate.target);
    const host = store.createRoom("easy", hostGate.id);
    const guestGate = store.issueCaptcha();
    store.checkCaptcha(guestGate.id, guestGate.target);
    const guest = store.joinRoom(host.code, guestGate.id);
    const pasted = host.givens.slice();
    expect(() => store.move(host.code, host.playerId, pasted)).toThrow(/one cell/i);

    const one = host.givens.slice();
    const index = one.findIndex((value) => value === 0);
    one[index] = 1;
    clock += 1000;
    store.move(host.code, host.playerId, one);
    const rushed = one.slice();
    const second = rushed.findIndex((value, index) => value === 0 && index !== one.findIndex((cell) => cell === 0));
    rushed[second] = 2;
    clock += 50;
    expect(() => store.move(host.code, host.playerId, rushed)).toThrow(/slow down/i);
    expect(store.state(host.code, guest.playerId).opponent?.filled).toBe(host.givens.filter(Boolean).length + 1);
  });

  it("opens a practice room without the slider and slows a burst", () => {
    let clock = 1_000_000;
    const store = createMatchStore(() => clock);
    for (let i = 0; i < 12; i++) store.createRoom("easy", "");
    expect(() => store.createRoom("easy", "")).toThrow(/busy/i);
    clock += 61_000;
    expect(store.createRoom("easy", "").code).toHaveLength(4);
    const listed = store.quickMatch("easy", "");
    expect(listed.startedAt).toBeNull();
    const paired = store.quickMatch("easy", "");
    expect(paired.code).toBe(listed.code);
    expect(paired.startedAt).not.toBeNull();
  });

  it("stops new rooms when the lobby is already full", () => {
    const store = createMatchStore();
    for (let i = 0; i < 24; i++) {
      const gate = store.issueCaptcha();
      store.checkCaptcha(gate.id, gate.target);
      store.createRoom("easy", gate.id);
    }
    const extra = store.issueCaptcha();
    store.checkCaptcha(extra.id, extra.target);
    expect(() => store.createRoom("easy", extra.id)).toThrow(/lobby is full/i);
  });

  it("drops an unfunded staked room after two hours and keeps a deposit or a legacy room", () => {
    let clock = 1_000_000;
    const store = createMatchStore(() => clock);
    store.replace(JSON.stringify({
      rooms: [
        room("NEW1", clock, false),
        room("PAID", clock, true),
        room("OLD2", undefined, false),
      ],
    }));
    clock += 2 * 60 * 60 * 1000 + 1;
    store.listOpen();
    expect(() => store.state("NEW1", "p")).toThrow(/No room/);
    expect(store.state("PAID", "p").code).toBe("PAID");
    expect(store.state("OLD2", "p").code).toBe("OLD2");
  });

  it("forgets a finished practice room after three hours and keeps a finished stake", () => {
    let clock = 5_000_000;
    const store = createMatchStore(() => clock);
    const finished = {
      level: "easy",
      givens: Array(81).fill(1),
      solution: Array(81).fill(1),
      limitMs: 1000,
      startedAt: clock,
      players: [{ id: "p", values: Array(81).fill(1), completedMs: 10, moves: 1, lastMoveAt: 0, wallet: "w", deposited: true }],
      verdict: { outcome: "win", winnerId: "p", reason: "finished-first" },
    };
    store.replace(JSON.stringify({
      rooms: [
        { ...finished, code: "FREE", staked: false, matchId: null, chain: null, players: [{ ...finished.players[0], wallet: null, deposited: false }] },
        { ...finished, code: "PAID", staked: true, matchId: "3", chain: "settled" },
      ],
    }));
    clock += 3 * 60 * 60 * 1000 + 1;
    store.listOpen();
    expect(() => store.state("FREE", "p")).toThrow(/No room/);
    expect(store.state("PAID", "p").chain).toBe("settled");
    expect(store.stakeInfo("PAID")?.stake).toBe("1000000");
    store.replace(JSON.stringify({
      rooms: [{ ...finished, code: "BAD", staked: true, matchId: "4", chain: "pending", stake: "999" }],
    }));
    expect(() => store.stakeInfo("BAD")).toThrow(/1, 2, or 5/);
  });
});

function room(code: string, openedAt: number | undefined, deposited: boolean) {
  return {
    code,
    level: "easy",
    givens: [],
    solution: [],
    limitMs: 1,
    startedAt: null,
    openedAt,
    players: [{ id: "p", values: [], completedMs: null, moves: 0, lastMoveAt: 0, wallet: "w", deposited }],
    verdict: null,
    staked: true,
    matchId: "9",
    chain: "pending",
  };
}
