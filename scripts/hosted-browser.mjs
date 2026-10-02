import { solanaConfig } from "./operator-env.mjs";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Keypair, Transaction } from "@solana/web3.js";
import nacl from "tweetnacl";
import { chromium } from "playwright";

export const url = "https://sudoku.jamesbitarcade.workers.dev/";

export function loadPlayers() {
  return {
    playerA: Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(solanaConfig("sudoku-dev.json"), "utf8")))),
    playerB: Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(join(homedir(), ".config", "solana", "sudoku-player-b.json"), "utf8")))),
  };
}

export async function launch() {
  return chromium.launch({ channel: "chrome", headless: true });
}

export async function openPlayer(browser, keypair) {
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

export async function enterStaked(page) {
  await page.getByRole("button", { name: "Compete" }).click();
  await page.getByRole("button", { name: "For tokens" }).click();
  await page.getByRole("button", { name: "Connect wallet" }).click();
  await page.getByRole("button", { name: /connected/ }).waitFor({ timeout: 15_000 });
}

export async function slide(page) {
  const notch = page.locator(".notch");
  const box = await notch.boundingBox();
  if (!box) throw new Error("slider mark missing");
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.getByRole("button", { name: "Create room" }).waitFor();
}

export async function hostedRoom(page) {
  await slide(page);
  await page.getByRole("button", { name: "easy" }).click();
  await page.getByRole("button", { name: "Create room" }).click();
  const code = (await page.locator(".bar-mid strong").textContent())?.trim();
  if (!code) throw new Error("room code missing");
  return code;
}

export async function joinRoom(page, code) {
  await slide(page);
  await page.locator("input.code").fill(code);
  await page.getByRole("button", { name: "Join room" }).click();
}

export function watchDeposits(page, deposits) {
  page.on("response", async (response) => {
    if (!response.url().includes("/api/rooms/deposit") && !response.url().includes("/api/rooms/refund")) return;
    const data = await response.json().catch(() => null);
    if (data?.signature) deposits.push(data.signature);
    if (data?.error) deposits.push(`error:${data.error}`);
  });
}
