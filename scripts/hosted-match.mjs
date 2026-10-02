import { loadOperatorEnv, solanaConfig } from "./operator-env.mjs";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseEnv } from "node:util";
import { Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";
import nacl from "tweetnacl";
import { chromium } from "playwright";

const url = "https://sudoku.jamesbitarcade.workers.dev/";
const programId = new PublicKey("HUkhJi8p1XXuErpEXkgpfQjwdapigXLECRoQSu3indyS");
const playerA = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(solanaConfig("sudoku-dev.json"), "utf8"))));
const playerB = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(join(homedir(), ".config", "solana", "sudoku-player-b.json"), "utf8"))));

const browser = await chromium.launch({ channel: "chrome", headless: true });
const host = await openPlayer(browser, playerA);
const guest = await openPlayer(browser, playerB);
const deposits = [];
let matchId = null;
for (const page of [host, guest]) {
  page.on("response", async (response) => {
    if (!response.url().includes("/api/rooms/")) return;
    const data = await response.json().catch(() => null);
    if (data?.matchId) matchId = data.matchId;
    if (response.url().includes("/api/rooms/deposit")) {
      if (data?.signature) deposits.push(data.signature);
      if (data?.error) deposits.push(`error:${data.error}`);
    }
  });
}

await enterStaked(host);
await enterStaked(guest);
await slide(host);
await host.getByRole("button", { name: "easy" }).click();
await host.getByRole("button", { name: "Create room" }).click();
const code = (await host.locator(".bar-mid strong").textContent())?.trim();
if (!code) throw new Error("room code missing");

await slide(guest);
await guest.locator("input.code").fill(code);
await guest.getByRole("button", { name: "Join room" }).click();
await host.getByText(/\d+ filled/).waitFor({ timeout: 30_000 });
await host.getByRole("button", { name: "Deposit stake" }).click();
try {
  await host.getByText("Waiting for the other deposit").waitFor({ timeout: 90_000 });
} catch (error) {
  console.log(JSON.stringify({
    stage: "host-deposit",
    deposits,
    host: await host.locator("body").innerText(),
    guest: await guest.locator("body").innerText(),
  }));
  throw error;
}
await guest.getByRole("button", { name: "Deposit stake" }).click();
await host.getByText(/^\d+:\d+$/).waitFor({ timeout: 90_000 });

const givens = await host.locator(".cell").allTextContents();
const puzzle = givens.map((cell) => Number(cell.trim()) || 0);
const solution = solve(puzzle);
await play(host, solution);
await host.getByText("The vault payment is confirmed on-chain.").waitFor({ timeout: 90_000 });
const hostResult = await host.locator(".sheet").innerText();
const guestResult = await guest.locator(".sheet").innerText();
const funds = await fetch(`${url}api/rooms/funds?code=${code}`).then((response) => response.json());
const chain = await matchSignatures(matchId);
console.log(JSON.stringify({
  kind: "hosted-ui",
  code,
  playerA: playerA.publicKey.toBase58(),
  playerB: playerB.publicKey.toBase58(),
  deposits,
  hostResult,
  guestResult,
  funds,
  chain,
}));
await browser.close();

async function openPlayer(browser, keypair) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const address = keypair.publicKey.toBase58();
  const publicKey = Buffer.from(keypair.publicKey.toBytes()).toString("base64");
  await context.exposeFunction("sudokuSign", async (payload) => {
    const tx = Transaction.from(Buffer.from(payload, "base64"));
    tx.partialSign(keypair);
    return Buffer.from(tx.serialize()).toString("base64");
  });
  await context.exposeFunction("sudokuSignMessage", async (payload) => {
    const message = Buffer.from(payload, "base64");
    return Buffer.from(nacl.sign.detached(message, keypair.secretKey)).toString("base64");
  });
  await context.addInitScript(({ address, publicKey }) => {
    const bytes = Uint8Array.from(atob(publicKey), (char) => char.charCodeAt(0));
    const account = { address, publicKey: bytes, chains: ["solana:devnet"], features: ["solana:signTransaction", "solana:signMessage"] };
    const toB64 = (value) => btoa(String.fromCharCode(...value));
    const fromB64 = (value) => Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
    const wallet = {
      version: "1.0.0",
      name: "Sudoku Test Mobile Wallet Adapter",
      icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'/>",
      chains: ["solana:devnet"],
      accounts: [account],
      features: {
        "standard:connect": { version: "1.0.0", connect: async () => ({ accounts: [account] }) },
        "standard:events": { version: "1.0.0", on: () => () => {} },
        "solana:signTransaction": {
          version: "1.0.0",
          signTransaction: async (inputs) => Promise.all(inputs.map(async (input) => ({
            signedTransaction: fromB64(await window.sudokuSign(toB64(input.transaction))),
          }))),
        },
        "solana:signMessage": {
          version: "1.0.0",
          signMessage: async (inputs) => Promise.all(inputs.map(async (input) => ({
            signature: fromB64(await window.sudokuSignMessage(toB64(input.message))),
            signedMessage: input.message,
          }))),
        },
      },
    };
    const register = (api) => api.register(wallet);
    window.addEventListener("wallet-standard:app-ready", (event) => register(event.detail));
    window.dispatchEvent(new CustomEvent("wallet-standard:register-wallet", { detail: register }));
  }, { address, publicKey });
  const page = await context.newPage();
  await page.goto(url, { waitUntil: "domcontentloaded" });
  return page;
}

async function enterStaked(page) {
  await page.getByRole("button", { name: "Compete" }).click();
  await page.getByRole("button", { name: "For tokens" }).click();
  await page.getByRole("button", { name: "Connect wallet" }).click();
  await page.getByRole("button", { name: /connected/ }).waitFor({ timeout: 15_000 });
}

async function slide(page) {
  const slider = page.locator(".slider");
  const box = await slider.boundingBox();
  const style = await page.locator(".notch").getAttribute("style");
  const percent = Number(style?.match(/[\d.]+/)?.[0] ?? "0") / 100;
  await page.mouse.click(box.x + box.width * percent, box.y + box.height / 2);
  await page.getByRole("button", { name: "Create room" }).waitFor();
}

async function play(page, solution) {
  const cells = page.locator(".cell");
  for (let index = 0; index < 81; index++) {
    if ((await cells.nth(index).textContent())?.trim()) continue;
    await cells.nth(index).click();
    await page.locator(".pad button", { hasText: new RegExp(`^${solution[index]}$`) }).click();
    await page.waitForTimeout(450);
  }
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

async function matchSignatures(matchId) {
  if (!matchId) return { error: "match id missing" };
  const env = loadOperatorEnv();
  const rpc = env.ARTPORTAL_SOLANA_RPC_URL?.trim();
  const connection = new Connection(rpc, "confirmed");
  const idBuf = Buffer.alloc(8);
  idBuf.writeBigUInt64LE(BigInt(matchId));
  const [pda] = PublicKey.findProgramAddressSync([Buffer.from("match"), idBuf], programId);
  const info = await connection.getAccountInfo(pda);
  const signatures = await connection.getSignaturesForAddress(pda, { limit: 8 });
  return {
    pda: pda.toBase58(),
    status: info ? info.data[160] : null,
    outcome: info ? info.data[161] : null,
    signatures: signatures.map((item) => item.signature),
  };
}
