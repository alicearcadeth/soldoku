import { randomBytes } from "node:crypto";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { generatePuzzle } from "../engine/generate";
import { LEVELS, type Puzzle } from "../engine/types";
import { DAY_MS, type CompetitionView, type CompetitionSummary } from "./types";

type Entrant = { actor: string; name: string; startedAt: number | null; completedMs: number | null; values: number[]; sequence: number; lastMoveAt: number };
type Room = { code: string; name?: string; owner: string; createdAt: number; endsAt: number; puzzle: Puzzle; entrants: Entrant[] };
type Gate = { id: string; actor: string; target: number; expires: number; passed: boolean; tries: number };
type Proof = { id: string; wallet: string; message: string; expires: number };
type Session = { id: string; wallet: string; expires: number };
export const MIN_COMPETITION_FINISH_MS = 15000;
const secret = () => randomBytes(24).toString("hex");

export function createCompetitionStore(now = Date.now, onSave?: (raw: string) => void) {
  let rooms: Room[] = [];
  let gates: Gate[] = [];
  let proofs: Proof[] = [];
  let sessions: Session[] = [];
  const snapshot = () => JSON.stringify({ rooms, gates, proofs, sessions });
  const save = () => onSave?.(snapshot());
  function replace(raw: string | null) {
    const parsed = raw ? JSON.parse(raw) as { rooms: Room[]; gates: Gate[]; proofs?: Proof[]; sessions?: Session[] } : { rooms: [], gates: [] };
    rooms = parsed.rooms;
    gates = parsed.gates;
    proofs = parsed.proofs ?? [];
    sessions = parsed.sessions ?? [];
  }
  function actor(value: unknown): string {
    const session = sessions.find(item => item.id === value && item.expires > now());
    if (!session) throw new Error("Connect your wallet and verify your competition session again.");
    return session.wallet;
  }
  function room(code: unknown): Room {
    const result = rooms.find(item => item.code === String(code).toUpperCase());
    if (!result) throw new Error("Competition not found. Check the room code.");
    return result;
  }
  function active(item: Room, at = now()) {
    if (at >= item.endsAt) throw new Error("This competition has ended.");
  }
  function duration(value: unknown): number {
    if (typeof value !== "number" || !Number.isInteger(value) || value < 60000 || value > 365 * DAY_MS) throw new Error("Choose a duration between 1 minute and 365 days.");
    return value;
  }
  function takeGate(id: unknown, player: string) {
    const gate = gates.find(item => item.id === id && item.actor === player);
    if (!gate || !gate.passed || now() >= gate.expires) throw new Error("Complete the slider check again.");
    gates = gates.filter(item => item !== gate);
  }
  function summary(item: Room): CompetitionSummary {
    const best = item.entrants.reduce((result, entrant) => entrant.completedMs === null ? result : Math.min(result, entrant.completedMs), Infinity);
    return { code: item.code, name: item.name || `Room ${item.code}`, level: item.puzzle.level, createdAt: item.createdAt, endsAt: item.endsAt, durationMs: item.endsAt - item.createdAt, participants: item.entrants.length, status: now() < item.endsAt ? "active" : "ended", token: null, stake: 0, bestMs: Number.isFinite(best) ? best : null };
  }
  function view(item: Room, player?: string): CompetitionView {
    const completed = item.entrants.filter(entrant => entrant.completedMs !== null).sort((a, b) => a.completedMs! - b.completedMs!);
    const entrant = item.entrants.find(entry => entry.actor === player);
    const rank = entrant?.completedMs == null ? null : completed.filter(entry => entry.completedMs! < entrant.completedMs!).length + 1;
    return { ...summary(item), leaderboard: completed.slice(0, 50).map(entry => ({ name: entry.name, completedMs: entry.completedMs!, rank: completed.filter(other => other.completedMs! < entry.completedMs!).length + 1 })), you: entrant ? { name: entrant.name, owner: item.owner === player, canExtend: item.owner === player && item.entrants.length === 1 && now() < item.endsAt, startedAt: entrant.startedAt, completedMs: entrant.completedMs, rank, board: entrant.startedAt === null ? null : entrant.values, givens: entrant.startedAt === null ? null : item.puzzle.givens, sequence: entrant.sequence } : null };
  }
  function enter(item: Room, player: string) {
    if (!item.entrants.some(entry => entry.actor === player)) item.entrants.push({ actor: player, name: `${player.slice(0, 4)}…${player.slice(-4)}`, startedAt: null, completedMs: null, values: [...item.puzzle.givens], sequence: 0, lastMoveAt: 0 });
    return view(item, player);
  }
  function route(method: string, url: URL, body: Record<string, unknown>) {
    if (method === "POST" && url.pathname === "/api/competitions/proof") {
      const wallet = String(body.wallet ?? "");
      try { if (bs58.decode(wallet).length !== 32) throw new Error(); } catch { throw new Error("Invalid Solana wallet address."); }
      proofs = proofs.filter(item => item.expires > now() && item.wallet !== wallet);
      const id = secret();
      const message = `Sudoku leaderboard session\nOrigin: ${url.origin}\nWallet: ${wallet}\nNonce: ${id}\nThis signature verifies your identity. No transactions or token transfers.`;
      proofs.push({ id, wallet, message, expires: now() + 120000 });
      save();
      return { id, message };
    }
    if (method === "POST" && url.pathname === "/api/competitions/authorize") {
      const proof = proofs.find(item => item.id === body.id && item.expires > now());
      if (!proof) throw new Error("Your wallet proof expired. Sign again.");
      let valid = false;
      try { valid = nacl.sign.detached.verify(new TextEncoder().encode(proof.message), bs58.decode(String(body.signature)), bs58.decode(proof.wallet)); } catch { /* Invalid proof is rejected below. */ }
      if (!valid) throw new Error("Wallet signature was rejected.");
      proofs = proofs.filter(item => item !== proof);
      const session = { id: secret(), wallet: proof.wallet, expires: now() + DAY_MS };
      sessions = sessions.filter(item => item.expires > now());
      sessions.push(session);
      save();
      return { actor: session.id, wallet: session.wallet, expires: session.expires };
    }
    if (method === "GET" && url.pathname === "/api/competitions") return { rooms: [...rooms].reverse().map(summary) };
    if (method === "POST" && url.pathname === "/api/competitions/state") return view(room(body.code), body.actor ? actor(body.actor) : undefined);
    if (method === "POST" && url.pathname === "/api/competitions/check") {
      const player = actor(body.actor);
      gates = gates.filter(gate => now() < gate.expires && gate.actor !== player);
      const gate: Gate = { id: secret(), actor: player, target: (25 + randomBytes(1)[0] % 51) / 100, expires: now() + 120000, passed: false, tries: 0 };
      gates.push(gate);
      save();
      return { id: gate.id, target: gate.target };
    }
    if (method === "POST" && url.pathname === "/api/competitions/check/verify") {
      const player = actor(body.actor);
      const gate = gates.find(item => item.id === body.id && item.actor === player);
      if (!gate || gate.expires <= now() || gate.tries >= 5) throw new Error("This check expired. Open it again.");
      gate.tries++;
      gate.passed = typeof body.value === "number" && Number.isFinite(body.value) && Math.abs(body.value - gate.target) <= 0.045;
      save();
      return { ok: gate.passed };
    }
    if (method === "POST" && url.pathname === "/api/competitions/create") {
      const player = actor(body.actor);
      if (body.mode !== "free") throw new Error("Token entry is unavailable: this release's escrow supports only two-player test-token races. No tokens were taken.");
      if (!LEVELS.includes(body.level as Puzzle["level"])) throw new Error("Choose a valid difficulty.");
      const period = duration(body.durationMs);
      const name = typeof body.name === "string" ? body.name.trim().replace(/\s+/g, " ") : "";
      if (name.length > 60 || /[\u0000-\u001f\u007f]/.test(name)) throw new Error("Room names must be 60 characters or fewer, without control characters.");
      takeGate(body.gateId, player);
      let code = "";
      do { code = randomBytes(4).toString("hex").toUpperCase(); } while (rooms.some(item => item.code === code));
      const item: Room = { code, name: name || `Room ${code}`, owner: player, createdAt: now(), endsAt: now() + period, puzzle: generatePuzzle(body.level as Puzzle["level"]), entrants: [] };
      rooms.push(item);
      const result = enter(item, player);
      save();
      return result;
    }
    if (method === "POST" && url.pathname === "/api/competitions/join") {
      const item = room(body.code);
      active(item);
      const result = enter(item, actor(body.actor));
      save();
      return result;
    }
    if (method === "POST" && url.pathname === "/api/competitions/extend") {
      const item = room(body.code);
      active(item);
      if (item.owner !== actor(body.actor)) throw new Error("Only the creator can extend this room.");
      if (item.entrants.length !== 1) throw new Error("The duration is locked because another player joined.");
      const nextDeadline = item.endsAt + duration(body.durationMs);
      if (nextDeadline - now() > 365 * DAY_MS) throw new Error("The deadline cannot be more than 365 days away.");
      item.endsAt = nextDeadline;
      save();
      return view(item, actor(body.actor));
    }
    if (method === "POST" && url.pathname === "/api/competitions/start") {
      const item = room(body.code);
      active(item);
      const entrant = item.entrants.find(entry => entry.actor === actor(body.actor));
      if (!entrant) throw new Error("Join the room before starting.");
      if (entrant.startedAt === null) entrant.startedAt = now();
      save();
      return view(item, actor(body.actor));
    }
    if (method === "POST" && url.pathname === "/api/competitions/move") {
      const item = room(body.code);
      const at = now();
      active(item, at);
      const entrant = item.entrants.find(entry => entry.actor === actor(body.actor));
      if (!entrant || entrant.startedAt === null) throw new Error("Start your challenge first.");
      if (entrant.completedMs !== null) throw new Error("Your attempt is already finished.");
      if (body.sequence !== entrant.sequence + 1) throw new Error("Your board changed. Reload its latest state.");
      const values = body.values;
      if (!Array.isArray(values) || values.length !== 81 || values.some(value => !Number.isInteger(value) || value < 0 || value > 9)) throw new Error("Invalid board.");
      if (values.some((value, index) => item.puzzle.givens[index] && item.puzzle.givens[index] !== value)) throw new Error("Given digits cannot change.");
      if (values.filter((value, index) => value !== entrant.values[index]).length !== 1) throw new Error("Enter one cell at a time.");
      if (at - entrant.lastMoveAt < 120) throw new Error("Please enter one move at a time.");
      const finished = values.every((value, index) => value === item.puzzle.solution[index]);
      if (finished && at - entrant.startedAt < MIN_COMPETITION_FINISH_MS) throw new Error("This finish is too fast to verify. Please wait and enter the final digit again.");
      entrant.values = [...values];
      entrant.lastMoveAt = at;
      entrant.sequence++;
      if (finished) entrant.completedMs = at - entrant.startedAt;
      save();
      return view(item, actor(body.actor));
    }
    throw new Error("Unknown competition request.");
  }
  return { route, snapshot, replace };
}
