/**
 * Create one free competition room on Seeker for owner pilot prep.
 * Uses MWA path only. HITL if identity() needs a message. No deposit / no funded.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";

const serial = process.env.SEEKER_SERIAL || "SM02E4072803429";
const out = process.env.SEEKER_OUT || "docs/evidence/2026-10-09-free-pilot";
const roomName = process.env.SEEKER_ROOM_NAME || "Pilot Free Easy";
mkdirSync(out, { recursive: true });
const adb = (...a) => execFileSync("adb", ["-s", serial, ...a], { encoding: "utf8", maxBuffer: 12e6 });
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

const release = await (await fetch("https://soldoku.com/api/release")).json();
const config = await (await fetch("https://soldoku.com/api/competitions/config")).json();
const results = {
  name: "create-free-pilot-room",
  startedAt: new Date().toISOString(),
  hostedRelease: release.commit,
  releaseDirty: release.dirty,
  paused: config.paused,
  cluster: config.cluster,
  roomName,
  phases: [],
};
const save = () => writeFileSync(join(out, "create-room.json"), JSON.stringify(results, null, 2));
const record = (name, status, detail = {}) => {
  const row = { name, status, ...detail, at: new Date().toISOString() };
  results.phases.push(row);
  save();
  console.log(JSON.stringify(row));
};
function top() {
  return (adb("shell", "dumpsys", "activity", "activities").match(/topResumedActivity=.*/g) || [])[0] || "";
}
function dump(n) {
  const line = top();
  const secure = /seedvault|keyguard|MWABottomSheet/i.test(line);
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      adb("shell", "uiautomator", "dump", "/sdcard/uidump.xml");
      adb("pull", "/sdcard/uidump.xml", join(out, `${n}.xml`));
      break;
    } catch {
      sleep(900);
    }
  }
  if (!secure) {
    try {
      writeFileSync(join(out, `${n}.png`), execFileSync("adb", ["-s", serial, "exec-out", "screencap", "-p"], { maxBuffer: 8e6 }));
    } catch {
      /* */
    }
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
  let best = null;
  let m;
  while ((m = re.exec(xml))) {
    if (!m[1].includes(needle) || m[1].length > 220) continue;
    const n = { cx: ((+m[2] + +m[4]) / 2) | 0, cy: ((+m[3] + +m[5]) / 2) | 0, text: m[1] };
    if (m[1] === needle) {
      adb("shell", "input", "tap", String(n.cx), String(n.cy));
      return true;
    }
    if (!best || m[1].length < best.text.length) best = n;
  }
  if (!best) return false;
  adb("shell", "input", "tap", String(best.cx), String(best.cy));
  return true;
}
function swipeUp() {
  adb("shell", "input", "swipe", "540", "1600", "540", "700", "350");
}
async function waitHitl(label, match, ms = 180000) {
  const deadline = Date.now() + ms;
  console.log(`HITL: ${label}`);
  while (Date.now() < deadline) {
    const line = top();
    let xml = "";
    try {
      xml = dump(`hitl-${Date.now()}`);
    } catch {
      sleep(1200);
      continue;
    }
    const t = texts(xml);
    if (match({ line, t, xml })) return { line, t, xml };
    sleep(1500);
  }
  throw new Error(`HITL timeout: ${label}`);
}

if (release.commit !== "d9a182a90f00487c5a08506f0db3a5987207b9fe" || release.dirty) {
  record("preflight-release", "failed", { commit: release.commit, dirty: release.dirty });
  process.exit(2);
}
if (config.paused !== true || config.cluster !== "devnet") {
  record("preflight-pause", "failed", { paused: config.paused, cluster: config.cluster });
  process.exit(2);
}
record("preflight", "passed", { commit: release.commit.slice(0, 7), paused: true, cluster: "devnet" });

adb("shell", "am", "force-stop", "com.sudoku.game");
sleep(800);
adb("shell", "am", "start", "-W", "-n", "com.sudoku.game/.MainActivity");
sleep(4500);
let xml = dump("10-home");
let t = texts(xml);
for (let i = 0; i < 6 && !t.some((s) => /Compete|DEVNET|Classic/i.test(s)); i++) {
  sleep(2000);
  xml = dump(`10-home-wait-${i}`);
  t = texts(xml);
}
record("home", t.some((s) => /DEVNET|NO CASH|Compete/i.test(s)) ? "passed" : "warn", { chip: t.find((s) => /…/.test(s)), texts: t.slice(0, 20) });

