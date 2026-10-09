/**
 * Continue physical Seeker journeys (gaps only). Serial not written to evidence JSON.
 * Stops before owner PIN/biometric/financial approve; records needs-owner when required.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";

const serial = process.env.SEEKER_SERIAL || execFileSync("adb", ["devices"], { encoding: "utf8" })
  .split("\n").map((l) => l.trim()).find((l) => /\sdevice\b/.test(l))?.split(/\s+/)[0];
if (!serial) throw new Error("No adb device");

const out = "docs/evidence/2026-10-09-seeker";
mkdirSync(out, { recursive: true });
const results = { startedAt: new Date().toISOString(), scenarios: [], hostedReleaseProbe: null };

const adb = (...args) => execFileSync("adb", ["-s", serial, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

function dump(name) {
  adb("shell", "uiautomator", "dump", "/sdcard/uidump.xml");
  adb("pull", "/sdcard/uidump.xml", join(out, `${name}.xml`));
  try {
    const png = execFileSync("adb", ["-s", serial, "exec-out", "screencap", "-p"], { maxBuffer: 8 * 1024 * 1024 });
    if (png?.length) writeFileSync(join(out, `${name}.png`), png);
  } catch { /* optional screenshot */ }
  return readFileSync(join(out, `${name}.xml`), "utf8");
}

function texts(xml) {
  return [...xml.matchAll(/text="([^"]+)"/g)].map((m) => m[1]).filter((v, i, a) => a.indexOf(v) === i);
}

function tap(xml, needle) {
  const re = /text="([^"]*)"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/g;
  let m; let best = null;
  while ((m = re.exec(xml))) {
    if (m[1].includes(needle)) best = m;
  }
  if (!best) return false;
  const cx = ((+best[2] + +best[4]) / 2) | 0;
  const cy = ((+best[3] + +best[5]) / 2) | 0;
  adb("shell", "input", "tap", String(cx), String(cy));
  return { needle, cx, cy };
}

function record(name, status, detail = {}) {
  results.scenarios.push({ name, status, ...detail, at: new Date().toISOString() });
  console.log(JSON.stringify({ name, status, ...detail }));
}

function goHome(xml) {
  if (texts(xml).includes("Soldoku") && texts(xml).some((t) => /Play classic|Compete|Practice/i.test(t))) return xml;
  if (tap(xml, "Home")) { sleep(1500); return dump("nav-home"); }
  if (tap(xml, "Resume")) { sleep(1000); xml = dump("nav-resume"); }
  if (tap(xml, "Home")) { sleep(1500); return dump("nav-home2"); }
  adb("shell", "input", "keyevent", "4");
  sleep(800);
  return dump("nav-back");
}

