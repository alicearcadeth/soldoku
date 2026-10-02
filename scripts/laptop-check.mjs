import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

const origin = process.env.QA_ORIGIN ?? "http://127.0.0.1:4173/";
const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM
  ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {});
const results = [];
const errors = [];
mkdirSync("output/laptop-check", { recursive: true });
async function page(context) {
  const result = await context.newPage();
  result.setDefaultTimeout(10000);
  result.on("pageerror", error => errors.push(error.message));
  await result.goto(origin);
  return result;
}
async function check(name, run) {
  try {
    await run();
    results.push({ name, passed: true });
  } catch (error) {
    results.push({ name, passed: false, error: error.message });
  }
  console.log(JSON.stringify(results.at(-1)));
}
async function practice(p) {
  await p.getByRole("button", { name: /No wallet required/ }).click();
  await p.getByRole("heading", { name: "Practice", exact: true }).waitFor();
}
try {
  await check("Classic completion and reload on desktop and phone", async () => {
    for (const width of [1280, 390]) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      const p = await page(context);
      await p.getByRole("button", { name: /Play classic/ }).click();
      await p.getByRole("button", { name: /^Easy/ }).click();
      await p.getByRole("gridcell").first().waitFor();
      const saved = await p.evaluate(() => JSON.parse(localStorage.getItem("sudoku.classic")));
      const empty = saved.puzzle.givens.findIndex(value => !value);
      await p.getByRole("gridcell").nth(empty).click();
      await p.keyboard.press(String(saved.puzzle.solution[empty]));
      await p.reload();
      await p.getByRole("gridcell").first().waitFor();
      assert.equal(await p.getByRole("gridcell").nth(empty).innerText(), String(saved.puzzle.solution[empty]));
      for (let index = 0; index < 81; index++) {
        if (saved.puzzle.givens[index]) continue;
        await p.getByRole("gridcell").nth(index).click();
        await p.locator(".pad button").filter({ hasText: new RegExp(`^${saved.puzzle.solution[index]}`) }).click();
      }
      await p.getByRole("heading", { name: "Solved", exact: true }).waitFor();
      await p.reload();
      await p.getByRole("heading", { name: "Solved", exact: true }).waitFor();
      await p.screenshot({ path: `output/laptop-check/classic-${width}.png` });
      await context.close();
    }
  });
  await check("Private Practice room, two players, reload and full-room rejection", async () => {
    const contexts = await Promise.all([1, 2, 3].map(() => browser.newContext()));
    const [a, b, c] = await Promise.all(contexts.map(page));
    await practice(a);
    await a.getByRole("button", { name: "Create room", exact: true }).click();
    await a.locator(".bar-mid strong").waitFor();
    const code = await a.locator(".bar-mid strong").innerText();
    for (const p of [b, c]) {
      await practice(p);
      await p.getByPlaceholder("Room code").fill(code);
      await p.getByRole("button", { name: "Join room", exact: true }).click();
      if (p === b) await b.locator(".status", { hasText: "Playing" }).waitFor();
    }
    await a.locator(".status", { hasText: "Playing" }).waitFor();
    await b.locator(".status", { hasText: "Playing" }).waitFor();
    await c.getByRole("alert").filter({ hasText: /full/i }).waitFor();
    const index = await b.getByRole("gridcell").evaluateAll(cells => cells.findIndex(cell => !cell.textContent.trim()));
    await b.getByRole("gridcell").nth(index).click();
    await b.keyboard.press("2");
    assert.equal((await b.getByRole("gridcell").nth(index).innerText()).trim(), "2");
    await b.reload();
    await b.locator(".status", { hasText: "Playing" }).waitFor();
    assert.equal((await b.getByRole("gridcell").nth(index).innerText()).trim(), "2");
    await b.screenshot({ path: "output/laptop-check/practice.png" });
    await Promise.all(contexts.map(context => context.close()));
  });
  await check("Quick Match pairs two independent players", async () => {
    const contexts = await Promise.all([1, 2].map(() => browser.newContext()));
    const [a, b] = await Promise.all(contexts.map(page));
    for (const p of [a, b]) {
      await practice(p);
      await p.getByRole("button", { name: "Quick match", exact: true }).click();
    }
    for (const p of [a, b]) await p.locator(".status", { hasText: "Playing" }).waitFor();
    assert.equal(await a.locator(".bar-mid strong").innerText(), await b.locator(".bar-mid strong").innerText());
    await Promise.all(contexts.map(context => context.close()));
  });
  await check("No uncaught browser errors", async () => assert.deepEqual(errors, []));
} finally {
  await browser.close();
  writeFileSync("output/laptop-check/results.json", JSON.stringify(results, null, 2));
}
if (results.some(result => !result.passed)) process.exitCode = 1;
