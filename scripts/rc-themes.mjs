import { chromium } from "playwright";

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
await page.goto("https://sudoku.jamesbitarcade.workers.dev/", { waitUntil: "domcontentloaded" });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "domcontentloaded" });
const home = await page.locator("main").innerText();
await page.getByRole("button", { name: "Play classic" }).click();
await page.getByRole("button", { name: "Easy" }).click();
await page.getByRole("gridcell").first().waitFor();
const pad = await page.locator(".pad button").count();
await page.getByRole("button", { name: "Pause" }).click();
await page.getByRole("button", { name: "Settings" }).click();
const themes = [];
for (const name of ["Ink", "Dark", "Midnight", "Arcade"]) {
  await page.getByRole("button", { name, exact: true }).click();
  themes.push(await page.evaluate(() => document.documentElement.dataset.theme || "light"));
}
await page.getByRole("button", { name: "Done" }).click();
await page.getByRole("button", { name: "Resume" }).click();
const safe = await page.evaluate(() => {
  const main = document.querySelector("main");
  const padStyle = main ? getComputedStyle(main).paddingBottom : "";
  return { viewport: document.querySelector("meta[name=viewport]")?.getAttribute("content"), paddingBottom: padStyle };
});
await page.getByRole("button", { name: "Home" }).click();
await page.getByRole("button", { name: "Compete" }).click();
await page.getByRole("button", { name: "For tokens", exact: true }).click();
await page.getByRole("button", { name: "Connect wallet" }).waitFor({ timeout: 15_000 });
const staked = await page.locator("main").innerText();
console.log(JSON.stringify({
  homeHasClassic: home.includes("Play classic"),
  homeHasCompete: home.includes("Compete"),
  cells: await page.locator(".cell, [role=gridcell]").count(),
  pad,
  themes,
  safe,
  stakedConnect: staked.includes("Connect wallet"),
  stakedCopy: staked.includes("Devnet test token"),
}, null, 2));
await browser.close();
