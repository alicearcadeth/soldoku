import { describe, expect, it } from "vitest";
import { ESCROW_PROGRAM_ID } from "./program";
import { MAINNET_USDC_MINT, assertRuntimeConfig } from "./network";

const devnet = {
  cluster: "devnet",
  programId: ESCROW_PROGRAM_ID,
  mint: "J7STDEHGniYdSjuY4HKZMoSdr1KckYiGNdfnmsrYiLw7",
  authority: "AixXFtny6qq792Pzt8G7ytLbM1eKRXZGSAx91EqBRo7s",
  rpcUrl: "https://solana-devnet.example/v2/secret",
};

describe("runtime network boundary", () => {
  it("accepts the pinned Devnet program and a non-Mainnet mint", () => {
    expect(() => assertRuntimeConfig(devnet)).not.toThrow();
  });

  it("rejects Mainnet even when the Devnet program id is still configured", () => {
    expect(() => assertRuntimeConfig({ ...devnet, cluster: "mainnet-beta" })).toThrow(/Mainnet is not enabled/);
    expect(() => assertRuntimeConfig({ ...devnet, rpcUrl: "https://solana-mainnet.example/v2/secret" })).toThrow(/Mainnet RPC/);
    expect(() => assertRuntimeConfig({ ...devnet, mint: MAINNET_USDC_MINT })).toThrow(/Mainnet USDC/);
  });

  it("accepts the verified V2 program on public Devnet and rejects any other id", () => {
    expect(() => assertRuntimeConfig({ ...devnet, programId: "937BAWXVCW58oEKkA1FijkSXXtdgGEytUyPRV2Roge22" })).not.toThrow();
    expect(() => assertRuntimeConfig({ ...devnet, programId: "937BAWXVCW58oEKkA1FijkSXXtdgGEytUyPRV2Roge22", mint: "So11111111111111111111111111111111111111112" })).toThrow(/public test mint/);
  });

  it("rejects a Devnet process pointed at a different program", () => {
    expect(() => assertRuntimeConfig({ ...devnet, programId: "EdaMMSUwhygDy8fM9URCBuRbvV7vP6yN7YwHJqeTUcK3" })).toThrow(/pinned/);
  });

  it("keeps staging off the public program and mint", () => {
    const staging = { ...devnet, staging: true, programId: "11111111111111111111111111111111", mint: "So11111111111111111111111111111111111111112" };
    expect(() => assertRuntimeConfig(staging)).not.toThrow();
    expect(() => assertRuntimeConfig({ ...staging, programId: ESCROW_PROGRAM_ID })).toThrow(/legacy/);
    expect(() => assertRuntimeConfig({ ...staging, mint: devnet.mint })).toThrow(/public Devnet mint/);
  });

  it("keeps Localnet on loopback and refuses an empty authority", () => {
    expect(() => assertRuntimeConfig({ ...devnet, cluster: "localnet", rpcUrl: "http://127.0.0.1:8899" })).not.toThrow();
    expect(() => assertRuntimeConfig({ ...devnet, cluster: "localnet", rpcUrl: "https://solana-devnet.example" })).toThrow(/loopback/);
    expect(() => assertRuntimeConfig({ ...devnet, authority: "" })).toThrow(/incomplete/);
  });
});
