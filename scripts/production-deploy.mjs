import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Keypair } from "@solana/web3.js";

if (process.argv.includes("--execute")) {
  console.error("Mainnet program deploy is not authorized");
  process.exit(2);
}

const outDir = mkdtempSync(join(tmpdir(), "sudoku-deploy-"));
const outfile = join(outDir, "deploy.mjs");
const built = spawnSync("npx", ["esbuild", "src/solana/productionDeploy.ts", "--bundle", "--platform=node", "--format=esm", `--outfile=${outfile}`], {
  shell: true,
  encoding: "utf8",
});
if (built.status !== 0) throw new Error("Could not load the production deploy check");
const { selectProductionDeploy } = await import(pathToFileURL(outfile).href);

function pubkeyOf(path) {
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(path, "utf8")))).publicKey.toBase58();
}

function repoPath(...parts) {
  const root = decodeURIComponent(new URL("..", import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, "$1");
  return join(root, ...parts);
}

const artifactPath = repoPath("programs", "match-escrow", "target", "deploy", "match_escrow.so");
const artifactKeyPath = repoPath("programs", "match-escrow", "target", "deploy", "match_escrow-keypair.json");
const upgradeKeyPath = join(homedir(), ".config", "solana", "sudoku-mainnet-upgrade.json");
const override = process.argv.indexOf("--keypair");
const deploymentKeyPath = override >= 0
  ? resolve(process.argv[override + 1] ?? "")
  : join(homedir(), ".config", "solana", "sudoku-mainnet-program.json");
if (!existsSync(deploymentKeyPath) || !existsSync(artifactKeyPath) || !existsSync(artifactPath) || !existsSync(upgradeKeyPath)) {
  console.error("Production deploy files are missing");
  process.exit(1);
}
const draft = JSON.parse(readFileSync(new URL("../config/production.json", import.meta.url), "utf8"));
const artifact = readFileSync(artifactPath);
const artifactSha256 = createHash("sha256").update(artifact).digest("hex");
try {
  const plan = selectProductionDeploy({
    configuredProgramId: draft.programId,
    deploymentKey: pubkeyOf(deploymentKeyPath),
    deploymentKeyPath,
    artifactKey: pubkeyOf(artifactKeyPath),
    artifactKeyPath,
    artifactPath,
    upgradeAuthority: pubkeyOf(upgradeKeyPath),
    upgradeAuthorityPath: upgradeKeyPath,
    artifactSha256,
    expectedArtifactSha256: draft.expectedArtifactSha256,
  });
  console.log(JSON.stringify({
    programId: plan.programId,
    keypair: basename(plan.keypairPath),
    upgradeAuthority: basename(upgradeKeyPath),
    artifactSha256,
    artifactBytes: artifact.length,
    artifactKeyIsLegacy: plan.artifactKey === "HUkhJi8p1XXuErpEXkgpfQjwdapigXLECRoQSu3indyS",
    execute: plan.execute,
    commandUsesDedicatedKey: plan.command.includes(plan.keypairPath) && plan.command.includes(upgradeKeyPath) && !plan.command.some((part) => part.replaceAll("\\", "/").endsWith("/target/deploy/match_escrow-keypair.json")),
  }));
} catch (error) {
  console.error(error instanceof Error ? error.message : "Production deploy was refused");
  process.exit(1);
}
