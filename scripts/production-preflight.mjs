import { loadOperatorEnv } from "./operator-env.mjs";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { Keypair, PublicKey } from "@solana/web3.js";

const outDir = mkdtempSync(join(tmpdir(), "sudoku-preflight-"));
const outfile = join(outDir, "gate.mjs");
const built = spawnSync("npx", ["esbuild", "src/solana/productionGate.ts", "--bundle", "--platform=node", "--format=esm", `--outfile=${outfile}`], {
  shell: true,
  encoding: "utf8",
});
if (built.status !== 0) throw new Error("Could not load the production gate");
const { productionFailures, upgradeAuthorityFromProgramData } = await import(pathToFileURL(outfile).href);

function pubkeyOf(path) {
  if (!existsSync(path)) return "";
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(path, "utf8")))).publicKey.toBase58();
}

const keyDir = join(homedir(), ".config", "solana");
const programKey = pubkeyOf(join(keyDir, "sudoku-mainnet-program.json"));
const matchKey = pubkeyOf(join(keyDir, "sudoku-mainnet-match.json"));
const upgradeKey = pubkeyOf(join(keyDir, "sudoku-mainnet-upgrade.json"));
const artifactKey = pubkeyOf(join("programs", "match-escrow", "target", "deploy", "match_escrow-keypair.json"));

const draft = JSON.parse(readFileSync(new URL("../config/production.json", import.meta.url), "utf8"));
const rpc = "https://api.mainnet-beta.solana.com";

async function rpcCall(method, params) {
  const response = await fetch(rpc, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(12_000),
  });
  const body = await response.json();
  if (body.error) throw new Error(body.error.message);
  return body.result;
}

const genesis = await rpcCall("getGenesisHash", []);
const mint = await rpcCall("getAccountInfo", [draft.mint, { encoding: "base64" }]);
const program = await rpcCall("getAccountInfo", [draft.programId, { encoding: "base64" }]);
const mintDecimals = mint?.value?.data?.[0] ? Buffer.from(mint.value.data[0], "base64")[44] : null;
let onChainUpgradeAuthority = null;
if (program?.value?.data?.[0]) {
  const programAccount = Buffer.from(program.value.data[0], "base64");
  if (programAccount.length >= 36 && programAccount.readUInt32LE(0) === 2) {
    const programData = await rpcCall("getAccountInfo", [new PublicKey(programAccount.subarray(4, 36)).toBase58(), { encoding: "base64" }]);
    if (programData?.value?.data?.[0]) onChainUpgradeAuthority = upgradeAuthorityFromProgramData(Buffer.from(programData.value.data[0], "base64"));
  }
}
const devnetEnv = loadOperatorEnv();
const devnetRpc = (devnetEnv.SOLANA_RPC || devnetEnv.ARTPORTAL_SOLANA_RPC_URL || "").trim();
let parserMatchesDevnet = false;
if (devnetRpc) {
  const devnetProgram = await fetch(devnetRpc, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getAccountInfo", params: ["937BAWXVCW58oEKkA1FijkSXXtdgGEytUyPRV2Roge22", { encoding: "base64" }] }),
    signal: AbortSignal.timeout(12_000),
  }).then((response) => response.json());
  const head = devnetProgram.result?.value?.data?.[0] ? Buffer.from(devnetProgram.result.value.data[0], "base64") : null;
  if (head && head.length >= 36 && head.readUInt32LE(0) === 2) {
    const dataAddress = new PublicKey(head.subarray(4, 36)).toBase58();
    const dataAccount = await fetch(devnetRpc, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getAccountInfo", params: [dataAddress, { encoding: "base64", dataSlice: { offset: 0, length: 45 } }] }),
      signal: AbortSignal.timeout(12_000),
    }).then((response) => response.json());
    const slice = dataAccount.result?.value?.data?.[0] ? Buffer.from(dataAccount.result.value.data[0], "base64") : null;
    parserMatchesDevnet = Boolean(slice) && upgradeAuthorityFromProgramData(slice) === "6fTc4rVYFz6NtHDZXeGQqTTQTiCe41Fsrz8ypxqMt8dX";
  }
}
const failures = productionFailures({
  ...draft,
  backupRpcHost: draft.backupRpcHost || "missing-backup.invalid",
  d1Id: draft.d1Id || "missing-d1",
  genesis,
  programDeployed: Boolean(program?.value),
  mintDecimals,
  programKey,
  onChainUpgradeAuthority,
  secretsPresent: false,
});
if (!draft.backupRpcHost) failures.push("Backup RPC is not set");
if (draft.backupRpcHost) {
  const backup = await fetch(`https://${draft.backupRpcHost}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getGenesisHash", params: [] }),
    signal: AbortSignal.timeout(12_000),
  }).then((response) => response.json());
  if (backup.result !== genesis) failures.push("Backup RPC genesis is not Mainnet");
}
if (!draft.d1Id) failures.push("Production D1 is not created");
if (!matchKey || matchKey !== draft.matchAuthority) failures.push("Match authority key does not match the prepared key");
if (!upgradeKey || upgradeKey !== draft.upgradeAuthority) failures.push("Upgrade authority key does not match the prepared key");
if (artifactKey && (artifactKey === draft.programId || artifactKey === programKey)) failures.push("The build artifact key is not a production program key");
if (!parserMatchesDevnet) failures.push("Upgrade authority parser does not match the known Devnet program");
console.log(JSON.stringify({
  worker: draft.workerName,
  armed: draft.armed === true,
  approval: draft.approval ? "present" : "absent",
  genesis,
  mintDecimals,
  programDeployed: Boolean(program?.value),
  programKeyMatches: programKey === draft.programId,
  artifactKeyIsLegacy: artifactKey === "HUkhJi8p1XXuErpEXkgpfQjwdapigXLECRoQSu3indyS",
  matchKeyMatches: matchKey === draft.matchAuthority,
  upgradeKeyMatches: upgradeKey === draft.upgradeAuthority,
  parserMatchesDevnet,
  funding: "off",
  failures,
}));
if (draft.armed === true || draft.approval) process.exit(2);
if (!failures.length) process.exit(2);
