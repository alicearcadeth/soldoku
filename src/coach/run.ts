import { explanationAllowed } from "./guard";
import { coachNote } from "./note";

export const COACH_BURST = 20;
export const COACH_WINDOW_MS = 10 * 60_000;
export const GEMINI_DAILY_CAP = 200;

export type CoachResult = {
  status: number;
  text: string;
  source: "local" | "gemini" | "cache";
  gemini: boolean;
  error: boolean;
  ms: number;
};

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export async function runCoach(
  body: unknown,
  deps: {
    now: number;
    bucket: string;
    hits: Map<string, number[]>;
    cache: Map<string, string>;
    key?: string;
    dailyCalls: number;
    fetchImpl: FetchLike;
  },
): Promise<CoachResult> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { status: 400, text: "", source: "local", gemini: false, error: false, ms: 0 };
  }
  const built = coachNote(body as Record<string, unknown>);
  if (!built) return { status: 400, text: "", source: "local", gemini: false, error: false, ms: 0 };
  const recent = (deps.hits.get(deps.bucket) ?? []).filter((time) => deps.now - time < COACH_WINDOW_MS);
  if (recent.length >= COACH_BURST) {
    return { status: 429, text: built.note, source: "local", gemini: false, error: false, ms: 0 };
  }
  recent.push(deps.now);
  deps.hits.set(deps.bucket, recent);
  const cached = deps.cache.get(built.cacheKey);
  if (cached) return { status: 200, text: cached, source: "cache", gemini: false, error: false, ms: 0 };
  if (!deps.key || deps.dailyCalls >= GEMINI_DAILY_CAP) {
    return { status: 200, text: built.note, source: "local", gemini: false, error: false, ms: 0 };
  }
  const kind = (body as Record<string, unknown>).kind;
  const prompt = kind === "explain"
    ? [
        "Rewrite this verified hint in two short sentences.",
        "Speak to the player as you. Do not say I.",
        "Do not say solved, complete, finished, or final.",
        "Do not add a number, cell, technique, or praise that is not in the note.",
        `Note: ${built.note}`,
      ].join("\n")
    : [
        "Rewrite this verified note in two short sentences.",
        "Speak to the player as you. Do not say I.",
        "Do not add a number, technique, or praise that is not in the note.",
        `Note: ${built.note}`,
      ].join("\n");
  const started = Date.now();
  try {
    const response = await deps.fetchImpl(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent",
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": deps.key },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 80, temperature: 0.2 },
        }),
        signal: AbortSignal.timeout(8_000),
      },
    );
    const ms = Date.now() - started;
    const data = await response.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join(" ").trim() ?? "";
    if (!response.ok || !explanationAllowed(text, built.note)) {
      return { status: 200, text: built.note, source: "local", gemini: true, error: !response.ok, ms };
    }
    deps.cache.set(built.cacheKey, text);
    return { status: 200, text, source: "gemini", gemini: true, error: false, ms };
  } catch {
    return { status: 200, text: built.note, source: "local", gemini: true, error: true, ms: Date.now() - started };
  }
}
