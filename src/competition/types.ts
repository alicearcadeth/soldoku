import type { Level } from "../engine/types";

export type MarketToken = { mint: string; symbol: string; name: string; priceUsd: number; priceUsdExact?: string; verified?: boolean; updatedAt: number };
export type CompetitionSummary = {
  code: string;
  name: string;
  level: Level;
  createdAt: number;
  endsAt: number;
  durationMs: number;
  participants: number;
  status: "active" | "ended";
  token: MarketToken | null;
  stake: number;
  bestMs: number | null;
};
export type CompetitionView = CompetitionSummary & {
  leaderboard: { rank: number; name: string; completedMs: number }[];
  you: { owner: boolean; canExtend: boolean; startedAt: number | null; completedMs: number | null; rank: number | null; board: number[] | null; givens: number[] | null; sequence: number; name: string } | null;
};
export const DAY_MS = 24 * 60 * 60 * 1000;
export function elapsedLabel(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}.${Math.floor(ms % 1000 / 100)}`;
}
export function usdLabel(amount: number): string {
  const decimals = amount > 0 && amount < 1 ? Math.min(20, Math.ceil(-Math.log10(amount)) + 3) : 2;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: Math.max(2, decimals) }).format(amount);
}
