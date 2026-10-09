import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { chromium } from "playwright";
import nacl from "tweetnacl";
import { Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";
import { getAccount, getAssociatedTokenAddressSync } from "@solana/spl-token";

// Controlled live Devnet round against soldoku.com.
// Funding is opened only until both deposits finalize, then paused again.
// Settlement must come from the Worker cron, not the Finalize button.

const origin = process.env.QA_ORIGIN ?? "https://soldoku.com/";
const rpc = process.env.SUDOKU_COMPETITION_RPC_PUBLIC ?? "https://api.devnet.solana.com";
const out = process.env.SUDOKU_SCHEDULED_OUT ?? "docs/evidence/2026-10-09-scheduled-devnet";
const configPath = "wrangler.soldoku.jsonc";
mkdirSync(out, { recursive: true });

const load = (file) => Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(join(homedir(), ".config", "solana", file), "utf8"))));
const players = [load("sudoku-dev.json"), load("sudoku-player-b.json")];
const connection = new Connection(rpc, { commitment: "finalized", fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(20000) }) });
const genesis = await connection.getGenesisHash();
assert.equal(genesis, "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG", "Refusing a non-Devnet RPC");

const evidence = {
  announcedAt: new Date().toISOString(),
  announcement: "Brief Devnet funding window for a controlled two-wallet scheduled settlement round. Pause restores immediately after both deposits finalize. Claims/refunds continue while paused.",
  origin,
  cluster: "devnet",
  genesis,
  players: players.map((p) => p.publicKey.toBase58()),
  transactions: [],
  cron: {},
  pause: {},
  passed: false,
};
const save = () => writeFileSync(join(out, "results.json"), JSON.stringify(evidence, null, 2));
save();

function wranglerSecretPut(value) {
  const result = spawnSync("npx", ["wrangler", "secret", "put", "SUDOKU_COMPETITION_PAUSED", "--config", configPath], {
    input: `${value}\n`,
    encoding: "utf8",
    shell: true,
  });
  return { status: result.status, stdout: result.stdout?.slice(0, 500) ?? "", stderr: result.stderr?.slice(0, 500) ?? "" };
}

async function waitPaused(expectedPaused, limitMs = 120000) {
  const deadline = Date.now() + limitMs;
  while (Date.now() < deadline) {
    const create = await fetch(new URL("api/competitions/create", origin), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: "tokens", stakeUnits: "1000000", level: "easy", durationMs: 180000 }),
    });
    const body = await create.json();
    const paused = /paused/i.test(String(body.error ?? ""));
    if (paused === expectedPaused || (!expectedPaused && create.status !== 400)) return { paused, status: create.status, body };
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error(`Pause probe did not reach expectedPaused=${expectedPaused}`);
}

async function tokenAmount(owner, mint) {
  const ata = getAssociatedTokenAddressSync(mint, owner);
  try { return (await getAccount(connection, ata, "finalized")).amount; } catch { return 0n; }
}

const config = await (await fetch(new URL("api/competitions/config", origin))).json();
assert.equal(config.enabled, true);
assert.equal(config.cluster, "devnet");
evidence.configBefore = config;
evidence.pause.before = await waitPaused(true);
save();

console.log("ANNOUNCE:", evidence.announcement);
console.log("Opening brief funding window...");
evidence.pause.unpauseAttempt = wranglerSecretPut("0");
evidence.pause.afterUnpause = await waitPaused(false);
save();
assert.equal(evidence.pause.afterUnpause.paused, false, "Funding window did not open");

const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {});
const contexts = [];
const errors = [];

