/** Open MWA connect and reject at wallet/Seed Vault; confirm Soldoku recovers. */
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
function tapIncludes(xml, needle) {
  const re = /text="([^"]*)"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/g; let best = null; let m;
  while ((m = re.exec(xml))) {
    if (!m[1].includes(needle)) continue;
    const n = { text: m[1], cx: ((+m[2] + +m[4]) / 2) | 0, cy: ((+m[3] + +m[5]) / 2) | 0 };
    if (m[1] === needle) { adb("shell", "input", "tap", String(n.cx), String(n.cy)); return true; }
    if (!best || m[1].length < best.text.length) best = n;
  }
  if (!best) return false;
  adb("shell", "input", "tap", String(best.cx), String(best.cy));
  console.log(JSON.stringify({ tap: needle, text: best.text }));
  return true;
}

const log = [];
const say = (o) => { log.push(o); console.log(JSON.stringify(o)); };

adb("shell", "am", "start", "-n", "com.sudoku.game/.MainActivity");
sleep(1200);
let xml = dump("92e-home");
if (!texts(xml).includes("Connect wallet")) {
  say({ status: "skipped", reason: "wallet already connected — reconnect not available without disconnect" });
  writeFileSync(join(out, "92e-reject-mwa.json"), JSON.stringify({ status: "skipped", log }, null, 2));
  process.exit(0);
}
tapExact(xml, "Connect wallet");
sleep(1500);
xml = dump("92e-sheet");
if (!tapIncludes(xml, "Mobile Wallet Adapter") && !tapIncludes(xml, "Detected")) {
  say({ status: "failed", reason: "no MWA row" });
  process.exit(2);
}
say({ step: "mwa-tapped" });

let rejectedAt = null;
for (let i = 0; i < 40; i++) {
  sleep(2500);
  const line = top();
  xml = dump(`92e-poll-${i}`);
  const t = texts(xml);
  say({ i, top: line, sample: t.slice(0, 12) });
  if (/seedvault|authorize/i.test(line)) {
    rejectedAt = "seedvault";
    say({ step: "needs-owner-deny", instruction: "DENY / Cancel the Seed Vault authorize (do not Approve)." });
    if (tapExact(xml, "Cancel") || tapExact(xml, "Deny") || tapExact(xml, "Reject")) say({ step: "deny-ui" });
    else { adb("shell", "input", "keyevent", "4"); say({ step: "deny-back" }); }
    sleep(3000);
    break;
  }
  if (/MWABottomSheet/i.test(line)) {
    // keep waiting for seed vault; if stuck, cancel sheet
    if (i >= 8) {
      rejectedAt = "mwa-sheet";
      if (tapExact(xml, "Cancel") || tapExact(xml, "Close")) say({ step: "mwa-cancel" });
      else { adb("shell", "input", "keyevent", "4"); say({ step: "mwa-back" }); }
      sleep(2000);
      break;
    }
  }
  if (/com\.sudoku\.game/.test(line) && !/MWABottomSheet|seedvault/i.test(line) && i > 2) {
    // returned without seed vault
    break;
  }
}

for (let i = 0; i < 20; i++) {
  sleep(1500);
  xml = dump(`92e-return-${i}`);
  const t = texts(xml);
  const line = top();
  if (/com\.sudoku\.game/.test(line) && !/MWABottomSheet|seedvault/i.test(line)) {
    const status = t.includes("Soldoku") || t.includes("Connect wallet") ? "passed" : "partial";
    const payload = { status, rejectedAt, returnTexts: t.slice(0, 20), log, at: new Date().toISOString() };
    writeFileSync(join(out, "92e-reject-mwa.json"), JSON.stringify(payload, null, 2));
    // merge
    let prior = {};
    try { prior = JSON.parse(readFileSync(join(out, "92-challenge-results.json"), "utf8")); } catch { /* */ }
    prior.phases = (prior.phases || []).filter((p) => !["reject-signature", "reject-return"].includes(p.name));
    prior.phases.push({ name: "reject-signature", status, rejectedAt, note: rejectedAt === "seedvault" ? "Seed Vault deny/back" : rejectedAt === "mwa-sheet" ? "MWA cancel/back" : "connect sheet / return", at: payload.at });
    prior.phases.push({ name: "reject-return", status, texts: t.slice(0, 20), at: payload.at });
    prior.finishedAt = payload.at;
    writeFileSync(join(out, "92-challenge-results.json"), JSON.stringify(prior, null, 2));
    console.log(JSON.stringify({ status, rejectedAt }, null, 2));
    process.exit(status === "failed" ? 2 : 0);
  }
}
writeFileSync(join(out, "92e-reject-mwa.json"), JSON.stringify({ status: "failed", log }, null, 2));
process.exit(2);
