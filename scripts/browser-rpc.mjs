import { chromium } from "playwright";

const base = process.env.GAME_URL ?? "http://127.0.0.1:5174";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
await page.goto(base, { waitUntil: "domcontentloaded" });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "domcontentloaded" });
await page.getByRole("button", { name: "Play classic" }).click();
await page.getByRole("button", { name: /Easy/ }).click();
await page.getByRole("gridcell", { name: /empty/ }).first().waitFor({ timeout: 20_000 });
console.log("CLASSIC_OK");
await page.getByRole("button", { name: "Home" }).click();
await page.getByRole("button", { name: "Compete" }).click();
await page.getByRole("button", { name: "For tokens" }).click();
const walletButton = page.getByRole("button", { name: "Create test wallet" });
if (await walletButton.count()) {
  await walletButton.click();
  await page.getByText(/ready|did not answer|No RPC|unavailable|Transaction status is unknown/i).waitFor({ timeout: 30_000 });
}
const note = await page.locator("body").innerText();
if (process.env.EXPECT_DOWN === "1") {
  if (!/did not answer|No RPC|unavailable|failed|429|circuit/i.test(note)) {
    throw new Error(`expected an RPC failure, saw: ${note.slice(0, 400)}`);
  }
  if (/vault payment is confirmed|Deposit confirmed/i.test(note)) throw new Error("funds were marked confirmed while RPC was down");
  console.log("RPC_DOWN_OK");
  await browser.close();
  process.exit(0);
}
await page.getByRole("button", { name: /ready/ }).waitFor({ timeout: 60_000 });
const slider = page.locator(".slider");
const box = await slider.boundingBox();
const style = await page.locator(".notch").getAttribute("style");
const percent = Number(style?.match(/[\d.]+/)?.[0] ?? "0") / 100;
await page.mouse.click(box.x + box.width * percent, box.y + box.height / 2);
await page.getByRole("button", { name: "Short clock" }).click();
await page.getByRole("button", { name: "Create room" }).click();
await page.getByRole("button", { name: "Deposit stake" }).click();
await page.getByText(/Waiting for the other deposit|Deposit status is unknown|expired|did not answer/).waitFor({ timeout: 40_000 });
const after = await page.locator("body").innerText();
if (!after.includes("Waiting for the other deposit")) throw new Error(after.slice(0, 500));
console.log("DEPOSIT_OK");
await browser.close();
