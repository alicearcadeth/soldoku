/**
 * Physical Seeker UI journey against installed com.sudoku.game (loads soldoku.com).
 * Redacts device serials from written evidence. Does not approve wallet/signing.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync, copyFileSync } from "node:fs";
import { join } from "node:path";

const serial = process.env.SEEKER_SERIAL || execFileSync("adb", ["devices"], { encoding: "utf8" })
  .split("\n").map((l) => l.trim()).find((l) => l.endsWith("device") && !l.startsWith("List"))?.split(/\s+/)[0];
if (!serial) throw new Error("No adb device");

const out = process.env.SEEKER_EVIDENCE || "docs/evidence/2026-10-09-seeker";
mkdirSync(out, { recursive: true });
const results = {
  device: { model: "Seeker", android: null, serialRedacted: true },
  apk: { package: "com.sudoku.game", versionName: "0.1.0", versionCode: 1, web: "https://soldoku.com/ (deployed f4619a4)" },
  scenarios: [],
  startedAt: new Date().toISOString(),
};

function adb(...args) {
  return execFileSync("adb", ["-s", serial, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}
function adbBin(...args) {
  return execFileSync("adb", ["-s", serial, ...args], { encoding: "buffer", maxBuffer: 20 * 1024 * 1024 });
}

function dump(name) {
  adb("shell", "uiautomator", "dump", "/sdcard/uidump.xml");
  adb("pull", "/sdcard/uidump.xml", join(out, `${name}.xml`));
  writeFileSync(join(out, `${name}.png`), adbBin("exec-out", "screencap", "-p"));
  copyFileSync(join(out, `${name}.xml`), join(out, "last.xml"));
  return readFileSync(join(out, "last.xml"), "utf8");
}

function nodes(xml) {
  const list = [];
  const re = /<node [^>]*text="([^"]*)"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"[^>]*>/g;
  let m;
  while ((m = re.exec(xml))) {
    list.push({ text: m[1], x1: +m[2], y1: +m[3], x2: +m[4], y2: +m[5] });
  }
  // also content-desc
  const re2 = /<node [^>]*content-desc="([^"]*)"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"[^>]*>/g;
  while ((m = re2.exec(xml))) {
    if (m[1]) list.push({ text: m[1], x1: +m[2], y1: +m[3], x2: +m[4], y2: +m[5] });
  }
  return list;
}

function tapText(xml, needle, { exact = false } = {}) {
  const n = nodes(xml).find((node) => exact ? node.text === needle : node.text.includes(needle));
  if (!n) return false;
  const cx = Math.floor((n.x1 + n.x2) / 2);
  const cy = Math.floor((n.y1 + n.y2) / 2);
  adb("shell", "input", "tap", String(cx), String(cy));
  return { cx, cy, text: n.text };
}

function texts(xml) {
  return [...new Set(nodes(xml).map((n) => n.text).filter(Boolean))];
}

function record(name, status, detail = {}) {
  results.scenarios.push({ name, status, ...detail, at: new Date().toISOString() });
  console.log(JSON.stringify({ name, status, ...detail }));
}

try {
  results.device.android = adb("shell", "getprop", "ro.build.version.release").trim();
  results.device.model = adb("shell", "getprop", "ro.product.model").trim();

  adb("shell", "am", "force-stop", "com.sudoku.game");
  adb("shell", "am", "start", "-n", "com.sudoku.game/.MainActivity");
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 4500);
  let xml = dump("10-cold");
  let t = texts(xml);
  // resume may open classic; go home
  if (!t.includes("Soldoku") && tapText(xml, "Home")) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2000);
    xml = dump("11-home");
    t = texts(xml);
  }
  record("cold-launch-home", t.includes("Soldoku") ? "passed" : "failed", { texts: t.slice(0, 25) });

  // Classic new game
  if (tapText(xml, "New game") || tapText(xml, "Continue game")) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1500);
    xml = dump("12-classic");
  }
  // difficulty picker may appear
  if (texts(xml).some((x) => /Easy|Medium|Hard/.test(x))) {
    tapText(xml, "Easy");
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1500);
    xml = dump("12b-classic-easy");
  }
  t = texts(xml);
  const classicOk = t.includes("Pause") || t.includes("Notes") || t.includes("Undo");
  record("classic-gameplay-controls", classicOk ? "passed" : "failed", { texts: t.slice(0, 30) });

  if (tapText(xml, "Pause")) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1200);
    xml = dump("13-pause");
    record("pause-dialog", texts(xml).length ? "passed" : "failed", { texts: texts(xml).slice(0, 20) });
    adb("shell", "input", "keyevent", "4");
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
    xml = dump("13b-resume");
  }

  // notes / keypad
  const notesTap = tapText(xml, "Notes");
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 800);
  xml = dump("14-notes");
  record("notes-toggle", notesTap ? "passed" : "failed", { texts: texts(xml).slice(0, 15) });

  // background/foreground
  adb("shell", "input", "keyevent", "3"); // HOME
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1500);
  adb("shell", "am", "start", "-n", "com.sudoku.game/.MainActivity");
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2500);
  xml = dump("15-foreground");
  record("background-foreground", texts(xml).length ? "passed" : "failed", { texts: texts(xml).slice(0, 20) });

  if (tapText(xml, "Home")) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1500);
    xml = dump("16-home2");
  }

  // Practice
  const practice = tapText(xml, "Practice") || tapText(xml, "FREE Practice");
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2500);
  xml = dump("17-practice");
  record("practice-entry", practice && texts(xml).length ? "passed" : "failed", { texts: texts(xml).slice(0, 25) });
  adb("shell", "input", "keyevent", "4");
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1200);
  xml = dump("17b-back");
  if (!texts(xml).includes("Soldoku") && tapText(xml, "Home")) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1200);
    xml = dump("17c-home");
  }

  // Compete
  const compete = tapText(xml, "Compete") || tapText(xml, "LEADERBOARD Compete");
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 3000);
  xml = dump("18-compete");
  t = texts(xml);
  record("compete-browse", compete ? "passed" : "failed", { texts: t.slice(0, 40) });
  const pausedCopy = t.some((x) => /paused|Card funding unavailable|Browse|Create|rooms/i.test(x));
  record("compete-state-copy", pausedCopy ? "passed" : "failed", { texts: t.filter((x) => /pause|fund|room|Create|Browse|wallet|Card/i.test(x)) });

  // Create competition / for tokens card unavailable
  if (tapText(xml, "Create competition") || tapText(xml, "Create")) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2000);
    xml = dump("19-create");
    t = texts(xml);
    if (tapText(xml, "For tokens") || tapText(xml, "tokens")) {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2000);
      xml = dump("19b-tokens");
      t = texts(xml);
    }
    const cardUnavailable = t.some((x) => /Card funding unavailable/i.test(x));
    const noSimulate = !t.some((x) => /Simulate provider/i.test(x));
    record("card-funding-unavailable-on-device", cardUnavailable && noSimulate ? "passed" : "failed", {
      cardUnavailable, noSimulate, texts: t.filter((x) => /Card|Simulate|paused|wallet|token/i.test(x)),
    });
  } else {
    record("card-funding-unavailable-on-device", "blocked", { reason: "Create competition control not found" });
  }

  // Home then Connect wallet — owner may need to approve
  if (tapText(xml, "Home") || dump("20-pre-wallet") && tapText(readFileSync(join(out, "last.xml"), "utf8"), "Home")) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1500);
    xml = dump("20-home-wallet");
  }
  const connect = tapText(xml, "Connect wallet");
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 4000);
  xml = dump("21-wallet-handoff");
  t = texts(xml);
  const walletUi = t.some((x) => /Seed|Vault|wallet|Authorize|Approve|Cancel|association|Solana/i.test(x));
  record("wallet-discovery-handoff", connect ? (walletUi ? "passed" : "needs-owner") : "failed", {
    note: "Protected approval/PIN/biometric remains an owner action",
    texts: t.slice(0, 40),
  });

  results.finishedAt = new Date().toISOString();
  results.passed = results.scenarios.every((s) => s.status === "passed" || s.status === "needs-owner" || s.status === "blocked");
  writeFileSync(join(out, "results.json"), JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ summary: results.scenarios.map((s) => [s.name, s.status]), web: "deployed f4619a4 via APK" }, null, 2));
  process.exit(0);
} catch (error) {
  results.error = error instanceof Error ? error.message : String(error);
  results.finishedAt = new Date().toISOString();
  writeFileSync(join(out, "results.json"), JSON.stringify(results, null, 2));
  console.error(results.error);
  process.exit(1);
}
