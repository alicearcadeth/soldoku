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
await page.goto(`chrome-extension://bfnaelmomeimhlpmgjnjophhpkkoljpa/onboarding.html`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);
const buttons = await page.getByRole("button").allTextContents();
const headings = await page.getByRole("heading").allTextContents();
console.log(JSON.stringify({
  buttons: buttons.map((item) => item.trim()).filter(Boolean).slice(0, 20),
  headings: headings.map((item) => item.trim()).filter(Boolean).slice(0, 8),
}));
await context.close();
