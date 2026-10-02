import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const elf = readFileSync("programs/match-escrow/target/deploy/match_escrow.so");
const sha256 = createHash("sha256").update(elf).digest("hex");
const lamportsPerByteYear = 3_480n;
const exemptionYears = 2n;
const overhead = 128n;
function rent(dataLen) {
  return (BigInt(dataLen) + overhead) * lamportsPerByteYear * exemptionYears;
}
const programData = rent(45 + elf.length);
const programAccount = rent(36);
const matchAccount = rent(163);
const vaultAccount = rent(165);
const signatures = 5_000n;
const deployFee = signatures * 20n;
const total = programData + programAccount + deployFee;
console.log(JSON.stringify({
  artifactBytes: elf.length,
  artifactSha256: sha256,
  programDataRentLamports: programData.toString(),
  programAccountRentLamports: programAccount.toString(),
  estimatedDeployFeeLamports: deployFee.toString(),
  estimatedDeployLamports: total.toString(),
  estimatedDeploySol: Number(total) / 1_000_000_000,
  matchRentLamports: matchAccount.toString(),
  vaultRentLamports: vaultAccount.toString(),
  openerRentLamports: (matchAccount + vaultAccount).toString(),
  note: "Rent uses the documented 3480 lamports per byte-year for two years. Deploy fee is a 20-signature allowance, not a measured Mainnet quote.",
}));
