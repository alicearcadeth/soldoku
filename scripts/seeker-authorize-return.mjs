/**
 * Free-room message authorize + return on live soldoku.com (d9a182a).
 * Phase A: connect wallet via MWA/Seed Vault (owner).
 * Phase B: Join free room → message sign (owner) → Start challenge.
 * No storage clear. No PIN automation. No screencap of secure activities.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";

const serial = process.env.SEEKER_SERIAL || "SM02E4072803429";
const roomCode = process.env.SEEKER_ROOM || "CA64EA8C";
const out = "docs/evidence/2026-10-09-deploy";
mkdirSync(out, { recursive: true });
const adb = (...a) => execFileSync("adb", ["-s", serial, ...a], { encoding: "utf8", maxBuffer: 12e6 });
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

const results = {
  name: "message-authorize-return-d9a182a",
  roomCode,
  startedAt: new Date().toISOString(),
  hostedRelease: "d9a182a90f00487c5a08506f0db3a5987207b9fe",
  phases: [],
};
const record = (name, status, detail = {}) => {
  const row = { name, status, ...detail, at: new Date().toISOString() };
  results.phases.push(row);
  writeFileSync(join(out, "authorize-return.json"), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(row));
};
function top() {
  return (adb("shell", "dumpsys", "activity", "activities").match(/topResumedActivity=.*/g) || [])[0] || "";
}
function dump(n) {
  const line = top();
  const secure = /seedvault|keyguard|MWABottomSheet/i.test(line);
  let lastErr;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      adb("shell", "uiautomator", "dump", "/sdcard/uidump.xml");
      adb("pull", "/sdcard/uidump.xml", join(out, `${n}.xml`));
      lastErr = null;
      break;
    } catch (err) {
      lastErr = err;
      sleep(900);
    }
  }
  if (lastErr) throw lastErr;
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
  return t.some((s) => /E3DQ|DpJn|…[A-Za-z0-9]{3,4}$/.test(s) && !/Connect wallet|Get wallet/i.test(s))
    || (t.includes("Soldoku") && !t.includes("Connect wallet") && t.some((s) => /…/.test(s) && s.length <= 16));
}
function promptOwner(kind) {
  const instruction = {
    name: "OWNER_ACTION_REQUIRED",
    status: "waiting",
    kind,
    instruction: kind === "connect"
      ? "On the Seeker now: approve Solana Mobile Wallet / Seed Vault CONNECT for Soldoku (PIN/biometrics). Not a deposit."
      : "On the Seeker now: approve the MESSAGE signature for Soldoku join identity (PIN/biometrics). Not a deposit. Wait until Soldoku shows Start challenge.",
    top: top(),
    at: new Date().toISOString(),
  };
  results.phases.push(instruction);
  writeFileSync(join(out, "authorize-return.json"), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(instruction, null, 2));
}
async function apiState(code) {
  const r = await fetch("https://soldoku.com/api/competitions/state", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code }),
  });
  return r.json();
}
function waitHandoff(tag, { ms = 180_000, successTexts = [] } = {}) {
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
      promptOwner(tag.includes("join") ? "message" : "connect");
    }
    // Auto-launch MWA from in-app connect sheet
    if (t.some((s) => /Mobile Wallet Adapter/i.test(s)) && /com\.sudoku\.game/.test(line)) {
      tapIncludes(xml, "Mobile Wallet Adapter") || tapIncludes(xml, "Detected");
    }
    const onApp = /com\.sudoku\.game/.test(line) && !/MWABottomSheet|seedvault/i.test(line);
    if (onApp && successTexts.some((s) => t.includes(s) || t.some((x) => x.includes(s)))) {
      return { ok: true, sawNative, sawSeed, xml, t, line };
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
  stake: beforeApi.stake,
  token: beforeApi.token,
  funded: false,
  participantsBeforeApi: beforeApi.participants,
  leaderboardWallets: (beforeApi.leaderboard || []).map((e) => e.name),
  note: "Free room: join is message signature, not a transaction/deposit.",
});

