import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { judgeMatch, MATCH_LIMIT_MS, type Verdict } from "../engine/compete";
import { generatePuzzle } from "../engine/generate";
import type { Level } from "../engine/types";
import { ESCROW_PROGRAM_ID, activeEscrowProgramId, roomEscrowProgramId } from "../solana/program";
import { parseStake, stakeLabel } from "../solana/stake";

export type PublicRoom = {
  code: string;
  level: Level;
  givens: number[];
  board: number[];
  limitMs: number;
  startedAt: number | null;
  staked: boolean;
  stake: string | null;
  matchId: string | null;
  you: { filled: number; finished: boolean; deposited: boolean; wallet: string | null };
  opponent: { joined: boolean; filled: number; finished: boolean; deposited: boolean } | null;
  verdict: Verdict | null;
  youWon: boolean | null;
  chain: "pending" | "settled" | "refunded" | "closed" | null;
  programId: string | null;
  canClose: boolean;
  settleFailures: number;
  listed: boolean;
  expired?: boolean;
};

export type AuditEvent = {
  at: number;
  kind: "created" | "joined" | "deposited" | "move" | "finished" | "resumed" | "settled" | "refunded" | "closed";
  matchId: string | null;
  wallet: string | null;
  seat: number | null;
  programId: string | null;
  mint: string | null;
  stake: string | null;
  signature: string | null;
  puzzleHash: string;
  cell: number | null;
  closeEligible: boolean | null;
  fastFinish: boolean | null;
};

type Player = {
  id: string;
  values: number[];
  completedMs: number | null;
  moves: number;
  lastMoveAt: number;
  wallet: string | null;
  deposited: boolean;
};

type Room = {
  code: string;
  level: Level;
  givens: number[];
  solution: number[];
  limitMs: number;
  startedAt: number | null;
  players: Player[];
  verdict: Verdict | null;
  staked: boolean;
  stake?: string;
  matchId: string | null;
  chain: "pending" | "settled" | "refunded" | "closed" | null;
  settleFailures?: number;
  settleSignature?: string;
  openedAt?: number;
  listed?: boolean;
  programId?: string;
  mint?: string;
  audit?: AuditEvent[];
};

type Captcha = { target: number; tries: number; passed: boolean };

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** A full grid posted faster than this is rejected. Humans still finish well after it. */
export const MIN_FINISH_MS = 15_000;

/** Stops a solver from posting every cell in one burst. */
export const MIN_MOVE_GAP_MS = 400;

