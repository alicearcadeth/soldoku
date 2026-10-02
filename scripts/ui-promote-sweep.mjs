/**
 * Promotion sweep for the Seeker UI. Prints a JSON verdict and exits 1 on a failed check.
 * Does not print secrets, puzzles, or wallet keys.
 */
import { chromium } from "playwright";
import { Keypair } from "@solana/web3.js";

const base = process.env.SUDOKU_URL ?? "http://127.0.0.1:5173/";
const failures = [];

function fail(name, detail) {
  failures.push({ name, detail });
  console.log(JSON.stringify({ fail: name, detail }));
}

function pass(name) {
  console.log(JSON.stringify({ pass: name }));
}

async function fresh(context) {
  const page = await context.newPage();
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    localStorage.removeItem("sudoku.classic");
    localStorage.removeItem("sudoku.seat");
    localStorage.removeItem("sudoku.pending");
    localStorage.removeItem("sudoku.pendingRefund");
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
  await page.waitForTimeout(350);
}

const browser = await chromium.launch({ channel: "chrome", headless: true });
const phone = await browser.newContext({ viewport: { width: 400, height: 890 } });
await phone.route("**/api/chain", (route) => route.fulfill({
  json: { cluster: "devnet", localnet: false, staging: false, stakeChoices: ["1000000", "2000000", "5000000"] },
}));

const home = await fresh(phone);
const homeText = await home.locator("body").innerText();
const modeNames = ["Play classic", "Practice", "Compete"];
for (const name of modeNames) {
  const count = await home.getByRole("button", { name }).count();
  if (count !== 1) fail("home-modes", `${name} count ${count}`);
}
if ((homeText.match(/DEVNET · TEST TOKENS · NO CASH VALUE/g) ?? []).length !== 1) fail("home-devnet", "badge count");
else pass("home-modes");

await home.getByRole("button", { name: "Play classic" }).click();
await home.goBack();
if (!(await home.getByRole("heading", { name: "Sudoku" }).isVisible())) fail("browser-back", "home missing");
else pass("browser-back");

const practice = await fresh(phone);
await practice.getByRole("button", { name: /No wallet required/ }).click();
await practice.getByRole("heading", { name: "Practice" }).waitFor();
const practiceText = await practice.locator("main").innerText();
if (!/No wallet required/.test(practiceText)) fail("practice-copy", practiceText.slice(0, 180));
if (await practice.getByRole("button", { name: "Connect wallet" }).count()) fail("practice-wallet", "connect visible");
const practicePrimaries = await practice.locator("button.primary").count();
if (practicePrimaries !== 1) fail("practice-primary", String(practicePrimaries));
else pass("practice-lobby");

const staked = await fresh(phone);
await staked.getByRole("button", { name: /^Race / }).click();
await staked.getByRole("heading", { name: "Compete" }).waitFor();
const create = staked.getByRole("button", { name: "Create room" });
if (!(await create.isDisabled())) fail("staked-create-locked", "enabled before wallet");
if (!(await staked.getByRole("button", { name: "Connect wallet" }).isVisible())) fail("staked-connect", "missing");
const stakeButtons = staked.locator(".tools").first().getByRole("button");
if (await stakeButtons.count() !== 3) fail("stake-count", String(await stakeButtons.count()));
else pass("staked-disconnected");

let roomPosts = 0;
await phone.route("**/api/rooms", async (route) => {
  if (route.request().method() !== "POST") return route.fallback();
  roomPosts += 1;
  await new Promise((resolve) => setTimeout(resolve, 600));
  return route.fallback();
});
const doubled = await fresh(phone);
await doubled.getByRole("button", { name: /No wallet required/ }).click();
const createRoom = doubled.getByRole("button", { name: "Create room" });
await createRoom.evaluate((button) => {
  button.click();
  button.click();
});
await doubled.waitForTimeout(1500);
if (roomPosts !== 1) fail("double-create", `posts ${roomPosts}`);
else pass("double-create");

const offline = await browser.newContext({ viewport: { width: 390, height: 844 } });
await offline.route("**/api/captcha", (route) => route.abort("internetdisconnected"));
await offline.route("**/api/chain", (route) => route.fulfill({
  json: { cluster: "devnet", localnet: false, staging: false },
}));
const offlinePage = await offline.newPage();
await offlinePage.goto(base, { waitUntil: "domcontentloaded" });
await offlinePage.evaluate(() => {
  localStorage.removeItem("sudoku.classic");
  localStorage.removeItem("sudoku.seat");
  location.replace(location.href);
});
await offlinePage.getByRole("heading", { name: "Sudoku" }).waitFor();
await offlinePage.getByRole("button", { name: /^Race / }).click();
const retry = offlinePage.getByRole("button", { name: "Try the check again" });
try {
  await retry.waitFor({ timeout: 8000 });
  const alert = await offlinePage.getByRole("alert").innerText();
  if (!/offline/i.test(alert)) fail("offline-copy", alert);
  else pass("offline-retry");
} catch (error) {
  fail("offline-retry", error instanceof Error ? error.message : "no retry");
}

