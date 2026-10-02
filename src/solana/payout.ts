import type { Verdict } from "../engine/compete";

/** Winner takes both USDC deposits. A draw returns each stake. No fee. */
export function payouts(
  stake: number,
  verdict: Verdict,
  players: [string, string],
): { to: string; amount: number }[] {
  if (stake <= 0) return [];
  if (verdict.outcome === "draw") {
    return [
      { to: players[0], amount: stake },
      { to: players[1], amount: stake },
    ];
  }
  return [{ to: verdict.winnerId, amount: stake * 2 }];
}
