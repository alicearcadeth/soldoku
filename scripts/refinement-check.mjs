import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";
const origin = process.env.QA_ORIGIN ?? "http://127.0.0.1:5174/";
const out = "output/refinement-check";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();
page.setDefaultTimeout(10000);
const errors = [], results = [];
page.on("pageerror", error => errors.push(error.message));
async function check(name, run) {
  try { await run(); results.push({ name, passed: true }); }
  catch (error) { await page.screenshot({ path: `${out}/failure-${results.length}.png`, fullPage: true }); results.push({ name, passed: false, error: error.message, page: await page.locator("body").innerText() }); }
  console.log(JSON.stringify(results.at(-1)));
}
try {
  await page.goto(origin);
  await check("Logo retains original proportions and primary states use Solana Green", async () => {
    const logo = page.locator(".brand-hero");
    await logo.waitFor();
    await logo.evaluate(image => image.decode());
    assert.equal(await logo.evaluate(image => image.complete && image.naturalWidth / image.naturalHeight === 3), true);
    await page.screenshot({ path: `${out}/home-phone.png`, fullPage: true });
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Settings" });
    for (const theme of ["Ink", "Dark", "Midnight", "Arcade"]) {
      const selected = dialog.getByRole("button", { name: theme, exact: true });
      await selected.click();
      assert.equal(await selected.evaluate(element => getComputedStyle(element).backgroundColor), "rgb(20, 241, 149)");
      assert.equal(await selected.evaluate(element => getComputedStyle(element).color), "rgb(8, 37, 27)");
      await page.screenshot({ path: `${out}/settings-${theme.toLowerCase()}.png` });
    }
    await dialog.getByRole("button", { name: "Ink", exact: true }).click();
    await dialog.getByRole("button", { name: "Done", exact: true }).click();
  });
  await check("Return to current game preserves grid, entries, difficulty, and resumes immediately", async () => {
    await page.getByRole("button", { name: /Play classic/ }).click();
    await page.getByRole("button", { name: /^Easy/ }).click();
    await page.getByRole("gridcell").first().waitFor();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("sudoku.classic")));
    const index = saved.puzzle.givens.findIndex(value => !value);
    await page.getByRole("gridcell").nth(index).click();
    await page.keyboard.press(String(saved.puzzle.solution[index]));
    await page.getByRole("button", { name: "Home", exact: true }).click();
    await page.getByRole("button", { name: "New game", exact: true }).click();
    await page.getByRole("button", { name: /^Medium/ }).click();
    await page.getByRole("dialog", { name: "Replace this game?" }).getByRole("button", { name: "Return to current game", exact: true }).click();
    await page.getByRole("gridcell").first().waitFor();
    assert.equal(await page.getByRole("dialog").count(), 0);
    const restored = await page.evaluate(() => JSON.parse(localStorage.getItem("sudoku.classic")));
    assert.deepEqual(restored.puzzle, saved.puzzle);
    assert.equal(restored.values[index], saved.puzzle.solution[index]);
    assert.equal(restored.level, "easy");
    await page.getByRole("button", { name: "Pause", exact: true }).click();
    await page.getByRole("dialog", { name: "Paused" }).getByRole("button", { name: "New game", exact: true }).click();
    await page.getByRole("dialog", { name: "Replace this game?" }).getByRole("button", { name: "Return to game", exact: true }).click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    assert.equal((await page.getByRole("gridcell").nth(index).innerText()).trim(), String(saved.puzzle.solution[index]));
    await page.screenshot({ path: `${out}/solo-phone.png`, fullPage: true });
  });
  await check("Canonical SOL search returns one result and keeps mint readable", async () => {
    await page.getByRole("button", { name: "Home", exact: true }).click();
    await page.getByRole("button", { name: /^LEADERBOARD Compete/i }).click();
    await page.getByRole("button", { name: "Create competition", exact: true }).click();
    await page.getByRole("button", { name: "For tokens", exact: true }).click();
    await page.locator(".quote-line").filter({ hasText: "per token" }).waitFor();
    await page.getByRole("button", { name: /Pick Your Token on Solana/ }).click();
    const dialog = page.getByRole("dialog", { name: "Pick Your Token on Solana" });
    await dialog.locator(".token-result").waitFor();
    assert.equal(await dialog.locator(".token-result").count(), 1);
    assert.match(await dialog.locator(".token-result").innerText(), /So11111111111111111111111111111111111111112/);
    await page.screenshot({ path: `${out}/token-picker-phone.png` });
    await dialog.getByRole("button", { name: "Back", exact: true }).click();
  });
  await check("POLIS search returns one issuer mint and selecting it updates precise conversions", async () => {
    await page.getByRole("button", { name: /Pick Your Token on Solana/ }).click();
    const dialog = page.getByRole("dialog", { name: "Pick Your Token on Solana" });
    await dialog.getByRole("textbox", { name: /Search by/ }).fill("polis");
    const result = dialog.locator(".token-result", { hasText: "POLIS" });
    await result.waitFor();
    assert.equal(await dialog.locator(".token-result").count(), 1);
    assert.match(await result.innerText(), /poLisWXnNRwC6oBu1vHiuKQzFjGL4XDSu4g9qjz9qVk/);
    await page.screenshot({ path: `${out}/polis-picker-phone.png` });
    await result.click();
    await page.locator(".quote-line").filter({ hasText: "Star Atlas DAO · POLIS" }).waitFor();
    assert.match(await page.locator(".quote-line").filter({ hasText: "per token" }).innerText(), /\$0\.\d{4,}/);
    const price = Number(await page.getByRole("spinbutton", { name: "USD value", exact: true }).inputValue());
    await page.getByRole("spinbutton", { name: "Token amount", exact: true }).fill("10");
    assert.ok(Math.abs(Number(await page.getByRole("spinbutton", { name: "USD value", exact: true }).inputValue()) - price * 10) < 1e-12);
    await page.getByRole("spinbutton", { name: "USD value", exact: true }).fill("50");
    assert.ok(Math.abs(Number(await page.getByRole("spinbutton", { name: "Token amount", exact: true }).inputValue()) * price - 50) < 1e-10);
  });
  await check("Star Atlas project search includes the official ATLAS mint", async () => {
    await page.getByRole("button", { name: /Pick Your Token on Solana/ }).click();
    const dialog = page.getByRole("dialog", { name: "Pick Your Token on Solana" });
    await dialog.getByRole("textbox", { name: /Search by/ }).fill("Star Atlas");
    const result = dialog.locator(".token-result", { hasText: "ATLASXmbPQxBUYbxPsV97usA3fPQYEqzQBUHgiFCUsXx" });
    await result.waitFor();
    assert.equal(await result.count(), 1);
    await result.click();
    await page.locator(".quote-line").filter({ hasText: "Star Atlas · ATLAS" }).waitFor();
    assert.match(await page.locator(".quote-line").filter({ hasText: "per token" }).innerText(), /\$0\.\d{5,}/);
  });
  await check("Broad BTC search works without registry credentials and selects a Solana mint", async () => {
    await page.getByRole("button", { name: /Pick Your Token on Solana/ }).click();
    const dialog = page.getByRole("dialog", { name: "Pick Your Token on Solana" });
    await dialog.getByRole("textbox", { name: /Search by/ }).fill("btc");
    const results = dialog.locator(".token-result", { hasText: "BTC" });
    await results.first().waitFor();
    const mints = await results.locator("small").allTextContents();
    assert.equal(mints.length, new Set(mints).size);
    const chosen = mints[0];
    await page.screenshot({ path: `${out}/solana-btc-picker.png` });
    await results.first().click();
    await page.locator(".quote-line").filter({ hasText: "BTC" }).waitFor();
    const quote = await page.request.get(`${origin}api/tokens?mint=${chosen}`);
    const data = await quote.json();
    assert.equal(data.tokens[0].mint, chosen);
    await page.getByRole("spinbutton", { name: "Token amount", exact: true }).fill("1");
    assert.ok(Number(await page.getByRole("spinbutton", { name: "USD value", exact: true }).inputValue()) > 0);
  });
  await check("Genuine server errors remain visible and useful", async () => {
    await page.getByRole("button", { name: "Browse rooms", exact: true }).click();
    await page.route("**/api/competitions/state", route => route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: "Competition not found. Check the room code." }) }));
    await page.getByLabel("Have a room code?").fill("FFFFFFFF");
    await page.getByRole("button", { name: "Find room", exact: true }).click();
    await page.getByRole("alert").filter({ hasText: "Competition not found. Check the room code." }).waitFor();
    await page.unroute("**/api/competitions/state");
  });
  await check("No uncaught browser errors", async () => assert.deepEqual(errors, []));
} finally {
  await context.close(); await browser.close();
  writeFileSync(`${out}/results.json`, JSON.stringify(results, null, 2));
}
if (results.some(result => !result.passed)) process.exitCode = 1;
