import { describe, expect, it } from "vitest";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { Connection, Keypair, PublicKey, SYSVAR_CLOCK_PUBKEY, Transaction, type TransactionInstruction } from "@solana/web3.js";
import { getAccount, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { COMPETITION_DEVNET_MINT, competitionInstructions, readCompetitionEntry, readCompetitionRoom } from "./escrow";

// Explicit opt-in: real Devnet TEST balances and SOL fees, no public fixture keys.
describe.skipIf(process.env.SUDOKU_COMPETITION_DEVNET_REFUNDS !== "1")("competition refunds on real Devnet", () => {
  it("refunds three nonfinishers once, refunds a solo extension, and recovers without an authority", async () => {
    const endpoint = process.env.SUDOKU_COMPETITION_DEVNET_RPC ?? "https://api.devnet.solana.com";
    if (new URL(endpoint).protocol !== "https:") throw new Error("Devnet refund verification requires HTTPS.");
    const connection = new Connection(endpoint, { commitment: "finalized", fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(12000) }) });
    expect(await connection.getGenesisHash()).toBe("EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG");
    const load = (file: string) => Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(join(homedir(), ".config", "solana", file), "utf8"))));
    const players = ["sudoku-dev.json", "sudoku-player-b.json", "sudoku-phantom-disposable.json"].map(load);
    const authority = load("sudoku-v2-authority.json");
    const program = new PublicKey("6uuszYMoZ2bBX8oVccpYPUgdhW6CSvASziN2m8LpJxYs");
    const programAccount = await connection.getAccountInfo(program);
    expect(programAccount?.executable).toBe(true);
    expect(programAccount?.data.readUInt32LE(0)).toBe(2);
    const deployed = await connection.getAccountInfo(new PublicKey(programAccount!.data.subarray(4, 36)));
    const binary = readFileSync("programs/competition-escrow/target/deploy/competition_escrow.so");
    expect(deployed?.data.subarray(45, 45 + binary.length).equals(binary)).toBe(true);
    const receipts: { action: string; signature: string }[] = [];
    const evidence = { cluster: "devnet", passed: false, program: program.toBase58(), programSHA256: createHash("sha256").update(binary).digest("hex"), rooms: [] as string[], receipts };
    mkdirSync("output/competition-devnet-refunds", { recursive: true });
    const save = () => writeFileSync("output/competition-devnet-refunds/results.json", JSON.stringify(evidence, null, 2));
    const send = async (action: string, signers: Keypair[], ...instructions: TransactionInstruction[]) => {
      const latest = await connection.getLatestBlockhash("finalized");
      const tx = new Transaction({ feePayer: signers[0].publicKey, recentBlockhash: latest.blockhash }).add(...instructions);
      tx.sign(...signers);
      const signature = await connection.sendRawTransaction(tx.serialize(), { preflightCommitment: "finalized", maxRetries: 3 });
      const expires = Date.now() + 60000;
      while (Date.now() < expires) {
        const status = (await connection.getSignatureStatuses([signature], { searchTransactionHistory: true })).value[0];
        if (status?.err) throw new Error(`Devnet transaction ${signature} failed: ${JSON.stringify(status.err)}`);
        if (status?.confirmationStatus === "finalized") { receipts.push({ action, signature }); save(); console.log(`Finalized ${action}: ${signature}`); return; }
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      throw new Error(`Inspect unconfirmed transaction ${signature} before retrying.`);
    };
    const now = async () => (await connection.getAccountInfo(SYSVAR_CLOCK_PUBKEY))!.data.readBigInt64LE(32);
    const until = async (timestamp: bigint) => {
      while (await now() < timestamp) await new Promise(resolve => setTimeout(resolve, 1000));
    };
    const atas = players.map(player => getAssociatedTokenAddressSync(COMPETITION_DEVNET_MINT, player.publicKey));
    const balances = await Promise.all(atas.map(async ata => (await getAccount(connection, ata, "finalized")).amount));
    const base = BigInt(Date.now());
    const rooms = [0n, 1n, 2n].map(offset => competitionInstructions(program, base + offset, COMPETITION_DEVNET_MINT));
    evidence.rooms = rooms.map(room => room.room.toBase58()); save();
    const deadlines: bigint[] = [];
    // Separate starts leave registration time even when public RPC finality is slow.
    for (let index = 0; index < rooms.length; index++) {
      const room = rooms[index]; const start = await now() + 120n; deadlines.push(start);
      await send(`open-${index}`, [players[0], authority], room.open(players[0].publicKey, authority.publicKey, 1_000_000n, start, start + 15n, start + 75n), room.join(players[0].publicKey));
      if (index === 1) {
        deadlines[index] += 60n;
        await send("solo-extension", [players[0]], room.extend(players[0].publicKey, deadlines[index]));
      } else {
        for (const player of players.slice(1)) await send(`join-${index}`, [player], room.join(player.publicKey));
        await expect(send("locked-extension", [players[0]], room.extend(players[0].publicKey, start + 60n))).rejects.toThrow();
      }
    }
    await until(deadlines[0] + 15n);
    await send("no-finisher-settlement", [authority], rooms[0].settle(authority.publicKey, null));
    await expect(send("repeat-settlement", [authority], rooms[0].settle(authority.publicKey, players[0].publicKey))).rejects.toThrow();
    for (const player of players) {
      await send("no-finisher-refund", [player], rooms[0].claim(player.publicKey, true));
      await send("refund-retry", [player], rooms[0].claim(player.publicKey, true));
      expect(readCompetitionEntry((await connection.getAccountInfo(rooms[0].entry(player.publicKey)))!.data).claimed).toBe(true);
    }
    await until(deadlines[1]);
    await send("solo-refund", [players[0]], rooms[1].claim(players[0].publicKey, true));
    await until(deadlines[2] + 75n);
    await expect(send("late-authority-settlement", [authority], rooms[2].settle(authority.publicKey, players[0].publicKey))).rejects.toThrow();
    for (const player of players) await send("authority-timeout-refund", [player], rooms[2].claim(player.publicKey, true));
    for (let index = 0; index < atas.length; index++) expect((await getAccount(connection, atas[index])).amount).toBe(balances[index]);
    for (const room of rooms) {
      expect((await getAccount(connection, room.vault)).amount).toBe(0n);
      expect(readCompetitionRoom((await connection.getAccountInfo(room.room))!.data).status).toBe("refunding");
      await expect(send("late-join", [players[1]], room.join(players[1].publicKey))).rejects.toThrow();
    }
    evidence.passed = true; save(); console.log("PASS: real Devnet no-finisher, extended-solo and authority-timeout refunds conserve all TEST balances.");
  }, 600000);
});
