# Multi-player Devnet competition

Work in progress; not a deployed or proven product yet.

The existing two-player program remains unchanged. A new competition program uses a fixed-size room PDA, one entry PDA per wallet, and an SPL vault owned by the room. This avoids a player cap and avoids passing every player account into a settlement transaction.

## Contract

- A room fixes its Devnet SPL mint, atomic stake, creator, result authority, grid commitment, and end timestamp. No Mainnet mint prices are used to imply Devnet cash value.
- Creator pays the first stake atomically with room creation. Every join transfers exactly one stake and creates a permanent wallet receipt atomically. Failed transfers create no entry. Receipts are never deleted/reused.
- Room extension requires creator signature, an active deadline, and exactly one lifetime entry. Joining locks duration forever.
- Each entry starts once; refresh/reconnect never restarts it. Only the result authority can attest a validated finish, and only before the room deadline. No endpoint accepts a client-provided finish time or winner.
- On-chain best result is updated on each authorized finish. Equal times use wallet address bytes as a deterministic tie breaker; this rule must be visible before staking.
- After the deadline, anyone can settle to the recorded best entrant. Winner receives all recorded stakes, no platform fee. No repeated payout.
- A sole entrant, or a competition with no valid finishes, refunds each entry after expiry. A refund transition locks out settlement/results. Each receipt refunds at most once. Unplayed entries contribute to the pool when a valid winner exists.
- Validate account owners, PDAs, mint, token account owner, signer, status, bounds, and checked arithmetic in every instruction. Accept classic SPL Token only initially; Token-2022 extensions are out of scope.
- Result authority remains a trust boundary: it validates moves and server elapsed time, but external solvers and multiple wallets per person cannot be ruled out. Slider verification is not proof of human play.

## Completion evidence required

1. Program compiles; real local-validator adversarial tests exercise transfers, duplicate entry/start/finish/settle/refund, unauthorized results, wrong accounts/mints, deadlines, extensions, and insufficient balance.
2. Worker and browser deposit reconciliation read actual entry/room accounts; transaction signatures alone never count as a stake.
3. Three independent Devnet wallets stake, play the same grid once, produce a leaderboard, and pay the fastest valid entrant. Capture public transaction links and before/after atomic balances.
4. Browser checks include share links, reconnect, status/countdown/pool, joining and payout/refund recovery.
5. Tests pass and clean local, GitHub, and deployed release hashes match.

No completion claim until all five gates have direct evidence. Native Windows Agave tooling is being bootstrapped from the official release because this laptop has neither Solana tooling nor WSL.

## First implementation checkpoint

The new program, real local-validator harness, and account decoder are drafted. The decoder tests pass and TypeScript checks pass. Rust compilation and transfer tests have not passed yet: Windows Smart App Control blocks the official Rust compiler DLL, and the local validator fails with Windows error 1314 (required privilege unavailable). No security protection was changed. A private Linux GitHub Actions workflow compiles the program and runs the transfer harness without receiving deployment credentials. The GitHub CLI login needs its additional `workflow` scope before this workflow can be pushed. Current hosted free competitions remain unchanged until the complete Devnet flow passes.