const local = await browser.newContext({ viewport: { width: 400, height: 890 } });
let prepares = 0;
await local.route("**/api/rooms/prepare", async (route) => {
  prepares += 1;
  await new Promise((resolve) => setTimeout(resolve, 700));
  return route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "held for double-tap check" }) });
});
const pay = await local.newPage();
const playerSecret = JSON.stringify(Array.from(Keypair.generate().secretKey));
await pay.addInitScript((secret) => {
  localStorage.setItem("sudoku.player", secret);
}, playerSecret);
await pay.goto(base, { waitUntil: "domcontentloaded" });
await pay.evaluate(() => {
  localStorage.removeItem("sudoku.classic");
  localStorage.removeItem("sudoku.seat");
  location.replace(location.href);
});
await pay.getByRole("heading", { name: "Sudoku" }).waitFor();
const chain = await pay.evaluate(async () => {
  const response = await fetch("/api/chain");
  return response.json();
});
if (chain.localnet) {
  try {
    await pay.waitForFunction(() => !document.body.innerText.includes("DEVNET"), { timeout: 4000 });
    pass("home-disclosure");
  } catch {
    fail("stale-devnet", "home shows DEVNET while /api/chain is localnet");
  }
} else pass("home-disclosure");
try {
  await pay.getByRole("button", { name: /^Race / }).click();
  await pay.getByRole("button", { name: /Test wallet/ }).waitFor({ timeout: 8000 });
  await passSlider(pay);
  await pay.getByRole("button", { name: "Create room" }).click();
  const deposit = pay.getByRole("button", { name: /Deposit stake/ });
  try {
    await deposit.waitFor({ timeout: 15000 });
  } catch (error) {
    const text = await pay.locator("main").innerText();
    throw new Error(`${error instanceof Error ? error.message : "deposit missing"}\n${text.slice(0, 400)}`);
  }
  await deposit.evaluate((button) => {
    button.click();
    button.click();
  });
  await pay.waitForTimeout(1600);
  if (prepares !== 1) fail("double-deposit", `prepares ${prepares}`);
  else pass("double-deposit");
} catch (error) {
  fail("double-deposit", error instanceof Error ? error.message : "deposit sweep failed");
}

const widths = [320, 360, 375, 390, 400, 412, 430, 480, 600, 840, 1280];
const sized = await fresh(phone);
const overflow = [];
for (const width of widths) {
  await sized.setViewportSize({ width, height: width >= 840 ? 900 : 800 });
  await sized.goto(base, { waitUntil: "domcontentloaded" });
  await sized.getByRole("heading", { name: "Sudoku" }).waitFor();
  const wide = await sized.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  if (wide) overflow.push(width);
}
await sized.getByRole("button", { name: /^Race / }).click();
await sized.getByRole("heading", { name: "Compete" }).waitFor();
for (const width of [320, 375, 400]) {
  await sized.setViewportSize({ width, height: 700 });
  const connect = sized.getByRole("button", { name: "Connect wallet" });
  await connect.scrollIntoViewIfNeeded();
  const metrics = await sized.evaluate(() => ({
    wide: document.documentElement.scrollWidth > window.innerWidth + 1,
    scroll: document.documentElement.scrollWidth,
    inner: window.innerWidth,
  }));
  const box = await connect.boundingBox();
  if (metrics.wide || !box) overflow.push(`compete-${width} scroll ${metrics.scroll} inner ${metrics.inner}`);
}
if (overflow.length) fail("overflow", overflow.join(","));
else pass("overflow");

await sized.setViewportSize({ width: 400, height: 890 });
const small = await sized.locator("button").evaluateAll((buttons) => buttons.map((button) => {
  const box = button.getBoundingClientRect();
  const name = (button.getAttribute("aria-label") || button.textContent || "").replace(/\s+/g, " ").trim().slice(0, 32);
  return { name, h: Math.round(box.height), w: Math.round(box.width), cell: button.getAttribute("role") === "gridcell" };
}).filter((item) => item.h > 0 && !item.cell && (item.h < 48 || item.w < 48)));
if (small.length) fail("touch", JSON.stringify(small));
else pass("touch");

await sized.goto(`${base}?theme=classic`, { waitUntil: "domcontentloaded" });
const theme = await sized.evaluate(() => document.documentElement.dataset.theme || "default");
if (theme !== "classic") fail("classic-theme", theme);
else pass("classic-theme");

