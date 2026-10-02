/**
 * Isolated-browser playtest of the hosted site.
 * Prints journey results only. Does not print puzzles.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium, firefox, webkit } from "playwright";

const origin = process.env.QA_ORIGIN ?? "https://sudoku.jamesbitarcade.workers.dev/";
const outDir = "output/playwright";
mkdirSync(outDir, { recursive: true });
const findings = [];

function record(row) {
  findings.push(row);
  console.log(JSON.stringify(row));
}

async function shot(page, name) {
  const path = `${outDir}/${name}.png`;
  await page.screenshot({ path, fullPage: true }).catch(() => undefined);
  return path;
}

async function slide(page) {
  const slider = page.locator(".slider");
  await slider.waitFor({ timeout: 15000 });
  for (let attempt = 0; attempt < 4; attempt++) {
    const box = await slider.boundingBox();
    const target = await slider.locator(".notch").evaluate((el) => Number(el.style.getPropertyValue("--p")));
    const travel = Math.max(1, box.width - 52);
    const x = box.x + 26 + target * travel;
    const y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.up();
    await page.waitForTimeout(400);
    const blocked = await page.getByRole("button", { name: "Create room" }).isDisabled().catch(() => true);
    if (!blocked) return;
  }
  throw new Error("Slider did not enable the room buttons");
}

async function home(page) {
  await page.goto(origin, { waitUntil: "domcontentloaded" });
  const title = page.getByRole("heading", { name: "Sudoku" });
  const board = page.locator("[role=gridcell]").first();
  await Promise.race([
    title.waitFor({ timeout: 15000 }),
    board.waitFor({ timeout: 15000 }),
  ]);
  if (await board.count()) {
    const overlayHome = page.locator(".overlay").getByRole("button", { name: "Home" });
    if (await overlayHome.count()) await overlayHome.click();
    else await page.locator("header").getByRole("button", { name: "Home" }).click();
    await title.waitFor();
  }
}

async function openLevel(page, level) {
  await page.getByRole("button", { name: /Play classic/ }).click();
  await page.getByRole("button", { name: new RegExp(`^${level}`, "i") }).click();
  await page.locator("[role=gridcell]").nth(0).waitFor();
}

async function compete(page) {
  await page.getByRole("button", { name: /Compete/ }).click();
  await page.getByRole("button", { name: "Practice", exact: true }).click();
  await page.getByRole("heading", { name: "Practice" }).waitFor();
}

function contrast(fg, bg) {
  const parse = (value) => value.match(/\d+/g).slice(0, 3).map(Number);
  const lin = (channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const L = (rgb) => 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
  const a = L(parse(fg));
  const b = L(parse(bg));
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

async function classicJourney(page, engine, viewport) {
  const chainCalls = [];
  page.on("request", (request) => {
    const url = request.url();
    if (/solana|alchemy|quiknode|helius/i.test(url)) chainCalls.push(url.split("?")[0]);
  });
  await home(page);
  await openLevel(page, "Easy");
  const firstEmpty = page.locator("[role=gridcell]", { hasText: "" }).first();
  const empty = page.locator("[role=gridcell][aria-label*='empty']").first();
  await page.getByRole("button", { name: "Notes" }).click();
  await empty.click();
  await page.getByRole("button", { name: /^4/ }).click();
  const noted = await empty.locator(".notes").innerText();
  await page.getByRole("button", { name: "Undo" }).click();
  const undone = await empty.locator(".notes").innerText().catch(() => "");
  await page.getByRole("button", { name: "Notes" }).click();
  await empty.click();
  await page.keyboard.press("5");
  await page.keyboard.press("Backspace");
  await page.keyboard.press("ArrowRight");
  await page.getByRole("button", { name: "Hint" }).click();
  const hint = await page.locator(".choice-note").last().innerText();
  await page.getByRole("button", { name: "Pause" }).click();
  await page.getByRole("button", { name: "Dark" }).click();
  const theme = await page.evaluate(() => document.documentElement.dataset.theme || "light");
  await page.getByRole("button", { name: "Resume" }).click();
  await page.reload();
  await page.locator("[role=gridcell]").nth(0).waitFor();
  const resumed = await page.locator(".status").innerText();
  const resumedTheme = await page.evaluate(() => document.documentElement.dataset.theme || "light");
  await page.keyboard.press("Tab");
  const focus = await page.evaluate(() => {
    const el = document.activeElement;
    const style = getComputedStyle(el);
    return { name: el?.getAttribute("aria-label") || el?.textContent?.trim()?.slice(0, 40) || el?.tagName, outline: style.outlineStyle, shadow: style.boxShadow };
  });
  record({
    engine, viewport, journey: "first-time-and-return-classic",
    result: noted.includes("4") && undone === "" && theme === "dark" && resumedTheme === "dark" ? "pass" : "fail",
    detail: { noted, undone, hint: hint.replace(/\d/g, "#"), theme, resumed, resumedTheme, focus, chainCalls: chainCalls.length },
  });
  return { hint, focus };
}

async function finishClassic(page, engine, viewport) {
  const placed = await page.evaluate(async () => {
    const saved = JSON.parse(localStorage.getItem("sudoku.classic"));
    const notes = [...document.querySelectorAll("button")].find((button) => button.textContent.trim() === "Notes");
    if (notes.classList.contains("on")) notes.click();
    const cells = () => [...document.querySelectorAll("[role=gridcell]")];
    let count = 0;
    for (let i = 0; i < 81; i++) {
      if (saved.puzzle.givens[i]) continue;
      cells()[i].click();
      await new Promise((resolve) => setTimeout(resolve, 12));
      const digit = [...document.querySelectorAll(".pad button")].find((button) => button.textContent.trim().startsWith(String(saved.puzzle.solution[i])));
      if (!digit || digit.disabled) return { error: "digit-unavailable", count };
      digit.click();
      count += 1;
      await new Promise((resolve) => setTimeout(resolve, 12));
      if (document.querySelector("h2")?.textContent === "Solved") break;
    }
    return { count, heading: document.querySelector("h2")?.textContent || null };
  });
  await page.reload();
  await page.getByRole("heading", { name: "Solved" }).waitFor({ timeout: 10000 });
  const homes = await page.evaluate(() => [...document.querySelectorAll("button")]
    .filter((button) => button.textContent.trim() === "Home" && !button.closest("[inert]")).length);
  await page.keyboard.press("Tab");
  const focus = await page.evaluate(() => {
    const el = document.activeElement;
    return { name: el?.textContent?.trim() || "", inSheet: Boolean(el?.closest(".sheet")) };
  });
  record({ engine, viewport, journey: "complete-and-reload", result: "pass", detail: { placed: placed.count, heading: "Solved", homes, focus } });
  record({
    engine, viewport, journey: "solved-one-home",
    result: homes === 1 && focus.inSheet ? "pass" : "fail",
    detail: { homes, focus },
  });
}

async function twoTabs(context, engine, viewport) {
  const first = await context.newPage();
  const second = await context.newPage();
  await first.setViewportSize(viewport);
  await second.setViewportSize(viewport);
  await home(first);
  await openLevel(first, "Medium");
  await second.goto(origin);
  await second.locator("[role=gridcell]").nth(0).waitFor();
  const index = await first.locator("[role=gridcell]").evaluateAll((cells) =>
    cells.findIndex((cell) => (cell.getAttribute("aria-label") || "").includes("empty")),
  );
  const cell = () => first.locator("[role=gridcell]").nth(index);
  const before = await cell().getAttribute("aria-label");
  await cell().click();
  await first.getByRole("button", { name: /^7/ }).click();
  const afterFirst = await cell().getAttribute("aria-label");
  await first.getByRole("button", { name: "Pause" }).click();
  const resume = second.getByRole("button", { name: "Resume" });
  if (await resume.count()) await resume.click();
  else await second.locator("[role=gridcell]").nth(0).click();
  await second.waitForTimeout(600);
  await first.reload();
  await first.locator("[role=gridcell]").nth(0).waitFor();
  const afterReload = await first.locator(`[role=gridcell][aria-label='${afterFirst}']`).count();
  const kept = afterReload > 0 && afterFirst !== before && afterFirst.includes("entered 7");
  record({
    engine, viewport, journey: "two-tabs-same-classic",
    result: kept ? "pass" : "fail",
    detail: { before, afterFirst, afterReload },
  });
  await first.close();
  await second.close();
}

async function offlineClassic(context, engine, viewport) {
  const page = await context.newPage();
  await home(page);
  await openLevel(page, "Hard");
  const index = await page.locator("[role=gridcell]").evaluateAll((cells) =>
    cells.findIndex((cell) => (cell.getAttribute("aria-label") || "").includes("empty")),
  );
  const cell = () => page.locator("[role=gridcell]").nth(index);
  await cell().click();
  await page.keyboard.press("3");
  const label = await cell().getAttribute("aria-label");
  await page.reload();
  await page.evaluate(async () => {
    const ready = navigator.serviceWorker?.ready;
    if (ready) await ready;
  });
  await context.setOffline(true);
  await page.reload();
  let heading = null;
  let text = "";
  try {
    await page.locator("[role=gridcell]").nth(0).waitFor({ timeout: 8000 });
    heading = await page.locator(`[role=gridcell][aria-label='${label}']`).count() ? label : null;
  } catch (error) {
    text = await page.locator("body").innerText().catch(() => error.message);
  }
  await context.setOffline(false);
  record({
    engine, viewport, journey: "offline-reload-classic",
    result: label.includes("entered 3") && heading === label ? "pass" : "fail",
    detail: { entered: label, restored: heading, text: text.slice(0, 180) },
  });
  await page.close();
}

async function practicePair(browser, engine, viewport) {
  const hostContext = await browser.newContext({ viewport });
  const guestContext = await browser.newContext({ viewport });
  const thirdContext = await browser.newContext({ viewport });
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();
  const third = await thirdContext.newPage();
  await home(host);
  await compete(host);
  const practiceCopy = await host.locator("p").nth(1).innerText();
  await host.getByRole("button", { name: "Create room" }).click();
  await host.locator(".bar-mid strong").waitFor();
  const code = await host.locator(".bar-mid strong").innerText();
  const hostAlone = await host.locator(".status").innerText();
  await home(guest);
  await compete(guest);
  await guest.getByPlaceholder("Room code").fill(code);
  await guest.getByRole("button", { name: "Join room" }).click();
  await guest.locator(".bar-mid strong", { hasText: code }).waitFor();
  await host.locator(".status", { hasText: "Playing" }).waitFor({ timeout: 8000 });
  const guestText = await guest.locator("body").innerText();
  await home(third);
  await compete(third);
  await third.getByPlaceholder("Room code").fill(code);
  await third.getByRole("button", { name: "Join room" }).click();
  const fullNote = third.locator(".choice-note", { hasText: /full/i });
  let full = "";
  try {
    await fullNote.waitFor({ timeout: 8000 });
    full = await fullNote.innerText();
  } catch {
    full = (await third.locator(".choice-note").allInnerTexts()).join(" | ");
  }
  const index = await guest.locator(".board .cell").evaluateAll((cells) =>
    cells.findIndex((cell) => cell.textContent.trim() === ""),
  );
  const cell = () => guest.locator(".board .cell").nth(index);
  await cell().click();
  await guest.keyboard.press("2");
  const keyboardText = (await cell().innerText()).trim();
  if (keyboardText !== "2") await guest.locator(".pad button", { hasText: /^2/ }).click();
  const placed = (await cell().innerText()).trim();
  await guest.reload();
  await guest.locator(".bar-mid strong", { hasText: code }).waitFor();
  const guestAfter = await guest.locator(".status").innerText();
  const keptMove = (await guest.locator(".board .cell").nth(index).innerText()).trim();
  await guest.context().setOffline(true);
  const nextIndex = await guest.locator(".board .cell").evaluateAll((cells) =>
    cells.findIndex((cell) => cell.textContent.trim() === ""),
  );
  const nextCell = () => guest.locator(".board .cell").nth(nextIndex);
  await nextCell().click();
  await guest.locator(".pad button", { hasText: /^8/ }).click();
  await guest.waitForTimeout(800);
  const offlineNote = await guest.locator(".choice-note").last().innerText().catch(() => "");
  const reverted = (await nextCell().innerText()).trim();
  const stillPlaying = await guest.locator(".status").innerText();
  await guest.context().setOffline(false);
  const roomOk = hostAlone.includes("Waiting") && guestText.includes(code) && !/token|devnet/i.test(guestText) && /full/i.test(full);
  const moveOk = placed === "2" && keptMove === "2" && reverted === "" && offlineNote.length > 0 && stillPlaying.includes("Playing");
  record({
    engine, viewport, journey: "private-room-full-reload-disconnect",
    result: roomOk && moveOk ? "pass" : "fail",
    detail: { code, hostAlone, full, placed, keptMove, guestAfter, offlineNote, reverted, stillPlaying, practiceCopy },
  });
  record({
    engine, viewport, journey: "race-keyboard-digit",
    result: keyboardText === "2" ? "pass" : "fail",
    detail: { keyboardText },
  });
  await hostContext.close();
  await guestContext.close();
  await thirdContext.close();
}

async function raceTabs(browser, engine, viewport) {
  const context = await browser.newContext({ viewport });
  const guestContext = await browser.newContext({ viewport });
  const first = await context.newPage();
  const second = await context.newPage();
  const guest = await guestContext.newPage();
  await home(first);
  await compete(first);
  await first.getByRole("button", { name: "Create room" }).click();
  await first.locator(".bar-mid strong").waitFor();
  const code = await first.locator(".bar-mid strong").innerText();
  await home(guest);
  await compete(guest);
  await guest.getByPlaceholder("Room code").fill(code);
  await guest.getByRole("button", { name: "Join room" }).click();
  await first.locator(".status", { hasText: "Playing" }).waitFor();
  await second.goto(origin);
  await second.locator(".status", { hasText: "Playing" }).waitFor();
  const index = await first.locator(".board .cell").evaluateAll((cells) => cells.findIndex((cell) => cell.textContent.trim() === ""));
  await first.locator(".board .cell").nth(index).click();
  await first.keyboard.press("4");
  const typed = (await first.locator(".board .cell").nth(index).innerText()).trim();
  await second.waitForTimeout(1500);
  const secondSaw = (await second.locator(".board .cell").nth(index).innerText()).trim();
  const other = await first.locator(".board .cell").evaluateAll((cells, filled) => cells.findIndex((cell, cellIndex) => cellIndex !== filled && cell.textContent.trim() === ""), index);
  await second.locator(".board .cell").nth(other).click();
  await second.keyboard.press("6");
  await second.waitForTimeout(1000);
  const secondNote = await second.locator(".choice-note").last().innerText().catch(() => "");
  await first.reload();
  await first.locator(".status", { hasText: "Playing" }).waitFor();
  const firstKept = (await first.locator(".board .cell").nth(index).innerText()).trim();
  const otherKept = (await first.locator(".board .cell").nth(other).innerText()).trim();
  record({
    engine, viewport, journey: "two-tabs-same-race",
    result: typed === "4" && secondSaw === "4" && firstKept === "4" && otherKept === "6" && !/one cell at a time/i.test(secondNote) ? "pass" : "fail",
    detail: { code, typed, secondSaw, secondNote, firstKept, otherKept },
  });
  await context.close();
  await guestContext.close();
}

async function quickMatch(browser, engine, viewport) {
  const aContext = await browser.newContext({ viewport });
  const bContext = await browser.newContext({ viewport });
  const a = await aContext.newPage();
  const b = await bContext.newPage();
  await home(a);
  await compete(a);
  await a.getByRole("button", { name: "Quick match" }).click();
  await a.locator(".bar-mid strong").waitFor();
  const code = await a.locator(".bar-mid strong").innerText();
  await a.getByRole("button", { name: "Home" }).click();
  await home(b);
  await compete(b);
  await b.getByRole("button", { name: new RegExp(code) }).waitFor({ timeout: 8000 });
  await b.getByRole("button", { name: new RegExp(code) }).click();
  await b.locator(".status", { hasText: "Playing" }).waitFor();
  await a.getByRole("button", { name: /Compete/ }).click();
  await a.locator(".status", { hasText: "Playing" }).waitFor({ timeout: 8000 });
  const same = await a.locator(".bar-mid strong").innerText();
  record({
    engine, viewport, journey: "quick-match-two-players",
    result: same === code ? "pass" : "fail",
    detail: { code, hostAfterReturn: same },
  });
  await aContext.close();
  await bContext.close();
}

async function navigationAndStaked(page, engine, viewport) {
  await home(page);
  await page.getByRole("button", { name: /Play classic/ }).click();
  await page.goBack();
  const afterBack = await page.locator("h1").innerText().catch(() => page.url());
  await page.goForward().catch(() => undefined);
  const afterForward = await page.locator("body").innerText();
  await home(page);
  await compete(page);
  await page.getByRole("button", { name: "For tokens" }).click();
  const copy = await page.locator("p").nth(1).innerText();
  const createDisabled = await page.getByRole("button", { name: "Create room" }).isDisabled();
  await page.getByRole("button", { name: "Connect wallet" }).click();
  const walletNote = await page.locator(".choice-note").last().innerText();
  const myMatches = await page.getByRole("button", { name: "My matches" }).count();
  const staging = await page.getByText("Isolated staging").count();
  await page.setViewportSize({ width: 390, height: 844 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
  const targets = await page.locator("button").evaluateAll((buttons) => buttons.map((button) => {
    const box = button.getBoundingClientRect();
    return { name: button.textContent.trim().slice(0, 32), w: Math.round(box.width), h: Math.round(box.height) };
  }));
  const small = targets.filter((item) => item.h > 0 && (item.h < 44 || item.w < 44));
  const colors = await page.locator(".lede, p").first().evaluate((el) => {
    const style = getComputedStyle(el);
    return { color: style.color, background: getComputedStyle(document.body).backgroundColor };
  });
  record({
    engine, viewport, journey: "back-forward-staked-mobile",
    result: createDisabled && myMatches === 0 && staging === 0 && /no cash value|test token/i.test(copy + walletNote) ? "pass" : "fail",
    detail: { afterBack, afterForward: afterForward.slice(0, 120), copy, walletNote, overflow, small, colors },
  });
}

async function levels(page, engine) {
  await home(page);
  await page.getByRole("button", { name: /Play classic/ }).click();
  const names = await page.getByRole("button").allInnerTexts();
  for (const level of ["Medium", "Hard", "Expert"]) {
    await page.getByRole("button", { name: new RegExp(`^${level}`) }).click();
    await page.locator("[role=gridcell]").nth(0).waitFor();
    const title = await page.locator(".bar-mid strong").innerText();
    await page.getByRole("button", { name: "Home" }).click();
    await page.getByRole("button", { name: /Play classic/ }).click();
    record({ engine, viewport: "1280x900", journey: `classic-${level.toLowerCase()}`, result: title === level ? "pass" : "fail", detail: { title } });
  }
  record({ engine, viewport: "1280x900", journey: "level-menu", result: names.some((name) => /Expert/.test(name)) ? "pass" : "fail", detail: { names } });
}

async function runEngine(browserType, engine, full) {
  const fallback = {
    chromium: process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : { channel: "chrome" },
    firefox: process.env.PLAYWRIGHT_FIREFOX ? { executablePath: process.env.PLAYWRIGHT_FIREFOX } : {},
    webkit: process.env.PLAYWRIGHT_WEBKIT ? { executablePath: process.env.PLAYWRIGHT_WEBKIT } : {},
  };
  const browser = await browserType.launch(fallback[engine]);
  const desktop = { width: 1280, height: 900 };
  const phone = { width: 390, height: 844 };
  try {
    const context = await browser.newContext({ viewport: desktop });
    const page = await context.newPage();
    try {
      await classicJourney(page, engine, "1280x900");
    } catch (error) {
      record({ engine, viewport: "1280x900", journey: "first-time-and-return-classic", result: "fail", detail: String(error).slice(0, 400) });
    }
    if (full && process.env.QA_CLASSIC !== "1") {
      try {
        await finishClassic(page, engine, "1280x900");
      } catch (error) {
        record({ engine, viewport: "1280x900", journey: "complete-and-reload", result: "fail", detail: String(error).slice(0, 240) });
      }
      const guard = async (journey, fn) => {
        try {
          await fn();
        } catch (error) {
          record({ engine, viewport: "1280x900", journey, result: "fail", detail: String(error).slice(0, 400) });
        }
      };
      await guard("two-tabs-same-classic", () => twoTabs(context, engine, desktop));
      const offlineContext = await browser.newContext({ viewport: desktop });
      await guard("offline-reload-classic", () => offlineClassic(offlineContext, engine, "1280x900"));
      await offlineContext.close();
      await guard("private-room-full-reload-disconnect", () => practicePair(browser, engine, desktop));
      await guard("two-tabs-same-race", () => raceTabs(browser, engine, desktop));
      await guard("quick-match-two-players", () => quickMatch(browser, engine, desktop));
      await guard("back-forward-staked-mobile", () => navigationAndStaked(page, engine, "1280x900"));
      await guard("level-menu", () => levels(page, engine));
      const phoneContext = await browser.newContext({ viewport: phone });
      const phonePage = await phoneContext.newPage();
      await guard("first-time-and-return-classic-phone", () => classicJourney(phonePage, engine, "390x844"));
      await phoneContext.close();
    }
    if (full && process.env.QA_CLASSIC === "1") {
      try {
        await finishClassic(page, engine, "1280x900");
      } catch (error) {
        record({ engine, viewport: "1280x900", journey: "complete-and-reload", result: "fail", detail: String(error).slice(0, 240) });
      }
      const guard = async (journey, fn) => {
        try {
          await fn();
        } catch (error) {
          record({ engine, viewport: "1280x900", journey, result: "fail", detail: String(error).slice(0, 400) });
        }
      };
      await guard("two-tabs-same-classic", () => twoTabs(context, engine, desktop));
      await guard("level-menu", () => levels(page, engine));
      const phoneContext = await browser.newContext({ viewport: phone });
      const phonePage = await phoneContext.newPage();
      await guard("first-time-and-return-classic-phone", () => classicJourney(phonePage, engine, "390x844"));
      await phoneContext.close();
    }
    await context.close();
  } finally {
    await browser.close();
  }
}

const only = process.argv[2];
const engines = [
  ["chromium", chromium, true],
  ["firefox", firefox, false],
  ["webkit", webkit, false],
].filter(([name]) => !only || only === name);

for (const [name, type, full] of engines) {
  try {
    await runEngine(type, name, full || only === name);
  } catch (error) {
    record({ engine: name, viewport: "", journey: "runner", result: "fail", detail: String(error).slice(0, 500) });
    await shot({ screenshot: async () => undefined }, `${name}-crash`).catch(() => undefined);
  }
}

writeFileSync("snapshots/player-qa.json", JSON.stringify(findings, null, 2));
const failed = findings.filter((row) => row.result === "fail").length;
console.log(JSON.stringify({ journeys: findings.length, failed }));
if (failed) process.exitCode = 1;
