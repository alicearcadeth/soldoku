/**
 * Read-only competition-session validity probe on physical Seeker.
 * Opens Compete → Create → Free → Prepare room so identity() runs.
 * Does not clear storage. Aborts before Create room if slider appears.
 * Pass = session still cached (no Seed Vault message). Fail path = fresh auth required.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";

const serial = process.env.SEEKER_SERIAL || "SM02E4072803429";
const out = process.env.SEEKER_OUT || "docs/evidence/2026-10-09-deploy";
mkdirSync(out, { recursive: true });
const adb = (...a) => execFileSync("adb", ["-s", serial, ...a], { encoding: "utf8", maxBuffer: 12e6 });
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

const estimateAuthorize = Date.parse("2026-10-09T07:01:39.208Z");
const estimateExpires = estimateAuthorize + 24 * 60 * 60 * 1000;
const now = Date.now();

const results = {
  name: "competition-session-probe",
  startedAt: new Date().toISOString(),
  hostedRelease: null,
  wallClock: {
    nowUtc: new Date(now).toISOString(),
    estimateAuthorizeUtc: new Date(estimateAuthorize).toISOString(),
    estimateExpiresUtc: new Date(estimateExpires).toISOString(),
    estimateExpiresIct: "2026-10-10 14:01:39 +07:00",
    hoursUntilEstimate: Number(((estimateExpires - now) / 3600000).toFixed(2)),
    estimateExpired: now >= estimateExpires,
  },
  storageReadable: false,
  storageNote: "APK not debuggable; localStorage.sudoku.competitionSession not readable via run-as",
  phases: [],
};

function top() {
  return (adb("shell", "dumpsys", "activity", "activities").match(/topResumedActivity=.*/g) || [])[0] || "";
}
function dump(n) {
  const line = top();
  const secure = /seedvault|keyguard|MWABottomSheet/i.test(line);
  adb("shell", "uiautomator", "dump", "/sdcard/uidump.xml");
  adb("pull", "/sdcard/uidump.xml", join(out, `${n}.xml`));
  if (!secure) {
    try {
      writeFileSync(join(out, `${n}.png`), execFileSync("adb", ["-s", serial, "exec-out", "screencap", "-p"], { maxBuffer: 8e6 }));
    } catch { /* */ }
  }
  return readFileSync(join(out, `${n}.xml`), "utf8");
}
function texts(x) {
  return [...x.matchAll(/text="([^"]+)"/g)].map((m) => m[1]).filter((v, i, a) => a.indexOf(v) === i);
}
function tapExact(xml, needle) {
  const re = /text="([^"]*)"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/g;
  let m;
  while ((m = re.exec(xml))) {
    if (m[1] !== needle) continue;
    adb("shell", "input", "tap", String(((+m[2] + +m[4]) / 2) | 0), String(((+m[3] + +m[5]) / 2) | 0));
    return true;
  }
  return false;
}
function tapIncludes(xml, needle) {
  const re = /text="([^"]*)"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/g;
  let best = null; let m;
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
function record(name, status, detail = {}) {
  const row = { name, status, ...detail, at: new Date().toISOString() };
  results.phases.push(row);
  writeFileSync(join(out, "session-probe.json"), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(row));
}

const release = await (await fetch("https://soldoku.com/api/release")).json();
results.hostedRelease = release.commit;
results.wallClock.releaseDirty = release.dirty;

adb("shell", "am", "start", "-W", "-n", "com.sudoku.game/.MainActivity");
sleep(2500);
let xml = dump("50-home");
let t = texts(xml);
if (tapExact(xml, "Close")) { sleep(800); xml = dump("50-home"); t = texts(xml); }
if (!(t.includes("Soldoku") || t.includes("Connect wallet"))) {
  tapExact(xml, "Home"); sleep(1200); xml = dump("50-home"); t = texts(xml);
}
const connected = t.some((s) => /E3DQ|DpJn|…/.test(s) && !/Connect wallet/i.test(s));
record("home", connected ? "passed" : "needs-connect", { texts: t.slice(0, 14), connected });

