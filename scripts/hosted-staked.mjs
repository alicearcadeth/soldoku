import { chromium } from "playwright";

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
await page.goto("https://sudoku.jamesbitarcade.workers.dev/", { waitUntil: "domcontentloaded" });
await page.getByRole("button", { name: "Compete" }).click();
await page.getByRole("button", { name: "For tokens" }).click();
const wallet = await page.getByRole("button", { name: "Create test wallet" }).count();
const copy = await page.locator("body").innerText();
if (wallet !== 0) throw new Error("hosted Devnet offered the localnet test wallet");
if (!copy.includes("test token")) throw new Error("staked copy missing");
console.log("HOSTED_STAKED_OK no-test-wallet");
await browser.close();
