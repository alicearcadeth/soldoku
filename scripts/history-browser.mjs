import { solanaConfig } from "./operator-env.mjs";
import { readFileSync } from "node:fs";
import { Keypair, Transaction } from "@solana/web3.js";
import nacl from "tweetnacl";
import { chromium } from "playwright";

const url = "https://sudoku.jamesbitarcade.workers.dev/";
const player = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(solanaConfig("sudoku-dev.json"), "utf8"))));
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const address = player.publicKey.toBase58();
const publicKey = Buffer.from(player.publicKey.toBytes()).toString("base64");
await context.exposeFunction("sudokuSign", async (payload) => {
  const tx = Transaction.from(Buffer.from(payload, "base64"));
  tx.partialSign(player);
  return Buffer.from(tx.serialize()).toString("base64");
});
await context.exposeFunction("sudokuSignMessage", async (payload) => {
  const message = Buffer.from(payload, "base64");
  return Buffer.from(nacl.sign.detached(message, player.secretKey)).toString("base64");
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
await page.getByRole("button", { name: "Compete" }).click();
await page.getByRole("button", { name: "For tokens", exact: true }).click();
await page.getByRole("button", { name: "Connect wallet" }).click();
await page.getByRole("button", { name: /connected/ }).waitFor({ timeout: 15_000 });
await page.getByRole("button", { name: "My matches" }).click();
await page.getByText("FJTY").waitFor({ timeout: 20_000 });
await page.getByPlaceholder("Display name").fill("Arcade");
await page.getByRole("button", { name: "Save name" }).click();
await page.waitForFunction(() => {
  const input = document.querySelector("input[placeholder='Display name']");
  return input instanceof HTMLInputElement && input.value === "Arcade" && !document.body.innerText.includes("Name was not saved");
});
const text = await page.locator("main").innerText();
console.log(JSON.stringify({
  kind: "live-browser-history",
  wallet: address,
  seesStaked: text.includes("staked · easy · FJTY · win"),
  seesPractice: text.includes("practice · easy · MYDB · win"),
  seesGuestRoom: text.includes("SYY9"),
  displayName: text.includes("Arcade") || (await page.getByPlaceholder("Display name").inputValue()) === "Arcade",
}));
await browser.close();
