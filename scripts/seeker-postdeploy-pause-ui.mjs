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
  try { writeFileSync(join(out, `${n}.png`), execFileSync("adb", ["-s", serial, "exec-out", "screencap", "-p"], { maxBuffer: 8e6 })); } catch { /* */ }
  return readFileSync(join(out, `${n}.xml`), "utf8");
}
function texts(x) { return [...x.matchAll(/text="([^"]+)"/g)].map((m) => m[1]).filter((v, i, a) => a.indexOf(v) === i); }
function tapExact(xml, needle) {
  const re = /text="([^"]*)"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/g; let m;
  while ((m = re.exec(xml))) {
    if (m[1] !== needle) continue;
    adb("shell", "input", "tap", String(((+m[2] + +m[4]) / 2) | 0), String(((+m[3] + +m[5]) / 2) | 0));
    console.log(JSON.stringify({ tap: needle })); return true;
  }
  return false;
}
function tapIncludes(xml, needle) {
  const re = /text="([^"]*)"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/g; let best = null; let m;
  while ((m = re.exec(xml))) {
    if (!m[1].includes(needle) || m[1].length > 220) continue;
    const n = { text: m[1], cx: ((+m[2] + +m[4]) / 2) | 0, cy: ((+m[3] + +m[5]) / 2) | 0 };
    if (m[1] === needle) { adb("shell", "input", "tap", String(n.cx), String(n.cy)); return true; }
    if (!best || m[1].length < best.text.length) best = n;
  }
  if (!best) return false;
  adb("shell", "input", "tap", String(best.cx), String(best.cy));
  console.log(JSON.stringify({ tap: needle, text: best.text }));
  return true;
}

adb("shell", "input", "keyevent", "4"); sleep(500);
let xml = dump("15-pre");
tapExact(xml, "Close"); sleep(800);
xml = dump("15-home");
if (!texts(xml).includes("Soldoku")) { tapExact(xml, "Home"); sleep(1000); xml = dump("15-home2"); }
tapIncludes(xml, "LEADERBOARD"); sleep(2500);
xml = dump("15-compete");
if (texts(xml).includes("Weekend Sprint") && !texts(xml).includes("Create competition")) {
  tapIncludes(xml, "Back to Rooms"); sleep(1500); xml = dump("15-browse");
}
tapExact(xml, "Create competition") || tapIncludes(xml, "Create competition"); sleep(1800);
xml = dump("15-create");
console.log(JSON.stringify({ create: texts(xml).slice(0, 35) }));
tapExact(xml, "For tokens") || tapIncludes(xml, "For tokens"); sleep(1500);
xml = dump("15-tokens");
const t = texts(xml);
const pauseUi = t.some((s) => /paused|Claims, refunds|Funded rooms paused/i.test(s));
console.log(JSON.stringify({ pauseUi, pauseTexts: t.filter((s) => /pause|Claim|Create|TEST|Card|Funded|unavailable/i.test(s)), all: t.slice(0, 45) }, null, 2));
const results = JSON.parse(readFileSync(join(out, "seeker-postdeploy.json"), "utf8"));
results.phases = results.phases.filter((p) => p.name !== "funded-pause-ui");
results.phases.push({ name: "funded-pause-ui", status: pauseUi ? "passed" : "failed", texts: t.filter((s) => /pause|Claim|Create|TEST|Card|Funded/i.test(s)).slice(0, 25), at: new Date().toISOString() });
results.finishedAt = new Date().toISOString();
writeFileSync(join(out, "seeker-postdeploy.json"), JSON.stringify(results, null, 2));
process.exit(pauseUi ? 0 : 2);
