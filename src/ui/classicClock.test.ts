import { describe, expect, it } from "vitest";
import { advanceClassicElapsed, nextClassicMark } from "./classicClock";

/** The interval in ClassicGame: add time only while playing, and always move the mark. */
function tick(elapsed: number, mark: number, now: number, playing: boolean) {
  return {
    elapsed: advanceClassicElapsed(elapsed, mark, now, playing),
    mark: nextClassicMark(mark, now),
  };
}

describe("classic clock", () => {
  it("keeps a late tick while the player is still playing", () => {
    expect(advanceClassicElapsed(10_000, 1_000, 1_200, true)).toBe(10_200);
    expect(advanceClassicElapsed(10_000, 1_000, 4_000, true)).toBe(13_000);
    expect(advanceClassicElapsed(10_000, 1_000, 8_000, true)).toBe(17_000);
  });

  it("drops time while paused, hidden, or unfocused, including a long gap", () => {
    expect(advanceClassicElapsed(11 * 60_000 + 43_000, 0, 28 * 60_000, false)).toBe(11 * 60_000 + 43_000);
    expect(advanceClassicElapsed(10_000, 1_000, 1_000, false)).toBe(10_000);
    expect(advanceClassicElapsed(10_000, 5_000, 4_000, true)).toBe(10_000);
  });

  it("does not apply a background gap on the next playing tick or count it twice", () => {
    let clock = tick(5_000, 1_000, 1_200, true);
    clock = tick(clock.elapsed, clock.mark, clock.mark + 30_000, false);
    clock = tick(clock.elapsed, clock.mark, clock.mark + 200, true);
    expect(clock.elapsed).toBe(5_400);
  });

  it("keeps manual pause, resume, and rapid leave signals from adding or doubling time", () => {
    let clock = tick(0, 0, 1_000, true);
    const paused = tick(clock.elapsed, clock.mark, clock.mark + 5_000, false);
    const resume = tick(paused.elapsed, paused.mark + 5_000, paused.mark + 5_200, true);
    const blur = tick(resume.elapsed, resume.mark, resume.mark + 9_000, false);
    const hide = tick(blur.elapsed, blur.mark, blur.mark + 9_000, false);
    const again = tick(hide.elapsed, hide.mark, hide.mark + 200, true);
    expect(clock.elapsed).toBe(1_000);
    expect(resume.elapsed).toBe(1_200);
    expect(again.elapsed).toBe(1_400);
  });
});
