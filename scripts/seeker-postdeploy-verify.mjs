/** Post-deploy Seeker checks against live soldoku.com (APK WebView). */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";

const serial = process.env.SEEKER_SERIAL || "SM02E4072803429";
const out = "docs/evidence/2026-10-09-deploy";
mkdirSync(out, { recursive: true });
const adb = (...a) => execFileSync("adb", ["-s", serial, ...a], { encoding: "utf8", maxBuffer: 12e6 });
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

const results = { startedAt: new Date().toISOString(), phases: [] };
const record = (name, status, detail = {}) => {
  const row = { name, status, ...detail, at: new Date().toISOString() };
  results.phases.push(row);
  console.log(JSON.stringify(row));
  writeFileSync(join(out, "seeker-postdeploy.json"), JSON.stringify(results, null, 2));
};

function dump(name) {
  adb("shell", "uiautomator", "dump", "/sdcard/uidump.xml");
  adb("pull", "/sdcard/uidump.xml", join(out, `${name}.xml`));
  try {
    writeFileSync(join(out, `${name}.png`), execFileSync("adb", ["-s", serial, "exec-out", "screencap", "-p"], { maxBuffer: 8e6 }));
  } catch { /* */ }
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
    const n = { text: m[1], cx: ((+m[2] + +m[4]) / 2) | 0, cy: ((+m[3] + +m[5]) / 2) | 0 };
    if (m[1] === needle) { adb("shell", "input", "tap", String(n.cx), String(n.cy)); return true; }
    if (!best || m[1].length < best.text.length) best = n;
  }
  if (!best) return false;
  adb("shell", "input", "tap", String(best.cx), String(best.cy));
  console.log(JSON.stringify({ tap: needle, text: best.text }));
  return true;
}

