import { resolve } from "node:path";
import { DEVNET_IDENTITIES } from "./productionGate";

export type ProductionDeployInput = {
  configuredProgramId: string;
  deploymentKey: string;
  deploymentKeyPath: string;
  artifactKey: string;
  artifactKeyPath: string;
  artifactPath: string;
  upgradeAuthority?: string;
  upgradeAuthorityPath?: string;
  artifactSha256?: string;
  expectedArtifactSha256?: string;
};

export type ProductionDeployPlan = {
  programId: string;
  keypairPath: string;
  artifactPath: string;
  artifactKey: string;
  execute: false;
  command: string[];
};

/** Selects the dedicated production keypair. It never runs a deploy. */
export function selectProductionDeploy(input: ProductionDeployInput): ProductionDeployPlan {
  const deploymentPath = resolve(input.deploymentKeyPath);
  const artifactKeyPath = resolve(input.artifactKeyPath);
  const normalized = input.deploymentKeyPath.replaceAll("\\", "/");
  if (deploymentPath === artifactKeyPath || normalized.endsWith("/target/deploy/match_escrow-keypair.json")) {
    throw new Error("Production deploy refuses the compiled artifact keypair");
  }
  if ((DEVNET_IDENTITIES.programs as readonly string[]).includes(input.deploymentKey) || input.deploymentKey === input.artifactKey) {
    throw new Error("Production deploy refuses a Devnet program key");
  }
  if (!input.deploymentKey || input.deploymentKey !== input.configuredProgramId) {
    throw new Error("Production deploy key does not match the configured program id");
  }
  const devnetAuthorities: readonly string[] = [
    DEVNET_IDENTITIES.matchAuthority,
    DEVNET_IDENTITIES.stagingAuthority,
    DEVNET_IDENTITIES.stagingUpgradeAuthority,
    DEVNET_IDENTITIES.upgradeAuthority,
    ...DEVNET_IDENTITIES.playerWallets,
  ];
  if (input.upgradeAuthority && devnetAuthorities.includes(input.upgradeAuthority)) {
    throw new Error("Production deploy refuses a Devnet authority");
  }
  if (input.expectedArtifactSha256 && input.artifactSha256 !== input.expectedArtifactSha256) {
    throw new Error("Production artifact hash does not match the pinned build");
  }
  const command = ["solana", "program", "deploy", input.artifactPath, "--program-id", deploymentPath];
  if (input.upgradeAuthorityPath) {
    command.push("--keypair", input.upgradeAuthorityPath, "--upgrade-authority", input.upgradeAuthorityPath);
  }
  return {
    programId: input.deploymentKey,
    keypairPath: deploymentPath,
    artifactPath: input.artifactPath,
    artifactKey: input.artifactKey,
    execute: false,
    command,
  };
}

/** The legacy deploy script must not be pointed at Mainnet. */
export function assertLegacyDeployTarget(rpc: string): void {
  if (/mainnet/i.test(rpc)) throw new Error("The legacy artifact deploy cannot target Mainnet");
}
