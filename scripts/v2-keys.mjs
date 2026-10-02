import { wslSolana } from "./operator-env.mjs";
/**
 * Creates the V2 program, upgrade, and match-authority keys if they are missing.
 * Prints public keys only.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const dir = join(homedir(), ".config", "solana");
const names = ["sudoku-v2-program.json", "sudoku-v2-upgrade.json", "sudoku-v2-authority.json"];

for (const name of names) {
  const file = join(dir, name);
  const wsl = wslSolana(name);
  if (!existsSync(file)) {
    const created = spawnSync("wsl", ["-e", "bash", "-lc", `solana-keygen new --no-bip39-passphrase --force -s -o '${wsl}' >/dev/null`], { encoding: "utf8" });
    if (created.status !== 0) throw new Error(`${name} was not created`);
  }
  const shown = spawnSync("wsl", ["-e", "bash", "-lc", `solana-keygen pubkey '${wsl}'`], { encoding: "utf8" });
  if (shown.status !== 0) throw new Error(`${name} has no public key`);
  const icacls = spawnSync("icacls", [file, "/inheritance:r", "/grant:r", `${process.env.USERNAME}:(F)`], { encoding: "utf8" });
  console.log(JSON.stringify({
    file: name,
    pubkey: shown.stdout.trim(),
    locked: icacls.status === 0,
  }));
}