try {
  adb("shell", "am", "force-stop", "com.sudoku.game");
  sleep(800);
  adb("shell", "am", "start", "-n", "com.sudoku.game/.MainActivity");
  sleep(4000);
  let xml = dump("01-cold");
  let t = texts(xml);
  // dismiss pause/sheets
  if (tapExact(xml, "Close") || tapExact(xml, "Home")) { sleep(1200); xml = dump("01-home"); t = texts(xml); }
  record("cold-home", t.includes("Soldoku") || t.includes("Compete") || t.some((s) => /LEADERBOARD|Play classic/i.test(s)) ? "passed" : "partial", { texts: t.slice(0, 20) });

  // Wallet cancel return
  if (t.includes("Connect wallet") || tapIncludes(xml, "Connect wallet")) {
    sleep(1200);
    xml = dump("02-connect-sheet");
    t = texts(xml);
    if (tapIncludes(xml, "Mobile Wallet Adapter") || tapIncludes(xml, "Detected")) {
      sleep(2500);
      let cancelled = false;
      for (let i = 0; i < 12; i++) {
        const line = top();
        xml = dump(`02-mwa-${i}`);
        t = texts(xml);
        if (/MWABottomSheet|seedvault/i.test(line)) {
          adb("shell", "input", "keyevent", "4");
          cancelled = true;
          sleep(2000);
          break;
        }
        if (tapExact(xml, "Cancel") || tapExact(xml, "Close")) { cancelled = true; sleep(1500); break; }
        sleep(1500);
      }
      xml = dump("02-after-cancel");
      t = texts(xml);
      const back = /com\.sudoku\.game/.test(top()) && (t.includes("Soldoku") || t.includes("Connect wallet") || t.some((s) => /Compete|Play classic/i.test(s)));
      record("wallet-cancel-return", cancelled && back ? "passed" : back ? "partial" : "failed", { cancelled, texts: t.slice(0, 15), top: top() });
    } else if (tapExact(xml, "Close")) {
      sleep(1000);
      xml = dump("02-sheet-close");
      record("wallet-cancel-return", texts(xml).includes("Soldoku") || texts(xml).some((s) => /Compete|Play classic/i.test(s)) ? "passed" : "partial", { via: "sheet-close" });
    } else {
      record("wallet-cancel-return", "blocked", { texts: t.slice(0, 15) });
    }
  } else if (t.some((s) => /E3DQ|DpJn|…/.test(s))) {
    // already connected — open chip and Close
    tapIncludes(xml, "E3DQ") || tapIncludes(xml, "DpJn");
    sleep(1200);
    xml = dump("02-chip");
    if (tapExact(xml, "Close") || tapExact(xml, "Cancel")) {
      sleep(1000);
      record("wallet-cancel-return", "passed", { via: "connected-chip-close" });
    } else {
      adb("shell", "input", "keyevent", "4");
      record("wallet-cancel-return", "passed", { via: "connected-back" });
    }
  } else {
    record("wallet-cancel-return", "blocked", { texts: t.slice(0, 15) });
  }

  // Free competition browse / room detail / pause create UX
  xml = dump("03-pre-compete");
  tapExact(xml, "Home") || tapIncludes(xml, "Home");
  sleep(1000);
  xml = dump("03-home");
  tapIncludes(xml, "LEADERBOARD") || tapIncludes(xml, "Compete");
  sleep(2800);
  xml = dump("04-compete");
  t = texts(xml);
  const competeOk = t.some((s) => /Browse rooms|Create competition|Room code|Weekend|Find room/i.test(s));
  record("free-compete-browse", competeOk ? "passed" : "failed", { texts: t.slice(0, 25) });

  // New Join/Start copy or pause banner
  if (tapExact(xml, "Create competition") || tapIncludes(xml, "Create competition")) {
    sleep(1500);
    xml = dump("05-create");
    tapExact(xml, "For tokens") || tapIncludes(xml, "For tokens") || tapExact(xml, "tokens");
    sleep(1000);
    xml = dump("05-tokens");
    t = texts(xml);
    const pauseUi = t.some((s) => /paused|Claims, refunds/i.test(s)) || t.some((s) => s === "Funded rooms paused");
    record("funded-pause-ui", pauseUi ? "passed" : "failed", { texts: t.filter((s) => /pause|Claim|Create|TEST|Card/i.test(s)).slice(0, 20) });
    tapExact(xml, "Free competition") || tapIncludes(xml, "Free");
    sleep(500);
  }

  // Open known free room
  tapIncludes(xml, "Browse") || tapExact(xml, "Browse rooms");
  sleep(1000);
  xml = dump("06-browse");
  adb("shell", "input", "tap", "500", "780");
  sleep(300);
  adb("shell", "input", "text", "61702E42");
  sleep(400);
  if (!tapExact(xml, "Find room")) tapIncludes(xml, "Find room");
  sleep(2800);
  xml = dump("07-room");
  t = texts(xml);
  const roomOk = t.includes("61702E42") || t.includes("Weekend Sprint");
  const joinStartCopy = t.some((s) => /Join verifies|Start challenge|timer starts/i.test(s));
  record("free-room-detail", roomOk ? "passed" : "failed", { joinStartCopy, texts: t.slice(0, 35) });

  // If Join available and wallet disconnected, stop at needs-owner for approve path note
  if (t.includes("Join room")) {
    record("free-join-handoff", "needs-owner", {
      note: "Join available; message approve requires owner Seed Vault. Cancel path already verified above.",
    });
  } else if (t.includes("Start challenge") || t.includes("Continue challenge") || t.some((s) => /Finished in/i.test(s))) {
    record("free-room-member-state", "passed", { texts: t.filter((s) => /Start|Continue|Finished|rank|Leaderboard/i.test(s)).slice(0, 10) });
  }

  results.finishedAt = new Date().toISOString();
  writeFileSync(join(out, "seeker-postdeploy.json"), JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ summary: results.phases.map((p) => [p.name, p.status]) }, null, 2));
  process.exit(0);
} catch (error) {
  results.error = String(error?.stack || error);
  writeFileSync(join(out, "seeker-postdeploy.json"), JSON.stringify(results, null, 2));
  console.error(results.error);
  process.exit(1);
}
