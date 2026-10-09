import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";
import { getAccount, getAssociatedTokenAddressSync } from "@solana/spl-token";

const origin = process.env.QA_ORIGIN ?? "https://soldoku.com/";
const rpc = process.env.SUDOKU_COMPETITION_RPC_PUBLIC ?? "https://api.devnet.solana.com";
const out = process.env.SUDOKU_SCHEDULED_OUT ?? "docs/evidence/2026-10-09-scheduled-devnet";
const configPath = "wrangler.soldoku.jsonc";
const refundOnly = process.argv.includes("--refund-only");
const skipRefund = process.argv.includes("--skip-refund");
mkdirSync(out, { recursive: true });

const load = (file) => Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(join(homedir(), ".config", "solana", file), "utf8"))));
const players = [load("sudoku-dev.json"), load("sudoku-player-b.json")];
const connection = new Connection(rpc, {
  commitment: "finalized",
  fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(20000) }),
});
assert.equal(await connection.getGenesisHash(), "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG");

const evidence = {
  announcedAt: new Date().toISOString(),
  announcement: "Brief Devnet funding window for a controlled two-wallet scheduled settlement round on soldoku.com. Pause restores immediately after controlled deposits finalize. Gameplay, cron settlement, claims, and refunds continue while paused.",
  origin,
  cluster: "devnet",
  mode: refundOnly ? "refund" : "winner+optional-refund",
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
  return { status: result.status, stdout: (result.stdout ?? "").slice(0, 800), stderr: (result.stderr ?? "").slice(0, 800) };
}

async function api(path, body) {
  const response = await fetch(new URL(`api/competitions${path}`, origin), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { error: text }; }
  return { status: response.status, body: json };
}

