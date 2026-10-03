import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";
const origin = process.env.QA_ORIGIN ?? "http://127.0.0.1:5174/";
const out = "output/refinement-check";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {});
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
  await check("Funded creation exposes only the configured Devnet TEST mint and clear stake presets", async () => {
    await page.getByRole("button", { name: "Home", exact: true }).click();
    await page.getByRole("button", { name: /^LEADERBOARD Compete/i }).click();
    await page.getByRole("group", { name: "Competition navigation" }).getByRole("button", { name: "Create competition", exact: true }).click();
    await page.getByRole("button", { name: "For tokens", exact: true }).click();
    const config = await (await page.request.get(`${origin}api/competitions/config`)).json();
    assert.equal(config.enabled, true); assert.equal(config.cluster, "devnet");
    await page.locator(".token-mint").filter({ hasText: config.mint }).waitFor();
    for (const amount of [1, 2, 5]) {
      await page.getByRole("button", { name: `${amount} TEST`, exact: true }).click();
      assert.equal(await page.getByRole("textbox", { name: "TEST stake", exact: true }).inputValue(), String(amount));
    }
    assert.equal(await page.getByRole("button", { name: /Pick Your Token on Solana/ }).count(), 0);
    assert.match(await page.locator("body").innerText(), /TEST TOKENS · NO CASH VALUE/);
    for (const width of [320, 360, 390, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `Overflow at ${width}`);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: `${out}/test-token-phone.png`, fullPage: true });
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
