export const FEEDBACK_MIN = 8;
export const FEEDBACK_MAX = 400;
export const FEEDBACK_BURST = 4;
export const FEEDBACK_WINDOW_MS = 60 * 60 * 1000;

/** A short problem note. Rejects empty text and a pasted grid. */
export function feedbackNote(raw: unknown): string | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const note = (raw as { note?: unknown }).note;
  if (typeof note !== "string") return null;
  const text = note.trim().replace(/\s+/g, " ");
  if (text.length < FEEDBACK_MIN || text.length > FEEDBACK_MAX) return null;
  if (/\d(?:\s*\d){40,}/.test(text)) return null;
  return text;
}

export function feedbackAllowed(hits: number[], now: number): { ok: boolean; next: number[] } {
  const next = hits.filter((time) => now - time < FEEDBACK_WINDOW_MS);
  if (next.length >= FEEDBACK_BURST) return { ok: false, next };
  next.push(now);
  return { ok: true, next };
}
