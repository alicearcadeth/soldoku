import type { Level } from "../engine/types";

export type MarketToken = { mint: string; symbol: string; name: string; priceUsd: number; priceUsdExact?: string; verified?: boolean; updatedAt: number };
export type FundedConfig = { program: string; authority: string; mint: string; decimals: number; playMs: number; graceMs: number };
export type SettlementPhase = "prepared" | "broadcast" | "unknown" | "failed" | "expired" | "confirmed";
export type SettlementAttempt = {
  phase: SettlementPhase; winner: string; signature: string; serialized: string; blockhash: string;
  lastValidBlockHeight: number; preparedAt: number; note?: string;
};
export type FundedTerms = FundedConfig & { id: string; stakeUnits: string; startsAt: number; refundAt: number;
  chainStatus: "pending" | "open" | "awarded" | "refunding" | "paid"; confirmedParticipants: number; chainTime: number;
  winner: string | null; settlementSignature?: string; settlement?: SettlementAttempt; settlementAlso?: SettlementAttempt[]; settlementAlert?: string };
export type VerifiedChainRoom = { id: string; creator: string; authority: string; mint: string; stakeUnits: string;
  startsAt: number; endsAt: number; refundAt: number; participants: number; chainTime: number;
  status: "open" | "awarded" | "refunding" | "paid"; winner: string | null; entries: { wallet: string; claimed: boolean }[] };
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
  funded?: FundedTerms;
};
export type CompetitionView = CompetitionSummary & {
  leaderboard: { rank: number; name: string; completedMs: number; wallet?: string; you?: boolean }[];
  you: { owner: boolean; canExtend: boolean; startedAt: number | null; completedMs: number | null; rank: number | null; board: number[] | null; givens: number[] | null; sequence: number; name: string; claimed?: boolean } | null;
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
