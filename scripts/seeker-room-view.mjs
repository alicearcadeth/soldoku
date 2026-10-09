import { execFileSync } from "node:child_process";
import { writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const serial = process.env.SEEKER_SERIAL || "SM02E4072803429";
const out = "docs/evidence/2026-10-09-seeker";
mkdirSync(out, { recursive: true });
const adb = (...args) => execFileSync("adb", ["-s", serial, ...args], { encoding: "utf8" });
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

function dump(name) {
  adb("shell", "uiautomator", "dump", "/sdcard/uidump.xml");
  adb("pull", "/sdcard/uidump.xml", join(out, `${name}.xml`));
  return readFileSync(join(out, `${name}.xml`), "utf8");
}

function tap(xml, needle) {
  const re = /text="([^"]*)"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/g;
  let m;
  let best = null;
  while ((m = re.exec(xml))) {
    if (m[1].includes(needle)) best = m;
  }
  if (!best) return false;
  const cx = ((+best[2] + +best[4]) / 2) | 0;
  const cy = ((+best[3] + +best[5]) / 2) | 0;
  adb("shell", "input", "tap", String(cx), String(cy));
  console.log("tap", needle, cx, cy);
  return true;
}

function texts(xml) {
  return [...xml.matchAll(/text="([^"]+)"/g)].map((m) => m[1]).filter((v, i, a) => a.indexOf(v) === i);
}

adb("shell", "am", "force-stop", "com.sudoku.game");
sleep(800);
adb("shell", "am", "start", "-n", "com.sudoku.game/.MainActivity");
sleep(3000);
let xml = dump("30-start");
if (!texts(xml).includes("Compete") && tap(xml, "Home")) {
  sleep(1500);
  xml = dump("30-home");
}
tap(xml, "Compete") || tap(xml, "LEADERBOARD");
sleep(3000);
xml = dump("31-compete");
tap(xml, "View room");
sleep(2500);
xml = dump("32-room");
const roomTexts = texts(xml);
console.log(JSON.stringify({ roomTexts: roomTexts.slice(0, 40) }, null, 2));
writeFileSync(join(out, "32-room-summary.json"), JSON.stringify({ roomTexts }, null, 2));

adb("shell", "am", "kill", "com.sudoku.game");
sleep(1000);
adb("shell", "am", "start", "-n", "com.sudoku.game/.MainActivity");
sleep(3000);
xml = dump("33-recreate");
console.log(JSON.stringify({ recreate: texts(xml).slice(0, 25) }, null, 2));
