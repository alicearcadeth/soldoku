import { chromium } from "playwright";

const base = "https://sudoku.jamesbitarcade.workers.dev/";
const browser = await chromium.launch({ channel: "chrome", headless: true });

async function lobby(width = 390, height = 844) {
  const page = await (await browser.newContext({ viewport: { width, height } })).newPage();
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Compete" }).click();
  await page.getByRole("button", { name: "Practice" }).click();
  await page.getByRole("button", { name: "Quick match" }).waitFor();
  return page;
}

let host = await lobby();
const rules = await host.locator("main").innerText();
await host.getByRole("button", { name: "medium", exact: true }).click();
await host.getByRole("button", { name: "Quick match" }).click();
await host.locator(".bar-mid strong").waitFor({ timeout: 20_000 });
while (await host.getByText("Playing", { exact: true }).count()) {
  host = await lobby();
  await host.getByRole("button", { name: "medium", exact: true }).click();
  await host.getByRole("button", { name: "Quick match" }).click();
  await host.locator(".bar-mid strong").waitFor({ timeout: 20_000 });
}
const code = (await host.locator(".bar-mid strong").textContent())?.trim();
if (!code) throw new Error("missing code");

const guest = await lobby();
await guest.getByRole("button", { name: "medium", exact: true }).click();
await guest.getByRole("button", { name: "Quick match" }).click();
await guest.getByText("Playing", { exact: true }).waitFor({ timeout: 20_000 });
const guestCode = (await guest.locator(".bar-mid strong").textContent())?.trim();
const listed = await host.locator("main").innerText();
console.log(JSON.stringify({
  code,
  guestCode,
  paired: code === guestCode,
  rules: rules.includes("First correct finish wins"),
  listed: listed.includes("Quick match can seat"),
}));
await browser.close();
