/**
 * Local checks for the player-feedback pass.
 * Expects a Vite server. Prints one JSON row per check.
 */
import { chromium } from "playwright";

const base = process.argv[2] ?? "http://127.0.0.1:5173/";
const widths = [320, 360, 375, 390, 400, 412, 430, 480, 600, 840, 1280];
const rows = [];

function record(name, ok, detail = "") {
  rows.push({ name, ok, detail });
  console.log(JSON.stringify({ name, ok, detail }));
}

const browser = await chromium.launch({
  ...(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : { channel: "chrome" }),
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.addInitScript(() => {
  const Original = window.AudioContext;
  window.__audioContexts = 0;
  if (!Original) return;
  window.AudioContext = function AudioContextProbe(...args) {
    window.__audioContexts += 1;
    return new Original(...args);
  };
  window.AudioContext.prototype = Original.prototype;
});

async function reset() {
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    localStorage.clear();
    location.replace(location.href);
  });
  await page.getByRole("heading", { name: "Sudoku" }).waitFor();
}

await reset();
const startedQuiet = await page.evaluate(() => window.__audioContexts);
record("music-stays-off", startedQuiet === 0, `contexts ${startedQuiet}`);

await page.getByRole("button", { name: "Settings" }).click();
const musicOff = await page.getByRole("button", { name: "Music: Off" }).isVisible();
const soundOff = await page.getByRole("button", { name: "Sound effects: Off" }).isVisible();
const musicPressed = await page.getByRole("button", { name: "Music: Off" }).getAttribute("aria-pressed");
record("settings-opens", musicOff && soundOff && musicPressed === "false", `music ${musicOff} sound ${soundOff} pressed ${musicPressed}`);

await page.getByRole("button", { name: "Music: Off" }).click();
const musicOn = await page.getByRole("button", { name: "Music: On" }).getAttribute("aria-pressed");
const savedMusic = await page.evaluate(() => JSON.parse(localStorage.getItem("sudoku.prefs") ?? "{}").music);
const contexts = await page.evaluate(() => window.__audioContexts);
record("music-toggle", musicOn === "true" && savedMusic === true && contexts === 1, `pressed ${musicOn} saved ${savedMusic} contexts ${contexts}`);
await page.getByRole("button", { name: "Done" }).click();

await page.getByRole("button", { name: "Play classic" }).click();
await page.getByRole("button", { name: /^Easy/ }).click();
await page.getByRole("gridcell").first().waitFor();
await page.getByRole("button", { name: "Pause" }).click();
const pauseThemes = await page.getByRole("button", { name: "Midnight" }).count();
const resume = await page.getByRole("button", { name: "Resume" }).isVisible();
const newPuzzle = await page.getByRole("button", { name: "New puzzle" }).isVisible();
const concealed = await page.evaluate(() => getComputedStyle(document.querySelector(".board")).visibility === "hidden");
record("pause-is-pause", pauseThemes === 0 && resume && newPuzzle && concealed, `themes ${pauseThemes} resume ${resume} new ${newPuzzle} hidden ${concealed}`);

await page.getByRole("button", { name: "Settings" }).click();
const themeThere = await page.getByRole("button", { name: "Midnight" }).isVisible();
record("theme-in-settings", themeThere, String(themeThere));
await page.getByRole("button", { name: "Done" }).click();
await page.getByRole("button", { name: "Resume" }).click();

await page.getByRole("button", { name: "Notes" }).click();
const notes = page.getByRole("button", { name: "Notes on" });
record("notes-on", (await notes.getAttribute("aria-pressed")) === "true", await notes.innerText());

await page.getByRole("button", { name: "Home" }).click();
await page.getByRole("button", { name: "New game" }).click();
await page.getByRole("button", { name: /^Easy/ }).click();
const confirm = await page.getByRole("heading", { name: "Replace this puzzle?" }).isVisible();
record("new-game-confirms", confirm, String(confirm));
await page.getByRole("button", { name: "Keep current puzzle" }).click();
const stillHome = await page.getByRole("heading", { name: "New game" }).isVisible();
const journal = await page.evaluate(() => localStorage.getItem("sudoku.journal"));
record("new-game-keeps-board", stillHome && journal == null, `home ${stillHome}`);

await page.getByRole("button", { name: "Back" }).click();
await page.getByRole("button", { name: /No wallet required/ }).click();
await page.getByRole("heading", { name: "Practice" }).waitFor();
const practiceSlider = await page.locator(".slider").count();
const quickEnabled = await page.getByRole("button", { name: "Quick match" }).isEnabled();
record("practice-no-slider", practiceSlider === 0 && quickEnabled, `sliders ${practiceSlider} quick ${quickEnabled}`);

await page.getByRole("button", { name: "For tokens", exact: true }).click();
const stakeText = await page.locator("main").innerText();
const stakeButtons = await page.getByRole("group", { name: "Entry amount" }).getByRole("button").allInnerTexts();
const selected = await page.getByRole("group", { name: "Entry amount" }).getByRole("button", { pressed: true }).innerText();
const slider = await page.locator(".slider").count();
const createLocked = await page.getByRole("button", { name: "Create room" }).isDisabled();
record(
  "stake-copy",
  stakeButtons.join(",") === "1,2,5" && selected === "1" && slider === 0 && createLocked && /New deposits are paused/i.test(stakeText) && /test token/i.test(stakeText) && !/custom/i.test(stakeText),
  `buttons ${stakeButtons.join(",")} selected ${selected} slider ${slider} locked ${createLocked}`,
);

for (const width of widths) {
  await page.setViewportSize({ width, height: 800 });
  const wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  record(`width-${width}`, !wide, wide ? "overflow" : "ok");
}

await page.goto(base, { waitUntil: "domcontentloaded" });
const home = page.getByRole("heading", { name: "Sudoku" });
if (!(await home.isVisible().catch(() => false))) {
  await page.getByRole("button", { name: "Home" }).click();
}
await home.waitFor();
await page.getByRole("button", { name: "Settings" }).click();
await page.getByRole("heading", { name: "Settings" }).waitFor();
for (const width of [320, 390, 840]) {
  await page.setViewportSize({ width, height: 800 });
  const wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  record(`settings-width-${width}`, !wide, wide ? "overflow" : "ok");
}

const failed = rows.filter((row) => !row.ok);
await browser.close();
if (failed.length) {
  console.error(JSON.stringify({ failed: failed.length }));
  process.exit(1);
}
