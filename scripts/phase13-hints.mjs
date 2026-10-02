import { chromium } from "playwright";

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
await page.goto("https://sudoku.jamesbitarcade.workers.dev/", { waitUntil: "domcontentloaded" });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "domcontentloaded" });

const home = await page.locator("main.app").innerText();
await page.getByRole("button", { name: "Play classic" }).click();
await page.getByRole("button", { name: "Medium" }).click();
await page.getByRole("gridcell").first().waitFor();

const seen = [];
let advanced = false;
let elimination = null;
for (let step = 0; step < 50; step++) {
  await page.getByRole("button", { name: "Hint", exact: true }).click();
  let note = (await page.locator(".game .choice-note").first().innerText());
  if (note.includes("The digit is") === false && /row \d+, column \d+/.test(note)) {
    await page.getByRole("button", { name: "Hint", exact: true }).click();
    note = await page.locator(".game .choice-note").first().innerText();
  }
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("sudoku.classic") ?? "null"));
  const mask = (saved?.deduced ?? []).reduce((sum, bits) => sum + bits, 0);
  seen.push(note.slice(0, 160));
  const placed = note.match(/row (\d+), column (\d+)\. The digit is (\d)/);
  if (placed) {
    const index = (Number(placed[1]) - 1) * 9 + (Number(placed[2]) - 1);
    await page.getByRole("gridcell").nth(index).click();
    await page.locator(".pad button").nth(Number(placed[3]) - 1).click();
    continue;
  }
  if (note.includes("does not fill a cell")) {
    elimination = { step, mask, note: note.slice(0, 200) };
    await page.getByRole("button", { name: "Hint", exact: true }).click();
    const next = await page.locator(".game .choice-note").first().innerText();
    const again = await page.evaluate(() => JSON.parse(localStorage.getItem("sudoku.classic") ?? "null"));
    advanced = next !== note;
    seen.push(next.slice(0, 160));
    elimination.nextMask = (again?.deduced ?? []).reduce((sum, bits) => sum + bits, 0);
    elimination.next = next.slice(0, 200);
    break;
  }
}

const bundle = await page.evaluate(() => [...document.scripts].map((script) => script.src).filter(Boolean));
console.log(JSON.stringify({ bundle, elimination, advanced, seen: seen.slice(0, 8), home: home.slice(0, 500) }, null, 2));
await browser.close();
