import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

mkdirSync("store", { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await (await browser.newContext({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 })).newPage();
await page.goto("https://sudoku.jamesbitarcade.workers.dev/", { waitUntil: "domcontentloaded" });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "domcontentloaded" });
await page.screenshot({ path: "store/screen-home.png" });
await page.getByRole("button", { name: "Play classic" }).click();
await page.getByRole("button", { name: "Easy" }).click();
await page.getByRole("gridcell").first().waitFor();
await page.screenshot({ path: "store/screen-classic.png" });
await page.goto("https://sudoku.jamesbitarcade.workers.dev/", { waitUntil: "domcontentloaded" });
await page.evaluate(() => localStorage.removeItem("sudoku.classic"));
await page.reload({ waitUntil: "domcontentloaded" });
await page.getByRole("button", { name: "Compete" }).click();
await page.getByRole("button", { name: "For tokens" }).click();
await page.getByText("test token").waitFor();
await page.screenshot({ path: "store/screen-compete.png" });

const icon = await (await browser.newContext({ viewport: { width: 512, height: 512 }, deviceScaleFactor: 1 })).newPage();
await icon.setContent(`<!doctype html><body style="margin:0;background:#f3efe6;color:#1c1915;font-family:Georgia,serif;display:grid;place-items:center">
<div style="width:360px;height:360px;display:grid;grid-template-columns:repeat(3,1fr);border:8px solid #1c1915">
${Array.from({ length: 9 }, (_, i) => `<div style="border:4px solid #1c1915;display:grid;place-items:center;font-size:72px">${[5, "", 8, "", 3, "", 7, "", 1][i]}</div>`).join("")}
</div></body>`);
await icon.screenshot({ path: "store/icon-512.png" });
await browser.close();
console.log("store assets written");
