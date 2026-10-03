import assert from "node:assert/strict";
import { chromium } from "playwright";

const browser = await chromium.launch({ channel: process.env.QA_BROWSER ?? "msedge" });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/api/competitions/config", route => route.fulfill({ json: {
    enabled: true, cluster: "devnet", mint: "test-mint", decimals: 6,
    playMs: 1800000, graceMs: 3600000, testerFaucet: true,
  } }));
  await page.route("**/api/tokens?*", route => route.fulfill({ json: { tokens: [{
    mint: "So11111111111111111111111111111111111111112", symbol: "SOL", name: "Solana",
    priceUsd: 100, priceUsdExact: "100", updatedAt: Date.now(),
  }] } }));
  await page.goto(process.env.QA_ORIGIN ?? "http://127.0.0.1:5181/");
  await page.getByRole("button", { name: /Compete/, exact: false }).first().click();
  await page.getByRole("group", { name: "Competition navigation" }).getByRole("button", { name: "Create competition", exact: true }).click();
  await page.getByRole("button", { name: "For tokens", exact: true }).click();
  await page.getByLabel("Token amount").fill("1.234567");
  assert.equal(await page.getByRole("button", { name: "Create room", exact: true }).isEnabled(), true);
  assert.equal(await page.getByLabel("USD value").isDisabled(), true);
  await page.getByRole("button", { name: /Choose token/ }).click();
  assert.equal(await page.getByLabel("Search by name, symbol, or mint address").isVisible(), true);
  await page.getByRole("button", { name: "SOL", exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[aria-label="USD value"]')?.disabled === false);
  await page.getByLabel("USD value").fill("250");
  assert.equal(await page.getByLabel("Token amount").inputValue(), "2.5");
  assert.equal(await page.getByRole("button", { name: "Create room", exact: true }).isDisabled(), true);
  await page.getByRole("button", { name: /Choose token/ }).click();
  await page.getByRole("button", { name: "TEST · available", exact: true }).click();
  await page.getByLabel("Token amount").fill("0.25");
  assert.equal(await page.getByRole("button", { name: "Create room", exact: true }).isEnabled(), true);
  assert.deepEqual(errors, []);
  console.log("PASS: custom TEST stake, searchable picker, SOL/USD exploration, unsupported execution blocked, return to TEST; no browser errors.");
} finally { await browser.close(); }
