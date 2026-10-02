import { chromium } from "playwright";

const base = process.argv[2] ?? "https://sudoku.jamesbitarcade.workers.dev/";
const browser = await chromium.launch({ channel: "chrome", headless: true });

async function open() {
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "domcontentloaded" });
  return page;
}

async function notch(page) {
  const box = await page.locator(".notch").boundingBox();
  if (!box) throw new Error("slider notch missing");
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForFunction(() => {
    const button = [...document.querySelectorAll("button")].find((el) => el.textContent === "Create room");
    return button && !button.disabled;
  });
}

const page = await open();
await page.getByRole("button", { name: "Play classic" }).click();
await page.getByRole("button", { name: "Easy" }).click();
await page.getByRole("gridcell").first().waitFor();
const cells = page.getByRole("gridcell");
const puzzle = await page.evaluate(() => JSON.parse(localStorage.getItem("sudoku.classic")).puzzle.solution);
let firstEmpty = -1;
for (let index = 0; index < 81; index++) {
  if (!(await cells.nth(index).innerText()).trim()) {
    firstEmpty = index;
    break;
  }
}
await cells.nth(firstEmpty).click();
await page.locator(".pad button").nth(puzzle[firstEmpty] - 1).click();
await page.reload({ waitUntil: "domcontentloaded" });
await page.getByRole("gridcell").first().waitFor();
const solvedTooEarly = await page.getByRole("heading", { name: "Solved" }).count();

for (let index = 0; index < 81; index++) {
  const shown = (await cells.nth(index).innerText()).trim();
  if (shown === String(puzzle[index])) continue;
  await cells.nth(index).click();
  await page.locator(".pad button").nth(puzzle[index] - 1).click();
}
await page.getByRole("heading", { name: "Solved" }).waitFor();
await page.reload({ waitUntil: "domcontentloaded" });
await page.getByRole("heading", { name: "Solved" }).waitFor();

const host = await open();
await host.getByRole("button", { name: "Compete" }).click();
await host.getByRole("button", { name: "Practice" }).click();
await host.getByRole("button", { name: "Create room" }).click();
await host.locator(".bar-mid strong").waitFor({ timeout: 20_000 });
const code = (await host.locator(".bar-mid strong").textContent())?.trim();
const guest = await open();
await guest.getByRole("button", { name: "Compete" }).click();
await guest.getByRole("button", { name: "Practice" }).click();
await guest.locator("input.code").fill(code);
await guest.getByRole("button", { name: "Join room" }).click();
await guest.getByText("Playing", { exact: true }).waitFor({ timeout: 20_000 });
const late = await open();
await late.getByRole("button", { name: "Compete" }).click();
await late.getByRole("button", { name: "Practice" }).click();
await late.locator("input.code").fill(code);
await late.getByRole("button", { name: "Join room" }).click();
await late.getByText("That room is full").waitFor({ timeout: 20_000 });

console.log(JSON.stringify({ solvedTooEarly, resumedSolved: true, code, thirdPlayer: "full" }));
await browser.close();
