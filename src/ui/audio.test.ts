import { afterEach, describe, expect, it, vi } from "vitest";
import { FIREWORKS, FIREWORK_FLIGHT } from "./fireworks";

async function audioHarness() {
  vi.resetModules();
  vi.useFakeTimers();
  const oscillators: Array<{ type: string; frequency: { value: number; setValueAtTime: ReturnType<typeof vi.fn>; exponentialRampToValueAtTime: ReturnType<typeof vi.fn> }; start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> }> = [];
  const parameter = () => ({ value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() });
  const audio = {
    state: "running", currentTime: 0, sampleRate: 48000, destination: {},
    resume: vi.fn(async () => {}), suspend: vi.fn(async () => {}),
    createOscillator: () => {
      const osc = { type: "", frequency: parameter(), connect: vi.fn(), start: vi.fn(), stop: vi.fn() };
      oscillators.push(osc); return osc;
    },
    createGain: () => ({ gain: parameter(), connect: vi.fn() }),
    createDynamicsCompressor: () => ({ threshold: parameter(), knee: parameter(), ratio: parameter(), attack: parameter(), release: parameter(), connect: vi.fn() }),
    createBuffer: (_channels: number, length: number) => ({ getChannelData: () => new Float32Array(length) }),
    createBufferSource: () => ({ buffer: null, connect: vi.fn(), start: vi.fn(), stop: vi.fn() }),
    createBiquadFilter: () => ({ type: "", frequency: parameter(), Q: parameter(), connect: vi.fn() }),
  };
  vi.stubGlobal("window", { AudioContext: class { constructor() { return audio; } }, setTimeout, clearTimeout, setInterval, clearInterval });
  vi.stubGlobal("document", { visibilityState: "visible" });
  return { ...await import("./audio"), audio, oscillators };
}

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("victory sound", () => {
  it("times a descending explosion to every visual rocket, including the finale", async () => {
    const { playCue, oscillators } = await audioHarness();
    playCue("done");
    expect(oscillators.some(osc => osc.frequency.exponentialRampToValueAtTime.mock.calls.some(([frequency]) => frequency < 80))).toBe(true);
    const booms = oscillators.filter(osc => osc.frequency.exponentialRampToValueAtTime.mock.calls.some(([frequency]) => frequency === 42));
    expect(booms).toHaveLength(FIREWORKS.length);
    booms.forEach((boom, index) => expect(boom.start.mock.calls[0][0]).toBeCloseTo(0.01 + FIREWORKS[index].delay + FIREWORK_FLIGHT));
    expect(Math.max(...oscillators.flatMap(osc => osc.stop.mock.calls.map(([time]) => time)))).toBeGreaterThan(3.5);
  });

  it("does not let an earlier tap timer cut off the victory tail", async () => {
    const { playCue, audio } = await audioHarness();
    playCue("tap");
    await vi.advanceTimersByTimeAsync(50);
    playCue("done");
    await vi.advanceTimersByTimeAsync(3000);
    expect(audio.suspend).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(3000);
    expect(audio.suspend).toHaveBeenCalledTimes(1);
  });

  it("keeps a hidden or paused game silent", async () => {
    const { playCue, setMusicHeld, oscillators } = await audioHarness();
    vi.stubGlobal("document", { visibilityState: "hidden" });
    playCue("done");
    expect(oscillators).toHaveLength(0);
    vi.stubGlobal("document", { visibilityState: "visible" });
    setMusicHeld(true);
    playCue("done");
    expect(oscillators).toHaveLength(0);
  });
});