adb("shell", "am", "start", "-W", "-n", "com.sudoku.game/.MainActivity");
sleep(2500);
let xml = dump("40-home");
let t = texts(xml);
if (tapExact(xml, "Close")) { sleep(800); xml = dump("40-home"); t = texts(xml); }
if (!(t.includes("Soldoku") || t.includes("Connect wallet"))) {
  tapExact(xml, "Home"); sleep(1200); xml = dump("40-home"); t = texts(xml);
}
record("home", "passed", { texts: t.slice(0, 14), connected: walletConnected(t) });

// --- Phase A: connect if needed ---
if (!walletConnected(t) && t.includes("Connect wallet")) {
  tapExact(xml, "Connect wallet");
  sleep(1200);
  xml = dump("40-connect-sheet");
  t = texts(xml);
  tapIncludes(xml, "Mobile Wallet Adapter") || tapIncludes(xml, "Detected");
  sleep(2000);
  promptOwner("connect");
  const conn = waitHandoff("connect", { ms: 240_000, successTexts: ["Soldoku"] });
  xml = conn.xml; t = conn.t;
  // After return, may still be on sheet — Close if connected underneath
  if (t.includes("Close") && !walletConnected(t)) {
    // still waiting / cancelled
  }
  if (t.includes("Close")) { tapExact(xml, "Close"); sleep(1000); xml = dump("40-after-connect"); t = texts(xml); }
  if (!walletConnected(t) && t.includes("Home")) {
    tapExact(xml, "Home"); sleep(1200); xml = dump("40-home-recheck"); t = texts(xml);
  }
  record("wallet-connect", walletConnected(t) ? "passed" : conn.sawNative || conn.sawSeed ? "needs-owner" : "blocked", {
    sawNativeMwa: conn.sawNative,
    sawSeedVault: conn.sawSeed,
    connected: walletConnected(t),
    texts: t.slice(0, 16),
    top: top(),
  });
  if (!walletConnected(t)) {
    results.finishedAt = new Date().toISOString();
    results.verdict = { authorizePassed: false, gapClosed: false, reason: "wallet connect not completed by owner" };
    writeFileSync(join(out, "authorize-return.json"), JSON.stringify(results, null, 2));
    console.log(JSON.stringify({ summary: results.phases.map((p) => [p.name, p.status]), verdict: results.verdict }, null, 2));
    process.exit(2);
  }
} else {
  record("wallet-connect", "skipped", { note: "already connected", texts: t.slice(0, 12) });
}

// --- Phase B: open free room detail ---
tapIncludes(xml, "LEADERBOARD") || tapIncludes(xml, "Compete");
sleep(2500);
xml = dump("40-compete");
t = texts(xml);
if (t.includes("← Back to Rooms") || t.includes("Back to Rooms")) {
  tapIncludes(xml, "Back to Rooms"); sleep(1500); xml = dump("40-browse");
}
if (!tapResource(xml, "competition-code")) adb("shell", "input", "tap", "440", "1690");
sleep(400);
for (let i = 0; i < 12; i++) adb("shell", "input", "keyevent", "67");
adb("shell", "input", "text", roomCode);
sleep(600);
xml = dump("40-code");
tapExact(xml, "Find room") || adb("shell", "input", "tap", "1000", "1690");
sleep(2800);
xml = dump("40-room-before");
t = texts(xml);
const onTarget = t.includes(roomCode) && (t.includes("← Back to Rooms") || t.some((s) => /message signature|Join verifies/i.test(s)));
const beforeCountUi = parseCount(t);
record("room-before", onTarget ? "passed" : "blocked", {
  onTargetDetail: onTarget,
  roomCode,
  beforeCountUi,
  joinVisible: t.includes("Join room"),
  startVisible: t.includes("Start challenge"),
  freeCopy: t.some((s) => /message signature|no deposit/i.test(s)),
  texts: t.slice(0, 28),
});
if (!onTarget) process.exit(2);
if (t.includes("Start challenge") && !t.includes("Join room")) {
  record("authorize-return", "skipped", { note: "already joined" });
  process.exit(3);
}
if (!tapExact(xml, "Join room")) {
  record("join-tap", "failed");
  process.exit(2);
}
record("join-tap", "passed", { roomCode });
sleep(2000);
promptOwner("message");
const handoff = waitHandoff("join", { ms: 240_000, successTexts: ["Start challenge"] });
xml = handoff.xml; t = handoff.t;
const afterApi = await apiState(roomCode);
const afterCountUi = parseCount(t);
const countDelta = afterApi.participants - beforeApi.participants;
const startAfter = t.includes("Start challenge");
const verifyAfter = t.some((s) => /Verify your wallet identity/i.test(s));
const authorizeOk = handoff.ok && startAfter && !verifyAfter && (countDelta === 1 || countDelta === 0);
record("authorize-return", authorizeOk ? "passed" : startAfter ? "partial" : handoff.sawNative || handoff.sawSeed ? "needs-owner" : "blocked", {
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
  walletChip: t.find((s) => /…/.test(s) && s.length <= 16) || null,
  texts: t.slice(0, 30),
  top: top(),
});

