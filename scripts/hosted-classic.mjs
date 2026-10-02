import { chromium } from "playwright";
import { slide } from "./hosted-browser.mjs";

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
await page.goto("https://sudoku.jamesbitarcade.workers.dev/", { waitUntil: "domcontentloaded" });
await page.getByRole("button", { name: "Play classic" }).click();
await page.getByRole("button", { name: "Easy" }).click();
await page.getByRole("gridcell").first().waitFor();
await page.reload();
const restored = await page.getByRole("gridcell").count();
await page.getByRole("button", { name: "Home" }).click();
await page.getByRole("button", { name: "Compete" }).click();
await slide(page);
await page.getByRole("button", { name: "Create room" }).click();
const practice = (await page.locator(".bar-mid strong").textContent())?.trim();
console.log(JSON.stringify({ classicCells: restored, practice }));
await browser.close();
