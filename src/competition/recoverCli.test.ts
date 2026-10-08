import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { Keypair } from "@solana/web3.js";

describe("app-independent recovery preview", () => {
  it("prints refund tag 5 and does not send", () => {
    const wallet = Keypair.generate().publicKey.toBase58();
    const output = execFileSync(process.execPath, ["--experimental-strip-types", "scripts/recover-escrow.mjs", "--dry-run=true", "--room-id=1", `--wallet=${wallet}`, "--refund=true"], { encoding: "utf8" });
    const preview = JSON.parse(output);
    expect(preview.tag).toBe(5);
    expect(preview.action).toBe("refund");
    expect(preview.feePayer).toBe(wallet);
    expect(preview.createAta).toBe(false);
    expect(output).not.toMatch(/secret|private/i);
  });
});