const classic = await fresh(phone);
await classic.setViewportSize({ width: 400, height: 890 });
await classic.getByRole("button", { name: "Play classic" }).click();
await classic.getByRole("button", { name: "Easy" }).click();
await classic.locator("[role=gridcell]").first().waitFor();
await classic.getByRole("button", { name: "Notes" }).click();
const empty = classic.locator("[role=gridcell][aria-label*='empty']").first();
await empty.click();
await classic.locator(".pad button").nth(0).click();
const noted = await empty.locator(".notes").innerText().catch(() => "");
await classic.getByRole("button", { name: "Undo" }).click();
await classic.getByRole("button", { name: "Notes" }).click();
await classic.getByRole("button", { name: "Hint" }).click();
await classic.getByRole("button", { name: "Pause" }).click();
const paused = await classic.getByRole("button", { name: "Resume" }).isVisible();
await classic.getByRole("button", { name: "Resume" }).click();
await classic.reload();
await classic.locator("[role=gridcell]").first().waitFor();
if (!noted.includes("1") || !paused) fail("classic", `notes ${noted} paused ${paused}`);
else pass("classic");
await classic.setViewportSize({ width: 800, height: 360 });
const landscape = await classic.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
const pad = await classic.locator(".pad button").first().boundingBox();
if (landscape || !pad) fail("landscape", `wide ${landscape}`);
else pass("landscape");

function walletPageScript(mode, address) {
  return `(() => {
    const address = ${JSON.stringify(address)};
    const account = { address, chains: ["solana:devnet"] };
    const wallet = {
      version: "1.0.0",
      name: "Preview Wallet",
      icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'/>",
      chains: ["solana:devnet"],
      accounts: [],
      features: {
        "standard:connect": { version: "1.0.0", connect: async () => {
          if (${JSON.stringify(mode)} === "decline") throw new Error("authorization request failed");
          if (${JSON.stringify(mode)} === "timeout") throw new Error("session timeout");
          wallet.accounts = [account];
          return { accounts: [account] };
        } },
        "standard:events": { version: "1.0.0", on: () => () => {} },
      },
    };
    const registerWallet = (api) => api.register(wallet);
    window.addEventListener("wallet-standard:app-ready", (event) => registerWallet(event.detail));
    window.dispatchEvent(new CustomEvent("wallet-standard:register-wallet", { detail: registerWallet }));
  })();`;
}

const declined = await browser.newContext({ viewport: { width: 400, height: 890 } });
await declined.route("**/api/chain", (route) => route.fulfill({
  json: { cluster: "devnet", localnet: false, staging: false, stakeChoices: ["1000000", "2000000", "5000000"] },
}));
await declined.addInitScript(walletPageScript("decline", "JCVsKd4TMg1fvEs7rjf5YgLYbJfNC8Dwb4x1PchFkGM7"));
const declinePage = await fresh(declined);
await declinePage.getByRole("button", { name: /^Race / }).click();
await declinePage.getByRole("button", { name: "Connect wallet" }).click();
const declineAlert = declinePage.getByRole("alert");
await declineAlert.waitFor({ timeout: 8000 });
const declineText = await declineAlert.innerText();
const connectAgain = await declinePage.getByRole("button", { name: "Connect wallet" }).isEnabled();
if (!/did not finish authorization/i.test(declineText) || !connectAgain) fail("wallet-decline", declineText);
else pass("wallet-decline");

const switched = await browser.newContext({ viewport: { width: 400, height: 890 } });
await switched.route("**/api/chain", (route) => route.fulfill({
  json: { cluster: "devnet", localnet: false, staging: false, stakeChoices: ["1000000", "2000000", "5000000"] },
}));
await switched.route("**/api/rooms/state**", (route) => route.fulfill({ status: 404, json: { error: "Room unavailable" } }));
await switched.route("**/api/balances**", (route) => route.fulfill({ json: { sol: 0, token: "0" } }));
await switched.addInitScript(walletPageScript("switch", "WalletB2222222222222222222222222222"));
const switchPage = await switched.newPage();
await switchPage.goto(base, { waitUntil: "domcontentloaded" });
await switchPage.evaluate(() => {
  localStorage.setItem("sudoku.walletName", "Preview Wallet");
  localStorage.setItem("sudoku.walletAddress", "WalletA1111111111111111111111111111");
  localStorage.setItem("sudoku.seat", JSON.stringify({ code: "ABCD", playerId: "player-a" }));
  localStorage.setItem("sudoku.pending", JSON.stringify({ code: "ABCD", playerId: "player-a", tx: "pending-a" }));
  localStorage.removeItem("sudoku.classic");
  location.replace(location.href);
});
await switchPage.waitForFunction(() => document.body.innerText.includes("wallet account changed"), { timeout: 8000 });
const isolated = await switchPage.evaluate(() => ({
  seat: localStorage.getItem("sudoku.seat"),
  pending: localStorage.getItem("sudoku.pending"),
}));
if (isolated.seat || isolated.pending) fail("address-isolation", JSON.stringify(isolated));
else pass("address-isolation");

await browser.close();
if (failures.length) {
  console.log(JSON.stringify({ ok: false, failures }));
  process.exit(1);
}
console.log(JSON.stringify({ ok: true }));
