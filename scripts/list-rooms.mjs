import { execFileSync } from "node:child_process";

const raw = execFileSync("npx.cmd", ["--yes", "wrangler", "d1", "execute", "sudoku-matches", "--remote", "--json", "--command", "SELECT body FROM matches WHERE id = 1"], {
  encoding: "utf8",
  cwd: process.cwd(),
});
const parsed = JSON.parse(raw);
const body = parsed[0]?.results?.[0]?.body ?? parsed.results?.[0]?.body;
const snapshot = JSON.parse(body);
const rooms = (snapshot.rooms ?? []).map((room) => ({
  code: room.code,
  staked: room.staked,
  chain: room.chain,
  started: Boolean(room.startedAt),
  verdict: room.verdict?.outcome ?? null,
  deposits: room.players?.map((player) => player.deposited),
  players: room.players?.length ?? 0,
}));
console.log(JSON.stringify(rooms));
