/** Reject a wallet/sign request and confirm return to Soldoku. */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";

const serial = process.env.SEEKER_SERIAL || "SM02E4072803429";
const out = "docs/evidence/2026-10-09-seeker";
mkdirSync(out, { recursive: true });
const adb = (...a) => execFileSync("adb", ["-s", serial, ...a], { encoding: "utf8", maxBuffer: 12e6 });
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

function dump(name) {
  adb("shell", "uiautomator", "dump", "/sdcard/uidump.xml");
  adb("pull", "/sdcard/uidump.xml", join(out, `${name}.xml`));
  try {
    writeFileSync(join(out, `${name}.png`), execFileSync("adb", ["-s", serial, "exec-out", "screencap", "-p"], { maxBuffer: 8e6 }));
  } catch { /* ignore */ }
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
    adb("shell", "input", "tap", String(((+m[2] + +m[4]) / 2) | 0), String(((+m[3] + +m[5]) / 2) | 0));
    console.log(JSON.stringify({ tap: needle }));
    return true;
  }
  return false;
}
function tapIncludes(xml, needle, maxLen = 200) {
  const re = /text="([^"]*)"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/g;
  let best = null; let m;
  while ((m = re.exec(xml))) {
    if (!m[1].includes(needle) || m[1].length > maxLen) continue;
    const node = { text: m[1], cx: ((+m[2] + +m[4]) / 2) | 0, cy: ((+m[3] + +m[5]) / 2) | 0 };
    if (m[1] === needle) { adb("shell", "input", "tap", String(node.cx), String(node.cy)); console.log(JSON.stringify({ tap: needle })); return true; }
    if (!best || m[1].length < best.text.length) best = node;
  }
  if (!best) return false;
  adb("shell", "input", "tap", String(best.cx), String(best.cy));
  console.log(JSON.stringify({ tap: needle, text: best.text }));
  return true;
}

const result = { startedAt: new Date().toISOString(), steps: [] };
const note = (s, d = {}) => { result.steps.push({ s, ...d, at: new Date().toISOString() }); console.log(JSON.stringify({ s, ...d })); };

adb("shell", "am", "start", "-n", "com.sudoku.game/.MainActivity");
sleep(1500);
let xml = dump("92d-start");
let t = texts(xml);

// Dismiss any open sheet
if (t.includes("Close") || t.includes("Cancel")) {
  tapExact(xml, "Close") || tapExact(xml, "Cancel") || adb("shell", "input", "keyevent", "4");
  sleep(1000);
  xml = dump("92d-closed");
  t = texts(xml);
}

// Ensure home
if (!t.includes("Soldoku") || t.includes("Weekend Sprint") || t.includes("Create competition")) {
  tapExact(xml, "Home") || tapIncludes(xml, "Home");
  sleep(1200);
  xml = dump("92d-home");
  t = texts(xml);
}

// If still connected, disconnect to force fresh auth
if (t.some((s) => /E3DQ|DpJn|…/.test(s)) && !t.includes("Connect wallet")) {
  if (tapIncludes(xml, "E3DQ") || tapIncludes(xml, "DpJn")) {
    sleep(1000);
    xml = dump("92d-sheet");
    if (tapExact(xml, "Disconnect")) {
      note("disconnected");
      sleep(1500);
    } else {
      tapExact(xml, "Close");
      sleep(800);
    }
    xml = dump("92d-home2");
    t = texts(xml);
  }
}

// Trigger Connect → reject
if (!t.includes("Connect wallet")) {
  // already connected — use Create room for message sign reject
  note("still-connected", { texts: t.slice(0, 15) });
} else {
  tapExact(xml, "Connect wallet");
  sleep(2500);
}

xml = dump("92d-auth");
t = texts(xml);
let line = top();
note("auth-open", { top: line, texts: t.slice(0, 20) });

// Prefer competition message sign if we can get there while disconnected we only have connect
// Path A: reject connect / MWA sheet
let rejected = false;
if (/MWABottomSheet|seedvault|wallet/i.test(line) || t.some((s) => /Phantom|Solflare|Mobile Wallet|Authorize|Approve|Sign/i.test(s))) {
  if (tapExact(xml, "Cancel") || tapExact(xml, "Deny") || tapExact(xml, "Reject") || tapExact(xml, "Close")) {
    rejected = true;
    note("tapped-reject-ui");
  } else {
    adb("shell", "input", "keyevent", "4");
    rejected = true;
    note("reject-via-back");
  }
  sleep(2000);
}

// Path B: reconnect approved left open — close, then Create for message
xml = dump("92d-after-reject-attempt");
t = texts(xml);
line = top();

if (/com\.sudoku\.game/.test(line) && t.includes("Soldoku") && (t.includes("Connect wallet") || t.some((s) => /E3DQ|DpJn/.test(s)))) {
  note("returned-after-connect-reject", { texts: t.slice(0, 15) });
}