async function client(key, index, url = origin) {
  const context = await browser.newContext({ viewport: { width: index === 0 ? 390 : 1280, height: 900 } });
  contexts.push(context);
  await context.exposeBinding("competitionSignMessage", (_, bytes) => Array.from(nacl.sign.detached(Uint8Array.from(bytes), key.secretKey)));
  await context.exposeBinding("competitionSignTransaction", (_, bytes) => {
    const tx = Transaction.from(Buffer.from(bytes));
    assert.equal(tx.feePayer.toBase58(), key.publicKey.toBase58());
    tx.partialSign(key);
    return Array.from(tx.serialize());
  });
  await context.addInitScript(({ wallet, publicKey }) => {
    const account = { address: wallet, publicKey: Uint8Array.from(publicKey), chains: ["solana:devnet"], features: ["solana:signMessage", "solana:signTransaction"] };
    const walletAdapter = {
      version: "1.0.0", name: "Competition E2E Wallet", icon: "data:image/png;base64,", chains: account.chains, accounts: [],
      features: {
        "standard:connect": { version: "1.0.0", connect: async () => ({ accounts: [account] }) },
        "standard:disconnect": { version: "1.0.0", disconnect: async () => undefined },
        "solana:signMessage": { version: "1.0.0", signMessage: async ({ message }) => [{ signature: Uint8Array.from(await window.competitionSignMessage(Array.from(message))) }] },
        "solana:signTransaction": { version: "1.0.0", signTransaction: async ({ transaction, chain }) => {
          if (chain !== "solana:devnet") throw new Error("Browser requested the wrong network");
          return [{ signedTransaction: Uint8Array.from(await window.competitionSignTransaction(Array.from(transaction))) }];
        } },
      },
    };
    window.addEventListener("wallet-standard:app-ready", (event) => event.detail.register(walletAdapter));
  }, { wallet: key.publicKey.toBase58(), publicKey: Array.from(key.publicKey.toBytes()) });
  const page = await context.newPage();
  page.setDefaultTimeout(300000);
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", async (response) => {
    if (/\/api\/competitions\/(submit|settle)$/.test(response.url()) && response.ok()) {
      const body = await response.json();
      if (body.signature) {
        evidence.transactions.push({
          wallet: key.publicKey.toBase58(),
          signature: body.signature,
          action: response.url().endsWith("settle") ? "settle" : "wallet-transaction",
          explorer: `https://explorer.solana.com/tx/${body.signature}?cluster=devnet`,
          at: new Date().toISOString(),
        });
        save();
      }
    }
  });
  await page.goto(url);
  return page;
}

async function wallet(page) {
  const dialog = page.getByRole("dialog", { name: "Connect wallet", exact: true });
  await dialog.waitFor();
  await dialog.getByRole("button", { name: /^Competition E2E Wallet/ }).click();
  await dialog.waitFor({ state: "hidden" });
}

async function state(page, code) {
  return page.evaluate(async (code) => {
    const session = JSON.parse(localStorage.getItem("sudoku.competitionSession"));
    return (await fetch("/api/competitions/state", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code, actor: session.actor }),
    })).json();
  }, code);
}

function solveGrid(givens) {
  const values = [...givens];
  function solve(index = 0) {
    while (index < 81 && values[index]) index++;
    if (index === 81) return true;
    const row = Math.floor(index / 9), col = index % 9;
    for (let digit = 1; digit <= 9; digit++) {
      let valid = true;
      for (let j = 0; j < 9; j++) {
        if (values[row * 9 + j] === digit || values[j * 9 + col] === digit
          || values[(Math.floor(row / 3) * 3 + Math.floor(j / 3)) * 9 + Math.floor(col / 3) * 3 + j % 3] === digit) valid = false;
      }
      if (valid) { values[index] = digit; if (solve(index + 1)) return true; }
    }
    values[index] = 0;
    return false;
  }
  assert.ok(solve());
  return values;
}

