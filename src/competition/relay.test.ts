import { describe, expect, it } from "vitest";
import { Keypair, SystemProgram, Transaction, TransactionInstruction } from "@solana/web3.js";
import { COMPETITION_DEVNET_MINT, assertRelayedCompetitionTransaction, competitionInstructions, type RelayBinding } from "./escrow";

const program = Keypair.generate().publicKey;
const player = Keypair.generate();
const authority = Keypair.generate();
const id = 7n;
const startsAt = 1_700_000_000_000;
const endsAt = startsAt + 60_000;
const refundAt = endsAt + 3_600_000;
const ix = competitionInstructions(program, id, COMPETITION_DEVNET_MINT);
const binding: RelayBinding = { program: program.toBase58(), action: "deposit", wallet: player.publicKey.toBase58(), roomId: id.toString(), mint: COMPETITION_DEVNET_MINT.toBase58(), stake: "1000000",
  authority: authority.publicKey.toBase58(), owner: player.publicKey.toBase58(), startsAt, endsAt, refundAt };
function pack(instructions: Transaction["instructions"], signers: Keypair[]) {
  const tx = new Transaction({ feePayer: player.publicKey, recentBlockhash: Keypair.generate().publicKey.toBase58() });
  tx.add(...instructions);
  tx.sign(...signers);
  return tx;
}
const seconds = (ms: number) => BigInt(ms / 1000);
describe("relayed competition transactions", () => {
  it("accepts the creator open-and-join and rejects a substituted amount, room, or extra instruction", () => {
    const good = pack([
      ix.open(player.publicKey, authority.publicKey, 1_000_000n, seconds(startsAt), seconds(endsAt), seconds(refundAt)),
      ix.join(player.publicKey),
    ], [player, authority]);
    expect(() => assertRelayedCompetitionTransaction(good, binding)).not.toThrow();
    const wrongStake = pack([
      ix.open(player.publicKey, authority.publicKey, 2_000_000n, seconds(startsAt), seconds(endsAt), seconds(refundAt)),
      ix.join(player.publicKey),
    ], [player, authority]);
    expect(() => assertRelayedCompetitionTransaction(wrongStake, binding)).toThrow(/amount or deadline/);
    const otherRoom = competitionInstructions(program, 8n, COMPETITION_DEVNET_MINT);
    const wrongRoom = pack([otherRoom.join(player.publicKey)], [player]);
    expect(() => assertRelayedCompetitionTransaction(wrongRoom, binding)).toThrow(/different competition room/);
    const extra = pack([
      ix.join(player.publicKey),
      SystemProgram.transfer({ fromPubkey: player.publicKey, toPubkey: authority.publicKey, lamports: 1 }),
    ], [player]);
    expect(() => assertRelayedCompetitionTransaction(extra, binding)).toThrow(/Unrelated/);
    expect(() => assertRelayedCompetitionTransaction(extra, binding)).toThrow(`program ${SystemProgram.programId.toBase58()}`);
  });
  it("rejects a claim whose destination is a different wallet and a claim submitted as a deposit", () => {
    const other = Keypair.generate();
    const diverted = pack([ix.claim(other.publicKey, true)], [player]);
    expect(() => assertRelayedCompetitionTransaction(diverted, { ...binding, action: "claim" })).toThrow(/different entrant/);
    const own = pack([ix.claim(player.publicKey, true)], [player]);
    expect(() => assertRelayedCompetitionTransaction(own, { ...binding, action: "claim" })).not.toThrow();
    expect(() => assertRelayedCompetitionTransaction(own, { ...binding, action: "deposit" })).toThrow(/requested action/);
  });
  it("rejects a join whose entry account belongs to a different wallet", () => {
    const other = Keypair.generate();
    const join = ix.join(player.publicKey);
    const swapped = new TransactionInstruction({
      programId: join.programId, data: join.data,
      keys: join.keys.map((key, index) => index === 1 ? { ...key, pubkey: ix.entry(other.publicKey) } : key),
    });
    expect(() => assertRelayedCompetitionTransaction(pack([swapped], [player]), binding)).toThrow(/different entrant/);
  });
});
