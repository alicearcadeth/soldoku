import { MAINNET_USDC_MINT } from "./network";

/** Proposed Mainnet bounds. They are not an approved stake limit and are not enforced on Devnet. */
export const MAINNET_STAKE_PROPOSAL = {
  status: "proposal" as const,
  mint: MAINNET_USDC_MINT,
  decimals: 6,
  minBaseUnits: 1_000_000n,
  maxBaseUnits: 20_000_000n,
  platformFeeBps: 0,
  /** Owner has not approved a limit. The recommended default is the three fixed presets, not a custom range. */
  recommendedDefault: "fixed-presets-1-2-5" as const,
  presetsBaseUnits: [1_000_000n, 2_000_000n, 5_000_000n] as const,
};

export function proposedMainnetStakeFits(amount: bigint): boolean {
  return (MAINNET_STAKE_PROPOSAL.presetsBaseUnits as readonly bigint[]).includes(amount);
}

/** Production mode rejects any client stake outside the proposed presets. Activation stays separate. */
export function assertProposedPreset(raw: unknown): bigint {
  let value: bigint;
  try {
    value = BigInt(raw as string | number | bigint);
  } catch {
    throw new Error("Production mode only accepts the proposed 1, 2, or 5 USDC presets");
  }
  if (!proposedMainnetStakeFits(value)) {
    throw new Error("Production mode only accepts the proposed 1, 2, or 5 USDC presets");
  }
  return value;
}

/** Devnet rooms keep their own 1, 2, and 5 test-token choices. */
export function devnetStakeChoices(): readonly bigint[] {
  return [1_000_000n, 2_000_000n, 5_000_000n];
}
