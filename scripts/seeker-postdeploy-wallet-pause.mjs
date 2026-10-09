import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";

const serial = process.env.SEEKER_SERIAL || "SM02E4072803429";
const out = "docs/evidence/2026-10-09-deploy";
mkdirSync(out, { recursive: true });
const adb = (...a) => execFileSync("adb", ["-s", serial, ...a], { encoding: "utf8", maxBuffer: 12e6 });
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const results = JSON.parse(readFileSync(join(out, "seeker-postdeploy.json"), "utf8"));
const record = (name, status, detail = {}) => {
  results.phases = results.phases.filter((p) => p.name !== name);
  results.phases.push({ name, status, ...detail, at: new Date().toISOString() });
  console.log(JSON.stringify({ name, status, ...detail }));
  writeFileSync(join(out, "seeker-postdeploy.json"), JSON.stringify(results, null, 2));
};
function dump(name) {
  adb("shell", "uiautomator", "dump", "/sdcard/uidump.xml");
  adb("pull", "/sdcard/uidump.xml", join(out, `${name}.xml`));
  try { writeFileSync(join(out, `${name}.png`), execFileSync("adb", ["-s", serial, "exec-out", "screencap", "-p"], { maxBuffer: 8e6 })); } catch { /* */ }
  return readFileSync(join(out, `${name}.xml`), "utf8");
}
function texts(xml) { return [...xml.matchAll(/text="([^"]+)"/g)].map((m) => m[1]).filter((v, i, a) => a.indexOf(v) === i); }
function top() { return (adb("shell", "dumpsys", "activity", "activities").match(/topResumedActivity=.*/g) || [])[0] || ""; }
function tapExact(xml, needle) {
  const re = /text="([^"]*)"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/g; let m;
  while ((m = re.exec(xml))) {
    if (m[1] !== needle) continue;
    adb("shell", "input", "tap", String(((+m[2] + +m[4]) / 2) | 0), String(((+m[3] + +m[5]) / 2) | 0));
    console.log(JSON.stringify({ tap: needle })); return true;
  }
  return false;
}
function tapIncludes(xml, needle, maxLen = 220) {
  const re = /text="([^"]*)"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/g; let best = null; let m;
  while ((m = re.exec(xml))) {
    if (!m[1].includes(needle) || m[1].length > maxLen) continue;
    const n = { text: m[1], cx: ((+m[2] + +m[4]) / 2) | 0, cy: ((+m[3] + +m[5]) / 2) | 0 };
    if (m[1] === needle) { adb("shell", "input", "tap", String(n.cx), String(n.cy)); return true; }
    if (!best || m[1].length < best.text.length) best = n;
  }
  if (!best) return false;
  adb("shell", "input", "tap", String(best.cx), String(best.cy));
  console.log(JSON.stringify({ tap: needle, text: best.text }));
  return true;
}

adb("shell", "am", "start", "-n", "com.sudoku.game/.MainActivity");
sleep(2000);
let xml = dump("10-start");
tapExact(xml, "Home") || tapIncludes(xml, "Home");
sleep(1500);
xml = dump("10-home");
let t = texts(xml);
record("cold-home", t.includes("Soldoku") ? "passed" : "partial", { texts: t.slice(0, 18) });

// Wallet cancel
if (!t.includes("Connect wallet")) {
  if (tapIncludes(xml, "E3DQ") || tapIncludes(xml, "DpJn")) {
    sleep(1000); xml = dump("11-chip");
    tapExact(xml, "Disconnect"); sleep(1500);
    xml = dump("11-disconnected"); t = texts(xml);
  }
}
if (tapExact(xml, "Connect wallet") || texts(xml).includes("Connect wallet")) {
  if (!texts(xml).includes("Connect wallet")) { /* already opened */ } else { tapExact(xml, "Connect wallet"); }
  sleep(1200);
  xml = dump("12-sheet");
  tapIncludes(xml, "Mobile Wallet Adapter") || tapIncludes(xml, "Detected");
  sleep(3000);
  let saw = false;
  for (let i = 0; i < 15; i++) {
    const line = top();
    xml = dump(`12-poll-${i}`);
    if (/MWABottomSheet|seedvault/i.test(line)) {
      saw = true;
      adb("shell", "input", "keyevent", "4");
      sleep(2000);
      break;
    }
    if (tapExact(xml, "Close") || tapExact(xml, "Cancel")) { saw = true; sleep(1500); break; }
    sleep(1500);
  }
  xml = dump("12-returned");
  t = texts(xml);
  const ok = /com\.sudoku\.game/.test(top()) && (t.includes("Soldoku") || t.includes("Connect wallet") || t.some((s) => /Compete|Play classic/i.test(s)));
  record("wallet-cancel-return", saw && ok ? "passed" : ok ? "partial" : "failed", { sawMwaOrClose: saw, texts: t.slice(0, 16), top: top() });
}

// Funded pause UI
tapExact(xml, "Home") || tapIncludes(xml, "Home"); sleep(1000);
xml = dump("13-home");
tapIncludes(xml, "LEADERBOARD") || tapIncludes(xml, "Compete"); sleep(2500);
xml = dump("13-compete");
// leave room detail if restored
if (texts(xml).includes("Weekend Sprint") && !texts(xml).includes("Create competition")) {
  tapIncludes(xml, "Back to Rooms"); sleep(1500); xml = dump("13-browse");
}
tapExact(xml, "Create competition") || tapIncludes(xml, "Create competition"); sleep(1500);
xml = dump("14-create");
tapExact(xml, "For tokens") || tapIncludes(xml, "For tokens"); sleep(1200);
xml = dump("14-tokens");
t = texts(xml);
const pauseUi = t.some((s) => /paused|Claims, refunds|Funded rooms paused/i.test(s));
record("funded-pause-ui", pauseUi ? "passed" : "failed", { texts: t.filter((s) => /pause|Claim|Create|TEST|Card|Funded/i.test(s)).slice(0, 25) });

results.finishedAt = new Date().toISOString();
writeFileSync(join(out, "seeker-postdeploy.json"), JSON.stringify(results, null, 2));
console.log(JSON.stringify({ summary: results.phases.map((p) => [p.name, p.status]) }, null, 2));
