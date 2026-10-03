export type VerifiedFinish = { wallet: string; startedAt: number | null; completedMs: number | null };
export type CompetitionOutcome =
  | { kind: "pending" }
  | { kind: "refund"; reason: "no-opponent" | "no-finish" | "tie" }
  | { kind: "winner"; wallet: string; completedMs: number };

/** Server-only selection from accepted attempts, never from client-submitted leaderboard rows. */
export function competitionOutcome(entrants: readonly VerifiedFinish[], deadline: number, now: number): CompetitionOutcome {
  if (!Number.isSafeInteger(deadline) || !Number.isSafeInteger(now)) throw new Error("Invalid competition clock.");
  if (new Set(entrants.map(entry => entry.wallet)).size !== entrants.length) throw new Error("Duplicate wallet in competition outcome.");
  if (now < deadline) return { kind: "pending" };
  if (entrants.length < 2) return { kind: "refund", reason: "no-opponent" };
  const finishes = entrants.filter(entry => entry.completedMs !== null);
  for (const entry of finishes) {
    if (entry.startedAt === null || !Number.isSafeInteger(entry.startedAt) || !Number.isSafeInteger(entry.completedMs)
      || entry.completedMs! < 15000 || entry.startedAt + entry.completedMs! >= deadline) {
      throw new Error("Invalid verified completion in competition outcome.");
    }
  }
  if (!finishes.length) return { kind: "refund", reason: "no-finish" };
  const fastest = finishes.reduce((best, entry) => Math.min(best, entry.completedMs!), Infinity);
  const leaders = finishes.filter(entry => entry.completedMs === fastest);
  if (leaders.length !== 1) return { kind: "refund", reason: "tie" };
  return { kind: "winner", wallet: leaders[0].wallet, completedMs: fastest };
}
