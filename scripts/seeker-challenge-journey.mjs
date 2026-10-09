/**
 * Physical Seeker journey for free room 61702E42:
 * Start challenge → enter moves → background/reopen recovery → complete → leaderboard → reject new sign.
 * Feedback loop: each phase writes pass/fail into 92-challenge-results.json.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";

const serial = process.env.SEEKER_SERIAL || "SM02E4072803429";
const ROOM = process.env.SEEKER_ROOM || "61702E42";
const out = "docs/evidence/2026-10-09-seeker";
mkdirSync(out, { recursive: true });

const adb = (...args) => execFileSync("adb", ["-s", serial, ...args], { encoding: "utf8", maxBuffer: 12e6 });
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

const results = { startedAt: new Date().toISOString(), room: ROOM, phases: [] };
function record(name, status, detail = {}) {
  const row = { name, status, ...detail, at: new Date().toISOString() };
  results.phases.push(row);
  console.log(JSON.stringify(row));
  writeFileSync(join(out, "92-challenge-results.json"), JSON.stringify(results, null, 2));
}

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

function contentDescs(xml) {
  return [...xml.matchAll(/content-desc="([^"]+)"/g)].map((m) => m[1]);
}

function topActivity() {
  try {
    const focus = adb("shell", "dumpsys", "activity", "activities");
    return (focus.match(/topResumedActivity=.*/g) || [])[0] || "";
  } catch {
    return "";
  }
}

function tapFirst(xml, needle, { minY = 80, maxY = 2550, exact = false } = {}) {
  const re = /text="([^"]*)"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/g;
  let m;
  let fallback = null;
  while ((m = re.exec(xml))) {
    const text = m[1];
    const hit = exact ? text === needle : text === needle || text.includes(needle);
    if (!hit) continue;
    const cx = ((+m[2] + +m[4]) / 2) | 0;
    const cy = ((+m[3] + +m[5]) / 2) | 0;
    if (cy < minY || cy > maxY) continue;
    const node = { cx, cy, text };
    if (text === needle) {
      adb("shell", "input", "tap", String(cx), String(cy));
      console.log(JSON.stringify({ tap: needle, cx, cy, text }));
      return true;
    }
    if (!fallback) fallback = node;
  }
  if (!fallback || exact) return false;
  adb("shell", "input", "tap", String(fallback.cx), String(fallback.cy));
  console.log(JSON.stringify({ tap: needle, ...fallback, approx: true }));
  return true;
}

function tapBounds(cx, cy) {
  adb("shell", "input", "tap", String(cx), String(cy));
}

/** Parse competition board from aria-labels mirrored as content-desc (or text fallbacks). */
function parseBoard(xml) {
  const cells = Array(81).fill(null);
  const descs = contentDescs(xml);
  for (const d of descs) {
    const m = d.match(/Row (\d+) column (\d+), (?:(given|entered) (\d+)|empty)/i);
    if (!m) continue;
    const idx = (Number(m[1]) - 1) * 9 + (Number(m[2]) - 1);
    if (m[3]) cells[idx] = { value: Number(m[4]), given: m[3] === "given" };
    else cells[idx] = { value: 0, given: false };
  }
  const found = cells.filter(Boolean).length;
  if (found >= 81) return cells;

  // Fallback: gridcell buttons with digit text + empty nearby — weaker, use pad+board bounds later
  return found > 20 ? cells : null;
}

