import { chromium } from "playwright";

const base = "http://127.0.0.1:5173";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const host = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
const guest = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
await openStaked(host);
await openStaked(guest);
await slide(host);
await host.getByRole("button", { name: "Short clock" }).click();
await host.getByRole("button", { name: "easy" }).click();
await host.getByRole("button", { name: "Create room" }).click();
const code = (await host.locator(".bar-mid strong").textContent())?.trim();
if (!code) throw new Error("room code missing");
await host.getByRole("button", { name: "Deposit stake" }).click();
await host.getByText("Waiting for the other deposit").waitFor({ timeout: 60_000 });
await slide(guest);
await guest.locator("input.code").fill(code);
await guest.getByRole("button", { name: "Join room" }).click();
await guest.getByRole("button", { name: "Deposit stake" }).click();
await host.getByText(/^\d+:\d+$/).waitFor({ timeout: 60_000 });

await guest.evaluate(() => localStorage.removeItem("sudoku.seat"));
await guest.goto(base);
await guest.getByRole("button", { name: "Compete" }).click();
await guest.getByRole("button", { name: "For tokens" }).click();
await guest.locator("input.code").fill(code);
await guest.getByRole("button", { name: "Resume with this wallet" }).click();
await guest.locator(".bar-mid strong", { hasText: code }).waitFor({ timeout: 20_000 });

await host.getByRole("heading", { name: "Tie" }).waitFor({ timeout: 45_000 });
await host.getByText("The vault payment is confirmed on-chain.").waitFor({ timeout: 40_000 });
const funds = await fetch(`${base}/api/rooms/funds?code=${code}`).then((response) => response.json());
if (funds.status !== 2 || funds.outcome !== 3) throw new Error(`unexpected chain ${JSON.stringify(funds)}`);
console.log(`DRAW_UI_OK ${code} status=${funds.status} outcome=${funds.outcome} a=${funds.balanceA} b=${funds.balanceB}`);
await browser.close();

async function openStaked(page) {
  await page.goto(base);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
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
