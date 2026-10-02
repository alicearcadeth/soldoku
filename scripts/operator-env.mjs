import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

/** Operator RPC and API settings. Process environment wins. `config/operator.env` is gitignored. */
export function loadOperatorEnv() {
  const fromFile = {};
  if (existsSync("config/operator.env")) {
    for (const line of readFileSync("config/operator.env", "utf8").split(/\r?\n/)) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (match) fromFile[match[1]] = match[2].replace(/^"|"$/g, "");
    }
  }
  const merged = { ...fromFile };
  for (const [key, value] of Object.entries(process.env)) {
    if (value != null && value !== "") merged[key] = value;
  }
  if (!merged.ARTPORTAL_SOLANA_RPC_URL && merged.SOLANA_RPC) {
    merged.ARTPORTAL_SOLANA_RPC_URL = merged.SOLANA_RPC;
  }
  return merged;
}

export function solanaConfig(name) {
  return join(homedir(), ".config", "solana", name);
}

export function wslSolana(name) {
  return toWslPath(solanaConfig(name));
}

/** Absolute path inside this checkout. Does not depend on a drive letter or username. */
export function repoFile(...parts) {
  return resolve(process.cwd(), ...parts);
}

/** Windows path to a WSL mount path. A path that is already portable is returned unchanged. */
export function toWslPath(file) {
  const normalized = file.replace(/\\/g, "/");
  const match = /^([A-Za-z]):\/(.*)$/.exec(normalized);
  if (!match) return normalized;
  return `/mnt/${match[1].toLowerCase()}/${match[2]}`;
}

export function requireWslHome() {
  const home = process.env.SUDOKU_WSL_HOME?.replace(/\/$/, "");
  if (!home) {
    throw new Error("Set SUDOKU_WSL_HOME to the WSL home for this optional helper.");
  }
  return home;
}

/** `wsl` arguments. Set SUDOKU_WSL_USER only when the default WSL user is not the one that has Solana. */
export function wslLaunchArgs(command) {
  const user = process.env.SUDOKU_WSL_USER;
  return user ? ["-u", user, "--", "bash", "-lc", command] : ["bash", "-lc", command];
}
