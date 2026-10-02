import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const fixture = process.argv[process.argv.indexOf("--fixture") + 1];
if (!fixture) {
  console.error("Usage: node scripts/reconcile-room.mjs --fixture room.json");
  process.exit(1);
}
const outDir = mkdtempSync(join(tmpdir(), "sudoku-reconcile-"));
const outfile = join(outDir, "reconcile.mjs");
const built = spawnSync("npx", ["esbuild", "src/solana/reconcile.ts", "--bundle", "--platform=node", "--format=esm", `--outfile=${outfile}`], {
  shell: true,
  encoding: "utf8",
});
if (built.status !== 0) throw new Error("Could not load the reconciliation check");
const { reconcileRoom } = await import(pathToFileURL(outfile).href);
const books = JSON.parse(readFileSync(fixture, "utf8"));
for (const key of ["vaultBalance", "expectedStake"]) {
  if (books[key] !== null && books[key] !== undefined) books[key] = BigInt(books[key]);
}
const result = reconcileRoom(books);
console.log(JSON.stringify({ flags: result.flags, closeEligible: result.closeEligible }));
