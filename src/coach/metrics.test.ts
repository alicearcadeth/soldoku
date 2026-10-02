import { describe, expect, it } from "vitest";
import { metricReport } from "./metrics";
import { interpretDeposit } from "../solana/desk";

describe("daily metrics", () => {
  it("does not print a percentage when no player has finished", () => {
    const lines = metricReport({ player_started: 3, player_completed: 0, coach_requests: 2, gemini_calls: 1, gemini_ms: 2428 });
    expect(lines.some((line) => line.includes("Online completion rate: 0/3"))).toBe(true);
    expect(lines.some((line) => line.includes("Completed games with a hint: unavailable"))).toBe(true);
    expect(lines.join("\n")).not.toMatch(/\d+%/);
    expect(lines.some((line) => line.includes("Mean Gemini latency: 2428 ms"))).toBe(true);
  });
});

describe("deposit recovery", () => {
  it("keeps an unknown signature retryable and accepts a later confirmation", () => {
    expect(interpretDeposit("unknown", false, false)).toBe("retry");
    expect(interpretDeposit("unknown", false, true)).toBe("expired");
    expect(interpretDeposit("confirmed", false, false)).toBe("ok");
    expect(interpretDeposit("failed", true, false)).toBe("failed");
    expect(interpretDeposit("unknown", true, true)).toBe("ok");
  });
});
