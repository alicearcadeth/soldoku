/**
 * From an active competition board on Seeker:
 * parse given digits from UI bounds → solve → enter moves → bg/fg recovery → finish. Solver-assisted validation, not a human fair-play test.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";

const serial = process.env.SEEKER_SERIAL || "SM02E4072803429";
const out = "docs/evidence/2026-10-09-seeker-relay-fixed-physical";
mkdirSync(out, { recursive: true });
const adb = (...a) => execFileSync("adb", ["-s", serial, ...a], { encoding: "utf8", maxBuffer: 12e6 });
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

const results = { startedAt: new Date().toISOString(), phases: [] };
function record(name, status, detail = {}) {
  const row = { name, status, ...detail, at: new Date().toISOString() };
  results.phases.push(row);
  console.log(JSON.stringify(row));
  writeFileSync(join(out, "92-challenge-results.json"), JSON.stringify(results, null, 2));
}

function dump(name) {
  if (!/com\.sudoku\.game/.test(top())) throw new Error("Stopped: Soldoku is not the foreground app");
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
function top() {
  return (adb("shell", "dumpsys", "activity", "activities").match(/topResumedActivity=.*/g) || [])[0] || "";
}
function tap(cx, cy) {
  adb("shell", "input", "tap", String(cx | 0), String(cy | 0));
}
function tapExact(xml, needle) {
  const re = /text="([^"]*)"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/g;
  let m;
  while ((m = re.exec(xml))) {
    if (m[1] !== needle) continue;
    const cx = ((+m[2] + +m[4]) / 2) | 0;
    const cy = ((+m[3] + +m[5]) / 2) | 0;
    tap(cx, cy);
    console.log(JSON.stringify({ tap: needle, cx, cy }));
    return true;
  }
  return false;
}
function tapIncludes(xml, needle, maxLen = 200) {
  const re = /text="([^"]*)"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/g;
  let best = null;
  let m;
  while ((m = re.exec(xml))) {
    if (!m[1].includes(needle) || m[1].length > maxLen) continue;
    const node = { text: m[1], cx: ((+m[2] + +m[4]) / 2) | 0, cy: ((+m[3] + +m[5]) / 2) | 0, exact: m[1] === needle };
    if (node.exact) { tap(node.cx, node.cy); console.log(JSON.stringify({ tap: needle, ...node })); return true; }
    if (!best || m[1].length < best.text.length) best = node;
  }
  if (!best) return false;
  tap(best.cx, best.cy);
  console.log(JSON.stringify({ tap: needle, ...best }));
  return true;
}

function nodes(xml) {
  const list = [];
  const re = /text="([^"]*)"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/g;
  let m;
  while ((m = re.exec(xml))) {
    list.push({ text: m[1], x1: +m[2], y1: +m[3], x2: +m[4], y2: +m[5], cx: ((+m[2] + +m[4]) / 2) | 0, cy: ((+m[3] + +m[5]) / 2) | 0, w: +m[4] - +m[2], h: +m[5] - +m[3] });
  }
  return list;
}

function cluster(values, count) {
  const sorted = [...new Set(values.map((v) => Math.round(v)))].sort((a, b) => a - b);
  if (sorted.length <= count) return sorted;
  // greedy merge nearest until count
  const pts = sorted.map((v) => ({ v, n: 1 }));
  while (pts.length > count) {
    let bestI = 0;
    let bestD = Infinity;
    for (let i = 0; i < pts.length - 1; i++) {
      const d = pts[i + 1].v - pts[i].v;
      if (d < bestD) { bestD = d; bestI = i; }
    }
    const a = pts[bestI];
    const b = pts[bestI + 1];
    const merged = { v: Math.round((a.v * a.n + b.v * b.n) / (a.n + b.n)), n: a.n + b.n };
    pts.splice(bestI, 2, merged);
  }
  return pts.map((p) => p.v);
}

