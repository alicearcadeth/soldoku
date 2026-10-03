export function roomCodeFromUrl(value: string): string | null {
  const code = new URL(value).searchParams.get("room")?.toUpperCase();
  return code && /^[A-F0-9]{8}$/.test(code) ? code : null;
}
export function roomUrl(value: string, code: string | null): string {
  const url = new URL(value);
  if (code !== null && !/^[A-F0-9]{8}$/.test(code)) throw new Error("Invalid room code.");
  if (code) url.searchParams.set("room", code); else url.searchParams.delete("room");
  url.hash = "";
  return url.toString();
}
export function tokenUnitsLabel(units: string, decimals: number): string {
  const amount = BigInt(units); const base = 10n ** BigInt(decimals);
  const fraction = (amount % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${amount / base}${fraction ? `.${fraction}` : ""}`;
}
export function stakeBaseUnits(value: string, decimals: number): string {
  if (!/^\d+(\.\d+)?$/.test(value)) throw new Error("Enter a positive TEST token amount.");
  const [whole, fraction = ""] = value.split(".");
  if (fraction.length > decimals) throw new Error(`TEST amounts support up to ${decimals} decimal places.`);
  const units = BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, "0") || "0");
  if (units <= 0n || units > 999999999999n) throw new Error("Choose a stake between 0.000001 and 999999 TEST.");
  return units.toString();
}
