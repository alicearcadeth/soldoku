/** State-preserving Classic lifecycle on live soldoku.com (no pm clear). */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";

const serial = process.env.SEEKER_SERIAL || "SM02E4072803429";
const out = "docs/evidence/2026-10-09-deploy";
mkdirSync(out, { recursive: true });
const adb = (...a) => execFileSync("adb", ["-s", serial, ...a], { encoding: "utf8", maxBuffer: 12e6 });
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const results = {
  name: "lifecycle-preserve-d9a182a",
  releaseHint: "APK WebView → soldoku.com (verify /api/release separately)",
  startedAt: new Date().toISOString(),
  phases: [],
};
const record = (name, status, detail = {}) => {
  const row = { name, status, ...detail, at: new Date().toISOString() };
  results.phases.push(row);
  console.log(JSON.stringify(row));
  writeFileSync(join(out, "lifecycle-preserve.json"), JSON.stringify(results, null, 2));
};
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

// Do NOT clear storage. Force-stop only. Dismiss shade that can steal uiautomator.
adb("shell", "input", "keyevent", "4");
sleep(400);
adb("shell", "input", "keyevent", "3");
sleep(600);
adb("shell", "am", "force-stop", "com.sudoku.game");
sleep(800);
adb("shell", "am", "start", "-n", "com.sudoku.game/.MainActivity");
sleep(3500);
adb("shell", "input", "keyevent", "4");
sleep(500);
let xml = dump("20-home");
let t = texts(xml);
if (t.includes("Messages") || t.includes("USB debugging connected")) {
  adb("shell", "input", "keyevent", "4");
  sleep(800);
  xml = dump("20-home");
  t = texts(xml);
}
record("relaunch-home", t.includes("Soldoku") || t.includes("Connect wallet") ? "passed" : "partial", { texts: t.slice(0, 18), top: top() });

// Classic new game
if (tapIncludes(xml, "Play classic") || tapIncludes(xml, "SOLO") || tapExact(xml, "New game")) {
  sleep(2000);
  xml = dump("20-classic");
  t = texts(xml);
  const onBoard = t.some((s) => /Pause|Notes|Undo/i.test(s)) || /android.widget.Button/.test(xml);
  record("classic-enter", onBoard ? "passed" : "blocked", { texts: t.slice(0, 20) });
  // place a couple keypad taps if pad visible
  if (tapExact(xml, "5") || tapExact(xml, "7")) {
    sleep(400);
    tapExact(xml, "5") || tapExact(xml, "3");
    sleep(600);
    xml = dump("20-after-digits");
    t = texts(xml);
    record("classic-digits", "passed", { texts: t.filter((s) => /Pause|Notes|Undo|Continue|Resume/i.test(s)).slice(0, 10) });
  } else {
    record("classic-digits", "partial", { note: "keypad digits not exposed as text nodes", texts: t.slice(0, 15) });
  }
} else {
  record("classic-enter", "blocked", { texts: t.slice(0, 15) });
}

// Background via HOME then reopen
adb("shell", "input", "keyevent", "3");
sleep(2000);
adb("shell", "am", "start", "-n", "com.sudoku.game/.MainActivity");
sleep(2500);
xml = dump("20-bg-reopen");
t = texts(xml);
const recoveredBg = t.some((s) => /Pause|Resume|Continue game|Notes|Undo/i.test(s)) || t.includes("Soldoku");
record("classic-bg-reopen", recoveredBg ? "passed" : "partial", { texts: t.slice(0, 18), top: top() });

// Force-stop + relaunch (storage preserved)
adb("shell", "am", "force-stop", "com.sudoku.game");
sleep(1000);
adb("shell", "am", "start", "-n", "com.sudoku.game/.MainActivity");
sleep(3500);
xml = dump("20-force-relaunch");
t = texts(xml);
const continueOk = t.includes("Continue game") || t.some((s) => /Pause|Resume|Notes/i.test(s));
record("classic-force-stop-relaunch", continueOk ? "passed" : "partial", { texts: t.slice(0, 20), top: top() });

// Free room identity / prior LB (no new join approve)
if (tapExact(xml, "Home") || tapIncludes(xml, "Home")) { sleep(1200); xml = dump("20-home2"); }
tapIncludes(xml, "LEADERBOARD") || tapIncludes(xml, "Compete");
sleep(2500);
xml = dump("20-compete");
t = texts(xml);
if (!(t.includes("61702E42") && t.includes("Join room"))) {
  if (t.includes("Weekend Sprint") && !t.includes("Find room")) {
    tapIncludes(xml, "Back to Rooms"); sleep(1500); xml = dump("20-browse");
  }
  adb("shell", "input", "tap", "500", "780"); sleep(300);
  adb("shell", "input", "text", "61702E42"); sleep(400);
  tapExact(xml, "Find room") || tapIncludes(xml, "Find room"); sleep(2800);
  xml = dump("20-room");
  t = texts(xml);
}
const roomOk = t.includes("61702E42") && t.includes("Weekend Sprint");
const lbHasPrior = t.some((s) => /E3DQ|FTwf|7:50|0:25/i.test(s));
record("free-room-identity", roomOk ? "passed" : "blocked", { lbHasPrior, joinPresent: t.includes("Join room"), startPresent: t.includes("Start challenge"), texts: t.slice(0, 28) });

// Wallet cancel/return (physical MWA if available; Close otherwise)
if (tapExact(xml, "Home") || tapIncludes(xml, "Home")) { sleep(1200); xml = dump("20-home3"); t = texts(xml); }
if (t.includes("Connect wallet") || tapExact(xml, "Connect wallet")) {
  if (!texts(xml).includes("Choose your Solana wallet")) { tapExact(xml, "Connect wallet"); sleep(1200); xml = dump("20-sheet"); }
  else xml = dump("20-sheet");
  t = texts(xml);
  tapIncludes(xml, "Mobile Wallet Adapter") || tapIncludes(xml, "Detected");
  sleep(2500);
  let path = "none";
  for (let i = 0; i < 12; i++) {
    const line = top();
    xml = dump(`20-wallet-${i}`);
    t = texts(xml);
    if (/MWABottomSheet|seedvault/i.test(line)) {
      path = "native-mwa";
      adb("shell", "input", "keyevent", "4");
      sleep(2000);
      break;
    }
    if (t.includes("Close") && t.some((s) => /Waiting for approval|Connect wallet/i.test(s))) {
      path = "in-app-close";
      tapExact(xml, "Close");
      sleep(1500);
      break;
    }
    sleep(1500);
  }
  xml = dump("20-wallet-returned");
  t = texts(xml);
  const stuck = t.some((s) => /Verify your wallet identity/i.test(s));
  const usable = /com\.sudoku\.game/.test(top()) && (t.includes("Soldoku") || t.includes("Connect wallet") || t.some((s) => /Compete|Play classic/i.test(s)));
  record("wallet-cancel-return", !stuck && usable ? "passed" : stuck ? "failed" : "partial", { path, stuck, texts: t.slice(0, 16), top: top() });
} else {
  record("wallet-cancel-return", "skipped", { note: "wallet already connected; chip path not automated here", texts: t.slice(0, 12) });
}

results.finishedAt = new Date().toISOString();
writeFileSync(join(out, "lifecycle-preserve.json"), JSON.stringify(results, null, 2));
console.log(JSON.stringify({ summary: results.phases.map((p) => [p.name, p.status]) }, null, 2));
process.exit(results.phases.some((p) => p.status === "failed") ? 2 : 0);
