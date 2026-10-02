import { spawnSync } from "node:child_process";

const code = (process.argv[2] ?? "CG5M").toUpperCase();
const sql = `SELECT json_extract(value, '$.code') AS code, json_extract(value, '$.openedAt') AS openedAt, json_extract(value, '$.chain') AS chain, json_extract(value, '$.stake') AS stake, json_extract(value, '$.programId') AS programId, json_extract(value, '$.matchId') AS matchId, json_extract(value, '$.players[0].id') AS playerId, json_extract(value, '$.players[0].wallet') AS wallet, json_extract(value, '$.players[0].deposited') AS deposited FROM matches, json_each(json_extract(matches.body, '$.rooms')) WHERE matches.id = 1 AND json_extract(value, '$.code') = '${code}'`;
const run = spawnSync(`npx wrangler d1 execute sudoku-matches --remote --command "${sql}"`, {
  shell: true,
  encoding: "utf8",
  maxBuffer: 2 * 1024 * 1024,
});
if (run.error || run.status !== 0) {
  const detail = `${run.error?.message ?? ""} status ${run.status} ${run.stderr ?? ""} ${run.stdout ?? ""}`.replace(/[A-Za-z0-9+/=_-]{40,}/g, "[redacted]").slice(0, 500);
  throw new Error(`Could not read the match database: ${detail}`);
}
const start = run.stdout.indexOf("[");
const parsed = JSON.parse(run.stdout.slice(start));
const row = parsed?.[0]?.results?.[0];
if (!row) {
  console.log(JSON.stringify({ code, present: false }));
  process.exit(0);
}
console.log(JSON.stringify({
  code: row.code,
  present: true,
  openedAt: row.openedAt,
  ageMin: row.openedAt ? Math.round((Date.now() - row.openedAt) / 60000) : null,
  chain: row.chain,
  stake: row.stake,
  programId: row.programId,
  deposited: Boolean(row.deposited),
  wallet: row.wallet,
  playerId: row.playerId,
  matchId: row.matchId,
}));
