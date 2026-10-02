import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

mkdirSync("output", { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();
await page.goto("https://sudoku.jamesbitarcade.workers.dev/", { waitUntil: "domcontentloaded" });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "domcontentloaded" });

await page.getByRole("button", { name: "Settings" }).click();
await page.getByRole("button", { name: "Midnight" }).click();
await page.getByRole("button", { name: "Done" }).click();
await page.screenshot({ path: "output/theme-midnight-home.png" });

await page.getByRole("button", { name: "Play classic" }).click();
await page.getByRole("button", { name: "Easy" }).click();
await page.getByRole("gridcell").first().waitFor();
await page.screenshot({ path: "output/theme-midnight-board.png" });
await page.getByRole("button", { name: "Pause" }).click();
await page.getByRole("button", { name: "Settings" }).click();
await page.getByRole("button", { name: "Arcade" }).click();
await page.getByRole("button", { name: "Done" }).click();
await page.getByRole("button", { name: "Resume" }).click();
const cells = await page.getByRole("gridcell").count();
await page.screenshot({ path: "output/theme-arcade-board.png" });

await page.getByRole("button", { name: "Hint", exact: true }).click();
const firstNotes = await page.locator(".game .choice-note").allInnerTexts();
await page.getByRole("button", { name: "Hint", exact: true }).click();
const secondNotes = await page.locator(".game .choice-note").allInnerTexts();
await page.screenshot({ path: "output/hint-board.png" });

await context.setOffline(true);
await page.getByRole("button", { name: "Hint", exact: true }).click();
const offlineNotes = await page.locator(".game .choice-note").allInnerTexts();
await context.setOffline(false);

await page.reload({ waitUntil: "domcontentloaded" });
const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("sudoku.classic") ?? "null"));
const placed = secondNotes.join(" ").match(/row (\d+), column (\d+)\. The digit is (\d)/);
const placedIndex = placed ? (Number(placed[1]) - 1) * 9 + (Number(placed[2]) - 1) : null;
const digitMatches = placedIndex != null && saved?.puzzle?.solution?.[placedIndex] === Number(placed[3]);
const theme = await page.evaluate(() => document.documentElement.dataset.theme || "light");
const restored = await page.getByRole("gridcell").count();
await page.screenshot({ path: "output/theme-arcade-restored.png" });

await page.getByRole("button", { name: "Home" }).click();
await page.getByRole("button", { name: "Settings" }).click();
const selected = await page.locator(".segment button.on").innerText();
await page.getByRole("button", { name: "Done" }).click();
await page.getByRole("button", { name: "Compete" }).click();
await page.getByRole("button", { name: "For tokens" }).waitFor();
await page.screenshot({ path: "output/theme-arcade-compete.png" });

console.log(JSON.stringify({
  cells,
  firstHasDigit: firstNotes.some((line) => /The digit is/.test(line)),
  secondHasDigit: secondNotes.some((line) => /The digit is \d/.test(line)),
  digitMatches,
  firstNotes,
  secondNotes,
  offlineNotes,
  theme,
  restored,
  selected,
}));
await browser.close();
