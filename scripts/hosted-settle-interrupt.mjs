import { loadOperatorEnv, solanaConfig } from "./operator-env.mjs";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseEnv } from "node:util";
import { getAccount, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";
import bs58 from "bs58";
import nacl from "tweetnacl";
import { chromium } from "playwright";

const base = "https://sudoku.jamesbitarcade.workers.dev/";
const programId = new PublicKey("HUkhJi8p1XXuErpEXkgpfQjwdapigXLECRoQSu3indyS");
const playerA = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(solanaConfig("sudoku-dev.json"), "utf8"))));
const playerB = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(join(homedir(), ".config", "solana", "sudoku-player-b.json"), "utf8"))));
const env = loadOperatorEnv();
const connection = new Connection(env.ARTPORTAL_SOLANA_RPC_URL.trim(), "confirmed");
const mint = new PublicKey(readFileSync(join(homedir(), ".config", "solana", "sudoku-devnet-mint.txt"), "utf8").trim());
const walletA = playerA.publicKey.toBase58();
const walletB = playerB.publicKey.toBase58();

async function post(path, body) {
  const response = await fetch(base + path.replace(/^\//, ""), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`);
  return data;
}

async function get(path) {
  const response = await fetch(base + path.replace(/^\//, ""));
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`);
  return data;
}

async function gate() {
  const issued = await post("api/captcha", {});
  await post("api/captcha/check", { id: issued.id, value: issued.target });
  return issued.id;
}

function tokenOf(owner) {
  return getAssociatedTokenAddressSync(mint, owner);
}

async function balance(owner) {
  return (await getAccount(connection, tokenOf(owner))).amount.toString();
}

async function escrow(matchId) {
  const idBuf = Buffer.alloc(8);
  idBuf.writeBigUInt64LE(BigInt(matchId));
  const [pda] = PublicKey.findProgramAddressSync([Buffer.from("match"), idBuf], programId);
  const info = await connection.getAccountInfo(pda);
  const vault = getAssociatedTokenAddressSync(mint, pda, true);
  const vaultAccount = await getAccount(connection, vault).catch(() => null);
  const signatures = await connection.getSignaturesForAddress(pda, { limit: 12 });
  return {
    pda: pda.toBase58(),
    status: info ? info.data[160] : null,
    outcome: info ? info.data[161] : null,
    vault: vaultAccount ? vaultAccount.amount.toString() : null,
    signatures: signatures.map((item) => item.signature),
  };
}

async function land(signature) {
  const started = Date.now();
  let last = "unknown";
  while (Date.now() - started < 40_000) {
    const value = (await connection.getSignatureStatuses([signature])).value[0];
    last = value?.confirmationStatus ?? (value ? "processed" : "unknown");
    if (value?.err) throw new Error("transaction failed on-chain");
    if (last === "confirmed" || last === "finalized") return last;
    await sleep(400);
  }
  return last;
}

async function deposit(code, playerId, signer) {
  const prepared = await post("api/rooms/prepare", { code, playerId });
  const tx = Transaction.from(Buffer.from(prepared.tx, "base64"));
  tx.partialSign(signer);
  const raw = Buffer.from(tx.serialize()).toString("base64");
  const signature = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false });
  const confirmation = await land(signature);
  const recorded = await post("api/rooms/deposit", { code, playerId, tx: raw });
  const replay = await post("api/rooms/deposit", { code, playerId, tx: raw });
  return { signature, confirmation, recorded: recorded.signature, replay: replay.signature };
}

async function play(code, playerId, givens) {
  const solution = solve(givens);
  const board = givens.slice();
  const empties = [];
  for (let index = 0; index < 81; index++) if (!board[index]) empties.push(index);
  const started = Date.now();
  let view = null;
  for (let cursor = 0; cursor < empties.length; cursor++) {
    const index = empties[cursor];
    if (cursor === empties.length - 1) {
      const wait = 16_000 - (Date.now() - started);
      if (wait > 0) await sleep(wait);
    }
    board[index] = solution[index];
    let placed = false;
    for (let attempt = 0; attempt < 6 && !placed; attempt++) {
      try {
        view = await post("api/rooms/move", { code, playerId, values: board });
        placed = true;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (/slow down|finish was rejected/i.test(message)) {
          await sleep(500);
          continue;
        }
        throw error;
      }
    }
    if (!placed) throw new Error("A move was not accepted");
    if (cursor < empties.length - 1) await sleep(450);
  }
  return view;
}

function solve(grid) {
  const board = grid.slice();
  const fits = (index, digit) => {
    const row = Math.floor(index / 9);
    const column = index % 9;
    for (let cursor = 0; cursor < 9; cursor++) {
      if (board[row * 9 + cursor] === digit || board[cursor * 9 + column] === digit) return false;
    }
    const boxRow = Math.floor(row / 3) * 3;
    const boxColumn = Math.floor(column / 3) * 3;
    for (let y = 0; y < 3; y++) {
      for (let x = 0; x < 3; x++) if (board[(boxRow + y) * 9 + boxColumn + x] === digit) return false;
    }
    return true;
  };
  const fill = (index) => {
    if (index === 81) return true;
    if (board[index]) return fill(index + 1);
    for (let digit = 1; digit <= 9; digit++) {
      if (!fits(index, digit)) continue;
      board[index] = digit;
      if (fill(index + 1)) return true;
      board[index] = 0;
    }
    return false;
  };
  if (!fill(0)) throw new Error("The public puzzle has no solution");
  return board;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sign(keypair, text) {
  return bs58.encode(nacl.sign.detached(new TextEncoder().encode(text), keypair.secretKey));
}

async function history(keypair, code) {
  const at = Date.now();
  const wallet = keypair.publicKey.toBase58();
  const signature = sign(keypair, `sudoku-history:${wallet}:${code}:${Math.floor(at / 1000)}`);
  return post("api/history", { wallet, code, signature, at });
}

async function historyList(keypair) {
  const at = Date.now();
  const wallet = keypair.publicKey.toBase58();
  const signature = sign(keypair, `sudoku-history:${wallet}:${Math.floor(at / 1000)}`);
  return post("api/history", { wallet, signature, at });
}

function deploy() {
  return new Promise((resolve, reject) => {
    const child = spawn("npx", ["wrangler", "deploy"], { shell: true, cwd: process.cwd() });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.on("data", (chunk) => { output += chunk; });
    child.on("exit", (code) => {
      const version = output.match(/Current Version ID: ([0-9a-f-]+)/)?.[1] ?? null;
      if (code !== 0) reject(new Error(`deploy exited ${code}`));
      else resolve(version);
    });
  });
}

const beforeA = await balance(playerA.publicKey);
const beforeB = await balance(playerB.publicKey);
const host = await post("api/rooms", { level: "easy", captchaId: await gate(), wallet: walletA });
const guest = await post("api/rooms/join", { code: host.code, captchaId: await gate(), wallet: walletB });
const depositA = await deposit(host.code, host.playerId, playerA);
const depositB = await deposit(host.code, guest.playerId, playerB);
const afterDeposits = {
  balanceA: await balance(playerA.publicKey),
  balanceB: await balance(playerB.publicKey),
  chain: await escrow(host.matchId),
};
const pendingView = await play(host.code, host.playerId, host.givens);
if (!pendingView?.verdict || pendingView.chain !== "pending") {
  throw new Error("The match did not finish with a pending vault");
}
const beforeDeploy = await get(`api/rooms/funds?code=${host.code}`);
const redeployed = await deploy();
const afterDeploy = await get(`api/rooms/funds?code=${host.code}`);
const chainAfterDeploy = await escrow(host.matchId);

let releaseState = () => {};
const stateGate = new Promise((resolve) => { releaseState = resolve; });
let servedPending = false;
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
await page.route("**/api/rooms/state**", async (route) => {
  if (!servedPending) {
    servedPending = true;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(pendingView) });
    return;
  }
  await stateGate;
  await route.continue();
});
await page.addInitScript(({ code, playerId }) => {
  localStorage.setItem("sudoku.seat", JSON.stringify({ code, playerId }));
}, { code: host.code, playerId: host.playerId });
await page.goto(base, { waitUntil: "domcontentloaded" });
await page.getByText("Waiting for the vault payment to confirm.").waitFor({ timeout: 20_000 });
const waitingText = await page.locator(".sheet").innerText();
const baseline = new Set(chainAfterDeploy.signatures);
const observations = [];
let stopWatch = false;
const watch = (async () => {
  while (!stopWatch) {
    const chain = await escrow(host.matchId);
    const fresh = chain.signatures.filter((item) => !baseline.has(item));
    if (fresh.length > 0) {
      const value = (await connection.getSignatureStatuses(fresh)).value;
      observations.push({
        escrowStatus: chain.status,
        signatures: fresh,
        confirmation: value.map((item) => item?.confirmationStatus ?? "unknown"),
      });
    }
    await sleep(400);
  }
})();
releaseState();
let retainedWhilePending = null;
for (let attempt = 0; attempt < 30 && !retainedWhilePending; attempt++) {
  const funds = await get(`api/rooms/funds?code=${host.code}`);
  if (!funds.settleSignature) {
    await sleep(300);
    continue;
  }
  const chain = await escrow(host.matchId);
  const value = (await connection.getSignatureStatuses([funds.settleSignature])).value[0];
  retainedWhilePending = {
    settleSignature: funds.settleSignature,
    fundsChain: funds.chain,
    escrowStatus: chain.status,
    confirmation: value?.confirmationStatus ?? "unknown",
  };
  if (funds.chain === "pending") break;
}
await page.getByText("The vault payment is confirmed on-chain.").waitFor({ timeout: 90_000 });
const confirmedText = await page.locator(".sheet").innerText();
stopWatch = true;
await watch.catch(() => undefined);
const afterUi = {
  balanceA: await balance(playerA.publicKey),
  balanceB: await balance(playerB.publicKey),
  chain: await escrow(host.matchId),
  funds: await get(`api/rooms/funds?code=${host.code}`),
  state: await get(`api/rooms/state?code=${host.code}&playerId=${host.playerId}`),
};
const repeated = await get(`api/rooms/state?code=${host.code}&playerId=${host.playerId}`);
const afterRepeat = await escrow(host.matchId);
await page.reload({ waitUntil: "domcontentloaded" });
await page.getByText("The vault payment is confirmed on-chain.").waitFor({ timeout: 30_000 });
const afterReload = await escrow(host.matchId);
await browser.close();

const savedA = await history(playerA, host.code);
const savedAgain = await history(playerA, host.code);
const listedA = await historyList(playerA);
const listedB = await historyList(playerB);
let unsignedStatus = 0;
const unsigned = await fetch(base + "api/history", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ wallet: walletA, code: host.code, signature: "aaaa", at: Date.now() }),
});
unsignedStatus = unsigned.status;
const crossedAt = Date.now();
const crossed = await fetch(base + "api/history", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    wallet: walletA,
    signature: sign(playerB, `sudoku-history:${walletA}:${Math.floor(crossedAt / 1000)}`),
    at: crossedAt,
  }),
});

const practiceHost = await post("api/rooms", { level: "easy", captchaId: await gate(), wallet: walletA, practice: true });
const practiceGuest = await post("api/rooms/join", { code: practiceHost.code, captchaId: await gate(), wallet: walletB });
const practiceView = await play(practiceHost.code, practiceHost.playerId, practiceHost.givens);
const practiceSaved = await history(playerA, practiceHost.code);
const practiceList = await historyList(playerA);
const practiceOther = await historyList(playerB);
const guestOnly = await post("api/rooms", { level: "easy", captchaId: await gate(), practice: true });
const guestJoin = await post("api/rooms/join", { code: guestOnly.code, captchaId: await gate() });
const guestView = await play(guestOnly.code, guestOnly.playerId, guestOnly.givens);
const guestAt = Date.now();
const guestClaim = await fetch(base + "api/history", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    wallet: walletA,
    code: guestOnly.code,
    signature: sign(playerA, `sudoku-history:${walletA}:${guestOnly.code}:${Math.floor(guestAt / 1000)}`),
    at: guestAt,
  }),
});
const guestBody = await guestClaim.json();

const historySession = await new Promise((resolve, reject) => {
  const child = spawn(process.execPath, ["scripts/history-session.mjs", host.code, practiceHost.code], { shell: false });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });
  child.on("exit", (code) => {
    if (code !== 0) reject(new Error(output.slice(0, 400)));
    else resolve(JSON.parse(output));
  });
});

console.log(JSON.stringify({
  kind: "live-devnet-settlement",
  code: host.code,
  matchId: host.matchId,
  playerA: walletA,
  playerB: walletB,
  guestJoined: guest.opponent?.joined === true,
  beforeA,
  beforeB,
  depositA,
  depositB,
  afterDeposits: {
    balanceA: afterDeposits.balanceA,
    balanceB: afterDeposits.balanceB,
    status: afterDeposits.chain.status,
    vault: afterDeposits.chain.vault,
    signatures: afterDeposits.chain.signatures.length,
  },
  pendingVerdict: pendingView.verdict?.outcome ?? null,
  pendingChain: pendingView.chain,
  beforeDeployChain: beforeDeploy.chain,
  beforeDeployStatus: beforeDeploy.status,
  redeployed,
  afterDeployChain: afterDeploy.chain,
  afterDeployStatus: afterDeploy.status,
  afterDeploySettleSignature: afterDeploy.settleSignature,
  chainStatusAfterDeploy: chainAfterDeploy.status,
  uiHold: "The first state response was the server's real pending verdict, held in the test browser. Later state requests were live.",
  waitingText,
  retainedWhilePending,
  observations,
  confirmedText,
  afterUi: {
    balanceA: afterUi.balanceA,
    balanceB: afterUi.balanceB,
    status: afterUi.chain.status,
    outcome: afterUi.chain.outcome,
    vault: afterUi.chain.vault,
    signatures: afterUi.chain.signatures,
    fundsChain: afterUi.funds.chain,
    settleSignature: afterUi.funds.settleSignature,
    stateChain: afterUi.state.chain,
    youWon: afterUi.state.youWon,
  },
  repeatedChain: repeated.chain,
  signaturesAfterRepeat: afterRepeat.signatures,
  signaturesAfterReload: afterReload.signatures,
  historyA: savedA.summary,
  historyDuplicateCodes: savedAgain.recent.filter((item) => item.code === host.code).length,
  listedA: listedA.recent.filter((item) => item.code === host.code),
  listedBHasAOnlyRow: listedB.recent.some((item) => item.code === host.code && item.outcome === savedA.summary.outcome && savedA.summary.outcome !== "draw"),
  unsignedStatus,
  crossedStatus: crossed.status,
  practice: {
    code: practiceHost.code,
    staked: practiceHost.staked,
    guestJoined: practiceGuest.opponent?.joined === true,
    verdict: practiceView?.verdict?.outcome ?? null,
    chain: practiceView?.chain ?? null,
    saved: practiceSaved.summary,
    listed: practiceList.recent.filter((item) => item.code === practiceHost.code).length,
    otherWalletSeesIt: practiceOther.recent.some((item) => item.code === practiceHost.code),
  },
  guestPractice: {
    code: guestOnly.code,
    verdict: guestView?.verdict?.outcome ?? null,
    claimStatus: guestClaim.status,
    claimError: guestBody.error ?? null,
    guestJoined: guestJoin.opponent?.joined === true,
  },
  historySession,
}, null, 2));
