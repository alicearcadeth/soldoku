import { ESCROW_PROGRAM_ID, ESCROW_V2_PROGRAM_ID, STAGING_ESCROW_PROGRAM_ID } from "./program";
import { DEVNET_PUBLIC_MINT, MAINNET_USDC_MINT } from "./network";

/** Identities that already belong to Devnet, staging, or a player. Production must not reuse them. */
export const DEVNET_IDENTITIES = {
  programs: [ESCROW_PROGRAM_ID, ESCROW_V2_PROGRAM_ID, STAGING_ESCROW_PROGRAM_ID],
  mint: DEVNET_PUBLIC_MINT,
  matchAuthority: "AixXFtny6qq792Pzt8G7ytLbM1eKRXZGSAx91EqBRo7s",
  stagingAuthority: "4uBUqMExgkzqW2WWKyrq1uSoAQAi3YenKnSsXTrB6T3N",
  stagingUpgradeAuthority: "HKKoVMjmA4X8FgQBZhq3a5iz1TYdRu1zVzWDHKT3GiP9",
  upgradeAuthority: "6fTc4rVYFz6NtHDZXeGQqTTQTiCe41Fsrz8ypxqMt8dX",
  playerWallets: [
    "JCVsKd4TMg1fvEs7rjf5YgLYbJfNC8Dwb4x1PchFkGM7",
    "5Yj8tfWFSucMUyYZVdCRNFSw1QF3C1MbG7dbo8vFkkar",
  ],
  d1: "6f3cfca2-af75-4c07-8629-b59876423036",
  worker: "sudoku",
} as const;

export type ProductionDraft = {
  cluster: string;
  workerName: string;
  d1Name: string;
  d1Id: string;
  programId: string;
  mint: string;
  matchAuthority: string;
  upgradeAuthority: string;
  rpcHost: string;
  backupRpcHost: string;
};

/** Spoken approval required before any real-value route can pass the gate. The public worker never calls it. */
export const PRODUCTION_APPROVAL = "enable-real-value-staking";

export const MAINNET_GENESIS = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";

export type ProductionCheck = ProductionDraft & {
  approval: string;
  genesis: string;
  programDeployed: boolean;
  mintDecimals: number | null;
  /** Public key of the keypair that would deploy this program. */
  programKey: string;
  /** Upgrade authority read from the deployed program, when it exists. */
  onChainUpgradeAuthority: string | null;
  /** Production secrets stay outside this repository. Missing secrets keep the gate closed. */
  secretsPresent: boolean;
};

/** A paper configuration only. Nothing here is deployed or armed. */
export function assertProductionDraft(draft: ProductionDraft): void {
  if (draft.cluster !== "mainnet-beta") throw new Error("Production is Mainnet only");
  if (draft.workerName === DEVNET_IDENTITIES.worker || draft.workerName === "sudoku-v2-staging") {
    throw new Error("Production needs its own Worker");
  }
  if (!draft.d1Name || !draft.d1Id || draft.d1Name === "sudoku-matches" || draft.d1Id === DEVNET_IDENTITIES.d1) {
    throw new Error("Production needs its own database");
  }
  if ((DEVNET_IDENTITIES.programs as readonly string[]).includes(draft.programId)) throw new Error("Production cannot reuse a Devnet program");
  if (draft.mint !== MAINNET_USDC_MINT) throw new Error("Production settlement is the verified USDC mint");
  const forbidden = new Set<string>([
    DEVNET_IDENTITIES.matchAuthority,
    DEVNET_IDENTITIES.stagingAuthority,
    DEVNET_IDENTITIES.upgradeAuthority,
    ...DEVNET_IDENTITIES.playerWallets,
  ]);
  if (forbidden.has(draft.matchAuthority) || forbidden.has(draft.upgradeAuthority)) {
    throw new Error("Production authorities must be new keys");
  }
  if (draft.matchAuthority === draft.upgradeAuthority) throw new Error("Match authority and upgrade authority stay separate");
  if (!draft.rpcHost || !draft.backupRpcHost || draft.rpcHost === draft.backupRpcHost) {
    throw new Error("Production needs two different RPC hosts");
  }
  if (/devnet|127\.0\.0\.1|localhost/i.test(`${draft.rpcHost} ${draft.backupRpcHost}`)) {
    throw new Error("Production RPC cannot be Devnet or local");
  }
}

/** Lists why this draft must stay inert. An empty list is not permission to enable funding. */
export function productionFailures(check: ProductionCheck): string[] {
  const failures: string[] = [];
  try {
    assertProductionDraft(check);
  } catch (error) {
    failures.push(error instanceof Error ? error.message : "Production draft was rejected");
  }
  if (check.genesis !== MAINNET_GENESIS) failures.push("Genesis is not Mainnet");
  if (!check.programDeployed) failures.push("The escrow program is not on Mainnet");
  if (!check.programKey || check.programKey !== check.programId || (DEVNET_IDENTITIES.programs as readonly string[]).includes(check.programKey)) {
    failures.push("Program id does not match the deployment key");
  }
  if (check.programDeployed && check.onChainUpgradeAuthority !== check.upgradeAuthority) {
    failures.push("Upgrade authority does not match the deployed program");
  }
  if (check.mintDecimals !== 6) failures.push("Settlement decimals were not verified");
  if (!check.secretsPresent) failures.push("Required production secrets are absent");
  if (check.approval !== PRODUCTION_APPROVAL) failures.push("Production funding needs separate owner approval");
  return failures;
}

const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function encodeBase58(bytes: Uint8Array): string {
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros += 1;
  const digits = [0];
  for (let i = zeros; i < bytes.length; i += 1) {
    let carry = bytes[i];
    for (let j = 0; j < digits.length; j += 1) {
      carry += digits[j] << 8;
      digits[j] = carry % 58;
      carry = Math.floor(carry / 58);
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }
  let encoded = "1".repeat(zeros);
  for (let i = digits.length - 1; i >= 0; i -= 1) encoded += BASE58[digits[i]];
  return encoded;
}

/** Reads the upgrade authority from a BPF upgradeable ProgramData account. Returns null when the layout is not that account. */
export function upgradeAuthorityFromProgramData(data: Uint8Array): string | null {
  if (data.length < 45 || data[0] !== 3 || data[1] !== 0 || data[2] !== 0 || data[3] !== 0) return null;
  const option = data[12];
  if (option === 0) return null;
  if (option !== 1) return null;
  return encodeBase58(data.subarray(13, 45));
}

/** Refuses activation unless every identity check passes and the owner approval phrase is present. */
export function assertProductionEnabled(check: ProductionCheck): void {
  const failures = productionFailures(check);
  if (failures.length) throw new Error(failures[0]);
}