async function waitPaused(expectedPaused, limitMs = 180000) {
  const deadline = Date.now() + limitMs;
  while (Date.now() < deadline) {
    const probe = await api("/create", { mode: "tokens", stakeUnits: "1000000", level: "easy", durationMs: 180000 });
    const paused = /paused/i.test(String(probe.body.error ?? ""));
    if (paused === expectedPaused) return { paused, status: probe.status, error: probe.body.error ?? null };
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error(`Pause probe did not reach expectedPaused=${expectedPaused}`);
}

async function authorize(keypair) {
  const wallet = keypair.publicKey.toBase58();
  const proof = await api("/proof", { wallet });
  assert.equal(proof.status, 200, JSON.stringify(proof.body));
  const signature = bs58.encode(nacl.sign.detached(new TextEncoder().encode(proof.body.message), keypair.secretKey));
  const auth = await api("/authorize", { id: proof.body.id, signature });
  assert.equal(auth.status, 200, JSON.stringify(auth.body));
  return { actor: auth.body.actor, wallet };
}

async function createFundedRoom(actor, name, durationMs = 60000) {
  const deadline = Date.now() + 180000;
  let last = null;
  while (Date.now() < deadline) {
    const gate = await api("/check", { actor });
    assert.equal(gate.status, 200, JSON.stringify(gate.body));
    const verified = await api("/check/verify", { actor, id: gate.body.id, value: gate.body.target });
    assert.equal(verified.status, 200, JSON.stringify(verified.body));
    assert.equal(verified.body.ok, true);
    const created = await api("/create", {
      actor,
      gateId: gate.body.id,
      mode: "tokens",
      mint: evidence.config.mint,
      stakeUnits: "1000000",
      level: "easy",
      durationMs,
      name,
    });
    last = created;
    if (created.status === 200) return created.body;
    if (/paused/i.test(String(created.body.error ?? ""))) {
      await new Promise((r) => setTimeout(r, 3000));
      continue;
    }
    break;
  }
  assert.equal(last?.status, 200, JSON.stringify(last?.body));
  return last.body;
}

async function relay(action, code, actor, keypair, durationMs) {
  const prepared = await api("/transaction", { code, actor, action, ...(durationMs ? { durationMs } : {}) });
  assert.equal(prepared.status, 200, JSON.stringify(prepared.body));
  const tx = Transaction.from(Buffer.from(prepared.body.transaction, "base64"));
  assert.equal(tx.feePayer.toBase58(), keypair.publicKey.toBase58());
  tx.partialSign(keypair);
  const signed = tx.serialize().toString("base64");
  const submitted = await api("/submit", { code, actor, action, transaction: signed });
  assert.equal(submitted.status, 200, JSON.stringify(submitted.body));
  const signature = submitted.body.signature;
  evidence.transactions.push({
    wallet: keypair.publicKey.toBase58(),
    signature,
    action,
    explorer: `https://explorer.solana.com/tx/${signature}?cluster=devnet`,
    at: new Date().toISOString(),
  });
  save();
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    const status = (await connection.getSignatureStatuses([signature], { searchTransactionHistory: true })).value[0];
    if (status?.err) throw new Error(`${action} failed: ${JSON.stringify(status.err)}`);
    if (status?.confirmationStatus === "finalized") return signature;
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error(`${action} not finalized: ${signature}`);
}

async function sync(code, actor) {
  const response = await api("/sync", { code, actor });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  return response.body;
}

async function state(code, actor) {
  const response = await api("/state", { code, actor });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  return response.body;
}

async function tokenAmount(owner, mint) {
  try { return (await getAccount(connection, getAssociatedTokenAddressSync(mint, owner), "finalized")).amount; }
  catch { return 0n; }
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

async function playToFinish(code, sessions) {
  for (const session of sessions) {
    let room = await state(code, session.actor);
    while (Date.now() < room.funded.startsAt || room.you?.givens == null) {
      await new Promise((r) => setTimeout(r, 2000));
      room = await sync(code, session.actor);
      if (Date.now() >= room.funded.startsAt && room.you?.givens == null) {
        const started = await api("/start", { code, actor: session.actor });
        assert.equal(started.status, 200, JSON.stringify(started.body));
        room = started.body;
      }
    }
  }
  const first = await state(code, sessions[0].actor);
  const solution = solveGrid(first.you.givens);
  for (let i = 0; i < sessions.length; i++) {
    const session = sessions[i];
    let room = await state(code, session.actor);
    if (room.you?.startedAt == null) {
      const started = await api("/start", { code, actor: session.actor });
      assert.equal(started.status, 200, JSON.stringify(started.body));
      room = started.body;
    }
    while (Date.now() - room.funded.startsAt < 16000) await new Promise((r) => setTimeout(r, 500));
    let board = [...room.you.board];
    let sequence = room.you.sequence;
    const empties = room.you.givens.flatMap((value, index) => value || board[index] === solution[index] ? [] : [index]);
    for (const index of empties) {
      board = [...board];
      board[index] = solution[index];
      sequence += 1;
      let moved;
      for (let attempt = 0; attempt < 5; attempt++) {
        moved = await api("/move", { code, actor: session.actor, sequence, values: board });
        if (moved.status === 200) break;
        if (/one move at a time/i.test(String(moved.body.error ?? ""))) {
          await new Promise((r) => setTimeout(r, 150));
          continue;
        }
        throw new Error(JSON.stringify(moved.body));
      }
      assert.equal(moved.status, 200, JSON.stringify(moved.body));
      room = moved.body;
      await new Promise((r) => setTimeout(r, 130));
    }
    assert.ok(room.you.completedMs != null, `player ${i} did not finish`);
  }
  return state(code, sessions[0].actor);
}

async function waitForCronSettlement(code, actor, endsAt) {
  const waitUntil = endsAt + 15 * 60 * 1000;
  while (Date.now() < waitUntil) {
    const room = await sync(code, actor);
    const settlement = room.funded?.settlement;
    const signature = room.funded?.settlementSignature;
    evidence.cron.poll = {
      at: new Date().toISOString(),
      chainStatus: room.funded?.chainStatus,
      settlementPhase: settlement?.phase ?? null,
      settlementSignature: signature ?? null,
      settlementAlert: room.funded?.settlementAlert ?? null,
      endsAt: room.endsAt,
      now: Date.now(),
    };
    save();
    if (signature && signature !== "chain-closed" && settlement?.phase === "confirmed"
      && (room.funded.chainStatus === "awarded" || room.funded.chainStatus === "paid" || room.funded.chainStatus === "refunding")) {
      evidence.cron.confirmedAt = new Date().toISOString();
      evidence.cron.signature = signature;
      evidence.cron.explorer = `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
      evidence.cron.chainStatus = room.funded.chainStatus;
      return room;
    }
    await new Promise((r) => setTimeout(r, Date.now() < endsAt ? 20000 : 20000));
  }
  throw new Error("Cron did not record a finalized settlement signature within the wait window");
}

try {
  const configResponse = await fetch(new URL("api/competitions/config", origin));
  evidence.config = await configResponse.json();
  assert.equal(evidence.config.enabled, true);
  assert.equal(evidence.config.cluster, "devnet");
  evidence.pause.before = await waitPaused(true);
  save();
  console.log("ANNOUNCE:", evidence.announcement);

  console.log("Opening brief funding window...");
  evidence.pause.unpauseAttempt = wranglerSecretPut("0");
  evidence.pause.afterUnpause = await waitPaused(false);
  assert.equal(evidence.pause.afterUnpause.paused, false);
  save();

  const mint = new PublicKey(evidence.config.mint);
  const before = await Promise.all(players.map((p) => tokenAmount(p.publicKey, mint)));
  evidence.balancesBefore = before.map((amount, i) => ({ wallet: players[i].publicKey.toBase58(), test: amount.toString() }));
  const sessions = [];
  for (const key of players) sessions.push({ ...await authorize(key), key });

  if (!refundOnly) {
    const room = await createFundedRoom(sessions[0].actor, "Scheduled cron settlement 2026-10-09", 60000);
    evidence.code = room.code;
    evidence.funded = {
      id: room.funded.id, program: room.funded.program, mint: room.funded.mint, stakeUnits: room.funded.stakeUnits,
      startsAt: room.funded.startsAt, endsAt: room.endsAt, refundAt: room.funded.refundAt, playMs: room.funded.playMs,
    };
    save();
    await relay("deposit", room.code, sessions[0].actor, sessions[0].key);
    await sync(room.code, sessions[0].actor);
    await relay("deposit", room.code, sessions[1].actor, sessions[1].key);
    let synced = await sync(room.code, sessions[0].actor);
    assert.equal(synced.participants, 2);
    assert.equal(synced.funded.stakeUnits, "1000000");
    evidence.depositsFinalizedAt = new Date().toISOString();
    const id = Buffer.alloc(8);
    id.writeBigUInt64LE(BigInt(synced.funded.id));
    const escrow = PublicKey.findProgramAddressSync([Buffer.from("competition"), id], new PublicKey(evidence.config.program))[0];
    const vault = getAssociatedTokenAddressSync(mint, escrow, true);
    evidence.escrow = escrow.toBase58();
    evidence.vault = vault.toBase58();
    assert.equal((await getAccount(connection, vault, "finalized")).amount, 2_000_000n);
    save();

    console.log("Both deposits finalized. Restoring funding pause immediately...");
    evidence.pause.restoreAttempt = wranglerSecretPut("1");
    evidence.pause.afterRestore = await waitPaused(true);
    assert.equal(evidence.pause.afterRestore.paused, true);
    save();

    const finished = await playToFinish(room.code, sessions);
    assert.equal(finished.leaderboard[0].wallet, players[0].publicKey.toBase58());
    evidence.leaderboard = finished.leaderboard;
    evidence.acceptedResultAt = new Date().toISOString();
    save();
    console.log("Accepted finishes recorded. Waiting for endsAt + Worker cron (no /settle call).");

    const settled = await waitForCronSettlement(room.code, sessions[0].actor, finished.endsAt);
    assert.ok(evidence.cron.signature);
    assert.notEqual(evidence.cron.signature, "chain-closed");
    assert.equal(settled.funded.settlementAlert ?? "", "");
    const settleStatus = (await connection.getSignatureStatuses([evidence.cron.signature], { searchTransactionHistory: true })).value[0];
    evidence.cron.chainConfirmation = settleStatus?.confirmationStatus ?? null;
    evidence.cron.chainErr = settleStatus?.err ?? null;
    assert.equal(settleStatus?.err ?? null, null);
    assert.equal(settleStatus?.confirmationStatus, "finalized");

    console.log("Waiting one more cron interval to confirm signature retention...");
    await new Promise((r) => setTimeout(r, 5 * 60 * 1000 + 20000));
    const later = await sync(room.code, sessions[0].actor);
    evidence.cron.laterPoll = {
      at: new Date().toISOString(),
      settlementSignature: later.funded?.settlementSignature ?? null,
      phase: later.funded?.settlement?.phase ?? null,
      chainStatus: later.funded?.chainStatus ?? null,
      alert: later.funded?.settlementAlert ?? null,
    };
    assert.equal(later.funded.settlementSignature, evidence.cron.signature);
    save();

    const claimSig = await relay("claim", room.code, sessions[0].actor, sessions[0].key);
    evidence.claim = { signature: claimSig };
    const afterPaid = await sync(room.code, sessions[0].actor);
    assert.equal(afterPaid.funded.chainStatus, "paid");
    assert.equal((await getAccount(connection, vault, "finalized")).amount, 0n);
    const afterClaim = await tokenAmount(players[0].publicKey, mint);
    evidence.claim.winnerDelta = (afterClaim - before[0]).toString();
    evidence.claim.loserDelta = ((await tokenAmount(players[1].publicKey, mint)) - before[1]).toString();
    assert.equal(evidence.claim.winnerDelta, "1000000");
    assert.equal(evidence.claim.loserDelta, "-1000000");
    const dup = await api("/transaction", { code: room.code, actor: sessions[0].actor, action: "claim" });
    evidence.claim.duplicateRejected = { status: dup.status, error: dup.body.error ?? null };
    assert.ok(dup.status >= 400, "duplicate claim must not prepare another payout");
    const afterDup = await tokenAmount(players[0].publicKey, mint);
    evidence.claim.duplicateDelta = (afterDup - afterClaim).toString();
    assert.equal(evidence.claim.duplicateDelta, "0");
    save();
  } else {
    console.log("Refund-only mode: opening funding window for a solo refund room...");
  }

  if (!skipRefund) {
    // Solo refund needs a brief open window only when the winner path already restored the pause.
    if (!refundOnly && evidence.pause.afterRestore?.paused) {
      evidence.pause.refundWindow = wranglerSecretPut("0");
      evidence.pause.refundUnpaused = await waitPaused(false);
    }
    const refundBefore = await Promise.all(players.map((p) => tokenAmount(p.publicKey, mint)));
    const refundRoom = await createFundedRoom(sessions[0].actor, "Controlled solo refund 2026-10-09", 60000);
    evidence.refund = { code: refundRoom.code, funded: refundRoom.funded, endsAt: refundRoom.endsAt };
    await relay("deposit", refundRoom.code, sessions[0].actor, sessions[0].key);
    await sync(refundRoom.code, sessions[0].actor);
    evidence.refund.depositsFinalizedAt = new Date().toISOString();
    evidence.pause.refundRestore = wranglerSecretPut("1");
    evidence.pause.afterRefundRestore = await waitPaused(true);
    assert.equal(evidence.pause.afterRefundRestore.paused, true);
    save();

    // Wait until startsAt so solo room can refund (solo after registration close).
    while (Date.now() < refundRoom.funded.startsAt + 5000) await new Promise((r) => setTimeout(r, 2000));
    let refundState = await sync(refundRoom.code, sessions[0].actor);
    // Claim refund when available (solo open past startsAt or refunding).
    const refundDeadline = Date.now() + 10 * 60 * 1000;
    let refundSig = null;
    while (Date.now() < refundDeadline) {
      const prepared = await api("/transaction", { code: refundRoom.code, actor: sessions[0].actor, action: "claim" });
      if (prepared.status === 200) {
        refundSig = await relay("claim", refundRoom.code, sessions[0].actor, sessions[0].key);
        break;
      }
      await sync(refundRoom.code, sessions[0].actor);
      await new Promise((r) => setTimeout(r, 5000));
    }
    assert.ok(refundSig, "solo refund claim did not become available");
    refundState = await sync(refundRoom.code, sessions[0].actor);
    evidence.refund.claimSignature = refundSig;
    evidence.refund.chainStatus = refundState.funded.chainStatus;
    const refundAfter = await tokenAmount(players[0].publicKey, mint);
    evidence.refund.delta = (refundAfter - refundBefore[0]).toString();
    // Deposit then refund should conserve stake for the solo player (delta ~ 0 aside from nothing else).
    assert.equal(evidence.refund.delta, "0");
    const dupRefund = await api("/transaction", { code: refundRoom.code, actor: sessions[0].actor, action: "claim" });
    evidence.refund.duplicateRejected = { status: dupRefund.status, error: dupRefund.body.error ?? null };
    assert.ok(dupRefund.status >= 400);
    save();
  }

  evidence.balancesAfter = await Promise.all(players.map(async (p) => ({
    wallet: p.publicKey.toBase58(),
    test: (await tokenAmount(p.publicKey, mint)).toString(),
  })));
  evidence.pause.finalProbe = await waitPaused(true);
  assert.equal(evidence.pause.finalProbe.paused, true);
  evidence.passed = true;
  evidence.finishedAt = new Date().toISOString();
  save();
  console.log(JSON.stringify({
    passed: true,
    code: evidence.code ?? null,
    refundCode: evidence.refund?.code ?? null,
    cron: evidence.cron.signature ?? null,
    pauseRestored: evidence.pause.finalProbe.paused,
  }, null, 2));
} catch (error) {
  evidence.error = error instanceof Error ? error.message : String(error);
  evidence.finishedAt = new Date().toISOString();
  save();
  try {
    evidence.pause.failureRestore = wranglerSecretPut("1");
    evidence.pause.failureProbe = await waitPaused(true, 180000);
  } catch (restoreError) {
    evidence.pause.failureRestoreError = restoreError instanceof Error ? restoreError.message : String(restoreError);
  }
  save();
  console.error(evidence.error);
  process.exitCode = 1;
}
