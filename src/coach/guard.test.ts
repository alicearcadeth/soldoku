import { describe, expect, it } from "vitest";
import { explanationAllowed } from "./guard";
import { coachNote } from "./note";

describe("coach guard", () => {
  it("keeps a paraphrase that only repeats numbers from the note", () => {
    expect(explanationAllowed("One mistake in 1:30.", "Easy in 1:30, 1 mistake, 0 hints.")).toBe(true);
  });

  it("rejects a rewritten time that is not in the note", () => {
    expect(explanationAllowed("Completed in 33 minutes and 20 seconds.", "Easy in 0:02. 0 mistakes. 0 hints.")).toBe(false);
  });

  it("rejects a claim that the puzzle is solved when the note does not say so", () => {
    expect(explanationAllowed("You solved it with a naked single.", "Naked single at row 2, column 3. This step does not reveal a digit.")).toBe(false);
  });

  it("rejects a digit the note never mentioned", () => {
    expect(explanationAllowed("Put 7 in the corner.", "Naked single. Look at row 1, column 2.")).toBe(false);
  });
});

describe("coach note", () => {
  it("builds a summary from structured facts and ignores extra text", () => {
    const note = coachNote({
      kind: "summary",
      level: "easy",
      mistakes: 1,
      hints: 0,
      elapsed: 90,
      techniques: ["naked-single"],
      text: "digit 7",
    });
    expect(note?.note).toBe("Finished easy in 1:30. 1 mistake. 0 hints. Techniques: Naked single.");
    expect(note?.note.includes("7")).toBe(false);
  });

  it("refuses a puzzle written as one long string", () => {
    expect(coachNote({ kind: "summary", level: "easy", mistakes: 0, hints: 0, elapsed: 1, solution: "1".repeat(81) })).toBeNull();
  });

  it("refuses a puzzle payload", () => {
    expect(coachNote({ kind: "summary", level: "easy", mistakes: 0, hints: 0, elapsed: 1, solution: [1] })).toBeNull();
  });
});
