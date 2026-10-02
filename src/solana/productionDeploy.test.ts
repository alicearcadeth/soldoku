import { homedir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { ESCROW_PROGRAM_ID, ESCROW_V2_PROGRAM_ID } from "./program";
import { assertLegacyDeployTarget, selectProductionDeploy } from "./productionDeploy";

const productionId = "4GqmVjmNLwfJ8UrtGTV9C2RZAqNqRiaGGmCsKRX7EKMH";
const artifactSo = "programs/match-escrow/target/deploy/match_escrow.so";
const artifactKeyPath = "programs/match-escrow/target/deploy/match_escrow-keypair.json";
const productionKeyPath = join(homedir(), ".config", "solana", "sudoku-mainnet-program.json");

describe("production deploy identity", () => {
  it("refuses the compiled artifact keypair and both Devnet program ids", () => {
    expect(() => selectProductionDeploy({
      configuredProgramId: productionId,
      deploymentKey: ESCROW_PROGRAM_ID,
      deploymentKeyPath: artifactKeyPath,
      artifactKey: ESCROW_PROGRAM_ID,
      artifactKeyPath,
      artifactPath: artifactSo,
    })).toThrow(/artifact keypair/);
    expect(() => selectProductionDeploy({
      configuredProgramId: productionId,
      deploymentKey: ESCROW_V2_PROGRAM_ID,
      deploymentKeyPath: productionKeyPath,
      artifactKey: ESCROW_PROGRAM_ID,
      artifactKeyPath,
      artifactPath: artifactSo,
    })).toThrow(/Devnet program key/);
    expect(() => selectProductionDeploy({
      configuredProgramId: productionId,
      deploymentKey: ESCROW_PROGRAM_ID,
      deploymentKeyPath: productionKeyPath,
      artifactKey: "different-artifact-key",
      artifactKeyPath,
      artifactPath: artifactSo,
    })).toThrow(/Devnet program key/);
    expect(() => selectProductionDeploy({
      configuredProgramId: productionId,
      deploymentKey: "GTJ68bR2Fwkc9JcYefH9Eas9gvHnR6AkZ3TincmJsst4",
      deploymentKeyPath: productionKeyPath,
      artifactKey: ESCROW_PROGRAM_ID,
      artifactKeyPath,
      artifactPath: artifactSo,
    })).toThrow(/Devnet program key/);
    expect(() => selectProductionDeploy({
      configuredProgramId: productionId,
      deploymentKey: productionId,
      deploymentKeyPath: productionKeyPath,
      artifactKey: ESCROW_PROGRAM_ID,
      artifactKeyPath,
      artifactPath: artifactSo,
      upgradeAuthority: "HKKoVMjmA4X8FgQBZhq3a5iz1TYdRu1zVzWDHKT3GiP9",
    })).toThrow(/Devnet authority/);
  });

  it("refuses a Devnet upgrade authority and a mismatched artifact hash", () => {
    expect(() => selectProductionDeploy({
      configuredProgramId: productionId,
      deploymentKey: productionId,
      deploymentKeyPath: productionKeyPath,
      artifactKey: ESCROW_PROGRAM_ID,
      artifactKeyPath,
      artifactPath: artifactSo,
      upgradeAuthority: "6fTc4rVYFz6NtHDZXeGQqTTQTiCe41Fsrz8ypxqMt8dX",
    })).toThrow(/Devnet authority/);
    expect(() => selectProductionDeploy({
      configuredProgramId: productionId,
      deploymentKey: productionId,
      deploymentKeyPath: productionKeyPath,
      artifactKey: ESCROW_PROGRAM_ID,
      artifactKeyPath,
      artifactPath: artifactSo,
      artifactSha256: "aa",
      expectedArtifactSha256: "bb",
    })).toThrow(/pinned build/);
  });

  it("selects the dedicated production key and does not execute a deploy", () => {
    const plan = selectProductionDeploy({
      configuredProgramId: productionId,
      deploymentKey: productionId,
      deploymentKeyPath: productionKeyPath,
      artifactKey: ESCROW_PROGRAM_ID,
      artifactKeyPath,
      artifactPath: artifactSo,
    });
    expect(plan.programId).toBe(productionId);
    expect(plan.execute).toBe(false);
    expect(plan.command).toContain("--program-id");
    expect(plan.command.join(" ")).toContain("sudoku-mainnet-program.json");
    expect(plan.command.join(" ")).not.toContain("match_escrow-keypair.json");
    expect(plan.artifactKey).toBe(ESCROW_PROGRAM_ID);
  });

  it("the deploy script refuses the legacy keypair and dry-runs the dedicated key", () => {
    const refused = spawnSync(process.execPath, ["scripts/production-deploy.mjs", "--keypair", artifactKeyPath], { encoding: "utf8" });
    expect(refused.status).not.toBe(0);
    const refusedText = `${refused.stderr ?? ""}`;
    if (/Production deploy files are missing/.test(refusedText)) {
      const blocked = spawnSync(process.execPath, ["scripts/production-deploy.mjs", "--execute"], { encoding: "utf8" });
      expect(blocked.status).toBe(2);
      expect(blocked.stderr).toMatch(/not authorized/);
      return;
    }
    expect(refusedText).toMatch(/artifact keypair|Devnet program key/);
    const selected = spawnSync(process.execPath, ["scripts/production-deploy.mjs"], { encoding: "utf8" });
    expect(selected.status).toBe(0);
    const body = JSON.parse(selected.stdout);
    expect(body).toMatchObject({
      programId: productionId,
      keypair: "sudoku-mainnet-program.json",
      artifactKeyIsLegacy: true,
      execute: false,
      commandUsesDedicatedKey: true,
    });
    expect(body.artifactSha256).toMatch(/^[a-f0-9]{64}$/);
    const blocked = spawnSync(process.execPath, ["scripts/production-deploy.mjs", "--execute"], { encoding: "utf8" });
    expect(blocked.status).toBe(2);
    expect(blocked.stderr).toMatch(/not authorized/);
  });

  it("refuses a legacy deploy aimed at Mainnet", () => {
    expect(() => assertLegacyDeployTarget("https://api.mainnet-beta.solana.com")).toThrow(/cannot target Mainnet/);
    expect(() => assertLegacyDeployTarget("https://solana-devnet.example")).not.toThrow();
  });
});