export function createMatchStore(now: () => number = Date.now, reveal = false, persistPath?: string) {
  const rooms = new Map<string, Room>();
  if (persistPath) {
    try {
      const saved = JSON.parse(readFileSync(persistPath, "utf8")) as Room[];
      for (const room of saved) rooms.set(room.code, room);
    } catch {
      // A missing file means this is the first run.
    }
  }
  function puzzleHash(givens: number[]) {
    return createHash("sha256").update(Buffer.from(givens)).digest("hex");
  }

  function record(room: Room, kind: AuditEvent["kind"], extra: Partial<AuditEvent> = {}) {
    const event: AuditEvent = {
      at: now(),
      kind,
      matchId: room.matchId,
      wallet: extra.wallet ?? null,
      seat: extra.seat ?? null,
      programId: room.programId ?? null,
      mint: room.mint ?? null,
      stake: room.stake ?? null,
      signature: extra.signature ?? null,
      puzzleHash: puzzleHash(room.givens),
      cell: extra.cell ?? null,
      closeEligible: extra.closeEligible ?? null,
      fastFinish: extra.fastFinish ?? null,
    };
    room.audit = [...(room.audit ?? []), event];
  }

  function save() {
    if (!persistPath) return;
    try {
      mkdirSync(dirname(persistPath), { recursive: true });
      writeFileSync(persistPath, JSON.stringify([...rooms.values()]));
    } catch {
      // A hosted isolate has no durable disk. The caller stores the snapshot.
    }
  }

  function snapshot() {
    return JSON.stringify({ rooms: [...rooms.values()], captchas: [...captchas.entries()] });
  }

  function replace(raw: string | null) {
    rooms.clear();
    captchas.clear();
    if (!raw) return;
    const parsed = JSON.parse(raw) as Room[] | { rooms?: Room[]; captchas?: [string, Captcha][] };
    const list = Array.isArray(parsed) ? parsed : parsed.rooms ?? [];
    for (const room of list) rooms.set(room.code, room);
    if (!Array.isArray(parsed) && parsed.captchas) {
      for (const [id, captcha] of parsed.captchas) captchas.set(id, captcha);
    }
  }
  const captchas = new Map<string, Captcha>();

  function issueCaptcha() {
    const id = randomBytes(8).toString("hex");
    const target = 0.62 + Math.random() * 0.28;
    captchas.set(id, { target, tries: 0, passed: false });
    return { id, target };
  }

  function checkCaptcha(id: string, value: number): boolean {
    const captcha = captchas.get(id);
    if (!captcha || captcha.passed) return false;
    captcha.tries += 1;
    if (Math.abs(captcha.target - value) <= 0.035) {
      captcha.passed = true;
      return true;
    }
    if (captcha.tries >= 3) captchas.delete(id);
    return false;
  }

  function consumeCaptcha(id: string) {
    const captcha = captchas.get(id);
    if (!captcha?.passed) throw new Error("Pass the slider check first");
    captchas.delete(id);
  }

  const practiceOpens: number[] = [];

  function gateFree() {
    const at = now();
    while (practiceOpens.length > 0 && at - practiceOpens[0]! > 60_000) practiceOpens.shift();
    if (practiceOpens.length >= 12) throw new Error("Practice is busy. Try again in a minute.");
    practiceOpens.push(at);
  }

  function createRoom(level: Level, captchaId: string, wallet?: string, limitMs?: number, practice = false, stake?: unknown, mint?: string) {
    ensureCapacity();
    if (wallet && !practice) consumeCaptcha(captchaId);
    else if (captchaId) consumeCaptcha(captchaId);
    else gateFree();
    const puzzle = generatePuzzle(level);
    const code = roomCode(rooms);
    const player = makePlayer(puzzle.givens, wallet);
    const staked = Boolean(wallet) && !practice;
    rooms.set(code, {
      code,
      level,
      givens: puzzle.givens,
      solution: puzzle.solution,
      limitMs: limitMs ?? MATCH_LIMIT_MS[level],
      startedAt: null,
      players: [player],
      verdict: null,
      staked,
      stake: staked ? parseStake(stake).toString() : undefined,
      matchId: staked ? String(randomBytes(6).readUIntBE(0, 6)) : null,
      chain: staked ? "pending" : null,
      openedAt: now(),
      listed: false,
      programId: staked ? activeEscrowProgramId() : undefined,
      mint: staked ? mint : undefined,
    });
    record(rooms.get(code)!, "created", { wallet: player.wallet, seat: 0 });
    save();
    return { playerId: player.id, ...view(rooms.get(code)!, player.id), ...(reveal ? { solution: puzzle.solution } : {}) };
  }

  function pruneWaiting(at: number) {
    for (const room of [...rooms.values()]) {
      const opened = room.openedAt ?? 0;
      const alone = !room.startedAt && !room.verdict && room.players.length === 1 && !room.players.some((player) => player.deposited);
      if (alone && opened) {
        const age = at - opened;
        if (room.staked) {
          if (room.chain === "pending" && age > 2 * 60 * 60 * 1000) rooms.delete(room.code);
        } else if (room.listed && age > QUICK_WAIT_MS) {
          rooms.delete(room.code);
        } else if (!room.listed && age > 2 * 60 * 60 * 1000) {
          rooms.delete(room.code);
        }
        continue;
      }
      if (!room.staked && room.verdict && room.startedAt && at - room.startedAt > 3 * 60 * 60 * 1000) {
        rooms.delete(room.code);
      }
    }
  }

  function ensureCapacity() {
    pruneWaiting(now());
    let waiting = 0;
    for (const room of rooms.values()) if (!room.startedAt && !room.verdict) waiting += 1;
    if (waiting >= 24) throw new Error("The lobby is full. Try again in a few minutes.");
  }

  function quickMatch(level: Level, captchaId: string) {
    if (captchaId) consumeCaptcha(captchaId);
    else gateFree();
    pruneWaiting(now());
    const open = [...rooms.values()].find((room) => waitingPractice(room, level, now()));
    if (open) {
      const player = makePlayer(open.givens);
      open.players.push(player);
      open.startedAt = now();
      save();
      return { playerId: player.id, ...view(open, player.id) };
    }
    ensureCapacity();
    const puzzle = generatePuzzle(level);
    const code = roomCode(rooms);
    const player = makePlayer(puzzle.givens);
    rooms.set(code, {
      code,
      level,
      givens: puzzle.givens,
      solution: puzzle.solution,
      limitMs: MATCH_LIMIT_MS[level],
      startedAt: null,
      players: [player],
      verdict: null,
      staked: false,
      matchId: null,
      chain: null,
      openedAt: now(),
      listed: true,
    });
    save();
    return { playerId: player.id, ...view(rooms.get(code)!, player.id) };
  }

  function listOpen() {
    pruneWaiting(now());
    return [...rooms.values()]
      .filter((room) => waitingPractice(room, room.level, now()))
      .slice(0, 8)
      .map((room) => ({
        code: room.code,
        level: room.level,
        waitingSec: Math.max(0, Math.floor((now() - (room.openedAt ?? now())) / 1000)),
      }));
  }

  function joinRoom(code: string, captchaId: string, wallet?: string) {
    if (wallet || captchaId) consumeCaptcha(captchaId);
    else gateFree();
    const room = rooms.get(code.toUpperCase());
    if (!room) throw new Error("No room with that code");
    if (room.players.length >= 2) throw new Error("That room is full");
    if (room.staked && !wallet) throw new Error("Connect a wallet to join a staked match");
    if (room.staked && room.players.some((player) => player.wallet === wallet)) throw new Error("That wallet is already in this match");
    const player = makePlayer(room.givens, wallet);
    room.players.push(player);
    record(room, "joined", { wallet: player.wallet, seat: 1 });
    if (!room.staked) room.startedAt = now();
    save();
    return { playerId: player.id, ...view(room, player.id) };
  }

  function markDeposit(code: string, playerId: string) {
    const room = rooms.get(code.toUpperCase());
    if (!room) throw new Error("No room with that code");
    const player = room.players.find((item) => item.id === playerId);
    if (!player) throw new Error("Unknown player");
    if (player.deposited) return view(room, playerId);
    player.deposited = true;
    record(room, "deposited", { wallet: player.wallet, seat: room.players.indexOf(player) });
    if (room.staked && room.players.length === 2 && room.players.every((item) => item.deposited) && !room.startedAt) {
      room.startedAt = now();
    }
    save();
    return view(room, playerId);
  }

  function noteFailure(code: string) {
    const room = rooms.get(code.toUpperCase());
    if (!room) return;
    room.settleFailures = (room.settleFailures ?? 0) + 1;
    save();
  }

  function noteSettlement(code: string, chain: "settled" | "refunded" = "settled") {
    const room = rooms.get(code.toUpperCase());
    if (room) {
      if (room.chain === chain) {
        save();
        return;
      }
      room.chain = chain;
      record(room, chain === "refunded" ? "refunded" : "settled", {
        signature: room.settleSignature ?? null,
        closeEligible: true,
      });
    }
    save();
  }

  function move(code: string, playerId: string, values: number[]) {
    const room = rooms.get(code.toUpperCase());
    if (!room) throw new Error("No room with that code");
    const player = room.players.find((item) => item.id === playerId);
    if (!player) throw new Error("Unknown player");
    if (room.verdict || !room.startedAt) return view(room, playerId);
    if (!Array.isArray(values) || values.length !== 81) throw new Error("Board must have 81 cells");
    for (let i = 0; i < 81; i++) {
      const value = values[i];
      if (!Number.isInteger(value) || value < 0 || value > 9) throw new Error("Invalid digit");
      if (room.givens[i] && value !== room.givens[i]) throw new Error("Given cells stay fixed");
    }
    let changed = 0;
    for (let i = 0; i < 81; i++) if (values[i] !== player.values[i]) changed++;
    if (changed !== 1) throw new Error("Enter one cell at a time");
    for (let i = 0; i < 81; i++) {
      if (player.values[i] !== 0 && values[i] !== player.values[i]) throw new Error("Filled cells stay fixed");
    }
    const at = now();
    if (player.lastMoveAt && at - player.lastMoveAt < MIN_MOVE_GAP_MS) throw new Error("Slow down");
    const elapsed = at - room.startedAt;
    const solved = values.every((value, index) => value === room.solution[index]);
    const empties = room.givens.filter((value) => value === 0).length;
    if (solved && (elapsed < MIN_FINISH_MS || player.moves + 1 < empties)) {
      throw new Error("That finish was rejected");
    }
    const changedAt = values.findIndex((value, index) => value !== player.values[index]);
    player.values = values.slice();
    player.moves += 1;
    record(room, "move", { wallet: player.wallet, seat: room.players.indexOf(player), cell: changedAt });
    if (solved) record(room, "finished", {
      wallet: player.wallet,
      seat: room.players.indexOf(player),
      fastFinish: elapsed < 25_000,
    });
    save();
    player.lastMoveAt = at;
    if (solved && elapsed <= room.limitMs) player.completedMs = elapsed;
    settle(room, now());
    return view(room, playerId);
  }

  function state(code: string, playerId: string) {
    const room = rooms.get(code.toUpperCase());
    if (!room) throw new Error("No room with that code");
    if (!room.players.some((player) => player.id === playerId)) throw new Error("Unknown player");
    if (room.chain === "refunded" && room.verdict) {
      room.verdict = null;
      save();
    }
    const hadVerdict = room.verdict !== null;
    settle(room, now());
    if (!hadVerdict && room.verdict) save();
    return view(room, playerId);
  }

  function stakeInfo(code: string) {
    const room = rooms.get(code.toUpperCase());
    if (!room?.staked || !room.matchId) return null;
    return {
      matchId: room.matchId,
      wallets: room.players.map((player) => player.wallet),
      playerIds: room.players.map((player) => player.id),
      deposited: room.players.map((player) => player.deposited),
      verdict: room.verdict,
      chain: room.chain,
      stake: parseStake(room.stake).toString(),
      limitMs: room.limitMs,
      settleSignature: room.settleSignature ?? null,
      programId: roomEscrowProgramId(room.programId),
    };
  }

  function noteSettleSignature(code: string, signature: string) {
    const room = rooms.get(code.toUpperCase());
    if (!room) return;
    room.settleSignature = signature;
    const row = [...(room.audit ?? [])].reverse().find((event) => event.kind === "settled" || event.kind === "refunded");
    if (row) row.signature = signature;
    save();
  }

  function clearSettleSignature(code: string) {
    const room = rooms.get(code.toUpperCase());
    if (!room) return;
    room.settleSignature = undefined;
    save();
  }

  function claimSeat(code: string, wallet: string) {
    const room = rooms.get(code.toUpperCase());
    if (!room) throw new Error("No room with that code");
    const player = room.players.find((item) => item.wallet === wallet);
    if (!player) throw new Error("That wallet is not seated in this room");
    record(room, "resumed", { wallet, seat: room.players.indexOf(player) });
    save();
    return { playerId: player.id, ...view(room, player.id) };
  }

  function noteClose(code: string, signature: string) {
    const room = rooms.get(code.toUpperCase());
    if (!room || room.audit?.some((event) => event.kind === "closed")) return;
    const opener = room.players[0];
    record(room, "closed", { wallet: opener?.wallet ?? null, seat: 0, signature, closeEligible: false });
    room.chain = "closed";
    save();
  }

  function historyFor(code: string, wallet: string) {
    const room = rooms.get(code.toUpperCase());
    if (!room?.verdict) throw new Error("This match has no result yet");
    const player = room.players.find((item) => item.wallet === wallet);
    if (!player) throw new Error("That wallet is not seated in this room");
    const outcome = room.verdict.outcome === "draw" ? "draw" : room.verdict.winnerId === player.id ? "win" : "loss";
    return {
      code: room.code,
      mode: room.staked ? "staked" : "practice",
      level: room.level,
      seconds: player.completedMs == null ? null : Math.floor(player.completedMs / 1000),
      outcome,
      chain: room.chain,
      at: room.startedAt,
    };
  }

  function localSolution(code: string) {
    const room = rooms.get(code.toUpperCase());
    return room?.solution ?? null;
  }

  function auditFor(code: string) {
    return rooms.get(code.toUpperCase())?.audit ?? [];
  }

  return { issueCaptcha, checkCaptcha, createRoom, joinRoom, quickMatch, listOpen, move, state, markDeposit, noteSettlement, noteFailure, noteSettleSignature, clearSettleSignature, stakeInfo, claimSeat, noteClose, historyFor, localSolution, snapshot, replace, auditFor };
}

