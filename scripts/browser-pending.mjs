import { chromium } from "playwright";

const base = "http://127.0.0.1:5173";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const host = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
const guest = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();

async function openStaked(page) {
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Compete" }).click();
  await page.getByRole("button", { name: "For tokens" }).click();
  await page.getByRole("button", { name: "Create test wallet" }).click();
  await page.getByRole("button", { name: /ready/ }).waitFor({ timeout: 60_000 });
}

async function slide(page) {
  const slider = page.locator(".slider");
  const box = await slider.boundingBox();
  const style = await page.locator(".notch").getAttribute("style");
  const percent = Number(style?.match(/[\d.]+/)?.[0] ?? "0") / 100;
  await page.mouse.click(box.x + box.width * percent, box.y + box.height / 2);
}

await openStaked(host);
await openStaked(guest);
await slide(host);
await host.getByRole("button", { name: "Short clock" }).click();
await host.getByRole("button", { name: "easy" }).click();
await host.getByRole("button", { name: "Create room" }).click();
const code = (await host.locator(".bar-mid strong").textContent())?.trim();
if (!code) throw new Error("room code missing");

await host.route("**/api/rooms/deposit", (route) => route.abort());
await host.getByRole("button", { name: "Deposit stake" }).click();
await host.getByText(/not confirmed|Failed to fetch|NetworkError|aborted/i).waitFor({ timeout: 20_000 });
const pending = await host.evaluate(() => localStorage.getItem("sudoku.pending"));
if (!pending) throw new Error("pending deposit was not saved");
await host.unroute("**/api/rooms/deposit");
await host.reload();
await host.getByText("Waiting for the other deposit").waitFor({ timeout: 60_000 });

await slide(guest);
await guest.locator("input.code").fill(code);
await guest.getByRole("button", { name: "Join room" }).click();
await guest.getByRole("button", { name: "Deposit stake" }).click();
await host.getByText(/^\d+:\d+$/).waitFor({ timeout: 60_000 });
await fetch(`${base}/api/rooms/fail-settle`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ code }),
});
await host.getByText("The vault payment is confirmed on-chain.").waitFor({ timeout: 50_000 });
const seat = JSON.parse(await host.evaluate(() => localStorage.getItem("sudoku.seat") ?? "{}"));
const view = await fetch(`${base}/api/rooms/state?code=${code}&playerId=${seat.playerId}`).then((response) => response.json());
const funds = await fetch(`${base}/api/rooms/funds?code=${code}`).then((response) => response.json());
if (view.settleFailures < 1 || funds.status !== 2 || funds.outcome !== 3) {
  throw new Error(JSON.stringify({ failures: view.settleFailures, funds }));
}
console.log(`PENDING_UI_OK ${code} failures=${view.settleFailures} a=${funds.balanceA} b=${funds.balanceB}`);
await browser.close();
