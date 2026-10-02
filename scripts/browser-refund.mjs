import { chromium } from "playwright";

const base = "http://127.0.0.1:5173";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const hostContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
const guestContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
const host = await hostContext.newPage();
const guest = await guestContext.newPage();

await openStaked(host);
await openStaked(guest);
await slide(host);
await host.getByRole("button", { name: "easy" }).click();
await host.getByRole("button", { name: "Create room" }).click();
const code = (await host.locator(".bar-mid strong").textContent())?.trim();
if (!code) throw new Error("room code missing");
await host.getByRole("button", { name: "Deposit stake" }).click();
await host.getByText("Waiting for the other deposit").waitFor({ timeout: 60_000 });

const bad = await host.evaluate(async () => {
  const seat = JSON.parse(localStorage.getItem("sudoku.seat") ?? "{}");
  const response = await fetch("/api/rooms/deposit", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...seat, tx: "aaaa" }),
  });
  const data = await response.json();
  return { ok: response.ok, error: data.error ?? "" };
});
if (bad.ok) throw new Error("bad deposit was accepted");

await host.getByRole("button", { name: "Refund stake" }).click();
await host.locator(".choice-note").waitFor({ timeout: 30_000 });
const early = await host.locator("body").innerText();
if (early.includes("Refund confirmed on-chain.")) throw new Error("early refund was shown as confirmed");
await host.waitForTimeout(50_000);
await host.getByRole("button", { name: "Refund stake" }).click();
try {
  await host.getByText("Refund confirmed on-chain.").waitFor({ timeout: 30_000 });
} catch (error) {
  console.log(await host.locator("body").innerText());
  throw error;
}
await host.getByRole("button", { name: "Refund stake" }).waitFor({ state: "hidden", timeout: 5_000 }).catch(() => undefined);
await host.reload();
await host.getByText("Refund confirmed on-chain.").waitFor({ timeout: 20_000 });
console.log("resume ok");

await slide(guest);
await guest.locator("input.code").fill(code);
const joinText = await guest.locator("body").innerText();
if (!joinText.includes("Pass") && !joinText.includes("Create room")) {
  // Guest still has to pass the slider before join is meaningful.
}
await guest.getByRole("button", { name: "Join room" }).click();
await guest.getByText("Deposits are closed.").waitFor({ timeout: 20_000 });
console.log(`REFUND_UI_OK ${code} bad=${bad.error}`);
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
