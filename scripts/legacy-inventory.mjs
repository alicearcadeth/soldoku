import { loadOperatorEnv } from "./operator-env.mjs";
/**
 * Read-only inventory of public Devnet rooms and the legacy program.
 * Prints public keys and room status only.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseEnv } from "node:util";
import { Connection, PublicKey } from "@solana/web3.js";
import { getAccount, getAssociatedTokenAddressSync } from "@solana/spl-token";

const LEGACY = new PublicKey("HUkhJi8p1XXuErpEXkgpfQjwdapigXLECRoQSu3indyS");
const env = loadOperatorEnv();
const rpc = env.ARTPORTAL_SOLANA_RPC_URL?.trim();
if (!rpc) throw new Error("Devnet RPC is not configured");
const connection = new Connection(rpc, "confirmed");

const query = spawnSync(
  'npx --yes wrangler d1 execute sudoku-matches --remote --json --command "SELECT body FROM matches WHERE id = 1"',
  { shell: true, encoding: "utf8", maxBuffer: 20_000_000 },
);
if (query.status !== 0) throw new Error(`D1 inventory failed: ${(query.stderr || query.stdout || "").slice(0, 300)}`);
const start = query.stdout.indexOf("[");
const parsed = JSON.parse(query.stdout.slice(start));
const row = parsed[0]?.results?.[0] ?? parsed.results?.[0];
const body = row?.body;
if (!body) throw new Error(`D1 match snapshot was empty (${Object.keys(parsed[0] ?? {}).join(",")})`);
const saved = JSON.parse(body);
const rooms = saved.rooms ?? saved;

const program = await connection.getAccountInfo(LEGACY);
let upgradeAuthority = null;
let programData = null;
if (program && program.data.length >= 36) {
  programData = new PublicKey(program.data.subarray(4, 36)).toBase58();
  const data = await connection.getAccountInfo(new PublicKey(programData));
  if (data && data.data.length >= 45 && data.data[12] === 1) {
    upgradeAuthority = new PublicKey(data.data.subarray(13, 45)).toBase58();
  }
}

const rows = [];
for (const room of rooms) {
  const row = {
    code: room.code,
    staked: Boolean(room.staked),
    chain: room.chain ?? null,
    matchId: room.matchId ?? null,
    deposited: (room.players ?? []).map((player) => Boolean(player.deposited)),
    players: (room.players ?? []).length,
    listed: Boolean(room.listed),
    programId: room.programId ?? null,
    status: null,
    outcome: null,
    stake: null,
    vault: null,
    authority: null,
    owner: null,
  };
  if (room.matchId) {
    const idBuf = Buffer.alloc(8);
    idBuf.writeBigUInt64LE(BigInt(room.matchId));
    const [pda] = PublicKey.findProgramAddressSync([Buffer.from("match"), idBuf], LEGACY);
    const info = await connection.getAccountInfo(pda);
    row.owner = info ? info.owner.toBase58() : null;
    if (info && info.data.length >= 163) {
      row.status = info.data[160];
      row.outcome = info.data[161];
      row.stake = Buffer.from(info.data.subarray(136, 144)).readBigUInt64LE().toString();
      row.authority = new PublicKey(info.data.subarray(8, 40)).toBase58();
      const mint = new PublicKey(info.data.subarray(40, 72));
      const vault = getAssociatedTokenAddressSync(mint, pda, true);
      const vaultAccount = await getAccount(connection, vault).catch(() => null);
      row.vault = vaultAccount ? vaultAccount.amount.toString() : "0";
    }
  }
  rows.push(row);
}

const snapshot = {
  at: new Date().toISOString(),
  workerDatabase: "sudoku-matches",
  legacyProgram: LEGACY.toBase58(),
  programOwner: program?.owner.toBase58() ?? null,
  programData,
  upgradeAuthority,
  rooms: rows,
};
mkdirSync("snapshots", { recursive: true });
const file = join("snapshots", process.argv[2] || "legacy-devnet-before-v2.json");
writeFileSync(file, JSON.stringify(snapshot, null, 2));
const funded = rows.filter((row) => row.status === 0 || row.status === 1);
console.log(JSON.stringify({
  file,
  rooms: rows.length,
  withMatchId: rows.filter((row) => row.matchId).length,
  onChain: rows.filter((row) => row.status !== null).length,
  unresolved: funded.length,
  upgradeAuthority,
  programData,
}, null, 2));
console.log(rows.filter((row) => ["CNNM", "FJTY", "NNPV", "74RM", "UGWU", "XVBJ"].includes(row.code) || row.status !== null).map((row) => JSON.stringify(row)).join("\n"));
