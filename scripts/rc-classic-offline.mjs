import { chromium } from "playwright";

const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();
await page.goto("https://sudoku.jamesbitarcade.workers.dev/", { waitUntil: "domcontentloaded" });
await page.evaluate(async () => navigator.serviceWorker.ready);
await page.reload({ waitUntil: "domcontentloaded" });
await page.getByRole("button", { name: "Play classic" }).click();
await page.getByRole("button", { name: "Easy" }).click();
await page.getByRole("gridcell").first().waitFor();
const before = await page.getByRole("gridcell").count();
await context.setOffline(true);
await page.reload({ waitUntil: "domcontentloaded" });
const after = await page.getByRole("gridcell").count();
const resumed = await page.evaluate(() => localStorage.getItem("sudoku.classic") !== null);
console.log(JSON.stringify({ kind: "live-classic-offline", before, after, resumed }));
await browser.close();