function solveSudoku(board) {
  const grid = board.map((c) => (c ? c.value : 0));
  const rowMask = Array(9).fill(0);
  const colMask = Array(9).fill(0);
  const boxMask = Array(9).fill(0);
  for (let i = 0; i < 81; i++) {
    const v = grid[i];
    if (!v) continue;
    const bit = 1 << v;
    const r = (i / 9) | 0;
    const c = i % 9;
    const b = ((r / 3) | 0) * 3 + ((c / 3) | 0);
    if (rowMask[r] & bit || colMask[c] & bit || boxMask[b] & bit) return null;
    rowMask[r] |= bit;
    colMask[c] |= bit;
    boxMask[b] |= bit;
  }
  function nextEmpty() {
    let best = -1;
    let bestCount = 10;
    for (let i = 0; i < 81; i++) {
      if (grid[i]) continue;
      const r = (i / 9) | 0;
      const c = i % 9;
      const b = ((r / 3) | 0) * 3 + ((c / 3) | 0);
      const used = rowMask[r] | colMask[c] | boxMask[b];
      let count = 0;
      for (let d = 1; d <= 9; d++) if (!(used & (1 << d))) count++;
      if (count === 0) return -2;
      if (count < bestCount) {
        bestCount = count;
        best = i;
        if (count === 1) break;
      }
    }
    return best;
  }
  function dfs() {
    const i = nextEmpty();
    if (i === -1) return true;
    if (i === -2) return false;
    const r = (i / 9) | 0;
    const c = i % 9;
    const b = ((r / 3) | 0) * 3 + ((c / 3) | 0);
    const used = rowMask[r] | colMask[c] | boxMask[b];
    for (let d = 1; d <= 9; d++) {
      const bit = 1 << d;
      if (used & bit) continue;
      grid[i] = d;
      rowMask[r] |= bit;
      colMask[c] |= bit;
      boxMask[b] |= bit;
      if (dfs()) return true;
      grid[i] = 0;
      rowMask[r] ^= bit;
      colMask[c] ^= bit;
      boxMask[b] ^= bit;
    }
    return false;
  }
  return dfs() ? grid : null;
}

function padCenters(xml) {
  const map = {};
  const re = /text="([1-9])"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/g;
  let m;
  while ((m = re.exec(xml))) {
    const cy = ((+m[3] + +m[5]) / 2) | 0;
    // pad sits below board; prefer lower digits cluster
    if (cy < 1400) continue;
    const d = m[1];
    if (!map[d] || cy > map[d].cy) {
      map[d] = { cx: ((+m[2] + +m[4]) / 2) | 0, cy };
    }
  }
  return map;
}

function cellCenters(xml) {
  const centers = Array(81).fill(null);
  const re = /content-desc="(Row (\d+) column (\d+)[^"]*)"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/g;
  let m;
  while ((m = re.exec(xml))) {
    const idx = (Number(m[2]) - 1) * 9 + (Number(m[3]) - 1);
    centers[idx] = {
      cx: ((+m[4] + +m[6]) / 2) | 0,
      cy: ((+m[5] + +m[7]) / 2) | 0,
      desc: m[1],
    };
  }
  return centers;
}

function waitFor(predicate, { dumps = true, name = "wait", timeoutMs = 90000, everyMs = 2000 } = {}) {
  const start = Date.now();
  let n = 0;
  while (Date.now() - start < timeoutMs) {
    const xml = dumps ? dump(`${name}-${n}`) : dump(name);
    const t = texts(xml);
    const top = topActivity();
    if (predicate({ xml, texts: t, top })) return { xml, texts: t, top };
    n++;
    sleep(everyMs);
  }
  return null;
}

function goToRoom() {
  adb("shell", "am", "start", "-n", "com.sudoku.game/.MainActivity");
  sleep(2500);
  let xml = dump("92-start");
  if (texts(xml).includes("Paused") || (!texts(xml).includes("Soldoku") && tapFirst(xml, "Home"))) {
    sleep(1200);
    xml = dump("92-home");
  }
  if (texts(xml).includes("Weekend Sprint") && texts(xml).some((s) => s.includes(ROOM) || s.includes("Start challenge") || s.includes("Continue challenge"))) {
    return xml;
  }
  if (!texts(xml).includes("Compete") && !texts(xml).includes("LEADERBOARD")) {
    tapFirst(xml, "Home");
    sleep(1200);
    xml = dump("92-home2");
  }
  tapFirst(xml, "Compete") || tapFirst(xml, "LEADERBOARD");
  sleep(2500);
  xml = dump("92-compete");
  adb("shell", "input", "tap", "500", "780");
  sleep(300);
  adb("shell", "input", "text", ROOM);
  sleep(400);
  tapFirst(xml, "Find room");
  sleep(2800);
  return dump("92-room");
}

function placeMove(xml, index, digit, centers, pads) {
  const cell = centers[index];
  const pad = pads[String(digit)];
  if (!cell || !pad) return false;
  tapBounds(cell.cx, cell.cy);
  sleep(250);
  tapBounds(pad.cx, pad.cy);
  sleep(900); // server save
  return true;
}

