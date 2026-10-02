import { chromium } from "playwright";

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
await page.goto("https://sudoku.jamesbitarcade.workers.dev/", { waitUntil: "domcontentloaded" });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "domcontentloaded" });
await page.getByRole("button", { name: "Play classic" }).click();
await page.getByRole("button", { name: "Easy" }).click();
await page.getByRole("gridcell").first().waitFor();
const cells = page.getByRole("gridcell");
const count = await cells.count();
let empty = -1;
for (let index = 0; index < count; index++) {
  if (!(await cells.nth(index).innerText()).trim()) {
    empty = index;
    break;
  }
}
await cells.nth(empty).click();
await page.getByRole("button", { name: "Notes" }).click();
await page.locator(".pad button").nth(0).click();
const noted = await cells.nth(empty).innerText();
await page.getByRole("button", { name: "Undo" }).click();
const undone = await cells.nth(empty).innerText();
await page.getByRole("button", { name: "Pause" }).click();
await page.getByRole("button", { name: "Settings" }).click();
await page.getByRole("button", { name: "Midnight" }).click();
await page.getByRole("button", { name: "Done" }).click();
const theme = await page.evaluate(() => document.documentElement.dataset.theme ?? document.body.dataset.theme ?? getComputedStyle(document.documentElement).getPropertyValue("--bg"));
await page.getByRole("button", { name: "Resume" }).click();
await page.getByRole("button", { name: "Hint", exact: true }).click();
const hint = await page.locator(".choice-note").first().innerText();
console.log(JSON.stringify({
  kind: "live-classic-controls",
  empty,
  noted: noted.trim(),
  undone: undone.trim(),
  theme,
  hint: hint.slice(0, 120),
}));
await browser.close();
