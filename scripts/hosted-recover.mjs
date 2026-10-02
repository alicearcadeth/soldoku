import { loadOperatorEnv, solanaConfig } from "./operator-env.mjs";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseEnv } from "node:util";
import { Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";
import { getAccount, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { chromium } from "playwright";

const base = "https://sudoku.jamesbitarcade.workers.dev/";
const programId = new PublicKey("HUkhJi8p1XXuErpEXkgpfQjwdapigXLECRoQSu3indyS");
const playerA = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(solanaConfig("sudoku-dev.json"), "utf8"))));
const playerB = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(join(homedir(), ".config", "solana", "sudoku-player-b.json"), "utf8"))));
const env = loadOperatorEnv();
const connection = new Connection(env.ARTPORTAL_SOLANA_RPC_URL.trim(), "confirmed");
const mint = new PublicKey(readFileSync(join(homedir(), ".config", "solana", "sudoku-devnet-mint.txt"), "utf8").trim());

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
  const signatures = await connection.getSignaturesForAddress(pda, { limit: 8 });
  return {
    pda: pda.toBase58(),
    status: info ? info.data[160] : null,
    outcome: info ? info.data[161] : null,
    vault: vaultAccount ? vaultAccount.amount.toString() : null,
    signatures: signatures.map((item) => item.signature),
  };
}

const beforeA = await balance(playerA.publicKey);
const beforeB = await balance(playerB.publicKey);
const host = await post("api/rooms", { level: "easy", captchaId: await gate(), wallet: playerA.publicKey.toBase58() });
const guest = await post("api/rooms/join", { code: host.code, captchaId: await gate(), wallet: playerB.publicKey.toBase58() });
const prepared = await post("api/rooms/prepare", { code: host.code, playerId: host.playerId });
const tx = Transaction.from(Buffer.from(prepared.tx, "base64"));
tx.partialSign(playerA);
const raw = Buffer.from(tx.serialize()).toString("base64");
const submitted = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false });
await connection.confirmTransaction(submitted, "confirmed");
const chainBeforeApp = await escrow(host.matchId);
const d1BeforeApp = await fetch(`${base}api/rooms/state?code=${host.code}&playerId=${host.playerId}`).then((response) => response.json());

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
await page.goto(base, { waitUntil: "domcontentloaded" });
await page.evaluate(({ code, playerId, tx }) => {
  localStorage.setItem("sudoku.seat", JSON.stringify({ code, playerId }));
  localStorage.setItem("sudoku.pending", JSON.stringify({ code, playerId, tx }));
}, { code: host.code, playerId: host.playerId, tx: raw });
await page.reload({ waitUntil: "domcontentloaded" });
await page.getByText("Waiting for the other deposit").waitFor({ timeout: 40_000 });
const ui = await page.locator("main").innerText();
await browser.close();

const recovered = await post("api/rooms/deposit", { code: host.code, playerId: host.playerId, tx: raw });
const again = await post("api/rooms/deposit", { code: host.code, playerId: host.playerId, tx: raw });
const afterDeposit = {
  balanceA: await balance(playerA.publicKey),
  chain: await escrow(host.matchId),
  state: await fetch(`${base}api/rooms/state?code=${host.code}&playerId=${host.playerId}`).then((response) => response.json()),
};

const refundPrepared = await post("api/rooms/prepare-refund", { code: host.code, playerId: host.playerId });
const refundTx = Transaction.from(Buffer.from(refundPrepared.tx, "base64"));
refundTx.partialSign(playerA);
const refundRaw = Buffer.from(refundTx.serialize()).toString("base64");
const refundSubmitted = await connection.sendRawTransaction(refundTx.serialize(), { skipPreflight: false });
await connection.confirmTransaction(refundSubmitted, "confirmed");
const chainBeforeRefundApi = await escrow(host.matchId);
const refunded = await post("api/rooms/refund", { code: host.code, playerId: host.playerId, tx: refundRaw });
const refundedAgain = await post("api/rooms/refund", { code: host.code, playerId: host.playerId, tx: refundRaw });
const afterRefund = {
  balanceA: await balance(playerA.publicKey),
  balanceB: await balance(playerB.publicKey),
  chain: await escrow(host.matchId),
};

console.log(JSON.stringify({
  kind: "hosted-devnet",
  code: host.code,
  playerA: playerA.publicKey.toBase58(),
  playerB: playerB.publicKey.toBase58(),
  guestJoined: guest.opponent?.joined === true,
  beforeA,
  beforeB,
  depositSignature: submitted,
  chainBeforeApp,
  d1DepositedBeforeApp: d1BeforeApp.you?.deposited ?? null,
  uiSawWaiting: ui.includes("Waiting for the other deposit"),
  recoveredSignature: recovered.signature,
  againSignature: again.signature,
  afterDeposit,
  refundSignature: refundSubmitted,
  chainBeforeRefundApi,
  refundedPaid: refunded.paid,
  refundedAgainPaid: refundedAgain.paid,
  afterRefund,
}, null, 2));
