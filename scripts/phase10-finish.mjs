import { chromium } from "playwright";

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
await page.goto("https://sudoku.jamesbitarcade.workers.dev/", { waitUntil: "domcontentloaded" });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "domcontentloaded" });
await page.getByRole("button", { name: "Play classic" }).click();
await page.getByRole("button", { name: "Easy" }).click();
await page.getByRole("gridcell").first().waitFor();

const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("sudoku.classic")));
const empty = saved.values.findIndex((value) => value === 0);
await page.getByRole("gridcell").nth(empty).click();
await page.getByRole("button", { name: "Notes" }).click();
await page.locator(".pad button").nth(0).click();
await page.getByRole("button", { name: "Undo" }).click();
await page.getByRole("button", { name: "Notes" }).click();
const afterUndo = await page.evaluate((index) => JSON.parse(localStorage.getItem("sudoku.classic")).notes[index], empty);

for (let index = 0; index < 81; index++) {
  if (saved.values[index]) continue;
  await page.getByRole("gridcell").nth(index).click();
  await page.locator(".pad button").nth(saved.puzzle.solution[index] - 1).click();
}
await page.getByRole("heading", { name: "Solved" }).waitFor();
const pending = page.waitForRequest((request) => request.url().includes("/api/coach"));
await page.getByRole("button", { name: "Coach" }).click();
const coachRequest = await pending;
const coachResponse = await coachRequest.response();
const coach = await coachResponse.json();
const sheet = await page.locator(".sheet").innerText();
const journal = await page.evaluate(() => localStorage.getItem("sudoku.journal"));
console.log(JSON.stringify({
  afterUndo,
  request: coachRequest.postData(),
  coachStatus: coachResponse.status(),
  coachSource: coach.source,
  sheetHasGrid: /\d{20}/.test(sheet.replace(/\s/g, "")),
  sheet,
  journal,
}));
await page.locator(".sheet").getByRole("button", { name: "Home" }).click();
await page.getByRole("button", { name: "Compete" }).click();
await page.getByRole("button", { name: "For tokens" }).waitFor();
const hintButtons = await page.getByRole("button", { name: "Hint" }).count();
console.log(JSON.stringify({ hintButtons }));
await browser.close();
