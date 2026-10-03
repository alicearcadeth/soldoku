# Multi-player Devnet competitions

Work in progress, 3 October 2026. The dedicated escrow is deployed on Devnet; GitHub push and production release parity remain incomplete.

## Rules and architecture

Each room has an immutable TEST stake, registration cutoff, common play deadline, and refund deadline. The creator opens escrow and deposits in one transaction. Each wallet's permanent entry PDA permits one deposit and one timed attempt. There is no two-player cap. The server admits wallets only after reading finalized escrow entries. New rooms store a linked-list head; each entry stores the previous head. This permits full discovery, including direct on-chain joins, using ordinary account reads rather than a provider's restricted program scan. Room size is 210 bytes and entry size is 97 bytes. Earlier 178/65-byte funded accounts remain readable and claimable, with their known wallets recovered from the persisted room and requesting identity. New deposits into old layouts are refused.

Registration closes before anyone receives the shared grid. Every entrant uses the same server start time, even if they open the puzzle later. The server verifies each move, sequence, completion and elapsed time; clients cannot submit their own winning time. After play ends, the unique fastest valid finish wins the full deposited pool. Exact fastest ties and no valid finishes refund all entrants. A solo creator may extend registration before another wallet deposits and may refund after registration closes. Without authority settlement, entrants may refund after the recorded grace deadline.

Winner and refund claims transfer only to the recorded wallet's associated token account. Repeated claims cannot transfer twice. Settlement cannot run before the play deadline, after the refund timeout, or override an existing outcome. Permanent entries prevent repeat joins after refunds. The authority attests the server leaderboard: this is not an on-chain Sudoku proof. Multiple wallets and automated solvers remain possible. Account rent reclamation and cleanup of unsolicited vault donations are not implemented; donations are excluded from the promised pool.

The binary accepts standard SPL Token only, with six-decimal supported mints and no freeze authority:

- Devnet TEST: `BtdrgokAvXQE4yj3zS48c4ktnMSy3TGoRkHCWD5fV8U4`.
- Disposable local/staging fixture: `7VaC5xJULHGQzsZsyUCaZ7BbLGNDENLjXiPbfbbRY84j`.

TEST has no cash value. Application tooling verifies the canonical Devnet genesis and rejects legacy two-player program identities. Local validator mode requires a loopback RPC and rejects public-cluster genesis identities. A Solana program cannot itself infer its network.

## Deployed program and observed fixes

