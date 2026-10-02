import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const keystore = join(homedir(), ".config", "solana", "sudoku-release.keystore");
const passwordFile = join(homedir(), ".config", "solana", "sudoku-release.pass");
const alias = "sudoku-release";
let generated = false;

if (!existsSync(keystore)) {
  const password = randomBytes(24).toString("base64url");
  writeFileSync(passwordFile, `${password}\n`, { mode: 0o600 });
  const created = spawnSync("keytool", [
    "-genkeypair",
    "-keystore", keystore,
    "-alias", alias,
    "-keyalg", "RSA",
    "-keysize", "2048",
    "-validity", "10000",
    "-storepass", password,
    "-keypass", password,
    "-dname", "CN=Sudoku Release, O=Sudoku, C=US",
  ], { encoding: "utf8" });
  if (created.status !== 0) {
    console.log(JSON.stringify({ generated: false, listed: false }));
    process.exit(1);
  }
  generated = true;
}

if (!existsSync(passwordFile)) {
  console.log(JSON.stringify({ generated, listed: false, reason: "password file missing" }));
  process.exit(0);
}

const password = readFileSync(passwordFile, "utf8").trim();
const listed = spawnSync("keytool", [
  "-list", "-v",
  "-keystore", keystore,
  "-alias", alias,
  "-storepass", password,
], { encoding: "utf8" });
const sha256 = listed.stdout?.match(/SHA256:\s*([0-9A-F:]+)/)?.[1] ?? null;
console.log(JSON.stringify({ generated, listed: listed.status === 0, alias, sha256, wiredIntoBuild: false }));
