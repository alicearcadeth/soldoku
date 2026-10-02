/**
 * Safe release rehearsal. It does not deploy, broadcast a swap, activate funding, or submit a form.
 * Prints one JSON object. A non-zero exit means a required check failed.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const checks = [];

function run(name, command, args) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  checks.push({ name, ok: result.status === 0, status: result.status });
  return result;
}

run("typecheck", process.execPath, ["node_modules/typescript/bin/tsc", "--noEmit", "--pretty", "false"]);
run("unit-tests", process.execPath, ["node_modules/vitest/vitest.mjs", "run", "--exclude", "**/*.localnet.test.ts"]);

const production = JSON.parse(readFileSync("config/production.json", "utf8"));
const artifact = "programs/match-escrow/target/deploy/match_escrow.so";
if (!existsSync(artifact)) {
  checks.push({ name: "production-artifact", ok: false, status: 1 });
} else {
  const bytes = readFileSync(artifact);
  const hash = createHash("sha256").update(bytes).digest("hex");
  checks.push({
    name: "production-artifact",
    ok: hash === production.expectedArtifactSha256 && bytes.length === 29312,
    bytes: bytes.length,
    hash,
    programId: production.programId,
  });
}
run("deploy-guard", process.execPath, ["node_modules/vitest/vitest.mjs", "run", "src/solana/productionDeploy.test.ts"]);

const required = [
  "README.md",
  "docs/clock-in.md",
  "docs/fair-play.md",
  "docs/production-recovery.md",
  "submission/pitch.html",
  "submission/demo-script.md",
  "submission/sudoku-clockin.apk",
  "submission/screenshots/apk-launch.png",
  "submission/screenshots/staging-close.png",
];
checks.push({ name: "submission-files", ok: required.every((path) => existsSync(path)), missing: required.filter((path) => !existsSync(path)) });

const ignoreText = readFileSync(".gitignore", "utf8");
function ignored(path) {
  const name = path.split(/[\\/]/).pop();
  return ignoreText.split(/\r?\n/).some((line) => line && !line.startsWith("#") && (line === name || path.replaceAll("\\", "/").endsWith(line.replaceAll("\\", "/"))));
}
const secretNames = [];
const skip = new Set(["node_modules", "target", "dist", "output", ".git", "test-ledger", "data"]);
function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (skip.has(name)) continue;
    const path = join(dir, name);
    let info;
    try { info = statSync(path); } catch { continue; }
    if (info.isDirectory()) { walk(path); continue; }
    if (ignored(path)) continue;
    const lower = name.toLowerCase();
    if (lower === ".env" || lower.includes("keypair") || lower.endsWith(".pem") || name === "test-settlement-mint.json") secretNames.push(path);
  }
}
walk(".");
checks.push({ name: "secret-filenames", ok: secretNames.length === 0, found: secretNames });

const failed = checks.filter((item) => !item.ok);
console.log(JSON.stringify({ ok: failed.length === 0, checks }, null, 2));
process.exit(failed.length === 0 ? 0 : 1);
