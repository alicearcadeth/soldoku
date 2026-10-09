import { ComputeBudgetProgram, PublicKey, SystemProgram, Transaction, TransactionInstruction, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";
import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";

export const COMPETITION_TEST_MINT = new PublicKey("7VaC5xJULHGQzsZsyUCaZ7BbLGNDENLjXiPbfbbRY84j");
export const COMPETITION_DEVNET_MINT = new PublicKey("BtdrgokAvXQE4yj3zS48c4ktnMSy3TGoRkHCWD5fV8U4");
export const COMPETITION_ROOM_SIZE = 210;
export const COMPETITION_ENTRY_SIZE = 97;
export const COMPETITION_STATUS = ["open", "awarded", "refunding", "paid"] as const;
const writable = (pubkey: PublicKey, isSigner = false) => ({ pubkey, isSigner, isWritable: true });
const readonly = (pubkey: PublicKey, isSigner = false) => ({ pubkey, isSigner, isWritable: false });
function unsigned(value: bigint): Buffer {
  if (value < 0n || value > 0xffffffffffffffffn) throw new Error("Escrow integer is outside u64 range.");
  const result = Buffer.alloc(8); result.writeBigUInt64LE(value); return result;
}
function timestamp(value: bigint): Buffer {
  if (value < 0n || value > 0x7fffffffffffffffn) throw new Error("Invalid escrow timestamp.");
  return unsigned(value);
}
export function competitionAddress(program: PublicKey, id: bigint): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from("competition"), unsigned(id)], program)[0];
}
export function competitionEntryAddress(program: PublicKey, room: PublicKey, wallet: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from("entry"), room.toBuffer(), wallet.toBuffer()], program)[0];
}
export function readCompetitionRoom(data: Buffer) {
  if (![178, COMPETITION_ROOM_SIZE].includes(data.length) || data[176] > 3) throw new Error("Invalid competition escrow account.");
  return {
    id: data.readBigUInt64LE(0), creator: new PublicKey(data.subarray(8, 40)), authority: new PublicKey(data.subarray(40, 72)),
    mint: new PublicKey(data.subarray(72, 104)), stake: data.readBigUInt64LE(104), joinDeadline: data.readBigInt64LE(112), deadline: data.readBigInt64LE(120),
    refundAt: data.readBigInt64LE(128), entrants: data.readBigUInt64LE(136), winner: new PublicKey(data.subarray(144, 176)),
    status: COMPETITION_STATUS[data[176]], bump: data[177], head: data.length === COMPETITION_ROOM_SIZE ? new PublicKey(data.subarray(178, 210)) : null,
  };
}
export function readCompetitionEntry(data: Buffer) {
  if (![65, COMPETITION_ENTRY_SIZE].includes(data.length) || data[64] > 1) throw new Error("Invalid competition entry account.");
  return { room: new PublicKey(data.subarray(0, 32)), wallet: new PublicKey(data.subarray(32, 64)), claimed: data[64] === 1,
    next: data.length === COMPETITION_ENTRY_SIZE ? new PublicKey(data.subarray(65, 97)) : null };
}
export function competitionInstructions(program: PublicKey, id: bigint, mint = COMPETITION_TEST_MINT) {
  const room = competitionAddress(program, id);
  if (!mint.equals(COMPETITION_TEST_MINT) && !mint.equals(COMPETITION_DEVNET_MINT)) throw new Error("Unsupported competition test mint.");
  const vault = getAssociatedTokenAddressSync(mint, room, true);
  const instruction = (data: Buffer, keys: TransactionInstruction["keys"]) => new TransactionInstruction({ programId: program, data, keys });
  return {
    room, vault, mint,
    entry: (wallet: PublicKey) => competitionEntryAddress(program, room, wallet),
    open(creator: PublicKey, authority: PublicKey, stake: bigint, joinDeadline: bigint, deadline: bigint, refundAt: bigint) {
      if (stake === 0n) throw new Error("Stake must be positive.");
      return instruction(Buffer.concat([Buffer.from([0]), unsigned(id), unsigned(stake), timestamp(joinDeadline), timestamp(deadline), timestamp(refundAt)]),
        [writable(room), writable(creator, true), readonly(authority, true), readonly(mint), readonly(SystemProgram.programId), readonly(SYSVAR_RENT_PUBKEY)]);
    },
    join(wallet: PublicKey) {
      return instruction(Buffer.from([1]), [writable(room), writable(competitionEntryAddress(program, room, wallet)), readonly(mint),
        writable(getAssociatedTokenAddressSync(mint, wallet)), writable(vault), writable(wallet, true), readonly(TOKEN_PROGRAM_ID),
        readonly(ASSOCIATED_TOKEN_PROGRAM_ID), readonly(SystemProgram.programId), readonly(SYSVAR_RENT_PUBKEY)]);
    },
    extend(creator: PublicKey, deadline: bigint) {
      return instruction(Buffer.concat([Buffer.from([2]), timestamp(deadline)]), [writable(room), readonly(creator, true)]);
    },
    settle(authority: PublicKey, winner: PublicKey | null) {
      return instruction(Buffer.concat([Buffer.from([3]), winner?.toBuffer() ?? Buffer.alloc(32)]), [writable(room), readonly(authority, true),
        readonly(winner ? competitionEntryAddress(program, room, winner) : room)]);
    },
    claim(wallet: PublicKey, refund = false) {
      return instruction(Buffer.from([refund ? 5 : 4]), [writable(room), writable(competitionEntryAddress(program, room, wallet)), readonly(mint),
        writable(getAssociatedTokenAddressSync(mint, wallet)), writable(vault), readonly(TOKEN_PROGRAM_ID)]);
    },
  };
}
export type RelayBinding = {
  action: "deposit" | "extend" | "claim"; wallet: string; roomId: string; mint: string; stake: string;
  authority: string; owner: string; startsAt: number; endsAt: number; refundAt: number; program: string;
};
/** Reject a relay whose fee payer, program, room, mint, stake, deadlines, authority, or action differ from the room. */
export function assertRelayedCompetitionTransaction(tx: Transaction, binding: RelayBinding) {
  const program = new PublicKey(binding.program);
  const wallet = new PublicKey(binding.wallet);
  const mint = new PublicKey(binding.mint);
  const authority = new PublicKey(binding.authority);
  if (!tx.feePayer?.equals(wallet)) throw new Error("Competition transaction fee payer does not match this wallet.");
  const built = competitionInstructions(program, BigInt(binding.roomId), mint);
  const seconds = (ms: number) => BigInt(Math.floor(ms / 1000));
  const stake = BigInt(binding.stake);
  const expectedAta = getAssociatedTokenAddressSync(mint, wallet);
  let matched = false;
  let computeLimit: bigint | undefined;
  let computePrice: bigint | undefined;
  for (const instruction of tx.instructions) {
    if (instruction.programId.equals(ComputeBudgetProgram.programId)) {
      // Wallets may add fee settings. Never accept accounts, deprecated variants,
      // duplicate settings, or an unbounded priority fee with this exception.
      const tag = instruction.data[0];
      if (instruction.keys.length !== 0) throw new Error("Compute budget instructions must not include accounts.");
      if (tag === 2 && instruction.data.length === 5 && computeLimit === undefined) {
        computeLimit = BigInt(instruction.data.readUInt32LE(1));
        if (computeLimit < 1n || computeLimit > 1_400_000n) throw new Error("Compute unit limit is outside the supported range.");
      } else if (tag === 3 && instruction.data.length === 9 && computePrice === undefined) {
        computePrice = instruction.data.readBigUInt64LE(1);
      } else throw new Error("Unsupported or duplicate compute budget instruction.");
      continue;
    }
    if (instruction.programId.equals(ASSOCIATED_TOKEN_PROGRAM_ID)) {
      const ata = instruction.keys[1]?.pubkey;
      const owner = instruction.keys[2]?.pubkey;
      const tokenMint = instruction.keys[3]?.pubkey;
      if (!ata?.equals(expectedAta) || !owner?.equals(wallet) || !tokenMint?.equals(mint)) throw new Error("The claim destination or token account is a different entrant.");
      continue;
    }
    if (!instruction.programId.equals(program)) throw new Error(`Unrelated instructions cannot be relayed by the competition API (program ${instruction.programId.toBase58()}).`);
    const tag = instruction.data[0];
    if (!instruction.keys[0]?.pubkey.equals(built.room)) throw new Error("This transaction is for a different competition room.");
    if (binding.action === "deposit" && tag !== 0 && tag !== 1) throw new Error("This transaction does not match the requested action.");
    if (binding.action === "extend" && tag !== 2) throw new Error("This transaction does not match the requested action.");
    if (binding.action === "claim" && tag !== 4 && tag !== 5) throw new Error("This transaction does not match the requested action.");
    if (tag === 0) {
      const opened = instruction.data.readBigUInt64LE(9);
      const join = instruction.data.readBigInt64LE(17);
      const deadline = instruction.data.readBigInt64LE(25);
      const refund = instruction.data.readBigInt64LE(33);
      if (opened !== stake || join !== seconds(binding.startsAt) || deadline !== seconds(binding.endsAt) || refund !== seconds(binding.refundAt) || !instruction.keys[2]?.pubkey.equals(authority)) {
        throw new Error("Open instruction does not match this room's amount or deadline.");
      }
    }
    if (tag === 1 && !instruction.keys[1]?.pubkey.equals(built.entry(wallet))) throw new Error("The join entry belongs to a different entrant.");
    if (tag === 1 || tag === 4 || tag === 5) {
      if (!instruction.keys[2]?.pubkey.equals(mint) || !instruction.keys[3]?.pubkey.equals(expectedAta)) throw new Error("The claim destination or token account is a different entrant.");
    }
    if ((tag === 4 || tag === 5) && !instruction.keys[1]?.pubkey.equals(built.entry(wallet))) throw new Error("The claim destination or token account is a different entrant.");
    matched = true;
  }
  // Without an explicit limit, use the protocol maximum as a conservative bound.
  // This relay caps the optional priority fee at 0.001 SOL, excluding base/rent fees.
  const priorityLamports = ((computeLimit ?? 1_400_000n) * (computePrice ?? 0n) + 999_999n) / 1_000_000n;
  if (priorityLamports > 1_000_000n) throw new Error("Competition priority fee exceeds 0.001 SOL.");
  if (!matched) throw new Error("This transaction does not match the requested action.");
}
