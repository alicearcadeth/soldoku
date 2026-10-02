import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";
import nacl from "tweetnacl";
import bs58 from "bs58";

const origin = process.env.QA_ORIGIN ?? "http://127.0.0.1:5173/";
const out = "output/competition-check";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const results = [];
const errors = [];
const contexts = [];
async function check(name, run) {
  try { await run(); results.push({ name, passed: true }); } catch (error) { results.push({ name, passed: false, error: error.message }); }
  console.log(JSON.stringify(results.at(-1)));
}
async function client(key = nacl.sign.keyPair()) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
  contexts.push(context);
  await context.exposeBinding("qaSignMessage", (_, bytes) => Array.from(nacl.sign.detached(Uint8Array.from(bytes), key.secretKey)));
  await context.addInitScript(({ wallet, publicKey }) => {
    const account = { address: wallet, publicKey: Uint8Array.from(publicKey), chains: ["solana:devnet", "solana:mainnet", "solana:localnet"], features: ["solana:signMessage"] };
    const wallets = ["Phantom", "Solflare", "Backpack"].map(name => ({
      version: "1.0.0", name, icon: "data:image/png;base64,", chains: account.chains, accounts: [],
      features: {
        "standard:connect": { version: "1.0.0", connect: async () => ({ accounts: [account] }) },
        "standard:disconnect": { version: "1.0.0", disconnect: async () => undefined },
        "solana:signMessage": { version: "1.0.0", signMessage: async ({ message }) => [{ signature: Uint8Array.from(await window.qaSignMessage(Array.from(message))) }] },
      },
    }));
    window.addEventListener("wallet-standard:app-ready", event => event.detail.register(...wallets));
  }, { wallet: bs58.encode(key.publicKey), publicKey: Array.from(key.publicKey) });
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(origin);
  return { page, context, key };
}
async function chooseWallet(page, name = "Phantom") {
  const dialog = page.getByRole("dialog", { name: "Connect wallet", exact: true });
  await dialog.waitFor();
  await dialog.getByRole("button", { name: new RegExp(`^${name}`) }).click();
  await dialog.waitFor({ state: "hidden" });
}
async function goCompete(page) {
  await page.getByRole("button", { name: /^LEADERBOARD Compete/i }).click();
  await page.getByRole("heading", { name: "Compete", exact: true }).waitFor();
}
let owner; let code;
try {
  owner = await client();
  await check("Settings headings and understandable font preview", async () => {
    await owner.page.getByRole("button", { name: "Settings", exact: true }).click();
    const dialog = owner.page.getByRole("dialog", { name: "Settings", exact: true });
    for (const name of ["Theme", "Font", "Size"]) assert.equal(await dialog.getByRole("heading", { name, exact: true }).isVisible(), true);
    assert.equal(await dialog.getByText("The quick brown fox").isVisible(), true);
    await owner.page.screenshot({ path: `${out}/settings-phone.png` });
    await dialog.getByRole("button", { name: "Done", exact: true }).click();
  });
  await check("Home wallet picker lists detected Phantom, Solflare, and Backpack; cancellation works", async () => {
    await owner.page.getByRole("button", { name: "Connect wallet", exact: true }).click();
    const dialog = owner.page.getByRole("dialog", { name: "Connect wallet", exact: true });
    for (const name of ["Phantom", "Solflare", "Backpack"]) await dialog.getByRole("button", { name: new RegExp(`^${name}`) }).waitFor();
    await owner.page.screenshot({ path: `${out}/wallet-picker.png` });
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
  });
  await check("Create opens wallet automatically, signs identity, and requires slider before creating", async () => {
    await goCompete(owner.page);
    assert.equal(await owner.page.getByRole("button", { name: "Connect wallet", exact: true }).count(), 0);
    await owner.page.getByRole("button", { name: "Create competition", exact: true }).click();
    await owner.page.getByRole("button", { name: "Easy", exact: true }).click();
    await owner.page.getByRole("textbox", { name: "Room name", exact: true }).fill("Weekend Sprint");
    await owner.page.getByRole("button", { name: "Create room", exact: true }).click();
    await chooseWallet(owner.page);
    const dialog = owner.page.getByRole("dialog", { name: "Quick check before creating", exact: true });
    await dialog.waitFor();
    assert.equal(await dialog.getByRole("button", { name: "Confirm create room" }).count(), 0);
    const target = await dialog.locator(".slider-target").evaluate(element => Number(element.style.getPropertyValue("--target")));
    await dialog.getByRole("slider").fill(String(Math.round(target * 100)));
    await dialog.getByRole("button", { name: "Verify position", exact: true }).click();
    await dialog.getByRole("button", { name: "Confirm create room", exact: true }).click();
    await owner.page.getByRole("button", { name: "Start challenge", exact: true }).waitFor();
    assert.equal(await owner.page.getByRole("heading", { level: 1 }).innerText(), "Weekend Sprint");
    code = await owner.page.locator("[data-room-code]").getAttribute("data-room-code");
    assert.match(code, /^[A-F0-9]{8}$/);
  });
  await check("Creator extends a room while alone", async () => {
    await owner.page.getByRole("button", { name: "Extend room duration", exact: true }).click();
    const dialog = owner.page.getByRole("dialog", { name: "Extend room duration", exact: true });
    await dialog.getByRole("button", { name: "1 Week", exact: true }).click();
    await dialog.getByRole("button", { name: "Confirm extension", exact: true }).click();
    await dialog.waitFor({ state: "hidden" });
    assert.match(await owner.page.locator(".room-facts").innerText(), /8 days/);
  });
  await check("Room browser details, join flow, third player, and locked duration", async () => {
    for (const name of ["Solflare", "Backpack"]) {
      const entrant = await client();
      await goCompete(entrant.page);
      const card = entrant.page.locator(".room-card", { hasText: code });
      await card.waitFor();
      for (const text of ["Game mode", "Token", "Stake per player", "Approx. USD", "Competition period", "Participants", "Status", "Best completion"]) assert.match(await card.innerText(), new RegExp(text.replace(".", "\\.")));
      await card.getByRole("button", { name: "Join room", exact: true }).click();
      await chooseWallet(entrant.page, name);
      await entrant.page.getByRole("button", { name: "Start challenge", exact: true }).waitFor();
    }
    await owner.page.getByText("Duration locked · another player has joined.", { exact: true }).waitFor();
    assert.equal(await owner.page.getByRole("button", { name: "Extend room duration", exact: true }).count(), 0);
    assert.match(await owner.page.locator(".room-facts").innerText(), /3 · open entry/);
    await owner.page.screenshot({ path: `${out}/room-phone.png`, fullPage: true });
  });
  await check("One attempt persists across Home, reload, and a second session of the same wallet", async () => {
    await owner.page.getByRole("button", { name: "Start challenge", exact: true }).click();
    await owner.page.getByRole("gridcell").first().waitFor();
    const index = await owner.page.getByRole("gridcell").evaluateAll(cells => cells.findIndex(cell => !cell.textContent.trim()));
    await owner.page.getByRole("gridcell").nth(index).click();
    await owner.page.locator(".pad button").nth(3).click();
    await owner.page.waitForFunction(index => document.querySelectorAll("[role=gridcell]")[index]?.textContent.trim() === "4", index);
    await owner.page.getByRole("button", { name: "Home", exact: true }).click();
    await goCompete(owner.page);
    await owner.page.getByRole("button", { name: "Continue challenge", exact: true }).click();
    assert.equal((await owner.page.getByRole("gridcell").nth(index).innerText()).trim(), "4");
    await owner.page.reload();
    await owner.page.getByRole("button", { name: "Continue challenge", exact: true }).click();
    assert.equal((await owner.page.getByRole("gridcell").nth(index).innerText()).trim(), "4");
    await owner.page.getByRole("button", { name: "Room & leaderboard", exact: true }).click();
    const second = await client(owner.key);
    await goCompete(second.page);
    await second.page.locator(".room-card", { hasText: code }).getByRole("button", { name: "Join room", exact: true }).click();
    await chooseWallet(second.page);
    await second.page.getByRole("button", { name: "Continue challenge", exact: true }).waitFor();
    assert.match(await second.page.locator(".room-facts").innerText(), /3 · open entry/);
  });
  await check("Complete the challenge, display rank, reload without a restart, and keep timer on the server", async () => {
    await owner.page.getByRole("button", { name: "Continue challenge", exact: true }).click();
    await owner.page.getByRole("gridcell").first().waitFor();
    const state = await owner.page.evaluate(async code => {
      const session = JSON.parse(localStorage.getItem("sudoku.competitionSession"));
      return (await fetch("/api/competitions/state", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code, actor: session.actor }) })).json();
    }, code);
    const solution = [...state.you.givens];
    function solve(index = 0) {
      while (index < 81 && solution[index]) index++;
      if (index === 81) return true;
      const row = Math.floor(index / 9), col = index % 9;
      for (let digit = 1; digit <= 9; digit++) {
        let valid = true;
        for (let j = 0; j < 9; j++) if (solution[row * 9 + j] === digit || solution[j * 9 + col] === digit || solution[(Math.floor(row / 3) * 3 + Math.floor(j / 3)) * 9 + Math.floor(col / 3) * 3 + j % 3] === digit) valid = false;
        if (valid) { solution[index] = digit; if (solve(index + 1)) return true; }
      }
      solution[index] = 0; return false;
    }
    assert.ok(solve());
    await owner.page.screenshot({ path: `${out}/challenge-phone.png`, fullPage: true });
    await owner.page.waitForTimeout(Math.max(0, 15500 - (Date.now() - state.you.startedAt)));
    for (let index = 0; index < 81; index++) {
      if (state.you.givens[index] || state.you.board[index] === solution[index]) continue;
      await owner.page.getByRole("gridcell").nth(index).click();
      await owner.page.locator(".pad button").nth(solution[index] - 1).click();
      await owner.page.waitForTimeout(140);
    }
    await owner.page.getByText(/Finished in .*rank 1/).waitFor();
    await owner.page.reload();
    await owner.page.getByText(/Finished in .*rank 1/).waitFor();
    assert.equal(await owner.page.getByRole("button", { name: /Start challenge|Continue challenge/ }).count(), 0);
    await owner.page.screenshot({ path: `${out}/finished-phone.png`, fullPage: true });
  });
  await check("Live token price, bidirectional USD conversion, token search and clear stake presets", async () => {
    await owner.page.getByRole("button", { name: "← Back to Rooms", exact: true }).first().click();
    await owner.page.getByRole("button", { name: "Create competition", exact: true }).click();
    await owner.page.getByRole("button", { name: "For tokens", exact: true }).click();
    await owner.page.locator(".quote-line").filter({ hasText: "per token" }).waitFor();
    const quote = await owner.page.locator(".quote-line").filter({ hasText: "per token" }).innerText();
    assert.match(quote, /SOL/);
    const live = await owner.page.request.get(`${origin}api/tokens?mint=So11111111111111111111111111111111111111112`);
    const price = (await live.json()).tokens[0].priceUsd;
    await owner.page.getByRole("spinbutton", { name: "Token amount", exact: true }).fill("10");
    const usd = Number(await owner.page.getByRole("spinbutton", { name: "USD value", exact: true }).inputValue());
    assert.ok(Math.abs(usd - price * 10) < 0.01);
    await owner.page.getByRole("spinbutton", { name: "USD value", exact: true }).fill("50");
    const tokens = Number(await owner.page.getByRole("spinbutton", { name: "Token amount", exact: true }).inputValue());
    assert.ok(Math.abs(tokens * price - 50) < 0.01);
    for (const amount of [1, 2, 5]) assert.equal(await owner.page.getByRole("button", { name: new RegExp(`^${amount} SOL`) }).isVisible(), true);
    await owner.page.getByRole("button", { name: /Pick Your Token on Solana/ }).click();
    const dialog = owner.page.getByRole("dialog", { name: "Pick Your Token on Solana" });
    await dialog.getByRole("textbox", { name: /Search by/ }).fill("USDC");
    await dialog.locator(".token-result").first().waitFor();
    await dialog.getByRole("button", { name: "USDC", exact: true }).click();
    await owner.page.locator(".quote-line").filter({ hasText: "per token" }).waitFor();
    assert.match(await owner.page.locator(".quote-line").filter({ hasText: "per token" }).innerText(), /USDC/);
    await owner.page.screenshot({ path: `${out}/token-entry-phone.png`, fullPage: true });
  });
  await check("Responsive layouts from 320 to 1280 pixels", async () => {
    for (const width of [320, 360, 390, 768, 1280]) {
      await owner.page.setViewportSize({ width, height: 900 });
      assert.equal(await owner.page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `Overflow at ${width}`);
    }
    await owner.page.screenshot({ path: `${out}/token-entry-desktop.png`, fullPage: true });
  });
  await check("Custom duration and honest free-entry recovery before wallet or slider", async () => {
    await owner.page.getByRole("textbox", { name: "Room name", exact: true }).fill("Weekend Sprint");
    await owner.page.getByRole("button", { name: "Custom Duration", exact: true }).click();
    await owner.page.getByRole("spinbutton", { name: "Custom duration", exact: true }).fill("3");
    await owner.page.getByRole("combobox", { name: "Duration unit", exact: true }).selectOption("3600000");
    assert.equal(await owner.page.getByRole("button", { name: "Create room", exact: true }).count(), 0);
    await owner.page.getByRole("button", { name: "Switch to free competition", exact: true }).click();
    assert.equal(await owner.page.getByRole("spinbutton", { name: "Custom duration", exact: true }).inputValue(), "3");
    assert.equal(await owner.page.getByRole("textbox", { name: "Room name", exact: true }).inputValue(), "Weekend Sprint");
    assert.equal(await owner.page.getByRole("button", { name: "Create room", exact: true }).isEnabled(), true);
    assert.equal(await owner.page.getByRole("dialog").count(), 0);
    await owner.page.getByRole("button", { name: "Create room", exact: true }).click();
    const dialog = owner.page.getByRole("dialog", { name: "Quick check before creating", exact: true });
    await dialog.waitFor();
    const target = await dialog.locator(".slider-target").evaluate(element => Number(element.style.getPropertyValue("--target")));
    await dialog.getByRole("slider").fill(String(Math.round(target * 100)));
    await dialog.getByRole("button", { name: "Verify position", exact: true }).click();
    await owner.page.route("**/api/competitions/create", route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Competition storage is temporarily unavailable. Please retry." }) }));
    await dialog.getByRole("button", { name: "Confirm create room", exact: true }).click();
    await dialog.getByRole("alert").filter({ hasText: "Competition storage is temporarily unavailable. Please retry." }).waitFor();
    await owner.page.unroute("**/api/competitions/create");
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  });
  await check("No uncaught browser errors", async () => assert.deepEqual(errors, []));
} finally {
  await Promise.all(contexts.map(context => context.close()));
  await browser.close();
  writeFileSync(`${out}/results.json`, JSON.stringify(results, null, 2));
}
if (results.some(result => !result.passed)) process.exitCode = 1;