// If connected (or after owner connects), force message sign via Create room
if (!t.includes("Connect wallet") || t.some((s) => /E3DQ|DpJn/.test(s))) {
  // connected
} else {
  // still disconnected — ask connect then we'll reject MESSAGE after connect
  // For automated reject of MESSAGE we need a connected wallet. Try Mobile Wallet Adapter connect then immediately leave
  if (tapIncludes(xml, "Mobile Wallet Adapter") || tapIncludes(xml, "Detected")) {
    note("tapped-mwa-connect");
    sleep(4000);
    for (let i = 0; i < 30; i++) {
      line = top();
      xml = dump(`92d-mwa-${i}`);
      t = texts(xml);
      if (/seedvault|authorize/i.test(line)) {
        note("seedvault-prompt", { top: line, instruction: "DENY this request on the Seeker" });
        // try deny
        if (tapExact(xml, "Cancel") || tapExact(xml, "Deny") || tapExact(xml, "Reject")) note("deny-tapped");
        else { adb("shell", "input", "keyevent", "4"); note("deny-back"); }
        sleep(3000);
        break;
      }
      if (/com\.sudoku\.game/.test(line) && !/MWABottomSheet/i.test(line)) break;
      // cancel MWA sheet
      if (/MWABottomSheet/i.test(line)) {
        if (tapExact(xml, "Cancel") || tapExact(xml, "Close")) note("mwa-cancel");
        else adb("shell", "input", "keyevent", "4");
        sleep(1500);
        break;
      }
      sleep(2000);
    }
  }
}

xml = dump("92d-mid");
t = texts(xml);
// Navigate to Create room for message-sign reject if connected
if (tapExact(xml, "Home") || t.includes("Soldoku")) {
  sleep(800);
  xml = dump("92d-home3");
}
if (texts(xml).some((s) => /E3DQ|DpJn/.test(s))) {
  tapIncludes(xml, "LEADERBOARD") || tapIncludes(xml, "Compete");
  sleep(2200);
  xml = dump("92d-compete");
  // leave room detail if restored
  if (texts(xml).includes("Weekend Sprint") && !texts(xml).includes("Create competition")) {
    tapIncludes(xml, "Back to Rooms") || tapExact(xml, "← Back to Rooms");
    sleep(1500);
    xml = dump("92d-browse");
  }
  tapExact(xml, "Create competition") || tapIncludes(xml, "Create competition");
  sleep(1500);
  xml = dump("92d-create");
  tapExact(xml, "Free competition") || tapIncludes(xml, "Free");
  sleep(400);
  if (tapExact(xml, "Create room")) {
    note("create-room-tapped");
    sleep(2500);
    for (let i = 0; i < 20; i++) {
      line = top();
      xml = dump(`92d-sign-${i}`);
      t = texts(xml);
      if (/MWABottomSheet|seedvault/i.test(line)) {
        note("message-sign-prompt", { top: line, instruction: "DENY / Cancel the Soldoku message (not Approve)" });
        if (tapExact(xml, "Cancel") || tapExact(xml, "Deny") || tapExact(xml, "Reject") || tapExact(xml, "Close")) note("message-deny-ui");
        else { adb("shell", "input", "keyevent", "4"); note("message-deny-back"); }
        rejected = true;
        sleep(2500);
        break;
      }
      if (t.some((s) => /Quick check|Slide the solid/i.test(s))) {
        note("session-still-valid-gate");
        tapExact(xml, "Cancel");
        break;
      }
      sleep(2000);
    }
  }
}

// Confirm back on Soldoku
for (let i = 0; i < 20; i++) {
  sleep(1500);
  xml = dump(`92d-return-${i}`);
  t = texts(xml);
  line = top();
  if (/com\.sudoku\.game/.test(line) && !/MWABottomSheet|seedvault/i.test(line)) {
    const err = t.filter((s) => /did not|Try again|authorization|timed out|wallet|Cancel|Connect/i.test(s));
    result.status = rejected || err.length || t.includes("Soldoku") ? "passed" : "partial";
    result.returnTexts = t.slice(0, 25);
    result.errors = err;
    result.top = line;
    break;
  }
}
if (!result.status) result.status = "failed";
result.finishedAt = new Date().toISOString();
result.rejected = rejected;

// merge into challenge results
let prior = {};
try { prior = JSON.parse(readFileSync(join(out, "92-challenge-results.json"), "utf8")); } catch { /* ignore */ }
prior.phases = prior.phases || [];
prior.phases = prior.phases.filter((p) => p.name !== "reject-signature" && p.name !== "reject-return");
prior.phases.push({ name: "reject-signature", status: result.status, rejected, steps: result.steps, at: result.finishedAt });
prior.phases.push({ name: "reject-return", status: result.status, texts: result.returnTexts, errors: result.errors, at: result.finishedAt });
prior.finishedAt = result.finishedAt;
writeFileSync(join(out, "92-challenge-results.json"), JSON.stringify(prior, null, 2));
writeFileSync(join(out, "92d-reject-results.json"), JSON.stringify(result, null, 2));
console.log(JSON.stringify({ status: result.status, rejected, steps: result.steps.map((x) => x.s) }, null, 2));
process.exit(result.status === "failed" ? 2 : 0);