if (!tapExact(xml, "Compete") && !tapIncludes(xml, "Compete")) {
  record("compete", "failed", { texts: t.slice(0, 25) });
  process.exit(1);
}
sleep(2500);
xml = dump("20-compete");
t = texts(xml);
if (!tapIncludes(xml, "Create competition") && !tapExact(xml, "Create competition")) {
  record("create-nav", "failed", { texts: t.slice(0, 30) });
  process.exit(1);
}
sleep(2000);
xml = dump("30-create-mode");
t = texts(xml);
if (!tapIncludes(xml, "Free") && !tapExact(xml, "Free competition")) {
  record("free-mode", "failed", { texts: t.slice(0, 30) });
  process.exit(1);
}
sleep(2000);
xml = dump("40-create-form");
t = texts(xml);
// Name field if present — type room name
if (tapIncludes(xml, "Name") || /name/i.test(t.join(" "))) {
  const re = /class="[^"]*EditText[^"]*"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/i;
  const m = re.exec(xml) || /bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"[^>]*class="[^"]*EditText/i.exec(xml);
  if (m) {
    adb("shell", "input", "tap", String(((+m[1] + +m[3]) / 2) | 0), String(((+m[2] + +m[4]) / 2) | 0));
    sleep(400);
    adb("shell", "input", "keyevent", "123"); // move end
    for (let i = 0; i < 24; i++) adb("shell", "input", "keyevent", "67"); // del
    adb("shell", "input", "text", roomName.replace(/ /g, "%s"));
  }
}
swipeUp();
sleep(800);
xml = dump("45-create-scrolled");
if (!tapExact(xml, "Create room") && !tapIncludes(xml, "Create room")) {
  record("create-tap", "failed", { texts: texts(xml).slice(0, 35) });
  process.exit(1);
}

// May need Connect / message / quick-check
try {
  await waitHitl("approve Connect (MWA only), message if asked, then Quick-check / Create", ({ t, line }) => {
    const joined = t.join(" | ");
    if (/Quick-check|Drag|slider|Create room/i.test(joined) && !/seedvault|Sign message|Approve/i.test(line)) {
      // try complete gate
      return /Pilot Free|Room [A-F0-9]{8}|Share|Join room|Start challenge|room code/i.test(joined);
    }
    if (/Room [A-F0-9]{8}|Share this code|Start challenge|Join room/i.test(joined)) return true;
    // auto-tap quick check if visible and not secure
    return false;
  }, 200000);
} catch (err) {
  record("create-hitl", "needs-owner", { error: String(err.message || err), top: top() });
}

// Poll for slider / create completion
for (let i = 0; i < 40; i++) {
  xml = dump(`50-after-${i}`);
  t = texts(xml);
  const code = t.map((s) => s.match(/\b([A-F0-9]{8})\b/)?.[1]).find(Boolean);
  if (code && /Share|Join|Start|Leaderboard|Room/i.test(t.join(" "))) {
    results.roomCode = code;
    record("created", "passed", { roomCode: code, texts: t.slice(0, 25) });
    results.finishedAt = new Date().toISOString();
    save();
    process.exit(0);
  }
  if (tapExact(xml, "Create room") || tapIncludes(xml, "Create room")) {
    sleep(2000);
    continue;
  }
  // Quick-check slider: look for target number hints
  if (/Quick-check|Drag the slider/i.test(t.join(" "))) {
    record("gate", "visible", { texts: t.filter((s) => /\d+|Quick|slider|Drag/i.test(s)).slice(0, 12) });
    // Owner may need to drag — wait
    console.log("HITL: complete Quick-check slider, then Create room");
    sleep(5000);
    continue;
  }
  sleep(2000);
}

record("created", "failed", { texts: t.slice(0, 40), top: top() });
results.finishedAt = new Date().toISOString();
save();
process.exit(1);
