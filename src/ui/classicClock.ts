/**
 * Classic time is active play, measured with a monotonic clock.
 * A late tick while the puzzle is still playing counts in full, including a stall longer than a second.
 * A tick while paused, hidden, or unfocused adds nothing. The caller moves the mark forward either way,
 * so that gap is not applied on the next playing tick and is not counted twice.
 */
export function advanceClassicElapsed(elapsed: number, previousMs: number, nowMs: number, playing = true): number {
  const base = Number.isFinite(elapsed) && elapsed > 0 ? elapsed : 0;
  if (!playing) return base;
  const delta = nowMs - previousMs;
  if (!Number.isFinite(delta) || delta <= 0) return base;
  return base + delta;
}

/** Move the mark to now after every tick, including ticks that add no time. */
export function nextClassicMark(previousMs: number, nowMs: number): number {
  return Number.isFinite(nowMs) ? nowMs : previousMs;
}
