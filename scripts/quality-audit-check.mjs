/**
 * Red-capable checks for the final quality pass.
 * Expects a Vite server. Prints one JSON row per check.
 */
import { chromium } from "playwright";

const base = process.argv[2] ?? "http://127.0.0.1:5173/";
const rows = [];

function record(name, ok, detail = "") {
  rows.push({ name, ok, detail });
  console.log(JSON.stringify({ name, ok, detail }));
}

function contrast(fg, bg) {
  const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const lum = (rgb) => {
    const [r, g, b] = rgb.match(/\d+/g).map(Number);
    return 0.2126 * lin(r / 255) + 0.7152 * lin(g / 255) + 0.0722 * lin(b / 255);
  };
  const hi = Math.max(lum(fg), lum(bg));
  const lo = Math.min(lum(fg), lum(bg));
  return (hi + 0.05) / (lo + 0.05);
}

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

async function home() {
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    localStorage.clear();
    location.replace(location.href);
  });
  await page.getByRole("heading", { name: "Sudoku" }).waitFor();
}

await home();
await page.getByRole("button", { name: "Settings" }).click();
const focused = await page.evaluate(() => document.activeElement?.closest("[role=dialog]") != null);
record("settings-focus", focused, String(focused));

await page.keyboard.press("Tab");
const stillInside = await page.evaluate(() => document.activeElement?.closest("[role=dialog]") != null);
record("settings-tab-stays", stillInside, String(stillInside));

await page.getByRole("button", { name: "Easy Read" }).click();
const readable = await page.evaluate(() => ({
  font: document.documentElement.dataset.font,
  saved: JSON.parse(localStorage.getItem("sudoku.prefs") ?? "{}").font,
}));
record("font-easy-read", readable.font === "readable" && readable.saved === "readable", JSON.stringify(readable));

await page.getByRole("button", { name: "Large" }).click();
const large = await page.evaluate(() => document.documentElement.dataset.text);
record("text-large", large === "large", String(large));

await page.keyboard.press("Escape");
const closed = await page.getByRole("heading", { name: "Settings" }).count();
const restored = await page.evaluate(() => document.activeElement?.getAttribute("aria-label") === "Settings" || document.activeElement?.textContent?.includes("Settings"));
record("settings-escape", closed === 0 && restored, `open ${closed} restored ${restored}`);

await page.reload({ waitUntil: "domcontentloaded" });
await page.getByRole("heading", { name: "Sudoku" }).waitFor();
const kept = await page.evaluate(() => ({
  font: document.documentElement.dataset.font ?? "",
  text: document.documentElement.dataset.text ?? "",
}));
record("appearance-persists", kept.font === "readable" && kept.text === "large", JSON.stringify(kept));

const beforeFonts = await page.evaluate(() => performance.getEntriesByType("resource").filter((entry) => entry.name.includes("inter-latin")).length);
record("inter-not-loaded-until-chosen", beforeFonts === 0, String(beforeFonts));

await page.getByRole("button", { name: "Play classic" }).click();
await page.getByRole("button", { name: /^Easy/ }).click();
await page.getByRole("gridcell").first().waitFor();
const board = await page.evaluate(() => {
  const cell = document.querySelector(".cell");
  const grid = document.querySelector(".board");
  const style = getComputedStyle(cell);
  return {
    family: style.fontFamily,
    width: Math.round(grid.getBoundingClientRect().width),
    height: Math.round(grid.getBoundingClientRect().height),
  };
});
record("board-uses-easy-read", /Atkinson Hyperlegible Next/.test(board.family), board.family);
record("board-is-square", Math.abs(board.width - board.height) <= 1, `${board.width}x${board.height}`);

await page.getByRole("button", { name: "Pause" }).click();
await page.getByRole("button", { name: "Settings" }).click();
await page.getByRole("button", { name: "Modern" }).click();
await page.keyboard.press("Escape");
const pauseStill = await page.getByRole("heading", { name: "Paused" }).isVisible();
const after = await page.evaluate(() => {
  const grid = document.querySelector(".board");
  return {
    font: document.documentElement.dataset.font,
    width: Math.round(grid.getBoundingClientRect().width),
  };
});
record("font-does-not-resize-board", pauseStill && after.width === board.width, `pause ${pauseStill} ${board.width}->${after.width} font ${after.font}`);
await page.getByRole("button", { name: "Resume" }).click();

await page.setViewportSize({ width: 320, height: 700 });
const overflow = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
record("large-text-320", overflow, `scroll ${await page.evaluate(() => document.documentElement.scrollWidth)} client ${await page.evaluate(() => document.documentElement.clientWidth)}`);

await page.evaluate(() => { document.documentElement.dataset.theme = "arcade"; });
const arcade = await page.evaluate(() => {
  const probe = document.createElement("span");
  probe.style.color = "var(--entered)";
  probe.style.background = "var(--paper-2)";
  document.body.append(probe);
  const style = getComputedStyle(probe);
  const colors = { fg: style.color, bg: style.backgroundColor };
  probe.remove();
  return colors;
});
const ratio = contrast(arcade.fg, arcade.bg);
record("arcade-entered-contrast", ratio >= 4.5, ratio.toFixed(2));

const zoom = await browser.newPage({ viewport: { width: 320, height: 640 } });
await zoom.addInitScript(() => localStorage.clear());
await zoom.goto(base, { waitUntil: "domcontentloaded" });
await zoom.getByRole("heading", { name: "Sudoku" }).waitFor();
await zoom.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
const zoomed = await zoom.evaluate(() => ({
  scroll: document.documentElement.scrollWidth,
  client: document.documentElement.clientWidth,
}));
const competeVisible = await zoom.getByRole("button", { name: "Compete" }).isVisible();
record("zoom-200-home", zoomed.scroll <= zoomed.client + 1 && competeVisible, `scroll ${zoomed.scroll} client ${zoomed.client} compete ${competeVisible}`);
await zoom.setViewportSize({ width: 844, height: 390 });
const landscape = await zoom.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
const landscapePlay = await zoom.getByRole("button", { name: "Play classic" }).isVisible();
record("landscape-home", landscape && landscapePlay, `overflow ${!landscape} play ${landscapePlay}`);
await zoom.close();

const failed = await browser.newPage({ viewport: { width: 390, height: 844 } });
await failed.route("**/*.woff2", (route) => route.abort());
await failed.goto(base, { waitUntil: "domcontentloaded" });
await failed.evaluate(() => localStorage.clear());
await failed.goto(base, { waitUntil: "domcontentloaded" });
await failed.getByRole("button", { name: "Play classic" }).click();
await failed.getByRole("button", { name: /^Easy/ }).click();
const digit = await failed.locator(".cell.given").first().innerText();
const visible = await failed.evaluate(() => {
  const cell = document.querySelector(".cell.given");
  const style = getComputedStyle(cell);
  return style.color !== "rgba(0, 0, 0, 0)" && Number.parseFloat(style.fontSize) > 0;
});
record("font-failure-still-shows-digits", visible && /^[1-9]$/.test(digit.trim()), JSON.stringify({ digit, visible }));
await failed.close();

const failedRows = rows.filter((row) => !row.ok);
await browser.close();
if (failedRows.length) process.exit(1);