try {
  const mint = new PublicKey(config.mint);
  const atas = players.map((p) => getAssociatedTokenAddressSync(mint, p.publicKey));
  const before = await Promise.all(players.map((p) => tokenAmount(p.publicKey, mint)));
  evidence.balancesBefore = before.map((amount, i) => ({ wallet: players[i].publicKey.toBase58(), test: amount.toString() }));
  save();

  const a = await client(players[0], 0);
  await a.getByRole("button", { name: /^LEADERBOARD Compete/i }).click();
  await a.getByRole("group", { name: "Competition navigation" }).getByRole("button", { name: "Create competition", exact: true }).click();
  await a.getByRole("textbox", { name: "Room name", exact: true }).fill("Scheduled cron settlement 2026-10-09");
  await a.getByRole("button", { name: "Easy", exact: true }).click();
  await a.getByRole("button", { name: "For tokens", exact: true }).click();
  await a.getByRole("button", { name: /^Choose token/ }).click();
  await a.getByRole("button", { name: "Soldoku Token (Devnet) · available", exact: true }).click();
  await a.getByRole("spinbutton", { name: "Token amount", exact: true }).fill("1");
  await a.getByRole("button", { name: "Custom Duration", exact: true }).click();
  await a.getByRole("combobox", { name: "Duration unit", exact: true }).selectOption("60000");
  await a.getByRole("spinbutton", { name: "Custom duration", exact: true }).fill("1");
  await a.getByRole("button", { name: "Create room", exact: true }).click();
  await wallet(a);
  const gate = a.getByRole("dialog", { name: "Quick check before creating", exact: true });
  await gate.waitFor();
  const target = await gate.locator(".slider-target").evaluate((element) => Number(element.style.getPropertyValue("--target")));
  await gate.getByRole("slider").fill(String(Math.round(target * 100)));
  await gate.getByRole("button", { name: "Verify position", exact: true }).click();
  await gate.getByRole("button", { name: "Confirm create room", exact: true }).click();
  const roomElement = a.locator("[data-room-code]");
  await roomElement.waitFor();
  const code = await roomElement.getAttribute("data-room-code");
  evidence.code = code;
  const shared = await a.getByRole("link", { name: "Shareable room link", exact: true }).getAttribute("href");
  evidence.url = shared;
  save();

  await a.getByRole("button", { name: "Deposit 1 TEST to join", exact: true }).click();
  await a.getByText("Your stake is confirmed in escrow.", { exact: true }).waitFor();
  const b = await client(players[1], 1, shared);
  await b.getByRole("button", { name: "Deposit 1 TEST to join", exact: true }).click();
  await wallet(b);
  await b.getByText("Your stake is confirmed in escrow.", { exact: true }).waitFor();

  let room = await state(a, code);
  assert.equal(room.participants, 2);
  assert.equal(room.funded.stakeUnits, "1000000");
  evidence.depositsFinalizedAt = new Date().toISOString();
  evidence.funded = {
    id: room.funded.id,
    program: room.funded.program,
    mint: room.funded.mint,
    stakeUnits: room.funded.stakeUnits,
    startsAt: room.funded.startsAt,
    endsAt: room.endsAt,
    refundAt: room.funded.refundAt,
  };
  const id = Buffer.alloc(8);
  id.writeBigUInt64LE(BigInt(room.funded.id));
  const escrow = PublicKey.findProgramAddressSync([Buffer.from("competition"), id], new PublicKey(config.program))[0];
  const vault = getAssociatedTokenAddressSync(mint, escrow, true);
  evidence.escrow = escrow.toBase58();
  evidence.vault = vault.toBase58();
  assert.equal((await getAccount(connection, vault, "finalized")).amount, 2_000_000n);
  save();

  console.log("Both deposits finalized. Restoring funding pause immediately...");
  evidence.pause.restoreAttempt = wranglerSecretPut("1");
  evidence.pause.afterRestore = await waitPaused(true);
  save();
  assert.equal(evidence.pause.afterRestore.paused, true, "Funding pause was not restored");

  const pages = [a, b];
  console.log(`Waiting for shared start ${new Date(room.funded.startsAt).toISOString()}`);
  for (const page of pages) await page.getByRole("button", { name: /^(Start|Continue) challenge$/ }).waitFor({ state: "visible" });
  for (const page of pages) {
    await page.getByRole("button", { name: /^(Start|Continue) challenge$/ }).click();
    await page.getByRole("gridcell").first().waitFor({ timeout: 45000 });
  }
  const started = await state(a, code);
  const solution = solveGrid(started.you.givens);
  for (let playerIndex = 0; playerIndex < 2; playerIndex++) {
    const page = pages[playerIndex];
    const current = await state(page, code);
    const empty = current.you.givens.flatMap((value, index) => value || current.you.board[index] === solution[index] ? [] : [index]);
    while (Date.now() - room.funded.startsAt < 16000) await new Promise((r) => setTimeout(r, 500));
    for (const index of empty) {
      await page.getByRole("gridcell").nth(index).click();
      await page.locator(".pad button").nth(solution[index] - 1).click();
      if (index !== empty.at(-1)) await page.getByRole("gridcell").nth(index).filter({ hasText: String(solution[index]) }).waitFor();
      await page.waitForTimeout(120);
    }
    await page.getByText(/Finished in .*rank/).waitFor();
  }
  room = await state(a, code);
  assert.equal(room.leaderboard.length, 2);
  assert.equal(room.leaderboard[0].wallet, players[0].publicKey.toBase58());
  evidence.leaderboard = room.leaderboard;
  evidence.acceptedResultAt = new Date().toISOString();
  save();
  console.log("Accepted finishes recorded. Waiting for endsAt + Worker cron settlement (no Finalize click).");

  // Ensure Finalize is not used; wait until endsAt, then poll for cron-confirmed settlement.
  const finalizeCount = await a.getByRole("button", { name: "Finalize result", exact: true }).count();
  evidence.finalizeButtonPresentBeforeEnds = finalizeCount > 0;
  const waitUntil = room.endsAt + 12 * 60 * 1000;
  while (Date.now() < waitUntil) {
    room = await state(a, code);
    const settlement = room.funded?.settlement;
    const signature = room.funded?.settlementSignature;
    evidence.cron.poll = {
      at: new Date().toISOString(),
      chainStatus: room.funded?.chainStatus,
      settlementPhase: settlement?.phase ?? null,
      settlementSignature: signature ?? null,
      settlementAlert: room.funded?.settlementAlert ?? null,
      now: Date.now(),
      endsAt: room.endsAt,
    };
    save();
    if (signature && signature !== "chain-closed" && settlement?.phase === "confirmed" && room.funded.chainStatus === "awarded") {
      evidence.cron.confirmedAt = new Date().toISOString();
      evidence.cron.signature = signature;
      evidence.cron.explorer = `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
      break;
    }
    if (Date.now() < room.endsAt) {
      await new Promise((r) => setTimeout(r, 15000));
    } else {
      await new Promise((r) => setTimeout(r, 20000));
    }
  }
  assert.ok(evidence.cron.signature, "Cron did not record a finalized settlement signature");
  assert.notEqual(evidence.cron.signature, "chain-closed");
  assert.equal(room.funded.settlementAlert ?? "", "");
  const settleStatus = (await connection.getSignatureStatuses([evidence.cron.signature], { searchTransactionHistory: true })).value[0];
  evidence.cron.chainConfirmation = settleStatus?.confirmationStatus ?? null;
  evidence.cron.chainErr = settleStatus?.err ?? null;
  assert.equal(settleStatus?.err ?? null, null);
  assert.equal(settleStatus?.confirmationStatus, "finalized");

  // Later cron should keep the same finalized signature (re-poll state after another interval).
  await new Promise((r) => setTimeout(r, 5 * 60 * 1000 + 15000));
  const later = await state(a, code);
  evidence.cron.laterPoll = {
    at: new Date().toISOString(),
    settlementSignature: later.funded?.settlementSignature ?? null,
    phase: later.funded?.settlement?.phase ?? null,
    chainStatus: later.funded?.chainStatus ?? null,
    alert: later.funded?.settlementAlert ?? null,
  };
  assert.equal(later.funded.settlementSignature, evidence.cron.signature);
  assert.notEqual(later.funded.settlementSignature, "chain-closed");
  save();

  await a.getByRole("button", { name: "Claim winner payout", exact: true }).click();
  await a.getByText("Your claim is complete.", { exact: true }).waitFor();
  room = await state(a, code);
  assert.equal(room.funded.chainStatus, "paid");
  assert.equal((await getAccount(connection, vault, "finalized")).amount, 0n);
  const afterClaim = await tokenAmount(players[0].publicKey, mint);
  evidence.claim = {
    winnerDelta: (afterClaim - before[0]).toString(),
    vaultAfter: "0",
    loserDelta: ((await tokenAmount(players[1].publicKey, mint)) - before[1]).toString(),
  };
  assert.equal(evidence.claim.winnerDelta, "1000000");
  assert.equal(evidence.claim.loserDelta, "-1000000");

  // Duplicate claim should transfer nothing further.
  await a.reload();
  assert.equal(await a.getByRole("button", { name: "Claim winner payout", exact: true }).count(), 0);
  const afterDup = await tokenAmount(players[0].publicKey, mint);
  evidence.claim.duplicateDelta = (afterDup - afterClaim).toString();
  assert.equal(evidence.claim.duplicateDelta, "0");

  evidence.balancesAfter = await Promise.all(players.map(async (p, i) => ({
    wallet: p.publicKey.toBase58(),
    test: (await tokenAmount(p.publicKey, mint)).toString(),
  })));
  evidence.pause.finalProbe = await waitPaused(true);
  evidence.errors = errors;
  assert.deepEqual(errors, []);
  evidence.passed = true;
  evidence.finishedAt = new Date().toISOString();
  save();
  console.log(JSON.stringify({ passed: true, code, cron: evidence.cron.signature, pauseRestored: evidence.pause.finalProbe.paused }, null, 2));
} catch (error) {
  evidence.error = error instanceof Error ? error.message : String(error);
  evidence.finishedAt = new Date().toISOString();
  save();
  // Always attempt to restore pause on failure after an unpause.
  try {
    evidence.pause.failureRestore = wranglerSecretPut("1");
    evidence.pause.failureProbe = await waitPaused(true, 180000);
  } catch (restoreError) {
    evidence.pause.failureRestoreError = restoreError instanceof Error ? restoreError.message : String(restoreError);
  }
  save();
  throw error;
} finally {
  await Promise.all(contexts.map((context) => context.close()));
  await browser.close();
  save();
}