function settle(room: Room, now: number) {
  if (room.verdict || !room.startedAt || room.players.length < 2) return;
  if (room.chain === "refunded" || room.chain === "settled") return;
  const elapsed = now - room.startedAt;
  const someoneFinished = room.players.some((player) => player.completedMs !== null);
  if (!someoneFinished && elapsed < room.limitMs) return;
  const [a, b] = room.players;
  room.verdict = judgeMatch(a, b, room.solution, room.limitMs);
}

function view(room: Room, playerId: string): PublicRoom {
  const you = room.players.find((player) => player.id === playerId)!;
  const other = room.players.find((player) => player.id !== playerId);
  return {
    code: room.code,
    level: room.level,
    givens: room.givens,
    board: you.values.slice(),
    limitMs: room.limitMs,
    startedAt: room.startedAt,
    staked: room.staked,
    stake: room.staked ? stakeLabel(parseStake(room.stake)) : null,
    matchId: room.matchId,
    you: { filled: filled(you.values), finished: you.completedMs !== null, deposited: you.deposited, wallet: you.wallet },
    opponent: other
      ? { joined: true, filled: filled(other.values), finished: other.completedMs !== null, deposited: other.deposited }
      : { joined: false, filled: 0, finished: false, deposited: false },
    verdict: room.verdict,
    youWon: room.verdict?.outcome === "win" ? room.verdict.winnerId === playerId : null,
    chain: room.chain,
    programId: room.programId ?? null,
    canClose: room.players[0]?.id === playerId,
    settleFailures: room.settleFailures ?? 0,
    listed: room.listed === true,
    expired: legacyOpeningRetired(room),
  };
}