Dedicated Devnet program: [6uuszYMoZ2bBX8oVccpYPUgdhW6CSvASziN2m8LpJxYs](https://explorer.solana.com/address/6uuszYMoZ2bBX8oVccpYPUgdhW6CSvASziN2m8LpJxYs?cluster=devnet).

ProgramData: `Fq29oDskQbCCn6QH3pEJhpEb3GepmGSCdeWgL6zKUZm4`.

The current binary SHA-256, verified against finalized ProgramData bytes, is `d16042a586a73b0da83f2f3aec58a135f92cda9c339ed51cc85c0dc2ee12c8d7`; [upgrade receipt](https://explorer.solana.com/tx/3QzRPZGtDuC9X41HpkJRv9KFmttGLiiZMaGGuShQqp2LfNYNsrmUQfSwoBLXcUiNttxWGkTvouHGNKzBqh3cYXoa?cluster=devnet). This adds safe creation of third-party pre-funded room/entry PDAs to the linked-entry build. The previous linked-entry binary was `b2c23eb1e00f04c62569f64fbc297475c928a767316888a3c27eebabbbea35e1`; the earlier Rent-fix binary was `7e6a06f5ec90391dd56b38d4a07ae0c27bd7029d13c8f919531e505cce407ccb`. Evidence below identifies which build each run tested. `node scripts/competition-deploy-devnet.mjs` verifies existing code without upgrading. An explicit `--upgrade-competition` requires the matching authority and dedicated identity. Private identities and deployment buffers stay outside the repository.

Testing found two real compatibility failures. The old local validator exposes Rent with a 2.0 exemption multiplier, while live Devnet exposes a 1.0 multiplier and updated rate. The processor validates the complete Rent sysvar and supports both observed formats, plus the newer eight-byte format; regression tests cover the exact observed minimum balances. The browser also exposed Start before the finalized chain clock reached registration cutoff. Start, settlement and refund controls now use finalized chain time, and the server enforces it independently.

## Evidence

- Six Rust tests pass, including rent format regression, state layout, three-player pool, deadline and extension rules, refund states, and legacy funded-layout claim compatibility.
- Actual local-validator transactions pass three-wallet deposits, insufficient-balance rollback, duplicate and late joins, early/unauthorized settlement rejection, payout recipient substitution rejection, full pool payout, duplicate claim conservation, and solo refund. The latest binary also rejects substituted mint, Rent sysvar, token program, token account and entry accounts without changing balances, entrant count or creating rejected entries; the expanded transaction run passed in 91.48 seconds.
- The browser local-validator run passed five finalized transactions: three deposits, settlement and winner claim. It also checked hidden-before-start grid, common time/grid, shared URL, refresh recovery, three server-accepted finishes, ranking, balance conservation and an empty vault. Public evidence is in `output/competition-browser-e2e/results.json` with screenshots; these artifacts are ignored by Git.
- The separate live Devnet browser run passed on 3 October 2026, room `B4491716`, escrow `A7ctnD8mLBxJuFgfx1oFHPyAeTMq8dZe6NhPEN4Ld5Ma`. It verified three real deposits, common grid/start, refresh recovery, three accepted finishes, correct ranking, five finalized successful transactions, full winner payout and an empty vault. The winner finished in 24.989 seconds, followed by 34.170 and 43.035 seconds. Public receipts are retained in [the browser evidence](evidence/competition-devnet-browser.json); [the winner claim](https://explorer.solana.com/tx/4j7ubqwvaYsFXCuMDtowcCSUyy4XxVkTMivToneWk9nPCc2rsJmugC12rJ1Vukbb7ohGvQNs5ABtNMVTPsYjHiUn?cluster=devnet) paid 3 TEST. A Wallet Standard test adapter performs real signing; this test does not exercise a specific extension's approval UI. The tested application server was local Vite, not the public Worker.
- The explicit opt-in `src/competition/escrow.devnet.test.ts` passed on real Devnet in 216.19 seconds. It verified three-player no-finisher refunds, solo extension/refund, authority-timeout refunds, repeated claim conservation, repeated/late settlement rejection and late join rejection. Every wallet recovered exactly its original TEST balance and all three vaults were empty. Public room addresses and 19 finalized receipts are retained in [refund evidence](evidence/competition-devnet-refunds.json).
- The final deployed binary `d16042a5...` passed the live refund rerun in 222.44 seconds using the private Alchemy endpoint: three-player no-finisher refunds, extended-solo refund and permissionless authority-timeout refunds, with exact TEST balance recovery and empty vaults. All 19 finalized receipts and the exact program hash are retained in [final-build refund evidence](evidence/competition-devnet-final-refunds.json).
- Worker tests exercise D1 write conflicts: no settlement broadcast inside a retry, one broadcast after a successful write, none after all retries fail. Server tests cover verified admission, immutable terms, monotonic chain observations, one attempt, server-derived outcomes, ties and no finishers.
- The upgraded program preserved the earlier funded room `E0E2202B`. A fresh browser context authenticated its creator through the actual local Cloudflare Worker/D1 API, recovered the entry, claimed its real 1 TEST refund, and verified the empty vault and absent repeat-claim control after reload. See [Worker recovery evidence](evidence/competition-worker-recovery.json) and [finalized refund](https://explorer.solana.com/tx/2is146AQQVFbJbvMczZmzmXaqiVTngiWGzzy7VTBW6ef9Rad3rZdqBy2Z1um7Rt44rmoPaFo4YC6W7ymyS5srxSZ?cluster=devnet). The UI now exposes **Check my deposited entry** even after registration closes, so loss of local browser authentication cannot strand an existing deposit.
- The full browser flow passed through the actual local Cloudflare Worker and D1 runtime on Alchemy: room `0A436584`, three real deposits, shared grid/common clock, refresh, three verified finishes, correct ranking, five finalized transactions and an empty vault after winner payout. [Worker evidence](evidence/competition-worker-devnet-browser.json) records the tested linked-entry binary hash `b2c23eb1...`; [winner payout](https://explorer.solana.com/tx/3XQ8cBHBVwfoN3ujPoYzmPyM1qUb6G4BciaQnk2r7U5WsykvUJUzf5PZwHW3KoqhBUfpEt2h6YcBrsq1YPD4iW9E?cluster=devnet). The final-build run below also proves the pre-funding fix on Devnet.
- The final pre-funding-hardened build `d16042a5...` also passed the complete Worker/D1 browser run: room `85CAA823`, escrow `CTV1jqxr6XXYDVEixRA2Bmvwfeh55o1MGs78xP1cmZ6N`, three real deposits, three valid finishes, correct ranking, five finalized stake/settlement/claim transactions, full 3 TEST winner payout and an empty vault. A third wallet first sent SOL to the room and another player's entry PDA; this neither admitted anyone nor blocked the subsequent legitimate deposits. [Final build evidence](evidence/competition-worker-prefunded-browser.json) includes the exact binary hash and extra pre-funding receipt; [winner claim](https://explorer.solana.com/tx/3qA5Kak1pQFjuhP3qeh9Pn26DPuvCa5zbRtWF7KB1iudhbeBb2JsG7yLdYqhnma9LSYnbu3VzKztgCjN2dMgG8dc?cluster=devnet).
- The full automated suite passes 232 tests, with six optional integration tests skipped. TypeScript, Vite production bundling and the Cloudflare Worker deployment dry run pass. These do not substitute for the clean-Git release build or deployed production verification.

## Configuration

See `.env.example`. Set `SUDOKU_COMPETITION_PROGRAM_ID`, `SUDOKU_COMPETITION_RPC`, and the server-only `SUDOKU_COMPETITION_AUTHORITY_KEY` secret. Optional mint, play and grace configuration must match the supported contract. Default play time is 30 minutes and refund grace is one hour. Without valid configuration, paid creation remains unavailable. Never expose the authority through a `VITE_` variable.

The local server persists via `SUDOKU_COMPETITION_STORE`. Production uses the existing D1 store and performs chain broadcasts only after committed state updates. The public config endpoint exposes readiness and public addresses, not keys.

Worker testing exposed a provider-specific deployment issue: the default public Solana RPC returned 403 for Cloudflare egress. An alternate public endpoint allowed the first deposit, then hit sustained 429 responses before the second entrant could finish registration. These are failed Worker verification runs, not payout evidence. Artportal's existing Alchemy free-tier endpoint was located and verified against the canonical Devnet genesis. Its credential-bearing URL was copied only into a private local Worker environment file outside the repository. Deploy `SUDOKU_COMPETITION_RPC` as a Worker secret alongside `SUDOKU_COMPETITION_AUTHORITY_KEY`; do not commit it in the Wrangler vars or paste it into public evidence.

Alchemy's free tier refused `getProgramAccounts`, so the contract and reader were changed to linked entries. The actual local transaction test confirms that the reader discovers all three deposits even when that scan method throws and only the creator is initially known to the server. That build passed payout/refund conservation in 91.74 seconds and subsequently passed the Worker browser test above. A new actual transaction regression reproduced SOL pre-funding blocking account creation. The latest build allocates/assigns only empty System-owned PDAs and tops up their rent, while refusing existing program-owned entries. Its expanded local transaction run passed in 93.17 seconds. The server treats an empty System-owned room PDA as unfunded and still rejects corrupt or substituted program accounts.

## Reproduction

Build inside WSL:

```bash
bash scripts/build-competition-escrow.sh
```

The script uses isolated `cargo-build-sbf` 4.4.0, platform tools v1.54, locked dependencies and `--arch v0` for compatibility with the PC's Solana 2.1 validator.

Create the disposable local genesis fixture with `node scripts/competition-validator-fixture.mjs`, then start a dedicated validator using its mint account and the compiled competition binary on RPC port 18999. Fund it with `node scripts/competition-localnet-fund.mjs`. Run:

```powershell
$env:SUDOKU_COMPETITION_LOCALNET = '1'
node node_modules/vitest/vitest.mjs run src/competition/escrow.localnet.test.ts
```

For browser verification, configure a local Vite server with the matching program, RPC, authority, play time of at least 180000 ms, and grace time. Run `node scripts/competition-browser-e2e.mjs` with `QA_ORIGIN` and `PLAYWRIGHT_CHROMIUM`. Live Devnet mode additionally requires `SUDOKU_COMPETITION_DEVNET_E2E=1`, the canonical Devnet RPC, and `SUDOKU_COMPETITION_E2E_WALLETS` containing three private key file paths outside Git. The test derives its solution only from the grid revealed in the browser.

Run the live refund test separately after other balance-conservation tests:

```powershell
$env:SUDOKU_COMPETITION_DEVNET_REFUNDS = '1'
node node_modules/vitest/vitest.mjs run src/competition/escrow.devnet.test.ts
```

## Remaining release gates

Current-build live payout and refund verification are complete. Obtain GitHub access for the PC's account and restore real Git history around these ZIP-derived changes. The original ZIP records baseline commit `889944bf01b328c2aed7cb5f7464264e5ac68c6f`; preserve current work and merge any newer upstream changes before committing and pushing. Build from the clean committed checkout, publish `wrangler.soldoku.jsonc` with the private competition RPC and authority secrets, then verify local/GitHub/public release hashes on both Soldoku domains and repeat the live funded flow on production. Cloudflare authentication is available on this PC; GitHub repository access is currently denied.

The three-day goal remains incomplete until all requested gates have evidence.
