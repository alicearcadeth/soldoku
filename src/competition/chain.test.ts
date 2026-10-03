import { afterEach, describe, expect, it, vi } from "vitest";
import { Connection, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { competitionChain } from "./chain";

const authority = Keypair.generate(); const player = Keypair.generate(); const program = Keypair.generate().publicKey;
const env = { SUDOKU_COMPETITION_PROGRAM_ID: program.toBase58(), SUDOKU_COMPETITION_AUTHORITY_KEY: JSON.stringify(Array.from(authority.secretKey)),
  SUDOKU_COMPETITION_LOCALNET: "1", SUDOKU_COMPETITION_RPC: "http://127.0.0.1:18999" };
function context(adapter: NonNullable<ReturnType<typeof competitionChain>>) {
  return { owner: player.publicKey.toBase58(), wallet: player.publicKey.toBase58(), wallets: [player.publicKey.toBase58()], endsAt: 200000,
    outcome: { kind: "pending" as const }, terms: { ...adapter.config, id: "1", stakeUnits: "1000000", startsAt: 100000, refundAt: 300000,
      chainStatus: "pending" as const, confirmedParticipants: 0, chainTime: 0, winner: null } };
}
afterEach(() => vi.restoreAllMocks());
describe("competition RPC boundaries", () => {
  it("treats a pre-funded empty system PDA as an unfunded room", async () => {
    const adapter = competitionChain(env)!;
    vi.spyOn(Connection.prototype, "getMultipleAccountsInfoAndContext").mockResolvedValue({ context: { slot: 10 }, value: [
      { owner: SystemProgram.programId, data: Buffer.alloc(0), executable: false, lamports: 1000000, rentEpoch: 0 }, null] });
    expect(await adapter.read(context(adapter))).toBeNull();
  });
  it("refuses corrupt or substituted program accounts instead of treating them as empty", async () => {
    const adapter = competitionChain(env)!;
    const read = vi.spyOn(Connection.prototype, "getMultipleAccountsInfoAndContext");
    for (const owner of [program, Keypair.generate().publicKey, SystemProgram.programId]) {
      read.mockResolvedValue({ context: { slot: 10 }, value: [{ owner, data: Buffer.from([1]), executable: false, lamports: 1000000, rentEpoch: 0 }, null] });
      await expect(adapter.read(context(adapter))).rejects.toThrow();
    }
  });
  it("rejects a Mainnet genesis before performing program or mint lookups", async () => {
    const adapter = competitionChain({ ...env, SUDOKU_COMPETITION_LOCALNET: undefined, SUDOKU_COMPETITION_RPC: "https://api.devnet.solana.com" })!;
    vi.spyOn(Connection.prototype, "getGenesisHash").mockResolvedValue("5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d");
    const accounts = vi.spyOn(Connection.prototype, "getAccountInfo");
    await expect(adapter.verify()).rejects.toThrow(/configured test network/); expect(accounts).not.toHaveBeenCalled();
  });
  it("refuses public RPC in local mode, HTTP in Devnet mode, legacy programs and arbitrary mints", () => {
    expect(() => competitionChain({ ...env, SUDOKU_COMPETITION_RPC: "https://api.devnet.solana.com" })).toThrow(/loopback/);
    expect(() => competitionChain({ ...env, SUDOKU_COMPETITION_LOCALNET: undefined })).toThrow(/HTTPS/);
    expect(() => competitionChain({ ...env, SUDOKU_COMPETITION_PROGRAM_ID: "937BAWXVCW58oEKkA1FijkSXXtdgGEytUyPRV2Roge22" })).toThrow(/separate program/);
    expect(() => competitionChain({ ...env, SUDOKU_COMPETITION_MINT: PublicKey.default.toBase58() })).toThrow(/Unsupported/);
  });
});
