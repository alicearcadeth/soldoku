import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";

const serial = process.env.SEEKER_SERIAL || "SM02E4072803429";
const out = "docs/evidence/2026-10-09-seeker";
mkdirSync(out, { recursive: true });
const adb = (...args) => execFileSync("adb", ["-s", serial, ...args], { encoding: "utf8" });
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
function tapFirst(xml, needle) {
  const re = /text="([^"]*)"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/g;
  let m; let best = null;
  while ((m = re.exec(xml))) {
    if (!m[1].includes(needle)) continue;
    const cy = ((+m[3] + +m[5]) / 2) | 0;
    if (cy > 200 && cy < 2400) { best = m; break; }
  }
  if (!best) return false;
  const cx = ((+best[2] + +best[4]) / 2) | 0;
  const cy = ((+best[3] + +best[5]) / 2) | 0;
  adb("shell", "input", "tap", String(cx), String(cy));
  console.log(JSON.stringify({ tap: needle, cx, cy }));
  return true;
}

adb("shell", "am", "force-stop", "com.sudoku.game");
sleep(1000);
adb("shell", "am", "start", "-n", "com.sudoku.game/.MainActivity");
sleep(4000);
let xml = dump("90-cold");
if (texts(xml).includes("Paused") || texts(xml).includes("Pause")) {
  tapFirst(xml, "Home"); sleep(1500); xml = dump("90-home");
}
if (!texts(xml).includes("Soldoku")) {
  tapFirst(xml, "Home"); sleep(1500); xml = dump("90-home2");
}
tapFirst(xml, "Compete") || tapFirst(xml, "LEADERBOARD");
sleep(2500);
xml = dump("90-compete");
// Focus room code field roughly then type
adb("shell", "input", "tap", "500", "780");
sleep(400);
adb("shell", "input", "text", "61702E42");
sleep(500);
tapFirst(xml, "Find room");
sleep(2800);
xml = dump("90-room");
console.log(JSON.stringify({ roomTexts: texts(xml).slice(0, 35) }));
if (!tapFirst(xml, "Join room")) {
  console.log(JSON.stringify({ error: "Join room not found or disabled" }));
  process.exit(2);
}
sleep(3000);
const focus = adb("shell", "dumpsys", "activity", "activities");
const top = (focus.match(/topResumedActivity=.*/g) || []).slice(0, 3);
xml = dump("90-awaiting-owner-sign");
const payload = {
  top,
  texts: texts(xml).slice(0, 40),
  walletSheet: /MWABottomSheet|com\.solanamobile\.wallet/i.test(focus),
  instruction: "On the Seeker now: if a Seed Vault / Solana Mobile Wallet prompt asks to sign a MESSAGE for Soldoku, Approve it (Devnet identity only — not a deposit). Stay on that prompt until it completes, then return to Soldoku.",
};
writeFileSync(join(out, "90-awaiting-owner.json"), JSON.stringify(payload, null, 2));
console.log(JSON.stringify(payload, null, 2));
process.exit(0);
