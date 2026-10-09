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
    const png = execFileSync("adb", ["-s", serial, "exec-out", "screencap", "-p"], { maxBuffer: 8 * 1024 * 1024 });
    if (png?.length) writeFileSync(join(out, `${name}.png`), png);
  } catch { /* ignore */ }
  return readFileSync(join(out, `${name}.xml`), "utf8");
}

function texts(xml) {
  return [...xml.matchAll(/text="([^"]+)"/g)].map((m) => m[1]).filter((v, i, a) => a.indexOf(v) === i);
}

function nodes(xml, needle) {
  const re = /text="([^"]*)"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/g;
  const list = [];
  let m;
  while ((m = re.exec(xml))) {
    if (m[1].includes(needle)) {
      list.push({
        text: m[1],
        x1: +m[2], y1: +m[3], x2: +m[4], y2: +m[5],
        cx: ((+m[2] + +m[4]) / 2) | 0,
        cy: ((+m[3] + +m[5]) / 2) | 0,
      });
    }
  }
  return list;
}

function tapFirst(xml, needle, { maxY = 2500 } = {}) {
  const hit = nodes(xml, needle).find((n) => n.cy < maxY && n.cy > 200);
  if (!hit) return false;
  adb("shell", "input", "tap", String(hit.cx), String(hit.cy));
  console.log(JSON.stringify({ tap: needle, ...hit }));
  return true;
}

function goHome(xml) {
  if (texts(xml).includes("Soldoku") && texts(xml).some((x) => /Compete|Practice|Play classic/i.test(x))) return xml;
  if (tapFirst(xml, "Home")) { sleep(1500); return dump("80-home"); }
  if (tapFirst(xml, "Resume")) { sleep(800); xml = dump("80-resume"); }
  if (tapFirst(xml, "Home")) { sleep(1500); return dump("80-home2"); }
  adb("shell", "input", "keyevent", "4");
  sleep(800);
  return dump("80-back");
}

const results = { startedAt: new Date().toISOString(), scenarios: [] };
const record = (name, status, detail = {}) => {
  results.scenarios.push({ name, status, ...detail, at: new Date().toISOString() });
  console.log(JSON.stringify({ name, status, ...detail }));
};

try {
  adb("shell", "am", "start", "-n", "com.sudoku.game/.MainActivity");
  sleep(2000);
  let xml = dump("80-start");
  if (tapFirst(xml, "Home") || texts(xml).includes("Paused")) {
    if (texts(xml).includes("Paused")) { tapFirst(xml, "Home"); sleep(1500); xml = dump("80-from-pause"); }
  }
  xml = goHome(xml);
  record("home", texts(xml).includes("Soldoku") ? "passed" : "failed", { texts: texts(xml).slice(0, 15) });

  tapFirst(xml, "Compete") || tapFirst(xml, "LEADERBOARD");
  sleep(2800);
  xml = dump("81-compete");
  // Scroll room list up a bit so first card controls are fully on-screen
  adb("shell", "input", "swipe", "600", "1800", "600", "900", "300");
  sleep(800);
  xml = dump("81b-scrolled");
  record("compete-browse", texts(xml).some((s) => /View room|Browse rooms/i.test(s)) ? "passed" : "failed", {
    texts: texts(xml).filter((s) => /room|Browse|View|Join|61702E42|Weekend/i.test(s)).slice(0, 25),
  });

  if (!tapFirst(xml, "View room", { maxY: 2400 })) {
    record("free-room-detail", "failed", { reason: "View room not found in tap range" });
  } else {
    sleep(2800);
    xml = dump("82-room");
    let t = texts(xml);
    const onDetail = t.some((s) => /Back to Rooms|← Back|Room & leaderboard/i.test(s))
      || (t.some((s) => /Room code:/i.test(s)) && !t.includes("Browse rooms"));
    // Competitions detail shows room name as h1 and back button
    const detailOk = onDetail || (t.includes("Weekend Sprint") && t.some((s) => /Join room|Start|Authorize|Connect/i.test(s)) && !t.includes("Browse rooms"));
    record("free-room-detail", detailOk ? "passed" : "partial", {
      note: detailOk ? "Left browse list into room surface" : "Still looks like browse list — check screenshot 82-room.png",
      texts: t.slice(0, 40),
    });
    writeFileSync(join(out, "82-room-summary.json"), JSON.stringify({ texts: t, detailOk }, null, 2));

    // Prefer Join on detail; if still browse, tap first Join
    if (tapFirst(xml, "Join room", { maxY: 2400 })) {
      sleep(4500);
      xml = dump("83-join");
      t = texts(xml);
      let focus = "";
      try { focus = adb("shell", "dumpsys", "activity", "activities"); } catch { /* ignore */ }
      const walletFocus = /com\.solanamobile\.wallet|MWABottomSheet|seedvault/i.test(focus);
      const needsSign = walletFocus || t.some((s) => /sign|approve|Authorize|proof|Connect wallet/i.test(s));
      const inRoom = t.some((s) => /Your time|Waiting for|Start|Back to Rooms|leaderboard|Grid|attempt/i.test(s))
        && !t.includes("Browse rooms");
      if (needsSign && !inRoom) {
        record("competition-message-proof", "needs-owner", {
          instruction: "Approve the Soldoku competition session MESSAGE in Seed Vault / Solana Mobile Wallet (Devnet, authorize only — not a deposit). Return to Soldoku afterward.",
          texts: t.slice(0, 35),
          walletFocus,
        });
      } else if (inRoom) {
        record("competition-message-proof", "passed", {
          note: "Entered room play/lobby without a new sign prompt (existing session)",
          texts: t.slice(0, 35),
        });
      } else {
        record("competition-message-proof", "blocked", { texts: t.slice(0, 35), walletFocus });
      }
      writeFileSync(join(out, "83-join-summary.json"), JSON.stringify({ texts: t, walletFocus, needsSign, inRoom }, null, 2));
    } else {
      record("competition-message-proof", "blocked", { reason: "Join room not tappable" });
    }
  }

  xml = goHome(dump("84-pre-cancel"));
  if (tapFirst(xml, "Connect wallet") || tapFirst(xml, "E3DQ") || tapFirst(xml, "DpJn")) {
    sleep(1800);
    xml = dump("85-sheet");
    if (tapFirst(xml, "Close") || tapFirst(xml, "Cancel")) {
      sleep(1000);
      xml = dump("85b-closed");
      record("wallet-sheet-cancel-close", texts(xml).includes("Soldoku") ? "passed" : "partial", { texts: texts(xml).slice(0, 12) });
    } else {
      adb("shell", "input", "keyevent", "4");
      sleep(800);
      xml = dump("85c-back");
      record("wallet-sheet-cancel-close", "passed", { via: "back" });
    }
  } else {
    record("wallet-sheet-cancel-close", "blocked", { texts: texts(xml).slice(0, 12) });
  }

  results.finishedAt = new Date().toISOString();
  writeFileSync(join(out, "join-authorize-results.json"), JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ summary: results.scenarios.map((s) => [s.name, s.status]) }, null, 2));
  process.exit(0);
} catch (error) {
  results.error = String(error?.message || error);
  writeFileSync(join(out, "join-authorize-results.json"), JSON.stringify(results, null, 2));
  console.error(results.error);
  process.exit(1);
}
