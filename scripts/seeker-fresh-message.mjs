/**
 * Fresh Seed Vault MESSAGE authorize on live d9a182a after session expiry
 * (or with an alternate wallet that has no competitionSession).
 *
 * Preconditions: session-probe readyForFreshMessage, or new wallet connected.
 * Free room only. No storage clear. No PIN automation. No secure screencaps.
 *
 * Env: SEEKER_SERIAL, SEEKER_ROOM (required — must be free, Join visible),
 *      SEEKER_OUT (default docs/evidence/2026-10-10-fresh-message)
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";

const serial = process.env.SEEKER_SERIAL || "SM02E4072803429";
const roomCode = process.env.SEEKER_ROOM;
const out = process.env.SEEKER_OUT || "docs/evidence/2026-10-10-fresh-message";
if (!roomCode || roomCode.length !== 8) {
  console.error("Set SEEKER_ROOM to an 8-char free room code where this wallet is not already a participant.");
  process.exit(2);
}
mkdirSync(out, { recursive: true });
const adb = (...a) => execFileSync("adb", ["-s", serial, ...a], { encoding: "utf8", maxBuffer: 12e6 });
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

const release = await (await fetch("https://soldoku.com/api/release")).json();
const results = {
  name: "fresh-message-authorize-d9a182a",
  roomCode,
  startedAt: new Date().toISOString(),
  hostedRelease: release.commit,
  releaseDirty: release.dirty,
  phases: [],
};
const record = (name, status, detail = {}) => {
  const row = { name, status, ...detail, at: new Date().toISOString() };
  results.phases.push(row);
  writeFileSync(join(out, "fresh-message.json"), JSON.stringify(results, null, 2));
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
    } catch { sleep(900); }
  }
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
function tapResource(xml, id) {
  const re = new RegExp(`resource-id="${id}"[^>]*bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"`);
  const m = xml.match(re);
  if (!m) return false;
  adb("shell", "input", "tap", String(((+m[1] + +m[3]) / 2) | 0), String(((+m[2] + +m[4]) / 2) | 0));
  return true;
}
function parseCount(t) {
  const line = t.find((s) => /(\d+)\s*·\s*open entry/i.test(s));
  const m = line && line.match(/(\d+)\s*·\s*open entry/i);
  return m ? Number(m[1]) : null;
}
function walletConnected(t) {
  return t.some((s) => /…[A-Za-z0-9]{3,4}$/.test(s) && !/Connect wallet|Get wallet/i.test(s));
}
function promptOwner(kind) {
  const instruction = {
    name: "OWNER_ACTION_REQUIRED",
    status: "waiting",
    kind,
    instruction: kind === "reject"
      ? "On the Seeker: REJECT / Cancel the MESSAGE signature (not a deposit). Return to Soldoku."
      : kind === "connect"
        ? "On the Seeker: approve CONNECT for Soldoku (PIN/biometrics). Not a deposit."
        : "On the Seeker: APPROVE the MESSAGE signature for Soldoku identity (PIN/biometrics). Not a deposit. Wait for Start challenge.",
    top: top(),
    at: new Date().toISOString(),
  };
  results.phases.push(instruction);
  writeFileSync(join(out, "fresh-message.json"), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(instruction, null, 2));
}
async function apiState(code) {
  const r = await fetch("https://soldoku.com/api/competitions/state", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code }),
  });
  return r.json();
}
function waitHandoff(tag, { ms = 240_000, successTexts = [], requireSeedOrMwa = false } = {}) {
  const deadline = Date.now() + ms;
  let sawNative = false;
  let sawSeed = false;
  let prompted = false;
  while (Date.now() < deadline) {
    const line = top();
    const xml = dump(`${tag}-${Date.now()}`);
    const t = texts(xml);
    if (/MWABottomSheet/i.test(line)) sawNative = true;
    if (/seedvault/i.test(line)) sawSeed = true;
    if ((sawNative || sawSeed) && !prompted) {
      prompted = true;
      promptOwner(tag.includes("reject") ? "reject" : tag.includes("join") || tag.includes("approve") ? "message" : "connect");
    }
    if (t.some((s) => /Mobile Wallet Adapter/i.test(s)) && /com\.sudoku\.game/.test(line)) {
      tapIncludes(xml, "Mobile Wallet Adapter") || tapIncludes(xml, "Detected");
    }
    const onApp = /com\.sudoku\.game/.test(line) && !/MWABottomSheet|seedvault/i.test(line);
    if (onApp && successTexts.some((s) => t.includes(s) || t.some((x) => x.includes(s)))) {
      if (!requireSeedOrMwa || sawNative || sawSeed) return { ok: true, sawNative, sawSeed, xml, t, line };
    }
    if (onApp && tag.startsWith("connect") && walletConnected(t)) {
      return { ok: true, sawNative, sawSeed, xml, t, line };
    }
    sleep(2000);
  }
  const xml = dump(`${tag}-timeout`);
  return { ok: false, sawNative, sawSeed, xml, t: texts(xml), line: top() };
}

const beforeApi = await apiState(roomCode);
if (beforeApi.token || beforeApi.stake) {
  record("room-safety", "failed", { error: "not free", stake: beforeApi.stake });
  process.exit(2);
}
record("room-safety", "passed", {
  stake: beforeApi.stake ?? 0,
  participantsBeforeApi: beforeApi.participants,
  note: "Free room: message signature only.",
});

adb("shell", "am", "start", "-W", "-n", "com.sudoku.game/.MainActivity");
sleep(2500);
let xml = dump("60-home");
let t = texts(xml);
if (tapExact(xml, "Close")) { sleep(800); xml = dump("60-home"); t = texts(xml); }
if (!(t.includes("Soldoku") || t.includes("Connect wallet"))) {
  tapExact(xml, "Home"); sleep(1200); xml = dump("60-home"); t = texts(xml);
}
record("home", "passed", { texts: t.slice(0, 14), connected: walletConnected(t) });

if (!walletConnected(t) && t.includes("Connect wallet")) {
  tapExact(xml, "Connect wallet");
  sleep(1200);
  xml = dump("60-connect-sheet");
  tapIncludes(xml, "Mobile Wallet Adapter") || tapIncludes(xml, "Detected");
  sleep(2000);
  promptOwner("connect");
  const conn = waitHandoff("connect", { ms: 240_000, successTexts: ["Soldoku"] });
  xml = conn.xml; t = conn.t;
  if (t.includes("Close")) { tapExact(xml, "Close"); sleep(1000); xml = dump("60-after-connect"); t = texts(xml); }
  record("wallet-connect", walletConnected(t) ? "passed" : "needs-owner", {
    sawNativeMwa: conn.sawNative, sawSeedVault: conn.sawSeed, texts: t.slice(0, 16),
  });
  if (!walletConnected(t)) process.exit(2);
} else {
  record("wallet-connect", "skipped", { note: "already connected", texts: t.slice(0, 12) });
}

tapIncludes(xml, "LEADERBOARD") || tapIncludes(xml, "Compete");
sleep(2500);
xml = dump("60-compete");
t = texts(xml);
if (t.includes("← Back to Rooms") || t.includes("Back to Rooms")) {
  tapIncludes(xml, "Back to Rooms"); sleep(1500); xml = dump("60-browse");
}
if (!tapResource(xml, "competition-code")) adb("shell", "input", "tap", "440", "1690");
sleep(400);
for (let i = 0; i < 12; i++) adb("shell", "input", "keyevent", "67");
adb("shell", "input", "text", roomCode);
sleep(600);
xml = dump("60-code");
tapExact(xml, "Find room") || adb("shell", "input", "tap", "1000", "1690");
sleep(2800);
xml = dump("60-room-before");
t = texts(xml);
const onTarget = t.includes(roomCode) && (t.includes("← Back to Rooms") || t.some((s) => /message signature|Join verifies/i.test(s)));
const beforeCountUi = parseCount(t);
record("room-before", onTarget ? "passed" : "blocked", {
  onTargetDetail: onTarget, beforeCountUi,
  joinVisible: t.includes("Join room"),
  startVisible: t.includes("Start challenge"),
  freeCopy: t.some((s) => /message signature|no deposit/i.test(s)),
  texts: t.slice(0, 28),
});
if (!onTarget) process.exit(2);
if (t.includes("Start challenge") && !t.includes("Join room")) {
  record("fresh-message", "blocked", { reason: "already joined this room — pick another free room" });
  process.exit(3);
}
if (!tapExact(xml, "Join room")) {
  record("join-tap", "failed");
  process.exit(2);
}
record("join-tap", "passed");

// Optional reject first (owner cancel)
if (process.env.SEEKER_REJECT_FIRST === "1") {
  promptOwner("reject");
  const reject = waitHandoff("reject-join", { ms: 180_000, successTexts: ["Join room", "Compete", "Soldoku"], requireSeedOrMwa: true });
  const mid = await apiState(roomCode);
  record("message-reject", reject.sawNative || reject.sawSeed ? "observed" : "not-observed", {
    sawNativeMwa: reject.sawNative,
    sawSeedVault: reject.sawSeed,
    participantsUnchanged: mid.participants === beforeApi.participants,
    texts: reject.t.slice(0, 20),
  });
  if (mid.participants !== beforeApi.participants) {
    record("fresh-message", "failed", { reason: "participant changed after reject" });
    process.exit(2);
  }
  xml = dump("60-pre-retry");
  t = texts(xml);
  if (!tapExact(xml, "Join room")) {
    // reopen room
    tapIncludes(xml, "Compete"); sleep(2000);
    if (!tapResource(dump("60-retry-compete"), "competition-code")) adb("shell", "input", "tap", "440", "1690");
    for (let i = 0; i < 12; i++) adb("shell", "input", "keyevent", "67");
    adb("shell", "input", "text", roomCode);
    tapExact(dump("60-retry-code"), "Find room");
    sleep(2500);
    xml = dump("60-retry-room");
    tapExact(xml, "Join room");
  }
}

promptOwner("message");
const handoff = waitHandoff("approve-join", { ms: 300_000, successTexts: ["Start challenge"], requireSeedOrMwa: true });
xml = handoff.xml; t = handoff.t;
const afterApi = await apiState(roomCode);
const afterCountUi = parseCount(t);
const countDelta = afterApi.participants - beforeApi.participants;
const startAfter = t.includes("Start challenge");
const verifyAfter = t.some((s) => /Verify your wallet identity/i.test(s));
const freshOk = handoff.ok && (handoff.sawNative || handoff.sawSeed) && startAfter && !verifyAfter && countDelta === 1;
record("fresh-message", freshOk ? "passed" : handoff.sawNative || handoff.sawSeed ? "needs-owner" : "blocked-no-wallet-sheet", {
  sawNativeMwa: handoff.sawNative,
  sawSeedVault: handoff.sawSeed,
  returned: handoff.ok,
  startAfter,
  joinAfter: t.includes("Join room"),
  verifyAfter,
  beforeCountUi,
  afterCountUi,
  participantsBeforeApi: beforeApi.participants,
  participantsAfterApi: afterApi.participants,
  countDelta,
  texts: t.slice(0, 30),
  top: top(),
  note: "Require Seed Vault or MWA observed so this is not a cached-session join.",
});

// Persistence
adb("shell", "am", "force-stop", "com.sudoku.game");
sleep(1000);
adb("shell", "am", "start", "-W", "-n", "com.sudoku.game/.MainActivity");
sleep(3000);
xml = dump("60-persist");
t = texts(xml);
tapExact(xml, "Home"); sleep(1000);
tapIncludes(dump("60-persist-home"), "LEADERBOARD") || tapIncludes(dump("60-persist-home"), "Compete");
sleep(2000);
xml = dump("60-persist-compete");
if (!tapResource(xml, "competition-code")) adb("shell", "input", "tap", "440", "1690");
for (let i = 0; i < 12; i++) adb("shell", "input", "keyevent", "67");
adb("shell", "input", "text", roomCode);
tapExact(dump("60-persist-code"), "Find room");
sleep(2500);
xml = dump("60-persist-room");
t = texts(xml);
record("persistence", t.includes("Start challenge") && !t.includes("Join room") ? "passed" : "partial", {
  persistStart: t.includes("Start challenge"),
  persistJoin: t.includes("Join room"),
  persistCount: parseCount(t),
});
record("duplicate-protection", t.includes("Start challenge") && !t.includes("Join room") ? "passed" : "partial", {
  note: "Join not offered after success",
});

adb("shell", "input", "keyevent", "3");
sleep(1200);
adb("shell", "am", "start", "-W", "-n", "com.sudoku.game/.MainActivity");
sleep(2000);
record("bg-return", /com\.sudoku\.game/.test(top()) ? "passed" : "partial", { top: top(), texts: texts(dump("60-bg")).slice(0, 14) });

results.finishedAt = new Date().toISOString();
results.verdict = {
  freshMessageAuthorizePassed: freshOk,
  seedVaultOrMwaObserved: handoff.sawNative || handoff.sawSeed,
  existingSessionJoinOnly: !handoff.sawNative && !handoff.sawSeed && startAfter,
};
writeFileSync(join(out, "fresh-message.json"), JSON.stringify(results, null, 2));
console.log(JSON.stringify({ summary: results.phases.map((p) => [p.name, p.status]), verdict: results.verdict }, null, 2));
process.exit(freshOk ? 0 : 2);
