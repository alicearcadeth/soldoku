import { chromium } from "playwright";

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const result = {};
try {
  await page.goto("https://sudoku.jamesbitarcade.workers.dev/", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Compete" }).click();
  await page.getByRole("button", { name: "For tokens" }).click();
  const staked = await page.locator("body").innerText();
  result.conversionOff = staked.includes("This beta does not convert SOL");
  result.devnet = staked.includes("devnet");
  await page.getByRole("button", { name: "Practice" }).click();
  const notch = page.locator(".notch");
  const box = await notch.boundingBox();
  if (!box) throw new Error("slider mark missing");
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.getByRole("button", { name: "easy" }).click();
  await page.getByRole("button", { name: "Quick match" }).click();
  await page.locator(".bar-mid strong").waitFor({ timeout: 15_000 });
  result.quick = (await page.locator(".bar-mid strong").textContent())?.trim() ?? null;
  result.practice = (await page.locator("body").innerText()).includes("Practice");
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
}
