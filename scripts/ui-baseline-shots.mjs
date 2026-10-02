/**
 * Baseline screenshots of the current UI. Does not change app behavior.
 * Writes only under docs/ui-baseline/.
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const out = process.env.SUDOKU_SHOTS ?? "docs/ui-baseline";
mkdirSync(out, { recursive: true });
const base = process.env.SUDOKU_URL ?? "http://127.0.0.1:5173/";
const ADDRESS = "JCVsKd4TMg1fvEs7rjf5YgLYbJfNC8Dwb4x1PchFkGM7";

function walletScript(mode) {
  return `(() => {
    const address = ${JSON.stringify(ADDRESS)};
    const account = { address, chains: ["solana:devnet"] };
    let release = () => {};
    const gate = new Promise((resolve) => { release = resolve; });
    window.__releaseWallet = () => release();
    const wallet = {
      version: "1.0.0",
      name: "Preview Wallet",
      icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'/>",
      chains: ["solana:devnet"],
      accounts: [],
      features: {
        "standard:connect": { version: "1.0.0", connect: async () => {
          if (${JSON.stringify(mode)} === "hang") await gate;
          wallet.accounts = [account];
          return { accounts: [account] };
        } },
        "standard:events": { version: "1.0.0", on: () => () => {} },
        "standard:disconnect": { version: "1.0.0", disconnect: async () => { wallet.accounts = []; } },
        "solana:signMessage": { version: "1.0.0", signMessage: async () => [{ signature: new Uint8Array(64) }] },
        "solana:signTransaction": { version: "1.0.0", signTransaction: async () => { throw new Error("User rejected the request"); } },
      },
    };
    const registerWallet = (api) => api.register(wallet);
    window.addEventListener("wallet-standard:app-ready", (event) => registerWallet(event.detail));
    window.dispatchEvent(new CustomEvent("wallet-standard:register-wallet", { detail: registerWallet }));
  })();`;
}

async function shot(page, name) {
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
  console.log(name);
}

async function fresh(context) {
  const page = await context.newPage();
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    localStorage.removeItem("sudoku.classic");
    localStorage.removeItem("sudoku.seat");
    location.replace(location.href);
  });
  await page.getByRole("heading", { name: "Sudoku" }).waitFor();
  return page;
}

async function passSlider(page) {
  const notch = page.locator(".notch");
  await notch.waitFor();
  const box = await notch.boundingBox();
  if (!box) throw new Error("slider notch missing");
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(400);
}

const browser = await chromium.launch({ channel: "chrome", headless: true });

async function showDevnet(context) {
  await context.route("**/api/chain", (route) => route.fulfill({
    json: {
      cluster: "devnet",
      localnet: false,
      staging: false,
      stakeChoices: ["1000000", "2000000", "5000000"],
    },
  }));
}

const phone = await browser.newContext({ viewport: { width: 400, height: 890 }, deviceScaleFactor: 2 });
await showDevnet(phone);
const page = await fresh(phone);
await shot(page, "01-home");

await page.getByRole("button", { name: "Play classic" }).click();
await page.getByRole("heading", { name: "Classic" }).waitFor();
await shot(page, "02-difficulty");

await page.getByRole("button", { name: "Easy" }).click();
await page.getByRole("grid", { name: "Sudoku" }).waitFor();
await page.waitForTimeout(300);
await shot(page, "03-classic");
await page.setViewportSize({ width: 800, height: 400 });
await shot(page, "13-landscape-classic");
await page.setViewportSize({ width: 400, height: 890 });