function nearest(centers, value) {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < centers.length; i++) {
    const d = Math.abs(centers[i] - value);
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

function parseBoard(xml) {
  const all = nodes(xml);
  // cell digits are narrow (~40-50px); pad buttons are wide (~350px)
  const cellDigits = all.filter((n) => /^[1-9]$/.test(n.text) && n.w < 80 && n.h > 40 && n.h < 120);
  if (cellDigits.length < 20) return null;
  const colXs = cluster(cellDigits.map((n) => n.cx), 9);
  const rowYs = cluster(cellDigits.map((n) => n.cy), 9);
  if (colXs.length !== 9 || rowYs.length !== 9) return null;
  const grid = Array(81).fill(0);
  const given = Array(81).fill(false);
  for (const n of cellDigits) {
    const c = nearest(colXs, n.cx);
    const r = nearest(rowYs, n.cy);
    const idx = r * 9 + c;
    if (Math.abs(colXs[c] - n.cx) > 40 || Math.abs(rowYs[r] - n.cy) > 40) continue;
    grid[idx] = Number(n.text);
    given[idx] = true;
  }
  const pad = {};
  for (const n of all) {
    if (!/^[1-9]$/.test(n.text) || n.w < 200) continue;
    pad[n.text] = { cx: n.cx, cy: n.cy };
  }
  return { grid, given, colXs, rowYs, pad, givenCount: given.filter(Boolean).length };
}

function solveSudoku(start) {
  const grid = start.slice();
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
    rowMask[r] |= bit; colMask[c] |= bit; boxMask[b] |= bit;
  }
  function nextEmpty() {
    let best = -1; let bestCount = 10;
    for (let i = 0; i < 81; i++) {
      if (grid[i]) continue;
      const r = (i / 9) | 0; const c = i % 9; const b = ((r / 3) | 0) * 3 + ((c / 3) | 0);
      const used = rowMask[r] | colMask[c] | boxMask[b];
      let count = 0;
      for (let d = 1; d <= 9; d++) if (!(used & (1 << d))) count++;
      if (count === 0) return -2;
      if (count < bestCount) { bestCount = count; best = i; if (count === 1) break; }
    }
    return best;
  }
  function dfs() {
    const i = nextEmpty();
    if (i === -1) return true;
    if (i === -2) return false;
    const r = (i / 9) | 0; const c = i % 9; const b = ((r / 3) | 0) * 3 + ((c / 3) | 0);
    const used = rowMask[r] | colMask[c] | boxMask[b];
    for (let d = 1; d <= 9; d++) {
      const bit = 1 << d;
      if (used & bit) continue;
      grid[i] = d; rowMask[r] |= bit; colMask[c] |= bit; boxMask[b] |= bit;
      if (dfs()) return true;
      grid[i] = 0; rowMask[r] ^= bit; colMask[c] ^= bit; boxMask[b] ^= bit;
    }
    return false;
  }
  return dfs() ? grid : null;
}

function ensureBoardVisible() {
  let xml = dump("92c-check");
  let t = texts(xml);
  if (t.some((s) => /^Your time /.test(s)) && Object.keys(parseBoard(xml)?.pad || {}).length >= 9) return xml;
  // scroll board into view with pad
  adb("shell", "input", "swipe", "600", "2000", "600", "900", "350");
  sleep(800);
  xml = dump("92c-scrolled");
  t = texts(xml);
  if (t.some((s) => /^Your time /.test(s))) return xml;
  if (tapExact(xml, "Continue challenge") || tapExact(xml, "Start challenge")) {
    sleep(2500);
    return dump("92c-continued");
  }
  return xml;
}

function placeAt(board, index, digit) {
  const r = (index / 9) | 0;
  const c = index % 9;
  const cx = board.colXs[c];
  const cy = board.rowYs[r];
  const pad = board.pad[String(digit)];
  if (!pad) return false;
  tap(cx, cy);
  sleep(280);
  tap(pad.cx, pad.cy);
  sleep(1000);
  return true;
}

function refreshBoardLayout(xml) {
  const parsed = parseBoard(xml);
  if (!parsed) return null;
  // if pad incomplete, swipe up more
  if (Object.keys(parsed.pad).length < 9) {
    adb("shell", "input", "swipe", "600", "2200", "600", "1200", "300");
    sleep(600);
    return parseBoard(dump("92c-padfix"));
  }
  return parsed;
}

