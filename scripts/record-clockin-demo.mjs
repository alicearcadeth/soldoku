import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const site = "https://sudoku.jamesbitarcade.workers.dev/";
mkdirSync("submission/captures", { recursive: true });

function solveUnique(givens) {
  const grid = givens.slice();
  const found = [];
  const ok = (index, digit) => {
    const row = Math.floor(index / 9);
    const col = index % 9;
    for (let i = 0; i < 9; i++) {
      if (grid[row * 9 + i] === digit || grid[i * 9 + col] === digit) return false;
    }
    const boxRow = Math.floor(row / 3) * 3;
    const boxCol = Math.floor(col / 3) * 3;
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
      if (grid[(boxRow + r) * 9 + boxCol + c] === digit) return false;
    }
    return true;
  };
  const walk = () => {
    if (found.length > 1) return;
    const index = grid.indexOf(0);
    if (index < 0) {
      found.push(grid.slice());
      return;
    }
    for (let digit = 1; digit <= 9; digit++) {
      if (!ok(index, digit)) continue;
      grid[index] = digit;
      walk();
      grid[index] = 0;
      if (found.length > 1) return;
    }
  };
  walk();
  if (found.length !== 1) throw new Error("puzzle is not unique");
  return found[0];
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function post(path, body) {
  const response = await fetch(site + path.replace(/^\//, ""), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${path} ${response.status} ${text}`);
  return JSON.parse(text);
}
async function move(code, playerId, values) {
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      return await post("api/rooms/move", { code, playerId, values });
    } catch (error) {
      if (!/Slow down|That finish was rejected/.test(String(error)) || attempt === 7) throw error;
      await sleep(800);
    }
  }
}

const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: "chrome" }),
});
const context = await browser.newContext({
  viewport: { width: 400, height: 890 },
  recordVideo: { dir: "submission/captures", size: { width: 400, height: 890 } },
});
const guestContext = await browser.newContext({ viewport: { width: 400, height: 890 } });
const page = await context.newPage();
const guest = await guestContext.newPage();
page.setDefaultTimeout(20000);
guest.setDefaultTimeout(20000);

await page.goto(site, { waitUntil: "domcontentloaded" });
await page.getByRole("heading", { name: "Sudoku" }).waitFor();
await page.waitForTimeout(1500);
await page.getByRole("button", { name: /Play classic/ }).click();
await page.getByRole("button", { name: "Easy" }).click();
await page.getByRole("button", { name: "Pause" }).waitFor();
await page.waitForTimeout(800);
const puzzle = await page.evaluate(() => JSON.parse(localStorage.getItem("sudoku.classic")).puzzle);
const empties = [];
for (let index = 0; index < 81; index++) if (puzzle.givens[index] === 0) empties.push(index);
for (const index of empties.slice(0, 2)) {
  await page.locator(".board .cell").nth(index).click();
  await page.locator(".pad button").nth(puzzle.solution[index] - 1).click();
  await page.waitForTimeout(400);
}
await page.getByRole("button", { name: "Notes" }).click();
await page.locator(".pad button").nth(0).click();
await page.waitForTimeout(700);
await page.getByRole("button", { name: "Notes on" }).click();
await page.getByRole("button", { name: "Hint" }).click();
await page.waitForTimeout(1200);
await page.getByRole("button", { name: "Pause" }).click();
await page.getByText("The clock counts only while you are playing.").waitFor();
await page.waitForTimeout(1200);
await page.getByRole("button", { name: "Resume" }).click();
await page.getByRole("button", { name: "Home" }).click();
await page.getByRole("button", { name: "Settings" }).click();
await page.getByRole("button", { name: "Dark" }).click();
await page.getByRole("button", { name: "Easy Read" }).click();
await page.waitForTimeout(800);
await page.getByRole("button", { name: "Done" }).click();
await page.getByRole("button", { name: /Practice/ }).click();
await page.getByRole("button", { name: "Create room" }).click();
await page.getByText(/Share code/).waitFor();
const code = (await page.locator(".bar-mid strong").innerText()).trim();
await guest.goto(site, { waitUntil: "domcontentloaded" });
await guest.getByRole("button", { name: /Practice/ }).click();
await guest.getByLabel("Room code").fill(code);
await guest.getByRole("button", { name: "Join room" }).click();
await page.waitForFunction(() => {
  const text = document.querySelector(".bar-mid span")?.textContent ?? "";
  return text !== "Waiting" && text.includes(":");
});
await page.waitForTimeout(800);
const seat = await page.evaluate(() => JSON.parse(localStorage.getItem("sudoku.seat")));
const state = await (await fetch(`${site}api/rooms/state?code=${code}&playerId=${seat.playerId}`)).json();
const solution = solveUnique(state.givens);
const board = state.board.slice();
for (let index = 0; index < 81; index++) {
  if (board[index] !== 0) continue;
  board[index] = solution[index];
  await move(code, seat.playerId, board.slice());
  await sleep(420);
}
await page.getByRole("heading", { name: "You won" }).waitFor();
await page.waitForTimeout(2200);
await page.getByRole("dialog").getByRole("button", { name: "Home" }).click();
await page.getByRole("button", { name: /Compete/ }).click();
await page.getByRole("button", { name: "For tokens" }).click();
await page.locator(".alert", { hasText: "New deposits are paused" }).scrollIntoViewIfNeeded();
await page.waitForTimeout(2500);

const video = page.video();
await context.close();
await guestContext.close();
await browser.close();
console.log(await video?.path());