if (!connected && t.includes("Connect wallet")) {
  record("session-probe", "blocked", { reason: "wallet not connected; connect first or owner switches account" });
  results.finishedAt = new Date().toISOString();
  results.verdict = { sessionLikelyValid: null, readyForFreshMessage: false, reason: "wallet disconnected" };
  writeFileSync(join(out, "session-probe.json"), JSON.stringify(results, null, 2));
  process.exit(2);
}

tapIncludes(xml, "LEADERBOARD") || tapIncludes(xml, "Compete");
sleep(2500);
xml = dump("50-compete");
t = texts(xml);
if (t.includes("← Back to Rooms") || t.includes("Back to Rooms")) {
  tapIncludes(xml, "Back to Rooms"); sleep(1500); xml = dump("50-browse"); t = texts(xml);
}
tapExact(xml, "Create competition") || tapIncludes(xml, "Create");
sleep(2000);
xml = dump("50-create");
t = texts(xml);
tapExact(xml, "Free competition") || tapIncludes(xml, "Free");
sleep(1000);
xml = dump("50-free");
t = texts(xml);
// Create room is below the fold on Seeker — swipe up then tap exact label
adb("shell", "input", "swipe", "540", "1900", "540", "700", "350");
sleep(800);
xml = dump("50-free-scrolled");
t = texts(xml);
const prep = tapExact(xml, "Create room");
record("create-path", prep ? "tapped" : "blocked", { texts: t.slice(0, 30), hadCreateRoom: t.includes("Create room") });
if (!prep) {
  results.finishedAt = new Date().toISOString();
  results.verdict = { sessionLikelyValid: null, readyForFreshMessage: false, reason: "Create room button not found" };
  writeFileSync(join(out, "session-probe.json"), JSON.stringify(results, null, 2));
  process.exit(2);
}
sleep(2500);

let sawNative = false;
let sawSeed = false;
let sawVerify = false;
let sawSlider = false;
let sawBusy = false;
const deadline = Date.now() + 45_000;
while (Date.now() < deadline) {
  const line = top();
  xml = dump(`50-probe-${Date.now()}`);
  t = texts(xml);
  if (/MWABottomSheet/i.test(line)) sawNative = true;
  if (/seedvault/i.test(line)) sawSeed = true;
  if (t.some((s) => /Verify your wallet identity/i.test(s))) sawBusy = true;
  // Gate dialog only — do not treat the Create form's "Create room" button as success
  if (t.some((s) => /Quick check before creating|Slide the solid dot|Verify position|Confirm create room/i.test(s))) {
    sawSlider = true;
  }
  // Abort if gate/slider opened without wallet handoff — session reused
  if (sawSlider && !sawNative && !sawSeed && /com\.sudoku\.game/.test(line)) break;
  // Fresh auth path
  if (sawNative || sawSeed) break;
  sleep(1500);
}

// Back out safely
if (/com\.sudoku\.game/.test(top())) {
  if (tapExact(xml, "Close") || tapExact(xml, "Cancel") || tapIncludes(xml, "Back")) sleep(800);
  adb("shell", "input", "keyevent", "4");
  sleep(800);
  adb("shell", "input", "keyevent", "4");
}

const freshRequired = sawNative || sawSeed;
const sessionLikelyValid = sawSlider && !freshRequired;
results.finishedAt = new Date().toISOString();
results.verdict = {
  sessionLikelyValid: sessionLikelyValid ? true : freshRequired ? false : null,
  readyForFreshMessage: freshRequired,
  estimateExpired: results.wallClock.estimateExpired,
  sawNativeMwa: sawNative,
  sawSeedVault: sawSeed,
  sawSliderOrCreate: sawSlider,
  sawVerifyBusy: sawBusy,
  note: freshRequired
    ? "identity() requested wallet handoff — competition session absent/expired; proceed with message approve test"
    : sessionLikelyValid
      ? "identity() reached create gate without Seed Vault — competition session still valid; do not claim fresh message yet"
      : "inconclusive UI; see dumps",
};
record("probe-result", freshRequired ? "fresh-auth-required" : sessionLikelyValid ? "session-still-valid" : "inconclusive", results.verdict);
writeFileSync(join(out, "session-probe.json"), JSON.stringify(results, null, 2));
console.log(JSON.stringify({ verdict: results.verdict, wallClock: results.wallClock }, null, 2));
process.exit(0);
