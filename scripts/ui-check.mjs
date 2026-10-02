import { chromium } from "playwright";

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await (await browser.newContext({ viewport: { width: 400, height: 890 } })).newPage();
const base = "http://127.0.0.1:5173/";
await page.goto(base, { waitUntil: "domcontentloaded" });
await page.evaluate(() => {
  localStorage.clear();
  location.replace(location.href);
});
await page.getByRole("heading", { name: "Sudoku" }).waitFor();
await page.getByRole("button", { name: "Play classic" }).click();
await page.getByRole("button", { name: "Easy" }).click();
const cell = page.getByRole("gridcell", { name: /empty/ }).first();
await cell.click();
await page.getByRole("button", { name: /^1/ }).click();
const entered = (await cell.innerText()).trim();
const smallTargets = await page.locator("button").evaluateAll((buttons) => buttons.map((button) => {
  const box = button.getBoundingClientRect();
  return { name: (button.getAttribute("aria-label") || button.textContent || "").trim().slice(0, 24), h: Math.round(box.height), w: Math.round(box.width) };
}).filter((item) => item.h > 0 && (item.h < 48 || item.w < 48)));
await page.goto(`${base}?theme=classic`, { waitUntil: "domcontentloaded" });
const theme = await page.evaluate(() => document.documentElement.dataset.theme || "default");
const widths = [360, 390, 400, 412, 480, 600, 840, 1280];
const overflow = [];
for (const width of widths) {
  await page.setViewportSize({ width, height: width >= 840 ? 900 : 890 });
  await page.goto(base, { waitUntil: "domcontentloaded" });
  const wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  overflow.push({ width, wide });
}
console.log(JSON.stringify({ entered, smallTargets, theme, overflow }, null, 2));
await browser.close();
