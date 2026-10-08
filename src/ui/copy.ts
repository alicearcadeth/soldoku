/** Player-facing labels. These do not choose amounts, accounts, or instructions. */

export const HELP_FUNDED_ROOMS = "Free leaderboard rooms take no tokens. Funded rooms use Devnet TEST, which has no cash value. Other token symbols are amount previews and are not deposited.";
export const ABOUT_FUNDED_ROOMS = "Leaderboard competitions allow open entry until the deadline. Each wallet gets one timed attempt at the same grid. Rankings stay provisional until the room closes. A creator can extend the period only before another participant joins. Free rooms take no tokens. Funded rooms use Devnet TEST. Other symbols in the token picker are amount previews.";

export function shortAddress(address: string): string {
  if (address.length <= 8) return address;
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

export function stakeCount(stake: string | null): string {
  return stake?.match(/\d+/)?.[0] ?? "1";
}

/** Keeps the words "Deposit stake" so the action stays recognizable. */
export function depositActionLabel(stake: string | null, pending: boolean): string {
  if (pending) return "Check deposit";
  const amount = stakeCount(stake);
  return `Deposit stake · approve ${amount} test token${amount === "1" ? "" : "s"}`;
}

export function walletBalanceCopy(solLamports: number, tokenAtomic: string): string {
  const tokens = (Number(tokenAtomic) / 1_000_000).toFixed(0);
  const sol = (solLamports / 1_000_000_000).toFixed(3);
  return `Wallet balance: ${tokens} test tokens and ${sol} SOL for fees. This is not a match deposit.`;
}

/** Explains an in-flight wallet step. Returns null for unrelated busy text. */
export function walletStatusDetail(busy: string): string | null {
  if (busy === "Connecting wallet") return "Connecting wallet. Approval continues in your wallet.";
  if (busy === "Waiting for your approval") return "Continue in your wallet. Approve the request there, then return here.";
  if (busy === "Transaction submitted") return "Transaction submitted. The match escrow is not funded until this confirms.";
  if (busy === "Checking the submitted transaction") return "Checking the submitted transaction. The match escrow is not funded until this confirms.";
  return null;
}
