/** Devnet test-token choices. These are not Mainnet policy. */
const CHOICES = [1_000_000n, 2_000_000n, 5_000_000n];

export function stakeChoices(): string[] {
  return CHOICES.map((value) => value.toString());
}

export function parseStake(raw: unknown, fallback = 1_000_000n): bigint {
  if (raw == null || raw === "") return fallback;
  let value: bigint;
  try {
    value = BigInt(raw as string | number | bigint);
  } catch {
    throw new Error("Choose 1, 2, or 5 test tokens");
  }
  if (!CHOICES.some((choice) => choice === value)) throw new Error("Choose 1, 2, or 5 test tokens");
  return value;
}

export function stakeLabel(baseUnits: bigint): string {
  const whole = baseUnits / 1_000_000n;
  return `${whole} test token${whole === 1n ? "" : "s"}`;
}
