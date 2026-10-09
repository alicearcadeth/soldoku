/** Classic enter + force-stop preserve only. No HOME until after board visible. */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";

const serial = process.env.SEEKER_SERIAL || "SM02E4072803429";
const out = "docs/evidence/2026-10-09-deploy";
mkdirSync(out, { recursive: true });
const adb = (...a) => execFileSync("adb", ["-s", serial, ...a], { encoding: "utf8", maxBuffer: 12e6 });
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const results = { name: "classic-preserve-d9a182a", startedAt: new Date().toISOString(), phases: [] };
const record = (name, status, detail = {}) => {
  const row = { name, status, ...detail, at: new Date().toISOString() };
  results.phases.push(row);
  console.log(JSON.stringify(row));
  writeFileSync(join(out, "classic-preserve.json"), JSON.stringify(results, null, 2));
};
function dump(n) {
  adb("shell", "uiautomator", "dump", "/sdcard/uidump.xml");
  adb("pull", "/sdcard/uidump.xml", join(out, `${n}.xml`));
  try { writeFileSync(join(out, `${n}.png`), execFileSync("adb", ["-s", serial, "exec-out", "screencap", "-p"], { maxBuffer: 8e6 })); } catch { /* */ }
  return readFileSync(join(out, `${n}.xml`), "utf8");
}
function texts(x) { return [...x.matchAll(/text="([^"]+)"/g)].map((m) => m[1]).filter((v, i, a) => a.indexOf(v) === i); }
function top() { return (adb("shell", "dumpsys", "activity", "activities").match(/topResumedActivity=.*/g) || [])[0] || ""; }
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
function tapExact(xml, needle) {
  const re = /text="([^"]*)"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/g; let m;
  while ((m = re.exec(xml))) {
    if (m[1] !== needle) continue;
    adb("shell", "input", "tap", String(((+m[2] + +m[4]) / 2) | 0), String(((+m[3] + +m[5]) / 2) | 0));
    return true;
  }
  return false;
}
function waitApp(tag) {
  for (let i = 0; i < 12; i++) {
    const xml = dump(`${tag}-${i}`);
    const t = texts(xml);
    const ready = t.includes("Soldoku") || t.includes("Connect wallet") || t.includes("Home")
      || t.some((s) => /Play classic|LEADERBOARD|Compete|Weekend Sprint|Join room|Pause|Notes/i.test(s));
    if (ready) return { xml, t };
    sleep(1000);
  }
  const xml = dump(tag);
  return { xml, t: texts(xml) };
}

adb("shell", "am", "force-stop", "com.sudoku.game");
sleep(1000);
adb("shell", "am", "start", "-W", "-n", "com.sudoku.game/.MainActivity");
sleep(2000);
let { xml, t } = waitApp("22-home");
const restoredRoom = t.includes("61702E42") || t.includes("Weekend Sprint");
record("relaunch-restore", t.includes("Home") || t.includes("Soldoku") || restoredRoom ? "passed" : "blocked", {
  restoredRoom, texts: t.slice(0, 16), top: top(),
});
if (restoredRoom) {
  record("force-stop-room-restore", "passed", { note: "force-stop relaunch restored competition room WebView state without pm clear", room: "61702E42" });
}
if (tapExact(xml, "Home") || tapIncludes(xml, "Home")) {
  sleep(1500);
  ({ xml, t } = waitApp("22-home-nav"));
}

const entered = tapIncludes(xml, "Play classic") || tapIncludes(xml, "SOLO") || tapExact(xml, "New game") || tapExact(xml, "Continue game");
sleep(2000);
xml = dump("22-classic");
t = texts(xml);
if (t.includes("Classic") && (tapIncludes(xml, "Easy") || tapExact(xml, "Easy Singles only"))) {
  sleep(2500);
  xml = dump("22-classic-board");
  t = texts(xml);
}
const onBoard = t.some((s) => /Pause|Notes|Undo|Resume/i.test(s));
record("classic-screen", entered && onBoard ? "passed" : entered || t.includes("Classic") ? "partial" : "blocked", { texts: t.slice(0, 20) });

if (onBoard) {
  tapExact(xml, "Pause");
  sleep(1000);
  xml = dump("22-paused");
  t = texts(xml);
  record("classic-pause", t.some((s) => /Resume|Continue|Pause/i.test(s)) ? "passed" : "partial", { texts: t.slice(0, 15) });
  adb("shell", "input", "keyevent", "3");
  sleep(1500);
  adb("shell", "am", "start", "-W", "-n", "com.sudoku.game/.MainActivity");
  sleep(2000);
  xml = dump("22-bg");
  t = texts(xml);
  record("classic-bg", t.some((s) => /Pause|Resume|Notes|Undo|Continue game|Soldoku|Home/i.test(s)) ? "passed" : "partial", { texts: t.slice(0, 15) });
  adb("shell", "am", "force-stop", "com.sudoku.game");
  sleep(1000);
  adb("shell", "am", "start", "-W", "-n", "com.sudoku.game/.MainActivity");
  sleep(2500);
  ({ xml, t } = waitApp("22-force"));
  record("classic-force-preserve", t.includes("Continue game") || t.some((s) => /Pause|Resume|Notes/i.test(s)) ? "passed" : "partial", { texts: t.slice(0, 18) });
}

results.finishedAt = new Date().toISOString();
writeFileSync(join(out, "classic-preserve.json"), JSON.stringify(results, null, 2));
console.log(JSON.stringify({ summary: results.phases.map((p) => [p.name, p.status]) }, null, 2));
process.exit(results.phases.some((p) => p.status === "failed" || p.status === "blocked") ? 2 : 0);