/** An unfunded legacy room cannot open once new rooms use V2. Do not retarget its match id. */
function legacyOpeningRetired(room: Room): boolean {
  if (!room.staked || room.chain === "settled" || room.chain === "refunded" || room.chain === "closed") return false;
  if (room.players.some((player) => player.deposited)) return false;
  if (roomEscrowProgramId(room.programId) !== ESCROW_PROGRAM_ID) return false;
  try {
    return activeEscrowProgramId() !== ESCROW_PROGRAM_ID;
  } catch {
    return false;
  }
}

const QUICK_WAIT_MS = 20 * 60 * 1000;

function waitingPractice(room: Room, level: Level, at: number): boolean {
  if (!room.listed || room.staked || room.level !== level || room.players.length !== 1 || room.startedAt || room.verdict) return false;
  return at - (room.openedAt ?? 0) <= QUICK_WAIT_MS;
}


function filled(values: number[]): number {
  return values.filter(Boolean).length;
}

function makePlayer(givens: number[], wallet?: string): Player {
  return {
    id: randomBytes(8).toString("hex"),
    values: givens.slice(),
    completedMs: null,
    moves: 0,
    lastMoveAt: 0,
    wallet: wallet ?? null,
    deposited: false,
  };
}

function roomCode(rooms: Map<string, Room>): string {
  for (let attempt = 0; attempt < 20; attempt++) {
    let code = "";
    const bytes = randomBytes(4);
    for (const byte of bytes) code += ALPHABET[byte % ALPHABET.length];
    if (!rooms.has(code)) return code;
  }
  throw new Error("Could not allocate a room code");
}