await page.getByRole("button", { name: "Pause" }).click();
await page.getByRole("heading", { name: "Paused" }).waitFor();
await shot(page, "03b-paused");
await page.getByRole("button", { name: "Resume" }).click();
await page.getByRole("button", { name: "Pause" }).click();
await page.getByRole("heading", { name: "Paused" }).waitFor();
await page.evaluate(() => {
  const saved = JSON.parse(localStorage.getItem("sudoku.classic") ?? "null");
  if (!saved?.puzzle?.solution) return;
  saved.values = saved.puzzle.solution.slice();
  saved.revision = (saved.revision ?? 0) + 50;
  localStorage.setItem("sudoku.classic", JSON.stringify(saved));
});
await page.reload({ waitUntil: "domcontentloaded" });
await page.getByRole("heading", { name: "Solved" }).waitFor({ timeout: 15000 });
await shot(page, "10-result");
await page.close();

const practice = await fresh(phone);
await practice.getByRole("button", { name: "Practice" }).click();
await practice.getByRole("heading", { name: "Practice" }).waitFor();
await shot(practice, "04-practice");

await practice.getByRole("button", { name: "Create room" }).click();
await practice.getByText("Share code").waitFor({ timeout: 15000 });
await shot(practice, "08-waiting");

const staked = await fresh(phone);
await staked.getByRole("button", { name: "Compete" }).click();
await staked.getByRole("button", { name: "For tokens" }).click();
await staked.getByText("DEVNET · TEST TOKENS · NO CASH VALUE").waitFor();
await shot(staked, "05-compete-disconnected");
await shot(staked, "07-stake-picker");

const offline = await fresh(phone);
await offline.context().setOffline(true);
await offline.getByRole("button", { name: "Compete" }).click();
await offline.getByRole("alert").waitFor({ timeout: 8000 }).catch(() => {});
await shot(offline, "12-offline");
await offline.context().setOffline(false);

await phone.close();

const pending = await browser.newContext({ viewport: { width: 400, height: 890 }, deviceScaleFactor: 2 });
await showDevnet(pending);
await pending.addInitScript(walletScript("hang"));
const pendingPage = await pending.newPage();
await pendingPage.route("**/api/balances**", (route) => route.fulfill({
  json: { sol: 1_500_000_000, token: "3000000" },
}));
await pendingPage.goto(base, { waitUntil: "domcontentloaded" });
await pendingPage.evaluate(() => localStorage.clear());
await pendingPage.reload({ waitUntil: "domcontentloaded" });
await pendingPage.getByRole("heading", { name: "Sudoku" }).waitFor();
await pendingPage.getByRole("button", { name: "Compete" }).click();
await pendingPage.getByRole("button", { name: "For tokens" }).click();
await pendingPage.getByRole("button", { name: "Connect wallet" }).click();
const preview = pendingPage.getByRole("button", { name: "Preview Wallet" });
if (await preview.isVisible().catch(() => false)) await preview.click();
await pendingPage.getByRole("button", { name: "Connecting wallet" }).waitFor();
await shot(pendingPage, "09-wallet-pending");
await pendingPage.evaluate(() => window.__releaseWallet?.());
await pendingPage.getByText(/connected/).waitFor({ timeout: 10000 });
await shot(pendingPage, "06-compete-connected");
await pendingPage.route("**/api/history", (route) => route.fulfill({
  json: {
    recent: [{ mode: "practice", level: "easy", code: "ABCD", outcome: "win", chain: null }],
    practice: { wins: 2, losses: 1, draws: 0 },
    competitive: { wins: 1, losses: 0, draws: 0 },
    classicCompleted: 3,
  },
}));
await pendingPage.getByRole("button", { name: "My matches" }).click();
await pendingPage.getByText(/Classic finished/).waitFor({ timeout: 10000 }).catch(() => {});
await shot(pendingPage, "11-profile");
await pending.close();

const widths = [360, 390, 412, 480, 600, 840, 1280];
for (const width of widths) {
  const context = await browser.newContext({
    viewport: { width, height: width >= 840 ? 900 : 890 },
    deviceScaleFactor: 1,
  });
  await showDevnet(context);
  const sized = await fresh(context);
  await shot(sized, `width-${width}-home`);
  await context.close();
}

await browser.close();
console.log("baseline shots written");
