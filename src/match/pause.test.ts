import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

describe("paid-room pause", () => {
  const previous = process.env.SUDOKU_FUNDING_PAUSED;
  const previousStore = process.env.SUDOKU_MATCH_STORE;

  afterEach(() => {
    if (previous === undefined) delete process.env.SUDOKU_FUNDING_PAUSED;
    else process.env.SUDOKU_FUNDING_PAUSED = previous;
    if (previousStore === undefined) delete process.env.SUDOKU_MATCH_STORE;
    else process.env.SUDOKU_MATCH_STORE = previousStore;
  });

  it("blocks a new paid room and still allows practice", async () => {
    process.env.SUDOKU_FUNDING_PAUSED = "1";
    process.env.SUDOKU_MATCH_STORE = join(mkdtempSync(join(tmpdir(), "sudoku-pause-")), "matches.json");
    const { handleMatchRequest } = await import("./plugin");
    const captcha = await handleMatchRequest("POST", new URL("http://local/api/captcha"), {}) as { id: string; target: number };
    await handleMatchRequest("POST", new URL("http://local/api/captcha/check"), { id: captcha.id, value: captcha.target });
    await expect(handleMatchRequest("POST", new URL("http://local/api/rooms"), {
      level: "easy",
      captchaId: captcha.id,
      wallet: "JCVsKd4TMg1fvEs7rjf5YgLYbJfNC8Dwb4x1PchFkGM7",
      stake: "1000000",
    })).rejects.toThrow(/paused/);
    const practiceCaptcha = await handleMatchRequest("POST", new URL("http://local/api/captcha"), {}) as { id: string; target: number };
    await handleMatchRequest("POST", new URL("http://local/api/captcha/check"), { id: practiceCaptcha.id, value: practiceCaptcha.target });
    const practice = await handleMatchRequest("POST", new URL("http://local/api/rooms"), {
      level: "easy",
      captchaId: practiceCaptcha.id,
      practice: true,
    }) as { code: string; staked: boolean };
    expect(practice.staked).toBe(false);
    expect(practice.code).toMatch(/^[A-Z0-9]+$/);
  });

  it("still lets an already opened paid room move after the pause", async () => {
    delete process.env.SUDOKU_FUNDING_PAUSED;
    process.env.SUDOKU_MATCH_STORE = join(mkdtempSync(join(tmpdir(), "sudoku-pause-")), "matches.json");
    const { handleMatchRequest } = await import("./plugin");
    const captcha = await handleMatchRequest("POST", new URL("http://local/api/captcha"), {}) as { id: string; target: number };
    await handleMatchRequest("POST", new URL("http://local/api/captcha/check"), { id: captcha.id, value: captcha.target });
    const room = await handleMatchRequest("POST", new URL("http://local/api/rooms"), {
      level: "easy",
      captchaId: captcha.id,
      wallet: "JCVsKd4TMg1fvEs7rjf5YgLYbJfNC8Dwb4x1PchFkGM7",
      stake: "1000000",
    }) as unknown as { code: string; playerId: string; givens: number[]; board: number[] };
    process.env.SUDOKU_FUNDING_PAUSED = "1";
    const next = room.board.slice();
    const empty = next.findIndex((value, index) => value === 0 && room.givens[index] === 0);
    next[empty] = 1;
    await expect(handleMatchRequest("POST", new URL("http://local/api/rooms/move"), {
      code: room.code,
      playerId: room.playerId,
      values: next,
    })).resolves.toHaveProperty("code", room.code);
  });
});
