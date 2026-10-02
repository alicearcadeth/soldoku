import { chromium } from "playwright";

const base = "https://sudoku.jamesbitarcade.workers.dev/";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const report = {};

async function pass(name) {
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "domcontentloaded" });
  return { name, page };
}

async function notch(page) {
  const box = await page.locator(".notch").boundingBox();
  if (!box) throw new Error("slider notch missing");
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForFunction(() => {
    const button = [...document.querySelectorAll("button")].find((el) => el.textContent === "Create room");
    return button && !button.disabled;
  });
}

const classic = await pass("classic");
await classic.page.getByRole("button", { name: "Play classic" }).click();
await classic.page.getByRole("button", { name: "Easy" }).click();
await classic.page.getByRole("gridcell").first().waitFor();
const cells = classic.page.getByRole("gridcell");
const count = await cells.count();
let empty = -1;
for (let index = 0; index < count; index++) {
  if (!(await cells.nth(index).innerText()).trim()) {
    empty = index;
    break;
  }
}
await cells.nth(empty).click();
await classic.page.getByRole("button", { name: "Notes" }).click();
await classic.page.locator(".pad button").nth(0).click();
const noted = (await cells.nth(empty).innerText()).trim();
await classic.page.getByRole("button", { name: "Undo" }).click();
const undone = (await cells.nth(empty).innerText()).trim();
await classic.page.getByRole("button", { name: "Hint", exact: true }).click();
const hint = await classic.page.locator(".choice-note").first().innerText();
const saved = await classic.page.evaluate(() => localStorage.getItem("sudoku.classic"));
await classic.page.reload({ waitUntil: "domcontentloaded" });
await classic.page.getByRole("gridcell").first().waitFor();
const resumed = await classic.page.getByRole("gridcell").count();
report.classic = { cells: count, noted, undone, hint: hint.slice(0, 80), saved: Boolean(saved), resumed };

await classic.page.evaluate(async () => {
  await navigator.serviceWorker.ready;
});
await classic.page.reload({ waitUntil: "domcontentloaded" });
await classic.page.getByRole("gridcell").first().waitFor();
await classic.page.context().setOffline(true);
await classic.page.reload({ waitUntil: "domcontentloaded" });
report.offline = { cells: await classic.page.getByRole("gridcell").count() };
await classic.page.context().setOffline(false);

const host = await pass("practice");
await host.page.getByRole("button", { name: "Compete" }).click();
const stakedImmediate = host.page.getByRole("button", { name: "For tokens" });
await stakedImmediate.click();
const stakeText = await host.page.locator("main").innerText();
report.staked = {
  connect: stakeText.includes("Connect wallet"),
  testWallet: stakeText.includes("Create test wallet"),
  noCash: stakeText.includes("no cash value"),
  devnet: stakeText.includes("Devnet"),
};
await host.page.getByRole("button", { name: "Practice" }).click();
await notch(host.page);
await host.page.getByRole("button", { name: "Create room" }).click();
await host.page.locator(".bar-mid strong").waitFor({ timeout: 20_000 });
const code = (await host.page.locator(".bar-mid strong").textContent())?.trim();
await host.page.reload({ waitUntil: "domcontentloaded" });
await host.page.locator(".bar-mid strong").waitFor({ timeout: 20_000 });
const resumedCode = (await host.page.locator(".bar-mid strong").textContent())?.trim();

const guest = await pass("guest");
await guest.page.getByRole("button", { name: "Compete" }).click();
await guest.page.getByRole("button", { name: "Practice" }).click();
await notch(guest.page);
await guest.page.locator("input.code").fill(code);
await guest.page.getByRole("button", { name: "Join room" }).click();
await guest.page.getByText("Playing", { exact: true }).waitFor({ timeout: 20_000 });
report.practice = { code, resumedCode, joined: (await guest.page.locator(".bar-mid strong").textContent())?.trim() === code };

const quickHost = await pass("quick-host");
await quickHost.page.getByRole("button", { name: "Compete" }).click();
await quickHost.page.getByRole("button", { name: "Practice" }).click();
await notch(quickHost.page);
await quickHost.page.getByRole("button", { name: "medium", exact: true }).click();
await quickHost.page.getByRole("button", { name: "Quick match" }).click();
await quickHost.page.locator(".bar-mid strong").waitFor({ timeout: 20_000 });
const quickCode = (await quickHost.page.locator(".bar-mid strong").textContent())?.trim();
const quickGuest = await pass("quick-guest");
await quickGuest.page.getByRole("button", { name: "Compete" }).click();
await quickGuest.page.getByRole("button", { name: "Practice" }).click();
await notch(quickGuest.page);
await quickGuest.page.getByRole("button", { name: "medium", exact: true }).click();
await quickGuest.page.getByRole("button", { name: "Quick match" }).click();
await quickGuest.page.getByText("Playing", { exact: true }).waitFor({ timeout: 20_000 });
report.quick = {
  code: quickCode,
  guest: (await quickGuest.page.locator(".bar-mid strong").textContent())?.trim(),
};

const layout = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
await layout.goto(base, { waitUntil: "domcontentloaded" });
const mobile = await layout.evaluate(() => {
  const buttons = [...document.querySelectorAll("button")].map((el) => el.getBoundingClientRect().height);
  return {
    overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
    minButton: Math.round(Math.min(...buttons)),
    safePad: getComputedStyle(document.querySelector("main")).paddingBottom,
  };
});
await layout.setViewportSize({ width: 1280, height: 800 });
const desktopOverflow = await layout.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
await layout.setViewportSize({ width: 320, height: 568 });
const narrow = await layout.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
report.layout = { ...mobile, desktopOverflow, narrow };

const solution = await fetch(`${base}api/rooms/solution`);
report.solutionStatus = solution.status;
console.log(JSON.stringify(report));
await browser.close();
