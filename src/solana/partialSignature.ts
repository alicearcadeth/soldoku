import { Message } from "@solana/web3.js";
import nacl from "tweetnacl";

function readCompactLength(bytes: Uint8Array, start: number): { value: number; next: number } {
  let value = 0;
  let shift = 0;
  let cursor = start;
  for (;;) {
    const byte = bytes[cursor];
    if (byte === undefined || shift > 21) throw new Error("The wallet return was cut off");
    value |= (byte & 0x7f) << shift;
    cursor += 1;
    if ((byte & 0x80) === 0) return { value, next: cursor };
    shift += 7;
  }
}

/**
 * A mobile wallet can return only the signature it created. web3.js drops that
 * signature when the message still requires the match authority. Put the
 * signature back into a slot for every required signer.
 */
export function restorePartialSignature(bytes: Uint8Array): Uint8Array {
  const { value: count, next } = readCompactLength(bytes, 0);
  if (count < 1) throw new Error("The wallet did not sign the deposit");
  const messageStart = next + count * 64;
  if (messageStart > bytes.length) throw new Error("The wallet return was cut off");
  const message = bytes.subarray(messageStart);
  const required = Message.from(message).header.numRequiredSignatures;
  if (count >= required) return bytes;
  const signature = bytes.subarray(next, next + 64);
  const payer = Message.from(message).accountKeys[0];
  if (!payer || !nacl.sign.detached.verify(message, signature, payer.toBytes())) {
    throw new Error("The wallet signature does not match this deposit");
  }
  if (required > 127) throw new Error("The wallet return was cut off");
  const out = new Uint8Array(1 + required * 64 + message.length);
  out[0] = required;
  out.set(bytes.subarray(next, messageStart), 1);
  out.set(message, 1 + required * 64);
  return out;
}
