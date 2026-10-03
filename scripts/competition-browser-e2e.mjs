import assert from "node:assert/strict";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
import nacl from "tweetnacl";
import { Connection, Keypair, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { getAccount, getAssociatedTokenAddressSync } from "@solana/spl-token";

const origin = process.env.QA_ORIGIN ?? "http://127.0.0.1:5178/";
const rpc = process.env.SUDOKU_COMPETITION_E2E_RPC ?? "http://127.0.0.1:18999";
const live = process.env.SUDOKU_COMPETITION_DEVNET_E2E === "1";
const paths = process.env.SUDOKU_COMPETITION_E2E_WALLETS ? JSON.parse(process.env.SUDOKU_COMPETITION_E2E_WALLETS)
  : [0, 1, 2].map(index => `output/competition-validator/player-${index}.local.json`);
assert.equal(paths.length, 3, "Exactly three distinct test-wallet paths are required");
const players = paths.map(path => Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(path, "utf8")))));
assert.equal(new Set(players.map(player => player.publicKey.toBase58())).size, 3);
const connection = new Connection(rpc, "finalized");
const genesis = await connection.getGenesisHash();
const devnetGenesis = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";
assert.ok(live ? genesis === devnetGenesis : ![devnetGenesis, "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d", "4uhcVJyU9pJkvQyS88uRDiswHXSCkY3zQawwpjk2NsNY"].includes(genesis), "E2E cluster mismatch");
const out = process.env.SUDOKU_COMPETITION_E2E_OUTPUT ?? (live ? "output/competition-devnet-e2e" : "output/competition-browser-e2e");
mkdirSync(out, { recursive: true });
const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {});
const contexts = []; const errors = []; const transactions = []; const result = { cluster: live ? "devnet" : "localnet", startedAt: new Date().toISOString(), passed: false, transactions };
async function client(key, index, url = origin) {
  const context = await browser.newContext({ viewport: { width: index === 0 ? 390 : 1280, height: 900 } }); contexts.push(context);
  await context.exposeBinding("competitionSignMessage", (_, bytes) => Array.from(nacl.sign.detached(Uint8Array.from(bytes), key.secretKey)));
  await context.exposeBinding("competitionSignTransaction", (_, bytes) => {
    const tx = Transaction.from(Buffer.from(bytes));
    assert.equal(tx.feePayer.toBase58(), key.publicKey.toBase58());
    tx.partialSign(key); return Array.from(tx.serialize());
  });
  await context.addInitScript(({ wallet, publicKey, cluster }) => {
    const account = { address: wallet, publicKey: Uint8Array.from(publicKey), chains: [`solana:${cluster}`], features: ["solana:signMessage", "solana:signTransaction"] };
    const walletAdapter = { version: "1.0.0", name: "Competition E2E Wallet", icon: "data:image/png;base64,", chains: account.chains, accounts: [], features: {
      "standard:connect": { version: "1.0.0", connect: async () => ({ accounts: [account] }) },
      "standard:disconnect": { version: "1.0.0", disconnect: async () => undefined },
      "solana:signMessage": { version: "1.0.0", signMessage: async ({ message }) => [{ signature: Uint8Array.from(await window.competitionSignMessage(Array.from(message))) }] },
      "solana:signTransaction": { version: "1.0.0", signTransaction: async ({ transaction, chain }) => {
        if (chain !== `solana:${cluster}`) throw new Error("Browser requested the wrong network");
        return [{ signedTransaction: Uint8Array.from(await window.competitionSignTransaction(Array.from(transaction))) }];
      } },
    } };
    window.addEventListener("wallet-standard:app-ready", event => event.detail.register(walletAdapter));
  }, { wallet: key.publicKey.toBase58(), publicKey: Array.from(key.publicKey.toBytes()), cluster: live ? "devnet" : "localnet" });
  const page = await context.newPage(); page.setDefaultTimeout(300000);
  page.on("pageerror", error => errors.push(error.message));
  page.on("response", async response => {
    if (/\/api\/competitions\/(submit|settle)$/.test(response.url()) && response.ok()) {
      const body = await response.json(); if (body.signature) transactions.push({ wallet: key.publicKey.toBase58(), signature: body.signature,
        action: response.url().endsWith("settle") ? "settle" : "wallet-transaction", ...(live ? { explorer: `https://explorer.solana.com/tx/${body.signature}?cluster=devnet` } : {}) });
    }
  });
  await page.goto(url); return page;
}
async function wallet(page) {
  const dialog = page.getByRole("dialog", { name: "Connect wallet", exact: true });
  await dialog.waitFor(); await dialog.getByRole("button", { name: /^Competition E2E Wallet/ }).click(); await dialog.waitFor({ state: "hidden" });
}
async function state(page, code) {
  return page.evaluate(async code => {
    const session = JSON.parse(localStorage.getItem("sudoku.competitionSession"));
    return (await fetch("/api/competitions/state", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code, actor: session.actor }) })).json();
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
      for (let j = 0; j < 9; j++) if (values[row * 9 + j] === digit || values[j * 9 + col] === digit || values[(Math.floor(row / 3) * 3 + Math.floor(j / 3)) * 9 + Math.floor(col / 3) * 3 + j % 3] === digit) valid = false;
      if (valid) { values[index] = digit; if (solve(index + 1)) return true; }
    }
    values[index] = 0; return false;
  }
  assert.ok(solve()); return values;
}
try {
  const configResponse = await fetch(new URL("api/competitions/config", origin)); const config = await configResponse.json();
  assert.equal(config.enabled, true, config.reason); assert.equal(config.cluster, live ? "devnet" : "localnet");
  assert.ok(config.playMs >= 180000, "Browser E2E requires at least three minutes of play time");
  result.program = config.program; result.mint = config.mint;
  if (live) {
    const programAccount = await connection.getAccountInfo(new PublicKey(config.program));
    assert.equal(programAccount?.owner.toBase58(), "BPFLoaderUpgradeab1e11111111111111111111111");
    assert.equal(programAccount.data.readUInt32LE(0), 2);
    const deployed = await connection.getAccountInfo(new PublicKey(programAccount.data.subarray(4, 36)));
    const local = readFileSync("programs/competition-escrow/target/deploy/competition_escrow.so");
    assert.ok(deployed.data.subarray(45, 45 + local.length).equals(local), "Live program differs from the current compiled artifact");
    result.programSHA256 = createHash("sha256").update(local).digest("hex");
  }
  const mint = new PublicKey(config.mint);
  const tokenAccounts = players.map(player => getAssociatedTokenAddressSync(mint, player.publicKey));
  const before = await Promise.all(tokenAccounts.map(async address => (await getAccount(connection, address, "finalized")).amount));
  const recover = process.env.SUDOKU_COMPETITION_E2E_RECOVER;
  if (recover) {
    assert.match(recover, /^[A-F0-9]{8}$/);
    const recoveryUrl = new URL(origin); recoveryUrl.searchParams.set("room", recover);
    const a = await client(players[0], 0, recoveryUrl.href);
    await a.getByRole("button", { name: "Check my deposited entry", exact: true }).click(); await wallet(a);
    await a.getByRole("button", { name: "Claim stake refund", exact: true }).waitFor();
    const room = await state(a, recover); assert.equal(room.participants, 1); assert.equal(room.you.owner, true);
    const id = Buffer.alloc(8); id.writeBigUInt64LE(BigInt(room.funded.id));
    const escrow = PublicKey.findProgramAddressSync([Buffer.from("competition"), id], new PublicKey(config.program))[0];
    const vault = getAssociatedTokenAddressSync(mint, escrow, true);
    assert.equal((await getAccount(connection, vault)).amount, BigInt(room.funded.stakeUnits));
    await a.getByRole("button", { name: "Claim stake refund", exact: true }).click();
    await a.getByText("Your claim is complete.", { exact: true }).waitFor();
    assert.equal((await getAccount(connection, vault)).amount, 0n);
    assert.equal((await getAccount(connection, tokenAccounts[0])).amount, before[0] + BigInt(room.funded.stakeUnits));
    assert.equal(transactions.length, 1);
    const status = (await connection.getSignatureStatuses([transactions[0].signature], { searchTransactionHistory: true })).value[0];
    assert.equal(status?.err, null); assert.equal(status?.confirmationStatus, "finalized");
    await a.reload(); await a.getByText("Your claim is complete.", { exact: true }).waitFor();
    assert.equal(await a.getByRole("button", { name: "Claim stake refund", exact: true }).count(), 0);
    await a.screenshot({ path: `${out}/recovered-refund.png`, fullPage: true });
    result.passed = true; result.code = recover; result.escrow = escrow.toBase58(); result.recovery = true;
    assert.deepEqual(errors, []);
    console.log(`PASS: ${result.cluster} browser reconnect → recovered entry → real refund; repeat claim unavailable after reload.`);
  } else {
  const a = await client(players[0], 0);
  await a.getByRole("button", { name: /^LEADERBOARD Compete/i }).click();
  await a.getByRole("group", { name: "Competition navigation" }).getByRole("button", { name: "Create competition", exact: true }).click();
  await a.getByRole("textbox", { name: "Room name", exact: true }).fill(`Three-wallet ${live ? "Devnet" : "local"} proof`);
  await a.getByRole("button", { name: "Easy", exact: true }).click();
  await a.getByRole("button", { name: "For tokens", exact: true }).click();
  await a.getByRole("textbox", { name: "TEST stake", exact: true }).fill("1");
  await a.getByRole("button", { name: "Custom Duration", exact: true }).click();
  await a.getByRole("combobox", { name: "Duration unit", exact: true }).selectOption("60000");
  await a.getByRole("spinbutton", { name: "Custom duration", exact: true }).fill("3");
  await a.getByRole("button", { name: "Create room", exact: true }).click(); await wallet(a);
  const gate = a.getByRole("dialog", { name: "Quick check before creating", exact: true }); await gate.waitFor();
  const target = await gate.locator(".slider-target").evaluate(element => Number(element.style.getPropertyValue("--target")));
  await gate.getByRole("slider").fill(String(Math.round(target * 100)));
  await gate.getByRole("button", { name: "Verify position", exact: true }).click();
  await gate.getByRole("button", { name: "Confirm create room", exact: true }).click();
  const roomElement = a.locator("[data-room-code]"); await roomElement.waitFor(); const code = await roomElement.getAttribute("data-room-code"); result.code = code;
  const shared = await a.getByRole("link", { name: "Shareable room link", exact: true }).getAttribute("href"); result.url = shared;
  assert.equal(new URL(shared).searchParams.get("room"), code);
  if (process.env.SUDOKU_COMPETITION_E2E_PREFUND === "1") {
    const intent = await state(a, code); const id = Buffer.alloc(8); id.writeBigUInt64LE(BigInt(intent.funded.id));
    const room = PublicKey.findProgramAddressSync([Buffer.from("competition"), id], new PublicKey(config.program))[0];
    const entry = PublicKey.findProgramAddressSync([Buffer.from("entry"), room.toBuffer(), players[1].publicKey.toBuffer()], new PublicKey(config.program))[0];
    const latest = await connection.getLatestBlockhash("finalized");
    const tx = new Transaction({ feePayer: players[2].publicKey, recentBlockhash: latest.blockhash }).add(
      SystemProgram.transfer({ fromPubkey: players[2].publicKey, toPubkey: room, lamports: 1_000_000 }),
      SystemProgram.transfer({ fromPubkey: players[2].publicKey, toPubkey: entry, lamports: 1_000_000 }));
    tx.sign(players[2]);
    const signature = await connection.sendRawTransaction(tx.serialize(), { preflightCommitment: "finalized" });
    result.prefundingTransactions = [{ signature, room: room.toBase58(), entry: entry.toBase58(), ...(live ? { explorer: `https://explorer.solana.com/tx/${signature}?cluster=devnet` } : {}) }];
    const limit = Date.now() + 60000;
    while (true) {
      const status = (await connection.getSignatureStatuses([signature], { searchTransactionHistory: true })).value[0];
      assert.equal(status?.err ?? null, null);
      if (status?.confirmationStatus === "finalized") break;
      if (Date.now() >= limit) throw new Error(`Inspect pending pre-funding transaction ${signature} before retrying.`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    for (const address of [room, entry]) {
      const account = await connection.getAccountInfo(address); assert.equal(account.owner.toBase58(), SystemProgram.programId.toBase58()); assert.equal(account.data.length, 0);
    }
    assert.equal((await state(a, code)).participants, 0);
    console.log("PASS: third-party SOL pre-funding is finalized without admitting any player.");
  }
  await a.getByRole("button", { name: "Deposit 1 TEST to join", exact: true }).click();
  await a.getByText("Your stake is confirmed in escrow.", { exact: true }).waitFor();
  const pages = [a];
  for (let index = 1; index < 3; index++) {
    const page = await client(players[index], index, shared); pages.push(page);
    await page.getByRole("button", { name: "Deposit 1 TEST to join", exact: true }).click(); await wallet(page);
    await page.getByText("Your stake is confirmed in escrow.", { exact: true }).waitFor();
  }
  let room = await state(a, code); assert.equal(room.participants, 3); assert.equal(room.you.givens, null);
  const id = Buffer.alloc(8); id.writeBigUInt64LE(BigInt(room.funded.id));
  const escrow = PublicKey.findProgramAddressSync([Buffer.from("competition"), id], new PublicKey(config.program))[0];
  const vault = getAssociatedTokenAddressSync(mint, escrow, true); result.escrow = escrow.toBase58();
  assert.equal((await getAccount(connection, vault)).amount, 3_000_000n);
  for (let index = 0; index < 3; index++) assert.equal((await getAccount(connection, tokenAccounts[index])).amount, before[index] - 1_000_000n);
  console.log("PASS: three independent browser wallets deposited real SPL tokens; shared grid remains hidden.");
  await a.screenshot({ path: `${out}/three-deposits.png`, fullPage: true });
  console.log(`Waiting for common competition start at ${new Date(room.funded.startsAt).toISOString()}`);
  for (const page of pages) await page.getByRole("button", { name: "Start challenge", exact: true }).waitFor({ state: "visible" });
  const started = [];
  for (const page of pages) {
    console.log(`Starting browser attempt for wallet ${players[pages.indexOf(page)].publicKey.toBase58()}`);
    await page.getByRole("button", { name: "Start challenge", exact: true }).click();
    await page.getByRole("gridcell").first().waitFor({ timeout: 45000 }); started.push(await state(page, code));
  }
  assert.deepEqual(started.map(item => item.you.startedAt), [room.funded.startsAt, room.funded.startsAt, room.funded.startsAt]);
  assert.deepEqual(started[0].you.givens, started[1].you.givens); assert.deepEqual(started[1].you.givens, started[2].you.givens);
  const solution = solveGrid(started[0].you.givens); const firstEmpty = solution.findIndex((_, index) => !started[0].you.givens[index]);
  await a.getByRole("gridcell").nth(firstEmpty).click(); await a.locator(".pad button").nth(solution[firstEmpty] - 1).click();
  await a.getByRole("gridcell").nth(firstEmpty).filter({ hasText: String(solution[firstEmpty]) }).waitFor();
  await a.reload(); await a.getByRole("button", { name: "Continue challenge", exact: true }).click();
  await a.getByRole("gridcell").first().waitFor();
  assert.equal((await state(a, code)).you.startedAt, room.funded.startsAt);
  assert.equal((await state(a, code)).you.board[firstEmpty], solution[firstEmpty]);
  // All three players finish through visible controls; intentionally staggered finish order.
  for (let playerIndex = 0; playerIndex < 3; playerIndex++) {
    const page = pages[playerIndex]; const current = await state(page, code);
    const empty = current.you.givens.flatMap((value, index) => value || current.you.board[index] === solution[index] ? [] : [index]);
    while (Date.now() - room.funded.startsAt < 16000) await new Promise(resolve => setTimeout(resolve, 500));
    for (const index of empty) {
      await page.getByRole("gridcell").nth(index).click(); await page.locator(".pad button").nth(solution[index] - 1).click();
      if (index !== empty.at(-1)) await page.getByRole("gridcell").nth(index).filter({ hasText: String(solution[index]) }).waitFor();
      await page.waitForTimeout(150);
    }
    await page.getByText(/Finished in .*rank/).waitFor();
  }
  room = await state(a, code); assert.equal(room.leaderboard.length, 3); assert.equal(room.leaderboard[0].wallet, players[0].publicKey.toBase58());
  await a.screenshot({ path: `${out}/leaderboard.png`, fullPage: true });
  console.log("PASS: common grid/time, refresh recovery, three accepted finishes and correct ranking.");
  console.log(`Waiting for settlement deadline ${new Date(room.endsAt).toISOString()}`);
  await a.getByRole("button", { name: "Finalize result", exact: true }).waitFor({ state: "visible", timeout: Math.max(300000, room.endsAt - Date.now() + 180000) });
  await a.getByRole("button", { name: "Finalize result", exact: true }).click();
  await a.getByRole("button", { name: "Claim winner payout", exact: true }).waitFor({ state: "visible" });
  await a.getByRole("button", { name: "Claim winner payout", exact: true }).click();
  await a.getByText("Your claim is complete.", { exact: true }).waitFor();
  room = await state(a, code); assert.equal(room.funded.chainStatus, "paid");
  assert.equal((await getAccount(connection, vault)).amount, 0n);
  assert.equal((await getAccount(connection, tokenAccounts[0])).amount, before[0] + 2_000_000n);
  for (let index = 1; index < 3; index++) assert.equal((await getAccount(connection, tokenAccounts[index])).amount, before[index] - 1_000_000n);
  assert.equal(await a.getByRole("button", { name: "Start challenge", exact: true }).count(), 0);
  assert.equal(await a.getByRole("button", { name: "Claim winner payout", exact: true }).count(), 0);
  for (const tx of transactions) {
    const status = (await connection.getSignatureStatuses([tx.signature], { searchTransactionHistory: true })).value[0];
    assert.equal(status?.err, null); assert.equal(status?.confirmationStatus, "finalized");
  }
  assert.equal(transactions.length, 5, "Expected three deposits, one settlement and one winner claim");
  assert.deepEqual(errors, []);
  await a.screenshot({ path: `${out}/winner-paid.png`, fullPage: true });
  result.passed = true; result.leaderboard = room.leaderboard; result.tokenBalances = await Promise.all(tokenAccounts.map(async address => (await getAccount(connection, address)).amount.toString()));
  console.log(`PASS: ${result.cluster} browser stake → compete → leaderboard → payout; five finalized transactions.`);
  }
} catch (error) {
  result.error = error.message;
  for (let index = 0; index < contexts.length; index++) {
    const page = contexts[index].pages()[0]; if (page) await page.screenshot({ path: `${out}/failure-${index}.png`, fullPage: true }).catch(() => {});
  }
  throw error;
} finally {
  result.finishedAt = new Date().toISOString(); writeFileSync(`${out}/results.json`, JSON.stringify(result, null, 2));
  await Promise.all(contexts.map(context => context.close())); await browser.close();
}
