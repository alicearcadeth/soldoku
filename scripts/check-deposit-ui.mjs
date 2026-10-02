import { chromium } from "playwright";

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
const prepares = [];
const deposits = [];
await page.route("**/api/rooms/state**", async (route) => {
  const board = Array(81).fill(0);
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      code: "74RM",
      level: "easy",
      givens: board,
      board,
      limitMs: 900000,
      startedAt: null,
      staked: true,
      matchId: "1",
      you: { filled: 0, finished: false, deposited: false, wallet: "wallet" },
      opponent: { joined: true, filled: 0, finished: false, deposited: false },
      verdict: null,
      youWon: null,
      chain: "pending",
      settleFailures: 0,
      listed: false,
    }),
  });
});
await page.route("**/api/rooms/prepare", async (route) => {
  prepares.push(1);
  await route.continue();
});
await page.route("**/api/rooms/deposit", async (route) => {
  deposits.push(JSON.parse(route.request().postData() ?? "{}").tx);
  await route.fulfill({
    status: 400,
    contentType: "application/json",
    body: JSON.stringify({ error: "Deposit status is unknown. The same signature will be checked again." }),
  });
});
await page.goto("https://sudoku.jamesbitarcade.workers.dev/", { waitUntil: "domcontentloaded" });
await page.evaluate(() => {
  localStorage.setItem("sudoku.seat", JSON.stringify({ code: "74RM", playerId: "77acecf68608be1b" }));
  localStorage.setItem("sudoku.pending", JSON.stringify({ code: "74RM", playerId: "77acecf68608be1b", tx: "same-signed-bytes" }));
});
await page.reload({ waitUntil: "domcontentloaded" });
await page.getByRole("button", { name: "Check deposit" }).waitFor({ timeout: 20_000 });
await page.getByRole("button", { name: "Check deposit" }).click();
await page.waitForTimeout(500);
console.log(JSON.stringify({
  kind: "hosted-ui-mock-response",
  prepares: prepares.length,
  depositPosts: deposits.length,
  sameBody: deposits.length >= 2 && deposits[0] === deposits[1],
}));
await browser.close();
