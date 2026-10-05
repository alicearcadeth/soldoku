import assert from "node:assert/strict";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { chromium } from "playwright";
import nacl from "tweetnacl";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";

// This creates only a disposable Devnet identity. Its private key stays outside the repo.
const path = process.env.SUDOKU_FAUCET_WALLET ?? join(homedir(), ".config", "solana", "soldoku-demo-new-wallet-2026-10-05.json");
const key = existsSync(path) ? Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(path, "utf8")))) : Keypair.generate();
if (!existsSync(path)) writeFileSync(path, JSON.stringify(Array.from(key.secretKey)), { mode: 0o600 });
const origin = process.env.QA_ORIGIN ?? "https://soldoku.com/";
const endpoint = process.env.SUDOKU_COMPETITION_RPC ?? "https://api.devnet.solana.com";
assert.equal(new URL(endpoint).protocol, "https:");
const connection = new Connection(endpoint, "finalized");
assert.equal(await connection.getGenesisHash(), "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG");
const out = "output/competition-faucet-current"; mkdirSync(out, { recursive: true });
const result = { origin, cluster: "devnet", wallet: key.publicKey.toBase58(), startedAt: new Date().toISOString(), passed: false };
const browser = await chromium.launch({ channel: "chrome" });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
try {
  await context.exposeBinding("faucetSign", (_, bytes) => Array.from(nacl.sign.detached(Uint8Array.from(bytes), key.secretKey)));
  await context.addInitScript(({ address, bytes }) => {
    const account = { address, publicKey: Uint8Array.from(bytes), chains: ["solana:devnet"], features: ["solana:signMessage"] };
    const wallet = { version: "1.0.0", name: "Devnet Test Wallet", icon: "data:image/png;base64,", chains: account.chains, accounts: [], features: {
      "standard:connect": { version: "1.0.0", connect: async () => ({ accounts: [account] }) },
      "standard:disconnect": { version: "1.0.0", disconnect: async () => undefined },
      "solana:signMessage": { version: "1.0.0", signMessage: async ({ message }) => [{ signature: Uint8Array.from(await window.faucetSign(Array.from(message))) }] },
    } };
    window.addEventListener("wallet-standard:app-ready", event => event.detail.register(wallet));
  }, { address: key.publicKey.toBase58(), bytes: Array.from(key.publicKey.toBytes()) });
  const page = await context.newPage(); page.setDefaultTimeout(45000);
  await page.goto(origin);
  await page.getByRole("button", { name: /^LEADERBOARD Compete/i }).click();
  await page.getByRole("button", { name: "Create competition", exact: true }).click();
  await page.getByRole("button", { name: "For tokens", exact: true }).click();
  await page.getByText("Rules & test funds", { exact: true }).click();
  const received = page.waitForResponse(response => response.url().endsWith("/api/competitions/faucet"), { timeout: 90000 });
  await page.getByRole("button", { name: "Get test funds", exact: true }).click();
  await page.getByRole("dialog", { name: "Connect wallet", exact: true }).getByRole("button", { name: /^Devnet Test Wallet/ }).click();
  const response = await received; result.status = response.status(); result.grant = await response.json();
  assert.equal(response.ok(), true, result.grant.error);
  const signatures = [result.grant.solSignature, result.grant.testSignature].filter(Boolean);
  for (const signature of signatures) {
    const deadline = Date.now() + 90000;
    while (true) {
      const status = (await connection.getSignatureStatuses([signature], { searchTransactionHistory: true })).value[0];
      assert.equal(status?.err ?? null, null);
      if (status?.confirmationStatus === "finalized") break;
      assert.ok(Date.now() < deadline, `Transaction pending: ${signature}`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  const config = await (await fetch(new URL("/api/competitions/config", origin))).json();
  result.solLamports = await connection.getBalance(key.publicKey);
  result.testUnits = (await connection.getTokenAccountBalance(getAssociatedTokenAddressSync(new PublicKey(config.mint), key.publicKey))).value.amount;
  result.explorer = signatures.map(signature => `https://explorer.solana.com/tx/${signature}?cluster=devnet`);
  await page.screenshot({ path: `${out}/grant.png`, fullPage: true });
  assert.ok(result.solLamports >= 50_000_000, "Fresh wallet still lacks Devnet SOL for entry fees; inspect the grant note.");
  assert.equal(result.testUnits, "20000000");
  result.passed = true;
} catch (error) {
  result.error = error.message;
  await context.pages()[0]?.screenshot({ path: `${out}/failure.png`, fullPage: true }).catch(() => {});
  process.exitCode = 1;
} finally {
  result.finishedAt = new Date().toISOString();
  writeFileSync(`${out}/results.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result)); await browser.close();
}
