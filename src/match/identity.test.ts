import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import nacl from "tweetnacl";
import { describe, expect, it } from "vitest";
import { classicMessage, cleanName, historyListMessage, historyMessage, nameMessage, verifyClassic, verifyHistory, verifyHistoryList, verifyName } from "./identity";

describe("display name", () => {
  it("accepts a fresh signature and rejects a wallet address on its own", () => {
    const key = Keypair.generate();
    const wallet = key.publicKey.toBase58();
    const at = 1_700_000_000_000;
    const message = nameMessage(wallet, "Ada", at);
    const signature = bs58.encode(nacl.sign.detached(message, key.secretKey));
    expect(verifyName(wallet, "Ada", signature, at, at + 1000)).toBe("Ada");
    expect(() => verifyName(wallet, "Ada", signature, at, at + 130_000)).toThrow(/expired/i);
    expect(() => verifyName(wallet, "Ada", signature, at + 5000, at + 5000)).toThrow(/rejected/i);
    expect(() => cleanName("bad!")).toThrow(/letters/i);
    const history = historyMessage(wallet, "ROOM", at);
    const historySignature = bs58.encode(nacl.sign.detached(history, key.secretKey));
    expect(() => verifyHistory(wallet, "ROOM", historySignature, at, at + 1000)).not.toThrow();
    expect(() => verifyHistory(wallet, "OTHER", historySignature, at, at + 1000)).toThrow(/rejected/i);
    const list = historyListMessage(wallet, at);
    const listSignature = bs58.encode(nacl.sign.detached(list, key.secretKey));
    expect(() => verifyHistoryList(wallet, listSignature, at, at + 1000)).not.toThrow();
    const other = Keypair.generate().publicKey.toBase58();
    expect(() => verifyHistoryList(other, listSignature, at, at + 1000)).toThrow(/rejected/i);
    expect(() => verifyHistoryList(wallet, "not-a-signature", at, at)).toThrow(/rejected/i);
    const classic = classicMessage(wallet, 1, at);
    const classicSignature = bs58.encode(nacl.sign.detached(classic, key.secretKey));
    expect(() => verifyClassic(wallet, 1, classicSignature, at, 0, at + 1000)).not.toThrow();
    expect(() => verifyClassic(wallet, 5, classicSignature, at, 0, at + 1000)).toThrow(/one finished game/i);
    expect(() => verifyClassic(other, 1, classicSignature, at, 0, at + 1000)).toThrow(/rejected/i);
  });

  it("rejects an expired history proof and accepts a fresh signature", () => {
    const key = Keypair.generate();
    const wallet = key.publicKey.toBase58();
    const at = 1_700_000_000_000;
    const expired = bs58.encode(nacl.sign.detached(historyListMessage(wallet, at), key.secretKey));
    expect(() => verifyHistoryList(wallet, expired, at, at + 120_001)).toThrow(/expired/i);
    expect(() => verifyHistoryList(wallet, expired, at + 180_000, at + 181_000)).toThrow(/rejected/i);
    const later = at + 180_000;
    const fresh = bs58.encode(nacl.sign.detached(historyListMessage(wallet, later), key.secretKey));
    expect(() => verifyHistoryList(wallet, fresh, later, later + 1_000)).not.toThrow();
  });
});
