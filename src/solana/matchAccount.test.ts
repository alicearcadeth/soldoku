import { describe, expect, it } from "vitest";
import { matchRecordAcceptsDeposit } from "./matchAccount";

function record(fill: (data: Uint8Array) => void): Uint8Array {
  const data = new Uint8Array(163);
  fill(data);
  return data;
}

function put(data: Uint8Array, offset: number, key: Uint8Array) {
  data.set(key, offset);
}

const authority = Uint8Array.from({ length: 32 }, (_, index) => index + 1);
const mint = Uint8Array.from({ length: 32 }, (_, index) => index + 40);
const player = Uint8Array.from({ length: 32 }, (_, index) => index + 80);

function opened(): Uint8Array {
  return record((data) => {
    put(data, 8, authority);
    put(data, 40, mint);
    put(data, 72, player);
    const view = new DataView(data.buffer);
    view.setBigUint64(136, 1_000_000n, true);
    data[160] = 0;
  });
}

describe("match deposit binding", () => {
  it("accepts the room authority and rejects a swapped one", () => {
    const expected = { authority, mint, stake: 1_000_000n, player, role: "open" as const };
    expect(matchRecordAcceptsDeposit(opened(), expected)).toBe(true);
    const swapped = opened();
    swapped[8] = 9;
    expect(matchRecordAcceptsDeposit(swapped, expected)).toBe(false);
    const otherMint = opened();
    otherMint[40] = 1;
    expect(matchRecordAcceptsDeposit(otherMint, expected)).toBe(false);
  });
});