// --- journey ---
try {
  let xml = goToRoom();
  let t = texts(xml);
  record("open-room", t.includes("Weekend Sprint") || t.some((s) => s.includes(ROOM)) ? "passed" : "failed", { texts: t.slice(0, 25) });

  // Start or Continue — exact label only (banner also contains those words)
  if (tapFirst(xml, "Start challenge", { exact: true }) || tapFirst(xml, "Continue challenge", { exact: true })) {
    sleep(2000);
    // May open wallet for identity
    const after = waitFor(
      ({ texts: tt, top }) =>
        tt.some((s) => /^Your time\b/i.test(s) || s === "Room & leaderboard") ||
        /MWABottomSheet|seedvault/i.test(top),
      { name: "92-after-start", timeoutMs: 60000 },
    );
    if (!after) {
      record("start-challenge", "failed", { reason: "no board and no wallet after Start" });
      process.exit(2);
    }
    if (/MWABottomSheet|seedvault/i.test(after.top)) {
      record("start-challenge", "needs-owner", {
        instruction: "Approve identity MESSAGE for Start challenge (Devnet, not a deposit), then stay until Soldoku returns.",
        top: after.top,
      });
      const boardReady = waitFor(
        ({ texts: tt }) => tt.some((s) => /^Your time\b/i.test(s) || s === "Room & leaderboard"),
        { name: "92-post-approve", timeoutMs: 180000, everyMs: 4000 },
      );
      if (!boardReady) {
        record("start-challenge", "blocked", { reason: "wallet did not return to board" });
        process.exit(3);
      }
      xml = boardReady.xml;
      t = boardReady.texts;
    } else {
      xml = after.xml;
      t = after.texts;
    }
  } else if (t.some((s) => /^Your time\b/i.test(s) || s === "Room & leaderboard")) {
    record("start-challenge", "passed", { note: "already on board" });
  } else if (t.some((s) => /Finished in/i.test(s))) {
    record("start-challenge", "skipped", { note: "already finished" });
    // jump to leaderboard + reject phases
  } else {
    record("start-challenge", "failed", { texts: t.slice(0, 30) });
    process.exit(2);
  }

  if (!t.some((s) => /Finished in/i.test(s))) {
    xml = dump("92-board");
    t = texts(xml);
    let board = parseBoard(xml);
    let centers = cellCenters(xml);
    let pads = padCenters(xml);
    if (!board || centers.filter(Boolean).length < 40 || Object.keys(pads).length < 9) {
      record("parse-board", "failed", {
        boardCells: board ? board.filter(Boolean).length : 0,
        centers: centers.filter(Boolean).length,
        pads: Object.keys(pads).length,
        sampleDesc: contentDescs(xml).filter((d) => /Row /.test(d)).slice(0, 5),
        texts: t.slice(0, 20),
      });
      // still try recovery path with whatever we have
    } else {
      record("parse-board", "passed", {
        empties: board.filter((c) => c && !c.value).length,
        givens: board.filter((c) => c && c.given).length,
      });
    }

    const solution = board ? solveSudoku(board) : null;
    if (!solution) {
      record("solve", "failed", { reason: "could not solve from parsed board" });
    } else {
      record("solve", "passed");
    }

    // Enter first few empty moves
    const empties = [];
    if (board && solution) {
      for (let i = 0; i < 81; i++) if (!board[i].value) empties.push(i);
    }
    const probe = empties.slice(0, 3);
    let placed = 0;
    for (const i of probe) {
      xml = dump(`92-move-${placed}`);
      centers = cellCenters(xml);
      pads = padCenters(xml);
      if (placeMove(xml, i, solution[i], centers, pads)) placed++;
      sleep(400);
    }
    xml = dump("92-after-moves");
    const afterMoves = parseBoard(xml);
    const probeOk =
      afterMoves &&
      probe.every((i) => afterMoves[i] && afterMoves[i].value === solution[i]);
    record("enter-moves", probeOk ? "passed" : placed > 0 ? "partial" : "failed", {
      placed,
      probe,
      seen: probe.map((i) => afterMoves?.[i]?.value ?? null),
    });

    // Background / reopen recovery
    const beforeBg = afterMoves ? afterMoves.map((c) => c?.value ?? 0) : null;
    adb("shell", "input", "keyevent", "3"); // HOME
    sleep(2000);
    dump("92-background");
    adb("shell", "am", "start", "-n", "com.sudoku.game/.MainActivity");
    sleep(3000);
    xml = dump("92-reopen");
    t = texts(xml);
    // May land on home, room, or board
    if (!t.some((s) => /^Your time\b/i.test(s) || s === "Room & leaderboard")) {
      if (tapFirst(xml, "Continue challenge", { exact: true }) || tapFirst(xml, "Start challenge", { exact: true })) sleep(2000);
      else {
        xml = goToRoom();
        tapFirst(xml, "Continue challenge", { exact: true }) || tapFirst(xml, "Start challenge", { exact: true });
        sleep(2500);
      }
      xml = dump("92-reopen-board");
      t = texts(xml);
    }
    const recovered = parseBoard(xml);
    const recoveryOk =
      beforeBg &&
      recovered &&
      probe.every((i) => recovered[i]?.value === beforeBg[i]);
    record("bg-reopen-recovery", recoveryOk ? "passed" : t.some((s) => /^Your time\b/i.test(s) || s === "Continue challenge" || /in progress/i.test(s)) ? "partial" : "failed", {
      onBoard: t.some((s) => /Your time/i.test(s)),
      texts: t.slice(0, 20),
      recoveredProbe: probe.map((i) => recovered?.[i]?.value ?? null),
    });

    // Complete remaining empties
    if (solution && recovered) {
      board = recovered;
      const remaining = [];
      for (let i = 0; i < 81; i++) if (!board[i].value) remaining.push(i);
      let done = 0;
      for (const i of remaining) {
        xml = dump(`92-fill-${done}`);
        centers = cellCenters(xml);
        pads = padCenters(xml);
        if (!placeMove(xml, i, solution[i], centers, pads)) {
          // refresh once
          sleep(500);
          xml = dump(`92-fill-retry-${done}`);
          centers = cellCenters(xml);
          pads = padCenters(xml);
          placeMove(xml, i, solution[i], centers, pads);
        }
        done++;
        if (done % 5 === 0) sleep(300);
      }
      sleep(2000);
      xml = dump("92-complete");
      t = texts(xml);
      const finished = t.some((s) => /Finished in|Grid complete|rank/i.test(s));
      if (!finished && tapFirst(xml, "Room & leaderboard")) {
        sleep(1500);
        xml = dump("92-complete-lobby");
        t = texts(xml);
      }
      record("complete-puzzle", t.some((s) => /Finished in|Grid complete/i.test(s)) ? "passed" : "failed", {
        texts: t.filter((s) => /Finished|rank|Leaderboard|Your time|Grid/i.test(s)).slice(0, 15),
        filled: done,
      });
    } else {
      record("complete-puzzle", "blocked", { reason: "no solution or board after recovery" });
    }
  }

  // Leaderboard / result
  xml = dump("92-leaderboard");
  t = texts(xml);
  if (!t.some((s) => /Leaderboard|Finished in/i.test(s))) {
    tapFirst(xml, "Room & leaderboard");
    sleep(1200);
    xml = dump("92-leaderboard2");
    t = texts(xml);
  }
  const lbOk = t.some((s) => /Leaderboard/i.test(s)) && (t.some((s) => /Finished in|rank|#/i.test(s)) || t.some((s) => /0:\d+/i.test(s)));
  record("leaderboard-result", lbOk ? "passed" : "partial", { texts: t.slice(0, 40) });

  // Reject new signature: disconnect → reconnect → Join another free room or re-authorize path
  tapFirst(xml, "Home");
  sleep(1500);
  xml = dump("92-home-pre-reject");
  if (tapFirst(xml, "E3DQ") || tapFirst(xml, "DpJn") || tapFirst(xml, "Connect wallet")) {
    sleep(1200);
    xml = dump("92-wallet-sheet");
    if (tapFirst(xml, "Disconnect")) {
      sleep(1500);
      xml = dump("92-disconnected");
    } else {
      tapFirst(xml, "Close");
      sleep(800);
    }
  }
  xml = dump("92-home-disconnected");
  // Reconnect
  if (tapFirst(xml, "Connect wallet")) {
    sleep(2500);
    let top = topActivity();
    if (/MWABottomSheet|seedvault|wallet/i.test(top)) {
      // Cancel connect sheet if possible
      xml = dump("92-reconnect-sheet");
      if (tapFirst(xml, "Cancel") || tapFirst(xml, "Close") || tapFirst(xml, "Deny") || tapFirst(xml, "Reject")) {
        sleep(1500);
        record("reject-connect-sheet", "passed", { via: "cancel-close", top });
      } else {
        adb("shell", "input", "keyevent", "4");
        sleep(1000);
        record("reject-connect-sheet", "passed", { via: "back", top });
      }
    }
  }

  // Force competition message sign reject: open another join
  xml = dump("92-pre-join-reject");
  if (!texts(xml).includes("Soldoku")) {
    tapFirst(xml, "Home");
    sleep(1000);
    xml = dump("92-home-again");
  }
  // Ensure connected for join identity — if disconnected, connect then reject on MESSAGE not connect
  if (texts(xml).includes("Connect wallet")) {
    record("reject-signature", "needs-owner", {
      note: "Wallet disconnected; connect approved once, then Deny the competition MESSAGE when Join opens Seed Vault.",
    });
    tapFirst(xml, "Connect wallet");
    sleep(4000);
    // wait for owner or auto
    waitFor(({ top, texts: tt }) => /com\.sudoku\.game/.test(top) && tt.includes("Soldoku"), {
      name: "92-wait-connect",
      timeoutMs: 120000,
      everyMs: 4000,
    });
  }
  xml = goToRoom();
  // Already joined this room — browse for another Join, or trigger identity via Create check / Join same (no-op)
  // Use Create competition → Free → Create room which calls identity()
  tapFirst(xml, "← Back to Rooms") || tapFirst(xml, "Back to Rooms");
  sleep(1500);
  xml = dump("92-browse");
  if (tapFirst(xml, "Create competition") || tapFirst(xml, "Create")) {
    sleep(1500);
    xml = dump("92-create");
    tapFirst(xml, "Free competition") || tapFirst(xml, "Free");
    sleep(500);
    if (tapFirst(xml, "Create room")) {
      sleep(3000);
      const handoff = waitFor(
        ({ top }) => /MWABottomSheet|seedvault/i.test(top),
        { name: "92-sign-handoff", timeoutMs: 60000, everyMs: 2000 },
      );
      if (handoff) {
        record("reject-signature", "needs-owner", {
          instruction: "On Seeker: DENY / Cancel the Soldoku message sign (not Approve). Then confirm Soldoku recovers.",
          top: handoff.top,
        });
        const back = waitFor(
          ({ top, texts: tt }) =>
            /com\.sudoku\.game/.test(top) &&
            (tt.some((s) => /did not|Try again|Cancel|Create room|authorization|wallet/i.test(s)) || tt.includes("Soldoku")),
          { name: "92-after-reject", timeoutMs: 180000, everyMs: 4000 },
        );
        if (back) {
          const err = back.texts.filter((s) => /did not|Try again|authorization|timed out|wallet/i.test(s));
          record("reject-return", err.length || back.texts.includes("Soldoku") ? "passed" : "partial", {
            texts: back.texts.slice(0, 25),
            errors: err,
          });
        } else {
          record("reject-return", "failed", { reason: "did not return after reject wait" });
        }
      } else {
        // Maybe session still cached — no sign needed
        record("reject-signature", "skipped", {
          note: "Create room did not open wallet — session still valid. Try Disconnect then Create again.",
          texts: texts(dump("92-no-sign")).slice(0, 20),
        });
      }
    }
  }

  results.finishedAt = new Date().toISOString();
  writeFileSync(join(out, "92-challenge-results.json"), JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ summary: results.phases.map((p) => [p.name, p.status]) }, null, 2));
  process.exit(0);
} catch (error) {
  results.error = String(error?.stack || error);
  writeFileSync(join(out, "92-challenge-results.json"), JSON.stringify(results, null, 2));
  console.error(results.error);
  process.exit(1);
}
