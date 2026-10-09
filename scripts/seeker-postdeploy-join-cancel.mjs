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
function top() { return (adb("shell", "dumpsys", "activity", "activities").match(/topResumedActivity=.*/g) || [])[0] || ""; }
function tapExact(xml, needle) {
  const re = /text="([^"]*)"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/g; let m;
  while ((m = re.exec(xml))) {
    if (m[1] !== needle) continue;
    adb("shell", "input", "tap", String(((+m[2] + +m[4]) / 2) | 0), String(((+m[3] + +m[5]) / 2) | 0));
    return true;
  }
  return false;
}
function tapIncludes(xml, needle) {
  const re = /text="([^"]*)"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/g; let best = null; let m;
  while ((m = re.exec(xml))) {
    if (!m[1].includes(needle) || m[1].length > 220) continue;
    const n = { cx: ((+m[2] + +m[4]) / 2) | 0, cy: ((+m[3] + +m[5]) / 2) | 0, text: m[1] };
    if (m[1] === needle) { adb("shell", "input", "tap", String(n.cx), String(n.cy)); return true; }
    if (!best || m[1].length < best.text.length) best = n;
  }
  if (!best) return false;
  adb("shell", "input", "tap", String(best.cx), String(best.cy));
  return true;
}
function dismissSheets(xml) {
  if (tapExact(xml, "Close") || tapExact(xml, "Cancel")) { sleep(1200); return true; }
  if (texts(xml).some((s) => /Waiting for approval|Choose your Solana wallet/i.test(s))) {
    adb("shell", "input", "keyevent", "4");
    sleep(1200);
    return true;
  }
  return false;
}

adb("shell", "am", "start", "-n", "com.sudoku.game/.MainActivity");
sleep(2000);
let xml = dump("17-start");
dismissSheets(xml);
xml = dump("17-cleared");
tapExact(xml, "Home") || tapIncludes(xml, "Home");
sleep(1200);
xml = dump("17-home");
tapIncludes(xml, "LEADERBOARD") || tapIncludes(xml, "Compete");
sleep(2500);
xml = dump("17-compete");
if (!(texts(xml).includes("Join room") && texts(xml).includes("61702E42"))) {
  if (texts(xml).includes("Weekend Sprint") && !texts(xml).includes("Find room")) {
    tapIncludes(xml, "Back to Rooms");
    sleep(1500);
    xml = dump("17-browse");
  }
  adb("shell", "input", "tap", "500", "780");
  sleep(300);
  adb("shell", "input", "text", "61702E42");
  sleep(400);
  tapExact(xml, "Find room") || tapIncludes(xml, "Find room");
  sleep(2800);
  xml = dump("17-room");
}
if (!tapExact(xml, "Join room")) {
  console.log(JSON.stringify({ error: "no Join", texts: texts(xml).slice(0, 25) }));
  process.exit(2);
}
sleep(2500);

let path = "none";
let cancelled = false;
for (let i = 0; i < 18; i++) {
  const line = top();
  xml = dump(`17-join-${i}`);
  const t = texts(xml);
  if (/MWABottomSheet|seedvault/i.test(line)) {
    path = "native-mwa";
    adb("shell", "input", "keyevent", "4");
    sleep(2500);
    cancelled = true;
    break;
  }
  if (t.some((s) => /Waiting for approval|Choose your Solana wallet|Connect wallet/i.test(s)) && t.includes("Close")) {
    path = "in-app-connect";
    tapExact(xml, "Close") || adb("shell", "input", "keyevent", "4");
    sleep(2000);
    cancelled = true;
    break;
  }
  if (t.some((s) => /Verify your wallet identity/i.test(s))) {
    path = "verify-prompt";
    adb("shell", "input", "keyevent", "4");
    sleep(2000);
    cancelled = true;
    break;
  }
  sleep(1500);
}

xml = dump("17-after-join-cancel");
const t = texts(xml);
const onApp = /com\.sudoku\.game/.test(top()) && !/MWABottomSheet|seedvault/i.test(top());
const stuck = t.some((s) => /Verify your wallet identity/i.test(s));
const waiting = t.some((s) => /Waiting for approval/i.test(s));
const backOnRoomOrHome = t.includes("Join room") || t.includes("Soldoku") || t.includes("Connect wallet") || t.some((s) => /Compete|Play classic/i.test(s));
const passed = cancelled && onApp && !stuck && !waiting && backOnRoomOrHome;

const results = JSON.parse(readFileSync(join(out, "seeker-postdeploy.json"), "utf8"));
results.phases = results.phases.filter((p) => p.name !== "join-cancel-return");
results.phases.push({
  name: "join-cancel-return",
  status: passed ? "passed" : stuck || waiting ? "failed" : cancelled ? "partial" : "blocked",
  path,
  cancelled,
  stuckVerify: stuck,
  stillWaiting: waiting,
  texts: t.slice(0, 25),
  top: top(),
  at: new Date().toISOString(),
});
results.finishedAt = new Date().toISOString();
writeFileSync(join(out, "seeker-postdeploy.json"), JSON.stringify(results, null, 2));
console.log(JSON.stringify({ passed, path, cancelled, stuck, waiting, onApp, sample: t.slice(0, 20), top: top() }, null, 2));
process.exit(passed ? 0 : 2);
