import { loadOperatorEnv, solanaConfig } from "./operator-env.mjs";
import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "node:fs";

const env = loadOperatorEnv();
const rpc = (env.SOLANA_RPC || env.ARTPORTAL_SOLANA_RPC_URL || "").trim();
if (!rpc || !rpc.includes("devnet")) throw new Error("browser staging requires a Devnet RPC");
process.env.SUDOKU_STAGING = "1";
process.env.SUDOKU_ESCROW_PROGRAM_ID = "GTJ68bR2Fwkc9JcYefH9Eas9gvHnR6AkZ3TincmJsst4";
process.env.SUDOKU_MINT = "7VaC5xJULHGQzsZsyUCaZ7BbLGNDENLjXiPbfbbRY84j";
process.env.SOLANA_CLUSTER = "devnet";
process.env.SOLANA_RPC = rpc;
process.env.SUDOKU_AUTHORITY_KEY = readFileSync(solanaConfig("sudoku-staging-upgrade.json"), "utf8");

const base = "http://127.0.0.1:5174";
mkdirSync("output/submission", { recursive: true });

async function passSlider(page) {
  const slider = page.locator(".slider");
  await slider.scrollIntoViewIfNeeded();
  await slider.waitFor();
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const box = await slider.boundingBox();
    if (!box) throw new Error("slider has no box");
    const raw = await page.locator(".notch").evaluate((el) => getComputedStyle(el).getPropertyValue("--p"));
    const target = Number(String(raw).trim());
    const travel = Math.max(1, box.width - 12 - 40);
    const x = box.x + 6 + 20 + target * travel;
    await page.mouse.click(x, box.y + box.height / 2);
    const passed = await page.waitForFunction(() => {
      const button = [...document.querySelectorAll("button")].find((item) => item.textContent === "Create room");
      return Boolean(button && !button.disabled);
    }, null, { timeout: 2500 }).then(() => true).catch(() => false);
    if (passed) return;
  }
  await page.screenshot({ path: "output/submission/slider-failed.png" });
  throw new Error("slider did not pass");
}

async function openStaked(page) {
  await page.goto(base);
  await page.getByRole("button", { name: "Compete" }).click();
  await page.getByRole("button", { name: "For tokens" }).click();
  await page.getByText("STAGING · DEVNET · TEST TOKENS · NO CASH VALUE").waitFor();
  await page.getByRole("button", { name: "Create test wallet" }).click();
  await page.getByText(/Test wallet .* ready/).waitFor({ timeout: 90_000 });
  await passSlider(page);
}

const browser = await chromium.launch({ channel: "chrome", headless: true });
const host = await browser.newContext();
const guest = await browser.newContext();
const hostPage = await host.newPage();
const guestPage = await guest.newPage();
hostPage.on("pageerror", (error) => console.error("host", error.message));
guestPage.on("pageerror", (error) => console.error("guest", error.message));

await openStaked(hostPage);
await hostPage.getByRole("button", { name: "1", exact: true }).click();
await hostPage.getByRole("button", { name: "Create room" }).click();
await hostPage.getByRole("button", { name: "Deposit stake" }).click();
await hostPage.getByText("Waiting for the other deposit").waitFor({ timeout: 90_000 });
const code = (await hostPage.locator("strong").first().innerText()).trim();
await hostPage.reload();
await hostPage.getByText("Waiting for the other deposit").waitFor({ timeout: 30_000 });

await openStaked(guestPage);
await guestPage.getByPlaceholder("Room code").fill(code);
await guestPage.getByRole("button", { name: "Join room" }).click();
await guestPage.getByRole("button", { name: "Deposit stake" }).click();
await hostPage.getByText("Playing").waitFor({ timeout: 90_000 });

const seat = await hostPage.evaluate(() => JSON.parse(localStorage.getItem("sudoku.seat")));
const state = await hostPage.evaluate(async (saved) => {
  const response = await fetch(`/api/rooms/state?code=${saved.code}&playerId=${saved.playerId}`);
  return response.json();
}, seat);
const guestSeat = await guestPage.evaluate(() => JSON.parse(localStorage.getItem("sudoku.seat")));
const guestState = await guestPage.evaluate(async (saved) => {
  const response = await fetch(`/api/rooms/state?code=${saved.code}&playerId=${saved.playerId}`);
  return response.json();
}, guestSeat);
const { Connection, Keypair, PublicKey, Transaction, TransactionInstruction } = await import("@solana/web3.js");
const { getAccount, getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } = await import("@solana/spl-token");
const connection = new Connection(rpc, "confirmed");
const authority = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(process.env.SUDOKU_AUTHORITY_KEY)));
const programId = new PublicKey(state.programId);
const mint = new PublicKey(process.env.SUDOKU_MINT);
const idBuf = Buffer.alloc(8);
idBuf.writeBigUInt64LE(BigInt(state.matchId));
const [pda] = PublicKey.findProgramAddressSync([Buffer.from("match"), idBuf], programId);
const vault = getAssociatedTokenAddressSync(mint, pda, true);
const info = await connection.getAccountInfo(pda);
const status = info?.data[160];
if (status !== 1) throw new Error(`match status ${status} is not active`);
const ix = new TransactionInstruction({
  programId,
  keys: [
    { pubkey: pda, isSigner: false, isWritable: true },
    { pubkey: mint, isSigner: false, isWritable: false },
    { pubkey: vault, isSigner: false, isWritable: true },
    { pubkey: getAssociatedTokenAddressSync(mint, new PublicKey(state.you.wallet)), isSigner: false, isWritable: true },
    { pubkey: getAssociatedTokenAddressSync(mint, new PublicKey(guestState.you.wallet)), isSigner: false, isWritable: true },
    { pubkey: authority.publicKey, isSigner: true, isWritable: false },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
  ],
  data: Buffer.from([2, 1]),
});
const tx = new Transaction().add(ix);
tx.feePayer = authority.publicKey;
tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
tx.sign(authority);
const raw = tx.serialize();
const settlement = await connection.sendRawTransaction(raw, { skipPreflight: false });
const started = Date.now();
while (Date.now() - started < 60_000) {
  const value = (await connection.getSignatureStatuses([settlement])).value[0];
  if (value?.err) throw new Error("staging settlement failed");
  if (value?.confirmationStatus === "confirmed" || value?.confirmationStatus === "finalized") break;
  await new Promise((resolve) => setTimeout(resolve, 500));
}
const vaultAfter = (await getAccount(connection, vault)).amount.toString();
if (vaultAfter !== "0") throw new Error(`vault was ${vaultAfter}`);
await hostPage.reload();
await hostPage.getByRole("button", { name: "Close match" }).click();
await hostPage.getByText("Close confirmed").waitFor({ timeout: 90_000 });
await hostPage.screenshot({ path: "output/submission/staging-close.png" });
await browser.close();
console.log(JSON.stringify({
  path: "browser disposable Devnet keys",
  code,
  programId: state.programId,
  settlement,
  closed: true,
}));
