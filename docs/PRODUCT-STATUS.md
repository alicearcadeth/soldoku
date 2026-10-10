# Soldoku product status — 2026-10-09

Current snapshot; historical evidence preserves the release tested at that time.

## Release and preservation

- Deployed on soldoku.com and www: `88a40f8e49591e8d3c69bf395a6ac5186207e3fe`, clean release, Worker `ddaa2e1d-eb6d-4896-abf8-e2cb5f5c36cc`. Both domains' release manifests and all 14 manifest assets verified.
- Source is pushed to private `alicearcadeth/soldoku`; latest docs may be ahead of the deployed runtime.
- Backup bundle: `C:\Soldoku-reconstruct\backups\soldoku-seeker-relay-eb14d0d.bundle`, verified complete history.
- Pre-deploy D1 export: `C:\Soldoku-reconstruct\backups\d1-before-eb14d0d.sql`, SHA-256 `82f4579032627b0948058371bc12a370e0bc86c093936595355d50ff75ae06d8`; bookmark `00000694-00000002-000050ff-e6bdf49ec5c2dda2b5e4787be4dd3a76`. No restore performed.
- Existing APK `com.sudoku.game` 0.1.0, SHA-256 `bf427627…`, loads the hosted release; no reinstall or storage clear.

## Availability

Classic, Practice and free competitions remain available. New funded rooms and deposits are paused after the bounded physical deposit windows. Claims, refunds, settlement and reads remain available. Card execution is disabled (POST 403). Mainnet and real payments remain off.

## Current verification

- Get-wallet return fix is deployed. Earlier physical wallet connection and free-message authorization passed; evidence retains its original release identity.
- Stake presets are centered and labeled Soldoku, with custom amount entry; this display name does not change the Devnet mint or give TEST cash value.
- Seed Vault initially rejected a Devnet request while configured for Mainnet. The owner switched the wallet to Devnet.
- Physical signing then exposed relay rejection of the wallet's added Compute Budget instructions. Room `1B501B07` reproduced the exact program rejection on `dc186d9`; the phone spent no stake and the opponent's solo stake was refunded, vault empty.
- Release `eb14d0d` permits bounded, account-free compute limit and priority price settings. Wallet/room/amount/destination/action checks and unrelated-instruction rejection remain. Final clean release 88a40f8: 309 tests passed, 6 opt-in tests skipped; build passed.
- Physical 1 TEST deposits in `FE65DD6D` and `E571262D` finalized on `eb14d0d`, each vault holding 2 TEST. Physical game completion, scheduled settlement, winner claim (+2 TEST), no-finish refund (+1 TEST) and finalized claim replay (zero additional tokens) passed. Both vaults are empty. The 21:50 cron confirmed both settlement receipts and cleared alerts.

## Remaining limits

The bounded physical funded join/play/payout/refund flow passed. Physical creator/opening, solo refund, and finalized refund-byte replay also passed on 88a40f8 in room E0FD563E on 10 October: wallet 20 → 19 → 20 TEST, vault empty, replay +0. Phone remains connected.

Physical cancellation without signing in 110FBE65 moved no funds; returning and touching the page cleared the wait after about eight seconds with generic `session timeout` copy. The subsequent approved retry did not land and its pending receipt was not cleared or altered. A successful new room does not establish recovery from that older unresolved local receipt. The early claim-cancellation probe remains inconclusive.

One outstanding test stake remains in DAABEC94 after an approved one-day extension: 1 TEST, solo refund available 10 October 2026 at 23:04:06 ICT. No program or database changes were made to bypass its deadline.

Existing broader limits remain: skipped integrations, dependency advisories, no live D1 restore rehearsal, solver/collusion resistance, and no real-money/provider approval. This Devnet test does not establish unattended or Mainnet production readiness. External invites have not been sent.

## Evidence

Pending-receipt recovery correction is live as 795e6d1 on both domains as of 10 October: authenticated read-only chain reconciliation, legacy height-zero receipts, terminal-state retention, explicit fresh retry, and checking closed rooms while funding is paused. Browser regression passed and the full suite has 316 passes/6 skips. The actual old Seeker receipt in 110FBE65 was reconciled without signing or clearing storage, survived app recreation with the original wallet connected, and left its balance at 20 TEST. See `docs/evidence/2026-10-10-pending-recovery-deploy/REPORT.md`. This supersedes the earlier unreconciled-receipt limitation above.

DAABEC94 refund follow-up is scheduled once for 10 October at 23:05 ICT. Its stake is not yet refunded; the owner must approve the wallet request after unlock.

- `docs/evidence/2026-10-09-seeker-relay-fix/`: rejection, red/green regression and diagnostic refund.
- `docs/evidence/2026-10-09-seeker-relay-fixed-physical/`: phone deposit and winner journey.
- `docs/evidence/2026-10-09-seeker-relay-fixed-refund/`: phone deposit and no-finish refund journey.
- `docs/evidence/2026-10-09-seeker-creator-rejection/`: physical creator, approved extension, cancellation and unconfirmed retry evidence.
- `docs/evidence/2026-10-10-seeker-creator-retry/`: physical creator deposit, solo refund and finalized-byte replay.

