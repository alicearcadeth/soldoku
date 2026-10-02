const AUTHORITY = 8;
const MINT = 40;
const PLAYER_A = 72;
const PLAYER_B = 104;
const STAKE = 136;
const STATUS = 160;

export type DepositRole = "open" | "join";

/** The on-chain record must name this room's authority, mint, stake, and player. */
export function matchRecordAcceptsDeposit(
  data: Uint8Array,
  expected: { authority: Uint8Array; mint: Uint8Array; stake: bigint; player: Uint8Array; role: DepositRole },
): boolean {
  if (data.length < STATUS + 1) return false;
  if (!same(data, AUTHORITY, expected.authority) || !same(data, MINT, expected.mint)) return false;
  if (readU64(data, STAKE) !== expected.stake) return false;
  const playerAt = expected.role === "open" ? PLAYER_A : PLAYER_B;
  if (!same(data, playerAt, expected.player)) return false;
  const status = data[STATUS];
  return expected.role === "open" ? status === 0 || status === 1 : status === 1;
}

function same(data: Uint8Array, offset: number, key: Uint8Array): boolean {
  if (key.length !== 32 || offset + 32 > data.length) return false;
  for (let index = 0; index < 32; index += 1) if (data[offset + index] !== key[index]) return false;
  return true;
}

function readU64(data: Uint8Array, offset: number): bigint {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  return view.getBigUint64(offset, true);
}
