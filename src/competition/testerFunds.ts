export const TESTER_SOL_FLOOR = 50_000_000;
export const TESTER_SOL_AIRDROP = 1_000_000_000;
export const TESTER_TOKEN_FLOOR = 5_000_000n;
export const TESTER_TOKEN_GRANT = 20_000_000n;
export const TESTER_COOLDOWN_MS = 24 * 60 * 60 * 1000;
export const TESTER_SOL_FAUCET = "https://faucet.solana.com";

export type TesterPlan = { sol: boolean; test: boolean; note: string | null };

/** A new wallet has no TEST account yet. That is an empty balance, not a failed grant. */
export function missingTesterTokenAccount(error: unknown): boolean {
  const name = error instanceof Error ? error.name : "";
  const message = error instanceof Error ? error.message : "";
  return name === "TokenAccountNotFoundError" || name === "TokenInvalidAccountOwnerError" || /could not find account/i.test(message);
}

/** Decide a Devnet grant without sending anything. Throws when no grant should be sent. */
export function planTesterGrant(input: {
  solLamports: number;
  testUnits: bigint;
  lastGrantAt: number | null;
  now: number;
  faucetConfigured: boolean;
}): TesterPlan {
  if (!Number.isSafeInteger(input.solLamports) || input.solLamports < 0) throw new Error("Invalid SOL balance.");
  if (input.testUnits < 0n) throw new Error("Invalid TEST balance.");
  if (!Number.isSafeInteger(input.now)) throw new Error("Invalid faucet clock.");
  const needsSol = input.solLamports < TESTER_SOL_FLOOR;
  const needsTest = input.testUnits < TESTER_TOKEN_FLOOR;
  if (!needsSol && !needsTest) throw new Error("This wallet already has enough Devnet SOL for fees and enough TEST to enter.");
  if (input.lastGrantAt !== null) {
    if (!Number.isSafeInteger(input.lastGrantAt) || input.now < input.lastGrantAt) throw new Error("Invalid faucet grant.");
    const elapsed = input.now - input.lastGrantAt;
    if (elapsed < TESTER_COOLDOWN_MS) {
      throw new Error(`Test funds were already sent to this wallet. Try again in ${Math.ceil((TESTER_COOLDOWN_MS - elapsed) / 60000)} minutes.`);
    }
  }
  if (needsTest && !input.faucetConfigured && !needsSol) {
    throw new Error("TEST minting is not enabled on this server yet.");
  }
  return {
    sol: needsSol,
    test: needsTest && input.faucetConfigured,
    note: needsTest && !input.faucetConfigured
      ? `TEST minting is not enabled on this server. Request Devnet SOL at ${TESTER_SOL_FAUCET} if the airdrop is refused.`
      : null,
  };
}
