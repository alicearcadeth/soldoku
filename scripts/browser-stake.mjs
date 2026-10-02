import { chromium } from "playwright";

const base = "http://127.0.0.1:5173";

const browser = await chromium.launch({ channel: "chrome", headless: true });
const host = await browser.newContext({ viewport: { width: 390, height: 844 } });
const guest = await browser.newContext({ viewport: { width: 390, height: 844 } });
const hostPage = await host.newPage();
const guestPage = await guest.newPage();

await hostPage.goto(base);
await guestPage.goto(base);
await hostPage.getByRole("button", { name: "Compete" }).click();
await guestPage.getByRole("button", { name: "Compete" }).click();
await hostPage.getByRole("button", { name: "For tokens" }).click();
await guestPage.getByRole("button", { name: "For tokens" }).click();
await hostPage.getByRole("button", { name: "Create test wallet" }).click();
await guestPage.getByRole("button", { name: "Create test wallet" }).click();
await hostPage.getByRole("button", { name: /ready/ }).waitFor({ timeout: 60_000 });
await guestPage.getByRole("button", { name: /ready/ }).waitFor({ timeout: 60_000 });

await slide(hostPage);
await hostPage.getByRole("button", { name: "easy" }).click();
await hostPage.getByRole("button", { name: "Create room" }).click();
const code = (await hostPage.locator(".bar-mid strong").textContent())?.trim();
if (!code) throw new Error("room code missing");

await slide(guestPage);
await guestPage.locator("input.code").fill(code);
await guestPage.getByRole("button", { name: "Join room" }).click();
await hostPage.getByRole("button", { name: "Deposit stake" }).click();
await hostPage.getByText("Waiting for the other deposit").waitFor({ timeout: 60_000 });
await guestPage.getByRole("button", { name: "Deposit stake" }).click();
await hostPage.getByText(/^\d+:\d+$/).waitFor({ timeout: 60_000 });

const solution = await fetch(`${base}/api/rooms/solution?code=${code}`).then((response) => response.json());
await play(hostPage, solution.solution);
await hostPage.getByText("The vault payment is confirmed on localnet.").waitFor({ timeout: 60_000 });
console.log(`STAKED_UI_OK ${code}`);
await browser.close();

async function slide(page) {
  const slider = page.locator(".slider");
  const box = await slider.boundingBox();
  const style = await page.locator(".notch").getAttribute("style");
  const percent = Number(style?.match(/[\d.]+/)?.[0] ?? "0") / 100;
  await page.mouse.click(box.x + box.width * percent, box.y + box.height / 2);
  await page.getByRole("button", { name: "Create room" }).waitFor();
}

async function play(page, solution) {
  const cells = page.locator(".cell");
  for (let index = 0; index < 81; index++) {
    const text = (await cells.nth(index).textContent())?.trim();
    if (text) continue;
    await cells.nth(index).click();
    await page.locator(".pad button", { hasText: new RegExp(`^${solution[index]}$`) }).click();
    await page.waitForTimeout(450);
  }
}
