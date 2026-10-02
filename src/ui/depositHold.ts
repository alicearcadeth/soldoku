/**
 * Seed Vault Wallet blocked a Devnet deposit on 30 Sep 2026 with "Scam site detected."
 * The check that fired is unknown. New deposits stay out of the public UI until support
 * identifies that check. Refunds, room recovery, Classic, and Practice stay available.
 * The escrow program and its rules are unchanged. Set this to false to open deposits again.
 */
export const NEW_DEPOSITS_HELD = true;

export const DEPOSIT_HOLD_NOTE =
  "New deposits are paused. A wallet security warning blocked a Devnet deposit, and the cause is still unknown. Refunds for a room that already has a deposit still work. If your wallet showed a security warning, stop and contact wallet support.";
