import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { once } from "node:events";
import { Keypair, Transaction, SystemProgram } from "@solana/web3.js";
import { chromium } from "playwright";

const port = 5174;
const base = `http://127.0.0.1:${port}`;
const store = "output/browser-escrow-store.json";
mkdirSync("output", { recursive: true });
const server = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--port", String(port), "--strictPort", "--host", "127.0.0.1"], {
  env: { ...process.env, SUDOKU_COMPETITION_STORE: store }, stdio: ["ignore", "pipe", "pipe"],
});
let serverLog = "";
server.stdout.on("data", chunk => { serverLog += chunk; });
server.stderr.on("data", chunk => { serverLog += chunk; });
const ready = new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("Vite did not start")), 20000);
  server.stdout.on("data", () => { if (serverLog.includes("Local:")) { clearTimeout(timer); resolve(); } });
  server.on("exit", code => reject(new Error(`Vite exited ${code}`)));
});
await ready;

const signer = Keypair.generate();
const other = Keypair.generate();
const address = signer.publicKey.toBase58();
const otherAddress = other.publicKey.toBase58();
const mint = "BtdrgokAvXQE4yj3zS48c4ktnMSy3TGoRkHCWD5fV8U4";
const unsigned = new Transaction({ feePayer: signer.publicKey, recentBlockhash: Keypair.generate().publicKey.toBase58() });
unsigned.add(SystemProgram.transfer({ fromPubkey: signer.publicKey, toPubkey: other.publicKey, lamports: 1 }));
const transaction = Buffer.from(unsigned.serialize({ requireAllSignatures: false, verifySignatures: false })).toString("base64");
const room = {
  code: "A1B2C3D4", name: "Recovery check", level: "easy", createdAt: 1, endsAt: Date.now() + 3_600_000, durationMs: 3_600_000,
  participants: 1, status: "active", token: { mint, symbol: "TEST", name: "Soldoku Token (Devnet)", priceUsd: 0, updatedAt: 0 },
  stake: 1, bestMs: null, leaderboard: [],
  you: { name: "You", owner: true, canExtend: false, startedAt: null, completedMs: null, rank: null, board: null, givens: null, sequence: 0, claimed: false },
  funded: { program: "6uuszYMoZ2bBX8oVccpYPUgdhW6CSvASziN2m8LpJxYs", authority: address, mint, decimals: 6, playMs: 60000, graceMs: 60000, id: "1", stakeUnits: "1000000", startsAt: 1, refundAt: 2, chainStatus: "refunding", confirmedParticipants: 1, chainTime: Date.now(), winner: null },
};
const naclSource = readFileSync("node_modules/tweetnacl/nacl-fast.js", "utf8");
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage();
const submits = [];
let proofWallet = address;
await page.route("**/api/competitions/**", async route => {
  const url = new URL(route.request().url());
  let body = {};
  try { body = route.request().postDataJSON(); } catch { body = {}; }
  if (url.pathname.endsWith("/config")) return route.fulfill({ json: { enabled: true, cluster: "devnet", program: room.funded.program, authority: address, mint, decimals: 6, playMs: 60000, graceMs: 60000, testerFaucet: false } });
  if (url.pathname.endsWith("/proof")) { proofWallet = body.wallet || address; return route.fulfill({ json: { id: "proof-1", message: "Sign in to Soldoku Devnet" } }); }
  if (url.pathname.endsWith("/authorize")) return route.fulfill({ json: { actor: "actor-1", wallet: proofWallet, expires: Date.now() + 600000 } });
  if (url.pathname.endsWith("/transaction")) return route.fulfill({ json: { transaction, action: "claim", wallet: address, cluster: "devnet", room: "room", mint, stakeUnits: "1000000", startsAt: room.funded.startsAt, endsAt: room.endsAt, refundAt: room.funded.refundAt, expiresAtBlockHeight: 9 } });
  if (url.pathname.endsWith("/submit")) {
    submits.push(body.transaction);
    if (submits.length === 1) return route.abort();
    return route.fulfill({ json: { signature: "submitted-signature" } });
  }
  if (url.pathname.endsWith("/sync")) return route.fulfill({ json: { ...room, you: { ...room.you, claimed: true } } });
  return route.fulfill({ json: url.pathname.endsWith("/competitions") ? { rooms: [] } : room });
});
await page.addInitScript({ content: `${naclSource}\nwindow.__escrowWallet = ${JSON.stringify({ address, secret: [...signer.secretKey], other: otherAddress })};` });
await page.addInitScript({ content: `
  const state = { mode: "decline", account: window.__escrowWallet.address, signs: 0, listeners: [] };
  window.__escrowSet = (patch) => Object.assign(state, patch);
  window.__escrowSigns = () => state.signs;
  const wallet = {
    version: "1.0.0", name: "Test Wallet", icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'/>",
    get accounts() { return [{ address: state.account, publicKey: new Uint8Array(32), chains: ["solana:devnet"] }]; },
    features: {
      "standard:connect": { version: "1.0.0", connect: async () => ({ accounts: wallet.accounts }) },
      "standard:disconnect": { version: "1.0.0", disconnect: async () => {} },
      "standard:events": { version: "1.0.0", on: (event, listener) => { if (event === "change") state.listeners.push(listener); return () => {}; } },
      "solana:signMessage": { version: "1.0.0", signMessage: async ({ message }) => [{ signature: nacl.sign.detached(message, Uint8Array.from(window.__escrowWallet.secret)) }] },
      "solana:signTransaction": { version: "1.0.0", signTransaction: async ({ transaction }) => {
        state.signs += 1;
        if (state.mode === "decline") throw new Error("User rejected the request.");
        const bytes = new Uint8Array(transaction);
        const message = bytes.slice(65);
        bytes.set(nacl.sign.detached(message, Uint8Array.from(window.__escrowWallet.secret)), 1);
        return [{ signedTransaction: bytes }];
      } },
    },
  };
  const announce = (api) => api.register(wallet);
  window.addEventListener("wallet-standard:app-ready", (event) => announce(event.detail));
  window.dispatchEvent(new CustomEvent("wallet-standard:register-wallet", { detail: announce }));
  window.__switchEscrowAccount = () => { state.account = window.__escrowWallet.other; for (const listener of state.listeners) listener({ accounts: wallet.accounts }); };
` });
try {
  await page.goto(`${base}/?room=A1B2C3D4`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Claim stake refund" }).click();
  await page.getByRole("button", { name: /Test Wallet/ }).click();
  await page.getByRole("alert").filter({ hasText: "Wallet approval was cancelled. Nothing was submitted." }).waitFor();
  const declinedPending = await page.evaluate(() => localStorage.getItem("sudoku.pendingEscrow"));
  if (declinedPending && declinedPending !== "[]") throw new Error("A declined approval stored a pending transaction.");
  await page.evaluate(() => window.__escrowSet({ mode: "sign" }));
  await page.getByRole("button", { name: "Claim stake refund" }).click();
  try {
    await page.getByRole("alert").filter({ hasText: /still unconfirmed/ }).waitFor({ timeout: 8000 });
  } catch (error) {
    const alerts = await page.locator("[role=alert], [role=status]").allTextContents();
    const signs = await page.evaluate(() => window.__escrowSigns());
    throw new Error(JSON.stringify({ alerts, signs, submits: submits.length, cause: error.message }));
  }
  const signsAfterLoss = await page.evaluate(() => window.__escrowSigns());
  if (signsAfterLoss !== 2) throw new Error(`Expected the declined attempt and one signature, saw ${signsAfterLoss}.`);
  await page.evaluate(() => window.__switchEscrowAccount());
  await page.getByRole("button", { name: "Claim stake refund" }).click();
  await page.getByRole("alert").filter({ hasText: "Switching accounts does not start another approval." }).waitFor();
  const signsAfterSwitch = await page.evaluate(() => window.__escrowSigns());
  if (signsAfterSwitch !== 2) throw new Error("Account switch requested another signature.");
  await page.reload({ waitUntil: "domcontentloaded" });
  const walletChoice = page.getByRole("button", { name: /Test Wallet/ });
  await page.getByRole("button", { name: "Claim stake refund" }).click();
  if (await walletChoice.isVisible().catch(() => false)) await walletChoice.click();
  await page.getByText("Your claim is complete.").waitFor({ timeout: 15000 });
  const signsAfterRefresh = await page.evaluate(() => window.__escrowSigns());
  if (signsAfterRefresh !== 0) throw new Error("Refresh asked for a new signature instead of resubmitting the stored one.");
  if (submits.length !== 2 || submits[0] !== submits[1]) throw new Error("Refresh did not resubmit the same signed bytes.");
  const evidence = { passed: true, declinedStoredNothing: true, signsBeforeSwitch: signsAfterLoss, signsAfterSwitch, refreshSignedAgain: signsAfterRefresh !== 0, sameBytesResubmitted: submits[0] === submits[1] };
  mkdirSync("docs/evidence/2026-10-08-browser", { recursive: true });
  writeFileSync("docs/evidence/2026-10-08-browser/wallet-recovery.json", JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence));
} finally {
  await browser.close();
  server.kill();
  await once(server, "exit").catch(() => undefined);
}
