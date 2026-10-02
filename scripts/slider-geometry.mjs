import { chromium } from "playwright";

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true })).newPage();
await page.goto("https://sudoku.jamesbitarcade.workers.dev/", { waitUntil: "domcontentloaded" });
await page.getByRole("button", { name: "Compete" }).click();
await page.locator(".slider").waitFor();
const start = await measure(page);
await page.screenshot({ path: "output/slider-start.png" });
await drag(page, 0.02);
const low = await measure(page);
await page.screenshot({ path: "output/slider-low.png" });
await drag(page, 0.98);
const high = await measure(page);
await page.screenshot({ path: "output/slider-high.png" });
const notch = page.locator(".notch");
const mark = await notch.boundingBox();
await page.mouse.click(mark.x + mark.width / 2, mark.y + mark.height / 2);
await page.getByRole("button", { name: "Create room" }).waitFor();
console.log(JSON.stringify({ start, low, high, passed: start.inside && low.inside && high.inside }));
await browser.close();

async function measure(page) {
  return page.evaluate(() => {
    const track = document.querySelector(".slider").getBoundingClientRect();
    const knob = document.querySelector(".knob").getBoundingClientRect();
    const inside = knob.left >= track.left - 0.5 && knob.right <= track.right + 0.5 && knob.top >= track.top - 0.5 && knob.bottom <= track.bottom + 0.5;
    return { inside, track: Math.round(track.width), knobLeft: Math.round(knob.left - track.left), knobRight: Math.round(track.right - knob.right) };
  });
}

async function drag(page, fraction) {
  const box = await page.locator(".slider").boundingBox();
  await page.mouse.move(box.x + 20, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * fraction, box.y + box.height / 2);
  await page.mouse.up();
}
