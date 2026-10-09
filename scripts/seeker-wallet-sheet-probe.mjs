/** Dump Connect wallet sheet texts on Seeker (repro for install-link bug). */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";

const serial = process.env.SEEKER_SERIAL || "SM02E4072803429";
const out = "docs/evidence/2026-10-09-deploy";
mkdirSync(out, { recursive: true });
const adb = (...a) => execFileSync("adb", ["-s", serial, ...a], { encoding: "utf8", maxBuffer: 12e6 });
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
function dump(n) {
  adb("shell", "uiautomator", "dump", "/sdcard/uidump.xml");
  adb("pull", "/sdcard/uidump.xml", join(out, `${n}.xml`));
  try {
    writeFileSync(join(out, `${n}.png`), execFileSync("adb", ["-s", serial, "exec-out", "screencap", "-p"], { maxBuffer: 8e6 }));
  } catch { /* */ }
  return readFileSync(join(out, `${n}.xml`), "utf8");
}
function texts(x) {
  return [...x.matchAll(/text="([^"]+)"/g)].map((m) => m[1]).filter((v, i, a) => a.indexOf(v) === i);
}
function tap(xml, needle) {
  const re = /text="([^"]*)"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/g;
  let m;
  while ((m = re.exec(xml))) {
    if (m[1] !== needle) continue;
    adb("shell", "input", "tap", String(((+m[2] + +m[4]) / 2) | 0), String(((+m[3] + +m[5]) / 2) | 0));
    return true;
  }
  return false;
}

adb("shell", "am", "start", "-W", "-n", "com.sudoku.game/.MainActivity");
sleep(2000);
let xml = dump("80-home");
let t = texts(xml);
if (t.includes("Close")) { tap(xml, "Close"); sleep(600); xml = dump("80-home"); t = texts(xml); }
const chip = t.find((s) => s.includes("…") && s.length <= 16);
if (chip) {
  tap(xml, chip);
  sleep(1000);
  xml = dump("80-sheet-connected");
  t = texts(xml);
  if (t.includes("Disconnect")) {
    tap(xml, "Disconnect");
    sleep(1500);
    xml = dump("80-home-disc");
    t = texts(xml);
  }
}
if (!t.includes("Connect wallet")) {
  tap(xml, "Home");
  sleep(1000);
  xml = dump("80-home2");
  t = texts(xml);
}
if (!tap(xml, "Connect wallet")) {
  console.log(JSON.stringify({ status: "blocked", texts: t.slice(0, 16) }, null, 2));
  process.exit(2);
}
sleep(1200);
xml = dump("80-connect-sheet");
t = texts(xml);
const result = {
  status: "dumped",
  hasMwa: t.some((s) => /Mobile Wallet Adapter/i.test(s)),
  hasPhantomGetWallet: t.some((s) => /Phantom/i.test(s)) && t.some((s) => /Get wallet/i.test(s)),
  hasPhantomDownloadHint: t.some((s) => /phantom\.com\/download|Get wallet/i.test(s)),
  texts: t,
  packages: {
    phantom: true, // confirmed via pm list earlier
    seedVault: true,
  },
  bug: null,
};
result.bug = result.hasMwa && result.hasPhantomGetWallet
  ? "MWA detected but Phantom Get-wallet download link still shown — installed app.phantom ignored"
  : result.hasPhantomGetWallet && !result.hasMwa
    ? "Phantom Get-wallet shown without MWA"
    : "no misleading install link observed";
writeFileSync(join(out, "wallet-sheet-probe.json"), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
process.exit(result.bug.startsWith("MWA") || result.hasPhantomGetWallet ? 1 : 0);
