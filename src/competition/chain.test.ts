import { describe, expect, it } from "vitest";
import { Keypair } from "@solana/web3.js";
import { roomAddress, entryAddress, decodeRoom, decodeEntry, competitionInstruction, verifyDeposit } from "./chain";

describe("competition chain account verification", () => {
  it("requires the exact program-owned room PDA and preserves atomic u64 values", () => {
    const program = Keypair.generate().publicKey;
    const id = 42n;
    const [address, bump] = roomAddress(program, id);
    const data = Buffer.alloc(210);
    data.write("SOLCOMP1"); data.writeBigUInt64LE(id,8);
    data.writeBigUInt64LE(9_007_199_254_740_993n,144);
    data.writeBigInt64LE(1_800_000_000n,152);
    data.writeBigUInt64LE(3n,160); data.writeBigUInt64LE(16001n,168); data[209]=bump;
    expect(decodeRoom(program,address,{owner:program,data}).stake).toBe(9_007_199_254_740_993n);
    expect(() => decodeRoom(program,address,{owner:Keypair.generate().publicKey,data})).toThrow(/owner/);
    expect(() => decodeRoom(program,Keypair.generate().publicKey,{owner:program,data})).toThrow(/address/);
    expect(() => decodeRoom(program,address,{owner:program,data:data.subarray(0,209)})).toThrow(/layout/);
    const wrong = Buffer.from(data); wrong[0]=0;
    expect(() => decodeRoom(program,address,{owner:program,data:wrong})).toThrow(/layout/);
  });
  it("binds each entry to its wallet, room and canonical receipt", () => {
    const program=Keypair.generate().publicKey, wallet=Keypair.generate().publicKey;
    const [room] = roomAddress(program,1n), [address,bump]=entryAddress(program,room,wallet);
    const data=Buffer.alloc(90); data.write("SOLENTR1"); room.toBuffer().copy(data,8); wallet.toBuffer().copy(data,40); data[89]=bump;
    expect(decodeEntry(program,address,{owner:program,data},room,wallet).status).toBe("joined");
    expect(() => decodeEntry(program,address,{owner:program,data},room,Keypair.generate().publicKey)).toThrow(/wallet/);
    expect(() => decodeEntry(program,address,{owner:program,data},Keypair.generate().publicKey,wallet)).toThrow(/room/);
    data[88]=3;
    expect(decodeEntry(program,address,{owner:program,data},room,wallet).status).toBe("refunded");
    data[88]=4;
    expect(() => decodeEntry(program,address,{owner:program,data},room,wallet)).toThrow(/status/);
  });
  it("builds exact instruction lengths and refuses unsafe numbers", () => {
    const program=Keypair.generate().publicKey;
    const instruction=competitionInstruction(program,3,[],[16001n]);
    expect([...instruction.data]).toEqual([3,129,62,0,0,0,0,0,0]);
    expect(() => competitionInstruction(program,3,[],[-1n])).toThrow(/u64/);
    expect(() => competitionInstruction(program,3,[],[1n << 64n])).toThrow(/u64/);
    expect(() => competitionInstruction(program,1,[],[1n])).toThrow(/arguments/);
  });
  it("rejects an unrelated program-owned deposit and a previously refunded receipt", () => {
    const program=Keypair.generate().publicKey, wallet=Keypair.generate().publicKey;
    const authority=Keypair.generate().publicKey, mint=Keypair.generate().publicKey;
    const [room,roomBump]=roomAddress(program,7n), [entry,entryBump]=entryAddress(program,room,wallet);
    const roomData=Buffer.alloc(210); roomData.write("SOLCOMP1"); roomData.writeBigUInt64LE(7n,8);
    authority.toBuffer().copy(roomData,16); mint.toBuffer().copy(roomData,48);
    roomData.fill(8,112,144); roomData.writeBigUInt64LE(1_000_000n,144); roomData.writeBigUInt64LE(1n,160); roomData[209]=roomBump;
    const entryData=Buffer.alloc(90); entryData.write("SOLENTR1"); room.toBuffer().copy(entryData,8); wallet.toBuffer().copy(entryData,40); entryData[89]=entryBump;
    const args={program,roomAddress:room,roomAccount:{owner:program,data:roomData},entryAddress:entry,entryAccount:{owner:program,data:entryData},wallet,authority,mint,stake:1_000_000n,id:7n,gridHash:Buffer.alloc(32,8).toString("hex")};
    expect(verifyDeposit(args).entry.status).toBe("joined");
    for (const change of [{stake:2n},{id:8n},{mint:Keypair.generate().publicKey},{authority:Keypair.generate().publicKey},{gridHash:"00".repeat(32)}]) {
      expect(() => verifyDeposit({...args,...change})).toThrow(/does not match/);
    }
    entryData[88]=3;
    expect(() => verifyDeposit(args)).toThrow(/no longer funded/);
    entryData[88]=0; roomData[208]=1;
    expect(() => verifyDeposit(args)).toThrow(/no longer funded/);
  });
});
