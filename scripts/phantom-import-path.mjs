import { chromium } from "playwright";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const extension = process.env.PHANTOM_EXTENSION_DIR;
if (!extension) {
  console.error("Set PHANTOM_EXTENSION_DIR to an unpacked Phantom extension. This helper is optional.");
  process.exit(1);
}
const profile = mkdtempSync(join(tmpdir(), "sudoku-phantom-"));
const context = await chromium.launchPersistentContext(profile, {
  channel: "msedge",
  headless: false,
  args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
});
const page = await context.newPage();
await page.goto("chrome-extension://bfnaelmomeimhlpmgjnjophhpkkoljpa/onboarding.html", { waitUntil: "domcontentloaded" });
await page.getByRole("button", { name: "I Already Have a Wallet" }).click();
await page.waitForTimeout(1500);
const first = await page.getByRole("button").allTextContents();
const importButton = page.getByRole("button", { name: /private key/i });
if (await importButton.count()) await importButton.first().click();
await page.waitForTimeout(1500);
const labels = await page.locator("input, textarea").evaluateAll((nodes) => nodes.map((node) => ({
  tag: node.tagName,
  type: node.getAttribute("type"),
  placeholder: node.getAttribute("placeholder"),
  name: node.getAttribute("name"),
  aria: node.getAttribute("aria-label"),
})));
const buttons = await page.getByRole("button").allTextContents();
console.log(JSON.stringify({
  choices: first.map((item) => item.trim()).filter(Boolean).slice(0, 12),
  fields: labels,
  buttons: buttons.map((item) => item.trim()).filter(Boolean).slice(0, 12),
}));
await context.close();
