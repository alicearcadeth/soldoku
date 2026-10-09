/** Open room 61702E42 and Start/Continue challenge; stop on board or wallet handoff. */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";

const serial = process.env.SEEKER_SERIAL || "SM02E4072803429";
const ROOM = "61702E42";
const out = "docs/evidence/2026-10-09-seeker";
mkdirSync(out, { recursive: true });
const adb = (...a) => execFileSync("adb", ["-s", serial, ...a], { encoding: "utf8", maxBuffer: 12e6 });
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

function dump(name) {
  adb("shell", "uiautomator", "dump", "/sdcard/uidump.xml");
  adb("pull", "/sdcard/uidump.xml", join(out, `${name}.xml`));
  writeFileSync(join(out, `${name}.png`), execFileSync("adb", ["-s", serial, "exec-out", "screencap", "-p"], { maxBuffer: 8e6 }));
  return readFileSync(join(out, `${name}.xml`), "utf8");
}
function texts(xml) {
  return [...xml.matchAll(/text="([^"]+)"/g)].map((m) => m[1]).filter((v, i, a) => a.indexOf(v) === i);
}
function top() {
  return (adb("shell", "dumpsys", "activity", "activities").match(/topResumedActivity=.*/g) || [])[0] || "";
}
function tapExact(xml, needle) {
  const re = /text="([^"]*)"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/g;
  let m;
  while ((m = re.exec(xml))) {
    if (m[1] !== needle) continue;
    const cx = ((+m[2] + +m[4]) / 2) | 0;
    const cy = ((+m[3] + +m[5]) / 2) | 0;
    adb("shell", "input", "tap", String(cx), String(cy));
    console.log(JSON.stringify({ tap: needle, cx, cy }));
    return true;
  }
  return false;
}
function tapIncludes(xml, needle, { maxLen = 200, minY = 80, maxY = 2500 } = {}) {
  const re = /text="([^"]*)"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/g;
  let m;
  let best = null;
  while ((m = re.exec(xml))) {
    if (!m[1].includes(needle)) continue;
    if (m[1].length > maxLen) continue;
    const cx = ((+m[2] + +m[4]) / 2) | 0;
    const cy = ((+m[3] + +m[5]) / 2) | 0;
    if (cy < minY || cy > maxY) continue;
    const node = { cx, cy, text: m[1], exact: m[1] === needle };
    if (node.exact) {
      adb("shell", "input", "tap", String(cx), String(cy));
      console.log(JSON.stringify({ tap: needle, cx, cy, text: m[1] }));
      return true;
    }
    if (!best || m[1].length < best.text.length) best = node;
  }
  if (!best) return false;
  adb("shell", "input", "tap", String(best.cx), String(best.cy));
  console.log(JSON.stringify({ tap: needle, ...best }));
  return true;
}

adb("shell", "am", "start", "-n", "com.sudoku.game/.MainActivity");
sleep(2000);
let xml = dump("92b-start");
let t = texts(xml);
if (!t.includes("Soldoku") || t.includes("Weekend Sprint")) {
  if (tapExact(xml, "Home") || tapIncludes(xml, "Home")) sleep(1200);
  xml = dump("92b-home");
  t = texts(xml);
}
if (!(t.includes("Weekend Sprint") && t.some((s) => s === "Start challenge" || s === "Continue challenge" || /^Your time /.test(s)))) {
  if (!tapIncludes(xml, "LEADERBOARD") && !tapIncludes(xml, "Compete")) {
    console.log(JSON.stringify({ error: "Compete card not found", texts: t }));
    process.exit(2);
  }
  sleep(2500);
  xml = dump("92b-compete");
  t = texts(xml);
  // Compete may restore last room from localStorage
  const onDetail = t.includes("Weekend Sprint") && t.some((s) => s === "Start challenge" || s === "Continue challenge" || s === "Join room" || /^Your time /.test(s));
  if (!onDetail) {
    if (!tapExact(xml, "View room") && !tapIncludes(xml, "View room")) {
      adb("shell", "input", "tap", "500", "780");
      sleep(300);
      adb("shell", "input", "text", ROOM);
      sleep(400);
      if (!tapExact(xml, "Find room") && !tapIncludes(xml, "Find room")) {
        console.log(JSON.stringify({ error: "Find room missing", texts: t.slice(0, 30) }));
        process.exit(2);
      }
    }
    sleep(2800);
    xml = dump("92b-room");
    t = texts(xml);
  } else {
    writeFileSync(join(out, "92b-room.png"), execFileSync("adb", ["-s", serial, "exec-out", "screencap", "-p"], { maxBuffer: 8e6 }));
    writeFileSync(join(out, "92b-room.xml"), xml);
  }
}
console.log(JSON.stringify({ roomTexts: t.slice(0, 40) }));

if (t.some((s) => /^Your time /.test(s))) {
  writeFileSync(join(out, "92b-start-result.json"), JSON.stringify({ status: "on-board", texts: t }, null, 2));
  console.log(JSON.stringify({ status: "on-board" }));
  process.exit(0);
}
if (t.some((s) => /Finished in/.test(s))) {
  writeFileSync(join(out, "92b-start-result.json"), JSON.stringify({ status: "already-finished", texts: t }, null, 2));
  console.log(JSON.stringify({ status: "already-finished" }));
  process.exit(0);
}

if (!tapExact(xml, "Start challenge") && !tapExact(xml, "Continue challenge")) {
  writeFileSync(join(out, "92b-start-result.json"), JSON.stringify({ status: "no-start-button", texts: t }, null, 2));
  console.log(JSON.stringify({ status: "no-start-button", texts: t.slice(0, 30) }));
  process.exit(2);
}

for (let i = 0; i < 30; i++) {
  sleep(2000);
  xml = dump(`92b-wait-${i}`);
  t = texts(xml);
  const topLine = top();
  const onBoard = t.some((s) => /^Your time /.test(s));
  const wallet = /MWABottomSheet|seedvault/i.test(topLine);
  console.log(JSON.stringify({ i, onBoard, wallet, top: topLine, sample: t.filter((s) => /time|Verify|Start|Continue|Finished|wallet/i.test(s)).slice(0, 8) }));
  if (onBoard) {
    writeFileSync(join(out, "92b-start-result.json"), JSON.stringify({ status: "started", texts: t, top: topLine }, null, 2));
    process.exit(0);
  }
  if (wallet) {
    writeFileSync(join(out, "92b-start-result.json"), JSON.stringify({
      status: "needs-owner-approve",
      instruction: "Approve Soldoku identity MESSAGE (Devnet, not a deposit), then wait for the board.",
      top: topLine,
    }, null, 2));
    // keep waiting for return
    continue;
  }
  if (t.some((s) => /Finished in/.test(s))) {
    writeFileSync(join(out, "92b-start-result.json"), JSON.stringify({ status: "finished", texts: t }, null, 2));
    process.exit(0);
  }
}
writeFileSync(join(out, "92b-start-result.json"), JSON.stringify({ status: "timeout", texts: t }, null, 2));
process.exit(3);
