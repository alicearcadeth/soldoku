import { Buffer } from "buffer";
import { PublicKey, TransactionInstruction, type AccountMeta } from "@solana/web3.js";

export const COMPETITION_ROOM_SIZE = 210;
export const COMPETITION_ENTRY_SIZE = 90;
export const U64_MAX = (1n << 64n) - 1n;
type Account = { owner: PublicKey; data: Buffer };

export function atomicU64(value: bigint): Buffer {
  if (value < 0n || value > U64_MAX) throw new Error("Value exceeds u64 atomic token bounds.");
  const data=Buffer.alloc(8); data.writeBigUInt64LE(value); return data;
}
export function roomAddress(program: PublicKey, id: bigint): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from("competition"), atomicU64(id)],program);
}
export function entryAddress(program: PublicKey, room: PublicKey, wallet: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from("entry"),room.toBuffer(),wallet.toBuffer()],program);
}
function layout(program: PublicKey, account: Account, size: number, magic: string) {
  if (!account.owner.equals(program)) throw new Error("Wrong escrow account owner.");
  if (account.data.length !== size || account.data.subarray(0,8).toString("ascii") !== magic) throw new Error("Unrecognized escrow account layout.");
}
export function decodeRoom(program: PublicKey, address: PublicKey, account: Account) {
  layout(program,account,COMPETITION_ROOM_SIZE,"SOLCOMP1");
  const data=account.data, id=data.readBigUInt64LE(8), [expected,bump]=roomAddress(program,id);
  if (!address.equals(expected) || data[209] !== bump) throw new Error("Wrong competition address or bump.");
  const status=["open","paid","refunding"] as const;
  if (data[208] >= status.length) throw new Error("Invalid competition status.");
  const key=(offset:number)=>new PublicKey(data.subarray(offset,offset+32));
  return {id, authority:key(16), mint:key(48), creator:key(80), gridHash:data.subarray(112,144).toString("hex"),
    stake:data.readBigUInt64LE(144), endsAt:data.readBigInt64LE(152), entries:data.readBigUInt64LE(160),
    bestMs:data.readBigUInt64LE(168), winner:key(176), status:status[data[208]], bump};
}
export function decodeEntry(program: PublicKey, address: PublicKey, account: Account, room: PublicKey, wallet: PublicKey) {
  layout(program,account,COMPETITION_ENTRY_SIZE,"SOLENTR1");
  const data=account.data;
  if (!new PublicKey(data.subarray(8,40)).equals(room)) throw new Error("Wrong entry room.");
  if (!new PublicKey(data.subarray(40,72)).equals(wallet)) throw new Error("Wrong entry wallet.");
  const [expected,bump]=entryAddress(program,room,wallet);
  if (!address.equals(expected) || data[89] !== bump) throw new Error("Wrong entry address or bump.");
  const status=["joined","started","finished","refunded"] as const;
  if (data[88] >= status.length) throw new Error("Invalid entry status.");
  return {room,wallet,startedAt:data.readBigInt64LE(72),completedMs:data.readBigUInt64LE(80),status:status[data[88]],bump};
}
/** Raw protocol encoding shared by transaction builders. Amounts never pass through Number. */
export function competitionInstruction(program: PublicKey, opcode: number, keys: AccountMeta[], values: bigint[] = [], gridHash?: Uint8Array) {
  const counts=[3,0,0,1,0,0,1];
  if (!Number.isInteger(opcode) || opcode<0 || opcode>=counts.length || values.length !== counts[opcode] || (opcode===0 ? gridHash?.length!==32 : gridHash!==undefined)) throw new Error("Invalid competition instruction arguments.");
  return new TransactionInstruction({programId:program,keys,data:Buffer.concat([Buffer.from([opcode]),...values.map(atomicU64),...(gridHash ? [Buffer.from(gridHash)] : [])])});
}

/** Reconcile actual accounts, never merely a transaction signature or a claimed balance. */
export function verifyDeposit(args: {
  program: PublicKey; roomAddress: PublicKey; roomAccount: Account; entryAddress: PublicKey; entryAccount: Account;
  wallet: PublicKey; authority: PublicKey; mint: PublicKey; stake: bigint; id: bigint; gridHash: string;
}) {
  const room=decodeRoom(args.program,args.roomAddress,args.roomAccount);
  if (room.id !== args.id || !room.authority.equals(args.authority) || !room.mint.equals(args.mint) || room.stake!==args.stake || room.gridHash!==args.gridHash || room.entries===0n) throw new Error("On-chain competition does not match this room.");
  const entry=decodeEntry(args.program,args.entryAddress,args.entryAccount,args.roomAddress,args.wallet);
  if (entry.status === "refunded" || room.status !== "open") throw new Error("This entry is no longer funded for an active competition.");
  return {room,entry};
}