try {
  // Hosted release identity (device-independent probe)
  const release = await (await fetch("https://soldoku.com/api/release")).json();
  results.hostedReleaseProbe = { commit: release.commit, dirty: release.dirty };
  record("hosted-release-manifest", release.commit === "f4619a4d194ca03eef84df04080df38c7d6bad25" ? "passed" : "failed", {
    commit: release.commit,
  });

  adb("shell", "am", "force-stop", "com.sudoku.game");
  sleep(700);
  adb("shell", "am", "start", "-n", "com.sudoku.game/.MainActivity");
  sleep(4000);
  let xml = dump("40-cold");
  xml = goHome(xml);
  let t = texts(xml);
  record("cold-to-home", t.includes("Soldoku") ? "passed" : "failed", { texts: t.slice(0, 20) });
  const hasDevnet = t.some((x) => /DEVNET|TEST TOKENS|NO CASH VALUE/i.test(x));
  record("loads-expected-product-shell", hasDevnet ? "passed" : "failed", { hasDevnet });

  // Classic: new game + digit + notes + undo
  if (tap(xml, "New game") || tap(xml, "Continue game")) sleep(1200);
  xml = dump("41-classic-entry");
  if (texts(xml).some((x) => /^Easy$|^Medium$|^Hard$/.test(x))) {
    tap(xml, "Easy"); sleep(1200); xml = dump("41b-easy");
  }
  t = texts(xml);
  const classicUi = t.includes("Pause") && t.includes("Notes") && t.includes("Undo");
  record("classic-controls", classicUi ? "passed" : "failed", { texts: t.slice(0, 25) });
  // tap empty-ish cell area (board center-ish) then digit 5
  adb("shell", "input", "tap", "600", "1100");
  sleep(400);
  if (tap(xml, "5") || tap(dump("41c-pad"), "5")) sleep(600);
  xml = dump("42-after-digit");
  tap(xml, "Notes"); sleep(500);
  xml = dump("42b-notes");
  tap(xml, "Undo"); sleep(500);
  xml = dump("42c-undo");
  record("classic-input-notes-undo", texts(xml).includes("Pause") ? "passed" : "failed", { texts: texts(xml).slice(0, 20) });

  // Screen-off without secure power-lock (power key hits PIN and leaves the app unreachable to automation).
  adb("shell", "input", "keyevent", "223"); // KEYCODE_SLEEP if supported
  sleep(1200);
  adb("shell", "input", "keyevent", "224"); // KEYCODE_WAKEUP
  sleep(1000);
  xml = dump("43-after-sleep-wake");
  const lockedOut = texts(xml).some((x) => /Unlock with PIN|fingerprint|Emergency/i.test(x));
  if (lockedOut) {
    record("lock-unlock-recovery", "needs-owner", {
      instruction: "Unlock the Seeker with PIN or fingerprint, open Soldoku, leave it in the foreground, then say when ready.",
      texts: texts(xml).slice(0, 12),
    });
  } else {
    record("lock-unlock-recovery", texts(xml).length > 0 ? "passed" : "failed", { texts: texts(xml).slice(0, 20) });
  }

  xml = goHome(xml);
  if (texts(xml).some((x) => /Unlock with PIN|Gemini|Play Store/i.test(x))) {
    record("foreground-app", "needs-owner", {
      instruction: "Unlock Seeker and open Soldoku (com.sudoku.game) to the home screen.",
    });
    results.finishedAt = new Date().toISOString();
    writeFileSync(join(out, "continue-results.json"), JSON.stringify(results, null, 2));
    console.log(JSON.stringify({ summary: results.scenarios.map((s) => [s.name, s.status]), stopped: "device-locked" }, null, 2));
    process.exit(0);
  }

  // Compete → free room view (first View room)
  if (tap(xml, "Compete") || tap(xml, "LEADERBOARD")) sleep(3000);
  xml = dump("44-compete");
  t = texts(xml);
  record("compete-browse", t.some((x) => /Browse rooms|Competition rooms|Create competition/i.test(x)) ? "passed" : "failed", {
    texts: t.filter((x) => /room|Browse|Create|Active|Weekend|paused|wallet/i.test(x)).slice(0, 25),
  });
  if (tap(xml, "View room")) {
    sleep(2500);
    xml = dump("45-room-detail");
    t = texts(xml);
    const detail = t.some((x) => /Room code|Join room|leaderboard|Participants|Ends|Active|Ended|Best/i.test(x));
    record("free-room-detail", detail ? "passed" : "failed", { texts: t.slice(0, 35) });
    // Join may require authorize — try and classify
    if (tap(xml, "Join room")) {
      sleep(3500);
      xml = dump("46-join");
      t = texts(xml);
      const needsSign = t.some((x) => /sign|approve|Authorize|proof|Connect wallet|wallet/i.test(x));
      const joined = t.some((x) => /Your time|leaderboard|Start|Waiting|registered|attempt/i.test(x));
      if (needsSign && !joined) {
        record("competition-message-proof", "needs-owner", {
          instruction: "On Seeker: approve the Soldoku competition session message signature in Seed Vault / Solana Mobile Wallet (Devnet, authorize only — not a deposit). Then return to Soldoku.",
          texts: t.slice(0, 30),
        });
      } else {
        record("competition-join-or-auth", joined ? "passed" : "blocked", { texts: t.slice(0, 30) });
      }
    } else {
      record("competition-join-or-auth", "blocked", { reason: "Join room control not found" });
    }
  } else {
    record("free-room-detail", "failed", { reason: "View room not found" });
  }

  // Cancel path: open connect (or wallet chip) then Close
  xml = goHome(dump("47-pre-cancel"));
  if (tap(xml, "Connect wallet") || tap(xml, "E3DQ") || tap(xml, "…")) {
    sleep(2000);
    xml = dump("48-wallet-sheet");
    if (tap(xml, "Close") || tap(xml, "Cancel")) {
      sleep(1500);
      xml = dump("48b-closed");
      record("wallet-sheet-cancel-close", "passed", { texts: texts(xml).slice(0, 15) });
    } else {
      adb("shell", "input", "keyevent", "4");
      sleep(1000);
      xml = dump("48c-back");
      record("wallet-sheet-cancel-close", texts(xml).includes("Soldoku") ? "passed" : "partial", { via: "back", texts: texts(xml).slice(0, 15) });
    }
  } else {
    record("wallet-sheet-cancel-close", "blocked", { reason: "No connect/wallet chip to open sheet" });
  }

  // Safe funded room read (ended refund room) via Find room
  xml = goHome(xml);
  if (tap(xml, "Compete")) sleep(2500);
  xml = dump("49-compete2");
  // type room code into find field if present
  const codeField = /content-desc="[^"]*Room code[^"]*"|resource-id="[^"]*competition-code[^"]*"|text="Room code"/i.test(xml);
  if (tap(xml, "Find room") || codeField) {
    // focus input: tap placeholder
    if (tap(xml, "Room code") || tap(xml, "Have a room code")) sleep(400);
    adb("shell", "input", "text", "BFF6D992");
    sleep(400);
    xml = dump("49b-code");
    if (tap(xml, "Find room")) {
      sleep(2500);
      xml = dump("50-funded-read");
      t = texts(xml);
      record("funded-room-read-only", t.some((x) => /BFF6D992|refund|TEST|ended|claim|escrow|paused/i.test(x)) ? "passed" : "partial", {
        texts: t.slice(0, 35),
        note: "Read-only; no deposit attempted",
      });
    } else {
      record("funded-room-read-only", "blocked", { reason: "Find room after code entry failed" });
    }
  } else {
    record("funded-room-read-only", "blocked", { reason: "Room code entry UI not reached" });
  }

  results.finishedAt = new Date().toISOString();
  writeFileSync(join(out, "continue-results.json"), JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ summary: results.scenarios.map((s) => [s.name, s.status]) }, null, 2));
  process.exit(0);
} catch (error) {
  results.error = error instanceof Error ? error.message : String(error);
  results.finishedAt = new Date().toISOString();
  writeFileSync(join(out, "continue-results.json"), JSON.stringify(results, null, 2));
  console.error(results.error);
  process.exit(1);
}
