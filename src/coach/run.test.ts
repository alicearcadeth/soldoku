import { describe, expect, it, vi } from "vitest";
import { playEvent } from "./play";
import { GEMINI_DAILY_CAP, runCoach } from "./run";
import { explanationAllowed } from "./guard";

const note = {
  kind: "explain",
  technique: "naked-single",
  row: 2,
  col: 3,
};

function deps(fetchImpl: typeof fetch) {
  return {
    now: 1_000,
    bucket: "abc",
    hits: new Map<string, number[]>(),
    cache: new Map<string, string>(),
    key: "test-key",
    dailyCalls: 0,
    fetchImpl,
  };
}

function gemini(text: string, status = 200): typeof fetch {
  return vi.fn(async () => new Response(JSON.stringify({
    candidates: [{ content: { parts: [{ text }] } }],
  }), { status })) as typeof fetch;
}

describe("coach decisions", () => {
  it("keeps the verified note when the key is missing", async () => {
    const fetchImpl = vi.fn() as typeof fetch;
    const result = await runCoach(note, { ...deps(fetchImpl), key: undefined });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result.source).toBe("local");
    expect(result.text).toContain("does not reveal a digit");
  });

  it("accepts a paraphrase that stays inside the note", async () => {
    const fetchImpl = gemini("Check row 2, column 3 for a naked single. This step does not reveal a digit.");
    const result = await runCoach(note, deps(fetchImpl));
    expect(result.source).toBe("gemini");
  });

  it("drops an invented digit, technique, or performance claim", async () => {
    const source = "Naked single at row 2, column 3. This step does not reveal a digit.";
    expect(explanationAllowed("The digit is 7.", source)).toBe(false);
    expect(explanationAllowed("Use an X-Wing here.", source)).toBe(false);
    expect(explanationAllowed("Excellent rating for this solve.", source)).toBe(false);
    expect(explanationAllowed("You solved the whole puzzle.", source)).toBe(false);
    const result = await runCoach(note, deps(gemini("Put digit 7 in the cell.")));
    expect(result.source).toBe("local");
    expect(result.text).toBe("Naked single at row 2, column 3. This step does not reveal a digit.");
  });

  it("drops malformed, oversized, and provider failures", async () => {
    expect((await runCoach(note, deps(gemini("")))).source).toBe("local");
    expect((await runCoach(note, deps(gemini("x".repeat(400))))).source).toBe("local");
    expect((await runCoach(note, deps(gemini("busy", 429)))).source).toBe("local");
    expect((await runCoach(note, deps(gemini("down", 503)))).error).toBe(true);
    const thrown = vi.fn(async () => { throw new Error("timeout"); }) as typeof fetch;
    expect((await runCoach(note, deps(thrown))).source).toBe("local");
  });

  it("uses the cache and stops past the burst and daily cap", async () => {
    const fetchImpl = gemini("Check row 2, column 3 for a naked single. This step does not reveal a digit.");
    const state = deps(fetchImpl);
    expect((await runCoach(note, state)).source).toBe("gemini");
    expect((await runCoach(note, state)).source).toBe("cache");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    state.hits.set("abc", Array.from({ length: 20 }, () => 1_000));
    expect((await runCoach({ ...note, row: 4 }, state)).status).toBe(429);
    const capped = await runCoach(note, { ...deps(fetchImpl), dailyCalls: GEMINI_DAILY_CAP, cache: new Map() });
    expect(capped.source).toBe("local");
  });

  it("rejects puzzle payloads and client-supplied digits", async () => {
    expect((await runCoach({ ...note, digit: 4 }, deps(vi.fn() as typeof fetch))).status).toBe(400);
    expect((await runCoach({ ...note, solution: [1] }, deps(vi.fn() as typeof fetch))).status).toBe(400);
    expect((await runCoach({ ...note, room: "ABCD" }, deps(vi.fn() as typeof fetch))).status).toBe(400);
  });
});

describe("play events", () => {
  it("counts a finish and rejects a board", () => {
    expect(playEvent({ event: "finish", level: "hard", hints: 2, reveals: 1, mistakes: 0, seconds: 40 })?.event).toBe("finish");
    expect(playEvent({ event: "start", level: "easy", wallet: "x" })).toBeNull();
    expect(playEvent({ event: "hint", stage: 1, values: Array(81).fill(1) })).toBeNull();
  });
});