// Persistence + duplicate
adb("shell", "am", "force-stop", "com.sudoku.game");
sleep(1000);
adb("shell", "am", "start", "-W", "-n", "com.sudoku.game/.MainActivity");
sleep(3000);
xml = dump("40-persist");
t = texts(xml);
if (tapExact(xml, "Home")) { sleep(1000); xml = dump("40-persist-home"); }
tapIncludes(xml, "LEADERBOARD") || tapIncludes(xml, "Compete");
sleep(2000);
xml = dump("40-persist-compete");
if (!tapResource(xml, "competition-code")) adb("shell", "input", "tap", "440", "1690");
sleep(300);
for (let i = 0; i < 12; i++) adb("shell", "input", "keyevent", "67");
adb("shell", "input", "text", roomCode);
sleep(500);
tapExact(dump("40-persist-code"), "Find room") || adb("shell", "input", "tap", "1000", "1690");
sleep(2500);
xml = dump("40-persist-room");
t = texts(xml);
const persistStart = t.includes("Start challenge");
const persistJoin = t.includes("Join room");
record("persistence", persistStart ? "passed" : "partial", { persistStart, persistJoin, persistCount: parseCount(t), texts: t.slice(0, 22) });
if (persistStart && !persistJoin) {
  record("duplicate-protection", "passed", { note: "Join not offered after joined; Start challenge only" });
} else if (persistJoin) {
  const beforeDup = (await apiState(roomCode)).participants;
  tapExact(xml, "Join room");
  sleep(4000);
  xml = dump("40-dup");
  t = texts(xml);
  const afterDup = (await apiState(roomCode)).participants;
  record("duplicate-protection", afterDup === beforeDup && !t.some((s) => /Verify your wallet identity/i.test(s)) ? "passed" : "partial", {
    beforeDup, afterDup, texts: t.slice(0, 18),
  });
} else {
  record("duplicate-protection", "blocked", { texts: t.slice(0, 12) });
}

adb("shell", "input", "keyevent", "3");
sleep(1200);
adb("shell", "am", "start", "-W", "-n", "com.sudoku.game/.MainActivity");
sleep(2000);
xml = dump("40-bg");
t = texts(xml);
record("bg-return", /com\.sudoku\.game/.test(top()) ? "passed" : "partial", { texts: t.slice(0, 14), top: top() });

results.finishedAt = new Date().toISOString();
results.verdict = {
  authorizePassed: results.phases.some((p) => p.name === "authorize-return" && p.status === "passed"),
  gapClosed: results.phases.some((p) => p.name === "authorize-return" && p.status === "passed"),
};
writeFileSync(join(out, "authorize-return.json"), JSON.stringify(results, null, 2));
console.log(JSON.stringify({ summary: results.phases.map((p) => [p.name, p.status]), verdict: results.verdict }, null, 2));
process.exit(results.verdict.authorizePassed ? 0 : 2);