try {
  let xml = ensureBoardVisible();
  let board = refreshBoardLayout(xml);
  if (!board) {
    record("parse-board", "failed", { texts: texts(xml).slice(0, 20) });
    process.exit(2);
  }
  const solution = solveSudoku(board.grid);
  record("parse-board", solution ? "passed" : "failed", {
    givens: board.givenCount,
    pad: Object.keys(board.pad).sort(),
    gridPreview: board.grid.join(""),
  });
  if (!solution) process.exit(2);
  record("solve", "passed");

  const empties = [];
  for (let i = 0; i < 81; i++) if (!board.given[i]) empties.push(i);

  // Enter first 3 moves
  const probe = empties.slice(0, 3);
  let placed = 0;
  for (const i of probe) {
    xml = dump(`92c-move-${placed}`);
    board = refreshBoardLayout(xml) || board;
    if (placeAt(board, i, solution[i])) placed++;
  }
  xml = dump("92c-after-moves");
  board = refreshBoardLayout(xml) || board;
  const probeOk = probe.every((i) => board.grid[i] === solution[i]);
  record("enter-moves", probeOk ? "passed" : placed > 0 ? "partial" : "failed", {
    placed,
    probe,
    seen: probe.map((i) => board.grid[i]),
  });
  const beforeBg = board.grid.slice();

  // Background / reopen
  adb("shell", "input", "keyevent", "3");
  sleep(2000);
  record("background", "observed", { note: "Launcher screenshot intentionally omitted" });
  adb("shell", "am", "start", "-n", "com.sudoku.game/.MainActivity");
  sleep(3000);
  xml = dump("92c-reopen");
  let t = texts(xml);
  if (!t.some((s) => /^Your time /.test(s))) {
    if (tapExact(xml, "Continue challenge")) sleep(2000);
    else if (tapIncludes(xml, "LEADERBOARD") || tapIncludes(xml, "Compete")) {
      sleep(2000);
      xml = dump("92c-reopen-compete");
      tapExact(xml, "Continue challenge") || tapExact(xml, "Start challenge");
      sleep(2000);
    }
    xml = dump("92c-reopen-board");
    t = texts(xml);
  }
  // scroll to see board digits
  adb("shell", "input", "swipe", "600", "2000", "600", "1000", "350");
  sleep(700);
  xml = dump("92c-recovered");
  board = refreshBoardLayout(xml);
  const recoveryOk = board && probe.every((i) => board.grid[i] === beforeBg[i]);
  record("bg-reopen-recovery", recoveryOk ? "passed" : board ? "partial" : "failed", {
    onBoard: texts(xml).some((s) => /^Your time /.test(s)),
    recoveredProbe: probe.map((i) => board?.grid[i] ?? null),
  });
  if (!board) board = { grid: beforeBg, given: beforeBg.map((v) => v !== 0), colXs: null, rowYs: null, pad: {} };

  // Complete remaining
  xml = dump("92c-prefill");
  board = refreshBoardLayout(xml) || board;
  const remaining = [];
  for (let i = 0; i < 81; i++) if (board.grid[i] !== solution[i]) remaining.push(i);
  let filled = 0;
  for (const i of remaining) {
    xml = dump(`92c-fill-${filled}`);
    const layout = refreshBoardLayout(xml);
    if (layout) board = layout;
    if (!board.colXs || !board.pad[String(solution[i])]) {
      adb("shell", "input", "swipe", "600", "2000", "600", "1100", "300");
      sleep(500);
      board = refreshBoardLayout(dump(`92c-fill-scroll-${filled}`)) || board;
    }
    placeAt(board, i, solution[i]);
    filled++;
    if (texts(dump(`92c-progress-${filled}`)).some((s) => /Finished in|Grid complete/i.test(s))) break;
  }
  sleep(1500);
  xml = dump("92c-complete");
  t = texts(xml);
  if (!t.some((s) => /Finished in/i.test(s)) && tapExact(xml, "Room & leaderboard")) {
    sleep(1200);
    xml = dump("92c-lobby");
    t = texts(xml);
  }
  // entity amp
  const finished = t.some((s) => /Finished in|Grid complete/i.test(s));
  record("complete-puzzle", finished ? "passed" : "failed", {
    filled,
    texts: t.filter((s) => /Finished|rank|Leaderboard|Your time|complete/i.test(s)).slice(0, 12),
  });

  xml = dump("92c-leaderboard");
  t = texts(xml);
  if (!t.some((s) => /Leaderboard|Finished/i.test(s))) {
    tapExact(xml, "Room & leaderboard") || tapIncludes(xml, "leaderboard");
    sleep(1000);
    xml = dump("92c-leaderboard2");
    t = texts(xml);
  }
  record("leaderboard-result", t.some((s) => /Finished in|Leaderboard/i.test(s)) ? "passed" : "partial", {
    texts: t.slice(0, 45),
  });

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

