import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";

const serial = process.env.SEEKER_SERIAL || "SM02E4072803429";
const out = "docs/evidence/2026-10-09-deploy";
mkdirSync(out, { recursive: true });
const adb = (...a) => execFileSync("adb", ["-s", serial, ...a], { encoding: "utf8", maxBuffer: 12e6 });
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
function dump(n) {
  adb("shell", "uiautomator", "dump", "/sdcard/uidump.xml");
  adb("pull", "/sdcard/uidump.xml", join(out, `${n}.xml`));
  return readFileSync(join(out, `${n}.xml`), "utf8");
}
function texts(x) { return [...x.matchAll(/text="([^"]+)"/g)].map((m) => m[1]).filter((v, i, a) => a.indexOf(v) === i); }
function tapExact(xml, needle) {
  const re = /text="([^"]*)"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/g; let m;
  while ((m = re.exec(xml))) {
    if (m[1] !== needle) continue;
    adb("shell", "input", "tap", String(((+m[2] + +m[4]) / 2) | 0), String(((+m[3] + +m[5]) / 2) | 0));
    return true;
  }
  return false;
}

adb("shell", "am", "start", "-W", "-n", "com.sudoku.game/.MainActivity");
sleep(2000);
let xml = dump("23-cur");
tapExact(xml, "Home");
sleep(2000);
xml = dump("23-home");
const t = texts(xml);
const row = { at: new Date().toISOString(), continueGame: t.includes("Continue game"), texts: t.slice(0, 25) };
writeFileSync(join(out, "classic-continue-check.json"), JSON.stringify(row, null, 2));
console.log(JSON.stringify(row, null, 2));
process.exit(row.continueGame ? 0 : 1);
