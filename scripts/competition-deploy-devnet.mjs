import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";

// Deploy only the new dedicated competition identity, never upgrade a legacy program.
const endpoint = "https://api.devnet.solana.com";
const connection = new Connection(endpoint, "finalized");
if (await connection.getGenesisHash() !== "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG") throw new Error("Refusing a non-Devnet deployment.");
const directory = join(homedir(), ".config", "solana");
const programFile = join(directory, "soldoku-competition-program.json");
const program = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(programFile, "utf8")))).publicKey;
if (program.toBase58() !== "6uuszYMoZ2bBX8oVccpYPUgdhW6CSvASziN2m8LpJxYs") throw new Error("Dedicated competition program identity mismatch.");
const source = resolve("programs/competition-escrow/target/deploy/competition_escrow.so");
const bytes = readFileSync(source); const hash = value => createHash("sha256").update(value).digest("hex");
const toWsl = path => { const full = resolve(path); return `/mnt/${full[0].toLowerCase()}${full.slice(2).replaceAll("\\", "/")}`; };
function solana(args) {
  try { return execFileSync("wsl", ["-d", "Ubuntu", "--", "/root/.local/share/solana/install/active_release/bin/solana", ...args],
    { encoding: "utf8", timeout: 300000, stdio: ["ignore", "pipe", "pipe"] }); }
  catch (error) { throw new Error(String(error.stderr ?? "Deployment command failed.").split("\n").filter(line => line.startsWith("Error:") || line.includes("requires a minimum")).join("\n") || "Deployment command failed; inspect RPC state before retrying."); }
}
const existing = await connection.getAccountInfo(program);
const upgrade = process.argv.includes("--upgrade-competition");
if (existing && upgrade) {
  if (!existing.executable || existing.data.readUInt32LE(0) !== 2) throw new Error("Unexpected competition program account.");
  const metadata = await connection.getAccountInfo(new PublicKey(existing.data.subarray(4, 36)));
  const authority = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(join(directory, "sudoku-v2-authority.json"), "utf8")))).publicKey;
  if (!metadata || metadata.data.readUInt32LE(0) !== 3 || metadata.data[12] !== 1
    || !new PublicKey(metadata.data.subarray(13, 45)).equals(authority)) throw new Error("Competition upgrade authority mismatch.");
  if (metadata.data.length < bytes.length + 45) {
    console.log(solana(["program", "extend", program.toBase58(), String(Math.max(10240, bytes.length + 45 - metadata.data.length)),
      "--url", endpoint, "--keypair", toWsl(join(directory, "sudoku-dev.json")), "--commitment", "finalized"]).trim());
  }
}
if (!existing || upgrade) {
  const bufferFile = join(directory, `soldoku-competition-buffer-${Date.now()}.json`);
  writeFileSync(bufferFile, JSON.stringify(Array.from(Keypair.generate().secretKey)), { flag: "wx", mode: 0o600 });
  const output = solana(["program", "deploy",
    "--url", endpoint, "--keypair", toWsl(join(directory, "sudoku-dev.json")), "--program-id", toWsl(programFile),
    "--upgrade-authority", toWsl(join(directory, "sudoku-v2-authority.json")), "--buffer", toWsl(bufferFile), toWsl(source)]);
  console.log(output.trim());
}
// An existing competition upgrade requires the explicit flag above and matching authority.
let account;
for (let count = 0; count < 90; count++) {
  account = await connection.getAccountInfo(program);
  if (account?.executable) break;
  await new Promise(resolve => setTimeout(resolve, 1000));
}
if (!account?.executable || account.data.readUInt32LE(0) !== 2) throw new Error("Competition program deployment is not finalized.");
const programDataAddress = new PublicKey(account.data.subarray(4, 36));
let data;
for (let count = 0; count < (upgrade ? 90 : 1); count++) {
  data = await connection.getAccountInfo(programDataAddress);
  if (data?.data.subarray(45, 45 + bytes.length).equals(bytes)) break;
  await new Promise(resolve => setTimeout(resolve, 1000));
}
if (!data || data.data.readUInt32LE(0) !== 3 || data.data.length < 45 + bytes.length
  || !data.data.subarray(45, 45 + bytes.length).equals(bytes) || data.data.subarray(45 + bytes.length).some(byte => byte !== 0)) {
  throw new Error("Existing Devnet program does not match the local binary. No upgrade attempted.");
}
console.log(JSON.stringify({ cluster: "devnet", program: program.toBase58(), programData: programDataAddress.toBase58(), sha256: hash(bytes),
  explorer: `https://explorer.solana.com/address/${program.toBase58()}?cluster=devnet` }));
