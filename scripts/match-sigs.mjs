import { loadOperatorEnv } from "./operator-env.mjs";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { Connection, PublicKey } from "@solana/web3.js";

const matchId = process.argv[2];
const env = loadOperatorEnv();
const connection = new Connection(env.ARTPORTAL_SOLANA_RPC_URL.trim(), "confirmed");
const idBuf = Buffer.alloc(8);
idBuf.writeBigUInt64LE(BigInt(matchId));
const [pda] = PublicKey.findProgramAddressSync([Buffer.from("match"), idBuf], new PublicKey("HUkhJi8p1XXuErpEXkgpfQjwdapigXLECRoQSu3indyS"));
const info = await connection.getAccountInfo(pda);
const signatures = await connection.getSignaturesForAddress(pda, { limit: 6 });
console.log(JSON.stringify({
  pda: pda.toBase58(),
  status: info?.data[160] ?? null,
  outcome: info?.data[161] ?? null,
  signatures: signatures.map((item) => item.signature),
}));
