import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Keypair } from "@solana/web3.js";

function pubkey(path) {
  if (!existsSync(path)) return null;
  const key = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(path, "utf8"))));
  return key.publicKey.toBase58();
}

const config = JSON.parse(readFileSync(new URL("../config/production.json", import.meta.url), "utf8"));
const home = join(homedir(), ".config", "solana");
const prepared = pubkey(join(home, "sudoku-mainnet-program.json"));
const artifact = pubkey(join("programs", "match-escrow", "target", "deploy", "match_escrow-keypair.json"));
const legacy = "HUkhJi8p1XXuErpEXkgpfQjwdapigXLECRoQSu3indyS";
const v2 = "937BAWXVCW58oEKkA1FijkSXXtdgGEytUyPRV2Roge22";
console.log(JSON.stringify({
  configured: config.programId,
  preparedKeyExists: Boolean(prepared),
  preparedMatchesConfig: prepared === config.programId,
  artifactKey: artifact,
  artifactIsLegacy: artifact === legacy,
  artifactIsV2: artifact === v2,
  artifactMatchesConfig: artifact === config.programId,
}));
