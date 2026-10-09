# Physical funded relay retest — in progress

Runtime: clean eb14d0d8b733fc7d4dd00a583a5ff9c867ab6836 on both domains. Private GitHub preservation and verified independent bundle are complete. No program upgrade, app reinstall or storage clear.

## Passed so far

- Physical Seed Vault Devnet deposits: FE65DD6D (winner test) and E571262D (no-finish refund test), 1 TEST per phone deposit. Both are finalized; each room has two confirmed participants and a 2 TEST vault.
- Phone transaction BqfowjPpp1kJeLFBmF3ra4QBBhHiKqR72JohfJqJ6q7BmJg7c9MH9GA3QvxGZxqDrFBbM3vJZSHzpTa32qhD87P proves the relay accepts the wallet's appended compute-unit limit (200,000) and price (100,000 micro-lamports). Fee 25,000 Devnet lamports, no chain error.
- Refund-room phone deposit 2AdUPS7D7yZ6pSke1rkt2ZkT8dLHCR7x75PWEwtXbPigXAaL7xrM5vzB68sUEy1fSBrMKQ6w5SFf5NEYJpUjPFym also finalized, fee 25,000 lamports.
- FE65DD6D: 3 probe digits survived background/reopen; timer continued. Completed on device, server rank 1 at 447,318 ms (7:27.3). Automated solver-assisted play, not evidence of human fair play.
- New funding is paused again, Devnet only. Card POST remains 403. CSP and isolation headers remain on both domains.

## Pending at this checkpoint

FE65DD6D ends at 2026-10-09 14:40:31 UTC. E571262D ends at 14:44:20 UTC. The scheduled */5 cron is being observed; no manual settle request is planned. Physical winner claim, physical refund, finalized balance deltas, empty vaults and repeat-payment protection remain pending. Do not call this a completed funded end-to-end test yet.

Evidence includes finalized deposit chain receipts, room state, XML/screenshots and 92-challenge-results.json. Session tokens stay in gitignored output; wallet keys are not copied.
