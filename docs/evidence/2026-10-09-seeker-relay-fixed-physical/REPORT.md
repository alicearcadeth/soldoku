# Physical Seeker funded-flow result — 2026-10-09

## Result

The original physical deposit blocker is fixed and deployed. Seed Vault signing, two physical deposits, funded play, scheduled winner/no-finish settlement, physical winner claim and physical refund passed. Both new test vaults are empty; finalized transaction replays paid zero extra TEST. New funding remains paused; Mainnet and card execution remain off.

## Cause and fixes

Seed Vault added ComputeBudget instructions after the escrow join. The old relay rejected the program, despite its instructions being legitimate fee settings. Diagnostic dc186d9 reproduced the exact rejection on room 1B501B07; no phone deposit was broadcast. Its opponent's solo stake was refunded and its vault is empty.

Relay fix eb14d0d accepts only account-free SetComputeUnitLimit/SetComputeUnitPrice with exact encodings, no duplicates, limits 1..1,400,000 and an optional priority-fee ceiling of 0.001 SOL. Wallet, room, mint, amount, action and destination bindings remain; unrelated programs are still rejected. A serialized signed regression failed before the fix and passed afterward.

During an unattended claim, BACK returned from the wallet while the app remained waiting. The WebView can miss focus/pageshow and the wallet promise can remain unresolved. Recovery release 88a40f8 starts the existing return grace after a pointer interaction on the visible page and removes its listener when finished. The regression failed before the change; delayed-approval tests remain green. An initial claim-cancellation probe was inconclusive (no verified foreground before its touch; a claim was subsequently approved). A controlled connect test on 88a40f8 verified Soldoku foreground after BACK, then touched the page: Waiting for approval became session timeout with Connect enabled. This is physical connect-wait recovery evidence, not a fresh explicit transaction-denial test. The phone's later actual winner/refund signatures succeeded.

## Release identity

| Layer | Identity |
|---|---|
| Deposits, game, scheduled settlement | clean eb14d0d8b733fc7d4dd00a583a5ff9c867ab6836 |
| Winner/refund claims and final live release | clean 88a40f8e49591e8d3c69bf395a6ac5186207e3fe |
| Worker after final deploy | ddaa2e1d-eb6d-4896-abf8-e2cb5f5c36cc |
| JS | /assets/index-ROXEY8HV.js, SHA-256 abeded4b0c1dda69c1a85dd712edf68bb5834e24a882ef804f4707faf66063d1 |
| CSS | /assets/index-kysR4Rwb.css, unchanged |
| APK | existing com.sudoku.game 0.1.0 / 1, bf427627…; no rebuild/reinstall |

Both domains' manifests and all 14 manifest files matched the clean release. CSP, nosniff and no-referrer passed. Funding paused:true, cluster:devnet, card POST:403. No program upgrade, database restore, app storage clear or wallet data clear.

## Financial evidence

| Check | Winner FE65DD6D | Refund E571262D |
|---|---|---|
| Stake | 1 TEST each, two finalized deposits | 1 TEST each, two finalized deposits |
| Phone deposit | BqfowjPpp1kJeLFBmF3ra4QBBhHiKqR72JohfJqJ6q7BmJg7c9MH9GA3QvxGZxqDrFBbM3vJZSHzpTa32qhD87P | 2AdUPS7D7yZ6pSke1rkt2ZkT8dLHCR7x75PWEwtXbPigXAaL7xrM5vzB68sUEy1fSBrMKQ6w5SFf5NEYJpUjPFym |
| Play | Physical completion 447,318 ms, rank 1; three digits survived background/reopen | No player finished |
| Cron settlement | 44AjHgcAwQQXKMoQBLunN9ZP9Sukn8aWg3MapobfuLjw1fhWLiffxEmrjr4eKSKdGmk38e5NEL9n9Mtn5t4Z29co | 3MmmMNXAyta9rk2Wwhr1ruyJyhQRpQdBxvfJzGxf7gZvDZv57BkooG5DGQhWhywZ1k38yPhm1Rp1vkGjzHjSmQGy |
| Physical claim | 4Uvr2EeJi87ngQKWbzrgARH6dRJMyHCvLnXXVccKKQ1hJNndexZjYh8KdMPJFRbgz6C5YnDraeZiEry4B6aQisnV, +2,000,000 units | 2ELDT3Hk95PdjguZDpaXuBF17taRf68dpbLTKR2qjxGKEMxFg8DdYKHyjeqj2y8aAfwu2TDmVfkxXA3HdKtU4DkF, +1,000,000 units |
| Final vault | 0 | 0 |
| Phone claim replay | Already finalized bytes, delta 0 | Already finalized bytes, delta 0 |

The 21:45 ICT scheduled run broadcast both settlements, which finalized at slots 509213122/509213132. No manual settle request was sent by this test. The 21:50 cron reconciled both attempts from unknown to confirmed and cleared alerts; subsequent 22:00/22:05 cron runs preserved receipts. Retained historical attempt note `unknown` is not the current phase or alert.

Opponent refund 2fwixThWXDZHDS5jAkkxWCmEopbetnDs9LzEuEzh918U5WLh1EJWq5CqaP2pR9un3jVAHAeDP5muwG1S8CAwJCRk finalized and returned 1 TEST. A repeat claim preparation was rejected, balance delta 0. Physical completed claims are not re-offered. Exact finalized phone bytes were fetched as base64 and replayed without modification; physical-claim-replay.json records zero token deltas. This is same-transaction replay evidence, not a second fresh physical signature.

Overall TEST ledger: phone 20→18 after two stakes→20 after prize→21 after refund. Opponent 34→32 after two stakes→33 after refund. Combined 54 TEST conserved; vaults empty. TEST has no cash value. Devnet SOL fees and account rent are separate. Rent accounts remain because the program has no close instruction.

## Verification and limits

Clean release 88a40f8: 309 tests passed, 6 skipped; TypeScript/build passed. Skips remain unverified. The replay harness initially used an unavailable transaction.serialize method; it was corrected to fetch exact finalized base64 bytes, then both replays passed. The early cancellation probe is not counted as a pass. The controlled physical connect recovery passed; the phone was left at Home, disconnected, after closing that test sheet.

Solver-assisted physical play proves mechanics/submission, not human fair play. Phone creation/opening of a funded room, fresh signed duplicate claims, interrupted live fault injection, live D1 restore and broad unattended reliability are not established here. Existing dependency findings (0 critical / 14 high / 6 moderate), Sybil/collusion/solver policy limits and external payment-provider requirements remain. The Worker pause does not freeze direct on-chain joins. This successful bounded Devnet test does not authorize permanent reopening or real-money operation.

## Preservation

Source/evidence pushed to the private repository. Runtime tags preserve exact deploy revisions. Verified complete Git bundles remain under C:\Soldoku-reconstruct\backups. Pre-88a40f8 D1 export SHA-256: 3a3d09fea7c0c200068e859094de8d7c72af69fee629ea250510491f32353730; bookmark 00000694-00000098-000050ff-37d3a464c2df93254e12539039e415c0. No export was restored. Session files and raw request logs remain gitignored; keys were neither printed nor copied. The managed cron observer was stopped after evidence extraction.
