// Keep decimal source prices intact. Division rounds only once, at 24 decimal places.
function decimal(value: string) {
  const match = /^(\d+)(?:\.(\d*))?(?:e([+-]?\d+))?$/i.exec(value.trim().replace(/^\./, "0."));
  if (!match || value.length > 100) throw new Error("Invalid decimal amount.");
  const exponent = Number(match[3] ?? 0);
  if (Math.abs(exponent) > 60) throw new Error("Amount is outside the supported range.");
  const scale = (match[2]?.length ?? 0) - exponent;
  const n = BigInt(match[1] + (match[2] ?? ""));
  return scale < 0 ? { n: n * 10n ** BigInt(-scale), scale: 0 } : { n, scale };
}
function text(n: bigint, scale: number): string {
  const digits = n.toString().padStart(scale + 1, "0");
  return scale ? `${digits.slice(0, -scale)}.${digits.slice(-scale)}`.replace(/0+$/, "").replace(/\.$/, "") : digits;
}
export function multiplyDecimal(left: string, right: string): string {
  const a = decimal(left), b = decimal(right);
  return text(a.n * b.n, a.scale + b.scale);
}
export function divideDecimal(left: string, right: string): string {
  const a = decimal(left), b = decimal(right);
  if (!b.n) throw new Error("Price unavailable.");
  const numerator = a.n * 10n ** BigInt(b.scale + 24);
  const denominator = b.n * 10n ** BigInt(a.scale);
  return text((numerator + denominator / 2n) / denominator, 24);
}
