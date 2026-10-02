import { describe, expect, it } from "vitest";
import { PublicKey } from "@solana/web3.js";
import { assertProductionDraft, assertProductionEnabled, productionFailures, PRODUCTION_APPROVAL, upgradeAuthorityFromProgramData, type ProductionCheck, type ProductionDraft } from "./productionGate";
import { ESCROW_PROGRAM_ID, ESCROW_V2_PROGRAM_ID } from "./program";
import { DEVNET_PUBLIC_MINT } from "./network";

const ready: ProductionDraft = {
  cluster: "mainnet-beta",
  workerName: "sudoku-mainnet",
  d1Name: "sudoku-mainnet",
  d1Id: "00000000-0000-4000-8000-000000000001",
  programId: "11111111111111111111111111111111",
  mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  matchAuthority: "22222222222222222222222222222222",
  upgradeAuthority: "33333333333333333333333333333333",
  rpcHost: "mainnet.example",
  backupRpcHost: "mainnet-backup.example",
};

describe("production separation", () => {
  it("accepts a draft that shares nothing with Devnet", () => {
    expect(() => assertProductionDraft(ready)).not.toThrow();
  });

  it("rejects the live Devnet identities", () => {
    expect(() => assertProductionDraft({ ...ready, cluster: "devnet" })).toThrow(/Mainnet only/);
    expect(() => assertProductionDraft({ ...ready, workerName: "sudoku" })).toThrow(/own Worker/);
    expect(() => assertProductionDraft({ ...ready, workerName: "sudoku-v2-staging" })).toThrow(/own Worker/);
    expect(() => assertProductionDraft({ ...ready, d1Name: "sudoku-matches" })).toThrow(/own database/);
    expect(() => assertProductionDraft({ ...ready, d1Id: "" })).toThrow(/own database/);
    expect(() => assertProductionDraft({ ...ready, d1Id: "6f3cfca2-af75-4c07-8629-b59876423036" })).toThrow(/own database/);
    expect(() => assertProductionDraft({ ...ready, programId: ESCROW_PROGRAM_ID })).toThrow(/Devnet program/);
    expect(() => assertProductionDraft({ ...ready, programId: ESCROW_V2_PROGRAM_ID })).toThrow(/Devnet program/);
    expect(() => assertProductionDraft({ ...ready, mint: DEVNET_PUBLIC_MINT })).toThrow(/USDC/);
    expect(() => assertProductionDraft({ ...ready, matchAuthority: "AixXFtny6qq792Pzt8G7ytLbM1eKRXZGSAx91EqBRo7s" })).toThrow(/new keys/);
    expect(() => assertProductionDraft({ ...ready, matchAuthority: "4uBUqMExgkzqW2WWKyrq1uSoAQAi3YenKnSsXTrB6T3N" })).toThrow(/new keys/);
    expect(() => assertProductionDraft({ ...ready, upgradeAuthority: "6fTc4rVYFz6NtHDZXeGQqTTQTiCe41Fsrz8ypxqMt8dX" })).toThrow(/new keys/);
    expect(() => assertProductionDraft({ ...ready, upgradeAuthority: "JCVsKd4TMg1fvEs7rjf5YgLYbJfNC8Dwb4x1PchFkGM7" })).toThrow(/new keys/);
    expect(() => assertProductionDraft({ ...ready, upgradeAuthority: ready.matchAuthority })).toThrow(/separate/);
    expect(() => assertProductionDraft({ ...ready, backupRpcHost: "" })).toThrow(/two different RPC/);
    expect(() => assertProductionDraft({ ...ready, backupRpcHost: ready.rpcHost })).toThrow(/two different RPC/);
    expect(() => assertProductionDraft({ ...ready, backupRpcHost: "api.devnet.solana.com" })).toThrow(/Devnet or local/);
    expect(() => assertProductionDraft({ ...ready, rpcHost: "http://127.0.0.1:8899" })).toThrow(/Devnet or local/);
  });

  it("stays inert until the deployment key, Mainnet evidence, and a separate approval are all present", () => {
    const check: ProductionCheck = {
      ...ready,
      approval: "",
      genesis: "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d",
      programDeployed: false,
      mintDecimals: 6,
      programKey: ready.programId,
      onChainUpgradeAuthority: null,
      secretsPresent: false,
    };
    const blocked = productionFailures(check);
    expect(blocked.join(" ")).toMatch(/not on Mainnet/);
    expect(blocked.join(" ")).toMatch(/secrets are absent/);
    expect(blocked.join(" ")).toMatch(/owner approval/);
    expect(productionFailures({ ...check, genesis: "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG" }).join(" ")).toMatch(/Genesis is not Mainnet/);
    expect(productionFailures({ ...check, programKey: ESCROW_PROGRAM_ID }).join(" ")).toMatch(/does not match the deployment key/);
    expect(productionFailures({ ...check, programKey: "99999999999999999999999999999999" }).join(" ")).toMatch(/does not match the deployment key/);
    expect(productionFailures({ ...check, mintDecimals: 9 }).join(" ")).toMatch(/decimals/);
    expect(productionFailures({ ...check, programDeployed: true, onChainUpgradeAuthority: ready.matchAuthority }).join(" ")).toMatch(/Upgrade authority does not match/);
    expect(() => assertProductionEnabled(check)).toThrow();
    expect(() => assertProductionEnabled({
      ...check,
      programDeployed: true,
      onChainUpgradeAuthority: ready.upgradeAuthority,
      approval: PRODUCTION_APPROVAL,
      secretsPresent: true,
    })).not.toThrow();
  });

  it("reads an upgrade authority only from program data", () => {
    const key = new Uint8Array(32).fill(7);
    const data = new Uint8Array(45);
    data[0] = 3;
    data[12] = 1;
    data.set(key, 13);
    expect(upgradeAuthorityFromProgramData(data)).toBe(new PublicKey(key).toBase58());
    data[12] = 0;
    expect(upgradeAuthorityFromProgramData(data)).toBeNull();
    expect(upgradeAuthorityFromProgramData(new Uint8Array(45))).toBeNull();
  });
});
