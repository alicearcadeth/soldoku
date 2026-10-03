import { describe, expect, it, vi } from "vitest";
import { Connection, Keypair, SystemProgram, SYSVAR_CLOCK_PUBKEY, Transaction, sendAndConfirmTransaction, type TransactionInstruction } from "@solana/web3.js";
import { getAccount, getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";
import { competitionInstructions, readCompetitionEntry, readCompetitionRoom } from "./escrow";
import { competitionChain } from "./chain";

// Dedicated validator, never a Devnet endpoint. This is not the required live Devnet proof.
const connection = new Connection("http://127.0.0.1:18999", "confirmed");
// WSL's old validator websocket handshake fails with this PC's Node runtime.
// Confirm via authoritative RPC signature status rather than weakening confirmation.
connection.confirmTransaction = async strategy => {
  const signature = typeof strategy === "string" ? strategy : strategy.signature;
  const started = Date.now();
  while (Date.now() - started < 30000) {
    const response = await connection.getSignatureStatuses([signature], { searchTransactionHistory: true });
    const status = response.value[0];
    if (status && (status.err || status.confirmationStatus === "confirmed" || status.confirmationStatus === "finalized")) {
      return { context: response.context, value: { err: status.err } };
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Local validator did not confirm ${signature} within 30 seconds; inspect its status before retrying.`);
};
export const LOCAL_COMPETITION_PROGRAM = Keypair.fromSeed(Uint8Array.from({ length: 32 }, () => 71)).publicKey;
const mintAuthority = Keypair.fromSeed(Uint8Array.from({ length: 32 }, () => 72));
const enabled = process.env.SUDOKU_COMPETITION_LOCALNET === "1";

describe.skipIf(!enabled)("multi-player competition escrow on local validator", () => {
  it("deposits three real SPL balances, locks duplicate entries, awards and pays once, and refunds an unmatched room", async () => {
    const players = [Keypair.generate(), Keypair.generate(), Keypair.generate()];
    const authority = Keypair.generate(); const impostor = Keypair.generate();
    const send = (signers: Keypair[], ...ix: TransactionInstruction[]) => sendAndConfirmTransaction(connection, new Transaction().add(...ix), signers, { commitment: "confirmed" });
    for (const wallet of [...players, authority, impostor, mintAuthority]) {
      const signature = await connection.requestAirdrop(wallet.publicKey, 2_000_000_000);
      await connection.confirmTransaction(signature, "confirmed");
    }
    const instructions = competitionInstructions(LOCAL_COMPETITION_PROGRAM, BigInt(Date.now()));
    const balances = [];
    for (const player of players) {
      const ata = await getOrCreateAssociatedTokenAccount(connection, player, instructions.mint, player.publicKey);
      await mintTo(connection, mintAuthority, instructions.mint, ata.address, mintAuthority, 10_000_000n);
      balances.push(ata.address);
    }
    const now = async () => (await connection.getAccountInfo(SYSVAR_CLOCK_PUBKEY))!.data.readBigInt64LE(32);
    const read = async () => readCompetitionRoom((await connection.getAccountInfo(instructions.room))!.data);
    let deadline = await now() + 62n;
    // Anyone can send SOL to a PDA before its legitimate creation. That must
    // neither block the creator nor block another wallet's eventual deposit.
    await send([players[0]], SystemProgram.transfer({ fromPubkey: players[0].publicKey, toPubkey: instructions.room, lamports: 1_000_000 }),
      SystemProgram.transfer({ fromPubkey: players[0].publicKey, toPubkey: instructions.entry(players[1].publicKey), lamports: 1_000_000 }));
    const wrongRent = instructions.open(players[0].publicKey, authority.publicKey, 1_000_000n, deadline, deadline + 20n, deadline + 80n);
    wrongRent.keys[5].pubkey = SYSVAR_CLOCK_PUBKEY;
    await expect(send([players[0], authority], wrongRent)).rejects.toThrow();
    const wrongMint = instructions.open(players[0].publicKey, authority.publicKey, 1_000_000n, deadline, deadline + 20n, deadline + 80n);
    wrongMint.keys[3].pubkey = SystemProgram.programId;
    await expect(send([players[0], authority], wrongMint)).rejects.toThrow();
    expect((await connection.getAccountInfo(instructions.room))?.owner.equals(SystemProgram.programId)).toBe(true);
    await send([players[0], authority], instructions.open(players[0].publicKey, authority.publicKey, 1_000_000n, deadline, deadline + 20n, deadline + 80n), instructions.join(players[0].publicKey));
    // Solo creator can extend, with unchanged grace; second entrant permanently locks it.
    deadline += 2n;
    await send([players[0]], instructions.extend(players[0].publicKey, deadline));
    expect((await read()).refundAt).toBe(deadline + 80n);
    const wrongTokenProgram = instructions.join(players[1].publicKey);
    wrongTokenProgram.keys[6].pubkey = SystemProgram.programId;
    await expect(send([players[1]], wrongTokenProgram)).rejects.toThrow();
    const wrongTokenAccount = instructions.join(players[1].publicKey);
    wrongTokenAccount.keys[3].pubkey = balances[0];
    await expect(send([players[1]], wrongTokenAccount)).rejects.toThrow();
    const wrongEntry = instructions.join(players[1].publicKey);
    wrongEntry.keys[1].pubkey = instructions.entry(players[2].publicKey);
    await expect(send([players[1]], wrongEntry)).rejects.toThrow();
    expect((await read()).entrants).toBe(1n);
    expect((await connection.getAccountInfo(instructions.entry(players[1].publicKey)))?.owner.equals(SystemProgram.programId)).toBe(true);
    expect((await getAccount(connection, instructions.vault)).amount).toBe(1_000_000n);
    await send([players[1]], instructions.join(players[1].publicKey));
    await send([players[2]], instructions.join(players[2].publicKey));
    expect((await read()).entrants).toBe(3n);
    expect((await read()).head?.equals(instructions.entry(players[2].publicKey))).toBe(true);
    for (let index = 0; index < players.length; index++) {
      const recorded = readCompetitionEntry((await connection.getAccountInfo(instructions.entry(players[index].publicKey)))!.data);
      expect(recorded.next?.equals(index ? instructions.entry(players[index - 1].publicKey) : SystemProgram.programId)).toBe(true);
    }
    // The server must discover direct on-chain entrants without a provider's paid scan method.
    const adapter = competitionChain({ SUDOKU_COMPETITION_PROGRAM_ID: LOCAL_COMPETITION_PROGRAM.toBase58(), SUDOKU_COMPETITION_RPC: "http://127.0.0.1:18999",
      SUDOKU_COMPETITION_LOCALNET: "1", SUDOKU_COMPETITION_AUTHORITY_KEY: JSON.stringify(Array.from(authority.secretKey)),
      SUDOKU_COMPETITION_PLAY_MS: "20000", SUDOKU_COMPETITION_GRACE_MS: "60000" })!;
    const scan = vi.spyOn(Connection.prototype, "getProgramAccounts").mockRejectedValue(new Error("Unavailable on free RPC tier"));
    try {
      const finalityLimit = Date.now() + 30000;
      while (true) {
        const finalized = await connection.getAccountInfo(instructions.room, "finalized");
        if (finalized?.owner.equals(LOCAL_COMPETITION_PROGRAM) && readCompetitionRoom(finalized.data).entrants === 3n) break;
        if (Date.now() >= finalityLimit) throw new Error("Three local deposits did not finalize before discovery verification.");
        await new Promise(resolve => setTimeout(resolve, 250));
      }
      const discovered = await adapter.read({ owner: players[0].publicKey.toBase58(), wallet: players[0].publicKey.toBase58(), wallets: [players[0].publicKey.toBase58()],
        endsAt: Number(deadline + 20n) * 1000, outcome: { kind: "pending" }, terms: { ...adapter.config, id: (await read()).id.toString(), stakeUnits: "1000000",
          startsAt: Number(deadline) * 1000, refundAt: Number(deadline + 80n) * 1000, chainStatus: "open", confirmedParticipants: 0, chainTime: 0, winner: null } });
      expect(discovered?.entries.map(entry => entry.wallet).sort()).toEqual(players.map(player => player.publicKey.toBase58()).sort());
      expect(discovered?.participants).toBe(3); expect(scan).not.toHaveBeenCalled();
    } finally { scan.mockRestore(); }
    expect((await getAccount(connection, instructions.vault)).amount).toBe(3_000_000n);
    for (const address of balances) expect((await getAccount(connection, address)).amount).toBe(9_000_000n);
    await expect(send([players[1]], instructions.join(players[1].publicKey))).rejects.toThrow();
    await expect(send([players[0]], instructions.extend(players[0].publicKey, deadline + 2n))).rejects.toThrow();
    await expect(send([authority], instructions.settle(authority.publicKey, players[1].publicKey))).rejects.toThrow();
    await expect(send([impostor], instructions.settle(impostor.publicKey, players[1].publicKey))).rejects.toThrow();
    await expect(send([players[0]], instructions.claim(players[0].publicKey, true))).rejects.toThrow();
    // A wallet with a valid token account but no tokens must not become an entrant.
    await getOrCreateAssociatedTokenAccount(connection, players[0], instructions.mint, impostor.publicKey);
    await expect(send([impostor], instructions.join(impostor.publicKey))).rejects.toThrow();
    expect((await read()).entrants).toBe(3n);
    expect(await connection.getAccountInfo(instructions.entry(impostor.publicKey))).toBeNull();
    // Open a second, unmatched room so its safe refund is covered in the same clock wait.
    const solo = competitionInstructions(LOCAL_COMPETITION_PROGRAM, BigInt(Date.now()) + 1n);
    const soloDeadline = await now() + 62n;
    await send([players[0], authority], solo.open(players[0].publicKey, authority.publicKey, 1_000_000n, soloDeadline, soloDeadline + 20n, soloDeadline + 80n), solo.join(players[0].publicKey));
    const until = deadline + 20n > soloDeadline ? deadline + 20n : soloDeadline;
    console.log("Three deposits verified; waiting for on-chain deadline to test payout/refund.");
    while (await now() < until) await new Promise(resolve => setTimeout(resolve, 1000));
    await expect(send([impostor], instructions.join(impostor.publicKey))).rejects.toThrow();
    await send([authority], instructions.settle(authority.publicKey, players[1].publicKey));
    await expect(send([authority], instructions.settle(authority.publicKey, players[2].publicKey))).rejects.toThrow();
    await expect(send([players[0]], instructions.claim(players[0].publicKey))).rejects.toThrow();
    const diverted = instructions.claim(players[1].publicKey);
    diverted.keys[3].pubkey = balances[0];
    await expect(send([players[0]], diverted)).rejects.toThrow();
    await send([players[0]], instructions.claim(players[1].publicKey));
    expect((await read()).status).toBe("paid");
    expect((await getAccount(connection, balances[1])).amount).toBe(12_000_000n);
    expect((await getAccount(connection, instructions.vault)).amount).toBe(0n);
    await send([players[2]], instructions.claim(players[1].publicKey));
    expect((await getAccount(connection, balances[1])).amount).toBe(12_000_000n);
    await expect(send([players[0]], instructions.claim(players[0].publicKey, true))).rejects.toThrow();
    await send([players[0]], solo.claim(players[0].publicKey, true));
    await send([players[2]], solo.claim(players[0].publicKey, true));
    expect((await getAccount(connection, solo.vault)).amount).toBe(0n);
    const e = readCompetitionEntry((await connection.getAccountInfo(solo.entry(players[0].publicKey)))!.data);
    expect(e.claimed).toBe(true);
    expect((await getAccount(connection, balances[0])).amount).toBe(9_000_000n);
    console.log("PASS: three-wallet deposits, payout conservation, duplicate protection and solo refund.");
  }, 180000);
});
