const TECHNIQUES = [
  "naked-single",
  "hidden-single",
  "naked-pair",
  "hidden-pair",
  "pointing",
  "claiming",
  "naked-triple",
  "hidden-triple",
  "x-wing",
] as const;

const LABELS: Record<(typeof TECHNIQUES)[number], string> = {
  "naked-single": "Naked single",
  "hidden-single": "Hidden single",
  "naked-pair": "Naked pair",
  "hidden-pair": "Hidden pair",
  pointing: "Pointing",
  claiming: "Claiming",
  "naked-triple": "Naked triple",
  "hidden-triple": "Hidden triple",
  "x-wing": "X-Wing",
};

export function coachNote(body: Record<string, unknown>): { note: string; cacheKey: string } | null {
  if (Array.isArray(body.solution) || Array.isArray(body.givens) || Array.isArray(body.values) || Array.isArray(body.grid)) {
    return null;
  }
  if (Object.values(body).some((value) => value !== null && typeof value === "object" && !Array.isArray(value))) return null;
  if (Object.values(body).some((value) => typeof value === "string" && value.length > 32)) return null;
  if ("digit" in body || "room" in body || "code" in body || "matchId" in body || "wallet" in body || "board" in body) return null;
  if (body.kind === "summary") return summary(body);
  if (body.kind === "explain") return explain(body);
  return null;
}

function summary(body: Record<string, unknown>): { note: string; cacheKey: string } | null {
  if (body.level !== "easy" && body.level !== "medium" && body.level !== "hard" && body.level !== "expert") return null;
  const mistakes = count(body.mistakes, 0, 99);
  const hints = count(body.hints, 0, 99);
  const elapsed = count(body.elapsed, 0, 86_400);
  if (mistakes == null || hints == null || elapsed == null) return null;
  const techniques = Array.isArray(body.techniques)
    ? body.techniques.filter((item): item is (typeof TECHNIQUES)[number] => typeof item === "string" && isTechnique(item)).slice(0, 4)
    : [];
  const names = techniques.map((item) => LABELS[item]).join(", ") || "none recorded";
  const note = `Finished ${body.level} in ${clock(elapsed)}. ${plural(mistakes, "mistake")}. ${plural(hints, "hint")}. Techniques: ${names}.`;
  return { note, cacheKey: note };
}

function explain(body: Record<string, unknown>): { note: string; cacheKey: string } | null {
  if (typeof body.technique !== "string" || !isTechnique(body.technique)) return null;
  const row = count(body.row, 1, 9);
  const col = count(body.col, 1, 9);
  if (row == null || col == null) return null;
  const where = `row ${row}, column ${col}`;
  const note = `${LABELS[body.technique]} at ${where}. This step does not reveal a digit.`;
  return { note, cacheKey: note };
}

function isTechnique(value: string): value is (typeof TECHNIQUES)[number] {
  return (TECHNIQUES as readonly string[]).includes(value);
}

function count(value: unknown, min: number, max: number): number | null {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) return null;
  return number;
}

function clock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

