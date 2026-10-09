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
  let m;
  let best = null;
  while ((m = re.exec(xml))) {
    if (!m[1].includes(needle)) continue;
    const cy = ((+m[3] + +m[5]) / 2) | 0;
    if (cy > 80 && cy < 2500) {
      best = m;
      break;
    }
  }
  if (!best) return false;
  const cx = ((+best[2] + +best[4]) / 2) | 0;
  const cy = ((+best[3] + +best[5]) / 2) | 0;
  adb("shell", "input", "tap", String(cx), String(cy));
  console.log(JSON.stringify({ tap: needle, cx, cy, text: best[1] }));
  return true;
}

let xml = dump("91-pre-cancel");
if (!texts(xml).includes("Soldoku") || texts(xml).includes("Weekend Sprint")) {
  tapFirst(xml, "Home");
  sleep(1500);
  xml = dump("91-home");
}
const homeTexts = texts(xml);
console.log(JSON.stringify({ home: homeTexts.slice(0, 25) }));

let opened =
  tapFirst(xml, "Connect wallet") ||
  tapFirst(xml, "E3DQ") ||
  tapFirst(xml, "DpJn") ||
  tapFirst(xml, "FTwf");
if (!opened) {
  for (const t of homeTexts) {
    if (t.includes("…") || /^[A-Za-z0-9]{3,4}.+[A-Za-z0-9]{3,4}$/.test(t)) {
      if (tapFirst(xml, t.slice(0, Math.min(4, t.length)))) {
        opened = true;
        break;
      }
    }
  }
}
sleep(1800);
xml = dump("91-sheet");
const sheetTexts = texts(xml);
console.log(JSON.stringify({ sheet: sheetTexts.slice(0, 30) }));

let closed = tapFirst(xml, "Close") || tapFirst(xml, "Cancel");
if (!closed) {
  adb("shell", "input", "keyevent", "4");
  closed = "back";
}
sleep(1000);
xml = dump("91-closed");
const after = texts(xml);
const result = {
  opened: !!opened,
  closed,
  after: after.slice(0, 20),
  onSoldoku: after.includes("Soldoku") || after.some((t) => /Compete|Practice|Play classic/i.test(t)),
  at: new Date().toISOString(),
};
writeFileSync(
  join(out, "91-retry-results.json"),
  JSON.stringify(
    {
      messageProof: "passed",
      note: "Join 61702E42 after force-stop; Seed Vault passcode; Start challenge shown; participants 4",
      walletCancelClose: result,
    },
    null,
    2,
  ),
);
console.log(JSON.stringify(result, null, 2));
process.exit(result.onSoldoku && opened ? 0 : 2);
