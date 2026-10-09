/**
 * Fresh message authorize via alternate owner wallet (session still valid on primary).
 * HITL: owner switches Seed Vault account, connects, approves MESSAGE.
 * Creates a free room (identity → message → slider → create) so Join of a new room is not required.
 * No storage clear. No PIN automation. No secure screencaps.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";

const serial = process.env.SEEKER_SERIAL || "SM02E4072803429";
const out = process.env.SEEKER_OUT || "docs/evidence/2026-10-09-deploy";
mkdirSync(out, { recursive: true });
const adb = (...a) => execFileSync("adb", ["-s", serial, ...a], { encoding: "utf8", maxBuffer: 12e6 });
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

const release = await (await fetch("https://soldoku.com/api/release")).json();
const results = {
  name: "alt-wallet-fresh-message-d9a182a",
  startedAt: new Date().toISOString(),
  hostedRelease: release.commit,
  releaseDirty: release.dirty,
  phases: [],
};
const save = () => writeFileSync(join(out, "alt-wallet-fresh.json"), JSON.stringify(results, null, 2));
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
function walletChip(t) {
  return t.find((s) => /…/.test(s) && s.length <= 16 && !/Connect|wallet|Get/i.test(s)) || null;
}
function walletConnected(t) {
  return Boolean(walletChip(t)) && !t.includes("Connect wallet");
}
function prompt(kind, instruction) {
  const row = { name: "OWNER_ACTION_REQUIRED", status: "waiting", kind, instruction, top: top(), at: new Date().toISOString() };
  results.phases.push(row);
  save();
  console.log("\n========== OWNER ACTION ==========");
  console.log(instruction);
  console.log("==================================\n");
  console.log(JSON.stringify(row, null, 2));
}
function waitFor(pred, { tag, ms = 300_000, every = 2000 } = {}) {
  const deadline = Date.now() + ms;
  let sawNative = false;
  let sawSeed = false;
  while (Date.now() < deadline) {
    const line = top();
    const xml = dump(`${tag}-${Date.now()}`);
    const t = texts(xml);
    if (/MWABottomSheet/i.test(line)) sawNative = true;
    if (/seedvault/i.test(line)) sawSeed = true;
    if (t.some((s) => /Mobile Wallet Adapter/i.test(s)) && /com\.sudoku\.game/.test(line)) {
      tapIncludes(xml, "Mobile Wallet Adapter") || tapIncludes(xml, "Detected");
    }
    const hit = pred({ xml, t, line, sawNative, sawSeed });
    if (hit) return { ok: true, sawNative, sawSeed, xml, t, line, ...hit };
    sleep(every);
  }
  const xml = dump(`${tag}-timeout`);
  return { ok: false, sawNative, sawSeed, xml, t: texts(xml), line: top() };
}

adb("shell", "am", "start", "-W", "-n", "com.sudoku.game/.MainActivity");
sleep(2500);
let xml = dump("70-home");
let t = texts(xml);
if (tapExact(xml, "Close")) { sleep(800); xml = dump("70-home"); t = texts(xml); }
if (!(t.includes("Soldoku") || t.includes("Connect wallet"))) {
  tapExact(xml, "Home"); sleep(1200); xml = dump("70-home"); t = texts(xml);
}
const primaryChip = walletChip(t);
record("home-before", "passed", { chip: primaryChip, connected: walletConnected(t), texts: t.slice(0, 14) });

// Disconnect primary if connected
if (walletConnected(t)) {
  // Open wallet chip / connect sheet — chip tap or Settings? Usually tapping truncated wallet opens sheet with Disconnect
  const chip = primaryChip;
  if (chip) tapExact(xml, chip);
  sleep(1200);
  xml = dump("70-wallet-sheet");
  t = texts(xml);
  if (!t.includes("Disconnect")) {
    // try Connect wallet area / Settings path — Compete has Disconnect when connected via WalletSession
    tapExact(xml, "Close");
    sleep(500);
    tapIncludes(dump("70-home2"), "LEADERBOARD") || tapIncludes(dump("70-home2"), "Compete");
    sleep(2000);
    xml = dump("70-compete-disc");
    t = texts(xml);
    if (t.includes("Disconnect")) tapExact(xml, "Disconnect");
    else if (chip) {
      tapExact(xml, "Home"); sleep(1000);
      xml = dump("70-home3");
      tapExact(xml, chip);
      sleep(1200);
      xml = dump("70-sheet2");
      t = texts(xml);
      tapExact(xml, "Disconnect");
    }
  } else {
    tapExact(xml, "Disconnect");
  }
  sleep(2000);
  xml = dump("70-after-disc");
  t = texts(xml);
  if (!t.includes("Connect wallet") && !t.includes("Soldoku")) {
    tapExact(xml, "Home"); sleep(1200); xml = dump("70-home-disc"); t = texts(xml);
  }
  record("disconnect", t.includes("Connect wallet") ? "passed" : "partial", { texts: t.slice(0, 14), top: top() });
}

prompt(
  "switch-wallet",
  "On the Seeker NOW:\n" +
    "1) Open Seed Vault / Solana Mobile Wallet and SWITCH to a DIFFERENT owner account (not E3DQ…).\n" +
    "2) Return to Soldoku.\n" +
    "3) Tap Connect wallet → Mobile Wallet Adapter → approve CONNECT (PIN/biometrics).\n" +
    "Do NOT clear Soldoku storage. Tell the chat when the new wallet chip shows on Home (or just approve — script is watching).",
);

// Wait for Connect wallet then owner connects — or they may already be connecting
const knownPrimaryChip = primaryChip || "E3DQ…DpJn";
const connectWait = waitFor(({ t, line, sawNative, sawSeed }) => {
  const chip = walletChip(t);
  const isAlt = walletConnected(t) && chip && chip !== knownPrimaryChip && !/E3DQ/i.test(chip);
  if (isAlt) return { connectedAlt: true };
  if (t.includes("Connect wallet") && /com\.sudoku\.game/.test(line) && !sawNative && !sawSeed) {
    tapExact(dump("70-tap-connect"), "Connect wallet");
    sleep(1000);
    const sheet = dump("70-connect-sheet");
    tapIncludes(sheet, "Mobile Wallet Adapter") || tapIncludes(sheet, "Detected");
  }
  return null;
}, { tag: "70-connect", ms: 420_000 });

xml = connectWait.xml; t = connectWait.t;
if (t.includes("Close") && walletConnected(t)) {
  tapExact(xml, "Close"); sleep(800); xml = dump("70-home-alt"); t = texts(xml);
}
if (!walletConnected(t)) {
  tapExact(xml, "Home"); sleep(1000); xml = dump("70-home-alt2"); t = texts(xml);
}
const altChip = walletChip(t);
const knownPrimary = primaryChip || "E3DQ…DpJn";
const sameAsPrimary = Boolean(altChip && (altChip === primaryChip || altChip === knownPrimary || /E3DQ/i.test(altChip)));
const altOk = walletConnected(t) && Boolean(altChip) && !sameAsPrimary;
record("alt-connect", altOk ? "passed" : walletConnected(t) ? "same-wallet" : "needs-owner", {
  primaryChip: knownPrimary,
  altChip,
  sameAsPrimary,
  sawNativeMwa: connectWait.sawNative,
  sawSeedVault: connectWait.sawSeed,
  texts: t.slice(0, 16),
});
if (!altOk) {
  results.finishedAt = new Date().toISOString();
  results.verdict = {
    freshMessagePassed: false,
    reason: sameAsPrimary
      ? `Still primary wallet ${altChip || knownPrimary} — switch Seed Vault to a different account, then Connect again`
      : "Alternate wallet connect not completed",
  };
  save();
  console.log(JSON.stringify(results.verdict, null, 2));
  process.exit(2);
}

// Create free room → identity() must request message for new wallet
tapIncludes(xml, "LEADERBOARD") || tapIncludes(xml, "Compete");
sleep(2500);
xml = dump("70-compete");
t = texts(xml);
if (t.includes("← Back to Rooms") || t.includes("Back to Rooms")) {
  tapIncludes(xml, "Back to Rooms"); sleep(1500);
}
tapExact(dump("70-browse"), "Create competition") || tapIncludes(dump("70-browse"), "Create competition");
sleep(2000);
xml = dump("70-create");
tapExact(xml, "Free competition") || tapIncludes(xml, "Free");
sleep(800);
adb("shell", "input", "swipe", "540", "1900", "540", "700", "350");
sleep(800);
xml = dump("70-create-scrolled");
if (!tapExact(xml, "Create room")) {
  record("create-tap", "failed", { texts: texts(xml).slice(0, 20) });
  process.exit(2);
}
record("create-tap", "passed");
prompt(
  "message",
  "On the Seeker NOW: approve the Soldoku MESSAGE signature in Seed Vault / MWA (identity only — NOT a deposit). PIN/biometrics OK. Wait until the Quick-check slider appears.",
);

const msg = waitFor(({ t, line, sawNative, sawSeed }) => {
  const gate = t.some((s) => /Quick check before creating|Verify position|Confirm create room/i.test(s));
  if (gate && (sawNative || sawSeed) && /com\.sudoku\.game/.test(line)) return { gate: true };
  // If gate without wallet sheet — session existed for this wallet (not fresh)
  if (gate && !sawNative && !sawSeed && /com\.sudoku\.game/.test(line)) return { gate: true, cached: true };
  return null;
}, { tag: "70-message", ms: 360_000 });

xml = msg.xml; t = msg.t;
const freshMessage = (msg.sawNative || msg.sawSeed) && !msg.cached;
record("fresh-message-handoff", freshMessage ? "passed" : msg.cached ? "cached-session" : "needs-owner", {
  sawNativeMwa: msg.sawNative,
  sawSeedVault: msg.sawSeed,
  gateVisible: t.some((s) => /Quick check|Verify position/i.test(s)),
  cachedSessionSuspected: Boolean(msg.cached),
  texts: t.slice(0, 20),
  top: top(),
});

if (!t.some((s) => /Quick check|Verify position/i.test(s))) {
  results.finishedAt = new Date().toISOString();
  results.verdict = { freshMessagePassed: false, reason: "gate not reached after message wait" };
  save();
  process.exit(2);
}

// Complete slider — drag range roughly to target; UI is a range input
// Try Verify a few times with center-ish swipes on slider
prompt(
  "slider",
  "On the Seeker NOW: on Quick check, slide the solid dot onto the outlined target, tap Verify position, then Confirm create room.",
);

const created = waitFor(({ t, line }) => {
  const code = t.find((s) => /^[A-F0-9]{8}$/.test(s));
  const room = t.includes("Start challenge") || t.includes("Join room") || (t.includes("Room code:") && code);
  if (room && /com\.sudoku\.game/.test(line)) return { roomCode: code || t.find((s) => /Room code/.test(s)) };
  return null;
}, { tag: "70-create-finish", ms: 300_000 });

xml = created.xml; t = created.t;
const roomCode = t.find((s) => /^[A-F0-9]{8}$/.test(s)) || null;
record("create-room", created.ok && roomCode ? "passed" : "needs-owner", {
  roomCode,
  startVisible: t.includes("Start challenge"),
  texts: t.slice(0, 28),
});

// If creator auto-joined, Start challenge should show — persistence check
if (roomCode && t.includes("Start challenge")) {
  adb("shell", "am", "force-stop", "com.sudoku.game");
  sleep(1000);
  adb("shell", "am", "start", "-W", "-n", "com.sudoku.game/.MainActivity");
  sleep(3000);
  xml = dump("70-persist");
  t = texts(xml);
  tapExact(xml, "Home"); sleep(800);
  tapIncludes(dump("70-persist-home"), "Compete");
  sleep(2000);
  // Find room by code
  const compete = dump("70-persist-compete");
  if (!compete.includes(roomCode)) {
    // code input
    const re = /resource-id="competition-code"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/;
    const m = compete.match(re);
    if (m) adb("shell", "input", "tap", String(((+m[1] + +m[3]) / 2) | 0), String(((+m[2] + +m[4]) / 2) | 0));
    else adb("shell", "input", "tap", "440", "1690");
    sleep(300);
    for (let i = 0; i < 12; i++) adb("shell", "input", "keyevent", "67");
    adb("shell", "input", "text", roomCode);
    tapExact(dump("70-persist-code"), "Find room");
    sleep(2500);
  } else {
    tapIncludes(compete, "View room") || tapIncludes(compete, roomCode);
    sleep(2500);
  }
  xml = dump("70-persist-room");
  t = texts(xml);
  record("persistence", t.includes("Start challenge") || t.includes(roomCode) ? "passed" : "partial", {
    roomCode,
    start: t.includes("Start challenge"),
    join: t.includes("Join room"),
    texts: t.slice(0, 22),
  });
}

results.finishedAt = new Date().toISOString();
results.verdict = {
  freshMessagePassed: freshMessage && Boolean(roomCode),
  altWallet: altChip,
  primaryWallet: primaryChip,
  roomCode,
  seedVaultOrMwaObserved: msg.sawNative || msg.sawSeed,
  note: freshMessage
    ? "Alternate wallet required Seed Vault/MWA message before create gate"
    : "Did not observe fresh message handoff",
};
save();
console.log(JSON.stringify({ summary: results.phases.map((p) => [p.name, p.status]), verdict: results.verdict }, null, 2));
process.exit(results.verdict.freshMessagePassed ? 0 : 2);
