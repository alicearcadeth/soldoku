import { chromium } from "playwright";

const base = "http://127.0.0.1:5173";
const browser = await chromium.launch({ channel: "chrome", headless: true });

async function page() {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const view = await context.newPage();
  await view.goto(base, { waitUntil: "domcontentloaded" });
  await view.evaluate(() => localStorage.clear());
  await view.reload({ waitUntil: "domcontentloaded" });
  return view;
}

const classic = await page();
await classic.getByRole("button", { name: "Play classic" }).click();
await classic.getByRole("button", { name: /Easy/ }).click();
await classic.getByRole("gridcell", { name: /empty/ }).first().click();
await classic.locator(".pad button").filter({ hasText: /^1/ }).click();
const entered = await classic.getByRole("gridcell", { name: /entered 1/ }).first().getAttribute("aria-label");
const mistakes = await classic.locator(".status").textContent();
await classic.reload({ waitUntil: "domcontentloaded" });
await classic.getByRole("gridcell", { name: entered }).waitFor({ timeout: 20_000 });
const mistakesAfter = await classic.locator(".status").textContent();
if (mistakesAfter !== mistakes) throw new Error(`mistakes changed from ${mistakes} to ${mistakesAfter}`);

const host = await page();
const guest = await page();
await host.getByRole("button", { name: "Compete" }).click();
await host.getByRole("button", { name: /ready/ }).waitFor({ timeout: 5_000 }).catch(() => {});
const slider = host.locator(".slider");
const box = await slider.boundingBox();
const style = await host.locator(".notch").getAttribute("style");
const percent = Number(style?.match(/[\d.]+/)?.[0] ?? "0") / 100;
await host.mouse.click(box.x + box.width * percent, box.y + box.height / 2);
await host.getByRole("button", { name: "Create room" }).click();
const code = (await host.locator(".bar-mid strong").textContent())?.trim();
if (!code) throw new Error("room code missing");
await guest.getByRole("button", { name: "Compete" }).click();
await guest.locator(".slider").waitFor();
const guestBox = await guest.locator(".slider").boundingBox();
const guestStyle = await guest.locator(".notch").getAttribute("style");
const guestPercent = Number(guestStyle?.match(/[\d.]+/)?.[0] ?? "0") / 100;
await guest.mouse.click(guestBox.x + guestBox.width * guestPercent, guestBox.y + guestBox.height / 2);
await guest.locator("input.code").fill(code);
await guest.getByRole("button", { name: "Join room" }).click();
await host.getByText(/\d+ filled/).waitFor({ timeout: 15_000 });
await host.locator(".cell.entry").first().click();
await host.locator(".pad button").filter({ hasText: /^1/ }).click();
await host.waitForFunction(() => [...document.querySelectorAll(".cell.entry")].some((el) => el.textContent?.trim() === "1"));
const index = await host.evaluate(() => [...document.querySelectorAll(".cell")].findIndex((el) => el.classList.contains("entry") && el.textContent?.trim() === "1"));
await host.reload({ waitUntil: "domcontentloaded" });
await host.waitForFunction((cell) => document.querySelectorAll(".cell")[cell]?.textContent?.trim() === "1", index, { timeout: 20_000 });

console.log(`RESTORE_OK classic=${entered} practice=${code} cell=${index}`);
await browser.close();
